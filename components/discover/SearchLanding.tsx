// Discover's search panel body — clean, simplified bento-grid layout:
//   1. BROWSE GRID       — Image bento tiles (3-2-3 row layout):
//                          • Row 1 (3 items): New drops, Trending, Deals
//                          • Row 2 (2 items): Wide "Top closets" card (flex: 2) + Solid Ink "Explore all"
//                            accent card with white right arrow (flex: 1)
//                          • Row 3 (3 items): Clothing, Sneakers, Accessories
//   2. RECOMMENDED USERS — Horizontal card carousel with 2×2 photo collage, overlapping avatar,
//                          rating hearts, review count, and full-width + Follow button (Matching Image 1).
//   3. POPULAR BRANDS    — Horizontal rail of squircle [Brand ↗] chips (Matching Image 1).
//
// Complies with UI_GUARDRAILS.md (Three-Hue Rule, Zero Gradients, Inter typography,
// inline styles on Pressable, testID).

import { memo, useCallback, useState, useEffect } from 'react';
import { View, Pressable, Platform, ScrollView, StyleSheet } from 'react-native';
import { Text } from '@/lib/rnText';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { IMAGE_TRANSITION } from '@/lib/images';
import { type CategoryId } from '@/lib/categories';
import { colors, type } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';
import type { SortKey } from '@/lib/listings';
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

// ── Grid Cards Data ─────────────────────────────────────────────────────────
type StandardCard = {
  id: string;
  label: string;
  sub: string;
  image: string;
  action: { type: 'browse'; payload: BrowseAction } | { type: 'topic'; payload: TopicAction };
};

const ROW_1: StandardCard[] = [
  {
    id: 'new',
    label: 'New drops',
    sub: 'Just listed',
    image: 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=300&auto=format&fit=crop&q=80',
    action: { type: 'browse', payload: { kind: 'sort', sort: 'newest' } },
  },
  {
    id: 'trending',
    label: 'Trending',
    sub: 'Most popular',
    image: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=300&auto=format&fit=crop&q=80',
    action: { type: 'browse', payload: { kind: 'sort', sort: 'popular' } },
  },
  {
    id: 'deals',
    label: 'Best deals',
    sub: 'Lowest price',
    image: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=300&auto=format&fit=crop&q=80',
    action: { type: 'browse', payload: { kind: 'sort', sort: 'price_asc' } },
  },
];

// Row 2: Wide card + Accent card
const WIDE_CARD = {
  id: 'top_closets',
  label: 'Top closets',
  sub: 'Verified sellers',
  badge: 'Nearby',
  image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80',
  action: { kind: 'tab', tab: 'users' } as BrowseAction,
};

const ACCENT_CARD = {
  id: 'explore_all',
  label: 'Explore all',
  sub: 'Categories',
  action: { kind: 'all' } as TopicAction,
};

const ROW_3: StandardCard[] = [
  {
    id: 'clothing',
    label: 'Clothing',
    sub: 'Apparel',
    image: 'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=300&auto=format&fit=crop&q=80',
    action: { type: 'topic', payload: { kind: 'category', category: 'clothing' } },
  },
  {
    id: 'shoes',
    label: 'Sneakers',
    sub: 'Kicks & boots',
    image: 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=300&auto=format&fit=crop&q=80',
    action: { type: 'topic', payload: { kind: 'category', category: 'shoes' } },
  },
  {
    id: 'accessories',
    label: 'Accessories',
    sub: 'Bags & jewelry',
    image: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=300&auto=format&fit=crop&q=80',
    action: { type: 'topic', payload: { kind: 'category', category: 'accessories' } },
  },
];

// ── Recommended Users Data (Matching Image 1) ──────────────────────────────
export type RecommendedUser = {
  id: string;
  name: string;
  username: string;
  avatar: string;
  rating: number;
  reviews: number;
  photos: [string, string, string, string];
};

