// ─────────────────────────────────────────────────────────────────────────────
// DISCOVER ITEMS GRID (PRESENTATIONAL)
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Composing Editorial Rails & Dynamic Facets
// Encapsulates the items discovery feed, including promotional editorial banners,
// daily personalized picks, recently viewed items, subcategory chips, and facets.
// ─────────────────────────────────────────────────────────────────────────────

import { memo } from 'react';
import { View, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Text } from '@/lib/rnText';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { radii } from '@/lib/theme';
import { subcategoryLabel } from '@/lib/categories';
import { EmptyState, SectionHeader } from '@/components/ui';
import {
  PromoBanner,
  WelcomeEyebrow,
  DigestRail,
  DailyPicks,
  RecentlyViewedList,
  ShopByBrandRail,
} from './EditorialFeed';
import { GridSkeleton, RailSkeleton } from './DiscoverSkeletons';
import { SearchFilterChips } from './SearchFilterChips';
import type { SearchFilterState } from '@/lib/searchFilters';
import {
  CATEGORY_TILES,
  SORT_OPTIONS,
  SORT_TITLE,
} from './useDiscoverSearch';
import type { Category, Listing } from '@/types';
import type { DigestCard, PromoTarget } from '@/lib/discover';
import type { SortKey } from '@/lib/listings';

import { useTheme } from '@/context/ThemeContext';
const SHOW_DIGEST_RAIL = false;

type DiscoverItemsGridProps = {
  currentSaveKey: string | null;
  canSaveSearch: boolean;
  savingSearch: boolean;
  onSaveSearch: () => void;
  idle: boolean;
  promos: any[];
  onPromoPress: (t: PromoTarget) => void;
  loading: boolean;
  digest: DigestCard[];
  onDigestPress: (c: DigestCard) => void;
  recLoading: boolean;
  picks: Listing[];
  user: any;
  recentlyViewed: Listing[];
  recentLoading: boolean;
  collections: any[];
  onSelectBrand: (brand: string) => void;
  hasQuery: boolean;
  query: string;
  userResults: any[];
  onSwitchToUsers: () => void;
  gridYRef: React.RefObject<number>;
  browseCat: Category | null;
  activeSub: string | null;
  browseSubs: { id: string; label: string }[];
  onSelectSub: (subId: string | null) => void;
  sort: SortKey | null;
  onSelectSort: (s: SortKey) => void;
  sortOnly: boolean;
  digestSort: any;
  idleGridTitle: string;
  gridResults: Listing[];
  results: Listing[];
  searching: boolean;
  columns: number;
  cardW: number;
  onClearCategory: () => void;
  onClearSort: () => void;
  onClearDigestSort: () => void;
  searchFilters: SearchFilterState;
  onUpdateFilter: (updater: (prev: SearchFilterState) => SearchFilterState) => void;
};

