import '../global.css';
import { useEffect, useMemo, useState } from 'react';
import { Platform, View } from 'react-native';
import { disablePressableInterop } from '@/lib/pressableInterop';
import { installAlertShim } from '@/lib/alertShim';
import { initSentry } from '@/lib/sentry';
import { initAnalytics, screen } from '@/lib/analytics';
import { normalizeScreenName } from '@/lib/analyticsEvents';
import { Stack, usePathname } from 'expo-router';
import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import Ionicons from '@expo/vector-icons/Ionicons';
import Feather from '@expo/vector-icons/Feather';
import { withFontDisplay } from '@/lib/fonts';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Inter_700Bold_Italic } from '@expo-google-fonts/inter/700Bold_Italic';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { queryClient, persistOptions } from '@/lib/queryClient';
import { initOnlineManager } from '@/lib/offline';
import { initOfflineSync } from '@/lib/offlineSync';
import { attachResponseListener, configureNotifications } from '@/lib/notifications';
import { onOrderUpdated } from '@/lib/paymentService';
import { LISTING_QUERY_PREFIXES } from '@/lib/queries/keys';
import { AuthProvider } from '@/lib/auth';
import { ToastProvider } from '@/lib/toast';
import { installKeyboardFocusRing } from '@/lib/keyboardFocusRing';
import { GuestGateProvider } from '@/components/GuestGate';
import { SellSheetProvider } from '@/components/sell/SellSheet';
import { DiscoverSheetProvider } from '@/components/discover/DiscoverSheet';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { OfflineBanner } from '@/components/OfflineBanner';
import { AnimatedSplash } from '@/components/AnimatedSplash';
import { DesktopTopNav } from '@/components/navigation/DesktopTopNav';
import { useIsDesktop, DESKTOP_READING_MAX } from '@/lib/responsive';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';

// FIRST, before any element is created: take Pressable out of NativeWind's
// cssInterop. That wrapper silently drops function-valued `style` props
// (`style={({ pressed }) => ({ ... })}`), which is what broke chips, the
// listing-card like badge, and the tab bar on native while web looked fine.
// See lib/pressableInterop.ts for the full mechanism.
disablePressableInterop();

// Initialize crash + error reporting before anything else renders so startup
// failures are captured too. No-ops when EXPO_PUBLIC_SENTRY_DSN is unset.
initSentry();
// Initialize PostHog analytics. No-ops when EXPO_PUBLIC_POSTHOG_KEY is unset.
initAnalytics();
// Bridge device connectivity into TanStack Query so fetches pause offline and
// auto-resume on reconnect (rather than hanging on unreachable requests).
initOnlineManager();
// Foreground presentation + the Android notification channel. Never prompts for
// permission — that happens contextually (first conversation) or from Settings.
// No-ops on web.
configureNotifications();

// Automatically invalidate orders and listings across the app on payment/fulfillment updates
onOrderUpdated((listingId) => {
  try {
    queryClient.invalidateQueries({ queryKey: ['myOrders'] });
    // Every listing list, not just two: Home reads myFeedListings, and a sold
    // (or, after a cancel, relisted) item must leave/return everywhere at once.
    for (const prefix of LISTING_QUERY_PREFIXES) {
      queryClient.invalidateQueries({ queryKey: [prefix] });
    }
    if (listingId) {
      queryClient.invalidateQueries({ queryKey: ['listing', listingId] });
      queryClient.invalidateQueries({ queryKey: ['orderForListing', listingId] });
    }
  } catch {
    // Non-fatal
  }
});

// React-native-web ships Alert.alert as a no-op, so every validation /
// confirm path that calls Alert.alert silently dies on web. The shim swaps
// in a window-backed implementation that honours the standard RN signature.
installAlertShim();

// NOTE: Android's TextInput underline / selection-handle colour is set in
// lib/rnText.tsx, where every app-level TextInput already funnels through.
// It used to be assigned here by mutating `TextInput.defaultProps`, which
// React 19 ignores entirely for function components — so it silently did
// nothing and Android painted the default black underline.

// Both maps are tagged FontDisplay.BLOCK — see lib/fonts.ts for the reasoning.
// Short version: without it the browser paints a fallback face while these are
// still downloading, which showed up as tofu boxes for every icon and as body
// text flashing from the system serif to Inter. BLOCK keeps the glyphs
// invisible until the real file lands. Web-only; native ignores the field.
//
// The sources below resolve to WOFF2 rather than TTF on web (2.6 MB -> 0.9 MB
// across the app's ten families) — that swap happens in metro.config.js, not
// here, because @expo/vector-icons re-loads the raw TTF from inside its own
// icon component and rewriting the URI at this call site fetches both copies.
// scripts/inject-font-preload.mjs preloads the same files from index.html, so
// they download alongside the entry bundle instead of after it.
const ICON_FONTS = withFontDisplay(
  { ...Ionicons.font, ...Feather.font },
  Font.FontDisplay.BLOCK,
);