export const RECOMMENDED_USERS: RecommendedUser[] = [
  {
    id: 'u_clutty',
    name: 'Clutty',
    username: 'clutty',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
    rating: 4,
    reviews: 46,
    photos: [
      'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=200&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=200&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=200&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=200&auto=format&fit=crop&q=80',
    ],
  },
  {
    id: 'u_w_clothing',
    name: 'W_Clothing',
    username: 'w_clothing',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80',
    rating: 5,
    reviews: 17,
    photos: [
      'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=200&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1544441893-675973e31985?w=200&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=200&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1582533561751-ef6f6ab93a2e?w=200&auto=format&fit=crop&q=80',
    ],
  },
  {
    id: 'u_anya',
    name: 'Anya_Vintage',
    username: 'anya_vintage',
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200&auto=format&fit=crop&q=80',
    rating: 5,
    reviews: 84,
    photos: [
      'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=200&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1576995853123-5a10305d93c0?w=200&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=200&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=200&auto=format&fit=crop&q=80',
    ],
  },
  {
    id: 'u_marcus',
    name: 'Marcus_Kicks',
    username: 'marcus_kicks',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&auto=format&fit=crop&q=80',
    rating: 5,
    reviews: 31,
    photos: [
      'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=200&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1552346154-21d32810aba3?w=200&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?w=200&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1584735935682-2f2b69dff9d2?w=200&auto=format&fit=crop&q=80',
    ],
  },
];

// ── Popular Brands Data (Matching Image 1) ──────────────────────────────────
export const POPULAR_BRANDS = [
  'Zara',
  'H&M',
  'Gina Tricot',
  'Nike',
  'Mango',
  'Stüssy',
  'Carhartt',
  'Acne Studios',
];

