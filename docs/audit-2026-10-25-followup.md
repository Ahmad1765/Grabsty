# Audit follow-up — 2026-10-25

Continuation of `docs/audit-2026-10-24-analytics-security.md`.

| Item | Outcome |
|---|---|
| Production deploy | Vercel builds of `dc69e9d` were previews only (production is promoted manually). Rebuilt both as production (`grabsty-app`, `grabsty`). Verified live: app bundle contains Sentry DSN + PostHog key (US host), strict `script-src` served; www.grabsty.com no longer serves `supabase-schema.sql` / `vercel.json` (404), `env.js` carries the key + US host. |
| `app.grabsty.com` | **Has no DNS record** (NXDOMAIN) though attached to the Vercel project; web app is reachable only at `ceranix.vercel.app`. Needs a CNAME at the DNS provider. |
| Background removal | **Removed entirely** (user decision): `lib/photoClean/**`, `supabase/functions/remove-background`, config entry, Wardrobe toggles, `@mediapipe/tasks-vision`, `cdn.jsdelivr.net` from CSP. Sell keeps a plain `PhotoSlot {id, original}` (`lib/photoSlots.ts`). Note: on web it never ran in production (strict CSP blocked its `new Function` CDN loader), and on native it was a stub. Live function replaced by a 410 stub until deleted in the dashboard. |
| create-checkout-session | Redeployed (v15): repo and live match. |
| Listing/offer analytics | Server-side (`20261025000000`): `listing_created`, `offer_created`, `offer_responded` triggers via shared `analytics.send_event`; order trigger refactored onto it and `is_offer` now derived from accepted offers (COD never set `offer_message_id`). Client `listing_created`/`offer_made` removed. Verified in one rolled-back flow (list → offer → accept → checkout): 4 events, correct distinct_ids, no titles/descriptions/chat/address. |
| Analytics opt-out UI | Settings → General → "Share usage data" switch added (the opt-out existed but had no UI). Waits for the persisted choice (`analyticsReady`). |
| Dev builds | PostHog silent in `__DEV__` unless `EXPO_PUBLIC_POSTHOG_DEBUG=1` (EAS dev env shares the prod key). |
| PostHog reverse proxy | `/relay-gs` rewrites in both `vercel.json` files → PostHog US; production web + waitlist send same-origin. Needs deploy to verify. |
| Account deletion → PostHog | `delete-account` v13 calls `persons/bulk_delete` (events + recordings) when `POSTHOG_PERSONAL_API_KEY` (scope `person:write`) and `POSTHOG_PROJECT_ID` secrets exist. |
| Privacy policy | Discloses usage analytics, screen recordings, ID-photo storage, named processors (Supabase, PostHog US, Sentry DE, Expo/Firebase, Vercel), the opt-out, in-app deletion. |
| Secure session storage | Native sessions in Keychain/Keystore (`lib/secureSessionStorage.ts`, chunked, migrates AsyncStorage sessions on first read; 5 unit tests). **Not verified on a device** (none connected). |
| Reset link on web | Fragment captured at module load (expo-router 58 rewrites the URL before the screen's effect). |
| Expo SDK 54 → 58 | Branch `chore/expo-sdk-58` in worktree `../Ceranix-sdk58`, not merged. See that branch for details. |
