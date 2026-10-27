# Deployment

How Grabsty ships to each surface. Two independent pipelines:

| Surface | Pipeline | Config |
| --- | --- | --- |
| **Web** | Vercel (auto on push) | `vercel.json`, `.github/workflows/vercel-*.yml` |
| **iOS / Android** | EAS Build + EAS Update (OTA) | `eas.json`, `app.config.js`, `.github/workflows/eas.yml` |

This doc covers the **native** (EAS) pipeline. Web is already wired through Vercel and needs no per-release steps.

---

## Concepts

- **EAS Build** compiles the native binary (`.ipa` / `.aab` / `.apk`). Needed for anything that changes native code or dependencies — and for every store submission.
- **EAS Update** ships a new **JS/asset bundle over the air** to an already-installed build, no app-store review. Use it for JS-only changes (most feature work, copy, bug fixes).
- **Channel** — a build is stamped with a channel (`development` / `preview` / `production`). OTA updates published to that channel reach only builds on it.
- **runtimeVersion** — `{ "policy": "fingerprint" }` (in `app.config.js`). The fingerprint is derived from the native module set, so an OTA update only lands on builds whose native layer matches. **Change native deps ⇒ fingerprint changes ⇒ you must ship a new build**, not an OTA update. This is what prevents "JS newer than the binary" crashes.

## Build profiles (`eas.json`)

| Profile | Distribution | Channel | Notes |
| --- | --- | --- | --- |
| `development` | internal | `development` | Dev client, iOS simulator + Android APK. For day-to-day dev builds. |
| `preview` | internal | `preview` | Installable QA build (Android APK), no dev client. Share with testers. |
| `production` | store | `production` | Store binary (AAB), `autoIncrement` build number via remote versioning. |

App/build versioning uses `cli.appVersionSource: "remote"` — EAS owns the build number; `production` auto-increments it. The marketing `version` still comes from `app.config.js`.

---

## One-time setup

1. **Install & log in**
   ```bash
   npm i -g eas-cli   # or use npx eas-cli
   eas login
   ```
2. **Link the project** — creates the Expo project and writes the project id:
   ```bash
   eas init
   ```
   Put the resulting id in your environment as `EAS_PROJECT_ID` (see `.env.example`). `app.config.js` reads it to wire the OTA `updates.url`; without it, builds still work but OTA stays disabled.
3. **Configure EAS environment variables** — the app's `EXPO_PUBLIC_*` values, per environment, so builds get real config. Either in the EAS dashboard (Project → Environment variables) or via CLI:
   ```bash
   eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value "https://…"
   # …repeat for ANON_KEY, SENTRY_DSN, POSTHOG_KEY/HOST, STRIPE_PUBLISHABLE_KEY
   ```
   Each build profile declares `"environment": "<name>"`, so these are injected automatically at build time. **Secrets never live in `eas.json`.**
4. **CI token (optional but recommended)** — create an access token at expo.dev → Settings → Access tokens and add it to GitHub → Settings → Secrets and variables → Actions as `EXPO_TOKEN`. This unlocks the `EAS` workflow.
5. **Store credentials** — run `eas credentials` (or let `eas build` prompt) to set up the iOS distribution cert / Android keystore. EAS can manage these for you.

---

## Day-to-day

### Ship a JS-only change (OTA)
```bash
eas update --branch preview  --message "fix: offer sheet copy"   # to QA
eas update --branch production --message "fix: offer sheet copy"  # to prod
```
Or from CI: **Actions → EAS → Run workflow** → command `update`, profile `preview`/`production`.

> Reaches only builds whose runtime fingerprint matches. If you changed native deps since the installed build, publish a new build instead.

### Cut a QA build
```bash
eas build --profile preview --platform all
```
Or CI: **EAS → Run workflow** → command `build`, profile `preview`.

### Cut & submit a production release
```bash
eas build  --profile production --platform all
eas submit --profile production --platform ios      # App Store Connect
eas submit --profile production --platform android  # Play Console
```

---

## Release checklist

- [ ] `npm run typecheck` · `npm test` · `npm run lint` green (CI enforces on PR).
- [ ] Bump `version` in `app.config.js` **and** `app.json` for a store release (keep them in sync).
- [ ] Native deps changed? → **build**, don't OTA (fingerprint moved).
- [ ] JS-only? → **OTA update** to `production`.
- [ ] EAS environment variables set for the target environment.
- [ ] Sentry release matches app version (`carrinex@<version>` — see `lib/sentry.ts`).

## Rollback

- **OTA**: republish the previous good bundle, or use `eas update:rollback` / republish from the branch's history in the EAS dashboard. Fast — no store review.
- **Native binary**: OTA a JS fix on top if the break is in JS; otherwise build + resubmit. Store rollbacks are slow, so prefer shipping fixes forward via OTA when the native layer is unchanged.
