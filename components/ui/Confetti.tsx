// Party-popper confetti: two cannons fire from the left and right edges, pieces arc
// inward/up, then flutter down under gravity with air drag (Instagram-notes style).
// Each piece runs its own UI-thread clock; positions are closed-form,
// so there is no per-frame JS work.
import { useEffect, useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions, Platform } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';

// Celebration-only palette, matched to the reference video (user-approved for confetti).
const COLORS = ['#6C47FF', '#8B5CF6', '#FF8A00', '#FFC400', '#FF2D7A'];
const SHAPES = ['dot', 'strip', 'squiggle', 'star'] as const;
type Shape = (typeof SHAPES)[number];

const PIECES = 64;
const DURATION_MS = 4000;
// Units are dp. Tuned so a launch from 36% height peaks near the top of a ~700dp
// screen, then rains down at ~350 dp/s terminal speed.
const GRAVITY = 700; // dp/s²
const DRAG = 2; // 1/s

type Piece = {
  x0: number;
  y0: number;
  vx: number;
  vy: number;
  rot0: number;
  spin: number; // deg/s
  flip: number; // rad/s, fakes 3D tumbling via scaleX
  swayAmp: number;
  swayFreq: number;
  shape: Shape;
  color: string;
  size: number;
};

const rand = (min: number, max: number) => min + Math.random() * (max - min);

function makePieces(width: number, height: number): Piece[] {
  const originY = height * 0.36;
  return Array.from({ length: PIECES }, (_, i) => {
    const fromLeft = i % 2 === 0;
    return {
      x0: fromLeft ? -6 : width + 6,
      y0: originY + rand(-20, 20),
      // Max sideways reach is vx / DRAG: 30–90% of the screen width.
      vx: (fromLeft ? 1 : -1) * rand(0.6, 1.8) * width,
      vy: -rand(500, 950),
      rot0: rand(0, 360),
      spin: rand(-540, 540),
      flip: rand(4, 11),
      swayAmp: rand(6, 22),
      swayFreq: rand(2, 5),
      shape: SHAPES[i % SHAPES.length],
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: rand(7, 11),
    };
  });
}

function PieceShape({ shape, color, size }: Pick<Piece, 'shape' | 'color' | 'size'>) {
  if (shape === 'dot') {
    return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
  }
  if (shape === 'strip') {
    return <View style={{ width: size * 0.45, height: size * 1.3, borderRadius: 1.5, backgroundColor: color }} />;
  }
  if (shape === 'squiggle') {
    return (
      <Svg width={size * 1.4} height={size} viewBox="0 0 14 10">
        <Path d="M1 7 Q3.5 1 6 5 T11 4 T13 2" stroke={color} strokeWidth={2.2} fill="none" strokeLinecap="round" />
      </Svg>
    );
  }
  return (
    <Svg width={size * 1.3} height={size * 1.3} viewBox="0 0 24 24">
      <Path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 9.2l7.1-.6z" fill={color} />
    </Svg>
  );
}

function ConfettiPiece({ piece }: { piece: Piece }) {
  // Each piece owns its clock. A single clock handed down as a prop rendered the
  // pieces but never updated them on Android (styles froze at t=0).
  const t = useSharedValue(0);
  // Start on layout, not on mount: mounting the batch can block drawing for most of
  // a second on Android, and a clock started in useEffect was nearly done by then.
  const start = () => {
    if (t.value === 0) t.value = withTiming(DURATION_MS / 1000, { duration: DURATION_MS, easing: Easing.linear });
  };
  // Primitives only: the worklet runs on the UI thread, and a captured props object
  // arrived there unusable (positions went NaN and every piece vanished on Android).
  const { x0, y0, vx, vy, rot0, spin, flip, swayAmp, swayFreq } = piece;
  const style = useAnimatedStyle(() => {
    const s = t.value;
    const decay = (1 - Math.exp(-DRAG * s)) / DRAG;
    const vTerm = GRAVITY / DRAG;
    const x = x0 + vx * decay + Math.sin(s * swayFreq) * swayAmp * Math.min(s * 2, 1);
    const y = y0 + vTerm * s + (vy - vTerm) * decay;
    const end = DURATION_MS / 1000;
    const fade = s > end - 0.6 ? (end - s) / 0.6 : 1;
    return {
      opacity: Math.max(fade, 0),
      transform: [
        { translateX: x },
        { translateY: y },
        { rotate: `${rot0 + spin * s}deg` },
        { scaleX: Math.cos(s * flip) },
      ],
    };
  });
  return (
    <Animated.View style={[styles.piece, style]} onLayout={start}>
      <PieceShape shape={piece.shape} color={piece.color} size={piece.size} />
    </Animated.View>
  );
}

/** Fires once on mount. Render it conditionally (`{show && <Confetti onDone={...} />}`). */
export function Confetti({ onDone }: { onDone?: () => void }) {
  const { width, height } = useWindowDimensions();
  const pieces = useMemo(() => makePieces(width, height), [width, height]);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    const done = setTimeout(() => onDone?.(), DURATION_MS + 1500); // + mount slack
    return () => clearTimeout(done);
    // Fire once; onDone identity changes must not restart the burst.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="confetti-overlay">
      {pieces.map((p, i) => (
        <ConfettiPiece key={i} piece={p} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  piece: { position: 'absolute', left: 0, top: 0 },
});
