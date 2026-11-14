// Browse sheet body (Discover tab), top to bottom:
//   1. Shop by category  - 30px chips for every top-level category + All
//   2. Top sellers this week - columns of two that scroll sideways, rank on the avatar;
//                          "See all" opens app/top-sellers.tsx
//                          (public top_sellers_week RPC: 7-day sales, then all-time)
//   3. Popular brands    - the most-listed brands in the live feed
//   4. Freshly Out       - the newest unsold listings (created_at desc), own items
//                          hidden; "See all" opens the Search page sorted by newest
//
// Complies with UI_GUARDRAILS.md (three-hue palette, 30px chips, Inter via rnText,
// inline styles on Pressable).

import { useMemo } from 'react';
import { View, Pressable, Platform, ScrollView, useWindowDimensions } from 'react-native';
import { Text } from '@/lib/rnText';
import { useFittedCardWidth } from '@/lib/responsive';
import { CardGrid } from '@/components/ui/CardGrid';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { IMAGE_TRANSITION } from '@/lib/images';
import { CATEGORIES, type CategoryId } from '@/lib/categories';
import { type } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';

import { useFeedListingsQuery } from '@/lib/queries/useFeedQueries';
import { ListingCard } from '@/components/ListingCard';

import type { SortKey } from '@/lib/listings';
import type { Listing } from '@/types';
import type { DiscoverTab } from './SearchTabs';

function haptic() {
  if (Platform.OS !== 'web') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
}

const PAD = 16;
export type TopicAction = { kind: 'category'; category: CategoryId } | { kind: 'all' };

export type TopSeller = {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  sold_week: number;
  sold_total: number;
};

export function useTopSellersWeek(limit = 12) {
  return useQuery({
    queryKey: ['topSellersWeek', limit],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<TopSeller[]> => {
      const { data, error } = await supabase.rpc('top_sellers_week', { p_limit: limit });
      if (error) throw error;
      return (data ?? []) as TopSeller[];
    },
  });
}

export function soldLabel(s: TopSeller) {
  return s.sold_week > 0 ? `${s.sold_week} sold this week` : `${s.sold_total} sold`;
}

// Width of the Browse column. DiscoverSheet caps itself to this, and the
// card grid sizes from it, so the two must stay one number.
export const SHEET_MAX = 600;
const GRID_GAP = 8;

