import { View, Pressable } from 'react-native';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { tap } from '@/lib/haptics';
import { useTheme, type ThemeMode } from '@/context/ThemeContext';
import { SheetModal, SheetLabel } from './Sheet';

const THEME_OPTIONS: {
  id: ThemeMode;
  title: string;
  desc: string;
  icon: keyof typeof Feather.glyphMap;
}[] = [
  { id: 'light', title: 'Light', desc: 'Paper white with ink text', icon: 'sun' },
  { id: 'dark', title: 'Dark', desc: 'Near-black, easier on the eyes at night', icon: 'moon' },
  { id: 'system', title: 'System', desc: "Match your device's appearance setting", icon: 'smartphone' },
];

export function ThemeSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { theme, mode, isDark, setThemeMode } = useTheme();

  const handleSelect = (nextMode: ThemeMode) => {
    tap('light');
    setThemeMode(nextMode);
  };

  return (
    <SheetModal visible={visible} onClose={onClose} title="Theme & Appearance">
      <View style={{ gap: 10, marginTop: 4, marginBottom: 8 }}>
        <SheetLabel style={{ marginLeft: 4 }}>Select Appearance</SheetLabel>

        {THEME_OPTIONS.map((opt) => {
          const selected = mode === opt.id;
          return (
            <Pressable
              key={opt.id}
              onPress={() => handleSelect(opt.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={opt.title}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                padding: 16,
                borderRadius: 16,
                backgroundColor: selected ? theme.panel : theme.surface,
                borderWidth: 1.5,
                borderColor: selected ? theme.accent : theme.border,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <View
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  backgroundColor: selected ? theme.accent : theme.panel,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 14,
                  borderWidth: 1,
                  borderColor: theme.border,
                }}
              >
                <Feather
                  name={opt.icon}
                  size={20}
                  color={selected ? theme.background : theme.text}
                />
              </View>

              <View style={{ flex: 1, marginRight: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: '800',
                      color: theme.text,
                      letterSpacing: -0.2,
                    }}
                  >
                    {opt.title}
                  </Text>
                  {opt.id === 'system' && (
                    <View
                      style={{
                        marginLeft: 8,
                        paddingHorizontal: 7,
                        paddingVertical: 2,
                        borderRadius: 6,
                        backgroundColor: theme.border,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: '700',
                          color: theme.textMuted,
                        }}
                      >
                        {isDark ? 'Dark now' : 'Light now'}
                      </Text>
                    </View>
                  )}
                </View>
                <Text
                  style={{
                    fontSize: 12,
                    color: theme.textMuted,
                    marginTop: 3,
                    lineHeight: 16,
                  }}
                >
                  {opt.desc}
                </Text>
              </View>

              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  borderWidth: 2,
                  borderColor: selected ? theme.accent : theme.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: selected ? theme.accent : 'transparent',
                }}
              >
                {selected && (
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: theme.background,
                    }}
                  />
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
    </SheetModal>
  );
}
