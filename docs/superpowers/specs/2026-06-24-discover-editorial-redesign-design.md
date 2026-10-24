# Discover editorial redesign

**Date:** 2026-06-24
**Surface:** `app/(tabs)/discover.tsx`
**Register:** product (app UI)

## Goal

Turn Discover's idle/browse state into an editorial discovery feed inspired by
Grailed's Discover tab, adapted to Grabsty. All content is derived from data the
screen already fetches — no new queries, no DB migration. Search and category
filtering keep their existing behavior; the editorial blocks render only when
idle (`!hasQuery && !browseCat`).

## Constraints

- Strict palette: purple `#6C47FF` / white / black (+ opacity tints). No
  gradients, stickers, or emoji decoration.
- Typography: Inter (body/labels) + Fraunces serif (editorial titles), uppercase
  eyebrows. Weights available: Fraunces 600/700, Inter 400/500/600/700.
- Reuse `ListingCard` (1:1.33) unchanged. Reuse `colors`, `radii`, `type` tokens.
- Responsive via existing `useGridDimensions` / `useTabBarClearance`.

## Idle feed (top → bottom)

1. **Header** — `Discover` title + bell. (unchanged)
2. **Search bar** — unchanged; Home routes search here.
3. **Welcome eyebrow** — `WELCOME @USERNAME` eyebrow + serif line. Logged-out →
   `WELCOME TO GRABSTY`.
4. **Today's Digest** — horizontal rail of wide edit cards (image + brands line +
   serif theme title). Tapping applies that filter.
5. **Daily Picks For You** — serif heading + `SEE MORE`, `ListingCard` rail from
   recommendations (fallback to trending). `SEE MORE` → Home feed.
6. **Recently viewed** — rail, hidden when empty. (kept)
7. **Collections** — 2–3 brand-grouped blocks: uppercase eyebrow + serif title +
   small image collage. Tap → search that brand. Hidden when no brand qualifies.
8. **Trending grid** — existing full grid as the catch-all, always rendered.

Search (`hasQuery`) and category (`browseCat`) states are unchanged: People +
Items results / category grid.

## Derivation logic (`lib/discover.ts`, pure)

- `buildDigest(listings)` → up to 5 cards: "Now in demand" (top by likes),
  "Fresh drops" (newest by `created_at`), then per-category "The {Label} Edit"
  for categories with ≥3 items. Each card carries a hero image + a brands
  subtitle + a target filter (`category` or `'trending'`).
- `buildCollections(listings)` → brands with ≥3 listings, top 3 by count. Each:
  lead `brand` title, eyebrow of the brand's categories, 3 collage images, and a
  search target (the brand string).

Both are pure functions over the already-loaded `listings`; empty/thin catalogs
drop sections gracefully. The trending grid guarantees the screen is never empty.

## Components (`components/discover/`)

- `WelcomeEyebrow`, `DigestRail` + `EditCard`, `DailyPicks`, `CollectionBlock`.
  All presentational; no data fetching, no `ListingCard` changes.

## Edge cases

- Logged-out / no recommendations → Daily Picks falls back to trending listings.
- Fewer than the threshold of items in a category/brand → that card/block is
  omitted.
- Missing images → card/collage slot falls back to the panel fill color.
