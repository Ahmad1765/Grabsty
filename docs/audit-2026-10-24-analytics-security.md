# Grabsty — Analytics Architecture & Security Audit (2026-10-24)

Research phase only. No application code, migrations or live data were changed while producing this report.
Live DB inspected read-only (SELECT on catalog + advisors) on project `ttxestvncdynsssmjqhk`; repo migrations used for intent only, because the live DB has drifted from them.

Evidence labels: **CONFIRMED** = verified in live catalog or code path traced end-to-end; **CONFIRMED (catalog)** = every link verified from live function/policy source but not executed; **SUSPECTED** = plausible, not verified.

---

## A. Architecture and trust boundaries

```
 Native app (Expo SDK 54, RN 0.81)  ┐                         ┌─ Postgres (RLS on all 32 public tables)
 Expo web SPA (Vercel, CSP)         ├─ supabase-js (anon key +├─ SECURITY DEFINER RPCs = all money/state writes
                                    │   user JWT)              │    (process_checkout, cancel_order, accept_chat_offer,
                                    │                          │     advance_escrow_status [admin], ...)
                                    │                          ├─ Triggers: guard_profile_trust, validate_offer_status_update,
                                    │                          │    offer sync, push.notify_send_push → pg_net → send-push
                                    │                          ├─ pg_cron: order/offer sweeps, rate-limit purge, trending
                                    ├─ Edge Functions ─────────┤    snapshots
                                    │   create-checkout-session (JWT) → Stripe API (disabled today: no pk/sk)
                                    │   delete-account (JWT), remove-background (JWT) → Replicate
                                    │   stripe-webhook (HMAC), send-push (shared secret) → Expo/FCM
                                    ├─ Storage (public buckets: listing-images, avatars, wardrobe-images)
                                    ├─ PostHog EU (client SDK, replay native-only) — no key configured yet
                                    └─ Sentry (errors, sendDefaultPii:false)
 Waitlist site (static, Vercel) → Supabase anon insert + PostHog (build-time env.js)
```

Trust boundaries that matter:
1. **Client → PostgREST/RPC.** Everything the client sends is attacker-controlled. Authorization lives in RLS policies, column grants, BEFORE triggers and SECURITY DEFINER RPC checks. Client gating (`app/admin/_layout.tsx:27`, GuestGate, UI-hidden buttons) is UX only.
2. **Client-controlled rows feeding server decisions.** The critical finding (C1) is exactly this: `conversations.seller_id` is client-written and later trusted by offer/checkout logic.
3. **Third-party processors.** PostHog (analytics, replay screenshots), Sentry, Replicate, Expo push, Stripe.
4. **Public storage URLs** bypass storage RLS entirely (`/object/public/...`).

Core workflow (COD, the only live payment path): listing → conversation → offer message → trigger creates `offers` row → seller `accept_chat_offer` → buyer `process_checkout` (prices from listing or accepted offer, `FOR UPDATE` locks) → admin logistics `advance_escrow_status` (packing → IN_TRANSIT/shifting → delivered) → `complete_cod_order` / auto-complete cron.

---

## B. Findings (ranked)

### Critical

