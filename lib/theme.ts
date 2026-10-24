// Grabsty monotone design tokens. Single source of truth.
// Dynamic light/dark monotone palettes.

import { Platform, TextStyle } from 'react-native';

export const tabularNumberStyle: TextStyle = { fontVariant: ['tabular-nums'] };

// ── Monotone Palettes ───────────────────────────────────────────────────

export const lightTheme = {
  background: '#FFFFFF',
  surface: '#F6F6F6',
  panel: '#FFFFFF',
  text: '#111111',
  textMuted: 'rgba(0, 0, 0, 0.6)',
  border: 'rgba(0, 0, 0, 0.1)',
  accent: '#000000', // Monotone accent

  // Additional tokens & semantic aliases
  bg: '#FFFFFF',
  primary: '#000000',
  primaryDeep: '#1A1A1A',
  primarySoft: 'rgba(0, 0, 0, 0.06)',
  primarySofter: 'rgba(0, 0, 0, 0.12)',
  white: '#FFFFFF',
  ink: '#111111',
  ink2: '#111111',
  hair: 'rgba(0, 0, 0, 0.08)',
  hairline: 'rgba(0, 0, 0, 0.08)',
  divider: 'rgba(0, 0, 0, 0.08)',
  mute: 'rgba(0, 0, 0, 0.6)',
  muteSoft: 'rgba(0, 0, 0, 0.45)',
  ghost: 'rgba(0, 0, 0, 0.45)',
  smoke: 'rgba(0, 0, 0, 0.6)',
  overlay: 'rgba(0, 0, 0, 0.45)',
  overlayLight: 'rgba(0, 0, 0, 0.18)',
  selected: '#F6F6F6',
  onSelected: '#111111',
  cream: '#FFFFFF',
  soft: '#F6F6F6',
  purple: '#6C47FF',
  purpleDeep: '#5538D6',
  purpleSoft: 'rgba(108, 71, 255, 0.12)',
  pink: '#000000',
  pinkSoft: 'rgba(0, 0, 0, 0.06)',
  pinkDeep: '#1A1A1A',
  coral: '#000000',
  amber: '#000000',
  sky: '#000000',
  lime: '#000000',
  gradStart: '#000000',
  gradMid: '#000000',
  gradEnd: '#000000',
  red: '#111111',
  redSoft: 'rgba(0, 0, 0, 0.08)',
  green: '#000000',
  greenSoft: 'rgba(0, 0, 0, 0.10)',
  danger: '#EF4444',
};

export const darkTheme = {
  background: '#0F0F0F', // True dark
  surface: '#161616',
  panel: '#202020',
  text: '#F5F5F5',
  textMuted: 'rgba(255, 255, 255, 0.65)',
  border: 'rgba(255, 255, 255, 0.08)',
  accent: '#FFFFFF', // Monotone accent

  // Additional tokens & semantic aliases
  bg: '#0F0F0F',
  primary: '#FFFFFF',
  primaryDeep: '#E0E0E0',
  primarySoft: 'rgba(255, 255, 255, 0.10)',
  primarySofter: 'rgba(255, 255, 255, 0.18)',
  white: '#161616', // Card and container surface in dark mode
  ink: '#F5F5F5',
  ink2: '#F5F5F5',
  hair: 'rgba(255, 255, 255, 0.08)',
  hairline: 'rgba(255, 255, 255, 0.08)',
  divider: 'rgba(255, 255, 255, 0.08)',
  mute: 'rgba(255, 255, 255, 0.65)',
  muteSoft: 'rgba(255, 255, 255, 0.50)',
  ghost: 'rgba(255, 255, 255, 0.50)',
  smoke: 'rgba(255, 255, 255, 0.65)',
  overlay: 'rgba(0, 0, 0, 0.70)',
  overlayLight: 'rgba(0, 0, 0, 0.40)',
  selected: '#242424',
  onSelected: '#FFFFFF',
  cream: '#1E1E1E',
  soft: '#161616',
  purple: '#6C47FF',
  purpleDeep: '#5538D6',
  purpleSoft: 'rgba(108, 71, 255, 0.20)',
  pink: '#FFFFFF',
  pinkSoft: 'rgba(255, 255, 255, 0.10)',
  pinkDeep: '#E0E0E0',
  coral: '#FFFFFF',
  amber: '#FFFFFF',
  sky: '#FFFFFF',
  lime: '#FFFFFF',
  gradStart: '#202020',
  gradMid: '#161616',
  gradEnd: '#0F0F0F',
  red: '#F5F5F5',
  redSoft: 'rgba(255, 255, 255, 0.08)',
  green: '#FFFFFF',
  greenSoft: 'rgba(255, 255, 255, 0.18)',
  danger: '#EF4444',
};

