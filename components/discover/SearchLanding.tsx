// Browse sheet body (Discover tab), top to bottom:
//   1. Shop by category  - 30px chips for every top-level category + All
//   2. Sellers for you   - 2-column list, ranked by the buyer's taste (get_recommendations),
//                          falling back to feed order and then most-followed profiles
//   3. Popular brands    - the most-listed brands in the live feed
//   4. Quick browse      - New drops / Trending / Best deals sort shortcuts
//
// Complies with UI_GUARDRAILS.md (three-hue palette, 30px chips, Inter via rnText,
// inline styles on Pressable).

import { useMemo } from 'react';
import { View, Pressable, Platform, ScrollView } from 'react-native';
import { Text } from '@/lib/rnText';
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

import { useRecommendationsQuery } from '@/lib/queries/useFeedQueries';

import type { SortKey } from '@/lib/listings';
import type { Listing } from '@/types';
import type { RecommendedListing } from '@/lib/recommendations';
import type { DiscoverTab } from './SearchTabs';

function haptic() {
  if (Platform.OS !== 'web') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
}

const PAD = 16;

// ── Actions ─────────────────────────────────────────────────────────────────
export type BrowseAction =
  | { kind: 'sort'; sort: SortKey }
  | { kind: 'tab'; tab: DiscoverTab }
  | { kind: 'saved' };

export type TopicAction = { kind: 'category'; category: CategoryId } | { kind: 'all' };

export type RecommendedUser = {
  id: string;
  name: string;
  username: string;
  avatar: string;
  photos: [string | null, string | null, string | null, string | null];
  /** Live listings of theirs in the feed sample (0 for profile-only fallbacks). */
  count: number;
};

