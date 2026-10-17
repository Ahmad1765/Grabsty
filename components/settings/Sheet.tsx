import { useState } from 'react';
import {
  View,
  Pressable,
  Modal,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { KeyboardAvoider } from '@/components/ui/SafeContainer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, TextInput } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { tap } from '@/lib/haptics';
import { useTheme } from '@/context/ThemeContext';

export function SheetModal({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View
        style={{
          flex: 1,
          backgroundColor: theme.overlay,
          justifyContent: Platform.OS === 'web' ? 'center' : 'flex-end',
          alignItems: 'center',
          paddingHorizontal: Platform.OS === 'web' ? 16 : 0,
        }}
      >
        <Pressable style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} onPress={onClose} accessibilityLabel="Close" />
        <KeyboardAvoider
          style={{ width: '100%', maxWidth: 520, maxHeight: '90%' }}
        >
          <View
            style={{
              backgroundColor: theme.panel,
              borderRadius: Platform.OS === 'web' ? 24 : 0,
              ...(Platform.OS !== 'web' && {
                borderTopLeftRadius: 28,
                borderTopRightRadius: 28,
              }),
              paddingTop: 16,
              paddingHorizontal: 20,
              paddingBottom: Platform.OS === 'ios' ? 32 : Math.max(insets.bottom + 8, 20),
              maxHeight: '100%',
              borderWidth: isDark ? 1 : 0,
              borderColor: theme.border,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.15,
              shadowRadius: 24,
              elevation: 8,
            }}
          >
            {/* Handle */}
            <View
              style={{
                alignSelf: 'center',
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: theme.border,
                marginBottom: 12,
              }}
            />
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 14,
              }}
            >
              <Text style={{ fontSize: 22, fontWeight: '900', color: theme.text, letterSpacing: -0.6 }}>
                {title}
              </Text>
              <Pressable
                onPress={onClose}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  backgroundColor: theme.panel,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: theme.border,
                }}
              >
                <Feather name="x" size={16} color={theme.text} />
              </Pressable>
            </View>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 8 }}
            >
              {children}
            </ScrollView>
          </View>
        </KeyboardAvoider>
      </View>
    </Modal>
  );
}

export function SheetLabel({
  children,
  tone = 'mute',
  style,
}: {
  children: React.ReactNode;
  tone?: 'mute' | 'focus' | 'error';
  style?: { marginBottom?: number; marginLeft?: number };
}) {
  const { theme } = useTheme();
  const color =
    tone === 'error' ? theme.danger : tone === 'focus' ? theme.text : theme.textMuted;
  return (
    <Text
      style={{
        fontSize: 11,
        fontWeight: '700',
        color,
        letterSpacing: 1.2,
        textTransform: 'uppercase',
        ...style,
      }}
    >
      {children}
    </Text>
  );
}

export function SheetField({
  label,
  value,
  onChangeText,
  error,
  placeholder,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  error?: string;
  placeholder?: string;
  keyboardType?: 'default' | 'number-pad' | 'phone-pad' | 'email-address';
}) {
  const { theme } = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? theme.danger : focused ? theme.text : theme.border;

  return (
    <View style={{ marginBottom: 12 }}>
      <SheetLabel
        tone={error ? 'error' : focused ? 'focus' : 'mute'}
        style={{ marginBottom: 6, marginLeft: 4 }}
      >
        {label}
      </SheetLabel>
      <View
        style={{
          backgroundColor: theme.panel,
          borderRadius: 14,
          borderWidth: 1.5,
          borderColor,
          paddingHorizontal: 14,
          minHeight: 48,
          justifyContent: 'center',
        }}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          placeholderTextColor={theme.textMuted}
          keyboardType={keyboardType}
          accessibilityLabel={label}
          style={{ fontSize: 15, color: theme.text, padding: 0 }}
        />
      </View>
      {error && (
        <Text
          style={{
            fontSize: 11,
            color: theme.danger,
            marginTop: 4,
            marginLeft: 4,
            fontWeight: '600',
          }}
        >
          {error}
        </Text>
      )}
    </View>
  );
}

export function SheetChoice<T extends string | number>({
  options,
  value,
  onChange,
  renderLabel,
  shape = 'pill',
  style,
}: {
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  renderLabel: (option: T) => string;
  shape?: 'pill' | 'block';
  style?: { marginBottom?: number };
}) {
  const { theme } = useTheme();
  const block = shape === 'block';

  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: block ? 'nowrap' : 'wrap',
        gap: 8,
        ...style,
      }}
    >
      {options.map((option) => {
        const active = value === option;
        return (
          <Pressable
            key={String(option)}
            onPress={() => {
              tap('light');
              onChange(option);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => ({
              flex: block ? 1 : undefined,
              alignItems: block ? 'center' : undefined,
              paddingHorizontal: block ? 0 : 16,
              paddingVertical: block ? 12 : 12,
              borderRadius: block ? 14 : 999,
              backgroundColor: active ? theme.accent : theme.panel,
              borderWidth: 1.5,
              borderColor: active ? theme.accent : theme.border,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text
              style={{
                fontSize: block ? 13 : 14,
                fontWeight: '800',
                color: active
                  ? (theme.accent === '#FFFFFF' ? '#0F0F0F' : '#FFFFFF')
                  : theme.text,
              }}
            >
              {renderLabel(option)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SheetPrimary({
  label,
  onPress,
  loading,
  disabled,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  const { theme } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      style={({ pressed }) => ({
        height: 54,
        borderRadius: 16,
        backgroundColor: theme.accent,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 6,
        opacity: disabled ? 0.45 : 1,
        transform: [{ scale: pressed && !disabled ? 0.985 : 1 }],
      })}
    >
      {loading ? (
        <ActivityIndicator color={theme.accent === '#FFFFFF' ? '#0F0F0F' : '#FFFFFF'} />
      ) : (
        <Text
          style={{
            fontSize: 15,
            fontWeight: '800',
            color: theme.accent === '#FFFFFF' ? '#0F0F0F' : '#FFFFFF',
            letterSpacing: 0.2,
          }}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function SheetDestructive({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { theme } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={{ alignItems: 'center', paddingVertical: 14, marginTop: 4 }}
    >
      <Text style={{ color: theme.danger, fontWeight: '700', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}
