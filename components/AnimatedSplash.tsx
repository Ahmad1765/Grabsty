import { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import Animated, {
  Easing,
  interpolate,
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

// Native-only launch animation modelled on References/Splash Screen.mp4:
// fade to brand colour -> cut to a full-bleed product collage around a big
// logo -> slow drift while the app boots -> collage collapses into the centre
// as the logo shrinks -> brief hold on the small logo -> hand off to the app.
// Signal Purple stands in for the reference's yellow (three-hue rule).

const PURPLE = '#6C47FF';
const INK = '#0F0F0F';
const WHITE = '#FFFFFF';
const MIN_SHOW_MS = 1500;
const BG_FADE_MS = 320;
// The collage is composed on a 390x844 portrait canvas (height/width). Laying
// it out on raw screen width/height stretched it: pieces drifted apart on tall
// 20:9 phones and piled up on short/wide ones.
const DESIGN_AR = 844 / 390;
// Widest the canvas gets relative to screen height, so tablets / landscape
// get a centred collage instead of a giant cropped close-up.
const MAX_CANVAS_W_PER_H = 0.62;

type Canvas = { x: number; y: number; w: number; h: number };

/** Cover the screen with the design canvas, centred; overflow bleeds off-edge. */
function fitCanvas(sw: number, sh: number): Canvas {
  const w = Math.max(Math.min(sw, sh * MAX_CANVAS_W_PER_H), sh / DESIGN_AR);
  const h = w * DESIGN_AR;
  return { x: (sw - w) / 2, y: (sh - h) / 2, w, h };
}

// x/y = centre as a fraction of canvas width/height, w = width as a fraction
// of canvas width, ar = height/width of the asset. Edge pieces bleed off-screen.
const PIECES = [
  { src: require('@/assets/images/splash/headphones.webp'), x: 0.22, y: 0.12, w: 0.7, ar: 354 / 420, rot: -14, spin: -30 },
  { src: require('@/assets/images/splash/hoodie.webp'), x: 0.88, y: 0.13, w: 0.46, ar: 560 / 335, rot: 10, spin: 25 },
  { src: require('@/assets/images/splash/makeup.webp'), x: 0.58, y: 0.28, w: 0.32, ar: 420 / 388, rot: 8, spin: 20 },
  { src: require('@/assets/images/splash/compact.webp'), x: 0.18, y: 0.32, w: 0.24, ar: 174 / 255, rot: -18, spin: -35 },
  { src: require('@/assets/images/splash/handbag.webp'), x: 0.06, y: 0.47, w: 0.42, ar: 560 / 476, rot: 12, spin: -20 },
  { src: require('@/assets/images/splash/mouse.webp'), x: 0.9, y: 0.4, w: 0.2, ar: 262 / 178, rot: -18, spin: 35 },
  { src: require('@/assets/images/splash/bike.webp'), x: 0.88, y: 0.6, w: 0.52, ar: 339 / 560, rot: -8, spin: 18 },
  { src: require('@/assets/images/splash/mascara.webp'), x: 0.22, y: 0.67, w: 0.34, ar: 84 / 241, rot: -32, spin: -40 },
  { src: require('@/assets/images/splash/tube.webp'), x: 0.63, y: 0.71, w: 0.14, ar: 560 / 215, rot: 22, spin: 30 },
  { src: require('@/assets/images/splash/phone.webp'), x: 0.16, y: 0.88, w: 0.66, ar: 380 / 560, rot: 18, spin: -25 },
  { src: require('@/assets/images/splash/sneaker.webp'), x: 0.76, y: 0.9, w: 0.64, ar: 497 / 541, rot: -12, spin: 22 },
];
const G = require('@/assets/images/splash/g.png');

// Feather outlines, drawn with SVG so they don't wait on the icon font.
const DOODLES: { x: number; y: number; rot: number; d: string[]; circle?: [number, number, number] }[] = [
  { x: 0.36, y: 0.38, rot: -10, d: ['M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z'] },
  { x: 0.72, y: 0.42, rot: 12, d: ['M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z'] },
  { x: 0.45, y: 0.63, rot: 8, d: ['M13 2L3 14h9l-1 8 10-12h-9l1-8z'] },
  { x: 0.08, y: 0.61, rot: -8, d: ['M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z'] },
  { x: 0.44, y: 0.79, rot: 14, d: ['M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 7.39L12 18.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z'] },
  { x: 0.58, y: 0.06, rot: -16, d: ['M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z'], circle: [7, 7, 1.2] },
];

function Piece({ p, c, exit }: {
  p: (typeof PIECES)[number];
  c: Canvas;
  exit: SharedValue<number>;
}) {
  const pw = p.w * c.w;
  const ph = pw * p.ar;
  // Spin a little extra as the collage gets sucked into the centre.
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${p.rot + p.spin * exit.value}deg` }],
  }));
  return (
    <Animated.View style={[styles.abs, { left: c.x + p.x * c.w - pw / 2, top: c.y + p.y * c.h - ph / 2, width: pw, height: ph }, style]}>
      <Image source={p.src} style={StyleSheet.absoluteFill} contentFit="contain" />
    </Animated.View>
  );
}

export function AnimatedSplash({ appReady }: { appReady: boolean }) {
  const reduced = useReducedMotion();
  const { width: w, height: h } = useWindowDimensions();
  const [minElapsed, setMinElapsed] = useState(false);
  const [done, setDone] = useState(false);

  const bg = useSharedValue(0); // 0 white (matches native splash) -> 1 purple
  const shown = useSharedValue(0); // collage visibility
  const zoom = useSharedValue(1.12); // collage punch-in + drift
  const exit = useSharedValue(0); // 0 full collage -> 1 collapsed into logo
  const logo = useSharedValue(1.12);
  const fade = useSharedValue(1);

  // Everything here is scheduled on the UI thread at mount, so a JS thread
  // busy booting the app can't delay or squash the collage.
  useEffect(() => {
    const d = BG_FADE_MS + 80;
    const out = Easing.out(Easing.cubic);
    bg.value = withTiming(1, { duration: BG_FADE_MS, easing: Easing.out(Easing.quad) });
    shown.value = withDelay(d, withTiming(1, { duration: 70 }));
    zoom.value = withDelay(d, withSequence(
      withTiming(1, { duration: 420, easing: out }),
      withTiming(1.05, { duration: 4000, easing: Easing.linear }),
    ));
    logo.value = withDelay(d, withTiming(1, { duration: 420, easing: out }));
    const min = setTimeout(() => setMinElapsed(true), MIN_SHOW_MS);
    return () => clearTimeout(min);
  }, [bg, shown, zoom, logo]);

  useEffect(() => {
    if (!appReady || !minElapsed) return;
    // Let the app's first (heavy) render land under the overlay before
    // collapsing, otherwise that mount eats the collapse frames on Android.
    const d = 350;
    const suck = Easing.in(Easing.cubic);
    exit.value = withDelay(d, withTiming(1, { duration: 460, easing: suck }));
    logo.value = withDelay(d, withTiming(0.42, { duration: 460, easing: Easing.inOut(Easing.cubic) }));
    fade.value = withDelay(d + 460 + 450, withTiming(0, { duration: 260 }, (finished) => {
      if (finished) runOnJS(setDone)(true);
    }));
  }, [appReady, minElapsed, exit, logo, fade]);

  const rootStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    backgroundColor: interpolateColor(bg.value, [0, 1], [WHITE, PURPLE]),
  }));
  const collageStyle = useAnimatedStyle(() => ({
    opacity: shown.value * interpolate(exit.value, [0, 0.6, 1], [1, 1, 0]),
    transform: [{ scale: zoom.value * interpolate(exit.value, [0, 1], [1, 0.08]) }],
  }));
  const logoStyle = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ scale: logo.value }],
  }));

  if (reduced || done) return null;

  const c = fitCanvas(w, h);
  const logoSize = Math.round(c.w * 0.27);
  const doodle = Math.round(c.w * 0.09);

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.root, rootStyle]}
      // Take over from the static native splash once we're on screen.
      onLayout={() => SplashScreen.hideAsync()}
    >
      <StatusBar style="light" />
      <Animated.View style={[StyleSheet.absoluteFill, collageStyle]}>
        {DOODLES.map((dd, i) => (
          <View
            key={`d${i}`}
            style={[styles.abs, { left: c.x + dd.x * c.w - doodle / 2, top: c.y + dd.y * c.h - doodle / 2, transform: [{ rotate: `${dd.rot}deg` }] }]}
          >
            <Svg width={doodle} height={doodle} viewBox="0 0 24 24" fill="none" stroke={WHITE} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              {dd.d.map((d, j) => <Path key={j} d={d} />)}
              {dd.circle && <Circle cx={dd.circle[0]} cy={dd.circle[1]} r={dd.circle[2]} fill={WHITE} />}
            </Svg>
          </View>
        ))}
        {PIECES.map((p, i) => (
          <Piece key={i} p={p} c={c} exit={exit} />
        ))}
      </Animated.View>
      <Animated.View
        style={[
          styles.logo,
          {
            width: logoSize,
            height: logoSize,
            borderRadius: logoSize * 0.3,
            left: (w - logoSize) / 2,
            top: (h - logoSize) / 2,
          },
          logoStyle,
        ]}
      >
        <Image
          source={G}
          style={{ width: logoSize * 0.56, height: logoSize * 0.56 * (256 / 250) }}
          contentFit="contain"
          tintColor={PURPLE}
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { zIndex: 1000, elevation: 1000, overflow: 'hidden' },
  abs: { position: 'absolute' },
  logo: {
    position: 'absolute',
    backgroundColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: INK,
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
});
