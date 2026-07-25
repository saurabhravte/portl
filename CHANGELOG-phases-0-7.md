# Portl — Phases 0–7 Changelog

Branch: `fix/auth-and-design-system`

## Verification

| Check | Before | After |
|---|---|---|
| `tsc --noEmit` | clean | clean |
| Tests passing | 175 | **212** |
| Test suites failing | 3 | 3 *(identical, pre-existing)* |
| ESLint errors | 0 | 0 |
| ESLint warnings | 3 | 3 *(identical, pre-existing)* |
| `audit:design` | n/a | **PASS**, 0 violations / 212 files |

The 3 failing suites (`sessionRouting`, `loadingErrorStates`,
`realtimeHealth.integration`) fail identically on the untouched zip:
React Native 0.83 removed `react-test-renderer`, which
`@testing-library/react-native` requires. Pre-existing; needs its own ticket.

New commands:

```
bun run doctor:google    # Google Sign-In preflight
bun run audit:design     # design-system enforcement
```

---

## Phase 1 — Authentication (blocking)

### 1.1–1.5  "a verified E.164 phone number or email claim is required"

Three independent faults stacked into one dead end.

**Fault 1 — the database raised on ordinary outcomes.**
`claim_invite()` (`0019_release_security_followup.sql:212`) called
`raise exception` for *no verified claim*, *identity mismatch*, and
*profile already exists*. PostgREST converts any raise to a non-2xx,
supabase-js returns it as `error`, and `_layout.tsx` did
`setProfileFailed(claimError.message)` — putting a raw Postgres string on
screen as user-facing copy. The third case was the worst: a **successfully
provisioned** user re-running bootstrap was told their profile could not load.

**Fault 2 — the gate screen blocked the router.** This is why it was a dead
end rather than an ugly error.

```js
if (isSignedIn && profileStatus !== "linked") { return <blocking screen>; }
```

`resolveSessionRoute()` already routed `pendingVerification` / `unlinked` to
`/(auth)/pending-access`, a screen that let users fix this themselves. But the
gate returned before `children` (the `<Stack>`) rendered, so the navigation
resolved into an unmounted tree and the screen could never appear.
`pendingVerification` had no branch in the gate at all, rendering a bare
"Portl" wordmark on an empty screen.

**Fault 3 — "Try again" re-ran the same doomed RPC**, leaving Sign out as the
only real exit.

**Fixes**
- `supabase/migrations/0038_soft_invite_claim.sql` — `claim_invite` returns
  `{claimed, reason}` with reasons `claimed | already_linked |
  identity_unverified | identity_mismatch | no_invite`. It raises only for
  genuinely exceptional states (not signed in, unsupported identity type,
  ambiguous invite).
  **Security is byte-for-byte unchanged.** An unverified caller still cannot
  claim; a verified caller still cannot claim an invite addressed to an
  identity they do not own. Relaxing that would let anyone claim any invite by
  guessing an email address. Only the *failure mode* changed.
- `src/features/auth/inviteClaim.ts` — typed parser, tolerant of old and new
  payload shapes, plus `reasonFromLegacyError()` so a device on an old build
  against a new database (or the reverse, mid-rollout) still degrades
  gracefully instead of regressing to the dead end.
- `RoleGate` now blocks only on `loading` and `failed`. Recoverable states
  fall through to the router and get a real, actionable screen.
- No raw database string can reach the UI. Asserted by test.

### 1.2  Google Sign-In

Root cause was in `app.config.js`, not the JavaScript:

```
app.json       ios / android  ->  com.saurabhravte.portl
app.config.js  fallback       ->  com.portl.dev        (silent override)
```

Google binds an Android OAuth client to **(package name + SHA-1)** and an iOS
client to the bundle id. Unless `EXPO_ANDROID_PACKAGE` happened to be set in
`.env.local`, every build shipped as `com.portl.dev` — a package the OAuth
client had never seen — so Credential Manager rejected the request with
`DEVELOPER_ERROR` / status 10 the instant the button was tapped. The IDs in
the Google Cloud Console look perfectly correct, which is what makes this hard
to spot.

app.json is now the source of truth; env vars override rather than replace.
`assertReleaseConfiguration` still requires them for release builds, so only
the dev/preview fallback changed.

