# Gamification & Engagement — Design Spec

Date: 2026-06-13
Status: Phase 1 in progress; Phases 2–4 pending backend go-ahead.

## Goal

Increase engagement on Grabsty (secondhand fashion marketplace) by adding a
unified **Status & Progress** system. One coherent mental model — "level up your
shop" — rather than four disconnected mechanics. Drives the supply side (more,
better, fresher listings), new-user activation, and daily return.

## Design constraints (non-negotiable)

- Strict palette: **purple / white / black only**. No gradients, stickers, emoji
  decoration. Tasteful, minimal — matches the existing profile/product surfaces.
- Reuse existing UI primitives (`TrustBadge`, `Stat`, `Card`, `ListRow`,
  progress-bar pattern from the bundle ladder on the product page).
- Every interactive element gets `accessibilityRole` / `Label` / `State`.
- Anything persistent must be RLS-safe (read own + public status only).

## The four pillars, unified

A single profile-centric progression spine that the other mechanics feed:

1. **Seller Levels** (A) — Newcomer → Riser → Trusted Seller → Top Seller → Elite.
   Computed from `total_sales` gated by `rating`. Progress ring/bar on profile.
2. **Activation** (C) — profile-completion meter for new sellers (photo, bio,
   location, first listing, 3 listings, verify). Disappears at 100% (no permanent
   clutter).
3. **Achievements / Badges** (D) — collectible badges on the profile. Split into
   *computed* (derivable now) and *event* (need tracking).
4. **Daily return** (B) — listing/selling **streaks** + rotating **weekly
   challenges**, plus **leaderboards** (trending sellers) for status + discovery.

## Phasing (risk-ordered)

### Phase 1 — Computed status (no schema change) — BUILD NOW
Pure functions in `lib/levels.ts`, fed by data already loaded on the profile.

- `computeLevel(stats)` → current level, next level, sales-based progress 0–1,
  human-readable next requirement.
- `profileCompletion(user, listingsCount)` → ordered steps, percent, next action.
- `computeBadges(stats, user)` → computed badges: First Sale, 10 Sales, 100 Likes,
  Curator (10+ listings), Verified, Profile Complete, each with earned flag.

UI (profile hero, own profile):
- Level chip + slim progress bar + "N more sales to reach <Level>" line.
- Profile-completion meter card — only when < 100% — with the next step + a CTA.
- Earned-achievements strip (quiet icon pills) under the trust badges.

Other users' profiles (`user/[id].tsx`) and the product seller card show just the
**level chip** (read-only status), no progress/meter.

Fully reversible, client-only, unit-testable. No backend dependency.

### Phase 2 — Streaks (table + daily cron)
- Table `user_streaks (user_id PK, current_streak, longest_streak, last_active_date)`.
- Daily activity ping (open app / list / sell) updates the streak; a `pg_cron`
  job resets streaks with a gap. RLS: user reads/writes own row.
- UI: streak counter in profile header + a "don't break your streak" nudge.

### Phase 3 — Weekly challenges (table + cron + RPC)
- Tables `challenges` (definition, week) + `challenge_progress (user_id, challenge_id, progress, completed_at)`.
- Triggers/RPCs increment progress on list/sell/sale events. Weekly rotation via cron.
- UI: a challenges card ("List 3 this week — 1/3") on the home or profile.

### Phase 4 — Event badges + leaderboards
- Table `user_badges (user_id, badge_key, earned_at)` for event-sourced badges
  (Quick Shipper, Streak Master, Challenge Champ) awarded by RPC/trigger.
- Materialized view `trending_sellers` (weekly sales/likes), refreshed by cron;
  read-only leaderboard screen, opt-in framing so small sellers aren't discouraged.

## Data model summary (Phases 2–4)

```sql
user_streaks(user_id uuid pk, current_streak int, longest_streak int, last_active_date date)
challenges(id uuid pk, key text, title text, goal int, metric text, week date)
challenge_progress(user_id uuid, challenge_id uuid, progress int, completed_at timestamptz, pk(user_id,challenge_id))
user_badges(user_id uuid, badge_key text, earned_at timestamptz, pk(user_id,badge_key))
-- matview: trending_sellers(seller_id, sales_7d, likes_7d, rank)
```

All tables RLS-enabled: a user may read/write only their own rows; status fields
needed for public display (level, badges, leaderboard rank) exposed via
read-only views or already-public profile columns.

## Out of scope (YAGNI)

- Points/coins economy with spendable currency — fights the minimal aesthetic and
  adds fulfillment/abuse surface. Levels + badges deliver status without it.
- Paid boosts tied to gamification — separate monetization track.

## Testing

- Phase 1: unit tests for `computeLevel`, `profileCompletion`, `computeBadges`
  (boundary cases: 0 sales, unrated, exactly-at-threshold, max level).
- Phases 2–4: RLS policy tests; cron idempotency; e2e for the visible surfaces.
