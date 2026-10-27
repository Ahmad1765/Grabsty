# My Feed Personalized — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static Grabsty iPhone mockup at `app/(tabs)/feed.tsx` with a personalized buyer-side feed showing price drops on liked items, new listings from followed sellers, and a "Picked for you" grid based on what the user has liked.

**Architecture:** Three independent data loaders in `lib/myFeed.ts`, composed by a single rewritten screen. Each section loads in parallel, renders its own skeleton, and hides itself on empty (no whole-screen empty state). A new `listing_price_history` table + trigger captures price changes server-side. The screen reuses existing `ListingCard`, `SectionHeader`, `useGridDimensions`, and `listingCache`.

**Tech Stack:** Expo 54 (Expo Router), React Native 0.79, NativeWind 4, Supabase JS 2, TypeScript strict, Playwright e2e (real-Supabase mode, data-agnostic).

**Spec:** `docs/superpowers/specs/2026-06-03-my-feed-personalized-design.md`

---

## File Structure

| Action  | Path                                  | Responsibility                                                                                   |
| ------- | ------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Create  | `supabase/listing_price_history.sql`  | Idempotent migration: table, index, trigger, RLS. Run manually via Supabase SQL editor.          |
| Create  | `lib/myFeed.ts`                       | Three fetchers (`fetchPriceDrops`, `fetchNewFromFollowed`, `fetchSimilarToLiked`) + result type. |
| Create  | `components/PriceDropCard.tsx`        | Card variant: image, title, strikethrough old price, purple new price, "–X%" pill.               |
| Rewrite | `app/(tabs)/feed.tsx`                 | Header, cold-start banner, three sections, pull-to-refresh, infinite scroll on bottom grid.      |
| Delete  | `tests/e2e/feed-static.spec.ts`       | Obsolete — covers the removed mockup.                                                            |
| Create  | `tests/e2e/feed-personalized.spec.ts` | Structural assertions (data-agnostic, matches `home-feed.spec.ts` style).                        |

**Project conventions used:**

- All Supabase functions return discriminated `{ ok: true, rows } | { ok: false }` (see `lib/listings.ts` `FetchListingsResult`).
- Each query races against a 10s hard timeout (mirrors `fetchListingsResult`).
- Screens render snapshot cache via `lib/listingCache.ts` so tab swaps are instant.
- All imports use the `@/*` path alias.
- E2E specs are data-agnostic — they assert structure (headers, copy, route changes), never seeded content.

---

## Task 1: DB migration — `listing_price_history`

**Files:**

- Create: `supabase/listing_price_history.sql`

- [ ] **Step 1: Create the migration file**

Write `supabase/listing_price_history.sql`:

```sql
-- Grabsty — listing price history.
-- Captures every price change on `listings` so we can surface
-- "items you liked got cheaper" on the My Feed tab.
-- Idempotent: safe to re-run.

create table if not exists public.listing_price_history (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  old_price numeric not null,
  new_price numeric not null,
  changed_at timestamptz not null default now()
);

create index if not exists listing_price_history_listing_changed_idx
  on public.listing_price_history (listing_id, changed_at desc);

create or replace function public.log_listing_price_change()
returns trigger language plpgsql security definer as $$
begin
  if new.price is distinct from old.price then
    insert into public.listing_price_history (listing_id, old_price, new_price)
    values (new.id, old.price, new.price);
  end if;
  return new;
end$$;

drop trigger if exists listings_price_change_trg on public.listings;
create trigger listings_price_change_trg
  after update on public.listings
  for each row execute function public.log_listing_price_change();

alter table public.listing_price_history enable row level security;

drop policy if exists "price history readable when listing readable"
  on public.listing_price_history;
create policy "price history readable when listing readable"
  on public.listing_price_history for select
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_price_history.listing_id
    )
  );
```

- [ ] **Step 2: Run the migration in Supabase**

Open Supabase Studio → SQL editor → New query → paste the file contents → Run.

Expected: "Success. No rows returned."

Verify the table exists:

```sql
select * from public.listing_price_history limit 1;
```

Expected: empty result, no error.

- [ ] **Step 3: Smoke-test the trigger**

In the SQL editor:

```sql
-- Pick any listing and bump its price by 1 cent, then revert.
with target as (select id, price from public.listings limit 1)
update public.listings
   set price = price + 0.01
 where id = (select id from target);

select * from public.listing_price_history order by changed_at desc limit 1;
```

Expected: one row, `old_price` and `new_price` differ by 0.01.

Revert:

```sql
update public.listings
   set price = price - 0.01
 where id = (select id from public.listing_price_history order by changed_at desc limit 1);
```

- [ ] **Step 4: Commit**

```bash
git add supabase/listing_price_history.sql
git commit -m "feat(db): add listing_price_history table + trigger"
```

---

## Task 2: `lib/myFeed.ts` — types and `fetchPriceDrops`

**Files:**

- Create: `lib/myFeed.ts`

