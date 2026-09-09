begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public', 'security_events', 'security event store exists');
select has_table('public', 'security_alert_state', 'security alert de-duplication state exists');
select has_table('public', 'security_alerts', 'security alert ledger exists');

select results_eq(
  $$select relname, relrowsecurity, relforcerowsecurity from pg_class
    where oid in ('public.security_events'::regclass, 'public.security_alert_state'::regclass, 'public.security_alerts'::regclass)
    order by relname$$,
  $$values
    ('security_alert_state'::name, true, true),
    ('security_alerts'::name, true, true),
    ('security_events'::name, true, true)$$,
  'every security observability table has enabled and forced RLS'
);

select results_eq(
  $$select role_name, table_name, privilege, has_table_privilege(role_name, table_name, privilege)
    from (values
      ('anon'::name, 'public.security_events'::text, 'SELECT'::text),
      ('anon'::name, 'public.security_alerts'::text, 'SELECT'::text),
      ('authenticated'::name, 'public.security_events'::text, 'SELECT'::text),
      ('authenticated'::name, 'public.security_events'::text, 'INSERT'::text),
      ('authenticated'::name, 'public.security_alert_state'::text, 'SELECT'::text),
      ('service_role'::name, 'public.security_events'::text, 'INSERT'::text),
      ('service_role'::name, 'public.security_events'::text, 'UPDATE'::text),
      ('service_role'::name, 'public.security_events'::text, 'DELETE'::text),
      ('service_role'::name, 'public.security_alert_state'::text, 'SELECT'::text),
      ('service_role'::name, 'public.security_alert_state'::text, 'UPDATE'::text),
      ('service_role'::name, 'public.security_alerts'::text, 'INSERT'::text)
    ) expected(role_name, table_name, privilege)$$,
  $$select role_name, table_name, privilege, false
    from (values
      ('anon'::name, 'public.security_events'::text, 'SELECT'::text),
      ('anon'::name, 'public.security_alerts'::text, 'SELECT'::text),
      ('authenticated'::name, 'public.security_events'::text, 'SELECT'::text),
      ('authenticated'::name, 'public.security_events'::text, 'INSERT'::text),
      ('authenticated'::name, 'public.security_alert_state'::text, 'SELECT'::text),
      ('service_role'::name, 'public.security_events'::text, 'INSERT'::text),
      ('service_role'::name, 'public.security_events'::text, 'UPDATE'::text),
      ('service_role'::name, 'public.security_events'::text, 'DELETE'::text),
      ('service_role'::name, 'public.security_alert_state'::text, 'SELECT'::text),
      ('service_role'::name, 'public.security_alert_state'::text, 'UPDATE'::text),
      ('service_role'::name, 'public.security_alerts'::text, 'INSERT'::text)
    ) expected(role_name, table_name, privilege)$$,
  'browser roles have no security telemetry privileges and the service role can only read evidence directly'
);

select ok(has_table_privilege('service_role', 'public.security_events', 'SELECT'), 'service role can read security events for the admin read path');
select ok(has_table_privilege('service_role', 'public.security_alerts', 'SELECT'), 'service role can read fired alerts for the admin read path');

select results_eq(
  $$select function_signature, has_function_privilege('service_role', function_signature, 'EXECUTE'),
      has_function_privilege('anon', function_signature, 'EXECUTE'),
      has_function_privilege('authenticated', function_signature, 'EXECUTE')
    from (values
      ('public.record_security_events(jsonb)'::text),
      ('public.count_security_events_since(text[],timestamptz,boolean,text,jsonb)'::text),
      ('public.claim_security_alert(text,boolean,integer)'::text),
      ('public.record_security_alert(text,text,text,text[],integer,integer,integer,text,boolean,jsonb)'::text),
      ('public.summarize_security_events(text)'::text),
      ('public.security_pipeline_health(text)'::text),
      ('public.purge_security_events(integer,integer)'::text)
    ) functions(function_signature)
    order by function_signature$$,
  $$values
    ('public.claim_security_alert(text,boolean,integer)'::text, true, false, false),
    ('public.count_security_events_since(text[],timestamptz,boolean,text,jsonb)'::text, true, false, false),
    ('public.purge_security_events(integer,integer)'::text, true, false, false),
    ('public.record_security_alert(text,text,text,text[],integer,integer,integer,text,boolean,jsonb)'::text, true, false, false),
    ('public.record_security_events(jsonb)'::text, true, false, false),
    ('public.security_pipeline_health(text)'::text, true, false, false),
    ('public.summarize_security_events(text)'::text, true, false, false)$$,
  'only the service role can execute the seven security observability functions'
);

