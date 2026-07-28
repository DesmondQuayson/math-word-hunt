# Phase 6 adult-teacher data inventory

Status: pilot-readiness inventory. It describes allowed existing fields; it
does not authorize participant data collection.

| Category | Existing or potential field | Purpose | Access and minimization |
| --- | --- | --- | --- |
| Authentication | teacher email | Supabase identity, verification, and sign-in | Provider-managed; do not copy into domain records or logs |
| Teacher profile | user ID, display name, optional organization label | identify the adult teacher and provide recognizable UI | Owner-scoped; organization label remains optional and needs pilot policy approval |
| Planning | class name, optional grade, optional period/section | teacher-owned organization without a roster | Labels only; prohibit student names and sensitive class information |
| Activity draft | curriculum references, mode, time limit, team count, Combine Mode, optional class reference | prepare a teacher-led game | No student response, work, or progress fields |
| Account lifecycle | active, suspended, deletion requested, closed; request state/timestamps | fail-closed access and staged exit | Browser cannot set lifecycle authority |
| Entitlement/billing projection | stable internal IDs and disabled/test lifecycle state | existing authorization and test-mode architecture | No payment activation in Phase 6 |
| Operations | stable event code, timestamp, low-cardinality result, route category, safe correlation ID, environment class | sanitized incident evidence | No raw payload, provider session, email, or secret |

## Prohibited data

Do not enter, display in pilot feedback, persist, or place in evidence:

- student names, email addresses, IDs, work, rosters, or grades;
- IEP or disability information, behavioral records, or sensitive school data;
- passwords, tokens, cookies, one-time links, raw headers, or provider secrets;
- raw authentication, billing, webhook, or form payloads;
- screenshots or uploads containing classroom or account information.

The product may reject obvious prohibited patterns, but that safeguard is not a
content inspection service and does not guarantee detection. The adult teacher
remains responsible for entering only permitted planning labels.

## Access boundary

RLS and server authorization bind teacher-owned records to the verified user.
Pilot readiness never grants data access. The owner may inspect only the
minimum sanitized evidence needed for support or an incident, using the
approved channel and procedure.