- [ ] **Step 1: Write the module with `fetchPriceDrops`**

Create `lib/myFeed.ts`:

```ts
import { supabase } from "@/lib/supabase";
import type { Listing } from "@/types";
import { putCachedListings } from "@/lib/listingCache";

// Discriminated result: ok=false means the fetch wedged or PostgREST errored.
// Callers should preserve whatever is on screen rather than commit []. This
// mirrors `FetchListingsResult` in lib/listings.ts so the My Feed screen can
// reuse the same wedge-vs-empty branching.
export type MyFeedResult<T> = { ok: true; rows: T[] } | { ok: false };

export type PriceDropListing = Listing & {
  old_price: number;
  new_price: number;
  changed_at: string;
};

const FETCH_TIMEOUT_MS = 10_000;

// Race any supabase-js query against a hard timeout so a wedged client can
// never freeze the My Feed screen. Mirrors the pattern used in lib/listings.ts.
async function withTimeout<T>(
  p: PromiseLike<T>,
  label: string,
): Promise<T | { __wedge: true }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return (await Promise.race([
      p,
      new Promise<{ __wedge: true }>((resolve) => {
        timer = setTimeout(() => resolve({ __wedge: true }), FETCH_TIMEOUT_MS);
      }),
    ])) as T | { __wedge: true };
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

const SELLER_COLS =
  "id, username, full_name, avatar_url, is_verified, vacation_mode";
const LISTING_COLS =
  "id, seller_id, title, brand, size, price, category, gender, condition, images, is_sold, likes, created_at";

// Price drops on listings the user has liked, within the last 30 days,
// still active, seller not on vacation. Two-step query: first fetch the
// user's liked listing ids, then for each find the most recent price-drop
// row and hydrate listing + seller. Bounded to 8 rows for the strip.
export async function fetchPriceDrops(
  userId: string,
): Promise<MyFeedResult<PriceDropListing>> {
  try {
    // Step A — which listings has the user liked? Bounded; users with
    // thousands of likes still only need the last few hundred to find drops.
    const likedRes = await withTimeout(
      supabase
        .from("listing_likes")
        .select("listing_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(200),
      "price-drops:likes",
    );
    if ("__wedge" in likedRes) return { ok: false };
    const { data: likedRows, error: likedErr } = likedRes as {
      data: { listing_id: string }[] | null;
      error: { message: string } | null;
    };
    if (likedErr) {
      console.warn("[myFeed] fetchPriceDrops likes", likedErr.message);
      return { ok: false };
    }
    const likedIds = (likedRows ?? []).map((r) => r.listing_id);
    if (likedIds.length === 0) return { ok: true, rows: [] };

    // Step B — most recent drop per listing within window.
    const sinceIso = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const dropsRes = await withTimeout(
      supabase
        .from("listing_price_history")
        .select("listing_id, old_price, new_price, changed_at")
        .in("listing_id", likedIds)
        .gt("changed_at", sinceIso)
        .order("changed_at", { ascending: false })
        .limit(64),
      "price-drops:history",
    );
    if ("__wedge" in dropsRes) return { ok: false };
    const { data: dropRows, error: dropErr } = dropsRes as {
      data:
        | {
            listing_id: string;
            old_price: number;
            new_price: number;
            changed_at: string;
          }[]
        | null;
      error: { message: string } | null;
    };
    if (dropErr) {
      console.warn("[myFeed] fetchPriceDrops history", dropErr.message);
      return { ok: false };
    }
    // Keep only the latest drop per listing, and only if price went DOWN.
    const latestPerListing = new Map<
      string,
      { old_price: number; new_price: number; changed_at: string }
    >();
    for (const row of dropRows ?? []) {
      if (row.new_price >= row.old_price) continue;
      if (!latestPerListing.has(row.listing_id)) {
        latestPerListing.set(row.listing_id, {
          old_price: row.old_price,
          new_price: row.new_price,
          changed_at: row.changed_at,
        });
      }
    }
    const droppedIds = Array.from(latestPerListing.keys()).slice(0, 8);
    if (droppedIds.length === 0) return { ok: true, rows: [] };

    // Step C — hydrate listings + sellers.
    const hydrateRes = await withTimeout(
      supabase
        .from("listings")
        .select(
          `${LISTING_COLS}, seller:profiles!listings_seller_id_fkey!inner(${SELLER_COLS})`,
        )
        .in("id", droppedIds)
        .eq("is_sold", false)
        .eq("seller.vacation_mode", false),
      "price-drops:hydrate",
    );
    if ("__wedge" in hydrateRes) return { ok: false };
    const { data: listings, error: hydrateErr } = hydrateRes as {
      data: Listing[] | null;
      error: { message: string } | null;
    };
    if (hydrateErr) {
      console.warn("[myFeed] fetchPriceDrops hydrate", hydrateErr.message);
      return { ok: false };
    }
    const rows: PriceDropListing[] = (listings ?? [])
      .map((l) => {
        const drop = latestPerListing.get(l.id);
        if (!drop) return null;
        return { ...l, ...drop };
      })
      .filter((r): r is PriceDropListing => r !== null)
      .sort((a, b) => b.changed_at.localeCompare(a.changed_at));
    putCachedListings(rows);
    return { ok: true, rows };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[myFeed] fetchPriceDrops threw", msg);
    return { ok: false };
  }
}
```

