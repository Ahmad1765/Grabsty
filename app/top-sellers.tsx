// Top sellers ("See all" from Browse → Top sellers this week).
//   Trending        - most_searched_sellers: distinct searchers who opened the
//                     seller from search in 7 days, then sales
//   Recommended     - sellers behind this buyer's get_recommendations listings
//                     that matched on interest (intent / cf / social / taste —
//                     popularity-only 'trending' rows are dropped), ranked by
//                     summed rec_score
// Complies with UI_GUARDRAILS.md: three-hue palette (no yellow rank badges or
// green/red movement arrows), 36px Whatnot squircle tabs (same as Activity's
// filter chips), Inter via rnText, inline Pressable styles.

import { useMemo, useState } from 'react';
import { View, Pressable, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { Text } from '@/lib/rnText';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/context/ThemeContext';
import { tap } from '@/lib/haptics';
import { safeBack } from '@/lib/nav';
import { type } from '@/lib/theme';
import { IMAGE_TRANSITION } from '@/lib/images';
import { CATEGORIES } from '@/lib/categories';
import { CONTENT_MAX_WIDTH } from '@/lib/responsive';
import { useRecommendationsQuery } from '@/lib/queries/useFeedQueries';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { soldLabel, type TopSeller } from '@/components/discover/SearchLanding';

type SearchedSeller = TopSeller & { searches: number };

function useMostSearchedSellers() {
  return useQuery({
    queryKey: ['mostSearchedSellers'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<SearchedSeller[]> => {
      const { data, error } = await supabase.rpc('most_searched_sellers', { p_limit: 30, p_days: 7 });
      if (error) throw error;
      return (data ?? []) as SearchedSeller[];
    },
  });
}

type Tab = 'trending' | 'recommended';
type Row = { id: string; username: string; avatar_url: string | null; subtitle: string };

const PAD = 16;

export default function TopSellersScreen() {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('trending');

  const top = useMostSearchedSellers();
  // Same key/limit as Browse's "You may like", so this is usually a cache hit.
  const recs = useRecommendationsQuery(user?.id ?? null, 48);

  const trendingRows = useMemo<Row[]>(
    () =>
      (top.data ?? []).map((s) => ({
        id: s.id,
        username: s.username,
        avatar_url: s.avatar_url,
        subtitle:
          s.searches > 0
            ? `${s.searches} ${s.searches === 1 ? 'search' : 'searches'} this week`
            : soldLabel(s),
      })),
    [top.data],
  );

  const recommendedRows = useMemo<Row[]>(() => {
    const bySeller = new Map<string, { row: Row; n: number; score: number; cats: Map<string, number> }>();
    for (const l of recs.data ?? []) {
      const s = l.seller;
      // 'trending' = picked for popularity/backfill, not this buyer's interests.
      if (!s?.username || l.is_sold || l.seller_id === user?.id || !l.rec_reason || l.rec_reason === 'trending') continue;
      const e = bySeller.get(l.seller_id) ?? {
        row: { id: l.seller_id, username: s.username, avatar_url: s.avatar_url, subtitle: '' },
        n: 0,
        score: 0,
        cats: new Map(),
      };
      e.n += 1;
      e.score += Number(l.rec_score ?? 0);
      if (l.category) e.cats.set(l.category, (e.cats.get(l.category) ?? 0) + 1);
      bySeller.set(l.seller_id, e);
    }
    return [...bySeller.values()]
      .sort((a, b) => b.score - a.score || b.n - a.n)
      .map(({ row, n, cats }) => {
        const topCat = [...cats.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
        const label = CATEGORIES.find((c) => c.id === topCat)?.label;
        const items = `${n} ${n === 1 ? 'item' : 'items'} for you`;
        return { ...row, subtitle: label ? `${items} · ${label}` : items };
      });
  }, [recs.data, user?.id]);

  const rows = tab === 'trending' ? trendingRows : recommendedRows;
  const loading = tab === 'trending' ? top.isPending : !!user && recs.isPending;
  const empty =
    tab === 'recommended' && !user
      ? 'Sign in to see sellers picked for you.'
      : tab === 'recommended'
        ? 'Like or save a few items and we’ll find sellers for you.'
        : 'No top sellers yet.';

  const tabChip = (key: Tab, label: string) => {
    const active = tab === key;
    return (
      <Pressable
        key={key}
        onPress={() => {
          tap();
          setTab(key);
        }}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        accessibilityLabel={label}
        testID={`top-sellers-tab-${key}`}
        style={({ pressed }) => ({
          height: 36,
          borderRadius: 8,
          paddingHorizontal: 16,
          justifyContent: 'center',
          backgroundColor: active ? (isDark ? '#FFFFFF' : '#111111') : isDark ? '#2C2C2E' : '#E5E7EB',
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <Text
          style={{
            fontSize: 14,
            fontFamily: type.family.sansBold,
            letterSpacing: -0.2,
            color: active ? (isDark ? '#000000' : '#FFFFFF') : isDark ? '#FFFFFF' : '#111111',
          }}
        >
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 80,
          paddingHorizontal: PAD,
          width: '100%',
          maxWidth: CONTENT_MAX_WIDTH,
          alignSelf: 'center',
        }}
      >
        <Pressable
          onPress={() => safeBack('/(tabs)/discover' as any)}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: theme.surface,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Feather name="chevron-left" size={22} color={theme.ink} />
        </Pressable>

        <Text style={{ fontSize: 28, fontFamily: type.family.sansBold, color: theme.ink, marginTop: 24 }}>
          Top sellers
        </Text>
        <Text style={{ fontSize: 14, fontFamily: type.family.sans, color: theme.mute, marginTop: 6 }}>
          The closets everyone’s shopping right now
        </Text>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 20, marginBottom: 16 }}>
          {tabChip('trending', 'Trending')}
          {tabChip('recommended', 'Recommended')}
        </View>

        {loading ? (
          <ActivityIndicator color={theme.mute} style={{ marginTop: 32 }} />
        ) : rows.length === 0 ? (
          <Text
            style={{ fontSize: 14, fontFamily: type.family.sans, color: theme.mute, textAlign: 'center', marginTop: 32 }}
          >
            {empty}
          </Text>
        ) : (
          <View>
            {rows.map((r, i) => (
              <Pressable
                key={r.id}
                onPress={() => {
                  tap();
                  router.push(`/user/${r.username || r.id}` as any);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Number ${i + 1}, @${r.username}, ${r.subtitle}`}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
                  paddingVertical: 12,
                  // Plain list on the page background, like Settings and Followers.
                  borderBottomWidth: i < rows.length - 1 ? StyleSheet.hairlineWidth : 0,
                  borderBottomColor: theme.border,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <View>
                  {r.avatar_url ? (
                    <Image
                      source={{ uri: r.avatar_url }}
                      style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: theme.surface }}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      transition={IMAGE_TRANSITION}
                    />
                  ) : (
                    <View
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 28,
                        backgroundColor: theme.surface,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Feather name="user" size={22} color={theme.mute} />
                    </View>
                  )}
                  <View
                    style={{
                      position: 'absolute',
                      left: -6,
                      top: -6,
                      minWidth: 24,
                      height: 24,
                      paddingHorizontal: 4,
                      borderRadius: 12,
                      backgroundColor: isDark ? theme.surface : '#F2F3FE',
                      borderWidth: 2,
                      borderColor: theme.background,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 11, fontFamily: type.family.sansSemibold, color: theme.purple }}>
                      {i + 1}
                    </Text>
                  </View>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontSize: 16, fontFamily: type.family.sansSemibold, color: theme.ink }}>
                    @{r.username}
                  </Text>
                  <Text numberOfLines={1} style={{ fontSize: 13, fontFamily: type.family.sans, color: theme.mute, marginTop: 3 }}>
                    {r.subtitle}
                  </Text>
                </View>
                <Feather name="chevron-right" size={20} color={theme.mute} />
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
