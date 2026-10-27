// The long-press menu for a message: a floating row of quick reactions pinned
// to the bubble you pressed, plus the message-level actions underneath.
//
// It anchors to the bubble rather than living in a bottom sheet because the
// reaction has to read as belonging to *that* message — a centred sheet makes
// you re-find your place afterwards. The row scales up from the bubble's own
// corner (origin-aware, never from scale(0) — nothing in the world appears out
// of nothing) so the connection is legible in the 180ms it takes to arrive.
//
// Android notes, same recipe as ChatActionSheet: a Modal is its own window, so
// it needs statusBarTranslucent + navigationBarTranslucent for the window to
// span the whole screen — which also makes measureInWindow coordinates from
// the thread line up with coordinates in here.

import { useEffect } from 'react';
import { Modal, Pressable, View, useWindowDimensions } from 'react-native';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaProvider, SafeAreaView, initialWindowMetrics } from 'react-native-safe-area-context';
import { PressableScale } from '@/components/PressableScale';
import { radii, type as typography } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';
import { REACTION_EMOJI } from '@/lib/chat';

/** Where on screen the pressed bubble sits, in window coordinates. */
export type Anchor = { x: number; y: number; width: number; height: number; mine: boolean };

export type MessageAction = {
  id: string;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  tone?: 'default' | 'destructive';
  onPress: () => void;
};

const EMOJI_SIZE = 46;
const BAR_PAD = 6;
const BAR_HEIGHT = EMOJI_SIZE + BAR_PAD * 2;
const BAR_WIDTH = REACTION_EMOJI.length * EMOJI_SIZE + BAR_PAD * 2;
const EDGE = 12;
/** Overlap the bubble slightly — a floating bar with a gap reads as unattached. */
const OVERLAP = 6;

// ── Emoji ─────────────────────────────────────────────────────────────────

