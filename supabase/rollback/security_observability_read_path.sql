-- Rollback for 20260909010000_security_observability_read_path.sql.
-- Removes the security observability store and its functions. No other object
-- was created or altered by the forward migration, so nothing else is touched.
-- Deleting the evidence tables is deliberate: the store holds bounded,
-- redacted telemetry, not business state.

drop function if exists public.purge_security_events(integer, integer);
drop function if exists public.security_pipeline_health(text);
drop function if exists public.summarize_security_events(text);
drop function if exists public.record_security_alert(text, text, text, text[], integer, integer, integer, text, boolean, jsonb);
drop function if exists public.claim_security_alert(text, boolean, integer);
drop function if exists public.count_security_events_since(text[], timestamptz, boolean, text, jsonb);
drop function if exists public.record_security_events(jsonb);

drop table if exists public.security_alerts;
drop table if exists public.security_alert_state;
drop table if exists public.security_events;
