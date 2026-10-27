// Migrated from app.json so env vars (EXPO_PUBLIC_*) are explicitly embedded
// into expoConfig.extra at config-load time. This guarantees the supabase
// client gets the right URL/key on every Metro start, regardless of whether
// a stale process.env value is cached in the bundle.

// EAS project id — written by `eas init`. The literal below is this project's
// real id; EAS_PROJECT_ID stays supported as an override so CI can point a fork
// or a test project somewhere else. It used to be env-only, which meant that on
// any machine without EAS_PROJECT_ID exported (i.e. every one of them — it is in
// no .env file here) `extra.eas.projectId` resolved to undefined and OTA updates
// silently stayed off.
const easProjectId =
  process.env.EAS_PROJECT_ID || '601d3c06-7d72-4ab7-88a3-97c570648676';

// This file is the ONLY app config. There is no app.json — a dynamic config that
// returns an object keyed `expo` makes @expo/config's reduceExpoObject() collapse
// to exactly that object, so anything merged in from a static app.json was thrown
// away wholesale. Adding a plugin or an `extra` key to an app.json here would look
// right and do nothing; check the resolved result with `npx expo config --type public`.
module.exports = () => ({
    name: 'Grabsty',
    // Must equal the slug of the EAS project behind `easProjectId` (@daku1765/grabsty);
    // a mismatch fails `eas build`.
    slug: 'grabsty',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'grabsty',
    // 'automatic' lets the OS report dark mode (needed for Settings → Appearance → System);
    // ThemeContext pins the scheme via Appearance.setColorScheme for Light/Dark.
    userInterfaceStyle: 'automatic',
    // Fingerprint policy derives runtimeVersion from the native module set, so an
    // OTA JS update only lands on a build whose native layer actually matches —
    // never a crash from shipping a bundle newer than the installed binary.
    // EXPO_DEV_SKIP_FINGERPRINT=1 is for `expo start` only: the dev server
    // re-fingerprints the whole project on every manifest request (~15-20s),
    // longer than the dev client waits on a phone. Never set it for builds/updates.
    runtimeVersion:
      process.env.EXPO_DEV_SKIP_FINGERPRINT === '1' ? 'dev' : { policy: 'fingerprint' },
    // OTA update endpoint, only wired once a project id exists. fallbackToCache
    // timeout 0 = never block cold start on the update fetch; a downloaded
    // update applies on the next launch instead.
    ...(easProjectId
      ? {
          updates: {
            url: `https://u.expo.dev/${easProjectId}`,
            fallbackToCacheTimeout: 0,
          },
        }
      : {}),
    splash: {
      image: './assets/images/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: 'com.grabsty.app',
      infoPlist: {
        NSContactsUsageDescription: 'Allow Grabsty to access your contacts to find friends on the app.',
        NSCameraUsageDescription: 'Grabsty needs camera access to take photos of items to sell.',
        NSPhotoLibraryUsageDescription: 'Grabsty needs access to your photos to upload listings.',
        LSApplicationQueriesSchemes: ['whatsapp', 'sms'],
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/images/adaptive-icon.png',
        backgroundColor: '#5959ED',
      },
      package: 'com.grabsty.app',
      // FCM credentials for expo-notifications; prebuild wires the google-services Gradle plugin.
      googleServicesFile: './google-services.json',
    },
    // Only the icon families this app actually renders. The previous `Fonts/*`
    // wildcard declared all 20 @expo/vector-icons families (~4.1 MB) when four
    // files (~940 KB) are used — MaterialCommunityIcons alone is 1.31 MB of
    // glyphs nothing references.
    //
    // NOTE — narrowing this list does NOT by itself shrink the bundle, and it
    // was measured: `expo export` emitted the same 62 assets / 10 MB before and
    // after. assetBundlePatterns can only ADD files to a build; it cannot remove
    // what Metro already has in the dependency graph. Every font is in that
    // graph because `import { Ionicons } from '@expo/vector-icons'` resolves to
    // build/Icons.js, a barrel re-exporting 19 families, each of which does
    // `import font from './Fonts/<Family>.ttf'` — and Metro does not tree-shake
    // re-exports. The same applies to @expo-google-fonts/inter (20 re-exports →
    // all 18 weights, ~5.9 MB, for the 5 the app names).
    //
    // The actual fix is deep imports at the call sites
    // ('@expo/vector-icons/Ionicons'), as components/discover/DiscoverSheet.dummy.tsx
    // already does for FontAwesome6. This list is kept as the accurate
    // declaration of intent so it is correct once those land.
    //
    // The list is exhaustive; verify before trimming further:
    //   • Ionicons + Feather — preloaded in app/_layout.tsx (ICON_FONTS).
    //   • FontAwesome6 Solid + Regular — registered lazily by
    //     registerDummySkinFont() in components/discover/DiscoverSheet.dummy.tsx,
    //     which is live while DUMMY_SKIN is true in DiscoverSheet.tsx.
    //     Brands is deliberately absent: that skin uses no brand glyphs.
    //
    // A family missing here renders as blank/tofu only in a production binary,
    // never in dev (Metro serves it from disk), so re-check this list when
    // adding an icon set rather than trusting `expo start`.
    assetBundlePatterns: [
      'assets/**',
      'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf',
      'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Feather.ttf',
      'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/FontAwesome6_Solid.ttf',
      'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/FontAwesome6_Regular.ttf',
    ],
    plugins: [
      'expo-router',
      'expo-secure-store',
      [
        'expo-image-picker',
        {
          photosPermission: 'Grabsty needs access to your photos to upload listings.',
        },
      ],
      'expo-asset',
      [
        'expo-notifications',
        {
          // Android tints the small status-bar icon with this colour. Left to
          // default, the notification icon renders as a white square.
          color: '#6C47FF',
          defaultChannel: 'default',
        },
      ],
      [
        '@sentry/react-native',
        {
          // Org + project for source map / debug symbol upload during builds.
          // The auth token is NOT here (it's a secret) — the plugin reads it
          // from the SENTRY_AUTH_TOKEN env var (.env.sentry-build-plugin).
          organization: 'penta-squad',
          project: 'ceranix-vg',
        },
      ],
      'expo-localization',
      [
        'expo-location',
        {
          locationWhenInUsePermission:
            'Grabsty uses your location to fill in your delivery address.',
        },
      ],
      [
        'expo-contacts',
        {
          contactsPermission: 'Allow Grabsty to access your contacts to find friends on the app.',
        },
      ],
    ],
    web: {
      favicon: './assets/images/favicon.png',
    },
    experiments: {
      typedRoutes: true,
      // React Compiler auto-memoizes app code at build time (node_modules are
      // never touched, and it's disabled for server rendering). This codebase
      // is written with inline arrow props and inline style objects throughout
      // — readable, but it means fresh identities every render that React.memo
      // can't help with. The compiler fixes that without a source diff.
      //
      // Verified before enabling, not assumed:
      //   npx react-compiler-healthcheck@latest
      //   → Successfully compiled 156 out of 156 components.
      //   → StrictMode usage not found.
      //   → Found no usage of incompatible libraries.
      //
      // Babel needs no manual setup — babel-preset-expo wires the plugin from
      // SDK 54 onward. To roll back, delete this one line.
      reactCompiler: true,
    },
    extra: {
      ...(easProjectId ? { eas: { projectId: easProjectId } } : {}),
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
      sentryDebug: process.env.EXPO_PUBLIC_SENTRY_DEBUG,
      posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY,
      posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST,
    },
});
