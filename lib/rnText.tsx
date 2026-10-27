// Drop-in replacement for importing `Text`/`TextInput` from 'react-native'.
//
// Screens across the app set fontSize/fontWeight/color inline but never
// fontFamily, so ~300 Text/TextInput instances silently rendered in the OS
// system font instead of the loaded Inter typeface. This wraps both
// components so any style without an explicit `fontFamily` gets the Inter
// weight matching its own `fontWeight` — any explicit `fontFamily` already
// set always wins, this only fills the gap.
//
// `cssInterop` (not a plain forwardRef) matters here: NativeWind resolves
// `className` via a Map keyed by the *exact* component reference, so a plain
// wrapper would silently stop `className="..."` from working wherever this
// import replaces the react-native one. Re-registering through `cssInterop`
// keeps that working.
//
// Does NOT cover `<Animated.Text>` (react-native-reanimated or RN's own
// Animated API) — both wrap react-native's real Text internally, so they
// never pass through this shim. Any `Animated.Text` needs its own explicit
// `fontFamily` in its style (see components/AnimatedTabBar.tsx for the
// pattern: pick the Inter file matching the fontWeight already there).
import React from 'react';
import { Text as RNText, TextInput as RNTextInput, StyleSheet, Platform } from 'react-native';
import type { TextProps, TextInputProps } from 'react-native';
import { cssInterop } from 'nativewind';
import { useOptionalTheme } from '@/context/ThemeContext';

const WEIGHT_FONT: Record<string, string> = {
  '400': 'Inter_400Regular',
  normal: 'Inter_400Regular',
  '500': 'Inter_500Medium',
  '600': 'Inter_600SemiBold',
  '700': 'Inter_700Bold',
  bold: 'Inter_700Bold',
  '800': 'Inter_700Bold',
  '900': 'Inter_700Bold',
};

function withDefaultInterFont<P extends { style?: any }>(
  Base: React.ComponentType<P>,
  displayName: string,
  // Spread BEFORE the caller's props so any of these stays overridable at the
  // call site — they're defaults, not overrides.
  extraDefaults?: Partial<P>,
) {
  const isInput = displayName === 'DefaultFontTextInput';
  const Wrapped = React.forwardRef<unknown, P>((props, ref) => {
    // Subscribe to the theme (not the static `colors` proxy): with the React
    // Compiler on, a proxy read is treated as a constant and the default text
    // color would never update when the user switches theme.
    const { theme, isDark } = useOptionalTheme();
    const flat = StyleSheet.flatten(props.style as any) || ({} as any);
    const family = flat.fontFamily || (WEIGHT_FONT[String(flat.fontWeight ?? '400')] ?? 'Inter_400Regular');
    const color = flat.color ?? theme.text;
    const themedDefaults = isInput
      ? { selectionColor: theme.primary, keyboardAppearance: isDark ? 'dark' : 'light', placeholderTextColor: theme.muteSoft }
      : undefined;

    // On mobile web (iOS Safari & touch devices), enforce minimum 16px fontSize on inputs
    // to prevent iOS Safari from auto-zooming the viewport upon focusing an input.
    let mobileInputStyle: any = undefined;
    if (Platform.OS === 'web' && isInput) {
      if (typeof window !== 'undefined' && ('ontouchstart' in window || window.innerWidth <= 768)) {
        if (!flat.fontSize || flat.fontSize < 16) {
          mobileInputStyle = { fontSize: 16 };
        }
      }
    }

    const style = [
      { fontFamily: family, color },
      props.style,
      mobileInputStyle,
    ];
    return <Base ref={ref as any} {...(extraDefaults as any)} {...(themedDefaults as any)} {...(props as any)} style={style} />;
  });
  Wrapped.displayName = displayName;
  return Wrapped;
}

const BaseText = withDefaultInterFont<TextProps>(RNText, 'DefaultFontText');
// Android paints a black underline under every TextInput and uses a black
// selection handle unless told otherwise; neither prop has any effect on web
// or iOS. This used to live in app/_layout.tsx as a `TextInput.defaultProps`
// mutation, which React 19 ignores for function components — so it silently
// stopped applying and only Android showed the regression.
const BaseTextInput = withDefaultInterFont<TextInputProps>(
  RNTextInput,
  'DefaultFontTextInput',
  {
    underlineColorAndroid: 'transparent',
  },
);

export const Text = cssInterop(BaseText, { className: 'style' }) as typeof RNText;
export const TextInput = cssInterop(BaseTextInput, {
  className: { target: 'style', nativeStyleToProp: { textAlign: true } },
}) as typeof RNTextInput;

// Callers do `useRef<TextInput>(null)` for `.focus()`/`.clear()`/etc — that
// needs `TextInput` to also resolve as a type (the ref instance shape), not
// just the component value above. Declaration merging (a `const` and a
// `type` sharing one export name) is exactly what react-native's own
// TextInput does, so `import { TextInput } from '@/lib/rnText'` keeps
// working as both a component and a ref type.
// eslint-disable-next-line @typescript-eslint/no-redeclare -- intentional value+type merge, see comment above
export type TextInput = InstanceType<typeof RNTextInput>;