- [ ] **Step 2: Type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: no errors related to `lib/myFeed.ts`.

If you see errors about `putCachedListings` accepting only `Listing[]` and rejecting `PriceDropListing[]`, the cache helper is permissive in practice — `PriceDropListing` is a structural superset of `Listing`. If TypeScript complains, cast at the call site: `putCachedListings(rows as Listing[])`.

- [ ] **Step 3: Commit**

```bash
git add lib/myFeed.ts
git commit -m "feat(myFeed): add fetchPriceDrops"
```

---

## Task 3: `lib/myFeed.ts` — `fetchNewFromFollowed`

**Files:**

- Modify: `lib/myFeed.ts` (append)

- [ ] **Step 1: Append `fetchNewFromFollowed`**

Add to `lib/myFeed.ts`:

```ts
// Listings posted in the last `sinceDays` days by sellers the user follows.
// Bounded to 8 rows for the horizontal strip. Two-step query so we can use
// the existing user_follows table (PostgREST can't join through it inline).
export async function fetchNewFromFollowed(
  userId: string,
  sinceDays = 14,
): Promise<MyFeedResult<Listing>> {
  try {
    const followsRes = await withTimeout(
      supabase
        .from("user_follows")
        .select("followee_id")
        .eq("follower_id", userId),
      "followed:follows",
    );
    if ("__wedge" in followsRes) return { ok: false };
    const { data: followRows, error: followErr } = followsRes as {
      data: { followee_id: string }[] | null;
      error: { message: string } | null;
    };
    if (followErr) {
      console.warn("[myFeed] fetchNewFromFollowed follows", followErr.message);
      return { ok: false };
    }
    const followeeIds = (followRows ?? []).map((r) => r.followee_id);
    if (followeeIds.length === 0) return { ok: true, rows: [] };

    const sinceIso = new Date(
      Date.now() - sinceDays * 24 * 60 * 60 * 1000,
    ).toISOString();
    const listingsRes = await withTimeout(
      supabase
        .from("listings")
        .select(
          `${LISTING_COLS}, seller:profiles!listings_seller_id_fkey!inner(${SELLER_COLS})`,
        )
        .in("seller_id", followeeIds)
        .eq("is_sold", false)
        .eq("seller.vacation_mode", false)
        .gt("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(8),
      "followed:listings",
    );
    if ("__wedge" in listingsRes) return { ok: false };
    const { data: listings, error: listingsErr } = listingsRes as {
      data: Listing[] | null;
      error: { message: string } | null;
    };
    if (listingsErr) {
      console.warn(
        "[myFeed] fetchNewFromFollowed listings",
        listingsErr.message,
      );
      return { ok: false };
    }
    const rows = (listings ?? []) as Listing[];
    putCachedListings(rows);
    return { ok: true, rows };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[myFeed] fetchNewFromFollowed threw", msg);
    return { ok: false };
  }
}
```

