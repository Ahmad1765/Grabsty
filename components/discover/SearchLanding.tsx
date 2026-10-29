// Discover's search panel body — clean, simplified bento-grid layout:
//   1. BROWSE GRID       — Image bento tiles (3-2-3 row layout):
//                          • Row 1 (3 items): New drops, Trending, Deals
//                          • Row 2 (2 items): Wide "Top closets" card (flex: 2) + Solid Ink "Explore all"
//                            accent card with white right arrow (flex: 1)
//                          • Row 3 (3 items): Clothing, Sneakers, Accessories
//   2. RECOMMENDED USERS — Sellers ranked by the buyer's taste (get_recommendations), 2×2 photo collage (own uploads only,
//                          grey placeholder for empty slots), profile avatar,
//                          and real Supabase-backed + Follow action.
//
// Complies with UI_GUARDRAILS.md (Three-Hue Rule, Zero Gradients, Inter typography,
// inline styles on Pressable, testID).

import { memo, useCallback, useMemo } from 'react';
import { View, Pressable, Platform, ScrollView, StyleSheet } from 'react-native';
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
import { useToast } from '@/lib/toast';

import { useFollowingMaskQuery, useToggleFollowInList } from '@/lib/queries/useProfileQueries';
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
const GAP = 10;

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
};

