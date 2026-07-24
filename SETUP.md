# Portl — Setup From Scratch (Expo Go first)

This guide takes you from **nothing** to **the app running on your phone via Expo Go**, then explains what to do later for the shareable APK. Follow the steps in order. Every account it asks you to create is free.

> **Read this once before you start.** Portl is a *full* app: a mobile client **plus** a Supabase backend **plus** Clerk auth. There is no "just run the frontend" mode — the login screen and every list depend on the backend and on Clerk being wired to Supabase. Budget ~45–60 minutes for the first setup. After that, `bun start` is instant.

---

## 0. What runs where (so the steps make sense)

| Piece | Where it lives | You set it up in |
| --- | --- | --- |
| The app (UI, screens) | Your phone via **Expo Go** | Step 6 |
| Auth (login, users) | **Clerk** (cloud) | Step 4 |
| Database + rules + realtime | **Supabase** (cloud) | Step 3 |
| The link that makes RLS work | Clerk ↔ Supabase third-party auth | Step 5 |
| Demo data (society, flats, users) | Supabase (SQL you run once) | Step 7 |

Because your phone connects over the internet, **use hosted Supabase and Clerk projects** (not local `supabase start`). A phone can't reach `localhost` on your laptop.

---

## 1. Tools to install on your computer

Install these first:

