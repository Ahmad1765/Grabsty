// Motion primitives. Spring/timing presets + small animated components for
// list staggers, pressable scale, fade-in, skeleton shimmer.
//
// All animations use reanimated worklets so they run on the UI thread.

import { useEffect } from 'react';
import {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  
  
  
  withTiming,
  type WithSpringConfig,
  type WithTimingConfig,
} from 'react-native-reanimated';

// ── Easing / spring presets ────────────────────────────────────────────────
export const spring = {
  // Quick, snappy — for press scale, tab switches.
  snap: { damping: 22, stiffness: 320, mass: 0.6 } satisfies WithSpringConfig,
  // Default — natural feeling, used for entrances.
  natural: { damping: 18, stiffness: 220, mass: 0.7 } satisfies WithSpringConfig,
  // Soft — for hero-style reveals.
  soft: { damping: 16, stiffness: 140, mass: 1 } satisfies WithSpringConfig,
};

export const timing = {
  fast: { duration: 180, easing: Easing.out(Easing.cubic) } satisfies WithTimingConfig,
  normal: { duration: 260, easing: Easing.out(Easing.cubic) } satisfies WithTimingConfig,
  slow: { duration: 420, easing: Easing.out(Easing.cubic) } satisfies WithTimingConfig,
};
// Simple fade-in on mount.
export function useFadeIn(delay = 0, durationMs = 260) {
  const opacity = useSharedValue(0);
  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: durationMs, easing: Easing.out(Easing.cubic) }));
  }, [delay, durationMs, opacity]);
  return useAnimatedStyle(() => ({ opacity: opacity.value }));
}