export type ThemeTokens = typeof lightTheme;

let currentTheme: ThemeTokens = lightTheme;

export function setActiveTheme(nextTheme: ThemeTokens) {
  currentTheme = nextTheme;
}

export function getActiveTheme(): ThemeTokens {
  return currentTheme;
}

// Dynamic colors proxy that always resolves properties from active theme
export const colors: ThemeTokens = new Proxy({} as ThemeTokens, {
  get(_target, prop: string | symbol) {
    if (typeof prop === 'string') {
      return (currentTheme as any)[prop] ?? (lightTheme as any)[prop];
    }
    return (currentTheme as any)[prop];
  },
  set() {
    return false;
  },
  has(_target, prop: string | symbol) {
    return prop in currentTheme;
  },
  ownKeys() {
    return Reflect.ownKeys(currentTheme);
  },
  getOwnPropertyDescriptor(_target, prop) {
    return (
      Object.getOwnPropertyDescriptor(currentTheme, prop) || {
        enumerable: true,
        configurable: true,
      }
    );
  },
});

export const gradients = {
  story: ['#000000', '#000000', '#000000'] as const,
  warm: ['#000000', '#000000'] as const,
  pinkPeach: ['#000000', '#000000'] as const,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 14,
  xl: 16,
  '2xl': 20,
  '3xl': 24,
  '4xl': 28,
  pill: 999,
} as const;

export const spacing = {
  0: 0,
  '0.5': 2,
  1: 4,
  '1.5': 6,
  2: 8,
  '2.5': 10,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  10: 40,
  12: 48,
  14: 56,
  16: 64,
} as const;

export const type = {
  family: {
    sans: 'Inter_400Regular',
    sansMedium: 'Inter_500Medium',
    sansSemibold: 'Inter_600SemiBold',
    sansBold: 'Inter_700Bold',
    sansBoldItalic: 'Inter_700Bold_Italic',
  },
  size: {
    '2xs': 10,
    xs: 11,
    sm: 12,
    base: 13,
    md: 14,
    lg: 15,
    xl: 16,
    '2xl': 18,
    '3xl': 20,
    '4xl': 24,
    '5xl': 32,
    display: 44,
    hero: 56,
  },
  weight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    extrabold: '800' as const,
    black: '900' as const,
  },
} as const;

// Shadows at low opacity
export const shadow = {
  none: {},
  sm: Platform.select({
    android: { boxShadow: '0px 2px 6px rgba(0,0,0,0.04)', elevation: 1 },
    default: { boxShadow: '0px 2px 6px rgba(0,0,0,0.04)' },
  })!,
  md: Platform.select({
    android: { boxShadow: '0px 4px 12px rgba(0,0,0,0.06)', elevation: 2 },
    default: { boxShadow: '0px 4px 12px rgba(0,0,0,0.06)' },
  })!,
  lg: Platform.select({
    android: { boxShadow: '0px 8px 20px rgba(0,0,0,0.1)', elevation: 4 },
    default: { boxShadow: '0px 8px 20px rgba(0,0,0,0.1)' },
  })!,
  topBar: Platform.select({
    android: { boxShadow: '0px -3px 12px rgba(0,0,0,0.06)', elevation: 4 },
    default: { boxShadow: '0px -3px 12px rgba(0,0,0,0.06)' },
  })!,
} as const;