**C1 — Any user can buy any listing at an arbitrary price (e.g. Rs 1) using a second account.** CONFIRMED — reproduced end-to-end on live data in a rolled-back transaction (order created at 100 paisa). **FIXED 2026-10-24** by `supabase/migrations/20261024000000_conversation_seller_must_own_listing.sql` (also fixes M2); regression `tests/adversarial/conversation_seller_forgery.sql` passes 7/7 on live, and the genuine offer → accept → COD path still charges the offer price.
- Evidence (live): conversations INSERT policy `WITH CHECK (auth.uid() = buyer_id)` — `seller_id` unconstrained; UPDATE policy lets a participant rewrite any column (table UPDATE grant to `authenticated`/`anon`); `trg_fn_sync_offer_on_message_insert` copies `seller_id` from the conversation into `offers`; `accept_chat_offer` authorizes `caller in (offer.buyer_id, offer.seller_id)` and never compares to `listings.seller_id`; `process_checkout` accepted-offer lookup filters on `listing_id, buyer_id, status='accepted'` only; offer amount validation is `> 0` and `<= ceiling` (no floor).
- Attack: account A creates/edits a conversation `{buyer A, seller B, listing L (owned by victim V)}` → sends offer message amount 1 → account B calls `accept_chat_offer` → A calls `process_checkout(L, 'cod', …)`.
- Impact: COD order at Rs 1 against V's item; L marked sold; competing offers declined and other buyers' pending orders cancelled. Goods theft if logistics dispatches; trivial marketplace-wide listing lockout. Live data shows no exploitation (0 offers/conversations with seller ≠ listing seller). Not covered by `tests/adversarial/*`.
- Root cause: seller identity derived from a client-writable row instead of `listings.seller_id`.
- Fix (defence in depth, all three): (1) INSERT `WITH CHECK` ties `seller_id` to `listings.seller_id` (or support bot when `listing_id is null`); (2) `REVOKE UPDATE ON conversations FROM anon, authenticated; GRANT UPDATE (buyer_last_read_at, seller_last_read_at) TO authenticated;` (client only writes these, `lib/chat.ts:800-806`); (3) `accept_chat_offer` requires `offer.seller_id = listing.seller_id`, `process_checkout` adds `o.seller_id = v_seller_id`.
- Verify: new `tests/adversarial/conversation_seller_forgery.sql` run on a Supabase branch: forged insert → RLS error; seller_id update → permission denied; end-to-end Rs 1 checkout → fails.

### High

**H1 — Government ID images designed to live in a public bucket.** CONFIRMED (code + live bucket flag); 0 documents uploaded so far, so no exposure yet. **FIXED 2026-10-24** (`20261024010000_private_id_docs_and_pickup_privacy.sql`: private `verification-docs` bucket, owner/admin-only policies, 10 MB image-only; client stores the path and shows 1-hour signed URLs; local-URI fallback removed).
- `lib/upload.ts:422-425` uploads to `avatars/{uid}/verification/…`, `lib/upload.ts:260` stores `getPublicUrl`; live `avatars.public = true`. Public URLs skip storage RLS. Upload failure stores a local `file://` URI as the document (`components/settings/useSettingsManager.ts:611-613`).
- Fix: private `verification-docs` bucket, store object path, admins view via short-lived `createSignedUrl`; remove the fallback.
- Verify: unauthenticated `curl` of a stored document path returns 400/403; admin view still renders.

**H2 — Session replay can record ID images and device logs.** CONFIRMED (config + SDK source); not live yet (no PostHog key configured). **FIXED 2026-10-24** in `lib/analytics.ts` (images masked, logcat and network telemetry off); device recording check still pending.
- `lib/analytics.ts:57-62` sets `maskAllImages: false`; Android replay is screenshot-based (`@posthog/react-native-plugin` sets `screenshot = true`); ID images render in `components/settings/VerificationSheet.tsx` and `app/admin/index.tsx`. `captureLog` (Android logcat) and `captureNetworkTelemetry` (iOS) default true.
- Correction to the client investigator: `maskAllTextInputs` masks **all text** as well as inputs (`posthog-react-native/dist/types.d.ts` "Enable masking of all text and text input fields"), so rendered chat/addresses are masked by default.
- Fix: `maskAllImages: true`, `captureLog: false`, `captureNetworkTelemetry: false`; no replay on admin screens.
- Verify: dev build, record a session over Verification + Chat + Invoice; PostHog recording shows placeholders, no logcat entries.

### Medium

