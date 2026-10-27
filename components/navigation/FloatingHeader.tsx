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
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { Text } from '@/lib/rnText';
import { colors, radii, type } from '@/lib/theme';

import { useTheme } from '@/context/ThemeContext';

export interface FloatingHeaderProps {
  title?: string;
  subtitle?: string;
  centerElement?: React.ReactNode;
  onBack?: () => void;
  backIcon?: keyof typeof Feather.glyphMap;
  showBack?: boolean;
  rightActions?: {
    icon: keyof typeof Feather.glyphMap;
    onPress: () => void;
    active?: boolean;
    activeColor?: string;
    badge?: number | string;
    accessibilityLabel: string;
  }[];
  /** Glassmorphic blur intensity (default: 25) */
  blurIntensity?: number;
  /** Transparent background overlay */
  transparent?: boolean;
  className?: string;
  style?: ViewStyle;
}

/**
 * Mobile-First Floating Header.
 * Glassmorphic top navigation bar with dynamic insets.top clearance,
 * AA-safe typography, and standard 44x44px circular touch targets.
 */
export function FloatingHeader({
  title,
  subtitle,
  centerElement,
  onBack,
  backIcon = 'arrow-left',
  showBack = true,
  rightActions = [],
  blurIntensity = 25,
  transparent = false,
  className = '',
  style,
}: FloatingHeaderProps) {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();

  const handlePress = (onPress: () => void) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    onPress();
  };

  const content = (
    <View
      style={[
        styles.innerContainer,
        {
          paddingTop: Math.max(insets.top, 12),
        },
      ]}
    >
      <View style={styles.contentRow}>
        {/* Leading Left: 44x44px Circular Back Action */}
        <View style={styles.leftSlot}>
          {showBack && onBack ? (
            <Pressable
              onPress={() => handlePress(onBack)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={({ pressed }) => [
                styles.iconCircle,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                  opacity: pressed ? 0.75 : 1,
                  transform: [{ scale: pressed ? 0.94 : 1 }],
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Feather name={backIcon} size={20} color={theme.text} />
            </Pressable>
          ) : null}
        </View>

        {/* Center: Title / Subtitle or Custom Search Pill */}
        <View style={styles.centerSlot}>
          {centerElement ? (
            centerElement
          ) : (
            <>
              {title && (
                <Text
                  style={[styles.title, { color: theme.text, fontFamily: type.family.sansBold }]}
                  numberOfLines={1}
                >
                  {title}
                </Text>
              )}
              {subtitle && (
                <Text style={[styles.subtitle, { color: theme.textMuted }]} numberOfLines={1}>
                  {subtitle}
                </Text>
              )}
            </>
          )}
        </View>

        {/* Trailing Right: 44x44px Contextual Actions (Share, Bookmark, Filter) */}
        <View style={styles.rightSlot}>
          {rightActions.map((action, idx) => (
            <Pressable
              key={idx}
              onPress={() => handlePress(action.onPress)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={({ pressed }) => [
                styles.iconCircle,
                { backgroundColor: theme.surface, borderColor: theme.border },
                action.active && {
                  backgroundColor: theme.primarySoft,
                  borderColor: theme.primarySofter || theme.border,
                },
                { opacity: pressed ? 0.75 : 1, transform: [{ scale: pressed ? 0.94 : 1 }] },
              ]}
              accessibilityRole="button"
              accessibilityLabel={action.accessibilityLabel}
            >
              <Feather
                name={action.icon}
                size={19}
                color={
                  action.active
                    ? action.activeColor || theme.primary
                    : theme.text
                }
              />
              {action.badge !== undefined && action.badge !== 0 && (
                <View style={[styles.badge, { backgroundColor: theme.primary }]}>
                  <Text style={[styles.badgeText, { color: theme.background }]}>{action.badge}</Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );

  if (transparent) {
    return (
      <View
        className={className}
        style={[styles.containerAbsolute, style]}
      >
        {content}
      </View>
    );
  }

  return (
    <View
      className={className}
      style={[
        styles.container,
        {
          borderBottomColor: theme.border,
          backgroundColor: Platform.OS === 'ios' ? 'transparent' : isDark ? 'rgba(15,15,15,0.95)' : 'rgba(255,255,255,0.95)',
        },
        style,
      ]}
    >
      {Platform.OS === 'ios' ? (
        <BlurView
          intensity={blurIntensity}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFillObject}
        />
      ) : (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: isDark ? 'rgba(15,15,15,0.94)' : 'rgba(255, 255, 255, 0.94)' }]} />
      )}
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  containerAbsolute: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
  },
  fallbackBg: {
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
  },
  innerContainer: {
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  contentRow: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leftSlot: {
    minWidth: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  centerSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  rightSlot: {
    minWidth: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  title: {
    fontSize: 16,
    color: colors.ink,
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 11,
    color: colors.mute,
    marginTop: 1,
    textAlign: 'center',
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
      },
      android: {
        elevation: 2,
      },
      default: {
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      },
    }),
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
});
