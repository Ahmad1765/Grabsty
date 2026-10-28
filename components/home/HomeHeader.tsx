// ─────────────────────────────────────────────────────────────────────────────
// HOME FEED HEADER (PRESENTATIONAL)
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Preserving Aesthetic Discipline in Composed Headers
// Encapsulates the in-feed search bar, scrollable feed chips (For you, Trending,
// Saved, and custom alerts), and zero-layout-shift cold start guidance banners.
// ─────────────────────────────────────────────────────────────────────────────

import { memo, useRef, useMemo } from 'react';
import { View, Pressable, ScrollView, Platform, useWindowDimensions } from 'react-native';
import { useIsDesktop } from '@/lib/responsive';
import { Text, TextInput } from '@/lib/rnText';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { PlickNotificationIcon } from '@/components/ui';
import { radii, shadow, type as typography } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';
import {
  FOR_YOU,
  TRENDING,
  type DynamicFilterChip,
  DEFAULT_TRENDING_CHIP,
} from './useHomeFeedFilters';
import type { SavedSearch } from '@/lib/savedSearches';

function haptic() {
  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

type FeedSearchProps = {
  value: string;
  onChangeText: (t: string) => void;
  focused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  onPressSearch?: () => void;
  resultCount: number | null;
  filterCount?: number;
  onOpenFilter?: () => void;
  unreadNotificationsCount?: number;
  onPressNotifications?: () => void;
  onOpenShareProfile?: () => void;
  placeholder?: string;
};

export const FeedSearch = memo(function FeedSearch({
  value,
  onChangeText,
  focused,
  onFocus,
  onBlur,
  onPressSearch,
  resultCount,
  filterCount,
  onOpenFilter,
  unreadNotificationsCount,
  onPressNotifications,
  onOpenShareProfile,
  placeholder = 'What are you looking for today?',
}: FeedSearchProps) {
  const { theme, isDark } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const inputRef = useRef<any>(null);
  const searching = value.trim().length > 0;
  const searchBg = isDark ? theme.surface : '#F0F1F5';

  const resolvedPlaceholder = useMemo(() => {
    if (placeholder !== 'What are you looking for today?') {
      return placeholder;
    }
    if (screenWidth < 380) {
      return 'Search items, brands…';
    }
    if (screenWidth < 420) {
      return 'What are you looking for?';
    }
    return placeholder;
  }, [placeholder, screenWidth]);

  return (
    <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={value.trim() ? `Search: ${value}` : resolvedPlaceholder}
          onPress={() => {
            haptic();
            if (onPressSearch) {
              onPressSearch();
            } else {
              inputRef.current?.focus();
            }
          }}
          style={({ pressed }) => ({
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: pressed ? (isDark ? theme.panel : '#E8EAED') : searchBg,
            borderRadius: radii.pill,
            paddingLeft: 14,
            paddingRight: searching ? 8 : 14,
            height: 44,
            borderWidth: 0,
            opacity: pressed && onPressSearch ? 0.85 : 1,
            outlineStyle: 'none',
          } as any)}
        >
          <Feather
            name="search"
            size={16}
            color={theme.mute}
            style={{ flexShrink: 0 }}
          />
          <TextInput
            ref={inputRef}
            value={value}
            onChangeText={onChangeText}
            onFocus={() => {
              if (onPressSearch) {
                inputRef.current?.blur();
                onPressSearch();
              } else {
                onFocus();
              }
            }}
            onBlur={onBlur}
            placeholder={resolvedPlaceholder}
            placeholderTextColor={theme.muteSoft}
            accessibilityLabel={resolvedPlaceholder}
            editable={!onPressSearch}
            pointerEvents={onPressSearch ? 'none' : 'auto'}
            style={{
              flex: 1,
              minWidth: 0,
              flexShrink: 1,
              marginLeft: 8,
              marginRight: searching ? 6 : 0,
              fontFamily: typography.family.sansMedium,
              fontSize: 16,
              letterSpacing: -0.15,
              color: theme.ink,
              padding: 0,
              outlineStyle: 'none',
              outlineWidth: 0,
            } as any}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
          {searching && Platform.OS !== 'ios' && (
            <Pressable
              onPress={() => onChangeText('')}
              hitSlop={8}
              accessibilityLabel="Clear search"
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                backgroundColor: theme.border,
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 4,
              }}
            >
              <Feather name="x" size={12} color={theme.mute} />
            </Pressable>
          )}
          {resultCount != null && (
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: radii.pill,
                backgroundColor: theme.purpleSoft,
                flexShrink: 0,
              }}
            >
              <Text
                style={{
                  fontFamily: typography.family.sansBold,
                  fontSize: 11,
                  color: theme.purple,
                  letterSpacing: -0.2,
                }}
              >
                {resultCount}
              </Text>
            </View>
          )}
        </Pressable>

        {focused ? (
          <Pressable
            onPress={() => {
              inputRef.current?.blur();
              onBlur();
            }}
            hitSlop={8}
            style={({ pressed }) => ({
              paddingHorizontal: 4,
              paddingVertical: 8,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text
              style={{
                fontFamily: typography.family.sansBold,
                fontSize: 14,
                color: theme.ink,
              }}
            >
              Cancel
            </Text>
          </Pressable>
        ) : (
          /* Notifications button (Plick style) */
          <Pressable
            onPress={() => {
              haptic();
              if (onPressNotifications) {
                onPressNotifications();
              } else {
                router.push('/news' as any);
              }
            }}
            accessibilityRole="button"
            accessibilityLabel={
              unreadNotificationsCount && unreadNotificationsCount > 0
                ? `${unreadNotificationsCount} unread notifications`
                : 'Notifications'
            }
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: pressed ? theme.surface : (isDark ? theme.panel : '#FFFFFF'),
              borderWidth: 1,
              borderColor: theme.border,
              alignItems: 'center',
              justifyContent: 'center',
              transform: [{ scale: pressed ? 0.94 : 1 }],
              position: 'relative',
              outlineStyle: 'none',
              ...shadow.sm,
            } as any)}
          >
            <PlickNotificationIcon size={20} color={theme.ink} strokeWidth={2.2} />
            {!!unreadNotificationsCount && unreadNotificationsCount > 0 && (
              <View
                style={{
                  position: 'absolute',
                  top: 10,
                  right: 10,
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: '#EF4444',
                  borderWidth: 1.5,
                  borderColor: isDark ? theme.panel : '#FFFFFF',
                }}
              />
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
});

type ChipRowProps = {
  savedSearches: SavedSearch[];
  activeChip: string;
  dynamicChip?: DynamicFilterChip;
  onSelectChip: (id: string) => void;
  onResetDynamicChip?: () => void;
  onDeleteChip: (s: SavedSearch) => void;
  onAdd: () => void;
};

export const ChipRow = memo(function ChipRow({
  savedSearches,
  activeChip,
  dynamicChip = DEFAULT_TRENDING_CHIP,
  onSelectChip,
  onResetDynamicChip,
  onDeleteChip,
  onAdd,
}: ChipRowProps) {
  const { theme, isDark } = useTheme();

  const isDynamicActive =
    activeChip === dynamicChip.id ||
    (dynamicChip.isDefaultTrending && activeChip === TRENDING);
  const isForYouActive = activeChip === FOR_YOU;

  const activeChipBg = isDark ? theme.selected : '#F0F1F5';
  const inactiveChipBg = isDark ? theme.panel : '#FFFFFF';
  const chipBorder = isDark ? theme.border : '#E5E7EB';

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: 16,
        gap: 8,
        paddingVertical: 9.5,
        alignItems: 'center',
      }}
    >
      {/* 1. For You Primary Chip */}
      <Pressable
        onPress={() => {
          haptic();
          onSelectChip(FOR_YOU);
        }}
        accessibilityRole="button"
        accessibilityLabel="Browse For you"
        style={({ pressed }) => ({
          height: 30,
          paddingHorizontal: 12,
          borderRadius: 15,
          backgroundColor: isForYouActive ? activeChipBg : inactiveChipBg,
          borderWidth: 1,
          borderColor: isForYouActive ? 'transparent' : chipBorder,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 5,
          transform: [{ scale: pressed ? 0.96 : 1 }],
        })}
      >
        <Ionicons name="sparkles" size={13} color={theme.ink} />
        <Text
          style={{
            fontFamily: typography.family.sansBold,
            fontSize: 13,
            lineHeight: 18,
            letterSpacing: -0.2,
            color: theme.ink,
          }}
        >
          For you
        </Text>
      </Pressable>

      {/* 2. Dynamic Chip (Trending, Saved, or Category topic) */}
      <Pressable
        onPress={() => {
          haptic();
          onSelectChip(dynamicChip.id);
        }}
        accessibilityRole="button"
        accessibilityLabel={`Browse ${dynamicChip.label}`}
        style={({ pressed }) => ({
          height: 30,
          paddingHorizontal: 12,
          borderRadius: 15,
          backgroundColor: isDynamicActive ? activeChipBg : inactiveChipBg,
          borderWidth: 1,
          borderColor: isDynamicActive ? 'transparent' : chipBorder,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 5,
          transform: [{ scale: pressed ? 0.96 : 1 }],
        })}
      >
        <Feather
          name={dynamicChip.icon}
          size={13}
          color={theme.ink}
        />
        <Text
          style={{
            fontFamily: typography.family.sansBold,
            fontSize: 13,
            lineHeight: 18,
            letterSpacing: -0.2,
            color: theme.ink,
          }}
        >
          {dynamicChip.label}
        </Text>
      </Pressable>

      {/* 3. Create Alert / Saved Search Circular Button */}
      <Pressable
        onPress={() => {
          haptic();
          onAdd();
        }}
        accessibilityLabel="Create alert"
        style={({ pressed }) => ({
          width: 30,
          height: 30,
          borderRadius: 15,
          backgroundColor: inactiveChipBg,
          borderWidth: 1,
          borderColor: chipBorder,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ scale: pressed ? 0.96 : 1 }],
        })}
      >
        <Feather name="plus" size={14} color={theme.ink} />
      </Pressable>

      {/* 4. Saved Searches / Custom Topics Chips */}
      {savedSearches.map((s) => {
        const active = activeChip === s.id;
        return (
          <Pressable
            key={s.id}
            onPress={() => {
              haptic();
              onSelectChip(s.id);
            }}
            onLongPress={() => {
              haptic();
              onDeleteChip(s);
            }}
            style={({ pressed }) => ({
              height: 30,
              paddingHorizontal: 12,
              borderRadius: 15,
              backgroundColor: active ? activeChipBg : inactiveChipBg,
              borderWidth: 1,
              borderColor: active ? 'transparent' : chipBorder,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              transform: [{ scale: pressed ? 0.96 : 1 }],
            })}
          >
            <Text
              style={{
                fontFamily: typography.family.sansMedium,
                fontSize: 13,
                lineHeight: 18,
                letterSpacing: -0.2,
                color: theme.ink,
              }}
            >
              {s.label ?? 'Saved'}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
});

type HomeHeaderProps = {
  searchProps: FeedSearchProps;
  chipProps: ChipRowProps;
  showColdStartBanner?: boolean;
};

export const HomeHeader = memo(function HomeHeader({
  searchProps,
  chipProps,
}: HomeHeaderProps) {
  // Desktop search and notifications live in DesktopTopNav.
  const isDesktop = useIsDesktop();
  return (
    <>
      {isDesktop ? <View style={{ height: 8 }} /> : <FeedSearch {...searchProps} />}
      <ChipRow {...chipProps} />
    </>
  );
});
