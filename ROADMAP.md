# Grabsty Production Roadmap

Target: support **2,000–3,000 peak concurrent users**, take the platform from prototype (mock data) to production-ready marketplace.

---

## Capacity Math

- 3K concurrent users → ~50 RPS sustained, ~300 RPS spikes
- Supabase Pro tier (200 connections, 8GB DB, 100GB storage, 5M Realtime msgs/mo) covers this comfortably
- **Estimated monthly cost: $60–120**
  - Supabase Pro: $25
  - Sentry: $0–26
  - EAS Build: $19
  - Apple Developer: $99/yr ($8.25/mo)
  - Google Play: $25 one-time
  - Stripe: pay per transaction
  - Domain + misc: ~$5

---

## Phase 0 — Foundations (1–2 days)

- [ ] Set up env management: `.env.local`, `.env.production`, EAS secrets
- [ ] Pin Node version (already done via `.nvmrc`), lock package versions
- [ ] Create separate **staging** + **production** Supabase projects
- [ ] Wire Sentry (`@sentry/react-native`) — free tier covers you
- [ ] GitHub Actions CI: typecheck + eslint on every PR
- [ ] Add `.gitignore` entries for env files, EAS keys

---

## Phase 1 — Backend Schema + Auth (3–5 days)

### Postgres tables (matching `types/index.ts`)

```sql
profiles      (id uuid PK = auth.uid, username, avatar_url, bio, location, created_at)
listings      (id, seller_id FK, title, description, price, category, gender,
               brand, size, condition, is_sold, views, likes_count, created_at)
listing_images(id, listing_id FK, url, position int)
favorites     (user_id, listing_id, created_at)         -- composite PK
follows       (follower_id, following_id)               -- composite PK
conversations (id, listing_id, buyer_id, seller_id, last_message_at)
messages      (id, conversation_id, sender_id, content, created_at)
reviews       (id, reviewer_id, seller_id, rating, comment, created_at)
reports       (id, reporter_id, target_type, target_id, reason, created_at)
```

### Critical requirements

- [ ] **RLS enabled on every table** — non-negotiable. Test with `set role authenticated`
- [ ] Indexes:
  - `listings(category, gender, is_sold)`
  - `listings(seller_id)`
  - `listings(created_at desc) where is_sold = false`
  - `messages(conversation_id, created_at)`
  - `favorites(user_id)`
- [ ] Enable `pg_trgm` extension for brand/title fuzzy search
- [ ] Add `tsvector` column on listings (auto-updated via trigger) for full-text search
- [ ] Set up Supabase Auth (email + OAuth) and replace mock `app/auth/login.tsx`
- [ ] Database trigger: auto-create `profiles` row on `auth.users` insert

---

## Phase 2 — Wire Frontend to Real Data (1–2 weeks)

- [ ] Install `@supabase/supabase-js`, create `lib/supabase.ts` with AsyncStorage session adapter
- [ ] Add **TanStack Query** (`@tanstack/react-query`) — caching, retries, optimistic updates
- [ ] Use **Supabase `range()` pagination**, NOT offset — performant at scale
- [ ] Replace every `MOCK_LISTINGS` reference. Touch points:
  - [ ] `app/(tabs)/index.tsx` — paginated feed with infinite scroll
  - [ ] `app/product/[id].tsx` — listing + member's items + similar items (3 separate queries)
  - [ ] `app/(tabs)/profile.tsx`
  - [ ] `app/user/[id].tsx`
  - [ ] `app/(tabs)/upload.tsx` — listing creation flow
  - [ ] `app/(tabs)/chat.tsx`
  - [ ] `app/conversation/[id].tsx`
  - [ ] `app/conversation/new.tsx`
- [ ] Implement optimistic updates for likes / favorites
- [ ] Error boundaries around every screen

---

## Phase 3 — Image Pipeline (3–4 days)

- [ ] Create Supabase Storage bucket `listing-images` (public read, authenticated write)
- [ ] Client-side compression: `expo-image-manipulator` → max 1600px, JPEG quality 80, before upload
- [ ] Use **Supabase image transformation URLs** (`?width=600`) instead of generating variants manually — saves an Edge Function
- [ ] Three render sizes:
  - thumbnail: 200px (chat preview, search results)
  - feed: 600px (home cards, grids)
  - full: 1600px (product detail carousel)
- [ ] Already configured `cachePolicy="memory-disk"` on `expo-image` ✓
- [ ] Add upload progress UI + retry on failure
- [ ] Storage RLS: only listing owner can upload to their listing folder

---

## Phase 4 — Realtime Chat (3–4 days)

- [ ] Supabase Realtime channel per conversation: `realtime:conversation:${id}`
- [ ] Subscribe to Postgres changes on `messages` filtered by `conversation_id`
- [ ] Mark-as-read state per user
- [ ] Push notifications via **Expo Notifications**
- [ ] Edge Function trigger on new message → push to recipient
- [ ] Presence channel for "online now" indicators (optional v1.1)
- [ ] Image messages: upload to Storage first, send URL as message content

---

## Phase 5 — Payments + Trust (1–2 weeks)

> Biggest legal/risk surface. Allocate buffer time.

- [ ] **Stripe Connect** (Express accounts) — sellers onboard, you take platform fee
- [ ] Escrow flow: charge buyer → hold funds → release on delivery confirmation
- [ ] Webhook Edge Function: handle `payment_intent.succeeded`, `charge.refunded`, `transfer.created`
- [ ] New table:
  ```sql
  orders (id, listing_id, buyer_id, seller_id, amount, platform_fee,
          shipping_cost, status, stripe_pi_id, created_at, completed_at)
  ```
