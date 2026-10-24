// ─────────────────────────────────────────────────────────────────────────────
// LISTINGS & ENGAGEMENT QUERY HOOKS
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Custom Hook Encapsulation & Optimistic Mutations
//
// 1. Encapsulation:
//    Screens should not know about Supabase queries, SQL selects, or retry flags.
//    By encapsulating these into custom hooks (e.g. `useListingQuery`, `useToggleLike`),
//    screens simply consume `{ data, isLoading, mutate }`.
//
// 2. Read-Side Normalization (`select`):
//    Normalizing data (like providing fallback values for nullable relationships)
//    is performed on the read side via TanStack Query's `select` option. This keeps
//    the raw cached entity canonical and prevents shape conflicts between different
//    cache writers.
//
// 3. Optimistic Updates with Rollback (`onMutate` -> `onError`):
//    When a user likes a listing or marks it sold, we instantly update the cache
//    in `onMutate` and save the previous snapshot. If the network request fails,
//    `onError` automatically restores the snapshot so the UI never stays out of sync.
// ─────────────────────────────────────────────────────────────────────────────

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  deleteListing,
  fetchLikedListings,
  fetchSellerOtherListings,
  fetchSimilarListings,
  toggleLike,
  updateListing,
  fetchListingLikers,
  SELECT_LISTING_WITH_SELLER,
} from '@/lib/listings';
import {
  ENGAGEMENT_TTL_MS,
  fetchLikedIds,
  fetchSavedIds,
  updateLikedCache,
} from '@/lib/engagementCache';
import {
  ensureSaveLists,
  fetchListingsInList,
  fetchSavedListings,
  listSaveLists,
  type SaveList,
} from '@/lib/saves';
import type { Listing } from '@/types';
import { qk } from './keys';

/**
 * Module-private fetcher for a single listing row.
 * Throws on actual network error, returns null if row not found.
 */
async function fetchListingRow(id: string, signal?: AbortSignal): Promise<Listing | null> {
  const filter = supabase.from('listings').select(SELECT_LISTING_WITH_SELLER).eq('id', id);
  const query = signal ? filter.abortSignal(signal) : filter;
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as Listing) ?? null;
}

/**
 * Hook to fetch a single listing by ID with TanStack Query caching and retries.
 */
export function useListingQuery<T = Listing | null>(
  id: string | null | undefined,
  select?: (row: Listing | null) => T,
) {
  return useQuery<Listing | null, Error, T>({
    queryKey: qk.listing(id ?? ''),
    enabled: !!id,
    queryFn: ({ signal }) => fetchListingRow(id as string, signal),
    select,
  });
}

/**
 * The viewer's liked listing IDs as an array.
 * Batched app-wide: one query per user per 30s answers the heart icons across all cards.
 */
export function useLikedIdsQuery(userId: string | null) {
  return useQuery({
    queryKey: qk.likedIds(userId ?? ''),
    enabled: !!userId,
    staleTime: ENGAGEMENT_TTL_MS,
    queryFn: (): Promise<string[]> => fetchLikedIds(userId as string),
  });
}

/**
 * The viewer's saved bookmark listing IDs as an array.
 */
export function useSavedIdsQuery(userId: string | null) {
  return useQuery({
    queryKey: qk.savedIds(userId ?? ''),
    enabled: !!userId,
    staleTime: ENGAGEMENT_TTL_MS,
    queryFn: (): Promise<string[]> => fetchSavedIds(userId as string),
  });
}

/**
 * Helper to patch fields on a cached listing row while preserving its original timestamp.
 */
function patchListing(qc: QueryClient, listingId: string, patch: Partial<Listing>): void {
  const state = qc.getQueryState<Listing>(qk.listing(listingId));
  if (!state || !state.data) return;
  qc.setQueryData<Listing>(
    qk.listing(listingId),
    { ...state.data, ...patch },
    { updatedAt: state.dataUpdatedAt },
  );
}

/**
 * Optimistic like/unlike mutation that synchronizes the heart state and like count simultaneously.
 */
export function useToggleLike(userId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ listingId, currentlyLiked }: { listingId: string; currentlyLiked: boolean }) =>
      toggleLike(listingId, userId as string, currentlyLiked),
    onMutate: async ({ listingId, currentlyLiked }) => {
      const next = !currentlyLiked;
      await qc.cancelQueries({ queryKey: qk.likedIds(userId ?? '') });
      const prevRow = qc.getQueryData<Listing>(qk.listing(listingId));
      const prevLikes = prevRow ? prevRow.likes : undefined;
      updateLikedCache(userId as string, listingId, next);
      const bumped = Math.max(0, Number(prevLikes ?? 0) + (next ? 1 : -1));
      patchListing(qc, listingId, { likes: bumped });
      return { prevLikes, next };
    },
    onError: (_e, { listingId, currentlyLiked }, ctx) => {
      updateLikedCache(userId as string, listingId, currentlyLiked);
      if (ctx) patchListing(qc, listingId, { likes: ctx.prevLikes });
    },
    onSuccess: (committed, { listingId, currentlyLiked }, ctx) => {
      if (committed !== currentlyLiked) return;
      // Server disagreed — rollback to previous value
      updateLikedCache(userId as string, listingId, currentlyLiked);
      if (ctx) patchListing(qc, listingId, { likes: ctx.prevLikes });
    },
    onSettled: (_data, _error, { listingId }) => {
      qc.invalidateQueries({ queryKey: qk.listingLikers(listingId) });
    },
  });
}