// ── Main SearchLanding Component ────────────────────────────────────────────
export function SearchLanding({
  listings = [],
  userId,
  onTopic,
  onSort,
  onTab,
  onSearch,
  onSelectSeller,
}: {
  covers?: Partial<Record<string, string>>;
  listings?: Listing[];
  userId?: string | null;
  onTopic: (action: TopicAction) => void;
  onSort: (sort: SortKey, label: string, icon: keyof typeof Feather.glyphMap) => void;
  onTab: (tab: DiscoverTab, label: string, icon: keyof typeof Feather.glyphMap) => void;
  onSearch?: (query: string) => void;
  onSelectSeller?: (sellerIdOrUsername: string) => void;
}) {
  const { theme } = useTheme();

  // Query real platform profiles from Supabase to guarantee 100% real sellers and functional follow mutations
  const { data: realProfiles = [] } = useQuery({
    queryKey: ['discoverTopProfiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url, followers_count, is_verified')
        .order('followers_count', { ascending: false, nullsFirst: false })
        .limit(10);
      if (error || !data) return [];
      return data;
    },
    staleTime: 5 * 60_000,
  });

  // Listings ranked for this buyer by get_recommendations (likes, saves, purchases, views →
  // category/brand/price affinity). Signed-out users get [] and fall back to feed order.
  const { data: recs = [] } = useRecommendationsQuery(userId ?? null, 48);

  // 2. DYNAMIC RECOMMENDED SELLERS — ranked by how much of the buyer's taste they stock:
  // a sneakerhead's recs are mostly sneakers, so sneaker-heavy sellers score highest.
  const recommendedUsers = useMemo<RecommendedUser[]>(() => {
    const sellersMap = new Map<string, { seller: any; listings: Listing[]; score: number }>();

    // Recs first so a seller's collage shows the items that matched the buyer's taste.
    for (const l of [...recs, ...listings] as RecommendedListing[]) {
      if (l.seller && l.seller.id && (!userId || l.seller.id !== userId)) {
        const entry = sellersMap.get(l.seller.id) ?? { seller: l.seller, listings: [], score: 0 };
        if (!entry.listings.some((x) => x.id === l.id)) {
          entry.listings.push(l);
          if (recs.includes(l)) entry.score += Math.max(l.rec_score ?? 0, 0.1);
        }
        sellersMap.set(l.seller.id, entry);
      }
    }

    const list: RecommendedUser[] = [];
    const addedIds = new Set<string>();
    // Stable sort: unscored (feed-only) sellers keep feed order after the matched ones.
    const ranked = [...sellersMap.entries()].sort((a, b) => b[1].score - a[1].score);

    for (const [sId, { seller, listings: sListings }] of ranked) {
      // Only use this seller's own listing photos — never borrow from others
      const photos: (string | null)[] = [];
      for (const item of sListings) {
        const img = item.thumbnails?.[0] || item.images?.[0];
        if (img && !photos.includes(img)) photos.push(img);
        if (photos.length === 4) break;
      }
      while (photos.length < 4) photos.push(null);

      addedIds.add(sId);
      list.push({
        id: sId,
        name: seller.full_name || seller.username || 'Seller',
        username: seller.username || 'seller',
        avatar: seller.avatar_url || `https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80`,
        photos: photos as [string | null, string | null, string | null, string | null],
        count: sListings.length,
      });

      if (list.length >= 8) break;
    }

    // Supplement with real Supabase profiles if live sellers in active feed < 4
    if (list.length < 4 && realProfiles.length > 0) {
      for (const profile of realProfiles) {
        if (!profile.id || addedIds.has(profile.id) || (userId && profile.id === userId)) continue;
        addedIds.add(profile.id);

        // Profile-only users have no listings here — all slots are empty placeholders
        const photos: (string | null)[] = [null, null, null, null];

        list.push({
          id: profile.id,
          name: profile.full_name || profile.username || 'Member',
          username: profile.username || 'member',
          avatar: profile.avatar_url || `https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80`,
          photos: photos as [string | null, string | null, string | null, string | null],
          count: 0,
        });

        if (list.length >= 8) break;
      }
    }

    return list;
  }, [recs, listings, userId, realProfiles]);

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

  const openSeller = (user: RecommendedUser) => {
    haptic();
    if (onSelectSeller) onSelectSeller(user.username || user.id);
    else router.push(`/user/${user.username || user.id}` as any);
  };

  const chip = (key: string, label: string, onPress: () => void, icon?: keyof typeof Feather.glyphMap) => (
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

  const sellers = recommendedUsers.slice(0, 4);

  return (
    <View style={{ paddingTop: 20, gap: 28 }}>
      <View>
        <SectionTitle>Shop by category</SectionTitle>
        {chipRow([
          ...CATEGORIES.map((c) => chip(c.id, c.label, () => onTopic({ kind: 'category', category: c.id }))),
          chip('all', 'All categories', () => onTopic({ kind: 'all' })),
        ])}
      </View>

      {sellers.length > 0 && (
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingRight: PAD }}>
            <SectionTitle>Sellers for you</SectionTitle>
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
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: PAD, rowGap: 16 }}>
            {sellers.map((u) => (
              <Pressable
                key={u.id}
                onPress={() => openSeller(u)}
                accessibilityRole="button"
                accessibilityLabel={`Open @${u.username}`}
                style={({ pressed }) => ({
                  width: '50%',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingRight: 8,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Image
                  source={{ uri: u.avatar }}
                  style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: theme.surface }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={IMAGE_TRANSITION}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontSize: 14, fontFamily: type.family.sansSemibold, color: theme.ink }}>
                    @{u.username}
                  </Text>
                  <Text numberOfLines={1} style={{ fontSize: 12, fontFamily: type.family.sans, color: theme.mute, marginTop: 2 }}>
                    {u.count > 0 ? `${u.count} ${u.count === 1 ? 'listing' : 'listings'}` : 'New seller'}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {popularBrands.length >= 2 && onSearch && (
        <View>
          <SectionTitle>Popular brands</SectionTitle>
          {chipRow(popularBrands.map((b) => chip(`brand-${b}`, b, () => onSearch(b))))}
        </View>
      )}

      <View>
        <SectionTitle>Quick browse</SectionTitle>
        {chipRow([
          chip('new', 'New drops', () => onSort('newest', 'New drops', 'clock'), 'clock'),
          chip('trending', 'Trending', () => onSort('popular', 'Trending', 'trending-up'), 'trending-up'),
          chip('deals', 'Best deals', () => onSort('price_asc', 'Deals', 'tag'), 'tag'),
        ])}
      </View>
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