// ── Main SearchLanding Component ────────────────────────────────────────────
export function SearchLanding({
  listings = [],
  userId,
  onTopic,
  onSort,
  onTab,
  onSearch,
  onSelectSeller,
  onSeeAllSellers,
}: {
  covers?: Partial<Record<string, string>>;
  listings?: Listing[];
  userId?: string | null;
  onTopic: (action: TopicAction) => void;
  onSort: (sort: SortKey) => void;
  onTab: (tab: DiscoverTab, label: string, icon: keyof typeof Feather.glyphMap) => void;
  onSearch?: (query: string) => void;
  onSelectSeller?: (sellerIdOrUsername: string) => void;
  onSeeAllSellers?: () => void;
}) {
  const { theme, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width, SHEET_MAX);
  const { data: topSellers = [] } = useTopSellersWeek();

  // Newest unsold listings. Over-fetch so hiding the viewer's own items still fills 12.
  const { data: newest = [] } = useFeedListingsQuery({ tab: 'for_you', sort: 'newest', limit: 24 });

  // Most-listed brands in the live feed sample.
  const popularBrands = useMemo(() => {
    const counts = new Map<string, { label: string; n: number }>();
    for (const l of listings) {
      const raw = l.brand?.trim();
      if (!raw) continue;
      const key = raw.toLowerCase();
      if (key === 'other' || key === 'unbranded' || key === 'no brand') continue;
      const e = counts.get(key) ?? { label: raw, n: 0 };
      e.n += 1;
      counts.set(key, e);
    }
    return [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 10).map((e) => e.label);
  }, [listings]);

  const chip = (
    key: string,
    label: string,
    onPress: () => void,
    icon?: keyof typeof Feather.glyphMap,
    trailingIcon?: keyof typeof Feather.glyphMap,
  ) => (
    <Pressable
      key={key}
      onPress={() => {
        haptic();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        height: 30,
        borderRadius: 15,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: theme.surface,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {icon ? <Feather name={icon} size={14} color={theme.mute} /> : null}
      <Text style={{ fontSize: 13, fontFamily: type.family.sansMedium, color: theme.ink }}>{label}</Text>
      {trailingIcon ? <Feather name={trailingIcon} size={14} color={theme.ink} /> : null}
    </Pressable>
  );

  const chipRow = (children: React.ReactNode) => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingHorizontal: PAD, gap: 8 }}
    >
      {children}
    </ScrollView>
  );

  // Two rows per column, a bit under half the width so the next column peeks in.
  const columnWidth = Math.round((contentWidth - PAD) * 0.46);
  const sellerColumns = useMemo(() => {
    const out: { seller: TopSeller; rank: number }[][] = [];
    // Blocks of four read left to right, then down: 1 2 / 3 4, then 5 6 / 7 8.
    topSellers.forEach((seller, i) => {
      const col = Math.floor(i / 4) * 2 + (i % 2);
      (out[col] ??= []).push({ seller, rank: i + 1 });
    });
    return out;
  }, [topSellers]);

  const { cardWidth, onLayout: onGridLayout, ref: gridRef } = useFittedCardWidth(
    Math.floor((contentWidth - PAD * 2 - GRID_GAP) / 2),
    { horizontalPadding: PAD, gap: GRID_GAP, columns: 2 },
  );
  const picks = useMemo(
    () => newest.filter((l) => !l.is_sold && (!userId || l.seller_id !== userId)).slice(0, 12),
    [newest, userId],
  );

  return (
    <View style={{ paddingTop: 20, gap: 28 }}>
      <View>
        <SectionTitle>Shop by category</SectionTitle>
        {chipRow([
          ...CATEGORIES.map((c) => chip(c.id, c.label, () => onTopic({ kind: 'category', category: c.id }))),
          chip('all', 'All categories', () => onTopic({ kind: 'all' })),
        ])}
      </View>

      {topSellers.length > 0 && (
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingRight: PAD }}>
            <SectionTitle>Top sellers this week</SectionTitle>
            <Pressable
              onPress={() => {
                haptic();
                if (onSeeAllSellers) onSeeAllSellers();
                else router.push('/top-sellers' as any);
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="See all sellers"
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Text style={{ fontSize: 13, fontFamily: type.family.sansMedium, color: theme.mute }}>See all</Text>
            </Pressable>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: PAD, gap: 8 }}
          >
            {sellerColumns.map((col, ci) => (
              <View key={ci} style={{ width: columnWidth, gap: 16 }}>
                {col.map(({ seller, rank }) => (
                  <Pressable
                    key={seller.id}
                    onPress={() => {
                      haptic();
                      if (onSelectSeller) onSelectSeller(seller.username || seller.id);
                      else router.push(`/user/${seller.username || seller.id}` as any);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Number ${rank}, @${seller.username}, ${soldLabel(seller)}`}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <View>
                      {seller.avatar_url ? (
                        <Image
                          source={{ uri: seller.avatar_url }}
                          style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: theme.surface }}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                          transition={IMAGE_TRANSITION}
                        />
                      ) : (
                        <View
                          style={{
                            width: 48,
                            height: 48,
                            borderRadius: 24,
                            backgroundColor: theme.surface,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Feather name="user" size={20} color={theme.mute} />
                        </View>
                      )}
                      <View
                        style={{
                          position: 'absolute',
                          right: -4,
                          bottom: -2,
                          minWidth: 22,
                          height: 16,
                          paddingHorizontal: 4,
                          borderRadius: 8,
                          backgroundColor: isDark ? theme.surface : '#F2F3FE',
                          borderWidth: 1.5,
                          borderColor: theme.background,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text style={{ fontSize: 9, fontFamily: type.family.sansSemibold, color: theme.purple }}>
                          #{rank}
                        </Text>
                      </View>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ fontSize: 14, fontFamily: type.family.sansSemibold, color: theme.ink }}>
                        @{seller.username}
                      </Text>
                      <Text numberOfLines={1} style={{ fontSize: 12, fontFamily: type.family.sans, color: theme.mute, marginTop: 2 }}>
                        {soldLabel(seller)}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {popularBrands.length >= 2 && onSearch && (
        <View>
          <SectionTitle>Popular brands</SectionTitle>
          {chipRow(popularBrands.map((b) => chip(`brand-${b}`, b, () => onSearch(b), undefined, 'arrow-up-right')))}
        </View>
      )}

      {picks.length > 0 && (
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingRight: PAD }}>
            <SectionTitle>Freshly Out</SectionTitle>
            <Pressable
              onPress={() => {
                haptic();
                onSort('newest');
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="See all new listings"
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Text style={{ fontSize: 13, fontFamily: type.family.sansMedium, color: theme.mute }}>See all</Text>
            </Pressable>
          </View>
          <CardGrid
            gridRef={gridRef}
            onLayout={onGridLayout}
            columns={2}
            cardWidth={cardWidth}
            padding={PAD}
            gap={GRID_GAP}
          >
            {picks.map((l) => (
              <ListingCard key={l.id} listing={l} width={cardWidth} />
            ))}
          </CardGrid>
        </View>
      )}
    </View>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <Text
      style={{
        fontSize: 17,
        fontFamily: type.family.sansSemibold,
        color: theme.ink,
        paddingHorizontal: PAD,
        marginBottom: 12,
      }}
    >
      {children}
    </Text>
  );
}