/**
 * Owner action: hard delete listing and purge from relevant query caches.
 */
export function useDeleteListing(sellerId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (listingId: string) => deleteListing(listingId),
    onSuccess: (ok, listingId) => {
      if (!ok) return;
      qc.removeQueries({ queryKey: qk.listing(listingId) });
      if (sellerId) qc.invalidateQueries({ queryKey: qk.userListings(sellerId) });
      qc.invalidateQueries({ queryKey: ['sellerOtherListings'] });
    },
  });
}

/**
 * Owner action: update listing fields and update cache.
 */
export function useUpdateListing(sellerId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ listingId, input }: { listingId: string; input: Parameters<typeof updateListing>[1] }) =>
      updateListing(listingId, input),
    onSuccess: (res, { listingId, input }) => {
      if (!res.ok) return;
      patchListing(qc, listingId, input as Partial<Listing>);
      qc.invalidateQueries({ queryKey: qk.listing(listingId) });
      if (sellerId) qc.invalidateQueries({ queryKey: qk.userListings(sellerId) });
      qc.invalidateQueries({ queryKey: ['sellerOtherListings'] });
      qc.invalidateQueries({ queryKey: ['similarListings'] });
      qc.invalidateQueries({ queryKey: ['feedListings'] });
      qc.invalidateQueries({ queryKey: ['homeFeed'] });
      qc.invalidateQueries({ queryKey: ['tagListings'] });
    },
  });
}

/**
 * Other listings from the same seller rail.
 */
export function useSellerOtherListingsQuery(
  sellerId: string | null,
  excludeId: string | null,
  limit = 6,
) {
  return useQuery({
    queryKey: qk.sellerOtherListings(sellerId, excludeId),
    enabled: !!sellerId,
    queryFn: (): Promise<Listing[]> =>
      fetchSellerOtherListings(sellerId as string, excludeId, limit),
  });
}

/**
 * Similar listings rail for product detail page.
 */
export function useSimilarListingsQuery(
  listingId: string | null,
  limit = 6,
  // Only a hint for the fallback path; never gates the query (it starts
  // immediately, in parallel with the listing itself).
  category?: string | null,
) {
  return useQuery({
    queryKey: qk.similarListings(listingId),
    enabled: !!listingId,
    queryFn: (): Promise<Listing[]> => fetchSimilarListings(listingId as string, limit, category),
  });
}

/**
 * Liked listings grid for saved / liked tab.
 */
export function useLikedListingsQuery(userId: string | null) {
  return useQuery({
    queryKey: qk.likedListings(userId),
    enabled: !!userId,
    queryFn: (): Promise<Listing[]> => fetchLikedListings(userId as string),
  });
}

/**
 * Save-list collections (folders) for a user.
 */
export function useSaveListsQuery(userId: string | null) {
  return useQuery({
    queryKey: qk.saveLists(userId),
    enabled: !!userId,
    queryFn: async (): Promise<SaveList[]> => {
      // List first; seed only when ensure_save_lists would actually create
      // something (no default list, or no custom lists — its two conditions).
      // Most users already have both, so this skips a round trip.
      const lists = await listSaveLists(userId as string);
      const hasDefault = lists.some((l) => l.is_default);
      const hasCustom = lists.some((l) => !l.is_default);
      if (hasDefault && hasCustom) return lists;
      await ensureSaveLists(userId as string);
      return listSaveLists(userId as string);
    },
  });
}

/**
 * Listings inside a specific save-list collection.
 */
export function useListingsInListQuery(listId: string | null) {
  return useQuery({
    queryKey: qk.listingsInList(listId),
    enabled: !!listId,
    queryFn: (): Promise<Listing[]> => fetchListingsInList(listId as string),
  });
}

/**
 * All saved listings for a user.
 */
export function useSavedListingsQuery(userId: string | null) {
  return useQuery({
    queryKey: qk.savedListings(userId),
    enabled: !!userId,
    queryFn: (): Promise<Listing[]> => fetchSavedListings(userId as string),
  });
}

/**
 * Members who liked a specific listing.
 */
export function useListingLikersQuery(listingId: string | null | undefined) {
  return useQuery({
    queryKey: qk.listingLikers(listingId),
    enabled: !!listingId,
    queryFn: () => fetchListingLikers(listingId as string),
    staleTime: 30_000,
  });
}