- [ ] **Step 2: Type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/myFeed.ts
git commit -m "feat(myFeed): add fetchNewFromFollowed"
```

---

## Task 4: `lib/myFeed.ts` — `fetchSimilarToLiked`

**Files:**

- Modify: `lib/myFeed.ts` (append)

- [ ] **Step 1: Append `fetchSimilarToLiked`**

Add to `lib/myFeed.ts`:

```ts
// "Picked for you" — calls the existing find_similar_listings RPC against the
// user's 5 most-recently-liked listings, merges, de-duplicates, excludes
// liked + own + sold items. `limit` is the target visible count after
// dedupe; we ask the RPC for roughly 2× that per seed since duplicates and
// excluded rows trim the set.
export async function fetchSimilarToLiked(
  userId: string,
  limit = 30,
): Promise<MyFeedResult<Listing>> {
  try {
    // Step A — top 5 most-recent likes (the "seeds" for similarity).
    const likedRes = await withTimeout(
      supabase
        .from("listing_likes")
        .select("listing_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5),
      "similar:likes",
    );
    if ("__wedge" in likedRes) return { ok: false };
    const { data: likedRows, error: likedErr } = likedRes as {
      data: { listing_id: string }[] | null;
      error: { message: string } | null;
    };
    if (likedErr) {
      console.warn("[myFeed] fetchSimilarToLiked likes", likedErr.message);
      return { ok: false };
    }
    const seedIds = (likedRows ?? []).map((r) => r.listing_id);
    // No likes → caller falls back to popular. We DON'T fall back here so
    // the screen can render a different section header ("Popular right now"
    // vs "Picked for you") based on which branch ran.
    if (seedIds.length === 0) return { ok: true, rows: [] };

    // Step B — also pull the full liked set so we can exclude them from
    // the recommendations (you don't want to be told "you might like X" when
    // X is already in your liked list).
    const allLikedRes = await withTimeout(
      supabase
        .from("listing_likes")
        .select("listing_id")
        .eq("user_id", userId)
        .limit(1000),
      "similar:exclude",
    );
    if ("__wedge" in allLikedRes) return { ok: false };
    const { data: allLikedRows } = allLikedRes as {
      data: { listing_id: string }[] | null;
      error: { message: string } | null;
    };
    const likedSet = new Set((allLikedRows ?? []).map((r) => r.listing_id));

    // Step C — call find_similar_listings per seed, in parallel.
    const perSeed = Math.max(6, Math.ceil((limit * 2) / seedIds.length));
    const responses = await Promise.all(
      seedIds.map(async (id) => {
        const res = await withTimeout(
          supabase.rpc("find_similar_listings", {
            p_listing_id: id,
            p_limit: perSeed,
          }),
          `similar:rpc:${id}`,
        );
        if ("__wedge" in res) return [];
        const { data, error } = res as {
          data: Listing[] | null;
          error: { message: string } | null;
        };
        if (error) {
          console.warn("[myFeed] fetchSimilarToLiked rpc", error.message);
          return [];
        }
        return (data ?? []) as Listing[];
      }),
    );

    // Merge + dedupe by id, exclude liked, exclude own listings, exclude sold.
    const seen = new Set<string>();
    const merged: Listing[] = [];
    for (const batch of responses) {
      for (const row of batch) {
        if (seen.has(row.id)) continue;
        if (likedSet.has(row.id)) continue;
        if (row.seller_id === userId) continue;
        if (row.is_sold) continue;
        seen.add(row.id);
        merged.push(row);
        if (merged.length >= limit) break;
      }
      if (merged.length >= limit) break;
    }
    if (merged.length === 0) return { ok: true, rows: [] };

    // Hydrate sellers in one round-trip (RPC returns bare rows).
    const sellerIds = Array.from(
      new Set(merged.map((r) => r.seller_id).filter(Boolean)),
    );
    const sellersRes = await withTimeout(
      supabase.from("profiles").select(SELLER_COLS).in("id", sellerIds),
      "similar:sellers",
    );
    if ("__wedge" in sellersRes) return { ok: false };
    const { data: sellers, error: sellersErr } = sellersRes as {
      data: Listing["seller"][] | null;
      error: { message: string } | null;
    };
    if (sellersErr) {
      console.warn("[myFeed] fetchSimilarToLiked sellers", sellersErr.message);
      return { ok: true, rows: merged };
    }
    const byId = new Map<string, Listing["seller"]>(
      ((sellers ?? []) as Listing["seller"][]).map((s) => [s.id, s]),
    );
    const rows = merged.map((r) => ({
      ...r,
      seller: byId.get(r.seller_id) ?? r.seller,
    })) as Listing[];
    putCachedListings(rows);
    return { ok: true, rows };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[myFeed] fetchSimilarToLiked threw", msg);
    return { ok: false };
  }
}
```

- [ ] **Step 2: Type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/myFeed.ts
git commit -m "feat(myFeed): add fetchSimilarToLiked"
```

---

## Task 5: `components/PriceDropCard.tsx`

**Files:**

- Create: `components/PriceDropCard.tsx`

- [ ] **Step 1: Write the component**

Create `components/PriceDropCard.tsx`:

```tsx
import { memo } from "react";
import { View, Text, Pressable } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { getOptimizedImageUrl, thumbWidthFor } from "@/lib/images";
import type { PriceDropListing } from "@/lib/myFeed";

interface Props {
  listing: PriceDropListing;
  width?: number;
}

export const PriceDropCard = memo(function PriceDropCard({
  listing,
  width = 130,
}: Props) {
  const firstImage = listing.images[0] ?? "";
  const src = getOptimizedImageUrl(firstImage, { width: thumbWidthFor(width) });
  const pct =
    listing.old_price > 0
      ? Math.round(
          ((listing.old_price - listing.new_price) / listing.old_price) * 100,
        )
      : 0;
  return (
    <Pressable
      onPress={() => router.push(`/product/${listing.id}`)}
      style={{ width }}
      accessibilityRole="button"
      accessibilityLabel={`${listing.title}, price dropped to $${listing.new_price}`}
    >
      <View
        style={{
          width,
          aspectRatio: 1,
          backgroundColor: "rgba(15,15,15,0.04)",
          borderRadius: 12,
          overflow: "hidden",
          position: "relative",
        }}
      >
        <Image
          source={{ uri: src }}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={120}
        />
        {pct > 0 ? (
          <View
            style={{
              position: "absolute",
              top: 6,
              right: 6,
              backgroundColor: "#6C47FF",
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: 6,
            }}
          >
            <Text style={{ color: "white", fontSize: 10, fontWeight: "800" }}>
              −{pct}%
            </Text>
          </View>
        ) : null}
      </View>
      <Text
        numberOfLines={1}
        style={{
          marginTop: 6,
          fontSize: 12.5,
          fontWeight: "600",
          color: "#0F0F0F",
        }}
      >
        {listing.title}
      </Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginTop: 2,
          gap: 6,
        }}
      >
        <Text
          style={{
            fontSize: 11.5,
            color: "rgba(15,15,15,0.45)",
            textDecorationLine: "line-through",
          }}
        >
          ${listing.old_price}
        </Text>
        <Text style={{ fontSize: 13, fontWeight: "800", color: "#6C47FF" }}>
          ${listing.new_price}
        </Text>
      </View>
    </Pressable>
  );
});
```

- [ ] **Step 2: Type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/PriceDropCard.tsx
git commit -m "feat: add PriceDropCard component"
```

---

## Task 6: Rewrite `app/(tabs)/feed.tsx` — header + cold-start banner + section scaffolding

**Files:**

- Rewrite: `app/(tabs)/feed.tsx` (whole file)

- [ ] **Step 1: Replace the entire file**

Overwrite `app/(tabs)/feed.tsx` with the personalized scaffolding. This task lays in the header, the cold-start banner, and three empty section slots with skeletons. Data wiring lands in Tasks 7–9.

```tsx
import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useAuth } from "@/lib/auth";
import { colors, radii } from "@/lib/theme";
import {
  fetchPriceDrops,
  fetchNewFromFollowed,
  fetchSimilarToLiked,
  type PriceDropListing,
} from "@/lib/myFeed";
import { fetchListings } from "@/lib/listings";
import { ListingCard } from "@/components/ListingCard";
import { PriceDropCard } from "@/components/PriceDropCard";
import { useGridDimensions } from "@/lib/responsive";
import type { Listing } from "@/types";

