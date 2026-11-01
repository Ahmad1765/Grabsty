// Browse sheet body (Discover tab): one section, "Top sellers this week".
//
// Sellers come from the public `top_sellers_week` RPC (sales in the last 7
// days, then all-time, so a quiet week still has content). Laid out like the
// reference: columns of two rows that scroll sideways, each row the same
// avatar + @username + count design the section used before, with the rank on
// the avatar.
//
// Complies with UI_GUARDRAILS.md (three-hue palette + #F2F3FE token, Inter via
// rnText, inline styles on Pressable).

import { useMemo } from 'react';
import { View, Pressable, Platform, ScrollView, useWindowDimensions } from 'react-native';
import { Text } from '@/lib/rnText';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { IMAGE_TRANSITION } from '@/lib/images';
import { type CategoryId } from '@/lib/categories';
import { type } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';

import type { SortKey } from '@/lib/listings';
import type { Listing } from '@/types';
import type { DiscoverTab } from './SearchTabs';

function haptic() {
  if (Platform.OS !== 'web') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
}

const PAD = 16;
const DESKTOP_SHEET_MAX = 560;

// ── Actions ─────────────────────────────────────────────────────────────────
export type BrowseAction =
  | { kind: 'sort'; sort: SortKey }
  | { kind: 'tab'; tab: DiscoverTab }
  | { kind: 'saved' };

export type TopicAction = { kind: 'category'; category: CategoryId } | { kind: 'all' };

type TopSeller = {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  sold_week: number;
  sold_total: number;
};

export function useTopSellersWeek(enabled = true) {
  return useQuery({
    queryKey: ['topSellersWeek'],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<TopSeller[]> => {
      const { data, error } = await supabase.rpc('top_sellers_week', { p_limit: 12 });
      if (error) throw error;
      return (data ?? []) as TopSeller[];
    },
  });
}

function soldLabel(s: TopSeller) {
  if (s.sold_week > 0) return `${s.sold_week} sold this week`;
  return `${s.sold_total} sold`;
}

export function SearchLanding({
  onTab,
  onSelectSeller,
}: {
  covers?: Partial<Record<string, string>>;
  listings?: Listing[];
  userId?: string | null;
  onTopic?: (action: TopicAction) => void;
  onSort?: (sort: SortKey, label: string, icon: keyof typeof Feather.glyphMap) => void;
  onTab: (tab: DiscoverTab, label: string, icon: keyof typeof Feather.glyphMap) => void;
  onSearch?: (query: string) => void;
  onSelectSeller?: (sellerIdOrUsername: string) => void;
}) {
  const { theme, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const { data: sellers = [], isLoading } = useTopSellersWeek();

  // Two rows per column; a column is a bit under half the width so the next
  // one peeks in and reads as scrollable.
  const columnWidth = Math.round((Math.min(width, DESKTOP_SHEET_MAX) - PAD) * 0.46);
  const columns = useMemo(() => {
    const out: { seller: TopSeller; rank: number }[][] = [];
    sellers.forEach((seller, i) => {
      if (i % 2 === 0) out.push([]);
      out[out.length - 1].push({ seller, rank: i + 1 });
    });
    return out;
  }, [sellers]);

  const openSeller = (s: TopSeller) => {
    haptic();
    if (onSelectSeller) onSelectSeller(s.username || s.id);
    else router.push(`/user/${s.username || s.id}` as any);
  };

  if (!isLoading && sellers.length === 0) return null;

  return (
    <View style={{ paddingTop: 20 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          paddingHorizontal: PAD,
          marginBottom: 12,
        }}
      >
        <Text style={{ fontSize: 17, fontFamily: type.family.sansSemibold, color: theme.ink }}>
          Top sellers this week
        </Text>
        <Pressable
          onPress={() => {
            haptic();
            onTab('users', 'Top closets', 'users');
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
        {columns.map((col, ci) => (
          <View key={ci} style={{ width: columnWidth, gap: 16 }}>
            {col.map(({ seller, rank }) => (
              <Pressable
                key={seller.id}
                onPress={() => openSeller(seller)}
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
  );
}