- **Node.js 20 or newer** — <https://nodejs.org> (LTS is fine). Check: `node -v`
- **Git** — <https://git-scm.com>
- **A package manager** — this repo ships a `bun.lock`, so **Bun** is the smoothest (<https://bun.sh>). npm also works; just replace `bun` with `npm` in the commands.
- **Supabase CLI** — `npm install -g supabase` (or use `bunx supabase ...` without installing).

On your **phone**:

- Install **Expo Go**. This app targets **Expo SDK 55**, so you need an **Expo Go build that supports SDK 55**. Get it from the App Store / Play Store; if your store version is older than SDK 55, install the matching Expo Go from <https://expo.dev/go> (you can pick the SDK version there).

Free accounts you'll create along the way: **Supabase** (<https://supabase.com>), **Clerk** (<https://clerk.com>), and later **Expo** (<https://expo.dev>) for the APK.

---

## 2. Get the code and install dependencies

```bash
# from the folder where you unzipped the project
cd portl
bun install          # or: npm install
```

> `node_modules` isn't in the zip — this step downloads it. It can take a few minutes the first time.

---

## 3. Create the Supabase project (database)

1. Go to <https://supabase.com> → **Sign up** → **New project**.
2. Pick a name, a strong **database password** (save it — you'll need it in Step 7), and a region close to you.
3. Wait for it to finish provisioning (~2 min).
4. Open **Project Settings → API** and copy two values:
   - **Project URL** → this is your `EXPO_PUBLIC_SUPABASE_URL`
   - **anon / public** key → this is your `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - (Also note the **service_role** key — you'll only need it later for Edge Functions. Never put it in the app.)

### 3a. Apply the database schema

The whole schema lives in `supabase/migrations/` (36 ordered SQL files) plus a baseline `supabase/seed.sql`. Push them to your new cloud project with the CLI:

```bash
supabase login                              # opens a browser to authorize the CLI
supabase link --project-ref <YOUR-REF>      # <YOUR-REF> is in your project URL: https://<ref>.supabase.co
supabase db push                            # runs every migration against the linked project
```

Then load the identity-free baseline (the "Sunrise Heights" society, towers, flats, amenities). Easiest way: open **Supabase Dashboard → SQL Editor**, paste the contents of `supabase/seed.sql`, and run it. (You'll add the actual users in Step 7, once Clerk exists.)

> If `supabase db push` errors on a migration, open the SQL Editor and run the migration files in numeric order (`0001_…` first). But `db push` normally handles all 36 in one go.

**Edge Functions are optional for the first run.** Push notifications, online payments, ImageKit uploads and privacy jobs are powered by functions in `supabase/functions/`. The core experience (login, all three dashboards, visitors, notices, tickets, polls, amenities) works **without** deploying them. Skip them for now; deploy later with `supabase functions deploy` when you wire those extras.

---

## 4. Create the Clerk application (auth)

1. Go to <https://clerk.com> → **Sign up** → **Create application**.
2. Under **sign-in options**, enable **Email** (with password + email code) and **Phone number** (SMS). Portl expects E.164 phone numbers like `+919876543210`.
3. From the Clerk dashboard **API Keys** page, copy the **Publishable key** (`pk_test_…`) → this is your `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`.
   - The **Secret key** (`sk_test_…`) is server-side only; you'll only need it later for Edge Functions.

> Ignore "Continue with Google" for now — native Google Sign-In doesn't run in Expo Go (the app hides that button automatically in Expo Go). Email/phone login is all you need to test locally.

---

## 5. Connect Clerk to Supabase (do not skip — this is the #1 gotcha)

Every security rule in the database identifies the logged-in user from the Clerk token (`auth.jwt() ->> 'sub'`). If this link is missing, **you'll log in fine but every screen loads empty** — no error, just blank lists. The app already attaches the Clerk session token to Supabase automatically (`src/lib/supabase.ts`); you just have to tell Supabase to trust Clerk.

1. In **Clerk Dashboard**, open the **Supabase integration** (under *Configure → Integrations*, or search "Supabase"). Enable it. Clerk shows you your **Clerk domain**, e.g. `https://your-app.clerk.accounts.dev`.
2. In **Supabase Dashboard → Authentication → Sign In / Providers → Third-Party Auth**, click **Add provider → Clerk**, and paste that Clerk domain.
3. Save on both sides.

That's the entire wiring. No JWT template needed — this uses the modern Clerk ↔ Supabase third-party auth.

---

## 6. Create your `.env.local` and run in Expo Go

Copy the example and fill in the **three** values you collected:

```bash
cp .env.example .env.local
```

For local Expo Go testing you only need these three lines in `.env.local`:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://YOUR-REF.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...            # Supabase anon key
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...   # Clerk publishable key
```

Leave everything else in `.env.local` blank for now. Anything starting with `EXPO_PUBLIC_` is bundled into the app and is **not** secret; the truly secret keys (service role, Clerk secret, Razorpay secret, ImageKit private) belong only in Supabase, never here.

Start the dev server:

```bash
bun start          # or: npm start
```

A QR code appears in the terminal. On your phone:

- **Android:** open **Expo Go** → **Scan QR code** → scan it.
- **iOS:** open the **Camera** app → point at the QR → tap the Expo Go banner.

Your phone and computer must be on the **same Wi-Fi**. If the connection fails (common on public/【corporate Wi-Fi), run `bun start --tunnel` instead.

The app boots. If you see a friendly "missing configuration" screen, your three env values aren't being read — stop the server and restart `bun start` after saving `.env.local`.

> **What works in Expo Go right now:** email/phone login, all three role dashboards, the visitor/gate flow UI, notices, polls, tickets, amenities, and live data from Supabase.
> **What is intentionally disabled until you make a dev/APK build (later):** online Razorpay payments, native "Continue with Google", remote push notifications, and Sentry crash reporting. The app degrades gracefully — buttons for these simply hide or no-op in Expo Go.

---

## 7. Create demo users and see real data

Right now you can log in, but your Clerk user isn't linked to the demo society, so screens are empty. Fix that:

1. In **Clerk Dashboard → Users**, create three users (or sign up through the app three times): one **resident**, one **guard**, one **admin**. For each, copy its **User ID** — the `user_...` string (Clerk calls it the *subject*).
2. Bind those three IDs to the demo society by running `supabase/demo_seed.sql`. Get your database connection string from **Supabase → Project Settings → Database → Connection string (URI)**, then:

   ```bash
   psql "postgresql://postgres:[YOUR-DB-PASSWORD]@db.YOUR-REF.supabase.co:5432/postgres" \
     -v resident_id="user_XXXXXXXXXXXXRESIDENT" \
     -v guard_id="user_XXXXXXXXXXXXGUARD" \
     -v admin_id="user_XXXXXXXXXXXXADMIN" \
     -f supabase/demo_seed.sql
   ```

   (No `psql`? Open `supabase/demo_seed.sql`, replace the three `:'resident_id'` / `:'guard_id'` / `:'admin_id'` placeholders with your actual `user_...` strings, and paste it into the Supabase SQL Editor.)

Now log in as each user and you'll land on the right dashboard:

- **Resident** → Ravi, flat A-101 — a pending delivery, an open ticket, a notice, a poll, a due, and a reusable pre-approval code `424242`.
- **Guard** → Ganesh — the gate log and new-visitor flow.
- **Admin** → Anita — towers, flats, members, notices, polls, dues.

**The hero demo:** log in as the guard on one device and register a new visitor for flat A-101 → log in as the resident on another → approve it → watch the guard's screen update. (Cross-device push needs a dev build, but in-app realtime updates work in Expo Go.)

---

## 8. Optional services (wire these only when you need them)

All of these are off by default and the app runs without them. Each maps to variables already stubbed in `.env.example`.

| Feature | What to create | Where the keys go |
| --- | --- | --- |
| **Image uploads via ImageKit** | ImageKit.io account | Public key + URL endpoint → `.env.local`; private key → `supabase secrets set IMAGEKIT_PRIVATE_KEY=...`, then deploy `imagekit-auth`. Without it, uploads fall back to Supabase Storage automatically. |
| **Online payments** | Razorpay account (test mode) | `EXPO_PUBLIC_RAZORPAY_KEY_ID` in env; `RAZORPAY_KEY_SECRET` via `supabase secrets set`, deploy the two razorpay functions. **Needs a dev/APK build** — the native sheet won't open in Expo Go. |
| **Push notifications** | Firebase project (FCM) | Upload the FCM service account via `eas credentials`. **Needs a dev/APK build.** |
| **Crash reporting** | Sentry project | `EXPO_PUBLIC_SENTRY_DSN` in env (+ `SENTRY_ORG/PROJECT/AUTH_TOKEN` for release builds). Silent no-op without a DSN. |
| **Continue with Google** | Google Cloud OAuth clients | The `EXPO_PUBLIC_CLERK_GOOGLE_*` vars + enable Google in Clerk. **Needs a dev/APK build.** |

---

## 9. Later: build a shareable APK

When local testing is solid and you want an installable Android file to hand to judges:

1. Create a free **Expo** account at <https://expo.dev> and install the CLI: `npm install -g eas-cli`, then `eas login`.
2. **Re-initialize git** (the original history was removed): `git init && git add -A && git commit -m "Portl hackathon"`. EAS requires a clean commit to build.
3. `eas init` to link the project and get an `EAS_PROJECT_ID`.
4. Provide the **full** release env set (including Sentry) to the `preview` EAS environment — release builds validate their config and fail early if anything is missing. The required names are listed in `.env.example` and enforced by `scripts/release-config.js`.
5. `bun run build:apk` (= `eas build --platform android --profile preview`). EAS builds in the cloud (~5–15 min) and gives you a download link + QR.

Full build/release detail: see the **Build a Shareable APK** section in `README.md`.

---

## Troubleshooting

- **Every screen is empty after login.** The Clerk ↔ Supabase link (Step 5) isn't done, or the demo user isn't seeded (Step 7). Both are required.
- **"Missing configuration" screen.** `.env.local` isn't populated or the server wasn't restarted after editing it. Stop and re-run `bun start`.
- **Phone can't connect to Metro.** Same Wi-Fi? Try `bun start --tunnel`.
- **Windows `EMFILE: too many open files`.** Stop all Node/Metro processes, clear the Metro cache in `%LOCALAPPDATA%\Temp\`, and restart. `metro.config.js` already caps workers to 1 on Windows.
- **Login works but no SMS/email code arrives.** Check the sign-in method is enabled in Clerk (Step 4); Clerk's dev instance has generous free limits but verify the method is on.