// ── Main SearchLanding Component ────────────────────────────────────────────
export function SearchLanding({
  covers,
  listings = [],
  userId,
  onTopic,
  onSort,
  onTab,
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
  const { theme, isDark } = useTheme();
  const toast = useToast();

  // 1. DYNAMIC BENTO TILE COVERS (From live listings & category taxonomy)
  const bentoCovers = useMemo(() => {
    const byCat: Record<string, string> = {};
    if (covers) {
      for (const [k, v] of Object.entries(covers)) {
        if (v) byCat[k] = v;
      }
    }
    for (const l of listings) {
      const img = l.thumbnails?.[0] || l.images?.[0];
      if (img && !byCat[l.category]) {
        byCat[l.category] = img;
      }
    }
    const newestImg = listings[0]?.thumbnails?.[0] || listings[0]?.images?.[0];
    const trendingImg = listings.find((l) => (l.likes ?? 0) > 0)?.thumbnails?.[0] || listings[1]?.thumbnails?.[0] || listings[1]?.images?.[0];
    const sortedByPrice = [...listings].sort((a, b) => a.price - b.price);
    const dealsImg = sortedByPrice[0]?.thumbnails?.[0] || sortedByPrice[0]?.images?.[0];
    const topSeller = listings.find((l) => l.seller?.avatar_url)?.seller;
    const closetsImg = topSeller?.avatar_url || listings[0]?.thumbnails?.[0] || listings[0]?.images?.[0];

    return {
      new: newestImg || 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=300&auto=format&fit=crop&q=80',
      trending: trendingImg || 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=300&auto=format&fit=crop&q=80',
      deals: dealsImg || 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=300&auto=format&fit=crop&q=80',
      closets: closetsImg || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80',
      clothing: byCat['clothing'] || 'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=300&auto=format&fit=crop&q=80',
      shoes: byCat['shoes'] || 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=300&auto=format&fit=crop&q=80',
      accessories: byCat['accessories'] || 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=300&auto=format&fit=crop&q=80',
    };
  }, [covers, listings]);

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
        });

        if (list.length >= 8) break;
      }
    }

    return list;
  }, [recs, listings, userId, realProfiles]);

  // Real follow mask and optimistic follow mutation
  const sellerIds = useMemo(() => recommendedUsers.map((u) => u.id), [recommendedUsers]);
  const { data: followingIds = [] } = useFollowingMaskQuery(userId ?? null, 'discover_recommended', sellerIds);
  const toggleFollowMutation = useToggleFollowInList(userId ?? null, 'discover_recommended');
  const followingSet = useMemo(() => new Set(followingIds), [followingIds]);

  const handleToggleFollow = useCallback(
    (targetUserId: string) => {
      if (!userId) {
        toast.show('Sign in to follow sellers', { variant: 'info', icon: 'log-in' });
        router.push('/auth/login' as any);
        return;
      }
      const isFollowing = followingSet.has(targetUserId);
      haptic();
      toggleFollowMutation.mutate({ id: targetUserId, currentlyFollowing: isFollowing });
    },
    [userId, followingSet, toggleFollowMutation, toast],
  );



  const cardBg = isDark ? '#1C1C1E' : '#F6F6F8';

  return (
    <View style={{ paddingTop: 14 }}>
      {/* ── BROWSE IMAGE BENTO GRID (3-2-3 Layout) ─────────────────────── */}
      <View style={{ paddingHorizontal: PAD, gap: GAP }}>
        {/* ROW 1: 3 equal cards */}
        <View style={{ flexDirection: 'row', gap: GAP }}>
          <BentoTile
            label="New drops"
            sub="Just listed"
            image={bentoCovers.new}
            cardBg={cardBg}
            isDark={isDark}
            onPress={() => {
              onSort('newest', 'New drops', 'clock');
            }}
          />
          <BentoTile
            label="Trending"
            sub="Most popular"
            image={bentoCovers.trending}
            cardBg={cardBg}
            isDark={isDark}
            onPress={() => {
              onSort('popular', 'Trending', 'trending-up');
            }}
          />
          <BentoTile
            label="Best deals"
            sub="Lowest price"
            image={bentoCovers.deals}
            cardBg={cardBg}
            isDark={isDark}
            onPress={() => {
              onSort('price_asc', 'Deals', 'tag');
            }}
          />
        </View>

        {/* ROW 2: Wide Card (flex: 2) + Solid Ink Accent Card (flex: 1) */}
        <View style={{ flexDirection: 'row', gap: GAP }}>
          {/* Wide card: Top Closets */}
          <Pressable
            onPress={() => {
              haptic();
              onTab('users', 'Top closets', 'users');
            }}
            accessibilityRole="button"
            accessibilityLabel="Browse top closets"
            style={({ pressed }) => ({
              flex: 2,
              minWidth: 0,
              height: 104,
              borderRadius: 18,
              overflow: 'hidden',
              backgroundColor: cardBg,
              padding: 12,
              justifyContent: 'space-between',
              transform: [{ scale: pressed ? 0.97 : 1 }],
            })}
          >
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: theme.purple,
                  }}
                />
                <Text
                  style={{
                    fontSize: 10.5,
                    fontFamily: type.family.sansBold,
                    color: theme.purple,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}
                >
                  Nearby
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 14,
                  fontFamily: type.family.sansBold,
                  color: isDark ? '#FFFFFF' : '#111111',
                  letterSpacing: -0.2,
                  marginTop: 2,
                }}
                numberOfLines={1}
              >
                Top closets
              </Text>
              <Text
                style={{
                  fontSize: 11,
                  fontFamily: type.family.sans,
                  color: isDark ? 'rgba(255,255,255,0.5)' : '#8E8E93',
                  marginTop: 1,
                }}
                numberOfLines={1}
              >
                Verified sellers
              </Text>
            </View>

            {/* Stylized Right Image */}
            <Image
              source={{ uri: bentoCovers.closets }}
              style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: 96,
                height: 84,
                borderTopLeftRadius: 18,
                borderBottomRightRadius: 18,
              }}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={IMAGE_TRANSITION}
            />
          </Pressable>

          {/* Accent Card: Solid Ink background with bold white right arrow */}
          <Pressable
            onPress={() => {
              haptic();
              onTopic({ kind: 'all' });
            }}
            accessibilityRole="button"
            accessibilityLabel="Explore all categories"
            style={({ pressed }) => ({
              flex: 1,
              minWidth: 0,
              height: 104,
              borderRadius: 18,
              overflow: 'hidden',
              backgroundColor: isDark ? '#2C2C2E' : '#0F0F0F',
              padding: 12,
              justifyContent: 'space-between',
              transform: [{ scale: pressed ? 0.97 : 1 }],
            })}
          >
            <View>
              <Text
                style={{
                  fontSize: 13.5,
                  fontFamily: type.family.sansBold,
                  color: '#FFFFFF',
                  letterSpacing: -0.2,
                }}
                numberOfLines={1}
              >
                Explore all
              </Text>
              <Text
                style={{
                  fontSize: 10.5,
                  fontFamily: type.family.sans,
                  color: 'rgba(255,255,255,0.65)',
                  marginTop: 2,
                }}
                numberOfLines={1}
              >
                Categories
              </Text>
            </View>

            {/* Prominent White Right Arrow */}
            <View style={{ alignSelf: 'flex-end' }}>
              <Feather name="arrow-right" size={24} color="#FFFFFF" />
            </View>
          </Pressable>
        </View>

        {/* ROW 3: 3 equal cards */}
        <View style={{ flexDirection: 'row', gap: GAP }}>
          <BentoTile
            label="Clothing"
            sub="Apparel"
            image={bentoCovers.clothing}
            cardBg={cardBg}
            isDark={isDark}
            onPress={() => {
              onTopic({ kind: 'category', category: 'clothing' });
            }}
          />
          <BentoTile
            label="Sneakers"
            sub="Kicks & boots"
            image={bentoCovers.shoes}
            cardBg={cardBg}
            isDark={isDark}
            onPress={() => {
              onTopic({ kind: 'category', category: 'shoes' });
            }}
          />
          <BentoTile
            label="Accessories"
            sub="Bags & jewelry"
            image={bentoCovers.accessories}
            cardBg={cardBg}
            isDark={isDark}
            onPress={() => {
              onTopic({ kind: 'category', category: 'accessories' });
            }}
          />
        </View>
      </View>

      {/* ── RECOMMENDED USERS (Matching Image 1) ─────────────────────── */}
      <View style={{ marginTop: 28 }}>
        <Text
          style={{
            fontSize: 16,
            fontFamily: type.family.sansBold,
            color: theme.ink,
            letterSpacing: -0.3,
            paddingHorizontal: PAD,
            marginBottom: 12,
          }}
        >
          Recommended users
        </Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: PAD, gap: 12 }}
        >
          {recommendedUsers.map((user) => (
            <RecommendedUserCard
              key={user.id}
              user={user}
              isFollowing={followingSet.has(user.id)}
              onToggleFollow={handleToggleFollow}
              onPress={() => {
                haptic();
                if (onSelectSeller) {
                  onSelectSeller(user.username || user.id);
                } else {
                  router.push(`/user/${user.username || user.id}` as any);
                }
              }}
              isDark={isDark}
              theme={theme}
            />
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

// ── Standard Bento Tile ─────────────────────────────────────────────────────
const BentoTile = memo(function BentoTile({
  label,
  sub,
  image,
  cardBg,
  isDark,
  onPress,
}: {
  label: string;
  sub: string;
  image?: string;
  cardBg: string;
  isDark: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        haptic();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`Browse ${label}`}
      style={({ pressed }) => ({
        flex: 1,
        minWidth: 0,
        height: 104,
        borderRadius: 18,
        overflow: 'hidden',
        backgroundColor: cardBg,
        padding: 10,
        transform: [{ scale: pressed ? 0.96 : 1 }],
      })}
    >
      {/* Label and Subtitle top-left */}
      <Text
        style={{
          fontSize: 13,
          fontFamily: type.family.sansBold,
          color: isDark ? '#FFFFFF' : '#111111',
          letterSpacing: -0.2,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text
        style={{
          fontSize: 10,
          fontFamily: type.family.sans,
          color: isDark ? 'rgba(255,255,255,0.5)' : '#8E8E93',
          marginTop: 1,
        }}
        numberOfLines={1}
      >
        {sub}
      </Text>

      {/* Product cutout image bottom-right */}
      {image ? <Image
        source={{ uri: image }}
        style={{
          position: 'absolute',
          bottom: 0,
          right: 0,
          width: 60,
          height: 60,
          borderTopLeftRadius: 16,
          borderBottomRightRadius: 18,
        }}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={IMAGE_TRANSITION}
      /> : null}
    </Pressable>
  );
});

// ── Collage Slot (shows image or aesthetic grey placeholder) ─────────────────
const CollageSlot = memo(function CollageSlot({
  uri,
  isDark,
}: {
  uri: string | null;
  isDark: boolean;
}) {
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ flex: 1, height: '100%' }}
        contentFit="cover"
        cachePolicy="memory-disk"
      />
    );
  }
  // Aesthetic empty placeholder — soft gradient-like grey with a subtle camera icon
  return (
    <View
      style={{
        flex: 1,
        height: '100%',
        backgroundColor: isDark ? '#2A2A2C' : '#ECEDF0',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Feather
        name="camera"
        size={16}
        color={isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.10)'}
      />
    </View>
  );
});

// ── Recommended User Card (Matching Image 1) ────────────────────────────────
const RecommendedUserCard = memo(function RecommendedUserCard({
  user,
  isFollowing,
  onToggleFollow,
  onPress,
  isDark,
  theme,
}: {
  user: RecommendedUser;
  isFollowing: boolean;
  onToggleFollow: (id: string) => void;
  onPress: (user: RecommendedUser) => void;
  isDark: boolean;
  theme: any;
}) {
  return (
    <Pressable
      onPress={() => onPress(user)}
      accessibilityRole="button"
      accessibilityLabel={`View ${user.name}'s closet`}
      style={({ pressed }) => ({
        width: 172,
        borderRadius: 16,
        padding: 10,
        backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: isDark ? 0.2 : 0.04,
        shadowRadius: 6,
        elevation: 2,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      {/* 2×2 Photos Collage */}
      <View
        style={{
          height: 124,
          borderRadius: 12,
          overflow: 'hidden',
          backgroundColor: isDark ? '#2C2C2E' : '#F3F4F6',
        }}
      >
        <View style={{ flex: 1, flexDirection: 'row', gap: 3, marginBottom: 3 }}>
          <CollageSlot uri={user.photos[0]} isDark={isDark} />
          <CollageSlot uri={user.photos[1]} isDark={isDark} />
        </View>
        <View style={{ flex: 1, flexDirection: 'row', gap: 3 }}>
          <CollageSlot uri={user.photos[2]} isDark={isDark} />
          <CollageSlot uri={user.photos[3]} isDark={isDark} />
        </View>
      </View>

      {/* Floating Center Avatar with thick border */}
      <View
        style={{
          width: 54,
          height: 54,
          borderRadius: 27,
          alignSelf: 'center',
          marginTop: -27,
          borderWidth: 3,
          borderColor: isDark ? '#1C1C1E' : '#FFFFFF',
          overflow: 'hidden',
          backgroundColor: isDark ? '#2C2C2E' : '#F3F4F6',
        }}
      >
        <Image
          source={{ uri: user.avatar }}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={IMAGE_TRANSITION}
        />
      </View>

      {/* Username */}
      <Text
        style={{
          fontSize: 14,
          fontFamily: type.family.sansBold,
          color: theme.ink,
          textAlign: 'center',
          marginTop: 4,
        }}
        numberOfLines={1}
      >
        {user.name}
      </Text>

      {/* + Follow Button */}
      <Pressable
        onPress={(e) => {
          e.stopPropagation?.();
          onToggleFollow(user.id);
        }}
        accessibilityRole="button"
        accessibilityLabel={isFollowing ? `Unfollow ${user.name}` : `Follow ${user.name}`}
        style={({ pressed }) => ({
          height: 36,
          borderRadius: 8,
          marginTop: 10,
          backgroundColor: isFollowing ? 'transparent' : (isDark ? '#FFFFFF' : '#0F0F0F'),
          borderWidth: isFollowing ? 1 : 0,
          borderColor: isDark ? 'rgba(255,255,255,0.2)' : '#D1D5DB',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 4,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        {isFollowing ? (
          <Feather name="check" size={14} color={theme.ink} />
        ) : (
          <Feather name="plus" size={14} color={isDark ? '#000000' : '#FFFFFF'} />
        )}
        <Text
          style={{
            fontSize: 13,
            fontFamily: type.family.sansBold,
            color: isFollowing ? theme.ink : (isDark ? '#000000' : '#FFFFFF'),
          }}
        >
          {isFollowing ? 'Following' : 'Follow'}
        </Text>
      </Pressable>
    </Pressable>
  );
});
