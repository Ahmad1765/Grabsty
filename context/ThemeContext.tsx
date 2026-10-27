import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, Platform, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SystemUI from 'expo-system-ui';
import { lightTheme, darkTheme, ThemeTokens, setActiveTheme } from '../lib/theme';

try {
  // Ensure react-native-css-interop runtime flag is permanently 'class' mode
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { StyleSheet: InteropStyleSheet } = require('react-native-css-interop');
  if (InteropStyleSheet && typeof InteropStyleSheet.setFlag === 'function') {
    InteropStyleSheet.setFlag('darkMode', 'class');
  }
} catch {}

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeContextData {
  theme: ThemeTokens;
  mode: ThemeMode;
  isDark: boolean;
  hydrated: boolean;
  setThemeMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextData | undefined>(undefined);

const STORAGE_KEY = '@theme_mode';
// Dark mode is opt-in: nobody gets it until they pick Dark or System.
const DEFAULT_MODE: ThemeMode = 'light';

const isMode = (v: unknown): v is ThemeMode => v === 'light' || v === 'dark' || v === 'system';

// Web: AsyncStorage is localStorage underneath, so the saved mode can be read
// synchronously — the very first paint is already in the right theme (no
// light→dark flash). Native reads async and app/_layout gates the Stack on
// `hydrated`, so nothing paints before the mode is known there either.
function readWebModeSync(): ThemeMode | null {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return null;
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isMode(v) ? v : null;
  } catch {
    return null;
  }
}

// The OS-level scheme drives native chrome we don't render ourselves (alerts,
// date pickers, keyboard, Android nav bar). Pin it to the chosen mode; 'system'
// releases the override. On web Appearance.setColorScheme is a no-op.
function applyNativeScheme(mode: ThemeMode) {
  if (Platform.OS === 'web') return;
  try {
    // null → 'unspecified' natively: release the override, follow the OS.
    Appearance.setColorScheme(mode === 'system' ? null : mode);
  } catch {}
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>(() => readWebModeSync() ?? DEFAULT_MODE);
  const [hydrated, setHydrated] = useState(() => Platform.OS === 'web');

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let mounted = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (!mounted) return;
        const next = isMode(saved) ? saved : DEFAULT_MODE;
        applyNativeScheme(next);
        setMode(next);
      })
      .catch((e) => console.warn('[ThemeContext] Failed to load theme mode', e))
      .finally(() => {
        if (mounted) setHydrated(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // While an explicit mode is pinned, useColorScheme() reports that pin, so
  // only trust it in 'system' mode.
  const isDark = mode === 'system' ? systemScheme === 'dark' : mode === 'dark';
  const theme = isDark ? darkTheme : lightTheme;

  // Synchronously during render so the `colors` proxy (lib/theme.ts) already
  // resolves to the new palette for every component rendering in this pass.
  setActiveTheme(theme);

  useEffect(() => {
    // Native root view sits behind every screen: without this it flashes white
    // during transitions and behind the keyboard in dark mode.
    if (Platform.OS !== 'web') SystemUI.setBackgroundColorAsync(theme.background).catch(() => {});
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.style.backgroundColor = theme.background;
    document.body.style.backgroundColor = theme.background;
    root.style.colorScheme = isDark ? 'dark' : 'light';
    root.classList.toggle('dark', isDark);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.background);
  }, [theme, isDark]);

  useEffect(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { colorScheme } = require('nativewind');
      colorScheme?.set?.(isDark ? 'dark' : 'light');
    } catch {}
  }, [isDark]);

  const setThemeMode = useCallback((next: ThemeMode) => {
    applyNativeScheme(next);
    setMode(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch((e) =>
      console.warn('[ThemeContext] Failed to save theme mode', e),
    );
  }, []);

  const value = useMemo(
    () => ({ theme, mode, isDark, hydrated, setThemeMode }),
    [theme, mode, isDark, hydrated, setThemeMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Non-throwing variant for primitives that may render outside the provider
 *  (lib/rnText). Falls back to the light palette there. */
export function useOptionalTheme(): { theme: ThemeTokens; isDark: boolean } {
  return useContext(ThemeContext) ?? { theme: lightTheme, isDark: false };
}

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
};
