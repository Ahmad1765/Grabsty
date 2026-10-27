// ─────────────────────────────────────────────────────────────────────────────
// DISCOVER HEADER (PRESENTATIONAL)
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Seamless Search Mode Morphing
// The DiscoverHeader houses the title bar, search input with real-time feedback,
// and the primary discovery mode segments (Items, Aesthetics, Brands, Users).
// ─────────────────────────────────────────────────────────────────────────────

import { memo } from 'react';
import { View, Pressable, ActivityIndicator } from 'react-native';
import { Text, TextInput } from '@/lib/rnText';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import Animated from 'react-native-reanimated';
import { BellIcon } from '@/components/ui';
import { radii } from '@/lib/theme';
import { HIT_SLOP_8 } from '@/lib/responsive';
import { DiscoverSegments, type DiscoverTab } from './SearchTabs';

import { useTheme } from '@/context/ThemeContext';
type DiscoverHeaderProps = {
  query: string;
  tab: DiscoverTab;
  searchActive: boolean;
  searching: boolean;
  showSearchLanding: boolean;
  fade: any;
  onChangeQuery: (q: string) => void;
  onFocusSearch: () => void;
  onClearSearch: () => void;
  onCancelSearch: () => void;
  onChangeTab: (t: DiscoverTab) => void;
};

export const DiscoverHeader = memo(function DiscoverHeader({
  query,
  tab,
  searchActive,
  searching,
  showSearchLanding,
  fade,
  onChangeQuery,
  onFocusSearch,
  onClearSearch,
  onCancelSearch,
  onChangeTab,
}: DiscoverHeaderProps) {
  const { theme: colors } = useTheme();
  return (
    <>
      {/* Top Title Bar */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingTop: 6,
          paddingBottom: 4,
        }}
      >
        <Text style={{ fontSize: 24, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 }}>
          Discover
        </Text>
        <Pressable
          hitSlop={HIT_SLOP_8}
          onPress={() => router.push('/news' as any)}
          style={({ pressed }) => ({
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: colors.panel,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <BellIcon size={18} color={colors.ink} />
        </Pressable>
      </View>

      {/* Search Input Bar */}
      <Animated.View
        style={[
          {
            marginHorizontal: 16,
            marginTop: 10,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          },
          fade,
        ]}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: colors.panel,
            borderRadius: radii.pill,
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: 14,
            paddingRight: 10,
            height: 46,
          }}
        >
          <Feather name="search" size={18} color={colors.muteSoft} style={{ flexShrink: 0 }} />
          <TextInput
            value={query}
            onChangeText={onChangeQuery}
            onFocus={onFocusSearch}
            placeholder={
              tab === 'aesthetics'
                ? 'Search aesthetics'
                : tab === 'brands'
                  ? 'Search brands'
                  : tab === 'users'
                    ? 'Search people'
                    : 'Search items, brands, sellers'
            }
            placeholderTextColor={colors.muteSoft}
            style={{
              flex: 1,
              minWidth: 0,
              flexShrink: 1,
              marginLeft: 10,
              marginRight: 6,
              fontSize: 16,
              color: colors.ink,
              padding: 0,
              outlineStyle: 'none',
              outlineWidth: 0,
            } as any}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {searching && (
            <ActivityIndicator size="small" color={colors.purple} style={{ marginRight: 6, flexShrink: 0 }} />
          )}
          {query.length > 0 && (
            <Pressable
              hitSlop={HIT_SLOP_8}
              onPress={onClearSearch}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              style={({ pressed }) => ({
                flexShrink: 0,
                width: 24,
                height: 24,
                borderRadius: radii.pill,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Feather name="x" size={16} color={colors.muteSoft} />
            </Pressable>
          )}
        </View>
        {searchActive && (
          <Pressable hitSlop={HIT_SLOP_8} onPress={onCancelSearch} accessibilityRole="button">
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.purple }}>Cancel</Text>
          </Pressable>
        )}
      </Animated.View>

      {/* Discovery Mode Segments */}
      {!showSearchLanding && <DiscoverSegments tab={tab} onChange={onChangeTab} />}
    </>
  );
});