const AESTHETIC_FONTS = withFontDisplay(
  {
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_700Bold_Italic,
  },
  Font.FontDisplay.BLOCK,
);

SplashScreen.preventAutoHideAsync();

// Web-only: react-navigation hides off-screen stack/tab screens with
// `display:none; aria-hidden="true"`. If a Pressable inside the leaving
// screen still has focus, Chrome warns "Blocked aria-hidden on an element
// because its descendant retained focus". We watch the DOM for that
// attribute and blur the focused descendant the moment it's flagged
// hidden, which keeps assistive-tech behavior correct and silences the
// console warning. Idempotent + scoped to web so it has zero cost on
// native.
function useFocusOutOfAriaHidden() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.attributeName !== 'aria-hidden') continue;
        const target = m.target as HTMLElement;
        if (target.getAttribute('aria-hidden') !== 'true') continue;
        const active = document.activeElement as HTMLElement | null;
        if (active && active !== document.body && target.contains(active)) {
          active.blur();
        }
      }
    });
    obs.observe(document.body, {
      attributes: true,
      attributeFilter: ['aria-hidden'],
      subtree: true,
    });
    return () => obs.disconnect();
  }, []);
}

function usePreventViewportZoomOnWeb() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'viewport');
      document.head.appendChild(meta);
    }
    meta.setAttribute(
      'content',
      'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content'
    );

    // Prevent iOS Safari auto-zoom on input focus while preserving user pinch-to-zoom
    let style = document.getElementById('prevent-ios-zoom-style') as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = 'prevent-ios-zoom-style';
      style.textContent = `
        @media screen and (max-width: 768px) {
          input, textarea, select {
            font-size: 16px !important;
          }
        }
      `;
      document.head.appendChild(style);
    }

    // On iOS Safari, when keyboard dismisses or input blurs, ensure horizontal viewport offset is reset to 0 while preserving vertical scroll
    const handleFocusOut = () => {
      if (typeof window !== 'undefined') {
        window.scrollTo({ left: 0, top: window.scrollY ?? window.pageYOffset ?? 0, behavior: 'instant' as any });
      }
    };
    window.addEventListener('focusout', handleFocusOut);

    return () => {
      window.removeEventListener('focusout', handleFocusOut);
    };
  }, []);
}