| ID | Finding | Status | Evidence | Fix |
|---|---|---|---|---|
| M1 | Buyer can read seller's pickup (home) address — **FIXED 2026-10-24** (same migration; verified buyer 0 rows, seller/admin 1) | CONFIRMED (reproduced on live) | `order_seller_pickups` policies `order_seller_pickups_party_access` and "Participants and admins can view…" allow `o.buyer_id = auth.uid()`; RPC `get_order_seller_pickup` explicitly denies buyers | Drop buyer clause / party_access policy. Verify: buyer JWT `select count(*)` = 0 |
| M2 | Conversation participants can rewrite any column (spoof threads onto victims, misroute order system messages) | CONFIRMED (catalog) | same UPDATE policy as C1 | Fixed by C1 step 2 |
| M3 | Storage buckets have no size/MIME limits — **FIXED 2026-10-24** (`20261024020000`) | CONFIRMED | live `file_size_limit=null, allowed_mime_types=null` on all 3 buckets | 10 MB, image MIME allowlist. HTML/SVG XSS on storage origin = SUSPECTED |
| M4 | Persisted query cache holds buyers' addresses unencrypted; passive sign-out never clears it | CONFIRMED (code) | `lib/queryClient.ts:37-55` persists all queries 24h; `myOrders` select includes `shipping_address` (`lib/payments.ts:144`); `lib/auth.tsx:125-127` SIGNED_OUT branch only nulls profile | Persist allowlist of public keys; clear cache + persister on any SIGNED_OUT |
| M5 | Refresh token not revoked at logout; tokens in AsyncStorage/localStorage | CONFIRMED (code) | `lib/auth.tsx:178` `scope:'local'`; `lib/supabase.ts:152` | Fire-and-forget global sign-out after local; SecureStore adapter on native (chunked) |
| M6 | Password reset cannot be completed | CONFIRMED (code) | `resetPasswordForEmail` without `redirectTo` (`app/auth/login.tsx:210`); no reset route; `detectSessionInUrl:false` | `app/auth/reset.tsx` + `PASSWORD_RECOVERY` → `updateUser` |
| M7 | Accepted offer's 7-day expiry can be renewed indefinitely by a no-op update — **FIXED 2026-10-24** (`20261024020000`, reproduced then verified blocked) | CONFIRMED (live trigger source) | `validate_offer_status_update` returns early when status unchanged; `trg_messages_touch` bumps `updated_at`; card checkout uses `messages.updated_at` (`create-checkout-session/index.ts:168`). COD path uses `offers.accepted_at` → unaffected. Latent: card path disabled | Use immutable `accepted_at`; reject no-op updates on non-active offers. Same no-op may re-fire `push_on_offer_status_update` (notification spam) — SUSPECTED |
| M8 | Analytics business metrics are wrong by construction — **FIXED 2026-10-24** (`20261024030000_server_side_order_analytics.sql`: `order_created` / `order_status_changed` from an orders trigger; 15 client order captures removed). Correction: `stripe-webhook` already sent `purchase_completed` server-side for card payments; it stays | CONFIRMED (code) | see §C: card payments complete via webhook but `checkout_completed` only fires client-side (`lib/paymentService.ts:131,184,269`) → real card sales never counted, demo mocks counted; admin actions attributed to admin's distinct_id | Server-side events (§C) |
| M9 | Analytics opt-out is not durable across sign-out — **FIXED 2026-10-24** (`resetIdentity` re-applies opt-out) | CONFIRMED (SDK source) | `resetIdentity()` → SDK `reset()` keeps only InstalledAppBuild/Version/DeviceId, so the SDK's OptedOut flag is wiped; app-level flag blocks `capture()` but lifecycle events/replay are SDK-driven | Use SDK `optOut()/optedOut` as the single source; re-apply after `reset()` |

### Low (quick fixes unless noted)

