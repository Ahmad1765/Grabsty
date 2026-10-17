// Cross-platform text-input prompt. Wraps Alert.prompt on iOS, falls back
// to a custom Modal on Android (where Alert.prompt is unavailable). One
// hook, two helpers, same surface area on both platforms.
//
// Keep this tiny — anything richer (multi-field forms, validation) belongs
// in a dedicated sheet, not here.

import { useCallback, useEffect, useState } from 'react';
import { Alert, Animated, Easing, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { KeyboardAvoider } from '@/components/ui/SafeContainer';
import { Text, TextInput } from '@/lib/rnText';
import { BlurView } from 'expo-blur';
import { useTheme } from '@/context/ThemeContext';

const IS_IOS = Platform.OS === 'ios';
// BlurView renders cheaply on iOS (native) and on web (CSS backdrop-filter).
// On Android it's costly and inconsistent, so there we keep the solid dim only.
const CAN_BLUR = IS_IOS || Platform.OS === 'web';
// JS-driven on web (no RCTAnimation host); native-driven on iOS/Android.
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

type PromptOptions = {
  title: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  submitLabel?: string;
  cancelLabel?: string;
};

type PendingPrompt = PromptOptions & {
  resolve: (value: string | null) => void;
};

export function usePrompt() {
  const [pending, setPending] = useState<PendingPrompt | null>(null);

  const prompt = useCallback((opts: PromptOptions): Promise<string | null> => {
    if (IS_IOS) {
      return new Promise((resolve) => {
        Alert.prompt(
          opts.title,
          opts.message,
          [
            { text: opts.cancelLabel ?? 'Cancel', style: 'cancel', onPress: () => resolve(null) },
            {
              text: opts.submitLabel ?? 'OK',
              onPress: (value?: string) => resolve((value ?? '').trim() || null),
            },
          ],
          'plain-text',
          opts.defaultValue,
        );
      });
    }
    return new Promise((resolve) => {
      setPending({ ...opts, resolve });
    });
  }, []);

  const element = pending ? (
    <PromptModal
      options={pending}
      onResolve={(v) => {
        pending.resolve(v);
        setPending(null);
      }}
    />
  ) : null;

  return { prompt, element };
}

function PromptModal({
  options,
  onResolve,
}: {
  options: PromptOptions;
  onResolve: (value: string | null) => void;
}) {
  const { theme, isDark } = useTheme();
  const [value, setValue] = useState(options.defaultValue ?? '');
  const submit = () => onResolve(value.trim() || null);

  // Entrance: the backdrop fades in while the card scales up from 96% and
  // fades — the RN equivalent of CSS @starting-style. ~180ms ease-out reads
  // as the dialog being physically placed in front of the (receding) page.
  const [enter] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  }, [enter]);

  const cardScale = enter.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] });

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => onResolve(null)}
    >
      <Pressable
        onPress={() => onResolve(null)}
        style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
      >
        {/* Backdrop: a dim tint for depth on every platform, plus a real blur
            where it's cheap (iOS/web) so the page visibly recedes. */}
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: enter }]}>
          {CAN_BLUR ? (
            <BlurView intensity={24} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
          ) : null}
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: CAN_BLUR ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.65)' },
            ]}
          />
        </Animated.View>
        <KeyboardAvoider
          style={{ width: '100%', alignItems: 'center', justifyContent: 'center' }}
        >
          <Animated.View
            style={{ opacity: enter, transform: [{ scale: cardScale }] }}
          >
          <Pressable
            onPress={() => {}}
            style={{
              width: 320,
              maxWidth: '90%',
            backgroundColor: isDark ? theme.panel : '#FFFFFF',
            borderRadius: 18,
            padding: 18,
            borderWidth: isDark ? 1 : 0,
            borderColor: theme.border,
            elevation: 12,
            shadowColor: '#000',
            shadowOpacity: isDark ? 0.45 : 0.2,
            shadowRadius: 30,
            shadowOffset: { width: 0, height: 18 },
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text, marginBottom: 4 }}>
            {options.title}
          </Text>
          {options.message ? (
            <Text style={{ fontSize: 13, color: theme.mute, marginBottom: 12 }}>
              {options.message}
            </Text>
          ) : null}
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder={options.placeholder}
            placeholderTextColor={theme.mute}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={submit}
            style={{
              fontSize: 15,
              color: theme.text,
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: 10,
              backgroundColor: isDark ? theme.surface : 'rgba(15,15,15,0.05)',
              borderWidth: isDark ? 1 : 0,
              borderColor: theme.border,
              marginTop: 8,
            }}
          />
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <Pressable
              onPress={() => onResolve(null)}
              style={({ pressed }) => ({
                paddingVertical: 8,
                paddingHorizontal: 14,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: theme.mute }}>
                {options.cancelLabel ?? 'Cancel'}
              </Text>
            </Pressable>
            <Pressable
              onPress={submit}
              disabled={value.trim().length === 0}
              style={({ pressed }) => ({
                paddingVertical: 8,
                paddingHorizontal: 14,
                borderRadius: 10,
                backgroundColor: theme.purple,
                opacity: value.trim().length === 0 ? 0.4 : pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>
                {options.submitLabel ?? 'OK'}
              </Text>
            </Pressable>
          </View>
        </Pressable>
        </Animated.View>
        </KeyboardAvoider>
      </Pressable>
    </Modal>
  );
}
