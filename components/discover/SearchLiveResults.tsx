import { memo, useState, useMemo } from 'react';
import { View, Pressable, ScrollView, Platform } from 'react-native';
import { Text } from '@/lib/rnText';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/context/ThemeContext';
import { colors, type } from '@/lib/theme';
import { IMAGE_TRANSITION } from '@/lib/images';
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
  const { theme, isDark } = useTheme();
  const [activeTab, setActiveTab] = useState<'items' | 'profiles'>('items');

  const q = query.trim().toLowerCase();

  // Filter listings
  const filteredListings = useMemo(() => {
    if (!q || !listings.length) return [];
    return listings
      .filter((item) => {
        const titleMatch = item.title?.toLowerCase().includes(q);
        const brandMatch = item.brand?.toLowerCase().includes(q);
        const catMatch = item.category?.toLowerCase().includes(q);
        const tagMatch = item.tags?.some((t) => t.toLowerCase().includes(q));
        return titleMatch || brandMatch || catMatch || tagMatch;
      })
      .slice(0, 10);
  }, [q, listings]);

  // Extract and filter matching sellers
  const filteredSellers = useMemo(() => {
    if (!q) return [];
    const map = new Map<string, { id: string; name: string; username: string; avatar: string; items: number }>();

    // Add sellers from listings
    listings.forEach((l) => {
      if (l.seller && !map.has(l.seller.id)) {
        map.set(l.seller.id, {
          id: l.seller.id,
          name: l.seller.full_name || l.seller.username || 'Seller',
          username: l.seller.username || '',
          avatar: l.seller.avatar_url || `https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80`,
          items: l.seller.total_sales || 18,
        });
      }
    });

    // Also include curated popular sellers if matching
    const curated = [
      { id: 'c1', name: 'Clutty', username: 'clutty', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80', items: 46 },
      { id: 'c2', name: 'W_Clothing', username: 'w_clothing', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80', items: 17 },
      { id: 'c3', name: 'Anya Vintage', username: 'anya_vintage', avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80', items: 84 },
      { id: 'c4', name: 'Marcus Kicks', username: 'marcus_kicks', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80', items: 31 },
    ];
    curated.forEach((c) => {
      if (!map.has(c.id)) map.set(c.id, c);
    });

    return Array.from(map.values())
      .filter((s) => s.name.toLowerCase().includes(q) || s.username.toLowerCase().includes(q))
      .slice(0, 8);
  }, [q, listings]);

  // Quick match pills from suggestions
  const quickPill = useMemo(() => {
    const matched = suggestions.find((s) => s.text.toLowerCase().includes(q));
    return matched ? matched.text : query.trim();
  }, [suggestions, q, query]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {/* ── Sub-tabs (Markets/Items vs Profiles) matching Image 2 ──── */}
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
      </View>

      {/* ── Quick Match Tag matching Image 2 ([DFB Pokal] pill) ────────── */}
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
          filteredListings.length > 0 ? (
            filteredListings.map((item) => {
              const thumb = item.thumbnails?.[0] || item.images?.[0] || 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=200&auto=format&fit=crop&q=80';
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
                    <Image
                      source={{ uri: thumb }}
                      style={{ width: '100%', height: '100%' }}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      transition={IMAGE_TRANSITION}
                    />
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
                      {item.brand ? `${item.brand} • ` : ''}
                      {item.category}
                      {item.condition ? ` • ${item.condition.replace(/_/g, ' ')}` : ''}
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
                      ${item.price}
                    </Text>
                    <Text
                      style={{
                        fontSize: 10.5,
                        fontFamily: type.family.sans,
                        color: theme.muteSoft,
                        marginTop: 2,
                      }}
                    >
                      Instant buy
                    </Text>
                  </View>
                </Pressable>
              );
            })
          ) : (
            /* Fallback to search suggestions if no direct catalog listing matches */
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
          filteredSellers.length > 0 ? (
            filteredSellers.map((seller) => (
              <Pressable
                key={seller.id}
                onPress={() => {
                  haptic();
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
                  <Image
                    source={{ uri: seller.avatar }}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={IMAGE_TRANSITION}
                  />
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
                    @{seller.username || seller.name.toLowerCase()} • {seller.items} items
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
