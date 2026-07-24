<div align="center">

# 🏙️ Portl

### The society gate, in your pocket.

A mobile-first society management app that moves everything that used to happen at the apartment gate — visitor approvals, complaints, notices, polls, amenity bookings and maintenance dues — into **one app** for **Residents**, **Security Guards** and **Society Admins**.

[![Expo SDK 55](https://img.shields.io/badge/Expo-SDK_55-000020?logo=expo&logoColor=white)](https://expo.dev)
[![React Native](https://img.shields.io/badge/React_Native-0.83-61DAFB?logo=react&logoColor=black)](https://reactnative.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres_+_RLS-3FCF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![Clerk](https://img.shields.io/badge/Auth-Clerk-6C47FF?logo=clerk&logoColor=white)](https://clerk.com)

**Repository:** https://github.com/saurabhravte/portl

</div>

---

## Table of Contents

- [What It Does](#-what-it-does)
- [Screenshots](#-screenshots)
- [Demo Video](#-demo-video)
- [Download the APK](#-download-the-apk)
- [Demo Credentials](#-demo-credentials)
- [Tech Stack](#-tech-stack)
- [Setup — Run It Yourself](#-setup--run-it-yourself)
  - [1. Prerequisites](#1-prerequisites)
  - [2. Install](#2-install)
  - [3. Environment variables](#3-environment-variables)
  - [4. Connect Clerk to Supabase (important)](#4-connect-clerk-to-supabase-important)
  - [5. Set up the database](#5-set-up-the-database)
  - [6. Create demo users](#6-create-demo-users)
  - [7. Run the app](#7-run-the-app)
- [Build a Shareable APK](#-build-a-shareable-apk)
- [Over-the-Air Updates](#-over-the-air-updates)
- [Testing](#-testing)
- [Project Structure](#-project-structure)
- [License](#-license)

---

## What It Does

Apartment communities still run on gate intercom calls, WhatsApp groups and paper registers. A delivery arrives, the guard phones the flat, the resident misses the call, everyone waits. **Portl replaces all of that.** The guard raises a request, the resident taps **Approve** on their phone, and entry is logged — in seconds.

| Role                  | What they can do                                                                                                                                                                                            |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🏠 **Resident**       | Approve/deny visitors, pre-approve guests with a QR/6-digit code, raise & track helpdesk tickets, book amenities, read notices, vote in polls, view visitor history, pay maintenance dues, manage household |
| 🛡️ **Security Guard** | Register walk-in visitors (guest / delivery / cab / service), search flats & residents, verify pre-approval codes, mark entry & exit, view the live gate log and history                                    |
| 🏢 **Society Admin**  | Manage towers, flats, members, guards, staff & service providers; publish notices; create polls; configure amenities; assign & resolve complaints; raise dues; see reports and audit logs                   |

**The hero flow:** Guard taps _New Visitor_ → Resident gets a push notification → taps _Approve_ → guard's screen updates live → _Mark Entry_ / _Mark Exit_. If the resident doesn't respond in time, the request auto-escalates.

All permissions are enforced **server-side** with PostgreSQL Row Level Security — the app UI never decides access on its own.

---

## Screenshots

> _Add your screenshots to a `/screenshots` folder in the repo and update the paths below._

|            Resident — Approval             |             Guard — Gate             |             Admin — Dashboard             |
| :----------------------------------------: | :----------------------------------: | :---------------------------------------: |
| ![Resident](screenshots/resident-home.png) | ![Guard](screenshots/guard-gate.png) | ![Admin](screenshots/admin-dashboard.png) |

|                Pre-approval QR                |               Helpdesk                |             Notices & Polls             |
| :-------------------------------------------: | :-----------------------------------: | :-------------------------------------: |
| ![Pre-approval](screenshots/pre-approval.png) | ![Helpdesk](screenshots/helpdesk.png) | ![Community](screenshots/community.png) |

---

## Demo Video

> _Paste your demo link (YouTube / Loom / Google Drive)._

▶️ **Watch the walkthrough:** `<YOUR_DEMO_VIDEO_URL>`

---

## Download the APK

The easiest way to try Portl on an Android phone — no build tools needed.

> _After you run an EAS `preview` build (see [below](#-build-a-shareable-apk)), paste the download link here._

**Android APK:** `<YOUR_EAS_BUILD_LINK>`

Open the link on an Android phone → download the `.apk` → allow **"Install unknown apps"** → install.

---

## Demo Credentials

Portl uses **Clerk** for sign-in, so accounts live in your own Clerk instance rather than being hard-coded. Create one user per role (see [Create demo users](#6-create-demo-users)), then list them here for reviewers:

| Role           | Login (email or phone) | Password / OTP |
| -------------- | ---------------------- | -------------- |
| Resident       | `<resident login>`     | `<password>`   |
| Security Guard | `<guard login>`        | `<password>`   |
| Society Admin  | `<admin login>`        | `<password>`   |

The bundled demo fixture creates a society **"Sunrise Heights"**, flat **A-101**, a pending delivery request, an open ticket, a notice, a poll, a due, and a reusable pre-approval code **`424242`** — so the whole story is ready the moment you sign in.

---

## Tech Stack

| Area             | Technology                                                                     |
| ---------------- | ------------------------------------------------------------------------------ |
| App              | Expo SDK 55, React Native 0.83, React 19, TypeScript                           |
| Routing          | expo-router (file-based, role groups) with typed routes                        |
| Auth             | **Clerk** (`@clerk/expo`) — email + phone, secure token storage                |
| Backend          | **Supabase** — Postgres, Row Level Security, Realtime, Storage, Edge Functions |
| Data fetching    | TanStack Query                                                                 |
| State            | Zustand                                                                        |
| Validation       | Zod                                                                            |
| Styling          | Uniwind (Tailwind CSS v4) + custom theme                                       |
| Payments         | Razorpay (maintenance dues)                                                    |
| Notifications    | Expo Push → FCM, triggered by a Supabase Edge Function                         |
| Monitoring       | Sentry                                                                         |
| Build & delivery | EAS Build (APK / AAB) + EAS Update (OTA)                                       |
| Quality          | ESLint, Jest + React Native Testing Library, Maestro E2E, SQL RLS tests        |

---

## Setup — Run It Yourself

### 1. Prerequisites

- **Node.js** ≥ 20 and **Git**
- **Bun** (this repo uses `bun.lock`) — or npm/yarn if you prefer
- **EAS CLI** and **Supabase CLI**:
  ```bash
  npm install -g eas-cli
  npm install -g supabase   # or use: bunx supabase ...
  ```
- Free accounts on [expo.dev](https://expo.dev), [supabase.com](https://supabase.com) and [clerk.com](https://clerk.com)

### 2. Install

```bash
git clone https://github.com/saurabhravte/portl.git
cd portl
bun install        # or: npm install
```

### 3. Environment variables

Copy the example file and fill in your keys. The app reads `.env.local` first, then `.env`:

```bash
cp .env.example .env.local
```

For local development you only need these three:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
```

> Anything starting with `EXPO_PUBLIC_` is bundled into the app and is **not** a secret. Keep service-role and secret keys out of the app entirely — they belong only in Supabase Edge Functions.

### 4. Connect Clerk to Supabase (important)

Every security rule in the database reads the logged-in user from the Clerk token (`auth.jwt() ->> 'sub'`). **If you skip this, the app looks like it works but every screen loads empty.**

1. **Clerk Dashboard** → _Configure_ → _Integrations_ → enable the **Supabase** integration.
2. **Supabase Dashboard** → _Authentication_ → _Sign In / Providers_ → _Third-Party Auth_ → **Add provider → Clerk**, and paste your Clerk frontend API domain (e.g. `https://your-app.clerk.accounts.dev`).
3. In **Clerk → User & authentication**, enable email (password + email code) and phone (SMS) sign-in. Portl expects E.164 phone numbers like `+919876543210`.

That's it app-side — the Clerk token is attached to Supabase automatically in `src/lib/supabase.ts`.

### 5. Set up the database

Point the Supabase CLI at your project, then apply the schema and baseline seed:

```bash
supabase db reset      # runs every migration in supabase/migrations + seed.sql
```

This creates all tables, the RLS policies, the `society-media` storage bucket, and identity-free demo data (society, towers, flats, amenities, staff).

Then deploy the Edge Functions (push notifications, payments, privacy jobs):

```bash
supabase functions deploy
```

### 6. Create demo users

The baseline seed is identity-free on purpose. To wire real logins to the demo society:

1. In **Clerk**, create three development users — one each for resident, guard and admin — and copy each user's Clerk **subject id** (`user_...`).
2. Apply the demo fixture with those ids:
   ```bash
   psql "$DATABASE_URL" \
     -v resident_id="<resident Clerk subject>" \
     -v guard_id="<guard Clerk subject>" \
     -v admin_id="<admin Clerk subject>" \
     -f supabase/demo_seed.sql
   ```
   (On Windows PowerShell use `$env:DATABASE_URL`.)

Now the three Clerk users map to Resident **Ravi**, Guard **Ganesh** and Admin **Anita** in _Sunrise Heights_.

### 7. Run the app (Expo Go)

> 👉 **New here? Follow [`SETUP.md`](SETUP.md)** — a full, from-scratch, Expo-Go-first walkthrough (accounts → env → secrets → run).

The core app runs in **Expo Go (SDK 55)** for local development. Start Metro and scan the QR with Expo Go:

```bash
bun start          # or: npm start
```

Sign in as each demo user and confirm each role lands on its own dashboard.

**Works in Expo Go:** email/phone login, all three role dashboards, the visitor/gate flow, notices, polls, tickets, amenities, and live Supabase data.
**Needs a dev/APK build (later):** online Razorpay payments, native "Continue with Google", remote push notifications, and Sentry crash reporting. These degrade gracefully in Expo Go (the buttons hide or no-op).

**Windows / EMFILE:** If Metro crashes with `EMFILE: too many open files`, stop all Node/Metro processes, delete `%LOCALAPPDATA%\Temp\metro-cache` and `%LOCALAPPDATA%\Temp\metro-file-map-*`, then restart with `bun start` (avoid `-c` until stable). You can also set `REACT_NATIVE_PACKAGER_MAX_WORKERS=1` before starting. Prefer `bun expo start --tunnel` if LAN connect fails after a crash.

> **Push notifications** need a dev/preview build (not Expo Go) plus FCM: create a Firebase project and upload its service-account JSON via `eas credentials` (Android → Google Service Account → FCM V1).

---

## Build a Shareable APK

The **`preview`** profile produces a standalone `.apk` you can send to anyone.

**⚠️ Read this first — two things will stop the build if you miss them:**

1. **Release builds validate their config and fail early if anything is missing.** For the `preview` (and `staging`/`production`) profiles you must provide the **full** set of environment variables in EAS, including Sentry. The required names are:
   `APP_ENV`, `EXPO_OWNER`, `EAS_PROJECT_ID`, `EXPO_IOS_BUNDLE_IDENTIFIER`, `EXPO_ANDROID_PACKAGE`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`, `EXPO_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`.
   _Don't want Sentry yet? Create a free Sentry project and paste its values — it's the quickest unblock. (Advanced: you can remove the three `SENTRY_\*`names from`RELEASE*VARIABLES`in`scripts/release-config.js` to skip it while testing.)*

2. **A clean git commit is required** (`eas.json` sets `requireCommit: true`). Commit your work before building.

**Steps:**

```bash
# 1. Link the Expo project (first time only)
eas init

# 2. Add the variables above to the "preview" environment
eas env:create --environment preview --visibility plaintext --name EXPO_PUBLIC_SUPABASE_URL
eas env:create --environment preview --visibility sensitive  --name SENTRY_AUTH_TOKEN
# ...repeat for each variable (or add them in the Expo dashboard)
eas env:list --environment preview      # sanity-check

# 3. Commit, then build the APK
git add -A && git commit -m "Configure preview build"
bun run build:apk        # = eas build --platform android --profile preview
```

EAS builds in the cloud (~5–15 min) and prints a **download link + QR code**. Share that link — anyone on Android can install it. Paste it into the [Download the APK](#-download-the-apk) section above.

For the Play Store later: `bun run build:production` then `eas submit --platform android`.

---

## Over-the-Air Updates

Ship JavaScript/UI fixes to installed apps instantly — no new APK, no store review:

```bash
bun run update:preview      # push to the preview channel
bun run update:prod         # push to production (also uploads Sentry sourcemaps)
```

> Native changes (new permissions, new native libraries, SDK upgrades) always need a fresh build and a version bump — they can't go out over the air.

---

## Testing

```bash
bun test                 # Jest unit + component tests
bun run typecheck        # TypeScript
bun run lint             # ESLint
bun run test:rls         # Supabase RLS policy tests
```

---

## Project Structure

```
portl/
├─ src/
│  ├─ app/                    # expo-router routes
│  │  ├─ (auth)/              # sign-in, sign-up, onboarding
│  │  ├─ (resident)/          # home, approve, community, helpdesk, amenities, payments…
│  │  ├─ (guard)/             # gate, new-visitor, queue, code, shifts, history…
│  │  └─ (admin)/             # dashboard, manage/{towers,flats,members,dues,polls…}
│  ├─ components/             # shared UI components
│  ├─ features/               # feature logic (visitors, tickets, payments, notices…)
│  ├─ lib/                    # supabase client, clerk, helpers
│  ├─ stores/                 # Zustand stores
│  └─ theme/                  # design tokens
├─ supabase/
│  ├─ migrations/             # 25 ordered SQL migrations (schema + RLS + features)
│  ├─ functions/              # Edge Functions (send-push, razorpay, privacy jobs…)
│  ├─ seed.sql                # identity-free baseline demo data
│  └─ demo_seed.sql           # binds demo users to Clerk subjects
├─ docs/                      # ARCHITECTURE, RELEASE, OPERATIONS, DEMO guides
├─ app.json / app.config.js   # Expo config (dynamic, env-driven)
├─ eas.json                   # build profiles + environments
└─ package.json
```

More detail lives in [`SETUP.md`](SETUP.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/DEMO.md`](docs/DEMO.md).

---

<div align="center">

Built with Expo, React Native, Clerk and Supabase.

_"The day a guard says the app is faster than calling the flat, Portl has won the gate."_

</div>
