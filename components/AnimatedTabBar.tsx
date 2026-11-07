import { useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Platform, LayoutChangeEvent, StyleSheet, type ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useDerivedValue,
  useAnimatedStyle,
  useAnimatedRef,
  measure,
  withSpring,
  withTiming,
  withDelay,
  useReducedMotion,
  runOnJS,
} from 'react-native-reanimated';
import type { DerivedValue } from 'react-native-reanimated';
import { Gesture, GestureDetector, PointerType } from 'react-native-gesture-handler';
import type { GestureStateChangeEvent, GestureUpdateEvent } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useTheme } from '@/context/ThemeContext';
import { useIsKeyboardShown } from '@/hooks/useIsKeyboardShown';
import { Text } from '@/lib/rnText';
import { lightTheme } from '@/lib/theme';
import { useActivityDot } from '@/hooks/useActivityDot';
import {
  HomeTabIcon,
  CategoriesTabIcon,
  SellTabIcon,
  InboxTabIcon,
  AccountTabIcon,
} from '@/components/navigation/TabBarIcons';

// Traditional bottom tab bar: full-width, icon + label, solid background.
// Light mode = soft grey; Dark mode = near-black.
//
// ---------------------------------------------------------------------------
// Threading model — preserved from the original floating dock.
//
// This bar renders on every screen. Its gesture runs on top of whatever list is
// scrolling underneath, so NOTHING about a touch reaches React.
//
//   • Item geometry lives in `layouts` (shared value), written once per
//     onLayout — not in useState.
//   • Hit-testing (`indexAtX`) is a worklet on the UI thread.
//   • The highlighted tab is `highlight` (a derived shared value). Each TabItem
//     reads it inside useAnimatedStyle so the active icon animates without any
//     React re-render.
//   • The JS thread is crossed exactly twice per interaction: a selection
//     haptic and `select()` on release.
// ---------------------------------------------------------------------------

const BAR_HEIGHT = 56;
const ICON = 24;

// Animation configs
const POP = { damping: 12, stiffness: 220, mass: 0.7 } as const;
const FADE_OUT = { duration: 180 } as const;

const HAPTICS = Platform.OS !== 'web';

// Background warm-up: mount every tab ahead of time so switching is instant.
const WARM_DELAY = 1200;
const WARM_STEP = 350;




function renderTabIcon(routeName: string, active: boolean, color: string, size: number, bgColor?: string) {
  switch (routeName) {
    case 'index':
      return <HomeTabIcon active={active} color={color} size={size} />;
    case 'discover':
      return <CategoriesTabIcon active={active} color={color} size={size} />;
    case 'upload':
      return <SellTabIcon active={active} color={color} size={size} bgColor={bgColor} />;
    case 'chat':
      return <InboxTabIcon active={active} color={color} size={size} bgColor={bgColor} />;
    case 'profile':
      return <AccountTabIcon active={active} color={color} size={size} bgColor={bgColor} />;
    default:
      return <HomeTabIcon active={active} color={color} size={size} />;
  }
}

type ItemLayout = { x: number; width: number };

const NO_PREVIEW = -1;

// Which tab sits under `x`. A worklet so drags resolve on the UI thread.
function indexAtX(layouts: ItemLayout[], x: number, count: number): number {
  'worklet';
  for (let i = 0; i < count; i++) {
    const l = layouts[i];
    if (l && x >= l.x && x <= l.x + l.width) return i;
  }
  if (layouts[0] && x < layouts[0].x) return 0;
  return count - 1;
}

// Called from worklets via runOnJS — per event, never per frame.
function selectionHaptic() {
  Haptics.selectionAsync();
}