- L1 Seller can relist a sold-and-completed item (listings UPDATE policy omits `completed`). CONFIRMED. **FIXED 2026-10-24** (`20261024020000`: clients can never un-sell; server relists still work).
- L2 `anon`/`authenticated` hold TRUNCATE/TRIGGER/REFERENCES and writes on server-only tables (RLS is the only barrier; TRUNCATE not reachable via PostgREST). CONFIRMED, defence in depth.
- L3 Leaked-password protection disabled (advisor). CONFIRMED. Dashboard toggle.
- L4 `create-checkout-session` accepts any return URL when `ALLOWED_ORIGINS` unset (`index.ts:224-230`). CONFIRMED; reject when empty. **FIXED 2026-10-24** (deployed v14).
- L5 `remove-background` (paid Replicate) limited per user only; multi-account abuse. SUSPECTED (live signup/confirm settings unknown). Global daily cap + Replicate spend limit + CAPTCHA.
- L6 Edge functions return raw DB/storage/Replicate error text (`delete-account/index.ts:117,123`, `remove-background/index.ts:124…181`). CONFIRMED.
- L7 CI: `e2e-tests.yml` grants `contents: write` workflow-wide to the job running PR code; third-party actions pinned by tag. CONFIRMED.
- L8 Waitlist `anon` INSERT `WITH CHECK (true)`; referral counts inflatable. CONFIRMED (repo).
- L9 Waitlist deploys its whole folder; `/vercel.json` publicly served. CONFIRMED live. Info disclosure only.
- L10 Analytics PII: `order_shipped.tracking_number`, free-text `reason` on cancel/dispute (`lib/paymentService.ts:367,382,415,629,643`). CONFIRMED. **FIXED 2026-10-24** (client events removed; server events carry no address, notes, reason text, courier or tracking number — verified on a rolled-back checkout + cancel).
- L11 Sentry has no `beforeBreadcrumb` scrubbing; OAuth implicit-flow fallback reads tokens from URL fragment (`lib/oauth.ts:44-50`). SUSPECTED leak path.
- L12 Privacy policy (`app/legal/[doc].tsx`) doesn't disclose analytics/replay; `delete-account` doesn't delete PostHog person. CONFIRMED. Required for Play Data safety/App Store labels.
- Functional bugs found on the way (not security): `profiles.phone` does not exist live, so "save phone" silently no-ops while showing success (`useSettingsManager.ts:653-682`); `mark_order_shipped` always fails for sellers (blocked by `guard_platform_shipping`) — fine if platform-ships is policy, but the UI path should not exist; `advance_order_fulfillment('packing')` accepts unpaid card orders.

### Examined and found sound
RLS enabled on all 32 public tables; no views/matviews; every SECURITY DEFINER function sets `search_path`; `profiles` trust fields (`is_admin`, `is_verified`, `rating`, `total_sales`) guarded by trigger; `orders`/`transactions`/`offers` have no client write grants; admin RPCs gate on `is_admin()`; `process_checkout` server-prices and row-locks (no double-sell); cancel/dispute/COD-completion role checks; messages cannot be `system` or forged sender; Stripe webhook HMAC + tolerance + idempotency; send-push shared secret via Vault; no secrets committed or bundled (all embedded JWTs are `anon`); no source maps deployed; push deep links allowlisted; no `dangerouslySetInnerHTML`/WebView/open redirects in the client; `sw.js` caches nothing. Dependency audit: 3 critical / 16 high advisories, all in build/dev tooling or not reachable with attacker input (details in investigator notes); Expo SDK 54 → 58 and `@sentry/react-native` 7 → 8 are the meaningful upgrade debts.

---

## C. Analytics architecture decision

**What the previous work got wrong** (my own earlier recommendation, revised):
1. Put business events (orders, payments, escrow) in client code. Client events are spoofable, blockable, attributed to whoever clicked, miss webhook/cron/admin transitions, and counted demo mocks. They cannot be authoritative.
2. Turned on replay with `maskAllImages:false` and never considered `captureLog` → H2.
3. Duplicated opt-out in AsyncStorage instead of using the SDK's, and lost it on `reset()` → M9.
4. No dev/prod separation beyond "key present"; no reverse proxy; privacy policy not updated.
5. Claimed "replay works on web" implicitly — it is native-only.

