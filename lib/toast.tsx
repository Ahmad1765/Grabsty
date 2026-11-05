import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AccessibilityInfo, View, Pressable, Animated, Easing, Platform, StyleSheet } from 'react-native';
// Text comes from the rnText shim, not react-native, so toast copy renders in
// Inter on native instead of falling back to the OS system font.
import { Text } from './rnText';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

// JS-driven on web (no RCTAnimation), native-driven on iOS/Android.
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

type ToastVariant = 'default' | 'success' | 'info';
type ToastAction = { label: string; onPress: () => void };
type Toast = {
  id: number;
  message: string;
  variant: ToastVariant;
  icon?: keyof typeof Feather.glyphMap;
  action?: ToastAction;
};

type ToastApi = {
  show: (
    message: string,
    opts?: {
      variant?: ToastVariant;
      icon?: keyof typeof Feather.glyphMap;
      durationMs?: number;
      // Optional trailing button (e.g. "Undo"). Tapping it runs onPress and
      // dismisses the toast. Toasts with an action linger longer by default.
      action?: ToastAction;
    },
  ) => void;
  // Success feedback: a wordless animation instead of a message. `message` is
  // never drawn, only announced to screen readers, so write it as the full
  // sentence a blind user needs. Errors and instructions still use show().
  done: (message: string, icon?: DoneIcon) => void;
};

type DoneIcon = keyof typeof Feather.glyphMap;

const ToastContext = createContext<ToastApi | undefined>(undefined);

const INK = '#0F0F0F';
const PURPLE = '#6C47FF';

function variantStyles(v: ToastVariant) {
  if (v === 'success') return { bg: INK, fg: 'white', accent: PURPLE, accentFg: 'white' };
  if (v === 'info') return { bg: INK, fg: 'white', accent: PURPLE, accentFg: 'white' };
  return { bg: INK, fg: 'white', accent: 'rgba(255,255,255,0.12)', accentFg: 'white' };
}

