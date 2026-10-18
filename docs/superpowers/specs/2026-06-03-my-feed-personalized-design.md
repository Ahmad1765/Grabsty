# My Feed — Personalized buyer surface

**Date:** 2026-06-03
**Status:** Design approved, pending plan
**Author:** Claude + Ahmad

## Problem

The `(tabs)/feed.tsx` screen ("My Feed") currently renders a static, hard-coded mockup of an unrelated refurbished-phone marketplace ("Grabsty" / "Nybegagnat"). It uses a purple gradient hero, fake iPhone product photos, and Swedish copy. None of it touches Supabase, none of it reflects the user's account, and none of it has anything to do with Grabsty (a peer-to-peer second-hand marketplace for clothing, shoes, bags, accessories, electronics, and beauty).

The tab is labeled "My Feed" with a dashboard-style icon, and currently has no purpose in the app's information architecture.

## Goal

Rebuild `(tabs)/feed.tsx` into a personalized buyer-side surface that complements the existing tabs without duplicating them:

| Tab               | Purpose                                                                   |
| ----------------- | ------------------------------------------------------------------------- |
| Home (`index`)    | Global discovery — For You / Popular / Following lists of all listings    |
| Discover          | Active search + category browsing                                         |
| **My Feed (new)** | **Personalized "your corner" — items relevant to _you_ based on signals** |
| Upload            | Post a new listing                                                        |
| Profile           | Your own shop + liked items + settings                                    |

`/news` (bell icon, not a tab) already handles notifications and saved-search match counts and is not affected by this work.

## Sections

The screen renders three sections top-to-bottom in a single `ScrollView`.

### Section 1 — Price drops

Horizontal strip (max 8 cards). Listings the user previously liked, where the seller has lowered the price within the last 30 days, and the listing is still active (`is_sold = false`, seller not in vacation mode). Each card shows the old price with a strikethrough and the new price in `#6C47FF` purple.

Implementation: a new lightweight `PriceDropCard` component (new file: `components/PriceDropCard.tsx`) wraps the same image + title rendering as `ListingCard` but replaces the price row with `<oldPrice strikethrough> → <newPrice purple>` and a small "–X%" pill in the top-right. We don't add a variant prop to `ListingCard` to avoid coupling the discovery feed to a price-drop-specific shape.

If the user has zero qualifying price drops, the section is hidden entirely (no empty box).

### Section 2 — New from sellers you follow

Horizontal strip (max 8 cards). Listings posted in the last 14 days by sellers in the user's `user_follows` set. Plain cards (no badge). A "See all" pill on the right routes to Home → Following tab.

If the user follows nobody, or follows but none have new listings, the section is hidden.

### Section 3 — Picked for you

