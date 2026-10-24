import { useCallback, useState } from 'react';

/**
 * RefreshControl state for user-initiated pulls only. Binding `refreshing` to a
 * query's `isRefetching` also lights the spinner on every background refetch
 * (focus, invalidation, cache rehydrate), so it pops over content unprompted.
 */
export function usePullRefresh(refresh: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);
  return { refreshing, onRefresh };
}