const HORIZONTAL_PAD = 12;
const GRID_GAP = 8;
const STRIP_CARD_WIDTH = 130;

export default function MyFeedScreen() {
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const [priceDrops, setPriceDrops] = useState<PriceDropListing[]>([]);
  const [followedNew, setFollowedNew] = useState<Listing[]>([]);
  const [picked, setPicked] = useState<Listing[]>([]);
  const [pickedIsFallback, setPickedIsFallback] = useState(false);

  const [loadingDrops, setLoadingDrops] = useState(true);
  const [loadingFollowed, setLoadingFollowed] = useState(true);
  const [loadingPicked, setLoadingPicked] = useState(true);

  const { columns, cardWidth } = useGridDimensions({
    min: 2,
    max: 4,
    thresholds: [560, 900, 1200],
    horizontalPadding: HORIZONTAL_PAD,
    gap: GRID_GAP,
  });

  const loadAll = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent === true;
      if (!silent) {
        setLoadingDrops(true);
        setLoadingFollowed(true);
        setLoadingPicked(true);
      }

      // Run all three sections in parallel — each section commits its own
      // state independently so a slow loader doesn't block the others.
      const dropsP = user?.id
        ? fetchPriceDrops(user.id).then((r) => {
            if (r.ok) setPriceDrops(r.rows);
            setLoadingDrops(false);
          })
        : Promise.resolve(setLoadingDrops(false));

      const followedP = user?.id
        ? fetchNewFromFollowed(user.id).then((r) => {
            if (r.ok) setFollowedNew(r.rows);
            setLoadingFollowed(false);
          })
        : Promise.resolve(setLoadingFollowed(false));

      const pickedP = user?.id
        ? fetchSimilarToLiked(user.id).then(async (r) => {
            if (r.ok && r.rows.length > 0) {
              setPicked(r.rows);
              setPickedIsFallback(false);
            } else {
              const fallback = await fetchListings({
                tab: "popular",
                limit: 30,
              });
              setPicked(fallback);
              setPickedIsFallback(true);
            }
            setLoadingPicked(false);
          })
        : fetchListings({ tab: "popular", limit: 30 }).then((rows) => {
            setPicked(rows);
            setPickedIsFallback(true);
            setLoadingPicked(false);
          });

      await Promise.all([dropsP, followedP, pickedP]);
    },
    [user?.id],
  );

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useFocusEffect(
    useCallback(() => {
      loadAll({ silent: true });
    }, [loadAll]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll({ silent: true });
    setRefreshing(false);
  }, [loadAll]);

  const showColdStartBanner = !user;
  const showFollowCta =
    !!user &&
    followedNew.length === 0 &&
    priceDrops.length === 0 &&
    pickedIsFallback;

  return (
    <SafeAreaView
      edges={["top"]}
      style={{ flex: 1, backgroundColor: colors.white }}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.purple}
          />
        }
        contentContainerStyle={{ paddingBottom: 80 }}
      >
        {/* Title */}
        <View
          style={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 4 }}
        >
          <Text
            style={{
              fontSize: 24,
              fontWeight: "800",
              color: colors.ink,
              letterSpacing: -0.5,
            }}
          >
            My Feed
          </Text>
          <Text
            style={{
              fontSize: 13,
              color: colors.muteSoft,
              marginTop: 2,
              letterSpacing: -0.1,
            }}
          >
            Curated from what you like
          </Text>
        </View>

        {showColdStartBanner ? (
          <Pressable
            onPress={() => router.push("/auth/login")}
            style={{
              marginHorizontal: 16,
              marginTop: 14,
              padding: 14,
              borderRadius: radii.md,
              backgroundColor: colors.purpleSoft,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <Feather
              name="user-plus"
              size={16}
              color={colors.purple}
              style={{ marginRight: 10 }}
            />
            <Text
              style={{
                flex: 1,
                color: colors.purple,
                fontSize: 13,
                fontWeight: "600",
              }}
            >
              Sign in and like a few items to see this feed personalize itself.
            </Text>
          </Pressable>
        ) : null}

        {showFollowCta ? (
          <Pressable
            onPress={() => router.push("/(tabs)/discover")}
            style={{
              marginHorizontal: 16,
              marginTop: 14,
              padding: 14,
              borderRadius: radii.md,
              backgroundColor: colors.purpleSoft,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <Feather
              name="compass"
              size={16}
              color={colors.purple}
              style={{ marginRight: 10 }}
            />
            <Text
              style={{
                flex: 1,
                color: colors.purple,
                fontSize: 13,
                fontWeight: "600",
              }}
            >
              Follow some sellers or like a few items to start personalizing
              your feed.
            </Text>
          </Pressable>
        ) : null}

        {/* Sections wired in the next tasks. */}
        <PriceDropsSection rows={priceDrops} loading={loadingDrops} />
        <FollowedSection rows={followedNew} loading={loadingFollowed} />
        <PickedSection
          rows={picked}
          loading={loadingPicked}
          isFallback={pickedIsFallback}
          columns={columns}
          cardWidth={cardWidth}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Section components — placeholders for now; wired in Tasks 7–9.
// ─────────────────────────────────────────────────────────────────────────

function SectionHeader({
  label,
  caption,
  rightAction,
}: {
  label: string;
  caption?: string;
  rightAction?: { text: string; onPress: () => void };
}) {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 22, paddingBottom: 8 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: colors.purple,
              marginRight: 8,
            }}
          />
          <Text
            style={{
              fontSize: 11,
              fontWeight: "800",
              color: colors.ink,
              letterSpacing: 1.4,
              textTransform: "uppercase",
            }}
          >
            {label}
          </Text>
        </View>
        {rightAction ? (
          <Pressable hitSlop={8} onPress={rightAction.onPress}>
            <Text
              style={{
                fontSize: 12.5,
                fontWeight: "700",
                color: colors.purple,
              }}
            >
              {rightAction.text}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {caption ? (
        <Text style={{ fontSize: 13, color: colors.muteSoft, marginTop: 4 }}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

function HorizontalSkeleton({ width = STRIP_CARD_WIDTH }: { width?: number }) {
  return (
    <View style={{ flexDirection: "row", paddingHorizontal: 12, gap: 12 }}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={{ width }}>
          <View
            style={{
              width,
              aspectRatio: 1,
              borderRadius: 12,
              backgroundColor: "rgba(15,15,15,0.06)",
            }}
          />
          <View
            style={{
              marginTop: 6,
              height: 10,
              width: width * 0.7,
              backgroundColor: "rgba(15,15,15,0.06)",
              borderRadius: 4,
            }}
          />
          <View
            style={{
              marginTop: 4,
              height: 10,
              width: width * 0.4,
              backgroundColor: "rgba(15,15,15,0.06)",
              borderRadius: 4,
            }}
          />
        </View>
      ))}
    </View>
  );
}

function PriceDropsSection({
  rows,
  loading,
}: {
  rows: PriceDropListing[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <>
        <SectionHeader label="Price drops" />
        <HorizontalSkeleton />
      </>
    );
  }
  if (rows.length === 0) return null;
  return (
    <>
      <SectionHeader
        label="Price drops"
        caption={`${rows.length} ${rows.length === 1 ? "item" : "items"} you liked got cheaper`}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 12 }}
      >
        {rows.map((l) => (
          <PriceDropCard key={l.id} listing={l} />
        ))}
      </ScrollView>
    </>
  );
}

function FollowedSection({
  rows,
  loading,
}: {
  rows: Listing[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <>
        <SectionHeader label="New from sellers you follow" />
        <HorizontalSkeleton />
      </>
    );
  }
  if (rows.length === 0) return null;
  return (
    <>
      <SectionHeader
        label="New from sellers you follow"
        rightAction={{
          text: "See all",
          onPress: () => router.push("/" as any),
        }}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 12 }}
      >
        {rows.map((l) => (
          <View key={l.id} style={{ width: STRIP_CARD_WIDTH }}>
            <ListingCard listing={l} />
          </View>
        ))}
      </ScrollView>
    </>
  );
}

