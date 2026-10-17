import { useCallback, useMemo } from 'react';
import { View, FlatList, RefreshControl, Platform } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { EmptyState } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useNewFromFollowedQuery } from '@/lib/queries';
import { useOpenedNewsIds } from '@/lib/newsStorage';
import { NewsSkeletonList } from './NewsRowSkeleton';
import { NewsActivityRow, type ActivityItem } from './NewsActivityRow';
import type { Listing } from '@/types';
import { usePullRefresh } from '@/hooks/usePullRefresh';

function RowSeparator() {
  const { theme } = useTheme();
  return <View style={{ height: 1, backgroundColor: theme.border, width: '100%' }} />;
}

export function FollowingTab({
  bottomInset = 24,
  filter = 'all',
}: {
  bottomInset?: number;
  filter?: 'all' | 'buyer' | 'important';
}) {
  const { theme } = useTheme();
  const { user, profile } = useAuth();
  const { openedIds } = useOpenedNewsIds();
  const userId = user?.id ?? null;

  // News notifications strictly from followed accounts only
  const followedQ = useNewFromFollowedQuery(userId);

  const isLoading = userId ? followedQ.isLoading : false;
  const refetchAll = useCallback(() => followedQ.refetch(), [followedQ]);
  const { refreshing, onRefresh } = usePullRefresh(refetchAll);

  const activities = useMemo<ActivityItem[]>(() => {
    const followedListings = followedQ.data ?? [];

    return followedListings.map((listing: Listing) => {
      const seller = listing.seller;
      return {
        id: `listing-${listing.id}`,
        kind: 'listing_created' as const,
        actor: {
          id: seller?.id || 'seller',
          username: seller?.username || 'Seller',
          full_name: seller?.full_name || seller?.username || 'Creator',
          avatar_url: seller?.avatar_url,
        },
        listing,
        created_at: listing.created_at,
      };
    });
  }, [followedQ.data]);

  const filteredActivities = useMemo(() => {
    if (filter === 'all') return activities;
    if (filter === 'buyer') {
      return activities.filter(
        (a) =>
          a.kind === 'listing_created' ||
          a.kind === 'price_drop' ||
          a.kind === 'search_alert',
      );
    }
    if (filter === 'important') {
      return activities.filter(
        (a) => a.kind === 'price_drop' || a.kind === 'search_alert',
      );
    }
    return activities;
  }, [activities, filter]);

  const renderItem = useCallback(
    ({ item }: { item: ActivityItem }) => (
      <NewsActivityRow item={item} isRead={openedIds.has(item.id)} />
    ),
    [openedIds],
  );

  if (isLoading && filteredActivities.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <NewsSkeletonList count={5} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <FlatList
        data={filteredActivities}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ItemSeparatorComponent={RowSeparator}
        contentContainerStyle={
          filteredActivities.length === 0 ? { flex: 1 } : { paddingBottom: bottomInset }
        }
        removeClippedSubviews={Platform.OS === 'android'}
        ListEmptyComponent={
          <EmptyState
            icon={filter === 'important' ? 'alert-circle' : filter === 'buyer' ? 'shopping-bag' : 'bell'}
            title={
              filter === 'buyer'
                ? 'No buyer notifications'
                : filter === 'important'
                ? 'No important notifications'
                : 'No notifications'
            }
            description={
              filter === 'buyer'
                ? 'Updates on price drops and new drops from sellers you follow will appear here.'
                : filter === 'important'
                ? 'Order updates and critical alerts will appear here.'
                : (profile?.following_count ?? 0) > 0
                ? 'Nothing new from the sellers you follow yet. Their new listings will show up here.'
                : 'Follow creators, curators, and brands to see their new drops, likes, and follows here.'
            }
            cta={{
              label: 'Explore marketplace',
              icon: 'compass',
              onPress: () => router.push('/' as any),
            }}
          />
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.purple}
          />
        }
      />
    </View>
  );
}