`scripts/check-google-signin.js` checks the four repo-verifiable causes and
prints the ones that can only be confirmed by hand:

- **EAS-managed credentials use a different SHA-1 from your local debug
  keystore.** Register both in Google Cloud Console.
- Clerk Dashboard: Google enabled with *Use custom credentials* ON, SHA-256
  registered under Native Applications.
- The Android emulator must use a **Google Play** system image; Credential
  Manager is absent from plain AOSP images.

`googleAuthConfig.ts` was already correct and is unchanged — it reads from
`Constants.expoConfig.extra` with a `process.env` fallback, which matters
because Metro only inlines `EXPO_PUBLIC_*` into your own source, never into
`node_modules`.

---

## Phase 2 — Signup rework

Account creation is now **username + password only**.

The whole verify / resend / skip / start-over state machine is gone from
sign-up, because there is no longer an email to verify at that point. That
removes the two most common dead ends on that screen: *"Sign-up is not
complete yet"* and *"cannot finalize without a created session"*.

`ContactDetailsSection` is a single component mounted in two places —
Profile → Contact details, and the `/(auth)/pending-access` lobby — so there
is exactly one implementation of "add and verify a contact". Verifying either
channel calls `retryProfile()`, which re-runs the invite claim.

`needsProfileCompletion()` no longer requires a phone. Username is still
required: it is the handle shown in the directory, on notices and in
approvals, and Google supplies a full name but never a handle.

`sign-up.tsx` 317 → 187 lines. `pending-access.tsx` 213 → 81 lines.

---

## Phases 3 & 5 — Design system

The foundation already existed and was in better shape than the plan assumed:
CSS custom properties with a light/dark pair, a five-step type scale, radius
scale, centralised component variants, and **zero hardcoded hex** outside the
token files. Phase 5 was therefore a retarget, not a rebuild.

Added: the missing **spacing scale** (4pt grid) and **elevation scale** (two
steps only — flat by default; a card is defined by surface + hairline border,
not a drop shadow).

### Contrast — three spec values needed handling

Measured, not guessed. All values verified by `contrast.test.ts` (52
assertions).

| Issue | Measured | Resolution |
|---|---|---|
| Secondary `#0084A1` | white 4.36:1, black 4.20:1 — **neither label passes** | Scoped to icons/fills only (4.05:1 clears the 3:1 graphics bar). Added `accent-strong` `#00647A` (white at 6.77:1) for teal surfaces carrying text. |
| Accent `#E69A28` | 2.16:1 on light bg — fails even the 3:1 non-text bar | Kept as the brand rating/alert fill, but **must never be the sole carrier of meaning in light mode**. `warn-text` `#7A4E0F` for amber wording. |
| Dark CTA `#D82862` | 3.83:1 as text | Fill used exactly as specified (white on it is 4.77:1). `primary-text` lightens to `#F06292` (5.99:1) for links. |

Two further corrections needed to clear AA: `approve` `#1F7A4C` → `#1A6B42`
(was 4.43:1 on its own tint), and `info` → `#00647A` so white labels pass.

### Consistency bugs found

- `Button` variant `approve` rendered `bg-primary` — "Approve" and "Pay now"
  were visually identical while the approve token went unused.
- `ROLE_ACCENTS` gave each role a **different CTA colour** (claret / teal /
  green). A direct Phase 5.5 violation. Unified: one CTA everywhere, roles
  distinguished only by a decorative `emphasis` that is never a button fill.
- Chart ramp contained two leftover Tailwind blues — the only off-token
  colours left in `src/`.

---

## Phase 4 — Onboarding

Rebuilt from scratch. 367 → 206 lines.

- Old screen and its per-slide bespoke components removed (4.1).
- `assets/images/onboarding-gate.png` deleted — **842 KB** (4.2).
- Replaced with ~2 KB of inline SVG (`OnboardingArt.tsx`): scales to any
  density, needs no @2x/@3x variants, and recolours with the theme instead of
  baking a palette into pixels.
- Structure matches the reference: art → title → body → full-width CTA → dots.
- Monochrome via dedicated `onboard-*` tokens (4.4), inverting to
  white-on-black in dark mode rather than switching to the warm surfaces.

