import { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { Text } from '@/lib/rnText';
import { GrabstyLogo, BRAND_MARK_PURPLE } from '@/components/ui/GrabstyLogo';
import { type as typography } from '@/lib/theme';

// Native-only launch hand-off. Simple on purpose: it starts as an exact copy of
// the static native splash (assets/images/splash.png: the logo tile on white,
// ~33% of the screen width, centred), so there's no colour jump. The tile
// settles, the wordmark and tagline fade in, and once the app is ready the
// whole thing eases out into the first screen.

const MIN_SHOW_MS = 900;
const INK = '#0F0F0F';
const MUTE = '#6B6B6B';
// splash.png is a 1024 canvas with a ~340px tile, shown with resizeMode contain.
const TILE_FRACTION = 340 / 1024;

export function AnimatedSplash({ appReady, fontsReady }: { appReady: boolean; fontsReady: boolean }) {
  const reduced = useReducedMotion();
  const { width: w, height: h } = useWindowDimensions();
  const [minElapsed, setMinElapsed] = useState(false);
  const [done, setDone] = useState(false);

  const tile = useSharedValue(1); // tile scale
  const words = useSharedValue(0); // wordmark + tagline
  const fade = useSharedValue(1); // whole overlay

  useEffect(() => {
    tile.value = withTiming(0.86, { duration: 520, easing: Easing.out(Easing.cubic) });
    const t = setTimeout(() => setMinElapsed(true), MIN_SHOW_MS);
    return () => clearTimeout(t);
  }, [tile]);

  // Text mounts only once Inter is registered: Android never repaints a <Text>
  // drawn in the fallback font, so mounting earlier would lock in Roboto.
  useEffect(() => {
    if (fontsReady) words.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.quad) });
  }, [fontsReady, words]);

  useEffect(() => {
    if (!appReady || !minElapsed) return;
    // A beat so the app's first (heavy) render lands under the overlay.
    tile.value = withDelay(200, withTiming(0.8, { duration: 280, easing: Easing.inOut(Easing.cubic) }));
    fade.value = withDelay(220, withTiming(0, { duration: 300, easing: Easing.out(Easing.quad) }, (finished) => {
      if (finished) runOnJS(setDone)(true);
    }));
  }, [appReady, minElapsed, tile, fade]);

  const rootStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const tileStyle = useAnimatedStyle(() => ({ transform: [{ scale: tile.value }] }));
  const wordsStyle = useAnimatedStyle(() => ({
    opacity: words.value,
    transform: [{ translateY: (1 - words.value) * 8 }],
  }));

  if (reduced || done) return null;

  const size = Math.round(Math.min(w, h) * TILE_FRACTION);
  // The tile ends ~14% smaller; put the words just under its settled edge.
  const wordsTop = h / 2 + (size * 0.86) / 2 + 22;

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.root, rootStyle]}
      // Take over from the static native splash once we're on screen.
      onLayout={() => SplashScreen.hideAsync()}
    >
      <StatusBar style="dark" />
      <Animated.View
        style={[
          styles.tile,
          {
            width: size,
            height: size,
            borderRadius: size * 0.21,
            left: (w - size) / 2,
            top: (h - size) / 2,
          },
          tileStyle,
        ]}
      >
        <GrabstyLogo size={size} />
      </Animated.View>
      {fontsReady ? (
        <Animated.View style={[styles.words, { top: wordsTop }, wordsStyle]}>
          <Text style={styles.wordmark}>Grabsty</Text>
          <Text style={styles.tagline}>Pre-loved fashion, protected.</Text>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { zIndex: 1000, elevation: 1000, backgroundColor: '#FFFFFF' },
  tile: {
    position: 'absolute',
    backgroundColor: BRAND_MARK_PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  words: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  wordmark: { fontSize: 26, fontFamily: typography.family.sansBold, color: INK, letterSpacing: -0.6 },
  tagline: { fontSize: 14, fontFamily: typography.family.sans, color: MUTE, marginTop: 4 },
});