// Pops in with a ring pulse, holds, and leaves. Runs on the native driver and
// keeps all its state here, so the provider (and the app under it) never re-renders
// per frame. 'send' flies its plane off so "sent" reads differently from "saved".
function DoneBurst({ icon, onEnd }: { icon: DoneIcon; onEnd: () => void }) {
  const [v] = useState(() => ({
    scale: new Animated.Value(0.5),
    opacity: new Animated.Value(0),
    ring: new Animated.Value(0),
    leave: new Animated.Value(0),
  }));
  const flies = icon === 'send';

  useEffect(() => {
    let stopped = false;
    const timing = (value: Animated.Value, toValue: number, duration: number) =>
      Animated.timing(value, { toValue, duration, easing: Easing.out(Easing.cubic), useNativeDriver: USE_NATIVE_DRIVER });
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduced) => {
        if (stopped) return;
        if (reduced) v.scale.setValue(1);
        Animated.sequence([
          Animated.parallel([
            timing(v.opacity, 1, 120),
            ...(reduced
              ? []
              : [
                  Animated.spring(v.scale, { toValue: 1, damping: 11, stiffness: 240, mass: 0.7, useNativeDriver: USE_NATIVE_DRIVER }),
                  timing(v.ring, 1, 520),
                ]),
          ]),
          Animated.delay(flies ? 120 : 380),
          Animated.parallel([timing(v.leave, 1, 240), Animated.sequence([Animated.delay(flies ? 120 : 40), timing(v.opacity, 0, 160)])]),
        ]).start(() => onEnd());
      });
    return () => {
      stopped = true;
    };
    // One run per mount; a newer success remounts this via its key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View
      testID="done-animation"
      style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', zIndex: 10001, pointerEvents: 'none' }]}
    >
      <Animated.View
        style={{
          position: 'absolute',
          width: 84,
          height: 84,
          borderRadius: 42,
          borderWidth: 2,
          borderColor: PURPLE,
          opacity: v.ring.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.5, 0] }),
          transform: [{ scale: v.ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }],
        }}
      />
      <Animated.View
        style={{
          width: 84,
          height: 84,
          borderRadius: 42,
          backgroundColor: PURPLE,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: v.opacity,
          transform: [{ scale: v.scale }],
        }}
      >
        <Animated.View
          style={
            flies
              ? {
                  transform: [
                    { translateX: v.leave.interpolate({ inputRange: [0, 1], outputRange: [0, 40] }) },
                    { translateY: v.leave.interpolate({ inputRange: [0, 1], outputRange: [0, -40] }) },
                  ],
                }
              : undefined
          }
        >
          <Feather name={icon} size={36} color="white" />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [doneBurst, setDoneBurst] = useState<{ id: number; icon: DoneIcon } | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [visible, setVisible] = useState(false);
  const insets = useSafeAreaInsets();
  // `useState(() => ...)` rather than `useRef(new Animated.Value(x)).current`.
  // Reading `.current` during render is a Rules-of-React violation that makes
  // React Compiler bail out of the whole component — and ToastProvider wraps the
  // entire app. The useRef form also builds a throwaway Animated.Value on every
  // render (useRef keeps only the first); the lazy initializer runs once.
  // Semantics are identical: one instance per component lifetime.
  const [translateY] = useState(() => new Animated.Value(50));
  const [opacity] = useState(() => new Animated.Value(0));
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const counter = useRef(0);

  const animateIn = useCallback(() => {
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: USE_NATIVE_DRIVER,
        damping: 18,
        stiffness: 220,
        mass: 0.7,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]).start();
  }, [opacity, translateY]);

  const animateOut = useCallback(
    (cb?: () => void) => {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 50,
          duration: 180,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 160,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]).start(({ finished }) => {
        if (finished && cb) cb();
      });
    },
    [opacity, translateY],
  );

  const show: ToastApi['show'] = useCallback(
    (message, opts) => {
      const id = ++counter.current;
      const variant = opts?.variant ?? 'default';
      const icon = opts?.icon;
      const action = opts?.action;
      // Actionable toasts linger so the user has time to hit the button.
      const duration = opts?.durationMs ?? (action ? 4200 : 1800);

      if (dismissTimer.current) clearTimeout(dismissTimer.current);

      if (Platform.OS === 'ios') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      setToast({ id, message, variant, icon, action });
      setVisible(true);

      // If a toast is already on screen, jump-replace (skip slide-out)
      requestAnimationFrame(() => animateIn());

      dismissTimer.current = setTimeout(() => {
        animateOut(() => {
          // Only clear if no newer toast queued.
          if (counter.current === id) {
            setVisible(false);
            setToast(null);
          }
        });
      }, duration);
    },
    [animateIn, animateOut],
  );

  const dismiss = useCallback(() => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    animateOut(() => {
      setVisible(false);
      setToast(null);
    });
  }, [animateOut]);

  useEffect(() => {
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, []);

  const v = toast ? variantStyles(toast.variant) : null;

  // Stable context value. This provider wraps the entire <Stack>, and it
  // re-renders on every show / dismiss / animation callback. Allocating a
  // fresh `{ show }` on each of those renders changed the context identity,
  // which re-rendered EVERY useToast() consumer — including all ~60
  // <ListingCard>s in a feed grid, whose React.memo cannot block context
  // propagation. `show` is already a stable useCallback, so the value only
  // needs to be pinned to it. Same fix every other provider in the tree
  // (Auth / GuestGate / SellSheet / DiscoverSheet) already carries.
  const done: ToastApi['done'] = useCallback((message, icon = 'check') => {
    setDoneBurst({ id: ++counter.current, icon });
    AccessibilityInfo.announceForAccessibility(message);
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  }, []);

  const api = useMemo<ToastApi>(() => ({ show, done }), [show, done]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {doneBurst && (
        <DoneBurst key={doneBurst.id} icon={doneBurst.icon} onEnd={() => setDoneBurst(null)} />
      )}
      {visible && toast && v && (
        <Animated.View
          style={{
            position: 'absolute',
            bottom: Math.max(insets.bottom + 84, 96),
            left: 16,
            right: 16,
            alignItems: 'center',
            zIndex: 10000,
            transform: [{ translateY }],
            opacity,
            // Let the action button receive taps; the rest stays pass-through.
            pointerEvents: toast.action ? 'box-none' : 'none',
          }}
        >
          <View
            style={{
              maxWidth: 420,
              width: '100%',
              backgroundColor: v.bg,
              borderRadius: 14,
              flexDirection: 'row',
              alignItems: 'center',
              paddingLeft: 14,
              paddingRight: 6,
              paddingVertical: 6,
              ...Platform.select({
                ios: {
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.2,
                  shadowRadius: 14,
                },
                android: { elevation: 6 },
                default: { boxShadow: '0px 4px 16px rgba(0,0,0,0.20)' },
              }),
            }}
          >
            <Text
              style={{
                flex: 1,
                color: v.fg,
                fontSize: 14,
                fontWeight: '700',
                letterSpacing: 0.1,
                paddingVertical: 8,
              }}
              numberOfLines={1}
            >
              {toast.message}
            </Text>
            {toast.action ? (
              <Pressable
                onPress={() => {
                  toast.action?.onPress();
                  dismiss();
                }}
                accessibilityRole="button"
                accessibilityLabel={toast.action.label}
                hitSlop={8}
                style={({ pressed }) => ({
                  marginLeft: 10,
                  paddingHorizontal: 14,
                  paddingVertical: 9,
                  borderRadius: 10,
                  backgroundColor: PURPLE,
                  opacity: pressed ? 0.75 : 1,
                })}
              >
                <Text style={{ color: 'white', fontSize: 13, fontWeight: '800', letterSpacing: 0.2 }}>
                  {toast.action.label}
                </Text>
              </Pressable>
            ) : toast.icon ? (
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  backgroundColor: v.accent,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginLeft: 10,
                }}
              >
                <Feather name={toast.icon} size={16} color={v.accentFg as string} />
              </View>
            ) : null}
          </View>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Soft fallback: allow components to call show() outside of provider in dev
    // without crashing. In production, provider is always mounted.
    return { show: () => {}, done: () => {} };
  }
  return ctx;
}

// styles kept inline; this file owns everything
StyleSheet.create({});
