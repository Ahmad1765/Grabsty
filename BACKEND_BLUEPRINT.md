# Grabsty — Backend Architecture Blueprint

> Stack: Expo Router (React Native) + Supabase (PostgreSQL + Auth + Storage + Realtime + Edge Functions)
> Date: 2026-04-19 | Author: Architecture Plan

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Backend Structure](#2-backend-structure)
3. [Database Design](#3-database-design)
4. [API Design](#4-api-design)
5. [Development Phases](#5-development-phases)
6. [Core Logic Design](#6-core-logic-design)
7. [Critical Systems](#7-critical-systems)
8. [Security & Validation](#8-security--validation)
9. [Testing Strategy](#9-testing-strategy)
10. [Deployment Plan](#10-deployment-plan)
11. [Performance & Scaling Plan](#11-performance--scaling-plan)
12. [Risk Analysis](#12-risk-analysis)

---

## 1. System Architecture

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     GRABSTY MOBILE APP                           │
│              (Expo Router + React Native + NativeWind)           │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS / WSS
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                        SUPABASE PLATFORM                         │
│                                                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────────┐ │
│  │  Auth       │  │  PostgREST  │  │   Edge Functions (Deno)  │ │
│  │  (JWT/OTP)  │  │  (REST API) │  │   - feed-ranking         │ │
│  └─────────────┘  └─────────────┘  │   - offer-processor      │ │
│                                     │   - order-lifecycle      │ │
│  ┌─────────────┐  ┌─────────────┐  │   - notification-fanout  │ │
│  │  Realtime   │  │  Storage    │  │   - image-pipeline       │ │
│  │  (WS/WSS)   │  │  (S3-compat)│  │   - fraud-detector       │ │
│  │  - messages │  │  - images   │  └──────────────────────────┘ │
│  │  - notifs   │  └─────────────┘                               │
│  └─────────────┘                                                  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │              PostgreSQL 15 (Primary Database)                ││
│  │   RLS on every table · pg_cron for scheduled jobs           ││
│  └──────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                             │
                    ┌────────┴────────┐
                    ▼                 ▼
          ┌──────────────┐   ┌──────────────┐
          │  Supabase    │   │  External    │
          │  Dashboard   │   │  Services    │
          │  (Admin UI)  │   │  - SMTP      │
          └──────────────┘   │  - SMS OTP   │
                             └──────────────┘
```

### 1.2 Tech Stack

| Layer          | Technology                                 | Justification                                               |
| -------------- | ------------------------------------------ | ----------------------------------------------------------- |
| Database       | PostgreSQL 15 (Supabase)                   | Already integrated. JSONB, full-text search, RLS, pg_cron   |
| Auth           | Supabase Auth                              | Email + Phone OTP built-in. JWT + refresh tokens out of box |
| REST API       | PostgREST (auto-generated)                 | Zero-config CRUD from DB schema                             |
| Custom Logic   | Supabase Edge Functions (Deno/TypeScript)  | Feed ranking, offer logic, notifications                    |
| Realtime       | Supabase Realtime                          | WebSocket subscriptions for chat + notifications            |
| File Storage   | Supabase Storage                           | S3-compatible, CDN-backed, image transformations built-in   |
| Scheduled Jobs | pg_cron + Edge Functions                   | Offer expiry, feed score refresh                            |
| Admin Panel    | Supabase Dashboard + custom Edge Functions | User management, moderation                                 |

### 1.3 Monolith vs Microservices Decision

**Decision: Modular Monolith on Supabase**

Reasoning:

- Team size and current stage don't justify microservices overhead
- Supabase handles infrastructure separation (auth, storage, realtime) natively
- Edge Functions provide isolation for complex business logic without separate services
- Single PostgreSQL instance with proper indexing handles all workload at this scale
- Migrate to microservices only when a specific module becomes a bottleneck (>10k DAU)

---

## 2. Backend Structure

### 2.1 Supabase Edge Functions Folder Structure

```
supabase/
├── schema.sql                    # Main DB schema (extend existing)
├── migrations/                   # Versioned migrations
│   ├── 001_initial.sql
│   ├── 002_add_follows.sql
│   ├── 003_add_offers_orders.sql
│   ├── 004_add_notifications.sql
│   ├── 005_add_reports.sql
│   ├── 006_add_feed_scores.sql
│   └── 007_add_admin.sql
├── functions/
│   ├── feed/
│   │   └── index.ts              # Feed ranking + pagination
│   ├── offer-action/
│   │   └── index.ts              # Accept/reject/counter offer
│   ├── buy-now/
│   │   └── index.ts              # Instant purchase → order creation
│   ├── image-upload/
│   │   └── index.ts              # Signed URL generation + compression trigger
│   ├── notification-send/
│   │   └── index.ts              # Fan-out notification delivery
│   ├── refresh-feed-scores/
│   │   └── index.ts              # Scheduled score refresh (pg_cron)
│   ├── expire-offers/
│   │   └── index.ts              # Mark expired offers (pg_cron)
│   ├── admin-action/
│   │   └── index.ts              # Ban/suspend/verify/moderate
│   └── report-listing/
│       └── index.ts              # Submit + process report
└── seed.sql                      # Dev seed data
```

### 2.2 Module Responsibilities

| Module                | Responsibility                                                      |
| --------------------- | ------------------------------------------------------------------- |
| `feed`                | Compute ranked feed using score formula, cursor pagination          |
| `offer-action`        | State machine: pending→accepted/rejected/countered + order creation |
| `buy-now`             | Validate availability, deduct quantity, create order atomically     |
| `image-upload`        | Generate signed upload URLs, validate MIME/size limits              |
| `notification-send`   | Write to notifications table + push via Realtime channel            |
| `refresh-feed-scores` | Recalculate `listing_feed_scores` every 30 min via pg_cron          |
| `expire-offers`       | Mark offers past expiry as 'expired' every 5 min                    |
| `admin-action`        | Privileged mutations: ban, verify, remove listing, adjust fees      |
| `report-listing`      | Create report, auto-flag if threshold exceeded                      |

---

## 3. Database Design

### 3.1 Complete Schema (all tables)

#### profiles (extend existing)

```sql
create table public.profiles (
  id              uuid references auth.users(id) on delete cascade primary key,
  username        text unique not null,
  full_name       text,
  avatar_url      text,
  bio             text,
  location        text,
  location_lat    float,
  location_lng    float,
  is_verified     boolean default false,        -- seller badge (admin-set)
  is_banned       boolean default false,
  is_suspended    boolean default false,
  suspended_until timestamptz,
  rating          numeric(3,2) default 0,
  total_sales     integer default 0,
  total_reviews   integer default 0,
  follower_count  integer default 0,            -- denormalized counter
  following_count integer default 0,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
-- Indexes
create index profiles_username_idx on public.profiles(username);
create index profiles_created_at_idx on public.profiles(created_at desc);
```

#### listings (extend existing)

```sql
create table public.listings (
  id              uuid default gen_random_uuid() primary key,
  seller_id       uuid references public.profiles(id) on delete cascade not null,
  title           text not null,
  description     text,
  price           integer not null,             -- USD
  original_price  integer,                      -- for price_drop detection
  category        text not null,
  subcategory     text,
  gender          text not null default 'all',
  brand           text,
  size            text,
  condition       text not null,
  images          text[] not null default '{}', -- ordered array of storage URLs
  quantity        integer default 1,
  allow_offers    boolean default true,
  status          text default 'pending'        -- 'draft','pending','live','sold','removed'
                  check (status in ('draft','pending','live','sold','removed')),
  is_boosted      boolean default false,
  boost_expires_at timestamptz,
  location        text,
  location_lat    float,
  location_lng    float,
  views           integer default 0,
  likes_count     integer default 0,            -- denormalized
  offers_count    integer default 0,            -- denormalized
  feed_score      float default 0,              -- precomputed score
  score_updated_at timestamptz default now(),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
-- Indexes
create index listings_seller_idx on public.listings(seller_id);
create index listings_status_idx on public.listings(status);
create index listings_category_idx on public.listings(category, status);
create index listings_feed_score_idx on public.listings(feed_score desc) where status = 'live';
create index listings_created_at_idx on public.listings(created_at desc);
create index listings_price_idx on public.listings(price);
-- Full text search
alter table public.listings add column search_vector tsvector
  generated always as (
    to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,'') || ' ' || coalesce(brand,''))
  ) stored;
create index listings_search_idx on public.listings using gin(search_vector);
```

#### follows

```sql
create table public.follows (
  follower_id  uuid references public.profiles(id) on delete cascade,
  following_id uuid references public.profiles(id) on delete cascade,
  created_at   timestamptz default now(),
  primary key (follower_id, following_id),
  check (follower_id != following_id)
);
create index follows_following_idx on public.follows(following_id);
create index follows_follower_idx on public.follows(follower_id);
```

#### listing_likes (extend existing)

```sql
create table public.listing_likes (
  user_id    uuid references public.profiles(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, listing_id)
);
create index listing_likes_listing_idx on public.listing_likes(listing_id);
```

#### listing_views

```sql
create table public.listing_views (
  id         bigserial primary key,
  user_id    uuid references public.profiles(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete cascade,
  viewed_at  timestamptz default now()
);
create index listing_views_user_idx on public.listing_views(user_id, viewed_at desc);
create index listing_views_listing_idx on public.listing_views(listing_id);
-- Deduplicate: only keep latest per user-listing pair (cleanup via pg_cron)
```

#### conversations (extend existing)

```sql
create table public.conversations (
  id           uuid default gen_random_uuid() primary key,
  listing_id   uuid references public.listings(id) on delete set null,
  buyer_id     uuid references public.profiles(id) on delete cascade not null,
  seller_id    uuid references public.profiles(id) on delete cascade not null,
  last_message text,
  last_message_at timestamptz,
  unread_buyer    integer default 0,
  unread_seller   integer default 0,
  updated_at   timestamptz default now(),
  unique (listing_id, buyer_id)
);
create index conversations_buyer_idx on public.conversations(buyer_id, updated_at desc);
create index conversations_seller_idx on public.conversations(seller_id, updated_at desc);
```

#### messages (extend existing)

```sql
create table public.messages (
  id              uuid default gen_random_uuid() primary key,
  conversation_id uuid references public.conversations(id) on delete cascade not null,
  sender_id       uuid references public.profiles(id) on delete cascade not null,
  content         text,
  message_type    text default 'text'
                  check (message_type in ('text','offer','system')),
  offer_id        uuid,                         -- FK to offers if message_type='offer'
  is_read         boolean default false,
  created_at      timestamptz default now()
);
create index messages_conversation_idx on public.messages(conversation_id, created_at asc);
```

#### offers

```sql
create table public.offers (
  id              uuid default gen_random_uuid() primary key,
  listing_id      uuid references public.listings(id) on delete cascade not null,
  conversation_id uuid references public.conversations(id) on delete cascade not null,
  buyer_id        uuid references public.profiles(id) on delete cascade not null,
  seller_id       uuid references public.profiles(id) on delete cascade not null,
  amount          integer not null,             -- USD
  status          text default 'pending'
                  check (status in ('pending','accepted','rejected','countered','expired','cancelled')),
  counter_amount  integer,                      -- if seller counters
  expires_at      timestamptz not null,         -- 48hr from creation
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index offers_listing_idx on public.offers(listing_id);
create index offers_buyer_idx on public.offers(buyer_id);
create index offers_status_idx on public.offers(status, expires_at) where status = 'pending';
```

#### orders

```sql
create table public.orders (
  id              uuid default gen_random_uuid() primary key,
  listing_id      uuid references public.listings(id) on delete set null,
  offer_id        uuid references public.offers(id) on delete set null,
  buyer_id        uuid references public.profiles(id) on delete cascade not null,
  seller_id       uuid references public.profiles(id) on delete cascade not null,
  item_price      integer not null,             -- USD
  service_fee     integer not null,             -- computed at time of order
  total_amount    integer not null,             -- item_price + service_fee
  service_fee_pct numeric(5,2) not null,        -- fee % snapshot
  status          text default 'pending'
                  check (status in ('pending','accepted','shipped','delivered','cancelled')),
  shipping_carrier text,
  tracking_number  text,
  notes            text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index orders_buyer_idx on public.orders(buyer_id, created_at desc);
create index orders_seller_idx on public.orders(seller_id, created_at desc);
create index orders_status_idx on public.orders(status);
```

#### order_timeline

```sql
create table public.order_timeline (
  id         bigserial primary key,
  order_id   uuid references public.orders(id) on delete cascade not null,
  status     text not null,
  note       text,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);
create index order_timeline_order_idx on public.order_timeline(order_id, created_at asc);
```

#### reviews

```sql
create table public.reviews (
  id          uuid default gen_random_uuid() primary key,
  order_id    uuid references public.orders(id) on delete cascade unique not null,
  reviewer_id uuid references public.profiles(id) on delete cascade not null,
  reviewed_id uuid references public.profiles(id) on delete cascade not null,
  rating      smallint not null check (rating between 1 and 5),
  comment     text,
  created_at  timestamptz default now()
);
create index reviews_reviewed_idx on public.reviews(reviewed_id);
```

#### notifications

```sql
create table public.notifications (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid references public.profiles(id) on delete cascade not null,
  type       text not null,
  -- types: new_follower, new_offer, offer_accepted, offer_rejected, offer_countered,
  --        order_update, new_message, price_drop, listing_liked, listing_approved
  title      text not null,
  body       text,
  data       jsonb,                             -- {listing_id, order_id, offer_id, etc.}
  is_read    boolean default false,
  created_at timestamptz default now()
);
create index notifications_user_idx on public.notifications(user_id, created_at desc);
create index notifications_unread_idx on public.notifications(user_id, is_read) where is_read = false;
```

#### reports

```sql
create table public.reports (
  id           uuid default gen_random_uuid() primary key,
  reporter_id  uuid references public.profiles(id) on delete cascade not null,
  listing_id   uuid references public.listings(id) on delete cascade,
  reported_user_id uuid references public.profiles(id) on delete cascade,
  reason       text not null
               check (reason in ('spam','fake','inappropriate','counterfeit','other')),
  details      text,
  status       text default 'open'
               check (status in ('open','reviewed','resolved','dismissed')),
  admin_note   text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);
create index reports_status_idx on public.reports(status, created_at desc);
create index reports_listing_idx on public.reports(listing_id);
```

#### app_config (admin-controlled settings)

```sql
create table public.app_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz default now()
);
-- Seed defaults
insert into public.app_config values
  ('service_fee_pct', '5.0', now()),
  ('offer_expiry_hours', '48', now()),
  ('max_images_per_listing', '8', now()),
  ('boost_duration_hours', '72', now());
```

#### listing_feed_scores (precomputed for feed performance)

```sql
create table public.listing_feed_scores (
  listing_id   uuid references public.listings(id) on delete cascade primary key,
  base_score   float not null default 0,
  freshness    float not null default 0,
  engagement   float not null default 0,
  price_drop   float not null default 0,
  total_score  float not null default 0,
  computed_at  timestamptz default now()
);
create index lfs_total_score_idx on public.listing_feed_scores(total_score desc);
```

### 3.2 Relationships Map

```
auth.users ←── profiles (1:1)
profiles ←──── listings (1:many)
profiles ←──── follows (many:many via follower_id/following_id)
listings ←──── listing_likes (many:many via user_id/listing_id)
listings ←──── listing_views (1:many)
listings ←──── offers (1:many)
listings ←──── conversations (1:many, unique per buyer)
conversations ─ messages (1:many)
offers ────────── messages (offer message links back to offer)
offers ────────── orders (1:1, offer→order on accept)
listings ───── orders (1:1 for buy-now)
orders ────── order_timeline (1:many)
orders ────── reviews (1:1)
profiles ←── notifications (1:many)
profiles ←── reports (1:many reporter)
listings ←── reports (1:many)
listings ←── listing_feed_scores (1:1)
```

### 3.3 Indexing Strategy

- **Feed**: `listing_feed_scores(total_score desc)` + `listings(status)` partial index
- **Search**: GIN index on `search_vector` tsvector column
- **Messaging**: `messages(conversation_id, created_at asc)` for ordered chat
- **Notifications**: Partial index on `is_read = false` for unread count efficiency
- **Orders**: Composite on `(seller_id, status)` for seller dashboard filters
- **Follows**: Both directions indexed for feed queries and profile pages

### 3.4 Scaling Considerations

- Denormalize `follower_count`, `following_count`, `likes_count` to avoid COUNT queries
- Use triggers to maintain denormalized counters atomically
- `listing_feed_scores` separates heavy computation from read path
- `listing_views` purge duplicates older than 30 days via pg_cron
- Enable `pg_partitioning` on `notifications` and `listing_views` if rows exceed 10M

---

## 4. API Design

### 4.1 Authentication Endpoints (Supabase Auth built-in)

| Method | Endpoint                                  | Auth | Description               |
| ------ | ----------------------------------------- | ---- | ------------------------- |
| POST   | `/auth/v1/otp`                            | None | Send OTP (email or phone) |
| POST   | `/auth/v1/verify`                         | None | Verify OTP → JWT          |
| POST   | `/auth/v1/token?grant_type=refresh_token` | None | Refresh access token      |
| POST   | `/auth/v1/logout`                         | JWT  | Invalidate session        |

**OTP Request:**

```json
{ "email": "user@example.com" }
// or
{ "phone": "+923001234567" }
```

**OTP Verify Response:**

```json
{
  "access_token": "eyJ...",
  "refresh_token": "...",
  "expires_in": 3600,
  "user": { "id": "uuid", "email": "..." }
}
```

### 4.2 Profile Endpoints (PostgREST + RPC)

| Method | Path                                                               | Auth     | Description                 |
| ------ | ------------------------------------------------------------------ | -------- | --------------------------- |
| GET    | `/rest/v1/profiles?id=eq.{id}`                                     | Optional | Get profile by ID           |
| GET    | `/rest/v1/profiles?username=eq.{username}`                         | Optional | Get by username             |
| PATCH  | `/rest/v1/profiles?id=eq.{me}`                                     | JWT      | Update own profile          |
| POST   | `/rest/v1/rpc/complete_onboarding`                                 | JWT      | Set username on first login |
| GET    | `/rest/v1/profiles?select=*,followers:follows!following_id(count)` | Optional | Profile + follower count    |

**Update Profile Request:**

```json
{
  "full_name": "Ahmad Ali",
  "bio": "Selling quality stuff",
  "location": "Karachi",
  "avatar_url": "https://storage.../avatar.jpg"
}
```

### 4.3 Listings Endpoints

| Method | Path                                                           | Auth     | Description                   |
| ------ | -------------------------------------------------------------- | -------- | ----------------------------- |
| GET    | `/rest/v1/listings?status=eq.live&select=*,seller:profiles(*)` | Optional | Browse listings               |
| GET    | `/rest/v1/listings?id=eq.{id}&select=*,seller:profiles(*)`     | Optional | Single listing                |
| GET    | `/rest/v1/listings?seller_id=eq.{id}`                          | Optional | Seller's listings             |
| POST   | `/rest/v1/listings`                                            | JWT      | Create listing (status=draft) |
| PATCH  | `/rest/v1/listings?id=eq.{id}`                                 | JWT      | Edit listing                  |
| DELETE | `/rest/v1/listings?id=eq.{id}`                                 | JWT      | Delete listing                |
| POST   | `/rest/v1/rpc/publish_listing`                                 | JWT      | Draft → pending → live        |
| POST   | `/rest/v1/rpc/increment_views`                                 | Optional | Increment view count          |

**Create Listing Request:**

```json
{
  "title": "Zara Midi Dress",
  "description": "Excellent condition...",
  "price": 2500,
  "category": "clothing",
  "subcategory": "dresses",
  "gender": "women",
  "brand": "Zara",
  "size": "S",
  "condition": "like_new",
  "images": ["url1", "url2"],
  "quantity": 1,
  "allow_offers": true,
  "location": "Karachi",
  "status": "draft"
}
```

**Response (201):**

```json
{
  "id": "uuid",
  "status": "draft",
  "created_at": "2026-04-19T10:00:00Z",
  ...fields
}
```

### 4.4 Feed Endpoint (Edge Function)

| Method | Path                 | Auth         | Description                        |
| ------ | -------------------- | ------------ | ---------------------------------- |
| GET    | `/functions/v1/feed` | Optional/JWT | Ranked feed with cursor pagination |

**Request Query Params:**

```
GET /functions/v1/feed?cursor=<last_score>&limit=20&category=clothing&gender=women
```

**Response:**

```json
{
  "listings": [
    {
      "id": "uuid",
      "title": "...",
      "price": 2500,
      "images": ["url1"],
      "seller": { "id": "...", "username": "sara", "avatar_url": "..." },
      "score": 87.3,
      "feed_signals": { "followed_seller": true, "price_dropped": false }
    }
  ],
  "next_cursor": 65.1,
  "has_more": true
}
```

### 4.5 Social (Follow) Endpoints

| Method | Path                                                                | Auth     | Description         |
| ------ | ------------------------------------------------------------------- | -------- | ------------------- |
| POST   | `/rest/v1/follows`                                                  | JWT      | Follow user         |
| DELETE | `/rest/v1/follows?follower_id=eq.{me}&following_id=eq.{id}`         | JWT      | Unfollow            |
| GET    | `/rest/v1/follows?follower_id=eq.{id}&select=following:profiles(*)` | Optional | Following list      |
| GET    | `/rest/v1/follows?following_id=eq.{id}&select=follower:profiles(*)` | Optional | Followers list      |
| GET    | `/rest/v1/rpc/is_following`                                         | JWT      | Check follow status |

### 4.6 Messaging Endpoints

| Method | Path                                                             | Auth | Description                      |
| ------ | ---------------------------------------------------------------- | ---- | -------------------------------- |
| GET    | `/rest/v1/conversations?or=(buyer_id.eq.{me},seller_id.eq.{me})` | JWT  | My conversations                 |
| POST   | `/rest/v1/conversations`                                         | JWT  | Start conversation               |
| GET    | `/rest/v1/messages?conversation_id=eq.{id}&order=created_at.asc` | JWT  | Load messages                    |
| POST   | `/rest/v1/messages`                                              | JWT  | Send text message                |
| POST   | `/functions/v1/offer-action`                                     | JWT  | Make/accept/reject/counter offer |
| PATCH  | `/rest/v1/messages?conversation_id=eq.{id}&sender_id=neq.{me}`   | JWT  | Mark as read                     |

**Make Offer Request:**

```json
{
  "action": "make",
  "conversation_id": "uuid",
  "listing_id": "uuid",
  "amount": 2000
}
```

**Counter Offer Request:**

```json
{
  "action": "counter",
  "offer_id": "uuid",
  "amount": 2200
}
```

**Accept/Reject:**

```json
{
  "action": "accept",
  "offer_id": "uuid"
}
```

### 4.7 Commerce Endpoints

| Method | Path                                | Auth | Description               |
| ------ | ----------------------------------- | ---- | ------------------------- |
| POST   | `/functions/v1/buy-now`             | JWT  | Instant purchase          |
| GET    | `/rest/v1/orders?buyer_id=eq.{me}`  | JWT  | Buyer order history       |
| GET    | `/rest/v1/orders?seller_id=eq.{me}` | JWT  | Seller order history      |
| PATCH  | `/functions/v1/order-update`        | JWT  | Ship/deliver/cancel order |
| POST   | `/rest/v1/reviews`                  | JWT  | Leave review              |

**Buy Now Request:**

```json
{ "listing_id": "uuid" }
```

**Buy Now Response:**

```json
{
  "order_id": "uuid",
  "item_price": 2500,
  "service_fee": 125,
  "total": 2625,
  "status": "pending"
}
```

**Order Update (seller ships):**

```json
{
  "order_id": "uuid",
  "action": "ship",
  "shipping_carrier": "TCS",
  "tracking_number": "TCS123456"
}
```

### 4.8 Engagement Endpoints

| Method | Path                                                                                     | Auth     | Description       |
| ------ | ---------------------------------------------------------------------------------------- | -------- | ----------------- |
| POST   | `/rest/v1/listing_likes`                                                                 | JWT      | Like/save listing |
| DELETE | `/rest/v1/listing_likes?user_id=eq.{me}&listing_id=eq.{id}`                              | JWT      | Unlike            |
| GET    | `/rest/v1/listing_likes?user_id=eq.{me}&select=listing:listings(*)`                      | JWT      | Wishlist          |
| POST   | `/rest/v1/listing_views`                                                                 | Optional | Track view        |
| GET    | `/rest/v1/listing_views?user_id=eq.{me}&select=listing:listings(*)&order=viewed_at.desc` | JWT      | Recently viewed   |

### 4.9 Notifications Endpoints

| Method | Path                                                           | Auth | Description               |
| ------ | -------------------------------------------------------------- | ---- | ------------------------- |
| GET    | `/rest/v1/notifications?user_id=eq.{me}&order=created_at.desc` | JWT  | All notifications         |
| GET    | `/rest/v1/rpc/get_unread_count`                                | JWT  | Unread notification count |
| POST   | `/rest/v1/rpc/mark_notifications_read`                         | JWT  | Mark all/specific as read |

### 4.10 Admin Endpoints (Edge Function, admin JWT required)

| Method | Path                                         | Auth      | Description                 |
| ------ | -------------------------------------------- | --------- | --------------------------- |
| POST   | `/functions/v1/admin-action`                 | Admin JWT | Ban/suspend/verify/moderate |
| GET    | `/rest/v1/rpc/admin_dashboard_stats`         | Admin JWT | GMV, users, listings counts |
| GET    | `/rest/v1/reports?status=eq.open`            | Admin JWT | Open reports queue          |
| PATCH  | `/rest/v1/reports?id=eq.{id}`                | Admin JWT | Resolve/dismiss report      |
| PATCH  | `/rest/v1/app_config?key=eq.service_fee_pct` | Admin JWT | Change fee                  |

**Admin Action Request:**

```json
{
  "action": "ban", // ban | suspend | verify | remove_listing | remove_followers
  "target_id": "uuid",
  "target_type": "user", // user | listing
  "reason": "Fraud detected",
  "suspend_until": "2026-05-01T00:00:00Z" // only for suspend
}
```

### 4.11 Error Handling Strategy

All Edge Functions return consistent errors:

```json
{
  "error": {
    "code": "OFFER_EXPIRED",
    "message": "This offer has expired",
    "status": 400
  }
}
```

Standard error codes:
| Code | HTTP | Meaning |
|------|------|---------|
| `UNAUTHORIZED` | 401 | Missing/invalid JWT |
| `FORBIDDEN` | 403 | Valid JWT but wrong permissions |
| `NOT_FOUND` | 404 | Resource doesn't exist |
| `CONFLICT` | 409 | e.g. conversation already exists |
| `VALIDATION_ERROR` | 422 | Bad input fields |
| `LISTING_SOLD` | 409 | Listing already sold |
| `OFFER_EXPIRED` | 400 | Offer past expiry |
| `RATE_LIMITED` | 429 | Too many requests |
| `SELF_ACTION` | 400 | Can't follow/offer yourself |

PostgREST errors bubble up automatically; Edge Functions must wrap in this format.

---

## 5. Development Phases

### Phase 1 — Foundation (Week 1-2)

**Goal: Auth + Profiles + Image Upload working end-to-end**

1. Run migration 001: profiles table with all new fields
2. Configure Supabase Auth (email OTP + phone OTP)
3. Write `complete_onboarding` RPC (set unique username on first login)
4. Deploy `image-upload` Edge Function (signed URL generation)
5. Create `listing-images` Storage bucket with 10MB limit, image/\* MIME
6. Set up all RLS policies for profiles
7. Test: register → set username → upload avatar → view profile

**Deliverables:** Auth flow, profile CRUD, avatar upload

---

### Phase 2 — Listings (Week 2-3)

**Goal: Full listing lifecycle working**

1. Migration 002: extend listings table (subcategory, quantity, allow_offers, status, boost, search_vector)
2. Implement `publish_listing` RPC (draft → pending → live)
3. Add `increment_views` RPC (debounced, upsert into listing_views)
4. Set all listing RLS policies
5. Test: create draft → upload images → publish → browse → search

**Deliverables:** Create/edit/delete listings, image upload pipeline, listing search

---

### Phase 3 — Feed & Discovery (Week 3-4)

**Goal: Ranked feed returning real data**

1. Migration 003: `listing_feed_scores` table
2. Write `refresh-feed-scores` Edge Function (score formula)
3. Deploy `feed` Edge Function (ranked + paginated)
4. Set up pg_cron: `refresh-feed-scores` every 30 min
5. Wire `increment_views` to update engagement score
6. Integrate feed endpoint in the existing frontend feed screen

**Deliverables:** Real ranked feed, category filter, cursor pagination

---

### Phase 4 — Social System (Week 4)

**Goal: Follow/unfollow + follower lists**

1. Migration 004: `follows` table + follower/following counter triggers
2. Add follow RLS policies
3. Implement `is_following` RPC
4. Integrate follow into user profile screen (already built)

**Deliverables:** Follow/unfollow, follower/following lists, feed prioritization for followed sellers

---

### Phase 5 — Messaging & Offers (Week 5-6)

**Goal: Real-time chat + offer flow working**

1. Extend `conversations` and `messages` tables (migration 005)
2. Create `offers` table
3. Deploy `offer-action` Edge Function (state machine)
4. Enable Supabase Realtime on messages + conversations tables
5. Deploy `expire-offers` Edge Function + pg_cron every 5 min
6. Test: message seller → make offer → counter → accept → order created

**Deliverables:** Chat, offer flow, real-time message delivery

---

### Phase 6 — Commerce & Orders (Week 6-7)

**Goal: Buy Now + Order lifecycle**

1. `orders` and `order_timeline` tables
2. Deploy `buy-now` Edge Function
3. `order-update` logic (ship/deliver/cancel with timeline entry)
4. Service fee computed from `app_config`
5. Seller/buyer order dashboard queries

**Deliverables:** Purchase flow, order tracking, seller dashboard

---

### Phase 7 — Trust, Notifications & Engagement (Week 7-8)

**Goal: Reviews, reports, notifications, wishlist**

1. `reviews` table + rating calculation trigger
2. `reports` table + auto-flag trigger (>3 reports → auto pending_review)
3. `notifications` table + `notification-send` Edge Function
4. Enable Realtime on notifications channel
5. Wishlist (listing_likes with full listing join) + recently viewed

**Deliverables:** Reviews, reports, push notifications, wishlist

---

### Phase 8 — Admin Panel (Week 8-9)

**Goal: Admin tooling functional**

1. `admin-action` Edge Function with role check
2. `admin_dashboard_stats` RPC (GMV, user counts, listing counts)
3. Reports queue + resolution flow
4. `app_config` CRUD for fee management
5. Remove fake followers function
6. Analytics export RPC (returns CSV-compatible JSON)

**Deliverables:** Full admin panel APIs

---

### Phase 9 — Hardening (Week 9-10)

**Goal: Rate limiting, fraud detection, performance**

1. Add rate limiting in Edge Functions (Redis via Upstash or pg-based counter)
2. Basic fraud detection triggers (price anomaly, rapid listing creation)
3. Cache hot listings in Edge Function memory (5-min TTL)
4. Load test with k6 (target: 100 concurrent users)
5. Fix N+1 queries, add missing indexes

**Deliverables:** Production-ready performance + security

---

## 6. Core Logic Design

### 6.1 Feed Ranking Algorithm

**Score Formula:**

```
total_score = followed_bonus + freshness_score + engagement_score + price_drop_bonus + boost_bonus
```

**Component Calculation:**

```typescript
// In refresh-feed-scores Edge Function

const FOLLOWED_BONUS = 50;
const MAX_FRESHNESS = 30;
const MAX_ENGAGEMENT = 20;
const PRICE_DROP_BONUS = 10;
const BOOST_BONUS = 25;

// Freshness: exponential decay over 7 days
// Score = 30 * e^(-λt) where λ = ln(2)/3 (half-life = 3 days)
function freshnessScore(createdAt: Date): number {
  const ageHours = (Date.now() - createdAt.getTime()) / 3600000;
  const ageDays = ageHours / 24;
  const lambda = Math.log(2) / 3; // half-life 3 days
  return MAX_FRESHNESS * Math.exp(-lambda * ageDays);
}

// Engagement: normalized by category average
function engagementScore(views: number, likes: number, offers: number): number {
  const raw = views * 0.1 + likes * 1.0 + offers * 3.0;
  return Math.min(MAX_ENGAGEMENT, raw / 10);
}

// Price drop: compare to original_price
function priceDrop(price: number, originalPrice: number | null): number {
  if (!originalPrice || price >= originalPrice) return 0;
  return PRICE_DROP_BONUS;
}
```

**Feed Query (inside `feed` Edge Function):**

```sql
SELECT
  l.*,
  lfs.total_score,
  lfs.total_score + CASE WHEN f.follower_id IS NOT NULL THEN 50 ELSE 0 END as personalized_score
FROM listings l
JOIN listing_feed_scores lfs ON lfs.listing_id = l.id
LEFT JOIN follows f ON f.following_id = l.seller_id AND f.follower_id = $user_id
WHERE l.status = 'live'
  AND ($cursor IS NULL OR lfs.total_score < $cursor)
  AND ($category IS NULL OR l.category = $category)
ORDER BY personalized_score DESC
LIMIT $limit;
```

**Refresh Schedule:** pg_cron every 30 minutes via `refresh-feed-scores`.
Newly published listings get an initial score immediately on publish.

### 6.2 Offer System State Machine

```
                    ┌─────────┐
                    │ pending │
                    └────┬────┘
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
     ┌──────────┐  ┌──────────┐  ┌──────────┐
     │ accepted │  │ rejected │  │countered │
     └────┬─────┘  └──────────┘  └────┬─────┘
          │                           │ (new offer from buyer)
          ▼                           ▼
     ┌──────────┐               ┌─────────┐
     │  ORDER   │               │ pending │ (buyer counter-offer)
     │ created  │               └─────────┘
     └──────────┘

Also: pending → expired (pg_cron at expiry time)
      pending → cancelled (buyer withdraws)
```

**Offer Rules:**

- Only 1 active offer per listing per buyer
- Seller can counter once (creates new offer, old → countered)
- Buyer must respond to counter within 48hr or it expires
- Accepted offer → `buy-now` function called with `offer_id`
- Offer amount must be ≥ 50% of listing price (configurable)

### 6.3 Order Lifecycle

```
buy-now / offer-accepted
         │
         ▼
      pending  ─── seller cancels ──► cancelled
         │
    seller accepts
         │
         ▼
      accepted  ─── buyer cancels ──► cancelled (within 2hr)
         │
    seller ships (enters tracking)
         │
         ▼
      shipped
         │
    buyer confirms / auto-confirm 7 days
         │
         ▼
      delivered ──► triggers review_eligibility flag
```

**On order delivered:**

1. `profiles.total_sales += 1` for seller
2. Notify buyer to leave review
3. Listing `status = 'sold'` if quantity reaches 0

### 6.4 Messaging Architecture

**Real-time Strategy:**

- Supabase Realtime Postgres Changes on `messages` table
- Client subscribes to `conversation:{id}` channel
- On new message: update `conversations.last_message` + `unread_{role}` counter via trigger
- Notifications channel: `notifications:user:{id}` for in-app alerts

**Subscription setup (client-side):**

```typescript
const channel = supabase
  .channel(`conversation:${conversationId}`)
  .on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "messages",
      filter: `conversation_id=eq.${conversationId}`,
    },
    handleNewMessage,
  )
  .subscribe();
```

**Unread Counter Logic (DB trigger):**

```sql
CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS trigger AS $$
BEGIN
  UPDATE public.conversations SET
    last_message = NEW.content,
    last_message_at = NEW.created_at,
    unread_buyer = CASE
      WHEN buyer_id != NEW.sender_id THEN unread_buyer + 1
      ELSE unread_buyer END,
    unread_seller = CASE
      WHEN seller_id != NEW.sender_id THEN unread_seller + 1
      ELSE unread_seller END,
    updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_message_insert
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION update_conversation_on_message();
```

---

## 7. Critical Systems

### 7.1 Image Upload Pipeline

```
Client                    Edge Function             Supabase Storage
  │                           │                          │
  │── POST /image-upload ────►│                          │
  │   { listing_id, count }   │                          │
  │                           │── createSignedUploadUrls►│
  │                           │◄── [signedUrl x N] ──────│
  │◄── { signed_urls[] } ─────│                          │
  │                           │                          │
  │── PUT signedUrl (image) ──────────────────────────►  │
  │   (directly from client)                             │
  │◄── 200 OK ───────────────────────────────────────── │
  │                           │                          │
  │── PATCH /listings/{id} ──►│                          │
  │   { images: [public_urls] }│                         │
```

**Image Pipeline Rules:**

- Max 8 images per listing (from `app_config.max_images_per_listing`)
- Allowed MIME: `image/jpeg`, `image/png`, `image/webp`
- Max file size: 10MB per image
- Supabase Storage Image Transformations: request `?width=800&quality=80` for display
- Storage path: `listing-images/{seller_id}/{listing_id}/{timestamp}.jpg`
- Avatars path: `avatars/{user_id}/{timestamp}.jpg`

**Signed URL Edge Function:**

```typescript
// supabase/functions/image-upload/index.ts
const { data } = await supabaseAdmin.storage
  .from("listing-images")
  .createSignedUploadUrl(`${sellerId}/${listingId}/${Date.now()}.jpg`);
```

### 7.2 Notification System

**Trigger points → notification events:**

| Event               | Notification Type  | Recipients         |
| ------------------- | ------------------ | ------------------ |
| New follower        | `new_follower`     | Seller             |
| Offer received      | `new_offer`        | Seller             |
| Offer accepted      | `offer_accepted`   | Buyer              |
| Offer rejected      | `offer_rejected`   | Buyer              |
| Offer countered     | `offer_countered`  | Buyer              |
| Order status change | `order_update`     | Both               |
| New message         | `new_message`      | Recipient          |
| Listing liked       | `listing_liked`    | Seller (batched)   |
| Price drop          | `price_drop`       | Users who liked it |
| Listing approved    | `listing_approved` | Seller             |

**Delivery via `notification-send` Edge Function:**

```typescript
// Called by other functions/triggers
async function sendNotification(userId: string, type: string, data: object) {
  // 1. Insert into notifications table
  await supabase
    .from("notifications")
    .insert({ user_id: userId, type, ...data });

  // 2. Broadcast via Realtime (in-app)
  await supabase.channel(`notifications:${userId}`).send({
    type: "broadcast",
    event: "notification",
    payload: data,
  });

  // 3. Future: push to Expo Push Notification service
  // await sendExpoPush(pushToken, title, body);
}
```

**Real-time vs Polling Decision:**
| Feature | Strategy | Reason |
|---------|----------|--------|
| Chat messages | Realtime (WebSocket) | Must be instant for UX |
| Notifications | Realtime (broadcast) | Instant badge update |
| Feed | Polling (pull-to-refresh) | Not time-critical, saves connections |
| Order status | Polling (30s) or Realtime | Realtime for active order view |
| Offer status | Realtime | User is waiting on response |

---

## 8. Security & Validation

### 8.1 Authentication Flow

```
1. User enters email/phone
2. POST /auth/v1/otp → Supabase sends OTP via email/SMS
3. User enters 6-digit OTP
4. POST /auth/v1/verify → Supabase validates, returns JWT + refresh token
5. Store access_token in expo-secure-store (NOT AsyncStorage)
6. Store refresh_token in expo-secure-store
7. All requests: Authorization: Bearer {access_token}
8. On 401: auto-refresh via /auth/v1/token?grant_type=refresh_token
9. On refresh failure: logout → back to login
```

**JWT Claims Structure:**

```json
{
  "sub": "user-uuid",
  "role": "authenticated",
  "app_metadata": { "is_admin": false },
  "exp": 1714500000
}
```

**Admin role check in Edge Functions:**

```typescript
const user = await supabaseAdmin.auth.getUser(token);
const { data: profile } = await supabaseAdmin
  .from("profiles")
  .select("is_admin")
  .eq("id", user.data.user.id)
  .single();
if (!profile?.is_admin) return errorResponse("FORBIDDEN", 403);
```

### 8.2 Row Level Security Policies (Critical ones)

```sql
-- Users can only read non-banned profiles
create policy "Hide banned users" on public.profiles
  for select using (is_banned = false OR auth.uid() = id);

-- Offers: only buyer/seller can see
create policy "Offer visibility" on public.offers
  for select using (auth.uid() = buyer_id OR auth.uid() = seller_id);

-- Notifications: strictly private
create policy "Private notifications" on public.notifications
  for select using (auth.uid() = user_id);

-- Orders: strictly buyer/seller
create policy "Order visibility" on public.orders
  for select using (auth.uid() = buyer_id OR auth.uid() = seller_id);
```

### 8.3 Input Validation (Edge Functions)

```typescript
// Shared validation library
function validateListing(body: unknown) {
  const schema = {
    title: { required: true, maxLength: 100 },
    price: { required: true, min: 1, max: 10_000_000 },
    category: { required: true, enum: VALID_CATEGORIES },
    condition: { required: true, enum: VALID_CONDITIONS },
    images: { required: true, minItems: 1, maxItems: 8 },
  };
  // validate and throw VALIDATION_ERROR if fails
}
```

### 8.4 Rate Limiting

Implement per-function rate limiting using a `rate_limits` table:

```sql
create table public.rate_limits (
  key        text primary key,          -- "func:user_id"
  count      integer default 0,
  window_start timestamptz default now()
);
```

| Endpoint       | Limit                  |
| -------------- | ---------------------- |
| OTP send       | 3/hour per phone/email |
| Create listing | 10/hour per user       |
| Make offer     | 20/hour per user       |
| Send message   | 60/min per user        |
| Like/unlike    | 100/hour per user      |
| Image upload   | 50/hour per user       |

### 8.5 Abuse Prevention

1. **Auto-flag listings**: 3+ reports → `status = 'pending_review'`
2. **Ban check**: Middleware in all Edge Functions checks `profiles.is_banned`
3. **Self-action prevention**: DB check constraints + Edge Function guards
4. **Offer floor**: Minimum offer = 50% of listing price
5. **Duplicate conversations**: `UNIQUE(listing_id, buyer_id)` prevents spam
6. **View deduplication**: Only count 1 view per user per listing per 24 hours

---

## 9. Testing Strategy

### 9.1 Unit Tests (Edge Functions)

Use Deno's built-in test runner:

```typescript
// supabase/functions/feed/feed.test.ts
Deno.test("freshnessScore: new listing scores max", () => {
  const score = freshnessScore(new Date());
  assertEquals(score, 30);
});

Deno.test("freshnessScore: 7 day old listing scores low", () => {
  const old = new Date(Date.now() - 7 * 24 * 3600000);
  const score = freshnessScore(old);
  assert(score < 5);
});

Deno.test("offerStateMachine: cannot accept expired offer", () => {
  const offer = { status: "expired", expires_at: past };
  assertThrows(() => acceptOffer(offer));
});
```

### 9.2 Integration Tests

Use `supabase test` with a local Supabase instance:

```bash
supabase start          # start local Supabase
supabase db reset       # apply all migrations + seed
deno test --allow-env   # run Edge Function tests
```

Key integration test flows:

- Register → onboard → create listing → publish → appears in feed
- Message seller → make offer → seller accepts → order created
- Buy now → seller ships → buyer confirms → review eligible
- Admin bans user → banned user's listings disappear from feed

### 9.3 End-to-End Flow Validation (Manual Checklist)

```
[ ] Auth
    [ ] Email OTP → receive email → verify → profile created
    [ ] Phone OTP → receive SMS → verify → profile created
    [ ] Refresh token works after access token expires
    [ ] Banned user gets FORBIDDEN on all mutations

[ ] Listings
    [ ] Create draft → upload 3 images → publish → appears in feed
    [ ] Edit listing price → price_drop score applied
    [ ] Delete listing → disappears from feed within 30min

[ ] Social
    [ ] Follow seller → their listings appear at top of feed
    [ ] Unfollow → listings drop in ranking

[ ] Messaging & Offers
    [ ] Send message → appears in real-time on other device
    [ ] Make offer → seller sees notification
    [ ] Counter offer → buyer sees updated offer
    [ ] Accept offer → order created → both notified

[ ] Commerce
    [ ] Buy Now → order created with correct fee
    [ ] Seller marks shipped → buyer notified
    [ ] Buyer confirms → seller total_sales increments
    [ ] Leave review → seller rating updates

[ ] Admin
    [ ] Ban user → listings removed, login blocked
    [ ] Change fee % → next order uses new fee
    [ ] Resolve report → reporter notified
```

---

## 10. Deployment Plan

### 10.1 Environments

| Environment | Supabase Project | Branch    | Purpose                   |
| ----------- | ---------------- | --------- | ------------------------- |
| Development | carrinex-dev     | `dev`     | Daily development         |
| Staging     | carrinex-staging | `staging` | QA testing before release |
| Production  | carrinex-prod    | `main`    | Live users                |

### 10.2 Migration Strategy

```bash
# Never run raw SQL in prod — always via migrations
supabase migration new add_follows_table
# Edit the file, then:
supabase db push --project-ref <staging-ref>
# Verify in staging, then:
supabase db push --project-ref <prod-ref>
```

### 10.3 CI/CD Pipeline (GitHub Actions)

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main, staging]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
      - run: supabase start
      - run: supabase db reset
      - run: deno test supabase/functions/

  deploy-staging:
    needs: test
    if: github.ref == 'refs/heads/staging'
    steps:
      - run: supabase db push --project-ref ${{ secrets.STAGING_REF }}
      - run: supabase functions deploy --project-ref ${{ secrets.STAGING_REF }}

  deploy-prod:
    needs: test
    if: github.ref == 'refs/heads/main'
    steps:
      - run: supabase db push --project-ref ${{ secrets.PROD_REF }}
      - run: supabase functions deploy --project-ref ${{ secrets.PROD_REF }}
```

### 10.4 Monitoring & Logging

- **Supabase Dashboard**: Query performance, slow queries, API logs
- **Edge Function Logs**: Supabase dashboard → Edge Functions → Logs
- **Error tracking**: Add Sentry DSN in Edge Functions for unhandled exceptions
- **Alerting**: Supabase email alerts on error rate spikes
- **Custom metrics**: Log to `app_logs` table for business metrics

```typescript
// In every Edge Function
try {
  // ... logic
} catch (err) {
  console.error(
    JSON.stringify({ function: "offer-action", error: err.message, userId }),
  );
  // Sentry.captureException(err); // future
  return errorResponse("INTERNAL_ERROR", 500);
}
```

---

## 11. Performance & Scaling Plan

### 11.1 Caching Strategy

| Data                   | Cache Location           | TTL     | Strategy                                      |
| ---------------------- | ------------------------ | ------- | --------------------------------------------- |
| Feed results           | Edge Function in-memory  | 5 min   | Per-category cache, invalidate on new listing |
| App config (fee, etc.) | Edge Function in-memory  | 10 min  | Re-fetch on cold start                        |
| User profile           | Client (Zustand/Context) | Session | Invalidate on update                          |
| Listing detail         | Client                   | 10 min  | Stale-while-revalidate                        |
| Unread count           | Realtime subscription    | Live    | No cache needed                               |

### 11.2 Feed Optimization

1. **Precomputed scores**: `listing_feed_scores` refreshed every 30min by pg_cron
2. **Cursor pagination**: Score-based cursor (not offset) prevents drift and is O(log n)
3. **Personalization layer**: Add `followed_bonus` in Edge Function at query time (not precomputed)
4. **Partial indexes**: Feed query only touches `status = 'live'` listings
5. **Covering index**: Include `title, price, images[1], seller_id` in feed score index to avoid table lookup

### 11.3 Database Scaling

| Stage      | Users               | Action                                                                   |
| ---------- | ------------------- | ------------------------------------------------------------------------ |
| 0-5k DAU   | Supabase Free/Pro   | Default config sufficient                                                |
| 5k-50k DAU | Supabase Pro        | Enable connection pooling (PgBouncer, already enabled), add read replica |
| 50k+ DAU   | Supabase Enterprise | Horizontal read replicas, partition `notifications` and `listing_views`  |

**Connection pooling:** Supabase uses PgBouncer by default. Use `?pgbouncer=true` connection string in Edge Functions.

**Expensive queries to watch:**

- Feed join: `listings` + `listing_feed_scores` + `follows` — covered by indexes
- Conversation list with unread counts — covered by unread counter columns
- User rating calculation — use trigger, not aggregate query

---

## 12. Risk Analysis

### 12.1 Hardest Parts & Mitigations

| Risk                                | Difficulty | Impact | Mitigation                                                             |
| ----------------------------------- | ---------- | ------ | ---------------------------------------------------------------------- |
| Feed personalization at scale       | High       | Medium | Precompute scores; add followed_bonus at query time only               |
| Real-time offer race conditions     | High       | High   | Use DB transactions + `FOR UPDATE` locking in `offer-action`           |
| Image upload reliability on mobile  | Medium     | High   | Signed URLs expire in 1hr; retry logic in client                       |
| Offer expiry precision              | Medium     | Medium | pg_cron every 5min is sufficient; show "~48hr" not exact time          |
| Fake follower detection             | High       | Medium | Compare follower:following ratio; flag accounts with >90% fake-pattern |
| Admin abuse of Edge Functions       | Medium     | High   | Admin flag in DB, not JWT claim; double-check on every action          |
| Supabase Realtime connection limits | Medium     | High   | Supabase Pro: 500 concurrent. Upgrade or implement polling fallback    |
| Search quality                      | Medium     | Low    | PostgreSQL full-text search is adequate for launch; add Algolia later  |
| Service fee rounding errors         | Low        | High   | Always use integer arithmetic (cents), never floats for money          |
| Schema migration in production      | High       | High   | Test migrations on staging with prod data snapshot first               |

### 12.2 Specific Technical Risks

**Race condition on Buy Now:**

```sql
-- In buy-now Edge Function, use a transaction with locking:
BEGIN;
SELECT quantity, status FROM listings WHERE id = $1 FOR UPDATE;
-- Check quantity > 0 and status = 'live'
-- Create order
-- Decrement quantity or set status = 'sold'
COMMIT;
```

**Offer acceptance race (two buyers):**

- Only 1 offer active per buyer per listing (DB constraint)
- Seller accepts → listing immediately set to `is_sold = true` within same transaction

**Real-time subscription limits:**

- On Supabase Pro: 500 concurrent realtime connections
- Mitigation: Unsubscribe when screen is not focused; reconnect on focus
- Fallback: Poll `/rest/v1/messages` every 3 seconds if websocket fails

### 12.3 Build Order Priority

Build in this order to minimize rework:

1. **Auth + Profiles** → everything depends on this
2. **Listings CRUD** → feed needs listings
3. **Image Upload** → listings need images
4. **Feed** → core discovery feature
5. **Social (follows)** → feed personalization depends on this
6. **Messaging** → offers depend on conversations
7. **Offers** → orders depend on offers
8. **Orders** → reviews depend on orders
9. **Notifications** → depends on all prior systems
10. **Admin** → depends on all prior data
11. **Hardening** → last, after all features exist

---

## Quick Reference — RLS Policy Summary

```sql
-- profiles:   everyone can read (except banned); only self can update
-- listings:   everyone can read live; owner can CRUD; admin can remove
-- follows:    everyone can read; only self can follow/unfollow
-- listing_likes: everyone can read; only self can manage
-- conversations: only participants
-- messages:   only participants (via conversation check)
-- offers:     only buyer + seller
-- orders:     only buyer + seller
-- notifications: only owner
-- reports:    reporter can create; only admin can read all
-- app_config: everyone can read; only admin can write
```

---

_Blueprint generated: 2026-04-19. Revise at Phase 5 (messaging) if Realtime connection counts become a constraint._