export function AnimatedTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { isDark } = useTheme();

  const routes = state.routes.filter(
    (r) => StyleSheet.flatten(descriptors[r.key].options.tabBarItemStyle)?.display !== 'none',
  );
  const count = routes.length;
  const activeKey = state.routes[state.index].key;
  const activePos = routes.findIndex((r) => r.key === activeKey);

  const isKeyboardShown = useIsKeyboardShown();
  const activeOptions = descriptors[activeKey]?.options;
  const hideOnKeyboard = activeOptions?.tabBarHideOnKeyboard ?? true;
  const resolvedTabBarStyle = StyleSheet.flatten(activeOptions?.tabBarStyle as any) as ViewStyle | undefined;
  const isHiddenByStyle = resolvedTabBarStyle?.display === 'none';
  const shouldHideTabBar = (hideOnKeyboard && isKeyboardShown) || isHiddenByStyle;

  // ---- shared values (UI thread) ----
  const layouts = useSharedValue<ItemLayout[]>([]);
  const pendingLayouts = useRef<ItemLayout[]>([]);
  const containerRef = useAnimatedRef<Animated.View>();

  const activeIdx = useSharedValue(activePos);
  const previewIdx = useSharedValue(NO_PREVIEW);
  const committed = useSharedValue(false);
  const mount = useSharedValue(0);

  // Preview wins while dragging; otherwise the real route.
  const highlight = useDerivedValue(() =>
    previewIdx.value === NO_PREVIEW ? activeIdx.value : previewIdx.value,
  );

  useEffect(() => {
    activeIdx.value = activePos;
  }, [activePos, activeIdx]);

  useEffect(() => {
    mount.value = reduced ? 1 : withDelay(60, withSpring(1, { damping: 16, stiffness: 150 }));
  }, [mount, reduced]);

  // ---- JS thread: only ever reached on release ----
  const select = (pos: number) => {
    const route = routes[pos];
    if (!route) {
      previewIdx.value = NO_PREVIEW;
      return;
    }

    const focused = route.key === activeKey;
    // Emit tabPress synchronously during the user touch/click gesture so any listener
    // that calls e.preventDefault() (like Categories opening DiscoverSheet or Sell opening SellSheet)
    // runs synchronously with active user activation — allowing immediate soft keyboard / keypad focus.
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) {
      const doNavigate = () => {
        if (HAPTICS) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const t0 = __DEV__ ? Date.now() : 0;
        navigation.navigate(route.name);
        if (__DEV__) {
          requestAnimationFrame(() =>
            requestAnimationFrame(() =>
              console.log(`[tab] ${route.name} ${Date.now() - t0}ms`),
            ),
          );
        }
      };

      if (Platform.OS === 'web') {
        // Defer navigation slightly on web to let the browser's synthetic click
        // finish on the tab dock instead of hitting underlying buttons in the new view.
        setTimeout(doNavigate, 80);
      } else {
        doNavigate();
      }
    }
    previewIdx.value = NO_PREVIEW;
  };

  // Mount the tab under the finger BEFORE the finger lifts.
  // Sheet-only tabs ('discover', 'upload') must not be preloaded, because their
  // route components redirect back to '/' or mount modals.
  const preload = (pos: number) => {
    const route = routes[pos];
    if (!route || route.key === activeKey) return;
    if (route.name === 'discover' || route.name === 'upload') return;
    navigation.preload(route.name);
  };

  // Latest-ref indirection so the memoized gesture never tears down.
  const selectRef = useRef(select);
  const preloadRef = useRef(preload);
  useEffect(() => {
    selectRef.current = select;
    preloadRef.current = preload;
  });
  const selectAt = useCallback((pos: number) => selectRef.current(pos), []);
  const preloadAt = useCallback((pos: number) => preloadRef.current(pos), []);

  // Warm every other tab once, shortly after mount.
  const warmed = useRef(false);
  useEffect(() => {
    if (warmed.current || count === 0) return;
    warmed.current = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < count; i++) {
      const route = routes[i];
      if (route && (route.name === 'discover' || route.name === 'upload')) continue;
      timers.push(setTimeout(() => preloadAt(i), WARM_DELAY + i * WARM_STEP));
    }
    return () => timers.forEach(clearTimeout);
  }, [count, preloadAt, routes]);

  // ---- gesture (worklets only) ----
  const gesture = useMemo(() => {
    const resolveIndex = (
      e:
        | GestureStateChangeEvent<{ x: number; absoluteX: number; pointerType: PointerType }>
        | GestureUpdateEvent<{ x: number; absoluteX: number; pointerType: PointerType }>,
    ) => {
      'worklet';
      if (e.pointerType === PointerType.KEY) {
        const m = measure(containerRef);
        if (m) return indexAtX(layouts.value, e.absoluteX - m.pageX, count);
      }
      return indexAtX(layouts.value, e.x, count);
    };

    const pan = Gesture.Pan()
      .minDistance(6)
      .onBegin((e) => {
        committed.value = false;
        const pos = resolveIndex(e);
        previewIdx.value = pos;
        runOnJS(preloadAt)(pos);
      })
      .onUpdate((e) => {
        const pos = resolveIndex(e);
        if (pos !== previewIdx.value) {
          previewIdx.value = pos;
          if (HAPTICS) runOnJS(selectionHaptic)();
        }
      })
      .onEnd((e) => {
        const pos = previewIdx.value === NO_PREVIEW ? resolveIndex(e) : previewIdx.value;
        committed.value = true;
        runOnJS(selectAt)(pos);
      })
      .onFinalize(() => {
        if (!committed.value) previewIdx.value = NO_PREVIEW;
      });

    const tap = Gesture.Tap()
      .maxDistance(14)
      .onEnd((e) => {
        committed.value = true;
        runOnJS(selectAt)(resolveIndex(e));
      });

    return Gesture.Race(pan, tap);
  }, [count, committed, containerRef, layouts, previewIdx, selectAt, preloadAt]);

  const barStyle = useAnimatedStyle(() => ({
    opacity: mount.value,
    transform: [{ translateY: (1 - mount.value) * 20 }],
  }));

  return (
    <Animated.View
      ref={containerRef}
      pointerEvents={shouldHideTabBar ? 'none' : 'auto'}
      style={[
        {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingBottom: insets.bottom,
          backgroundColor: isDark ? '#1C1C1C' : '#FFFFFF',
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
        },
        barStyle,
        shouldHideTabBar && { display: 'none' },
      ]}
    >
      <GestureDetector gesture={gesture}>
        <View
          nativeID="tab-dock"
          style={{
            flexDirection: 'row',
            height: BAR_HEIGHT,
          }}
          {...(Platform.OS === 'web'
            ? {
                onClick: (e: any) => {
                  e?.stopPropagation?.();
                  e?.preventDefault?.();
                },
                onTouchEnd: (e: any) => {
                  e?.stopPropagation?.();
                },
                onPointerDown: (e: any) => {
                  e?.stopPropagation?.();
                },
                onPointerUp: (e: any) => {
                  e?.stopPropagation?.();
                },
              }
            : {})}
        >
          {routes.map((route, pos) => {
            const { options } = descriptors[route.key];
            const label =
              typeof options.tabBarLabel === 'string'
                ? options.tabBarLabel
                : (options.title ?? route.name);
            return (
              <TabItem
                key={route.key}
                index={pos}
                routeName={route.name}
                highlight={highlight}
                selected={pos === activePos}
                reduced={reduced}
                label={label}
                isDark={isDark}
                onLayout={(e: LayoutChangeEvent) => {
                  const { x, width } = e.nativeEvent.layout;
                  const cur = pendingLayouts.current[pos];
                  if (cur && cur.x === x && cur.width === width) return;
                  pendingLayouts.current[pos] = { x, width };
                  layouts.value = pendingLayouts.current.slice();
                }}
              />
            );
          })}
        </View>
      </GestureDetector>
    </Animated.View>
  );
}