function PickedSection({
  rows,
  loading,
  isFallback,
  columns,
  cardWidth,
}: {
  rows: Listing[];
  loading: boolean;
  isFallback: boolean;
  columns: number;
  cardWidth: number;
}) {
  if (loading) {
    return (
      <>
        <SectionHeader label="Picked for you" />
        <View
          style={{
            paddingHorizontal: HORIZONTAL_PAD,
            flexDirection: "row",
            gap: GRID_GAP,
          }}
        >
          {Array.from({ length: columns }).map((_, i) => (
            <View
              key={i}
              style={{
                width: cardWidth,
                aspectRatio: 1,
                borderRadius: 12,
                backgroundColor: "rgba(15,15,15,0.06)",
              }}
            />
          ))}
        </View>
      </>
    );
  }
  if (rows.length === 0) return null;
  const label = isFallback ? "Popular right now" : "Picked for you";
  const caption = isFallback ? undefined : "Based on what you've liked";
  const grid: Listing[][] = [];
  for (let i = 0; i < rows.length; i += columns)
    grid.push(rows.slice(i, i + columns));
  return (
    <>
      <SectionHeader label={label} caption={caption} />
      <View style={{ paddingHorizontal: HORIZONTAL_PAD, gap: GRID_GAP }}>
        {grid.map((row, ri) => (
          <View key={ri} style={{ flexDirection: "row", gap: GRID_GAP }}>
            {row.map((listing) => (
              <View key={listing.id} style={{ width: cardWidth }}>
                <ListingCard listing={listing} />
              </View>
            ))}
            {row.length < columns &&
              Array.from({ length: columns - row.length }).map((_, i) => (
                <View key={`pad-${i}`} style={{ width: cardWidth }} />
              ))}
          </View>
        ))}
      </View>
    </>
  );
}
```

- [ ] **Step 2: Type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: no errors. (If `colors.muteSoft` or `colors.purpleSoft` are missing, check `lib/theme.ts` and substitute the closest equivalent — these tokens are used in `discover.tsx`.)

- [ ] **Step 3: Visual smoke test**

Run the web bundle:

```bash
npm run web
```

Open the local URL, navigate to the "My Feed" tab in the bottom bar.

Expected:

- Signed-out: title, subtitle, cold-start banner, three skeleton sections, then (after ~1s) the skeletons clear; Price Drops and "New from followed" sections disappear (no data without auth); "Popular right now" grid appears at the bottom.
- Signed-in with no likes/follows: title, subtitle, follow-CTA banner, "Popular right now" grid.

- [ ] **Step 4: Commit**

```bash
git add app/(tabs)/feed.tsx
git commit -m "feat(feed): rewrite My Feed as personalized buyer surface"
```

---

## Task 7: Replace the obsolete e2e spec

**Files:**

- Delete: `tests/e2e/feed-static.spec.ts`
- Create: `tests/e2e/feed-personalized.spec.ts`

- [ ] **Step 1: Delete the obsolete spec**

```bash
git rm tests/e2e/feed-static.spec.ts
```

- [ ] **Step 2: Create the new structural spec**

Write `tests/e2e/feed-personalized.spec.ts`:

```ts
// My Feed structural checks. We run against the real Supabase backend in
// the unsigned-in state, so we only assert what every visitor sees:
// the title, subtitle, cold-start banner, and the "Popular right now"
// fallback grid that always renders when there are no personal signals.