- [ ] Order states: `pending → paid → shipped → delivered → completed | disputed | refunded`
- [ ] KYC for sellers above transaction thresholds (Stripe handles this)
- [ ] Buyer protection policy + dispute resolution UI
- [ ] Refund flow with reason codes
- [ ] Hook up "Buy now" + "Make an offer" buttons in `app/product/[id].tsx`

---

## Phase 6 — Search + Discovery (3–5 days)

> At 2–3K users **Postgres is enough**. Skip Algolia/Meilisearch initially. Revisit if p95 search > 300ms.

- [ ] `tsvector` GIN index on `title || brand || description`
- [ ] Faceted filters: category, size, price range, condition, gender, brand
- [ ] Trending feed: **materialized view** refreshed every 15 min via `pg_cron`
  - Sort by `views_24h + likes_24h*3 + saves_24h*5`
- [ ] Recently viewed (client-side, AsyncStorage)
- [ ] "Similar items" query: same category + brand + size, ordered by created_at
- [ ] "Member's items" query: same seller, exclude current listing, exclude sold

---

## Phase 7 — Observability (2 days)

- [ ] **Sentry** for crashes + errors (already installed in Phase 0)
- [ ] Supabase logs + slow query log enabled
- [ ] **PostHog** or Mixpanel free tier for product analytics
- [ ] Uptime monitoring: BetterStack free tier
- [ ] Alerting rules:
  - error rate spike (> 1% of requests)
  - p95 query latency > 500ms
  - auth failures > 10/min
  - Stripe webhook failures
- [ ] Custom dashboard: DAU, MAU, listings created, GMV, conversion rate

---

## Phase 8 — App Store Launch Prep (1–2 weeks)

- [ ] EAS Build for iOS + Android, EAS Submit configured
- [ ] **iOS App Store**:
  - Screenshots (6.7", 6.5", 5.5", 12.9" iPad)
  - Privacy policy URL
  - App Privacy questionnaire (mandatory — list every data type collected)
  - App Review Guidelines compliance check
- [ ] **Google Play**:
  - Data Safety form
  - Content rating questionnaire
  - Target API level current
- [ ] **Required legal pages** (host on a marketing site):
  - Terms of Service
  - Privacy Policy
  - Cookie Policy
  - Returns / Refunds Policy
  - Seller Agreement
- [ ] **GDPR compliance**:
  - Data export endpoint (Supabase RPC function)
  - Account deletion endpoint with cascade
  - Cookie consent
- [ ] **TestFlight** beta + Google Play Internal Track — minimum 2 weeks of real-user testing
- [ ] Crash-free rate target: > 99.5% before public launch

---

## Phase 9 — Scale Hardening (ongoing)

> At 2–3K peak you barely need most of this. Implement reactively, not preemptively.

- [ ] Use **Supabase pgbouncer** transaction mode (`?pgbouncer=true`) for any serverless functions
- [ ] CDN: Supabase Storage already on Cloudflare — done
- [ ] **Rate limiting** at Edge Function layer, keyed by `auth.uid`:
  - listing creation: 10/hour
  - messages: 60/min
  - image upload: 50/hour
  - sign-up: 5/IP/hour
- [ ] Add database read replica only if p95 query latency > 200ms
- [ ] Daily backups (Supabase Pro includes them) + monthly restore drills
- [ ] Connection pool monitoring

---

## Suggested Order if Solo

| Week  | Focus                              |
| ----- | ---------------------------------- |
| 1–2   | Phase 0–1 (foundations + schema)   |
| 3–5   | Phase 2 (replace all mocks)        |
| 6     | Phase 3 (images)                   |
| 7     | Phase 4 (chat)                     |
| 8–9   | Phase 5 (payments)                 |
| 10    | Phase 6–7 (search + observability) |
| 11–12 | Phase 8 (launch prep + beta)       |

**Total time-to-launch: ~12 weeks of solo full-time work.**

---

## Tech Stack Summary

| Layer         | Choice                                                 |
| ------------- | ------------------------------------------------------ |
| Mobile        | Expo SDK + Expo Router (current)                       |
| State / cache | TanStack Query                                         |
| Backend       | Supabase (Postgres, Auth, Storage, Realtime, Edge Fns) |
| Payments      | Stripe Connect Express                                 |
| Push          | Expo Notifications                                     |
| Errors        | Sentry                                                 |
| Analytics     | PostHog                                                |
| Uptime        | BetterStack                                            |
| CI/CD         | GitHub Actions + EAS Build                             |
| Image hosting | Supabase Storage (Cloudflare CDN)                      |

---

## Risks + Mitigations

| Risk                                  | Mitigation                                              |
| ------------------------------------- | ------------------------------------------------------- |
| RLS misconfiguration leaks user data  | Write policy tests; use Supabase CLI `db diff` in CI    |
| Stripe webhook missed → orphan orders | Idempotency keys + replay log + webhook signing verify  |
| Image storage cost runaway            | Compress client-side; lifecycle delete sold > 6mo       |
| Spam listings / fake accounts         | Phone verification on listing #3+; manual review queue  |
| Chargebacks                           | Buyer protection escrow; require photo on dispute       |
| App Store rejection                   | Submit beta early; have legal pages ready before review |
