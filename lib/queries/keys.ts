// ─────────────────────────────────────────────────────────────────────────────
// CENTRALIZED QUERY KEY FACTORY (qk)
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Query Key Factory Pattern
// In TanStack Query (React Query), cache entries are keyed by hierarchical arrays.
// Without a centralized factory:
//   1. Typos like ['profile', id] vs ['profiles', id] cause hard-to-trace cache misses.
//   2. Cache invalidation across components becomes fragile and scattered.
//   3. Refetching or optimistic updates fail silently if array shapes don't match.
//
// By organizing all keys into the `qk` object using `as const` tuples, TypeScript
// strictly enforces key structures everywhere. Invalidation also becomes crystal
// clear: `qc.invalidateQueries({ queryKey: qk.profile(userId) })`.
// ─────────────────────────────────────────────────────────────────────────────

import type { FeedTab, SortKey } from '@/lib/listings';

export type { FeedTab, SortKey };
export type HomeFeedTab = FeedTab | 'following';

export const listingKey = (id: string) => ['listing', id] as const;
export const likedIdsKey = (userId: string) => ['likedIds', userId] as const;
export const savedIdsKey = (userId: string) => ['savedIds', userId] as const;

// ── Explicit Query Key Prefixes ─────────────────────────────────────────────
export const MY_FEED_LISTINGS_PREFIX = 'myFeedListings';
export const HOME_FEED_PREFIX = 'homeFeed';
export const FEED_LISTINGS_PREFIX = 'feedListings';
export const USER_LISTINGS_PREFIX = 'userListings';
export const SAVED_LISTINGS_PREFIX = 'savedListings';
export const LIKED_LISTINGS_PREFIX = 'likedListings';
export const SELLER_OTHER_LISTINGS_PREFIX = 'sellerOtherListings';
export const SIMILAR_LISTINGS_PREFIX = 'similarListings';
export const TAG_LISTINGS_PREFIX = 'tagListings';
export const PRICE_DROPS_PREFIX = 'priceDrops';
export const NEW_FROM_FOLLOWED_PREFIX = 'newFromFollowed';

export const LISTING_QUERY_PREFIXES = [
  MY_FEED_LISTINGS_PREFIX,
  HOME_FEED_PREFIX,
  FEED_LISTINGS_PREFIX,
  USER_LISTINGS_PREFIX,
  SAVED_LISTINGS_PREFIX,
  LIKED_LISTINGS_PREFIX,
  SELLER_OTHER_LISTINGS_PREFIX,
  SIMILAR_LISTINGS_PREFIX,
  TAG_LISTINGS_PREFIX,
  PRICE_DROPS_PREFIX,
  NEW_FROM_FOLLOWED_PREFIX,
] as const;

/**
 * Centralized, strictly-typed query keys for all cache operations in Grabsty.
 */
export const qk = {
  // ── Profile & Users ────────────────────────────────────────────────────────
  profile: (id: string) => ['profile', id] as const,
  userListings: (id: string) => [USER_LISTINGS_PREFIX, id] as const,

  // ── Listings & Engagement ──────────────────────────────────────────────────
  // The detail row for one listing, and the two batched engagement sets.
  // Re-exported from adapter modules to keep the import graph acyclic.
  listing: listingKey,
  likedIds: likedIdsKey,
  savedIds: savedIdsKey,
  likedListings: (userId: string | null) => [LIKED_LISTINGS_PREFIX, userId] as const,
  saveLists: (userId: string | null) => ['saveLists', userId] as const,
  listingsInList: (listId: string | null) => ['listingsInList', listId] as const,
  savedListings: (userId: string | null) => [SAVED_LISTINGS_PREFIX, userId] as const,
  sellerOtherListings: (sellerId: string | null, excludeId: string | null) =>
    [SELLER_OTHER_LISTINGS_PREFIX, sellerId, excludeId] as const,
  similarListings: (listingId: string | null) => [SIMILAR_LISTINGS_PREFIX, listingId] as const,
  listingLikers: (listingId: string | null | undefined) => ['listingLikers', listingId] as const,

  // ── Social & Follows ───────────────────────────────────────────────────────
  followState: (viewerId: string | null, targetId: string) =>
    ['followState', viewerId, targetId] as const,
  suggestedFollows: (userId: string | null) => ['suggestedFollows', userId] as const,
  followers: (userId: string) => ['followers', userId] as const,
  following: (userId: string) => ['following', userId] as const,
  // `scope` distinguishes the two lists that can be on screen for the same
  // viewer (e.g. 'followers:<id>' vs 'following:<id>'), so opening one does not
  // clobber the other's cached mask.
  //
  // `ids` is part of the key so changes in pagination recompute correctly.
  followingMask: (viewerId: string | null, scope: string, ids: string[]) =>
    [...qk.followingMaskScope(viewerId, scope), ids] as const,
  // Scope prefix for optimistic list-wide mutations across paginated chunks:
  followingMaskScope: (viewerId: string | null, scope: string) =>
    ['followingMask', viewerId, scope] as const,

  // ── Feeds & Discovery ──────────────────────────────────────────────────────
  feedListings: (
    tab: FeedTab,
    category: string | null,
    subcategory: string | null,
    sort: SortKey | null,
  ) => [FEED_LISTINGS_PREFIX, tab, category, subcategory, sort] as const,
  recommendations: (userId: string | null) => ['recommendations', userId] as const,
  recentlyViewed: (userId: string | null) => ['recentlyViewed', userId] as const,
  homeFeed: (tab: HomeFeedTab, userId: string | null) =>
    [HOME_FEED_PREFIX, tab, userId] as const,
  myFeedListings: (userId: string | null) => [MY_FEED_LISTINGS_PREFIX, userId] as const,
  priceDrops: (userId: string | null) => [PRICE_DROPS_PREFIX, userId] as const,
  newFromFollowed: (userId: string | null) => [NEW_FROM_FOLLOWED_PREFIX, userId] as const,
  savedSearches: (userId: string | null) => ['savedSearches', userId] as const,
  // `ids` is part of the key so adding or deleting a saved search refetches
  // the counts instead of serving a total that still includes the deleted row.
  savedSearchMatches: (userId: string | null, ids: string) =>
    ['savedSearchMatches', userId, ids] as const,

  // ── Search Hub Indices ─────────────────────────────────────────────────────
  brandIndex: () => ['brandIndex'] as const,
  tagIndex: () => ['tagIndex'] as const,
  tagListings: (tag: string | null) => [TAG_LISTINGS_PREFIX, tag] as const,

  // ── Inbox & Chat ───────────────────────────────────────────────────────────
  inbox: (userId: string | null) => ['inbox', userId] as const,

  // ── Transactions & Orders ──────────────────────────────────────────────────
  myOrders: (userId: string | null) => ['myOrders', userId] as const,

  // ── Wardrobe ───────────────────────────────────────────────────────────────
  wardrobeDeck: (userId: string | null) => ['wardrobeDeck', userId] as const,
  myWardrobe: (userId: string | null) => ['myWardrobe', userId] as const,
  likedWardrobe: (userId: string | null) => ['likedWardrobe', userId] as const,
};
