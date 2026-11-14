import { useCallback, useState } from 'react';
import { onlineManager } from '@tanstack/react-query';

/**
 * RefreshControl state for user-initiated pulls only. Binding `refreshing` to a
 * query's `isRefetching` also lights the spinner on every background refetch
 * (focus, invalidation, cache rehydrate), so it pops over content unprompted.
 *
 * Offline, Query pauses fetches until the network returns, so awaiting the
 * refetch would spin forever; the offline banner already says why.
 */
export function usePullRefresh(refresh: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (!onlineManager.isOnline()) {
      // Flip back so the native spinner (already turning from the pull) stops.
      setTimeout(() => setRefreshing(false), 400);
      return;
    }
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);
  return { refreshing, onRefresh };
}
