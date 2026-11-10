// ─────────────────────────────────────────────────────────────────────────────
// HOME & DISCOVERY FEED QUERY HOOKS
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Infinite Queries & Server State Synchronization
//
// 1. Infinite Scrolling with `useInfiniteQuery`:
//    The home feed paginates seamlessly using `getNextPageParam`. TanStack Query
//    manages pageParam accumulation and keeps previously loaded pages in memory
//    so scrolling back up is completely instantaneous.
//
// 2. Resilient Error Recovery:
//    When custom RPCs or queries fail, throwing an error ensures TanStack Query
//    retains the last-known good snapshot (`data`) rather than wiping out the UI
//    with a blank screen.
// ─────────────────────────────────────────────────────────────────────────────

import { useUnreadNotificationsCount } from '@/lib/notificationsFeed';
import {
  
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  
  fetchListings,
  
  type FeedTab,
  type SortKey,
} from '@/lib/listings';
import { fetchRecommendations, } from '@/lib/recommendations';
import { fetchNewFromFollowed, } from '@/lib/myFeed';
import {
  deleteSavedSearch,
  fetchNewMatchesCount,
  listSavedSearches,
  type SavedSearch,
} from '@/lib/savedSearches';
import type { Listing } from '@/types';
import { qk, } from './keys';

export type SavedSearchMatches = {
  /** New-match count per saved-search id. */
  counts: Record<string, number>;
  /** Their sum — what the Inbox's Activity badge shows. */
  total: number;
};


/**
 * My Feed primary grid: personalized recommendations for a signed-in user,
 * newest-first as the anonymous fallback.
 */
export function useMyFeedListingsQuery(userId: string | null) {
  return useQuery({
    queryKey: qk.myFeedListings(userId),
    queryFn: () =>
      userId ? fetchRecommendations(48) : fetchListings({ tab: 'for_you', limit: 60 }),
  });
}
/**
 * New items listed by followed sellers.
 */
export function useNewFromFollowedQuery(userId: string | null) {
  return useQuery({
    queryKey: qk.newFromFollowed(userId),
    enabled: !!userId,
    queryFn: async (): Promise<Listing[]> => {
      const r = await fetchNewFromFollowed(userId as string);
      if (!r.ok) throw new Error('new-from-followed unavailable');
      return r.rows;
    },
  });
}

/**
 * List saved searches for a user.
 */
export function useSavedSearchesQuery(userId: string | null) {
  return useQuery({
    queryKey: qk.savedSearches(userId),
    enabled: !!userId,
    queryFn: (): Promise<SavedSearch[]> => listSavedSearches(userId as string),
  });
}

/**
 * How many listings have landed under each saved search since the user last opened it.
 */
export function useSavedSearchMatchesQuery(userId: string | null, searches: SavedSearch[]) {
  const ids = searches.map((s) => s.id);
  return useQuery({
    queryKey: qk.savedSearchMatches(userId, ids.join(',')),
    enabled: !!userId && ids.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<SavedSearchMatches> => {
      const pairs = await Promise.all(
        ids.map(async (id) => {
          try {
            return [id, await fetchNewMatchesCount(id)] as const;
          } catch (err) {
            console.warn('[activity] new-match count failed for', id, err);
            return [id, 0] as const;
          }
        }),
      );
      return {
        counts: Object.fromEntries(pairs),
        total: pairs.reduce((sum, [, n]) => sum + n, 0),
      };
    },
  });
}

/**
 * Unread total behind the Inbox's Activity tab badge.
 */
/** Bell badge: unread items in the Notifications feed (orders, offers, activity). */
export function useActivityUnreadCount(userId: string | null): number {
  return useUnreadNotificationsCount(userId);
}

/**
 * Optimistic saved-search delete mutation.
 */
export function useDeleteSavedSearch(userId: string | null) {
  const qc = useQueryClient();
  const key = qk.savedSearches(userId);
  return useMutation({
    mutationFn: async (id: string) => {
      const ok = await deleteSavedSearch(id);
      if (!ok) throw new Error('delete failed');
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<SavedSearch[]>(key);
      qc.setQueryData<SavedSearch[]>(key, (old) => (old ?? []).filter((s) => s.id !== id));
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ['savedSearchMatches'] });
    },
  });
}
/**
 * Filtered catalog listings query for categories and sorts.
 */
export function useFeedListingsQuery(opts: {
  tab: FeedTab;
  category?: string | null;
  subcategory?: string | null;
  sort?: SortKey | null;
  limit?: number;
  enabled?: boolean;
}) {
  const { tab, category = null, subcategory = null, sort = null, limit = 60, enabled = true } = opts;
  return useQuery({
    queryKey: qk.feedListings(tab, category, subcategory, sort),
    enabled,
    queryFn: (): Promise<Listing[]> => fetchListings({ tab, category, subcategory, sort, limit }),
  });
}

/**
 * Personalized recommendations query.
 */
export function useRecommendationsQuery(userId: string | null, limit = 12) {
  return useQuery({
    queryKey: qk.recommendations(userId),
    enabled: !!userId,
    queryFn: () => fetchRecommendations(limit),
  });
}