import { test, expect, waitForAppReady } from "./helpers/page";

test.describe("My Feed (personalized)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/feed");
    await waitForAppReady(page);
  });

  test("renders title and subtitle", async ({ page }) => {
    await expect(page.getByText("My Feed", { exact: true })).toBeVisible();
    await expect(page.getByText("Curated from what you like")).toBeVisible();
  });

  test("signed-out viewer sees the sign-in prompt banner", async ({ page }) => {
    await expect(
      page.getByText(
        /Sign in and like a few items to see this feed personalize itself/i,
      ),
    ).toBeVisible();
  });

  test("fallback grid renders Popular right now", async ({ page }) => {
    // The Popular fallback always runs for signed-out viewers, so the
    // section header is guaranteed.
    await expect(page.getByText("Popular right now")).toBeVisible();
    // Every ListingCard renders a `$<price>` Text. Any match means the grid
    // hydrated against the real backend.
    await expect(page.locator("text=/^\\$\\d[\\d,]*$/").first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("tapping a card in the fallback grid routes to /product/<id>", async ({
    page,
  }) => {
    await page.locator("text=/^\\$\\d[\\d,]*$/").first().click();
    await page.waitForURL(/\/product\/[\w-]+/);
    await expect(page).toHaveURL(/\/product\/[\w-]+/);
  });

  test("Price Drops section is absent for signed-out viewers", async ({
    page,
  }) => {
    // The section hides itself when there's no data, so an unsigned-in
    // viewer should never see the "Price drops" header.
    // Wait for the fallback grid first so we know loading finished.
    await expect(page.getByText("Popular right now")).toBeVisible();
    await expect(page.getByText("Price drops")).toHaveCount(0);
  });
});
```

- [ ] **Step 3: Run the e2e suite**

Run:

```bash
npm run test:e2e -- feed-personalized
```

Expected: all 5 tests pass.

If any test fails on timing, increase the `waitForAppReady` timeout in the helper to 30_000 — the first cold-build run on web can be slow.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/feed-personalized.spec.ts
git commit -m "test(e2e): replace static feed spec with personalized structural checks"
```

---

## Task 8: Final manual verification

**No files changed.** This is the end-to-end sanity check.

- [ ] **Step 1: Run the web bundle and walk the screen**

```bash
npm run web
```

- [ ] **Step 2: Verify signed-out behavior**

In an incognito browser tab, navigate to `/feed`. Expect:

- "My Feed" title and "Curated from what you like" subtitle
- Purple cold-start banner asking to sign in
- "Popular right now" section header followed by a grid of real listings
- No "Price drops" header
- No "New from sellers you follow" header
- Tapping a card opens `/product/<id>`

- [ ] **Step 3: Verify signed-in zero-signal behavior**

Sign in via `/auth/login` with a test account that follows nobody and has liked nothing. Navigate to `/feed`. Expect:

- Title + subtitle
- Purple follow-CTA banner ("Follow some sellers or like a few items…")
- "Popular right now" grid

- [ ] **Step 4: Verify signed-in with-signal behavior**

Using the same account:

1. Open `/discover`, like 2–3 listings.
2. Open a profile and follow 1 seller.
3. Return to `/feed`.

Expect:

- Title + subtitle
- No follow-CTA banner (user now has signals)
- "Picked for you" section header with caption "Based on what you've liked" — grid populated
- If the followed seller has listings posted in the last 14 days: "New from sellers you follow" strip appears

- [ ] **Step 5: Verify price-drop visibility**

In Supabase SQL editor, drop the price of a listing the test user has liked:

```sql
update public.listings
   set price = price - 5
 where id in (
   select listing_id from public.listing_likes
    where user_id = '<test-user-id>'
    limit 1
 );
```

Return to `/feed` (pull-to-refresh if needed). Expect:

- "Price drops" section header with caption "1 item you liked got cheaper"
- A `PriceDropCard` with the old price struck through, new price in purple, and a "−X%" pill

- [ ] **Step 6: Final commit (if any cleanup)**

If you noticed anything during manual testing that needed a fix (color tokens, copy, spacing), commit it now:

```bash
git add -A
git commit -m "polish(feed): manual testing cleanup"
```

If everything was clean, nothing to commit.

---

## Self-review notes

**Spec coverage check:**

| Spec section                             | Implementing task                     |
| ---------------------------------------- | ------------------------------------- |
| Section 1 — Price drops                  | Tasks 1, 2, 5, 6                      |
| Section 2 — New from followed            | Tasks 3, 6                            |
| Section 3 — Picked for you               | Tasks 4, 6                            |
| Cold-start / signed-out banner           | Task 6                                |
| Follow CTA empty state                   | Task 6                                |
| `lib/myFeed.ts` discriminated result     | Tasks 2, 3, 4                         |
| 10s timeout per call                     | Tasks 2, 3, 4 (`withTimeout` helper)  |
| DB migration + RLS + trigger             | Task 1                                |
| `PriceDropCard` component                | Task 5                                |
| Single ScrollView, palette, no gradients | Task 6                                |
| Pull-to-refresh on all three             | Task 6                                |
| Section-level skeletons                  | Task 6                                |
| Snapshot cache                           | Tasks 2, 3, 4 via `putCachedListings` |
| E2E test replacement                     | Task 7                                |

**Notes:**

- The spec mentions a `'my-feed:*'` snapshot cache key namespace. The actual `listingCache` in this codebase is a flat by-id cache (`putCachedListings`), not a feed-snapshot cache. The flat cache is what `lib/listings.ts` uses; this plan follows that pattern. If a per-section snapshot was desired, it would require adding new keys to `lib/listingCache.ts` — out of scope for this plan unless a follow-up requests it.
- The spec talks about infinite scroll on the bottom grid. The plan ships a 30-item first page and no infinite scroll, because `find_similar_listings` only ranks a bounded set per seed — pagination would either repeat results or call the RPC with a higher limit. This is a fair v1 cut and noted as a future enhancement.
- The spec's optional "ListingCard variant with strike+new price" was clarified during the spec self-review to be the standalone `PriceDropCard` (Task 5). No `ListingCard` changes are needed.
