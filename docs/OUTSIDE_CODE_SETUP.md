# Outside-code setup — rebuild Portl for a working demo

These steps are **not** fixable by committing more app code. Do them once per hosted environment, then rebuild the APK.

---

## 1. EAS project + push (unblocks notifications)

1. Install EAS CLI: `npm i -g eas-cli` and `eas login`.
2. In the repo root: `eas init` (or link an existing project).
3. Copy the project UUID into:
   - Local: `.env` / `.env.local` → `EAS_PROJECT_ID=<uuid>`
   - EAS Dashboard → Project → Environment variables → `preview` + `production`
4. Confirm the value does **not** contain `REPLACE`. The app skips push registration when the id is missing or placeholder (`src/lib/notifications.ts`).
5. Rebuild after changing the id (native config):  
   `bun run build:apk`

---

## 2. Clerk ↔ Supabase JWT

1. Clerk → Integrations → enable **Supabase**.
2. Supabase → Authentication → Third-party Auth → add **Clerk** with your Clerk Frontend API domain.
3. Enable email + phone (E.164) in Clerk.
4. Wrong wiring looks like an **empty app**, not a clear auth error — always verify with `bun run verify:demo-seed` after seeding.

---

## 3. Database + migration 0039

```bash
supabase link   # if not linked
supabase db push
# or local: supabase db reset
supabase functions deploy
```

Confirm:

- Cron job `expire-visitor-requests` and `expire-amenity-payments` exist (Dashboard → Database → Cron).
- Column `visitor_requests.flat_id` exists (Realtime filters depend on it).
- Push outbox cron from earlier migrations is scheduled and secrets (`app.settings.send_push_*`) are set.

---

## 4. Demo identities (`demo_seed.sql`)

1. Create three Clerk users (resident, guard, admin).
2. Copy each subject (`user_…`).
3. Apply:

```bash
psql "$DATABASE_URL" \
  -v resident_id="user_..." \
  -v guard_id="user_..." \
  -v admin_id="user_..." \
  -f supabase/demo_seed.sql
```

4. Sign in on device — if you land on **Pending access** with the red seed banner, subjects do not match.

Demo password for all three roles (set in Clerk Dashboard → Users → each user → Update password):

`Coral7!Whistle`

Publish the three emails in the README Live Demo table (password included for judges).

---

## 5. Preview APK + two-device push test

```bash
# Ensure EAS env vars for preview are complete (see README Build & Deploy)
bun run build:apk
```

1. Install APK on **Device A** (resident) and **Device B** (guard).
2. Guard: New Visitor → ask resident.
3. Resident must receive a **remote** push (not only in-app). If only in-app works, fix edge function + cron + webhook secret.
4. Paste the EAS build URL into README `Live Demo` → Android APK.

---

## 6. Screenshots + demo video

1. Capture six screens into `/screenshots/` (names in `screenshots/README.md`).
2. Record 2–5 minutes: **gate raise → resident push approve → entry/exit**. Optionally one amenity/ticket at the end.
3. Host the video (YouTube/Drive) and paste URL into README.

**Demo script tip:** lead with the gate hero only. SOS, marketplace, carpool, gamification dilute the brief.

---

## 7. Escalation SOP (ops, not code)

Unanswered requests **expire + notify**. They do **not** auto-approve or auto-route.

Recommended society SOP:

| After expiry | Action |
| ------------ | ------ |
| Visitor still waiting | Guard taps **Retry** |
| Resident unreachable | Admin **override** with reason (RLS + audit) |
| Co-owner | Same flat members already get the expiry notification |

---

## 8. Rebuild checklist (quick)

- [ ] `EAS_PROJECT_ID` real
- [ ] `supabase db push` including `0039_review_hardening.sql`
- [ ] Edge functions deployed + push cron live
- [ ] Three Clerk users seeded
- [ ] APK built and linked in README
- [ ] Push verified on two physical devices
- [ ] Screenshots + video linked
- [ ] Marketing page used as judge entry (`marketing/index.html`)