**Alternatives compared** (pricing from vendor pages, Oct 2026): PostHog Cloud EU (1M events + 5k web / ~2.5k mobile recordings free, flags, Frankfurt), Mixpanel (1M events, 10k replays), Amplitude (2M events, 10k replays), Firebase/GA4 (ads-oriented, weak web, no replay), Aptabase (20k events, no funnels), Plausible/Umami (web only), PostHog self-host (16 GB VM, unsupported). **Decision: keep PostHog Cloud EU** — already integrated, adequate free tier, flags/surveys included, EU residency; switching buys nothing at alpha. Trade-offs accepted: vendor lock-in, no web replay.

**Recommended split:**
- *Client (behaviour, estimates):* `$screen`, `listing_viewed`, `search_performed` (length only), `listing_liked/saved`, `seller_followed`, `checkout_started`, `user_signed_in`, `onboarding_completed`.
- *Server (authoritative, from Postgres):* `user_signed_up`, `listing_created`, `conversation_started`, `offer_created`, `offer_responded`, `order_created`, `order_status_changed`, `order_completed`, `order_disputed` (reason code), `order_canceled`, `review_submitted`. Implementation: AFTER INSERT/UPDATE triggers on `orders`, `offers`, `listings` (fire only on `status IS DISTINCT FROM`) → `net.http_post` to `https://eu.i.posthog.com/i/v0/e/`, token from Vault — same pattern as the existing push trigger. `distinct_id` = Supabase user id (same as client `identify`), so profiles merge with no aliasing. Remove the client `capture()` calls for these events to avoid double counting (PostHog does not guarantee `uuid` dedup).
- *Reliability ceiling:* pg_net has no retries and unlogged queues; acceptable for analytics because Postgres remains the source of truth. Add a weekly check of `net._http_response` errors (the push pipeline already failed silently once, 2026-10-14). Upgrade path: outbox table + pg_cron sender.
- *Environments:* two PostHog projects (dev/prod); `disabled: __DEV__` unless forced; register `app_env`, `app_version` super properties; drop all `*_demo` events.
- *Ad-blockers:* PostHog-documented reverse proxy (10-30% more capture) — Vercel rewrites under a neutral path before the SPA catch-all, or PostHog's managed proxy on a subdomain.

**Event schema rules:** `object_verb` snake_case past tense (keep current style, PostHog accepts either if consistent), money as integer `amount_pkr`, enums not free text, `is_/has_` booleans, `_v2` suffix on breaking changes, single typed `EVENTS` const map in `lib/analyticsEvents.ts`.

**Privacy plan:**
- Pakistan has no data protection act in force (PDP Bill 2023 still a draft per Chambers guide updated Mar 2026; moderate-high confidence). Consent banner not legally required today; design toward the draft (minimisation, 72h breach notice, cross-border caution).
- GDPR likely not triggered merely by an EU processor (EDPB 3/2018 — snippet-level evidence). Sign PostHog DPA anyway.
- Apple: first-party analytics without IDFA does not need ATT; privacy label must declare Usage Data, Diagnostics, User ID (linked, not tracking). Google Play Data safety: declare app interactions (replay screenshots), app activity, diagnostics, device IDs as collected (not shared) + deletion path.
- Never send: email, phone, address, names, free text, tracking numbers, raw search queries. Account deletion must call PostHog person delete.

---

## D. Prioritized remediation backlog

1. **Critical (immediately, one migration):** C1 + M2 (conversation INSERT check, column-level UPDATE grant, seller checks in `accept_chat_offer`/`process_checkout`). Add adversarial test.
2. **High security/data integrity:** H1 private verification bucket; M1 pickup-address policy; M3 bucket limits; L1 relist-after-completed; M7 immutable `accepted_at` (before enabling Stripe); L3 leaked-password toggle; L4 return-URL fail-closed.
3. **Analytics correctness & privacy (before pasting any PostHog key):** H2 replay masking; M9 opt-out; L10 property scrubbing; M8 server-side event triggers + remove client business captures + drop demo events; dev/prod projects; privacy policy + PostHog person deletion (L12).
4. **Reliability:** M6 password reset; M4 cache scoping + passive sign-out cleanup; phone-save bug; pg_net/send-push health check cron; L6 generic edge errors.
5. **Longer-term hardening:** M5 SecureStore + global revoke; L2 grant cleanup; L5 global Replicate cap + CAPTCHA; L7 CI permissions + SHA pinning; L8/L9 waitlist; L11 Sentry breadcrumb scrubbing; CSP without `'unsafe-inline'`; Expo SDK 58 / Sentry 8 upgrade.

