import React from 'react';
import {
  View,
  Pressable,
  Platform,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Text } from '@/lib/rnText';
import { colors, type } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';

export interface MobileTabBarProps extends Partial<BottomTabBarProps> {
  activeTab?: string;
  onTabSelect?: (tabName: string) => void;
  onSellPress?: () => void;
  unreadChatCount?: number;
  className?: string;
  style?: ViewStyle;
}

const TAB_CONFIG: {
  name: string;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  isSellFab?: boolean;
}[] = [
  { name: 'index', label: 'Home', icon: 'home' },
  { name: 'discover', label: 'Search', icon: 'search' },
  { name: 'upload', label: 'Sell', icon: 'plus', isSellFab: true },
  { name: 'chat', label: 'Chat', icon: 'message-circle' },
  { name: 'profile', label: 'Profile', icon: 'user' },
];

/**
 * Mobile-First Sticky Navigation Tab Bar (Z: 50).
 * Features an elevated 56x56px center Sell FAB, safe area bottom clearance,
 * and 120fps haptic feedback for one-handed thumb ergonomics.
 */
export function MobileTabBar({
  state,
  navigation,
  activeTab,
  onTabSelect,
  onSellPress,
  unreadChatCount = 0,
  className = '',
  style,
}: MobileTabBarProps) {
  const { theme: colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();

  const currentRouteName = state
    ? state.routes[state.index]?.name
    : activeTab || 'index';

  const handleTabPress = (tabName: string, isSellFab?: boolean) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(
        isSellFab
          ? Haptics.ImpactFeedbackStyle.Medium
          : Haptics.ImpactFeedbackStyle.Light
      ).catch(() => {});
    }

    if (isSellFab && onSellPress) {
      if (Platform.OS === 'web') {
        setTimeout(onSellPress, 80);
      } else {
        onSellPress();
      }
      return;
    }

    if (onTabSelect) {
      onTabSelect(tabName);
    }

    if (navigation && state) {
      const route = state.routes.find((r) => r.name === tabName);
      if (route) {
        const isFocused = state.routes[state.index].key === route.key;
        const event = navigation.emit({
          type: 'tabPress',
          target: route.key,
          canPreventDefault: true,
        });

        if (!isFocused && !event.defaultPrevented) {
          navigation.navigate(route.name);
        }
      }
    }
  };

  return (
    <View
      className={className}
      style={[
        styles.wrapper,
        {
          paddingBottom: Math.max(insets.bottom, 12),
          borderTopColor: theme.hairline || colors.hairline,
          backgroundColor: Platform.OS === 'ios' ? 'transparent' : isDark ? 'rgba(24, 24, 24, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        },
        style,
      ]}
    >
      {/* Background with iOS BlurView support */}
      {Platform.OS === 'ios' ? (
        <BlurView
          intensity={30}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFillObject}
        />
      ) : (
        <View
          style={[
            StyleSheet.absoluteFillObject,
            styles.fallbackBg,
            { backgroundColor: isDark ? 'rgba(24, 24, 24, 0.95)' : 'rgba(255, 255, 255, 0.95)' },
          ]}
        />
      )}

      <View style={styles.tabRow}>
        {TAB_CONFIG.map((tab) => {
          const isActive = currentRouteName === tab.name;

          if (tab.isSellFab) {
            return (
              <SellFabButton
                key={tab.name}
                theme={theme}
                onPress={() => handleTabPress(tab.name, true)}
              />
            );
          }

          return (
            <TabItemButton
              key={tab.name}
              icon={tab.icon}
              label={tab.label}
              isActive={isActive}
              badge={tab.name === 'chat' ? unreadChatCount : 0}
              theme={theme}
              onPress={() => handleTabPress(tab.name, false)}
            />
          );
        })}
      </View>
    </View>
  );
}

function TabItemButton({
  icon,
  label,
  isActive,
  badge = 0,
  theme,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  isActive: boolean;
  badge?: number;
  theme?: typeof colors;
  onPress: () => void;
}) {
  const { theme: colors } = useTheme();
  const activeTheme = theme || colors;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={({ pressed }) => [
        styles.tabItem,
        { opacity: pressed ? 0.7 : 1, transform: [{ scale: pressed ? 0.94 : 1 }] },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: isActive }}
    >
      <View style={styles.iconWrapper}>
        <Feather
          name={icon}
          size={22}
          color={isActive ? colors.primary : activeTheme.ink}
        />
        {badge > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {badge > 99 ? '99+' : badge}
            </Text>
          </View>
        )}
      </View>
      <Text
        style={[
          styles.tabLabel,
          {
            color: isActive ? colors.primary : activeTheme.mute,
            fontFamily: isActive ? type.family.sansBold : type.family.sansMedium,
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SellFabButton({
  onPress,
  theme,
}: {
  onPress: () => void;
  theme?: typeof colors;
}) {
  const activeTheme = theme || colors;
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.92, { damping: 15, stiffness: 300 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  return (
    <View style={styles.fabWrapper}>
      <Animated.View style={[styles.fabContainer, animatedStyle]}>
        <Pressable
          onPress={(e) => {
            e?.stopPropagation?.();
            if (Platform.OS === 'web') {
              (e as any)?.preventDefault?.();
            }
            onPress();
          }}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={styles.fabButton}
          accessibilityRole="button"
          accessibilityLabel="Sell an item"
        >
          <Feather name="plus" size={26} color={activeTheme.white} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
      },
      android: {
        elevation: 8,
      },
      default: {
        boxShadow: '0 -4px 16px rgba(0, 0, 0, 0.06)',
      },
    }),
  },
  fallbackBg: {
    ...StyleSheet.absoluteFillObject,
  },
  tabRow: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
  },
  tabItem: {
    flex: 1,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapper: {
    position: 'relative',
  },
  tabLabel: {
    fontSize: 10,
    marginTop: 3,
    letterSpacing: 0.1,
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -7,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.white,
  },
  fabWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -20, // Elevate above tab dock
  },
  fabContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#6C47FF',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
      },
      android: {
        elevation: 6,
      },
      default: {
        boxShadow: '0 6px 18px rgba(108, 71, 255, 0.35)',
      },
    }),
  },
});