3-column vertical grid (matches Home's grid layout and column count). First page is 30 items, with infinite scroll mirroring Home.

Source: for each of the user's 5 most-recently-liked listings, call the existing `find_similar_listings` RPC, merge results, de-duplicate by id, exclude already-liked items, exclude the user's own listings, exclude sold items.

If the user has zero likes, fall back to `fetchListings({ tab: 'popular' })` and rename the section header to "Popular right now".

## Empty / cold-start handling

There is no whole-screen empty state. Each section either renders content or hides itself. The screen always has _something_ to show because Section 3 falls back to global popular listings.

If the user is signed out, a soft banner at the top reads: _"Sign in and like a few items to see this feed personalize itself."_ Tapping it routes to `/auth/login`.

If the user is signed in but has zero follows AND zero likes, an inline CTA card sits above Section 3: _"Follow some sellers or like a few items to start personalizing your feed."_ Tapping it routes to Discover.

## Data layer — `lib/myFeed.ts` (new)

Three exported functions, each returning a discriminated `{ ok: true, rows } | { ok: false }` result so callers can preserve prior state on a wedged fetch (same pattern as `fetchListingsResult`).

```ts
fetchPriceDrops(userId: string): Promise<MyFeedResult<PriceDropListing>>
fetchNewFromFollowed(userId: string, sinceDays?: number): Promise<MyFeedResult<Listing>>
fetchSimilarToLiked(userId: string, limit?: number): Promise<MyFeedResult<Listing>>
```

Each function:

- Races against a 10s hard timeout (mirrors `fetchListingsResult`)
- Wraps the await in try/catch so it can never throw
- Logs `console.warn` with section name on failure
- Returns `{ ok: false }` on any error so the section preserves prior state instead of blanking

`PriceDropListing = Listing & { old_price: number; new_price: number; changed_at: string }`.

## DB migration — price history

New file: `supabase/migrations/<timestamp>_listing_price_history.sql`.

```sql
create table listing_price_history (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  old_price numeric not null,
  new_price numeric not null,
  changed_at timestamptz not null default now()
);

create index listing_price_history_listing_changed_idx
  on listing_price_history (listing_id, changed_at desc);

create or replace function log_listing_price_change()
returns trigger language plpgsql as $$
begin
  if new.price is distinct from old.price then
    insert into listing_price_history (listing_id, old_price, new_price)
    values (new.id, old.price, new.price);
  end if;
  return new;
end$$;

create trigger listings_price_change_trg
  after update on listings
  for each row execute function log_listing_price_change();

alter table listing_price_history enable row level security;

create policy "price history readable when listing readable"
  on listing_price_history for select
  using (
    exists (
      select 1 from listings l
      where l.id = listing_price_history.listing_id
    )
  );
```

The table grows only when a seller edits a listing's price — slow growth in practice.

### `fetchPriceDrops` query shape

```sql
-- conceptual; the real query lives in lib/myFeed.ts using supabase-js
select l.*, h.old_price, h.new_price, h.changed_at,
       p.* as seller
from listing_likes lk
join listings l on l.id = lk.listing_id
join lateral (
  select old_price, new_price, changed_at
  from listing_price_history h
  where h.listing_id = l.id
    and h.changed_at > now() - interval '30 days'
    and h.new_price < h.old_price
  order by changed_at desc
  limit 1
) h on true
join profiles p on p.id = l.seller_id
where lk.user_id = $1
  and l.is_sold = false
  and p.vacation_mode = false
order by h.changed_at desc
limit 8;
```

In supabase-js this is two round-trips: first the latest-drop rows from `listing_price_history` filtered by likes, then a hydrate of listings + sellers by id. Acceptable — both queries hit indexes.

## Screen — `app/(tabs)/feed.tsx`

Full rewrite. Single `ScrollView` with `RefreshControl`, white surface, `#6C47FF` purple accent, no gradients, no decorative icons. Matches the visual language of Home and the product page.

Layout:

```
┌─────────────────────────────────────┐
│  My Feed                            │  24px ink title, left-aligned, 16px pad
│  Curated from what you like         │  13px mute subtitle, -2px tracking
├─────────────────────────────────────┤
│  [Cold-start banner OR follow CTA]  │  only when applicable
├─────────────────────────────────────┤
│  ● PRICE DROPS                      │  6px purple dot + 11px uppercase 800
│  3 items you liked got cheaper      │  13px mute caption
│  → → horizontal strip of cards      │  ListingCard variant w/ strike+new price
├─────────────────────────────────────┤
│  ● NEW FROM SELLERS YOU FOLLOW      │  same header style; "See all" pill right
│  → → horizontal strip of cards      │  plain ListingCard
├─────────────────────────────────────┤
│  ● PICKED FOR YOU                   │  same header
│  Based on what you've liked         │
│  ┌────┐ ┌────┐ ┌────┐               │  3-col grid (matches Home)
│  └────┘ └────┘ └────┘               │  infinite scroll
└─────────────────────────────────────┘
```

- Section header component reused from `components/ui` (`SectionHeader`)
- Horizontal strips use `ScrollView horizontal` with 12px gap, cards 130px wide
- Bottom grid uses the same `useGridDimensions` hook as Discover (`min: 2, max: 4` for tablet breakpoints; 3 on phone)
- Pull-to-refresh fires all three loaders in parallel
- Infinite scroll attached only to the bottom grid (the strips are fixed-size)

## Loading / error / cache strategy

- Each section has its own skeleton (3 ghost cards in a horizontal strip, or a 3×2 ghost grid for Section 3)
- Snapshot cache via existing `listingCache` keyed by `'my-feed:price-drops'`, `'my-feed:followed'`, `'my-feed:picked'` so a tab swap re-renders instantly while a silent refetch runs in the background
- `useFocusEffect` triggers silent refetches on tab gain
- A section returning `{ ok: false }` preserves its current rows; a section returning `{ ok: true, rows: [] }` hides itself (or falls back, for Section 3)

## Removed code

- Entire current `app/(tabs)/feed.tsx` (Grabsty hero + iPhone mockup + USP grid + product cards)
- `tests/e2e/feed-static.spec.ts` replaced by a new spec

## Tests

New file: `tests/e2e/feed-personalized.spec.ts`. Covers:

1. Signed-out user sees the cold-start banner and the "Popular right now" grid
2. Signed-in user with zero likes/follows sees the inline CTA + popular grid
3. Signed-in user with likes sees "Picked for you" section header
4. After seeding a price drop on a liked listing, the Price Drops section appears with strikethrough old price + new price
5. Pull-to-refresh re-fires all three loaders
6. A section returning empty hides itself (asserts no orphan header)

Mirrors the existing real-Supabase integration helpers already used in the e2e suite.

## Out of scope

- Recently-viewed surface (would need a new `listing_views` table — defer to a future spec)
- Push notifications for price drops (could layer on the new history table later)
- Reorderable / dismissible sections
- Personal seller-side dashboard cards (the alternate "B" direction we ruled out)

## File summary

| Action  | Path                                                        |
| ------- | ----------------------------------------------------------- |
| Rewrite | `app/(tabs)/feed.tsx`                                       |
| Create  | `lib/myFeed.ts`                                             |
| Create  | `components/PriceDropCard.tsx`                              |
| Create  | `supabase/migrations/<timestamp>_listing_price_history.sql` |
| Create  | `tests/e2e/feed-personalized.spec.ts`                       |
| Delete  | `tests/e2e/feed-static.spec.ts`                             |
