// Thin top banner shown while the device is offline. Purely informational — it
// never blocks interaction (pointerEvents none), because the persisted Query
// cache means most of the app keeps working read-only offline. It just tells the
// user why fresh data / actions may not go through.
//
// Slide/fade animation mirrors the Toast: native driver on device, JS driver on
// web (react-native-web has no RCTAnimation).

import { useEffect, useState } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useIsOffline } from '@/lib/offline';

import { useTheme } from '@/context/ThemeContext';
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

export function OfflineBanner() {
  const { theme: colors } = useTheme();
  const offline = useIsOffline();
  const insets = useSafeAreaInsets();
  // With a real status bar, live inside that strip so the banner never covers
  // screen headers (it hid the top half of the chat Back button). No inset
  // (web) -> a normal thin bar at the top edge.
  const inStatusBar = insets.top >= 20;
  const [translateY] = useState(() => new Animated.Value(-80));
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: offline ? 0 : -80,
        duration: 220,
        easing: offline ? Easing.out(Easing.quad) : Easing.in(Easing.cubic),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(opacity, {
        toValue: offline ? 1 : 0,
        duration: 180,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]).start();
  }, [offline, opacity, translateY]);

  return (
    <Animated.View
      // Hidden from assistive tech + pointer when online so it never intercepts
      // taps or gets announced while off-screen.
      accessibilityElementsHidden={!offline}
      importantForAccessibility={offline ? 'yes' : 'no-hide-descendants'}
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        paddingTop: inStatusBar ? 0 : insets.top,
        zIndex: 9999,
        transform: [{ translateY }],
        opacity,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          backgroundColor: colors.ink,
          ...(inStatusBar ? { height: insets.top } : { paddingVertical: 8 }),
          paddingHorizontal: 16,
        }}
      >
        {offline && inStatusBar ? <StatusBar style="light" /> : null}
        <Feather name="wifi-off" size={14} color={colors.background} />
        <Text
          accessibilityRole="alert"
          accessibilityLabel="No internet connection"
          style={{ color: colors.background, fontSize: 13, fontWeight: '700', letterSpacing: 0.1 }}
        >
          {/* Short in the status-bar strip so it clears the clock and icons. */}
          {inStatusBar ? 'Offline' : 'No internet connection'}
        </Text>
      </View>
    </Animated.View>
  );
}
