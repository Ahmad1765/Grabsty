// ─────────────────────────────────────────────────────────────────────────────
// HOME SCREEN (FEED CONTAINER / COORDINATOR)
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Coordinator Component for Multi-Source Feeds
//
// 1. Data Orchestration:
//    Coordinates 5 distinct server state queries (`useMyFeedListingsQuery`,
//    `useFeedListingsQuery`, `usePriceDropsQuery`, `useSavedSearchesQuery`,
//    `useSavedListingsQuery`) with automatic stale-while-revalidate caching.
//
// 2. Performance Isolation:
//    Search and structured filter mutations are delegated to `useHomeFeedFilters`.
//    UI presentation is split between `HomeHeader`, `PriceDropRail`, and `GridRow`.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/context/ThemeContext';
import { useToast } from '@/lib/toast';
import { cardImageUrl, getOptimizedImageUrl, prefetchImages } from '@/lib/images';
import { DropAlertSheet } from '@/components/DropAlertSheet';
import { FeedFilterSheet } from '@/components/navigation/FeedFilterSheet';
import { ProfileQrSheet } from '@/components/profile/ProfileQrSheet';
import {
  useMyFeedListingsQuery,
  useFeedListingsQuery,
  useSavedSearchesQuery,
  useSavedListingsQuery,
  useDeleteSavedSearch,
  useActivityUnreadCount,
} from '@/lib/queries';
import {
  useGridDimensions,
  useTabBarClearance,
  useIsDesktop,
  useDesktopGutter,
  useContentWidth,
  GRID_DRAW_DISTANCE,
  DESKTOP_FEED_MAX,
} from '@/lib/responsive';
import type { Listing } from '@/types';
import { usePullRefresh } from '@/hooks/usePullRefresh';
import type { SavedSearch } from '@/lib/savedSearches';
import {
  GridPlaceholder,
  GridRow,
  HomeHeader,
  HomeSearchView,
  useHomeFeedFilters,
  DesktopSectionTitle,
  DesktopFooter,
  DesktopFilterRail,
  FILTER_RAIL_WIDTH,
} from '@/components/home';
import { focusDesktopSearch } from '@/components/navigation/DesktopSearch';

const HORIZONTAL_PAD = 12;
const GRID_GAP = 8;
const RAIL_GAP = 28;
const EMPTY_LISTINGS: Listing[] = [];
const EMPTY_SAVED_SEARCHES: SavedSearch[] = [];