function RootLayoutNav() {
  const { theme, isDark, hydrated } = useTheme();
  // Desktop: secondary pages render as a centred reading column; the wide
  // pages below opt back out with `wide`.
  const isDesktop = useIsDesktop();
  const pageStyle = useMemo(
    () => [
      { backgroundColor: theme.background },
      isDesktop && {
        width: '100%' as const,
        maxWidth: DESKTOP_READING_MAX,
        alignSelf: 'center' as const,
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderColor: theme.border,
      },
    ],
    [isDesktop, theme.background, theme.border],
  );
  const wide = { contentStyle: { backgroundColor: theme.background } };
  const navTheme = useMemo(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        // Desktop: a soft canvas shows around the centred reading columns.
        background: isDesktop ? theme.surface : theme.background,
        card: theme.background,
        text: theme.text,
        border: theme.border,
        primary: theme.purple,
      },
    };
  }, [isDark, isDesktop, theme]);
  const [ready, setReady] = useState(false);
  useFocusOutOfAriaHidden();
  usePreventViewportZoomOnWeb();
  const pathname = usePathname();

  useEffect(() => {
    if (pathname) screen(normalizeScreenName(pathname));
  }, [pathname]);

  // Notification taps → deep link. Mounted here (not at module scope) because
  // routing a tap needs a mounted navigator; this also covers the cold-start
  // case where the tap is what launched the app.
  useEffect(() => attachResponseListener(), []);

  // Start persistent offline action queue sync listener (likes, saves).
  useEffect(() => {
    return initOfflineSync();
  }, []);

  useEffect(() => (Platform.OS === 'web' ? installKeyboardFocusRing() : undefined), []);

  useEffect(() => {
    // Gate first paint on the icon fonts. Note this is a best-effort gate, not
    // a guarantee: the `.finally` below releases it even when loadAsync
    // *rejects*, and it does reject on slow links — FontFaceObserver gives each
    // face a fixed 6s. What actually stops boxes from being painted in that
    // case is FontDisplay.BLOCK on ICON_FONTS, not this.
    const iconFonts = Font.loadAsync(ICON_FONTS);
    const interFonts = Font.loadAsync(AESTHETIC_FONTS);

    if (Platform.OS === 'web') {
      // Inter stays off *this* gate — first paint should not wait on five text
      // faces. It is no longer off the critical path entirely, though: as WOFF2
      // the weights are ~115 KB rather than ~340 KB, and the three that carry
      // real UI (400/600/700) are preloaded from index.html, so they resolve
      // alongside the bundle instead of after it. FontDisplay.BLOCK still keeps
      // that text invisible until it lands rather than flashing the wrong face.
      interFonts.catch(console.warn);
      iconFonts
        .catch(console.warn)
        .finally(() => {
          setReady(true);
        });
      return;
    }

    // Native MUST block on Inter — this is NOT the same tradeoff as web.
    // Android does not repaint a mounted <Text> when a font registers after
    // the fact, so anything painted before Inter resolves keeps rendering in
    // the system font for the life of that view. Releasing the gate early
    // meant the whole app came up in Roboto on Android while web looked right.
    Promise.all([iconFonts, interFonts])
      .catch(console.warn)
      .finally(() => {
        setReady(true);
      });
  }, []);

  useEffect(() => {
    if (ready && hydrated) {
      SplashScreen.hideAsync();
    }
  }, [ready, hydrated]);

  // Preloader disabled — render nothing until boot assets are ready instead of
  // the branded loading screen.
  //
  // The gate is on the <Stack> below, NOT on this whole tree, so the providers
  // mount immediately and their work overlaps the font load rather than queuing
  // behind it. That matters for AuthProvider in particular: it reads the stored
  // session in a mount effect, and while it sat under an early `return null`
  // that read could not even begin until the fonts had resolved (~1.3s on web).
  // Auth therefore always settled AFTER first paint, so anything keyed on
  // `user` — the home screen's two cold-start banners — was guaranteed to
  // decide late and shift the layout under the grid.
  //
  // Nothing renders text before `ready` either way: every provider below
  // displays chrome only on demand (toast, guest gate, sheets), so this does
  // not reintroduce the Android late-font repaint problem described above.
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.background }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <ErrorBoundary>
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <AuthProvider>
        <ToastProvider>
        <GuestGateProvider>
        <SellSheetProvider>
        <DiscoverSheetProvider>
        {!ready || !hydrated ? null : (
        // React Navigation paints its own theme background (#F2F2F2 by default)
        // under every screen and tab scene; without this it flashes light grey
        // behind transitions in dark mode.
        <NavThemeProvider value={navTheme}>
        {/* Desktop web (>= 1024px) header above every screen; on phones
            DesktopTopNav renders nothing. */}
        <View style={{ flex: 1 }}>
        <DesktopTopNav />
        <View style={{ flex: 1 }}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: pageStyle,
          }}
        >
          <Stack.Screen name="(tabs)" options={wide} />
          <Stack.Screen name="onboarding" options={{ ...wide, headerShown: false, gestureEnabled: false }} />
          <Stack.Screen
            name="product/[id]"
            options={{ ...wide, headerShown: false }}
          />
          <Stack.Screen
            name="user/[id]"
            options={{ ...wide, headerShown: false }}
          />
          <Stack.Screen
            name="conversation/[id]"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="conversation/new"
            options={{ headerShown: false, presentation: 'modal' }}
          />
          <Stack.Screen
            name="auth/login"
            options={{ ...wide, presentation: 'modal' }}
          />
          <Stack.Screen
            name="profile/edit"
            options={{ presentation: 'modal' }}
          />
          <Stack.Screen
            name="settings"
            options={{ ...wide, headerShown: false }}
          />
          <Stack.Screen
            name="news"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="ratings"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="orders"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="invoice/[id]"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="sell"
            options={{ ...wide, headerShown: false }}
          />
          <Stack.Screen
            name="listed/[id]"
            options={{ ...wide, headerShown: false, animation: 'fade' }}
          />
          <Stack.Screen
            name="payment/[id]"
            options={{ ...wide, headerShown: false, presentation: 'modal' }}
          />
          <Stack.Screen
            name="admin"
            options={{ ...wide, headerShown: false }}
          />
        </Stack>
        </View>
        </View>
        </NavThemeProvider>
        )}
        <OfflineBanner />
        {Platform.OS !== 'web' && <AnimatedSplash appReady={ready && hydrated} />}
        </DiscoverSheetProvider>
        </SellSheetProvider>
        </GuestGateProvider>
        </ToastProvider>
      </AuthProvider>
      </PersistQueryClientProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <RootLayoutNav />
    </ThemeProvider>
  );
}