export const DiscoverItemsGrid = memo(function DiscoverItemsGrid({
  currentSaveKey,
  canSaveSearch,
  savingSearch,
  onSaveSearch,
  idle,
  promos,
  onPromoPress,
  loading,
  digest,
  onDigestPress,
  recLoading,
  picks,
  user,
  recentlyViewed,
  recentLoading,
  collections,
  onSelectBrand,
  hasQuery,
  query,
  userResults,
  onSwitchToUsers,
  gridYRef,
  browseCat,
  activeSub,
  browseSubs,
  onSelectSub,
  sort,
  onSelectSort,
  sortOnly,
  digestSort,
  idleGridTitle,
  gridResults,
  results,
  searching,
  columns,
  cardW,
  onClearCategory,
  onClearSort,
  onClearDigestSort,
  searchFilters,
  onUpdateFilter,
}: DiscoverItemsGridProps) {
  const { theme: colors } = useTheme();

  const displayResults = idle ? gridResults : results;

  return (
    <>
      {/* Save Search CTA */}
      {currentSaveKey && (
        <View style={{ paddingHorizontal: 16, marginTop: 18 }}>
          <Pressable
            onPress={onSaveSearch}
            disabled={!canSaveSearch || savingSearch}
            testID="discover-save-search"
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 14,
              paddingVertical: 11,
              borderRadius: radii.pill,
              backgroundColor: canSaveSearch ? colors.purpleSoft : colors.panel,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            {savingSearch ? (
              <ActivityIndicator size="small" color={colors.purple} />
            ) : (
              <Feather
                name={canSaveSearch ? 'bookmark' : 'check'}
                size={14}
                color={colors.purple}
              />
            )}
            <Text
              style={{
                marginLeft: 8,
                fontSize: 13,
                fontWeight: '700',
                color: colors.purple,
              }}
            >
              {savingSearch
                ? 'Saving…'
                : canSaveSearch
                  ? 'Save this search'
                  : 'Saved — find it under Activity'}
            </Text>
          </Pressable>
        </View>
      )}

      {/* Idle Editorial Blocks */}
      {idle && (
        <>
          <PromoBanner slides={promos} onPress={onPromoPress} />

          {SHOW_DIGEST_RAIL && (
            <>
              <WelcomeEyebrow />
              {loading && digest.length === 0 ? (
                <View style={{ marginTop: 16 }}>
                  <RailSkeleton />
                </View>
              ) : (
                <DigestRail cards={digest} onPress={onDigestPress} />
              )}
            </>
          )}

          {recLoading ? (
            <View style={{ marginTop: 26 }}>
              <SectionHeader title="Daily picks for you" />
              <RailSkeleton />
            </View>
          ) : (
            <DailyPicks
              listings={picks}
              onSeeMore={() => router.push('/(tabs)' as any)}
              testID="discover-daily-picks"
            />
          )}

          {user && recentlyViewed.length > 0 && !recentLoading && (
            <RecentlyViewedList listings={recentlyViewed} testID="discover-recently-viewed" />
          )}

          <ShopByBrandRail collections={collections} onPress={onSelectBrand} />
        </>
      )}

      {/* People Matches Banner */}
      {hasQuery && userResults.length > 0 && (
        <View style={{ paddingHorizontal: 16, marginTop: 18 }}>
          <Pressable
            onPress={onSwitchToUsers}
            accessibilityRole="button"
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingHorizontal: 14,
              paddingVertical: 11,
              borderRadius: radii.lg,
              borderWidth: 1,
              borderColor: colors.hair,
              backgroundColor: pressed ? colors.panel : colors.paper,
            })}
          >
            <Feather name="users" size={14} color={colors.purple} />
            <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: colors.ink }}>
              {userResults.length === 1
                ? '1 person matches'
                : `${userResults.length} people match`}{' '}
              “{query.trim()}”
            </Text>
            <Feather name="chevron-right" size={16} color={colors.muteSoft} />
          </Pressable>
        </View>
      )}

      {/* Category Browse or Results Header */}
      <View
        style={{ marginTop: 22 }}
        onLayout={(e) => {
          if (gridYRef) (gridYRef as any).current = e.nativeEvent.layout.y;
        }}
      >
        {hasQuery ? (
          <SearchFilterChips
            filters={searchFilters}
            onUpdateFilter={onUpdateFilter}
            resultCount={displayResults.length}
          />
        ) : browseCat ? (
          <>
            <SectionHeader
              title={
                activeSub
                  ? subcategoryLabel(browseCat, activeSub)
                  : `In ${CATEGORY_TILES.find((c) => c.id === browseCat)?.label}`
              }
              count={results.length}
              action={{ label: 'Clear', onPress: onClearCategory }}
            />


            {/* Subcategory Chips */}
            {browseSubs.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingTop: 4, paddingBottom: 8 }}
              >
                {[{ id: null as string | null, label: 'All' }, ...browseSubs].map((s) => {
                  const on = activeSub === s.id;
                  return (
                    <Pressable
                      key={s.id ?? '__all'}
                      onPress={() => onSelectSub(on ? null : s.id)}
                      style={({ pressed }) => ({
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        borderRadius: radii.pill,
                        borderWidth: 1,
                        borderColor: on ? colors.purple : colors.hair,
                        backgroundColor: on ? colors.purple : (pressed ? colors.selected : 'transparent'),
                        transform: [{ scale: pressed ? 0.96 : 1 }],
                      })}
                    >
                      <Text style={{ fontSize: 12.5, fontWeight: '700', color: on ? colors.white : colors.ink }}>
                        {s.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            {/* Sort Chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 12, alignItems: 'center' }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginRight: 2 }}>
                <Feather name="sliders" size={12} color={colors.muteSoft} />
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.muteSoft, letterSpacing: 0.4 }}>
                  SORT
                </Text>
              </View>
              {SORT_OPTIONS.map((o) => {
                const on = (sort ?? 'popular') === o.id;
                return (
                  <Pressable
                    key={o.id}
                    onPress={() => onSelectSort(o.id)}
                    style={({ pressed }) => ({
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      borderRadius: radii.pill,
                      borderWidth: 1,
                      borderColor: on ? colors.purple : colors.hair,
                      backgroundColor: on ? colors.purpleSoft : (pressed ? colors.selected : 'transparent'),
                      transform: [{ scale: pressed ? 0.96 : 1 }],
                    })}
                  >
                    <Text style={{ fontSize: 12.5, fontWeight: '700', color: on ? colors.purple : colors.ink }}>
                      {o.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        ) : sortOnly ? (
          <SectionHeader
            title={SORT_TITLE[sort!]}
            count={results.length}
            action={{ label: 'Clear', onPress: onClearSort }}
          />
        ) : idle && digestSort ? (
          <SectionHeader
            title={idleGridTitle}
            count={gridResults.length}
            action={{ label: 'Clear', onPress: onClearDigestSort }}
          />
        ) : (
          <SectionHeader
            title={idleGridTitle}
            count={displayResults.length}
            rightText={displayResults.length === 1 ? 'item' : 'items'}
          />
        )}

        {/* Loading / Empty States */}
        {loading ? (
          <GridSkeleton columns={columns} cardW={cardW} />
        ) : displayResults.length === 0 ? (
          searching ? (
            <GridSkeleton columns={columns} cardW={cardW} />
          ) : hasQuery && userResults.length > 0 ? (
            <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
              <Text style={{ fontSize: 13, color: colors.muteSoft }}>
                No items matched “{query.trim()}”.
              </Text>
            </View>
          ) : (
            <EmptyState
              icon="search"
              title="Nothing matched"
              description="Try a different word, brand, or category."
            />
          )
        ) : null}
      </View>
    </>
  );
});
