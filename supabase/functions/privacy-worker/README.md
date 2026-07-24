# Privacy workers

Deploy `privacy-request`, `privacy-worker`, and `retention-worker` with JWT
gateway verification disabled as versioned in `supabase/config.toml`.
Authorization still occurs inside each function:

- `privacy-request` proves the Clerk bearer token through a user-scoped
  PostgREST query.
- workers require `X-Webhook-Secret: PRIVACY_WORKER_SECRET` and use the service
  role only after that constant-time comparison.

Required server-only secrets/settings:

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `CLERK_SECRET_KEY`
- `PRIVACY_WORKER_SECRET`
- `ACCOUNT_DELETION_GRACE_DAYS` (fallback only; society settings override it)
- `PRIVACY_ARTIFACT_TTL_HOURS`
- `SIGNED_URL_TTL_SECONDS`

Schedule `privacy-worker` for export/deletion processing and
`retention-worker` for artifact/media cleanup through the hosted scheduler.
Call retention with `{ "dryRun": true }` before enabling destructive runs.
The migration installs only a conditional database dry-run schedule, so local
resets do not require `pg_cron`, network extensions, or hosted secrets.

`privacy-worker` processes at most 10 personal exports, 5 admin exports, and 10
due deletions per invocation. Deletion honors active society/profile holds,
removes visitor media/contact for requests raised by the profile, pseudonymizes
selected profile fields, and deletes the Clerk identity. The request endpoint
revokes active Clerk sessions and removes push/device access before the grace
period. This is not universal historical or backup erasure.

`retention-worker` removes expired artifact objects/rows and unreferenced
objects older than 24 hours from `society-media` and `privacy-artifacts`, with a
maximum caller-selected batch of 1,000. It does not implement general record or
backup retention. Configure cadence, grace, artifact TTL, signed-URL TTL,
legal-hold policy, alerts, and destructive enablement only after owner approval;
record the external scheduler and checks in `docs/OPERATIONS.md`.