// Activity tab dot: new messages, offers or a sale. Its own component so the
// hook's state only ever re-renders this 9px view — never the dock or its
// gesture worklets (UI_GUARDRAILS Rule 2.3). Signal Purple, ringed in the bar
// colour so it reads as a notch cut into the icon.
function ActivityDot({ ringColor }: { ringColor: string }) {
  const show = useActivityDot();
  if (!show) return null;
  return (
    <View
      pointerEvents="none"
      accessible
      accessibilityLabel="New activity"
      style={{
        position: 'absolute',
        top: -2,
        right: -4,
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: lightTheme.purple,
        borderWidth: 2,
        borderColor: ringColor,
      }}
    />
  );
}

function TabItem({
  index,
  routeName,
  highlight,
  selected,
  reduced,
  label,
  isDark,
  onLayout,
}: {
  index: number;
  routeName: string;
  highlight: DerivedValue<number>;
  selected: boolean;
  reduced: boolean;
  label: string;
  isDark: boolean;
  onLayout: (e: LayoutChangeEvent) => void;
}) {
  const activeColor = isDark ? '#FFFFFF' : '#111111';
  const inactiveColor = isDark ? '#D4D4D4' : '#767678';
  const barBg = isDark ? '#1C1C1C' : '#FFFFFF';

  // Derived from `highlight` on the UI thread — animates without React knowing.
  const active = useDerivedValue(() => {
    const on = highlight.value === index;
    if (reduced) return on ? 1 : 0;
    return on ? withSpring(1, POP) : withTiming(0, FADE_OUT);
  }, [index, reduced]);

  // Subtle scale bump on the active icon.
  const wrapStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + active.value * 0.04 }],
  }));
  const outlineStyle = useAnimatedStyle(() => ({ opacity: 1 - active.value }));
  const filledStyle = useAnimatedStyle(() => ({
    opacity: active.value,
    transform: [{ scale: 0.9 + active.value * 0.1 }],
  }));

  return (
    <View
      onLayout={onLayout}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 6,
        paddingBottom: 2,
      }}
      {...(Platform.OS === 'web'
        ? {
            onClick: (e: any) => {
              e?.stopPropagation?.();
              e?.preventDefault?.();
            },
            onTouchEnd: (e: any) => {
              e?.stopPropagation?.();
            },
            onPointerDown: (e: any) => {
              e?.stopPropagation?.();
            },
            onPointerUp: (e: any) => {
              e?.stopPropagation?.();
            },
          }
        : {})}
    >
      <Animated.View style={[{ width: ICON, height: ICON }, wrapStyle]}>
        <Animated.View style={[StyleSheet.absoluteFill, outlineStyle]}>
          {renderTabIcon(routeName, false, inactiveColor, ICON, barBg)}
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, filledStyle]}>
          {renderTabIcon(routeName, true, activeColor, ICON, barBg)}
        </Animated.View>
        {routeName === 'chat' && <ActivityDot ringColor={barBg} />}
      </Animated.View>
      <Text
        style={{
          fontSize: 10,
          lineHeight: 12,
          marginTop: 4,
          color: selected ? activeColor : inactiveColor,
          fontWeight: selected ? '600' : '500',
        }}
      >
        {label}
      </Text>
    </View>
  );
}