function Emoji({
  emoji,
  index,
  selected,
  onPress,
}: {
  emoji: string;
  index: number;
  selected: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const reduceMotion = useReducedMotion();
  const t = useSharedValue(reduceMotion ? 1 : 0);

  // A short stagger down the row: the bar reads as dealing the emoji out rather
  // than blinking into place. 26ms apart keeps the whole thing under 300ms.
  useEffect(() => {
    if (reduceMotion) return;
    t.value = withDelay(
      index * 26,
      withTiming(1, { duration: 160, easing: Easing.out(Easing.cubic) }),
    );
  }, [index, reduceMotion, t]);

  const style = useAnimatedStyle(() => ({
    opacity: t.value,
    transform: [{ scale: 0.6 + t.value * 0.4 }],
  }));

  return (
    <Animated.View style={style}>
      <PressableScale
        scaleTo={0.86}
        onPress={onPress}
        accessibilityLabel={selected ? `Remove ${emoji} reaction` : `React with ${emoji}`}
        style={{
          width: EMOJI_SIZE,
          height: EMOJI_SIZE,
          borderRadius: EMOJI_SIZE / 2,
          alignItems: 'center',
          justifyContent: 'center',
          // The one you already picked stays marked, so a second long-press
          // shows you what you did instead of asking you to remember.
          backgroundColor: selected ? theme.primarySoft : 'transparent',
        }}
      >
        <Text style={{ fontSize: 26, lineHeight: 32 }}>{emoji}</Text>
      </PressableScale>
    </Animated.View>
  );
}

// ── Picker ────────────────────────────────────────────────────────────────

export function ReactionPicker({
  anchor,
  selected,
  actions,
  onSelect,
  onClose,
}: {
  /** Null closes the picker. */
  anchor: Anchor | null;
  /** The viewer's current reaction on this message, if any. */
  selected: string | null;
  actions: MessageAction[];
  onSelect: (emoji: string) => void;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const t = useSharedValue(0);

  useEffect(() => {
    if (!anchor) {
      t.value = 0;
      return;
    }
    t.value = reduceMotion
      ? 1
      : withTiming(1, { duration: 180, easing: Easing.out(Easing.cubic) });
  }, [anchor, reduceMotion, t]);

  const barStyle = useAnimatedStyle(() => ({
    opacity: t.value,
    // 0.92, not 0 — an element that grows from nothing looks like it was
    // conjured rather than moved.
    transform: [{ scale: 0.92 + t.value * 0.08 }],
  }));

  if (!anchor) return null;

  // Above the bubble by default. If the bubble is high enough on screen that
  // the bar would clip the header, flip it below instead.
  const above = anchor.y - BAR_HEIGHT + OVERLAP;
  const flip = above < EDGE * 4;
  const top = flip
    ? Math.min(anchor.y + anchor.height - OVERLAP, screenH - BAR_HEIGHT - EDGE)
    : above;

  // Hug the bubble's own edge — the side the message came from.
  const rawLeft = anchor.mine ? anchor.x + anchor.width - BAR_WIDTH : anchor.x;
  const left = Math.max(EDGE, Math.min(rawLeft, screenW - BAR_WIDTH - EDGE));

  // Scale out of the corner nearest the bubble, so the bar visibly comes from
  // the message rather than from the middle of the screen.
  const originX = anchor.mine ? BAR_WIDTH : 0;
  const originY = flip ? 0 : BAR_HEIGHT;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <Pressable
          accessibilityLabel="Close"
          onPress={onClose}
          // Lighter than the app's other sheets on purpose: you're reacting to
          // a specific message and need to still see it under the bar.
          style={{ flex: 1, backgroundColor: theme.overlayLight, justifyContent: 'flex-end' }}
        >
          <Animated.View
            style={[
              {
                position: 'absolute',
                top,
                left,
                width: BAR_WIDTH,
                height: BAR_HEIGHT,
                flexDirection: 'row',
                alignItems: 'center',
                padding: BAR_PAD,
                borderRadius: BAR_HEIGHT / 2,
                backgroundColor: theme.paper,
                borderWidth: 1,
                borderColor: theme.border,
                shadowColor: theme.ink,
                shadowOpacity: 0.14,
                shadowRadius: 20,
                shadowOffset: { width: 0, height: 8 },
                elevation: 8,
                transformOrigin: `${originX}px ${originY}px`,
              } as any,
              barStyle,
            ]}
          >
            {REACTION_EMOJI.map((emoji, i) => (
              <Emoji
                key={emoji}
                emoji={emoji}
                index={i}
                selected={selected === emoji}
                onPress={() => onSelect(emoji)}
              />
            ))}
          </Animated.View>

          {actions.length > 0 && (
            <SafeAreaView edges={['bottom']} style={{ backgroundColor: theme.paper }}>
              <View
                style={{
                  borderTopLeftRadius: radii['4xl'],
                  borderTopRightRadius: radii['4xl'],
                  backgroundColor: theme.paper,
                  borderTopWidth: 1,
                  borderColor: theme.border,
                  paddingVertical: 6,
                }}
              >
                {actions.map((a) => {
                  const isDestructive = a.tone === 'destructive';
                  const actionColor = isDestructive ? (theme.danger ?? '#EF4444') : theme.ink;
                  return (
                    <Pressable
                      key={a.id}
                      accessibilityRole="button"
                      accessibilityLabel={a.label}
                      onPress={() => {
                        onClose();
                        a.onPress();
                      }}
                      style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        paddingVertical: 16,
                        backgroundColor: pressed
                          ? isDestructive
                            ? 'rgba(239, 68, 68, 0.08)'
                            : theme.panel
                          : 'transparent',
                      })}
                    >
                      <Feather name={a.icon} size={17} color={actionColor} />
                      <Text
                        style={{
                          fontFamily: typography.family.sansSemibold,
                          fontSize: 16,
                          color: actionColor,
                        }}
                      >
                        {a.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </SafeAreaView>
          )}
        </Pressable>
      </SafeAreaProvider>
    </Modal>
  );
}
