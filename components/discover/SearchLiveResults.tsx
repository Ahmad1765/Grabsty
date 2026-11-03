import { memo, useState, useMemo, useEffect, useRef } from 'react';
import { View, Pressable, ScrollView, Platform, ActivityIndicator } from 'react-native';
import { Text } from '@/lib/rnText';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/context/ThemeContext';
import { type } from '@/lib/theme';
import { IMAGE_TRANSITION } from '@/lib/images';
import { searchListings } from '@/lib/listings';
import { searchUsers, type FollowListRow } from '@/lib/follows';
import { logSellerSearch } from '@/lib/recommendations';
import { formatPrice } from '@/lib/currency';
import { categoryLabel } from '@/lib/categories';
import { conditionLabel } from '@/components/product/shared';
import type { Listing } from '@/types';
import type { SearchSuggestion } from '@/lib/searchSuggestions';

function haptic() {
  if (Platform.OS !== 'web') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
}

interface SearchLiveResultsProps {
  query: string;
  listings: Listing[];
  suggestions: SearchSuggestion[];
  onSelectListing: (listing: Listing) => void;
  onSelectSeller: (username: string) => void;
  onSelectTerm: (term: string) => void;
}

export const SearchLiveResults = memo(function SearchLiveResults({
  query,
  listings,
  suggestions,
  onSelectListing,
  onSelectSeller,
  onSelectTerm,
}: SearchLiveResultsProps) {
  const { theme: colors } = useTheme();
  const { theme, isDark } = useTheme();
  const [activeTab, setActiveTab] = useState<'items' | 'profiles'>('items');
  const [serverListings, setServerListings] = useState<Listing[]>([]);
  const [serverSellers, setServerSellers] = useState<FollowListRow[]>([]);
  const [loading, setLoading] = useState(false);

  const q = query.trim().toLowerCase();
  const searchSeq = useRef(0);

  // Debounced server search across the full Supabase database (catalog & profiles)
  useEffect(() => {
    if (!q) {
      setServerListings([]);
      setServerSellers([]);
      setLoading(false);
      return;
    }

    const curSeq = ++searchSeq.current;
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        const [listingRes, usersRes] = await Promise.all([
          searchListings({ query: q, limit: 15 }).catch(() => ({ ok: false, rows: [] as Listing[] })),
          searchUsers(q, 15).catch(() => [] as FollowListRow[]),
        ]);

        if (curSeq === searchSeq.current) {
          if (listingRes.ok) {
            setServerListings(listingRes.rows);
          }
          setServerSellers(usersRes);
          setLoading(false);
        }
      } catch {
        if (curSeq === searchSeq.current) {
          setLoading(false);
        }
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [q]);

  // Instant in-memory client refinement combined with server results
  const displayListings = useMemo(() => {
    if (!q) return [];
    // Word-prefix match: "d" finds "Dark navy", not every title with a d in it.
    const hit = (v?: string | null) => !!v && (` ${v.toLowerCase()}`).includes(` ${q}`);
    const clientMatches = listings.filter(
      (item) =>
        !item.is_sold &&
        (hit(item.title) || hit(item.brand) || hit(categoryLabel(item.category)) || item.tags?.some(hit)),
    );

    const seen = new Set<string>();
    const merged: Listing[] = [];

    // Prioritize client matches for instantaneous responsiveness
    for (const item of clientMatches) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        merged.push(item);
      }
    }

    // Merge server results from the wider catalog
    for (const item of serverListings) {
      if (!seen.has(item.id) && !item.is_sold && (hit(item.title) || hit(item.brand) || hit(item.description) || item.tags?.some(hit))) {
        seen.add(item.id);
        merged.push(item);
      }
    }

    return merged.slice(0, 15);
  }, [q, listings, serverListings]);

  // Combined real sellers from active feed + full Supabase profile search
  const displaySellers = useMemo(() => {
    if (!q) return [];
    const map = new Map<string, { id: string; name: string; username: string; avatar: string; items: number }>();

    // 1. Check sellers from loaded listings matching query
    listings.forEach((l) => {
      if (l.seller && l.seller.id) {
        const uName = (l.seller.username || '').toLowerCase();
        const fName = ` ${(l.seller.full_name || '').toLowerCase()}`;
        if (uName.startsWith(q) || fName.includes(` ${q}`)) {
          map.set(l.seller.id, {
            id: l.seller.id,
            name: l.seller.full_name || l.seller.username || 'Seller',
            username: l.seller.username || '',
            avatar: l.seller.avatar_url || '',
            items: l.seller.total_sales || 1,
          });
        }
      }
    });

    // 2. Merge server profiles from Supabase profiles search
    serverSellers.forEach((s) => {
      if (!map.has(s.id)) {
        map.set(s.id, {
          id: s.id,
          name: s.full_name || s.username || 'Member',
          username: s.username || '',
          avatar: s.avatar_url || '',
          items: s.listingCount || s.followers_count || 0,
        });
      }
    });

    return Array.from(map.values()).slice(0, 12);
  }, [q, listings, serverSellers]);

  // Quick match tag from suggestions
  const quickPill = useMemo(() => {
    if (!q) return '';
    return suggestions.find((s) => s.text.toLowerCase().startsWith(q))?.text ?? '';
  }, [suggestions, q]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {/* ── Sub-tabs (Markets/Items vs Profiles) ────────────────────── */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 8,
        }}
      >
        <Pressable
          onPress={() => {
            haptic();
            setActiveTab('items');
          }}
          accessibilityRole="button"
          style={{
            paddingHorizontal: 14,
            height: 32,
            borderRadius: 16,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: activeTab === 'items' ? (isDark ? '#2C2C2E' : '#F0F1F5') : 'transparent',
          }}
        >
          <Text
            style={{
              fontSize: 13,
              fontFamily: type.family.sansBold,
              color: activeTab === 'items' ? theme.ink : theme.muteSoft,
            }}
          >
            Markets
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            haptic();
            setActiveTab('profiles');
          }}
          accessibilityRole="button"
          style={{
            paddingHorizontal: 14,
            height: 32,
            borderRadius: 16,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: activeTab === 'profiles' ? (isDark ? '#2C2C2E' : '#F0F1F5') : 'transparent',
          }}
        >
          <Text
            style={{
              fontSize: 13,
              fontFamily: type.family.sansBold,
              color: activeTab === 'profiles' ? theme.ink : theme.muteSoft,
            }}
          >
            Profiles
          </Text>
        </Pressable>

        {loading && (
          <ActivityIndicator
            size="small"
            color={colors.purple}
            style={{ marginLeft: 'auto', marginRight: 4 }}
          />
        )}
      </View>

      {/* ── Quick Match Tag ([DFB Pokal] style pill) ────────────────── */}
      {quickPill ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
          <Pressable
            onPress={() => {
              haptic();
              onSelectTerm(quickPill);
            }}
            accessibilityRole="button"
            style={({ pressed }) => ({
              alignSelf: 'flex-start',
              paddingHorizontal: 12,
              height: 30,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: isDark ? 'rgba(255,255,255,0.15)' : '#E5E7EB',
              backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
              justifyContent: 'center',
              alignItems: 'center',
              transform: [{ scale: pressed ? 0.96 : 1 }],
            })}
          >
            <Text
              style={{
                fontSize: 12,
                fontFamily: type.family.sansBold,
                color: theme.ink,
              }}
            >
              {quickPill}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* ── Live Results List ────────────────────────────────────────── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {activeTab === 'items' ? (
          displayListings.length > 0 ? (
            displayListings.map((item) => {
              const thumb = item.thumbnails?.[0] || item.images?.[0];
              return (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    haptic();
                    onSelectListing(item);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`View ${item.title}`}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 10,
                    paddingHorizontal: 16,
                    gap: 12,
                    backgroundColor: pressed ? (isDark ? '#2C2C2E' : '#F9FAFB') : 'transparent',
                  })}
                >
                  {/* Left Rounded Image Icon */}
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      overflow: 'hidden',
                      backgroundColor: isDark ? '#2C2C2E' : '#F3F4F6',
                    }}
                  >
                    {thumb ? <Image
                      source={{ uri: thumb }}
                      style={{ width: '100%', height: '100%' }}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      transition={IMAGE_TRANSITION}
                    /> : null}
                  </View>

                  {/* Title and Subtitle */}
                  <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
                    <Text
                      style={{
                        fontSize: 13.5,
                        fontFamily: type.family.sansBold,
                        color: theme.ink,
                      }}
                      numberOfLines={1}
                    >
                      {item.title}
                    </Text>
                    <Text
                      style={{
                        fontSize: 11.5,
                        fontFamily: type.family.sans,
                        color: theme.muteSoft,
                        marginTop: 2,
                      }}
                      numberOfLines={1}
                    >
                      {[item.brand, categoryLabel(item.category), conditionLabel(item.condition)].filter(Boolean).join(' · ')}
                    </Text>
                  </View>

                  {/* Right Price */}
                  <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
                    <Text
                      style={{
                        fontSize: 13.5,
                        fontFamily: type.family.sansBold,
                        color: theme.ink,
                      }}
                    >
                      {formatPrice(item.price, { whole: true })}
                    </Text>
                  </View>
                </Pressable>
              );
            })
          ) : (
            /* Fallback suggestions if catalog has no direct text match */
            <View style={{ paddingTop: 8 }}>
              {suggestions.slice(0, 6).map((s) => (
                <Pressable
                  key={s.id}
                  onPress={() => {
                    haptic();
                    onSelectTerm(s.text);
                  }}
                  accessibilityRole="button"
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    gap: 12,
                    backgroundColor: pressed ? (isDark ? '#2C2C2E' : '#F9FAFB') : 'transparent',
                  })}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      backgroundColor: isDark ? '#2C2C2E' : '#F3F4F6',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Feather name="search" size={16} color={theme.mute} />
                  </View>
                  <Text
                    style={{
                      flex: 1,
                      fontSize: 14,
                      fontFamily: type.family.sansMedium,
                      color: theme.ink,
                    }}
                    numberOfLines={1}
                  >
                    {s.text}
                  </Text>
                  <Feather name="arrow-up-right" size={16} color={theme.muteSoft} />
                </Pressable>
              ))}
            </View>
          )
        ) : (
          /* activeTab === 'profiles' */
          displaySellers.length > 0 ? (
            displaySellers.map((seller) => (
              <Pressable
                key={seller.id}
                onPress={() => {
                  haptic();
                  logSellerSearch(seller.id);
                  onSelectSeller(seller.username || seller.id);
                }}
                accessibilityRole="button"
                accessibilityLabel={`View ${seller.name}`}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 10,
                  paddingHorizontal: 16,
                  gap: 12,
                  backgroundColor: pressed ? (isDark ? '#2C2C2E' : '#F9FAFB') : 'transparent',
                })}
              >
                {/* Circular Profile Avatar */}
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    overflow: 'hidden',
                    backgroundColor: isDark ? '#2C2C2E' : '#F3F4F6',
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB',
                  }}
                >
                  {seller.avatar ? <Image
                    source={{ uri: seller.avatar }}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={IMAGE_TRANSITION}
                  /> : (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                      <Feather name="user" size={18} color={theme.mute} />
                    </View>
                  )}
                </View>

                {/* Seller Name and Username */}
                <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
                  <Text
                    style={{
                      fontSize: 14,
                      fontFamily: type.family.sansBold,
                      color: theme.ink,
                    }}
                    numberOfLines={1}
                  >
                    {seller.name}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      fontFamily: type.family.sans,
                      color: theme.muteSoft,
                      marginTop: 2,
                    }}
                    numberOfLines={1}
                  >
                    @{seller.username || seller.name.toLowerCase()}
                  </Text>
                </View>

                <Feather name="arrow-up-right" size={18} color={theme.muteSoft} />
              </Pressable>
            ))
          ) : (
            <View style={{ paddingVertical: 32, alignItems: 'center' }}>
              <Text style={{ fontSize: 13, fontFamily: type.family.sans, color: theme.muteSoft }}>
                No profiles found matching “{query.trim()}”
              </Text>
            </View>
          )
        )}
      </ScrollView>
    </View>
  );
});