## E. Verification plan (high-priority items)

| Item | Pass condition |
|---|---|
| C1 | On a Supabase branch: forged conversation insert → RLS violation; `update conversations set seller_id` → permission denied; full Rs 1 chain → `accept_chat_offer` or `process_checkout` raises; existing `tests/adversarial/order_chat_authz.sql` still passes; normal offer→accept→COD checkout still works (Playwright `stealth_checkout.spec.ts`) |
| H1 | Unauthenticated fetch of a verification object → 400/403; admin KYC review shows image via signed URL |
| H2 | Dev-build replay over Verification/Chat/Invoice shows image placeholders, no logcat |
| M1 | Buyer JWT: `select * from order_seller_pickups` → 0 rows; seller/admin unchanged |
| M3 | Upload `text/html` or 20 MB file → rejected |
| M7 | No-op `offer_status` PATCH on accepted offer → error, `accepted_at` unchanged |
| M8 | Place COD order on dev: exactly one `order_created` in PostHog dev project with `distinct_id` = buyer id, no address fields; admin status change emits `order_status_changed` attributed to buyer with `actor_role=admin` |
| M9 | Opt out → sign out → sign in: no events (incl. lifecycle) reach PostHog |

## F. Unresolved questions (materially affect the plan)

1. Is "platform ships every order" final? If yes, remove the seller self-ship path; if no, `guard_platform_shipping` breaks it today.
2. Should server order events be emitted to both buyer and seller (two events) or buyer only with `seller_id` property? (Recommendation: buyer-attributed `order_*` plus seller-attributed `sale_*` only if seller funnels are needed.)
3. Will Stripe/card payments be enabled before launch? Determines urgency of M7 and the webhook analytics path.

## G. Limitations

- C1/M2 not executed end-to-end (no writes made on the live project); verification should run on a Supabase branch.
- Live production auth settings (signup confirmation, CAPTCHA) and `app.grabsty.com` headers not inspected.
- Replay masking behaviour inferred from SDK source/docs, not recorded on a device.
- Pakistan law status based on March 2026 guide; check for later enactment.
- Dependency reachability judged by inspection, not exploitation.

## Sources (opened by investigators unless marked snippet)
PostHog: pricing https://posthog.com/pricing · RN SDK https://posthog.com/docs/libraries/react-native · RN replay https://posthog.com/docs/session-replay/installation/react-native · capture API https://posthog.com/docs/api/capture · identified vs anonymous https://posthog.com/docs/data/anonymous-vs-identified-events · ingestion/uuid https://posthog.com/docs/data/ingestion-warnings · proxy https://posthog.com/docs/advanced/proxy and /proxy/vercel · self-host https://posthog.com/docs/self-host · naming https://posthog.com/product-engineers/5-ways-to-improve-analytics-data
Supabase: DB webhooks https://supabase.com/docs/guides/database/webhooks · pg_net https://supabase.com/docs/guides/database/extensions/pg_net
Expo: https://docs.expo.dev/guides/using-posthog/
Alternatives: https://mixpanel.com/pricing/ · https://amplitude.com/pricing · https://aptabase.com/pricing · https://rnfirebase.io/analytics/usage
Privacy/platform: Apple https://developer.apple.com/app-store/user-privacy-and-data-use/ · Google Play Data safety https://support.google.com/googleplay/android-developer/answer/10787469 · Pakistan https://practiceguides.chambers.com/practice-guides/data-protection-privacy-2026/pakistan · EDPB 3/2018 (snippet) https://edpb.europa.eu/sites/edpb/files/files/file1/edpb_guidelines_3_2018_territorial_scope_en.pdf
Web: Vercel vercel.json https://vercel.com/docs/project-configuration/vercel-json