export default function HomeScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const toast = useToast();
  const [alertSheetOpen, setAlertSheetOpen] = useState(false);
  const [searchModeOpen, setSearchModeOpen] = useState(false);
  const [initialSearchCategory, setInitialSearchCategory] = useState<string | null>(null);
  const [initialSearchQuery, setInitialSearchQuery] = useState<string>('');
  const [showShareModal, setShowShareModal] = useState(false);

  const params = useLocalSearchParams<{
    searchOpen?: string;
    searchCategory?: string;
    searchQuery?: string;
    searchTab?: string;
    category?: string;
    q?: string;
  }>();
  const isDesktop = useIsDesktop();

  const navigation = useNavigation();

  useEffect(() => {
    navigation.setOptions({
      tabBarStyle: searchModeOpen ? { display: 'none' } : undefined,
    });
  }, [navigation, searchModeOpen]);

  useEffect(() => {
    const cat = params.searchCategory || (params.searchOpen === '1' ? params.category : undefined);
    const query = params.searchQuery || (params.searchOpen === '1' ? params.q : undefined);

    // Desktop types in the header field (DesktopSearch), so a bare
    // ?searchOpen=1 focuses that rather than opening a second field here, and
    // each header search fully replaces the previous one's query + category.
    if (isDesktop && params.searchOpen === '1' && !cat && !query) {
      focusDesktopSearch();
      router.setParams({ searchOpen: undefined });
      return;
    }
    if (params.searchOpen === '1' || cat || query) {
      if (isDesktop) {
        setInitialSearchCategory(cat ?? null);
        setInitialSearchQuery(query ?? '');
      } else {
        if (cat !== undefined) setInitialSearchCategory(cat);
        if (query !== undefined) setInitialSearchQuery(query);
      }
      setSearchModeOpen(true);
    }
  }, [params.searchOpen, params.searchCategory, params.searchQuery, params.category, params.q, isDesktop]);

  const listRef = useRef<FlashListRef<Listing[]>>(null);
  const scrollToTop = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);

  // Desktop: a centred frame (DESKTOP_FEED_MAX) holding the filter rail and
  // the feed beside it. The grid sizes from what is left after the rail.
  const gutter = useDesktopGutter(DESKTOP_FEED_MAX);
  const contentWidth = useContentWidth();
  const railSpace = isDesktop ? FILTER_RAIL_WIDTH + RAIL_GAP : 0;
  const { columns, cardWidth } = useGridDimensions({
    min: 2,
    max: 4,
    thresholds: isDesktop ? [560, 800] : [560, 900, 1200],
    horizontalPadding: HORIZONTAL_PAD,
    gap: GRID_GAP,
    maxWidth: isDesktop ? Math.min(contentWidth, DESKTOP_FEED_MAX) - railSpace : undefined,
  });
  const tabClear = useTabBarClearance();

  // ── Queries ──────────────────────────────────────────────────────────────
  const userId = user?.id ?? null;
  const feedQ = useMyFeedListingsQuery(userId);
  const trendingQ = useFeedListingsQuery({ tab: 'popular', limit: 60 });
  const savedSearchesQ = useSavedSearchesQuery(userId);
  const savedListingsQ = useSavedListingsQuery(userId);
  const deleteSavedSearchM = useDeleteSavedSearch(userId);
  const unreadNotifications = useActivityUnreadCount(userId);

  const listings = feedQ.data ?? EMPTY_LISTINGS;
  const loading = feedQ.isLoading;
  const trendingListings = trendingQ.data ?? EMPTY_LISTINGS;
  const trendingLoading = trendingQ.isLoading;
  const savedSearches = savedSearchesQ.data ?? EMPTY_SAVED_SEARCHES;
  const savedListings = savedListingsQ.data ?? EMPTY_LISTINGS;
  const loadingSaved = savedListingsQ.isLoading;

  // Proactively warm up browser/disk cache with top visible cards
  useEffect(() => {
    const topList = (listings.length ? listings : trendingListings).slice(0, 8);
    if (topList.length > 0) {
      prefetchImages(
        topList.map((l) => getOptimizedImageUrl(cardImageUrl(l, 0), { width: 400 })),
      );
    }
  }, [listings, trendingListings]);

  const { isStale: feedStale, refetch: feedRefetch } = feedQ;
  const { isStale: trendingStale, refetch: trendingRefetch } = trendingQ;
  const { isStale: searchesStale, refetch: searchesRefetch } = savedSearchesQ;
  const { isStale: savedStale, refetch: savedRefetch } = savedListingsQ;

  // ── Focus Effect & Revalidation ──────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      if (feedStale) feedRefetch();
      if (trendingStale) trendingRefetch();
      if (userId && searchesStale) searchesRefetch();
      if (userId && savedStale) savedRefetch();
    }, [
      feedStale,
      feedRefetch,
      trendingStale,
      trendingRefetch,
      searchesStale,
      searchesRefetch,
      savedStale,
      savedRefetch,
      userId,
    ]),
  );

  const refetchAll = useCallback(
    () =>
      Promise.all([
        feedRefetch(),
        trendingRefetch(),
        ...(userId ? [searchesRefetch(), savedRefetch()] : []),
      ]),
    [feedRefetch, trendingRefetch, searchesRefetch, savedRefetch, userId],
  );
  const { refreshing, onRefresh } = usePullRefresh(refetchAll);

  // ── Multi-Tier Client Filter Hook ────────────────────────────────────────
  const feedFilter = useHomeFeedFilters({
    listings,
    trendingListings,
    savedListings,
    savedSearches,
    deleteSavedSearchM,
    feedRefetch,
    trendingRefetch,
    scrollToTop,
    columns,
  });

  const gridLoading = feedFilter.showingSaved
    ? loadingSaved
    : feedFilter.showingTrending
      ? trendingLoading
      : loading;

  const renderRow = useCallback(
    ({ item }: { item: Listing[] }) => (
      <GridRow row={item} columns={columns} cardWidth={cardWidth} />
    ),
    [columns, cardWidth],
  );

  const rowKey = useCallback((row: Listing[]) => row[0]?.id ?? 'empty', []);

  // ── Composed Header Element ──────────────────────────────────────────────
  const homeHeader = (
    <HomeHeader
      searchProps={{
        value: feedFilter.query,
        onChangeText: feedFilter.setQuery,
        focused: feedFilter.searchFocused,
        onFocus: () => feedFilter.setSearchFocused(true),
        onBlur: () => feedFilter.setSearchFocused(false),
        onPressSearch: () => setSearchModeOpen(true),
        resultCount:
          feedFilter.isSearching || feedFilter.activeFilterCount > 0
            ? feedFilter.filteredListings.length
            : null,
        filterCount: feedFilter.activeFilterCount,
        onOpenFilter: () => feedFilter.setFilterOpen(true),
        unreadNotificationsCount: unreadNotifications,
        onPressNotifications: () => router.push('/news' as any),
        onOpenShareProfile: profile?.username ? () => setShowShareModal(true) : undefined,
      }}
      chipProps={{
        savedSearches,
        activeChip: feedFilter.activeChip,
        dynamicChip: feedFilter.dynamicChip,
        onSelectChip: feedFilter.selectChip,
        onResetDynamicChip: feedFilter.resetDynamicChip,
        onDeleteChip: feedFilter.onDeleteChip,
        onAdd: () => {
          if (!user?.id) {
            toast.show('Sign in to create drop alerts', { variant: 'info', icon: 'log-in' });
            router.push('/auth/login');
            return;
          }
          setAlertSheetOpen(true);
        },
      }}
    />
  );
  // Desktop: a section heading over the feed and a footer under it.
  const count = feedFilter.filteredListings.length;
  const listHeader = isDesktop ? (
    <>
      <DesktopSectionTitle
        title={feedFilter.showingSaved ? 'Saved' : feedFilter.showingTrending ? 'Trending now' : 'Picked for you'}
        meta={gridLoading ? undefined : `${count} ${count === 1 ? 'item' : 'items'}`}
      />
      {homeHeader}
    </>
  ) : (
    homeHeader
  );

  // Rail counts reflect the active tab (For you / Trending / Saved).
  const railBase = feedFilter.showingSaved
    ? savedListings
    : feedFilter.showingTrending
      ? trendingListings
      : listings;
  const categoryCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const l of railBase) out[l.category] = (out[l.category] ?? 0) + 1;
    return out;
  }, [railBase]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.background }}>
      <FlashList
        ref={listRef}
        data={feedFilter.gridRows}
        extraData={feedFilter.activeChip}
        renderItem={renderRow}
        keyExtractor={rowKey}
        drawDistance={GRID_DRAW_DISTANCE}
        ListHeaderComponent={listHeader}
        ListFooterComponent={isDesktop ? <DesktopFooter /> : null}
        ListEmptyComponent={
          <GridPlaceholder
            loading={gridLoading}
            columns={columns}
            cardWidth={cardWidth}
            emptyText={feedFilter.gridEmptyText}
          />
        }
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.purple}
          />
        }
        contentContainerStyle={{
          paddingBottom: Math.max(insets.bottom, 12) + tabClear + 16,
          paddingLeft: gutter + railSpace,
          paddingRight: gutter,
        }}
      />

      {isDesktop && (
        <View style={{ position: 'absolute', top: 0, bottom: 0, left: gutter + HORIZONTAL_PAD, width: FILTER_RAIL_WIDTH }}>
          <DesktopFilterRail
            filters={feedFilter.filters}
            onChange={feedFilter.setFilters}
            categoryCounts={categoryCounts}
            total={railBase.length}
          />
        </View>
      )}

      {searchModeOpen && (
        <View style={[StyleSheet.absoluteFillObject, { top: insets.top, left: gutter, right: gutter, zIndex: 100, elevation: 10 }]}>
          <HomeSearchView
            // Desktop: a new header search remounts results with fresh state.
            key={isDesktop ? `${initialSearchCategory ?? ''}|${initialSearchQuery}|${params.searchTab ?? ''}` : undefined}
            initialTab={params.searchTab === 'seller' ? 'seller' : 'listings'}
            onClose={() => {
              setSearchModeOpen(false);
              setInitialSearchCategory(null);
              setInitialSearchQuery('');
              if (params.searchOpen || params.searchCategory || params.searchQuery || params.searchTab || params.category || params.q) {
                router.setParams({
                  searchOpen: undefined,
                  searchCategory: undefined,
                  searchQuery: undefined,
                  searchTab: undefined,
                  category: undefined,
                  q: undefined,
                });
              }
            }}
            initialCategory={initialSearchCategory}
            initialQuery={initialSearchQuery}
            onOpenSavedAlerts={() => {
              if (!user?.id) {
                toast.show('Sign in to create drop alerts', { variant: 'info', icon: 'log-in' });
                router.push('/auth/login');
                return;
              }
              setAlertSheetOpen(true);
            }}
          />
        </View>
      )}

      <FeedFilterSheet
        visible={feedFilter.filterOpen}
        initial={feedFilter.filters}
        onApply={feedFilter.setFilters}
        onClose={() => feedFilter.setFilterOpen(false)}
        resultCount={feedFilter.filteredListings.length}
      />

      {user?.id ? (
        <DropAlertSheet
          visible={alertSheetOpen}
          userId={user.id}
          onClose={() => setAlertSheetOpen(false)}
          onCreated={() => searchesRefetch()}
        />
      ) : null}

      {profile?.username ? (
        <ProfileQrSheet
          visible={showShareModal}
          onClose={() => setShowShareModal(false)}
          username={profile.username}
          fullName={profile?.full_name}
        />
      ) : null}
    </SafeAreaView>
  );
}