-- Behaviour: idempotent storage.
select is(
  public.record_security_events('[
    {"event_id":"0123456789abcdef0123456789abcdef","occurred_at":"2026-09-09T00:00:00Z","environment":"staging",
     "event_type":"webhook-signature-invalid","category":"billing","severity":"medium","source":"billing-webhook",
     "outcome":"denied","correlation_id":"pgtap-correlation-1","synthetic":false,"ingest_source":"in-process",
     "metadata":{"reason":"verification-failed"}},
    {"event_id":"0123456789abcdef0123456789abcdef","occurred_at":"2026-09-09T00:00:01Z","environment":"staging",
     "event_type":"webhook-signature-invalid","category":"billing","severity":"medium","source":"billing-webhook",
     "outcome":"denied","correlation_id":"pgtap-correlation-1","synthetic":false,"ingest_source":"log-drain",
     "metadata":{"reason":"verification-failed"}},
    {"event_id":"not-a-valid-id","occurred_at":"2026-09-09T00:00:02Z","environment":"staging",
     "event_type":"webhook-signature-invalid","category":"billing","severity":"medium","source":"billing-webhook",
     "outcome":"denied","correlation_id":"pgtap-correlation-2","synthetic":false,"ingest_source":"in-process","metadata":{}}
  ]'::jsonb),
  1,
  'the same emission delivered twice is one row, and a malformed element is skipped without failing the batch'
);

select throws_ok(
  $$select public.record_security_events('{"not":"an array"}'::jsonb)$$,
  'Invalid security event batch',
  'a non-array batch is refused'
);

-- Behaviour: windows and partitions.
select is(
  public.count_security_events_since(array['webhook-signature-invalid'], '2026-09-01T00:00:00Z'::timestamptz, false, 'staging', '{}'::jsonb),
  1::bigint,
  'counting sees the stored real event'
);
select is(
  public.count_security_events_since(array['webhook-signature-invalid'], '2026-09-01T00:00:00Z'::timestamptz, true, 'staging', '{}'::jsonb),
  0::bigint,
  'the synthetic partition never counts a real event'
);
select is(
  public.count_security_events_since(array['webhook-signature-invalid'], '2026-09-01T00:00:00Z'::timestamptz, false, 'production', '{}'::jsonb),
  0::bigint,
  'another deployment label is never counted'
);
select is(
  public.count_security_events_since(array['webhook-signature-invalid'], '2026-09-01T00:00:00Z'::timestamptz, false, 'staging', '{"reason":"absent"}'::jsonb),
  0::bigint,
  'a metadata filter that does not match excludes the event'
);
select is(
  public.count_security_events_since(array['webhook-signature-invalid'], '2026-09-09T00:00:00.5Z'::timestamptz, false, 'staging', '{}'::jsonb),
  0::bigint,
  'an event before the window start is outside the window (boundary is inclusive at the start)'
);
select is(
  public.count_security_events_since(array['webhook-signature-invalid'], '2026-09-09T00:00:00Z'::timestamptz, false, 'staging', '{}'::jsonb),
  1::bigint,
  'an event exactly at the window start is inside the window'
);

-- Behaviour: atomic claim and cooldown.
select is(public.claim_security_alert('pgtap-rule', false, 3600), true, 'the first claim inside a cooldown wins');
select is(public.claim_security_alert('pgtap-rule', false, 3600), false, 'a second claim inside the cooldown is refused');
select is(public.claim_security_alert('pgtap-rule', true, 3600), true, 'the synthetic partition has its own cooldown');
select throws_ok(
  $$select public.claim_security_alert('pgtap-rule', false, 30)$$,
  'Invalid security alert claim',
  'a cooldown below one minute is refused'
);

select ok(
  public.record_security_alert('pgtap-rule', 'high', 'staging', array['webhook-signature-invalid'], 600, 5, 6, 'alert-pgtap-rule-abcdef', false, '{"webhook":"not-configured"}'::jsonb) is not null,
  'a fired alert is recorded'
);

select results_eq(
  $$select event_type, severity, synthetic, last_week from public.summarize_security_events('staging')$$,
  $$values ('webhook-signature-invalid'::text, 'medium'::text, false, 1::bigint)$$,
  'the summary groups by event class and partition'
);

select results_eq(
  $$select ingest_source from public.security_pipeline_health('staging')$$,
  $$values ('in-process'::text)$$,
  'pipeline health reports each ingest source that delivered'
);

-- Behaviour: retention bounds.
select throws_ok(
  $$select * from public.purge_security_events(3, 90)$$,
  'Invalid security retention window',
  'event retention below seven days is refused'
);
select throws_ok(
  $$select * from public.purge_security_events(30, 10)$$,
  'Invalid security retention window',
  'alert retention below thirty days is refused'
);
select results_eq(
  $$select events_deleted, alerts_deleted from public.purge_security_events(90, 365)$$,
  $$values (0::bigint, 0::bigint)$$,
  'retention deletes nothing newer than its window'
);

select * from finish();
rollback;
