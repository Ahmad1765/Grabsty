import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { PersistQueryClientProviderProps } from '@tanstack/react-query-persist-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { FEED_TTL_MS } from '@/lib/freshness';

// Single app-wide QueryClient. Defaults are tuned to reproduce the behaviour of
// the hand-rolled caches we're replacing (lib/freshness, lib/listingCache):
//
//  - staleTime = FEED_TTL_MS (60s): a screen that re-mounts / re-focuses within
//    the window reuses cached data instead of refetching — exactly what the old
//    isFresh() gate did, now for free and per-query.
//  - gcTime 5m: keep data around after a screen unmounts so back-navigation is
//    instant (the role lib/listingCache played).
//  - retry 2 with capped backoff: the Supabase web client occasionally wedges;
//    a couple of retries recovers most transient failures without hanging.
//  - refetchOnWindowFocus off: this app drives focus refetches explicitly via
//    expo-router; staleTime already covers the "reuse if fresh" case.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: FEED_TTL_MS,
      gcTime: 5 * 60_000,
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      refetchOnWindowFocus: false,
    },
  },
});

// ── Offline cache persistence ──────────────────────────────────────────────
// Dehydrate the Query cache to AsyncStorage so a cold launch paints last-known
// data instantly instead of an empty app — the core of "offline friendly". On
// boot the cache is rehydrated; each query still respects staleTime (60s), so
// anything stale refetches in the background behind the restored paint.
const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  // Coalesce writes — the cache changes far more often than we need to persist.
  throttleTime: 1_000,
  key: 'CARRINEX_QUERY_CACHE',
});

// Never written to disk: AsyncStorage is unencrypted (localStorage on web), and
// these hold other people's data — myOrders carries buyers' shipping addresses
// for sellers, inbox carries message previews. They refetch on launch instead.
const PRIVATE_QUERY_PREFIXES = new Set([
  'myOrders',
  'orderForListing',
  'inbox',
  'savedSearches',
  'savedSearchMatches',
  'recentlyViewed',
]);

/** Drops every cached query, in memory and on disk. Called on any sign-out. */
export function clearQueryCache(): void {
  queryClient.clear();
  void persister.removeClient();
}

export const persistOptions: PersistQueryClientProviderProps['persistOptions'] = {
  persister,
  // Discard anything older than a day so we never resurrect deeply stale data.
  maxAge: 1000 * 60 * 60 * 24,
  // Bust the entire persisted cache when the app version changes, so a shipped
  // schema/shape change can't rehydrate incompatible cached entries.
  buster: Constants.expoConfig?.version ?? '1',
  dehydrateOptions: {
    // Only persist successful queries — never cache error/loading states to disk.
    shouldDehydrateQuery: (query) =>
      query.state.status === 'success' &&
      !PRIVATE_QUERY_PREFIXES.has(String(query.queryKey[0])),
  },
};