**Design note:** onboarding deliberately does *not* use the claret CTA. It
runs before sign-in, before the user knows what Portl is, and a black button
reads as "continue" rather than as a brand statement. Colour starts at login.

Page dots derive from scroll offset rather than `onViewableItemsChanged`,
which fired mid-swipe and made them flicker. The notification permission is
requested only on the last slide and only on the way out; a refusal never
blocks entry.

---

## Phase 6 — Login & Register

Redesigned to the reference: left-aligned heading, inline "New user? Create an
account", iconed fields, single full-width CTA, "or" rule, then social.

Removed as visual noise (6.3):
- `AuthMethodPicker` — a two-tab Email/Phone switch with Phone permanently
  disabled. A picker with one usable option is decoration that also
  advertises a sign-in method the app does not support.
- `authFieldClassName` — a screen-local override giving auth inputs
  `rounded-xl border-0` while every other input in the app is `rounded-md`
  with a border.
- `AuthPrimaryButton` — a second button implementation using `bg-ink`,
  silently ignoring the brand CTA token.
- `AuthSocialRow` — shipped a permanently disabled Apple button labelled
  "Login account" next to the real Google one.

Kept: the `needs_client_trust` second-factor stage. It is not sign-up
verification and does not affect new users; it fires only for accounts with
2FA already enabled, where skipping it would be a real regression.

---

## Phase 7 — Consistency & QA

`scripts/audit-design-tokens.js` turns the one-off audit into something CI
runs on every commit, because a manual audit is only true on the day it is
done. It enforces:

1. No raw hex in `src/` outside the two token files (comment-aware).
2. `tokens.ts` and `global.css` agree on every value, both schemes.
3. Every light token has a dark override — the Phase 7.4 parity check.
4. No FILL token used via `text-*` (how AA failures get shipped).
5. No off-scale arbitrary values (`text-[13px]`, `p-[7px]`). Percentages and
   viewport units are exempt: a 28%-wide column has no business on a 4pt grid.

`tokens.parity.test.ts` covers the same ground from the test suite and was
verified to fail on a single-digit induced drift, naming the exact token.

---

## Required actions before this ships

1. **Apply migration `0038_soft_invite_claim.sql`.** The client handles both
   old and new database versions, but the dead end persists until this runs.

2. **Clerk Dashboard — required for Phase 2.** Under *User & authentication*:
   enable **Username** as an identifier and set **Email** to **Optional**, not
   Required. If Email stays Required, Clerk rejects a username-only sign-up at
   `finalize()` regardless of client code. That specific failure is detected
   and explained rather than surfaced raw, but the flow will not work until
   this is changed.

3. **Google Cloud Console.** Run `bun run doctor:google`, then confirm the
   Android OAuth client lists the SHA-1 of the keystore each build is signed
   with — local debug and EAS are different keystores.

4. **Stakeholder checkpoint 4.5** — review onboarding before the colour
   rollout goes further.

---

## Open item

**`profiles.society_id` is `NOT NULL`** (`0001_schema.sql:30`). A user with no
society cannot have a profile row, so "any user lands inside the app" cannot
mean the resident home. It means the app shell plus an actionable lobby, which
is what is built. If society-less users should browse a real home screen, that
is a schema change and a larger design conversation.

---

## Files

**Added**
```
supabase/migrations/0038_soft_invite_claim.sql
scripts/check-google-signin.js
scripts/audit-design-tokens.js
src/features/auth/inviteClaim.ts
src/features/auth/ContactDetailsSection.tsx
src/features/auth/OnboardingArt.tsx
src/features/auth/__tests__/inviteClaim.test.ts
src/theme/__tests__/tokens.parity.test.ts
```

**Deleted**
```
assets/images/onboarding-gate.png          (842 KB)
```

**Modified** — `app.config.js`, `package.json`, `src/global.css`,
`src/theme/tokens.ts`, `src/app/_layout.tsx`, `src/components/ui.tsx`,
`src/lib/validation.ts`, `src/features/auth/{AuthChrome,profileCompletion}`,
all four `(auth)` screens, `(resident)/profile.tsx`, and four off-scale
className fixes.