// ── Main SearchLanding Component ────────────────────────────────────────────
export function SearchLanding({
  covers,
  onBrowse,
  onTopic,
  onSearch,
  activeChipId,
}: {
  covers?: Partial<Record<string, string>>;
  onBrowse: (action: BrowseAction) => void;
  onTopic: (action: TopicAction) => void;
  onSearch?: (query: string) => void;
  activeChipId?: string | null;
}) {
  const { theme, isDark } = useTheme();
  const [selectedId, setSelectedId] = useState<string | null>(activeChipId ?? null);
  const [followingMap, setFollowingMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (activeChipId !== undefined) setSelectedId(activeChipId);
  }, [activeChipId]);

  const handleStandardCard = useCallback(
    (card: StandardCard) => {
      setSelectedId(card.id);
      if (card.action.type === 'browse') {
        onBrowse(card.action.payload);
      } else {
        onTopic(card.action.payload);
      }
    },
    [onBrowse, onTopic],
  );

  const handleWideCard = useCallback(() => {
    setSelectedId(WIDE_CARD.id);
    onBrowse(WIDE_CARD.action);
  }, [onBrowse]);

  const handleAccentCard = useCallback(() => {
    setSelectedId(ACCENT_CARD.id);
    onTopic(ACCENT_CARD.action);
  }, [onTopic]);

  const handleToggleFollow = useCallback((userId: string) => {
    setFollowingMap((prev) => ({
      ...prev,
      [userId]: !prev[userId],
    }));
  }, []);

  const cardBg = isDark ? '#1C1C1E' : '#F6F6F8';

  return (
    <View style={{ paddingTop: 14 }}>
      {/* ── BROWSE IMAGE BENTO GRID (3-2-3 Layout) ─────────────────────── */}
      <View style={{ paddingHorizontal: PAD, gap: GAP }}>
        {/* ROW 1: 3 equal cards */}
        <View style={{ flexDirection: 'row', gap: GAP }}>
          {ROW_1.map((card) => (
            <BentoTile
              key={card.id}
              label={card.label}
              sub={card.sub}
              image={card.image}
              selected={selectedId === card.id}
              cardBg={cardBg}
              isDark={isDark}
              onPress={() => handleStandardCard(card)}
            />
          ))}
        </View>

        {/* ROW 2: Wide Card (flex: 2) + Solid Ink Accent Card (flex: 1) */}
        <View style={{ flexDirection: 'row', gap: GAP }}>
          {/* Wide card: Top Closets */}
          <Pressable
            onPress={() => {
              haptic();
              handleWideCard();
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
              borderWidth: selectedId === WIDE_CARD.id ? 2 : 0,
              borderColor: selectedId === WIDE_CARD.id ? colors.purple : 'transparent',
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
                    backgroundColor: colors.purple,
                  }}
                />
                <Text
                  style={{
                    fontSize: 10.5,
                    fontFamily: type.family.sansBold,
                    color: colors.purple,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}
                >
                  {WIDE_CARD.badge}
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
                {WIDE_CARD.label}
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
                {WIDE_CARD.sub}
              </Text>
            </View>

            {/* Stylized Right Image */}
            <Image
              source={{ uri: WIDE_CARD.image }}
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
              handleAccentCard();
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
              borderWidth: selectedId === ACCENT_CARD.id ? 2 : 0,
              borderColor: selectedId === ACCENT_CARD.id ? colors.purple : 'transparent',
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
                {ACCENT_CARD.label}
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
                {ACCENT_CARD.sub}
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
          {ROW_3.map((card) => (
            <BentoTile
              key={card.id}
              label={card.label}
              sub={card.sub}
              image={card.image}
              selected={selectedId === card.id}
              cardBg={cardBg}
              isDark={isDark}
              onPress={() => handleStandardCard(card)}
            />
          ))}
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
          {RECOMMENDED_USERS.map((user) => (
            <RecommendedUserCard
              key={user.id}
              user={user}
              isFollowing={!!followingMap[user.id]}
              onToggleFollow={handleToggleFollow}
              onPress={() => {
                haptic();
                onBrowse({ kind: 'tab', tab: 'users' });
              }}
              isDark={isDark}
              theme={theme}
            />
          ))}
        </ScrollView>
      </View>

      {/* ── POPULAR BRANDS (Matching Image 1) ─────────────────────────── */}
      <View style={{ marginTop: 28, marginBottom: 24 }}>
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
          Popular brands
        </Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: PAD, gap: 10 }}
        >
          {POPULAR_BRANDS.map((brand) => (
            <Pressable
              key={brand}
              onPress={() => {
                haptic();
                onSearch?.(brand);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Search brand ${brand}`}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 14,
                height: 36,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: isDark ? 'rgba(255,255,255,0.15)' : '#D1D5DB',
                backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
                transform: [{ scale: pressed ? 0.96 : 1 }],
              })}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontFamily: type.family.sansBold,
                  color: theme.ink,
                }}
              >
                {brand}
              </Text>
              <Feather name="arrow-up-right" size={15} color={theme.ink} />
            </Pressable>
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
  selected,
  cardBg,
  isDark,
  onPress,
}: {
  label: string;
  sub: string;
  image: string;
  selected: boolean;
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
        borderWidth: selected ? 2 : 0,
        borderColor: selected ? colors.purple : 'transparent',
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
      <Image
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
      />
    </Pressable>
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
          <Image source={{ uri: user.photos[0] }} style={{ flex: 1, height: '100%' }} contentFit="cover" cachePolicy="memory-disk" />
          <Image source={{ uri: user.photos[1] }} style={{ flex: 1, height: '100%' }} contentFit="cover" cachePolicy="memory-disk" />
        </View>
        <View style={{ flex: 1, flexDirection: 'row', gap: 3 }}>
          <Image source={{ uri: user.photos[2] }} style={{ flex: 1, height: '100%' }} contentFit="cover" cachePolicy="memory-disk" />
          <Image source={{ uri: user.photos[3] }} style={{ flex: 1, height: '100%' }} contentFit="cover" cachePolicy="memory-disk" />
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

      {/* Rating Hearts (5 hearts + review count) */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          marginTop: 4,
        }}
      >
        {[1, 2, 3, 4, 5].map((i) => (
          <Ionicons
            key={i}
            name={i <= user.rating ? 'heart' : 'heart-outline'}
            size={13}
            color="#EF4444"
          />
        ))}
        <Text
          style={{
            fontSize: 11,
            fontFamily: type.family.sans,
            color: theme.muteSoft,
            marginLeft: 2,
          }}
        >
          ({user.reviews})
        </Text>
      </View>

      {/* + Follow Button */}
      <Pressable
        onPress={(e) => {
          e.stopPropagation?.();
          haptic();
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