export const getEyebrow = (activeTheme: ThemeTokens = lightTheme) => ({
  fontSize: type.size.xs,
  fontWeight: type.weight.bold,
  color: activeTheme.text,
  letterSpacing: 1.4,
  textTransform: 'uppercase' as const,
});

export const getEyebrowMute = (activeTheme: ThemeTokens = lightTheme) => ({
  ...getEyebrow(activeTheme),
  color: activeTheme.textMuted,
  letterSpacing: 1.2,
});

export const eyebrow: ReturnType<typeof getEyebrow> = new Proxy(
  {} as ReturnType<typeof getEyebrow>,
  {
    get(_target, prop: string | symbol) {
      const active = getEyebrow(currentTheme);
      return (active as any)[prop];
    },
    set() {
      return false;
    },
    has(_target, prop: string | symbol) {
      return prop in getEyebrow(currentTheme);
    },
    ownKeys() {
      return Reflect.ownKeys(getEyebrow(currentTheme));
    },
    getOwnPropertyDescriptor(_target, prop) {
      const active = getEyebrow(currentTheme);
      return (
        Object.getOwnPropertyDescriptor(active, prop) || {
          enumerable: true,
          configurable: true,
        }
      );
    },
  },
);

export const eyebrowMute: ReturnType<typeof getEyebrowMute> = new Proxy(
  {} as ReturnType<typeof getEyebrowMute>,
  {
    get(_target, prop: string | symbol) {
      const active = getEyebrowMute(currentTheme);
      return (active as any)[prop];
    },
    set() {
      return false;
    },
    has(_target, prop: string | symbol) {
      return prop in getEyebrowMute(currentTheme);
    },
    ownKeys() {
      return Reflect.ownKeys(getEyebrowMute(currentTheme));
    },
    getOwnPropertyDescriptor(_target, prop) {
      const active = getEyebrowMute(currentTheme);
      return (
        Object.getOwnPropertyDescriptor(active, prop) || {
          enumerable: true,
          configurable: true,
        }
      );
    },
  },
);

export const tintedPurple = 'rgba(0, 0, 0, 0.45)';

export const getTextStyles = (activeTheme: ThemeTokens = lightTheme) =>
  ({
    display: {
      fontFamily: type.family.sansBold,
      fontSize: type.size.display,
      color: activeTheme.text,
      letterSpacing: -1,
      lineHeight: 48,
    },
    h1: {
      fontFamily: type.family.sansBold,
      fontSize: type.size['5xl'],
      color: activeTheme.text,
      letterSpacing: -0.6,
      lineHeight: 38,
    },
    h2: {
      fontFamily: type.family.sansBold,
      fontSize: type.size['4xl'],
      color: activeTheme.text,
      letterSpacing: -0.4,
      lineHeight: 30,
    },
    title: {
      fontFamily: type.family.sansBold,
      fontSize: type.size['2xl'],
      color: activeTheme.text,
      letterSpacing: -0.2,
    },
    body: {
      fontFamily: type.family.sans,
      fontSize: type.size.lg,
      color: activeTheme.text,
      lineHeight: 22,
    },
    bodyStrong: {
      fontFamily: type.family.sansSemibold,
      fontSize: type.size.lg,
      color: activeTheme.text,
    },
    bodyMuted: {
      fontFamily: type.family.sans,
      fontSize: type.size.md,
      color: activeTheme.textMuted,
      lineHeight: 20,
    },
    caption: {
      fontFamily: type.family.sansMedium,
      fontSize: type.size.sm,
      color: activeTheme.textMuted,
    },
    label: {
      fontFamily: type.family.sansBold,
      fontSize: type.size.base,
      color: activeTheme.text,
      letterSpacing: 0.1,
    },
    eyebrow: getEyebrow(activeTheme),
  }) as const;

export const textStyles: ReturnType<typeof getTextStyles> = new Proxy(
  {} as ReturnType<typeof getTextStyles>,
  {
    get(_target, prop: string | symbol) {
      const active = getTextStyles(currentTheme);
      return (active as any)[prop];
    },
  },
);
