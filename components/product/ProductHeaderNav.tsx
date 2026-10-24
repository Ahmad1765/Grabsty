// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT HEADER NAV (PROFESSIONAL FLOATING-TO-STICKY NAVIGATION)
// ─────────────────────────────────────────────────────────────────────────────

import { memo } from 'react';
import { View, Pressable, Platform, StyleSheet } from 'react-native';
import { Text } from '@/lib/rnText';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/context/ThemeContext';
import { HAIRLINE, tap } from './shared';

type ProductHeaderNavProps = {
  showStickyHeader: boolean;
  title?: string | null;
  onBack: () => void;
};

export const ProductHeaderNav = memo(function ProductHeaderNav({
  showStickyHeader,
  title,
  onBack,
}: ProductHeaderNavProps) {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();

  const handleBack = () => {
    tap('light');
    onBack();
  };

  // ── Floating mode: translucent disc over imagery ──────────────────────
  const floatingBg = isDark
    ? 'rgba(20, 20, 20, 0.72)'
    : 'rgba(255, 255, 255, 0.88)';
  const floatingBorder = isDark
    ? 'rgba(255, 255, 255, 0.15)'
    : 'rgba(0, 0, 0, 0.08)';

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top + (Platform.OS === 'android' ? 6 : 4),
          paddingBottom: 8,
          borderBottomWidth: showStickyHeader ? HAIRLINE : 0,
          borderBottomColor: theme.border,
          backgroundColor: showStickyHeader
            ? Platform.OS === 'ios'
              ? 'transparent'
              // No blur off iOS, so translucency just shows text through the bar: go solid.
              : theme.background
            : 'transparent',
        },
      ]}
      pointerEvents="box-none"
    >
      {showStickyHeader && Platform.OS === 'ios' && (
        <BlurView
          intensity={30}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFillObject}
        />
      )}

      <View style={styles.navRow}>
        {/* Left Slot: Back Button */}
        <View style={styles.sideSlot}>
          <Pressable
            onPress={handleBack}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={({ pressed }) => [
              showStickyHeader ? styles.flatButton : styles.navButton,
              !showStickyHeader && {
                backgroundColor: floatingBg,
                borderColor: floatingBorder,
              },
              {
                transform: [{ scale: pressed ? 0.92 : 1 }],
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Feather
              name="arrow-left"
              size={showStickyHeader ? 22 : 20}
              color={theme.ink}
            />
          </Pressable>
        </View>

        {/* Center Slot: Product Title (Sticky Mode Only) */}
        <View style={styles.centerSlot}>
          {showStickyHeader && title ? (
            <Text
              style={[styles.title, { color: theme.ink }]}
              numberOfLines={2}
            >
              {title}
            </Text>
          ) : null}
        </View>

        {/* Right Slot: Spacer for symmetry */}
        <View style={styles.sideSlot} />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    paddingHorizontal: 16,
  },
  navRow: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sideSlot: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* Floating-over-image disc button */
  navButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  /* Sticky-bar flat button — no disc, no background */
  flatButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  title: {
    fontSize: 14.5,
    fontWeight: '700',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
});

