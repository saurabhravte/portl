# Expo push workers

Migration `0021_push_outbox.sql` owns the only enqueue path: an
`AFTER INSERT` trigger on `notifications` writes one deduplicated outbox row per
registered device. Do not add a Dashboard webhook.

## Configure and deploy

Use one dedicated high-entropy webhook secret; never reuse or send the Supabase
service-role key:

```sh
supabase secrets set SEND_PUSH_WEBHOOK_SECRET="<random-secret>"
supabase functions deploy send-push
supabase functions deploy process-push-receipts
```

```sql
alter database postgres set app.settings.send_push_url =
  'https://YOUR_PROJECT.supabase.co/functions/v1/send-push';
alter database postgres set app.settings.push_receipts_url =
  'https://YOUR_PROJECT.supabase.co/functions/v1/process-push-receipts';
alter database postgres set app.settings.send_push_secret =
  '<the-same-random-secret>';
```

`supabase/config.toml` disables gateway JWT verification for these scheduled
endpoints. Each function performs a constant-time comparison of
`X-Webhook-Secret` or `Authorization: Bearer ...` before creating a service-role
client. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` remain server-only.

## Delivery contract

- `send-push` claims at most 100 due rows for 120 seconds with
  `FOR UPDATE SKIP LOCKED`, validates Expo token shape, sends one batch request,
  and persists each returned ticket.
- `process-push-receipts` claims at most 1,000 tickets for 600 seconds and
  checks them in one receipt request.
- Expired leases are reclaimable, so delivery is at-least-once.
- Network, HTTP 429/5xx, `MessageRateExceeded`, and unavailable receipts retry
  from 5 seconds with capped exponential backoff (15 minutes) and 25% jitter.
- Validation and other Expo ticket/receipt errors are permanent. Outbox rows
  are dead after 10 claims; receipt rows after 8.
- `DeviceNotRegistered` removes only the still-matching `push_tokens` row tied
  to the outbox row. The legacy profile token is not the multi-device registry.

Dead rows require diagnosis; do not reset them indiscriminately. Error messages
are truncated and token-redacted, but operators must also avoid logging
payloads, tokens, personal data, or secrets.

## Schedules

If `pg_cron`, `pg_net`, all three database settings, and both URLs existed when
`0021` ran, it installed:

- `portl-send-push-v0021`: `* * * * *`
- `portl-push-receipts-v0021`: `*/15 * * * *`

Otherwise no push schedules were installed. Inspect `cron.job`, configure
missing jobs once, and prove there are no duplicates. A manual smoke call must
return 401 with a wrong secret and a sanitized success response with the current
secret.

## Monitoring and rotation

Alert on oldest due outbox age, state depth, expired leases, retry/dead rate by
error code, ticket age, receipt absence/error, invalid-token cleanup, and
function 401/5xx/duration. See `docs/OPERATIONS.md` for queries, release gates,
coordinated secret rotation, and rollback constraints.
