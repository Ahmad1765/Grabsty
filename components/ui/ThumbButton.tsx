import React from 'react';
import {
  Pressable,
  View,
  ActivityIndicator,
  Platform,
  StyleSheet,
  ViewStyle,
  TextStyle,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import Feather from '@expo/vector-icons/Feather';
import { Text } from '@/lib/rnText';
import { radii, type, ThemeTokens } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'dark'
  | 'soft'
  | 'ghost'
  | 'danger'
  | 'text';

export type ButtonHeightToken = '44px' | '48px' | '52px' | '56px';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'hero';

export interface ThumbButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  /** Height token or semantic size */
  size?: ButtonSize;
  heightToken?: ButtonHeightToken;
  icon?: keyof typeof Feather.glyphMap;
  iconRight?: boolean;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  /** Enable or disable haptic feedback on touch (defaults to true) */
  enableHaptics?: boolean;
  /** Optional badge count or tag string (e.g. item count "12") */
  badge?: string | number;
  className?: string;
  style?: ViewStyle;
  textStyle?: TextStyle;
  accessibilityLabel?: string;
}

const HEIGHT_MAP: Record<ButtonSize, number> = {
  sm: 44, // Minimum 44px mobile touch target
  md: 48, // Standard primary action height
  lg: 52, // High priority sticky CTA
  hero: 56, // Full screen checkout / publish conversion
};

const TOKEN_HEIGHTS: Record<ButtonHeightToken, number> = {
  '44px': 44,
  '48px': 48,
  '52px': 52,
  '56px': 56,
};

const FONT_SIZES: Record<ButtonSize, number> = {
  sm: 13,
  md: 14,
  lg: 15,
  hero: 16,
};

const PADDING_HORIZONTAL: Record<ButtonSize, number> = {
  sm: 16,
  md: 20,
  lg: 24,
  hero: 28,
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Mobile-First ThumbButton.
 * Engineered for thumb-zone ergonomics with strict >=44px touch targets,
 * 120fps Reanimated press-physics, haptic impacts, and WCAG AA contrast.
 */
export function ThumbButton({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  heightToken,
  icon,
  iconRight = false,
  loading = false,
  disabled = false,
  fullWidth = true,
  enableHaptics = true,
  badge,
  className = '',
  style,
  textStyle,
  accessibilityLabel,
}: ThumbButtonProps) {
  const { theme, isDark } = useTheme();
  const height = heightToken ? TOKEN_HEIGHTS[heightToken] : HEIGHT_MAP[size];
  const fontSize = FONT_SIZES[size];
  const paddingX = PADDING_HORIZONTAL[size];
  const isInteractive = !disabled && !loading;

  // Reanimated 4 physics scale
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  const handlePressIn = () => {
    if (!isInteractive) return;
    scale.value = withSpring(0.96, { damping: 15, stiffness: 300 });
    if (enableHaptics && Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  };

  const handlePressOut = () => {
    if (!isInteractive) return;
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  const colorStyles = getColorStyles(variant, theme, isDark, disabled);

  return (
    <AnimatedPressable
      onPress={isInteractive ? onPress : undefined}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={!isInteractive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ disabled: !isInteractive, busy: loading }}
      // Explicit 44x44 minimum hit slop padding
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={[
        { width: fullWidth ? '100%' : 'auto', alignSelf: fullWidth ? 'stretch' : 'flex-start' },
        animatedStyle,
      ]}
    >
      <View
        className={className}
        style={[
          styles.base,
          {
            height,
            paddingHorizontal: paddingX,
            backgroundColor: colorStyles.bg,
            borderWidth: colorStyles.borderWidth,
            borderColor: colorStyles.borderColor,
            borderRadius: colorStyles.bg === theme.purple ? 10 : radii.pill,
          },
          getVariantShadow(variant, isDark, disabled),
          style,
        ]}
      >
        {/* Leading Icon */}
        {!iconRight && icon && !loading && (
          <Feather
            name={icon}
            size={fontSize + 3}
            color={colorStyles.fg}
            style={styles.iconMargin}
          />
        )}

        {/* Loading Spinner or Text */}
        {loading ? (
          <ActivityIndicator size="small" color={colorStyles.fg} />
        ) : (
          <View style={styles.contentRow}>
            <Text
              style={[
                styles.label,
                {
                  color: colorStyles.fg,
                  fontSize,
                  fontFamily: type.family.sansBold,
                },
                textStyle,
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>

            {badge !== undefined && badge !== null && badge !== 0 && badge !== '' && (
              <View
                style={[
                  styles.badgeContainer,
                  {
                    backgroundColor:
                      variant === 'primary'
                        ? 'rgba(255,255,255,0.25)'
                        : isDark
                          ? 'rgba(255,255,255,0.12)'
                          : theme.primarySoft,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    {
                      color: variant === 'primary' ? '#FFFFFF' : theme.ink,
                      fontSize: fontSize - 2,
                    },
                  ]}
                >
                  {badge}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Trailing Icon */}
        {iconRight && icon && !loading && (
          <Feather
            name={icon}
            size={fontSize + 3}
            color={colorStyles.fg}
            style={styles.iconRightMargin}
          />
        )}
      </View>
    </AnimatedPressable>
  );
}

function getColorStyles(
  variant: ButtonVariant,
  theme: ThemeTokens,
  isDark: boolean,
  disabled?: boolean,
) {
  if (disabled) {
    return {
      bg: isDark ? '#222222' : theme.panel,
      fg: theme.muteSoft,
      borderWidth: 0,
      borderColor: 'transparent',
    };
  }

  switch (variant) {
    case 'primary':
      return {
        bg: theme.purple,
        fg: '#FFFFFF',
        borderWidth: 0,
        borderColor: 'transparent',
      };
    case 'secondary':
    case 'ghost':
      return {
        bg: isDark ? theme.surface : '#FFFFFF',
        fg: theme.ink,
        borderWidth: 1,
        borderColor: isDark ? theme.border : theme.hairline,
      };
    case 'dark':
      return {
        bg: isDark ? theme.panel : '#111111',
        fg: isDark ? theme.ink : '#FFFFFF',
        borderWidth: isDark ? 1 : 0,
        borderColor: isDark ? theme.border : 'transparent',
      };
    case 'soft':
      return {
        bg: theme.purpleSoft,
        fg: isDark ? '#A78BFA' : theme.purple,
        borderWidth: 0,
        borderColor: 'transparent',
      };
    case 'danger':
      return {
        bg: theme.danger,
        fg: '#FFFFFF',
        borderWidth: 0,
        borderColor: 'transparent',
      };
    case 'text':
      return {
        bg: 'transparent',
        fg: isDark ? '#A78BFA' : theme.purple,
        borderWidth: 0,
        borderColor: 'transparent',
      };
    default:
      return {
        bg: theme.purple,
        fg: '#FFFFFF',
        borderWidth: 0,
        borderColor: 'transparent',
      };
  }
}

function getVariantShadow(variant: ButtonVariant, isDark: boolean, disabled?: boolean): ViewStyle {
  if (isDark || disabled || variant !== 'primary') {
    return {};
  }

  return Platform.select({
    ios: {
      shadowColor: '#6C47FF',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.28,
      shadowRadius: 10,
    },
    android: {
      elevation: 3,
    },
    default: {
      boxShadow: '0 4px 14px rgba(108, 71, 255, 0.24)',
    },
  }) as ViewStyle;
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  label: {
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  iconMargin: {
    marginRight: 6,
  },
  iconRightMargin: {
    marginLeft: 6,
  },
  badgeContainer: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontWeight: '700',
  },
});
