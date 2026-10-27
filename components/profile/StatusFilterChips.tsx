// All / Available / Sold chips for profile grids (Collection + Liked).
// Always rendered, even at zero counts, so the row never jumps in and out.
import { View, Pressable } from 'react-native';
import { Text } from '@/lib/rnText';
import { useTheme } from '@/context/ThemeContext';

export type StatusFilter = 'all' | 'available' | 'sold';

export function StatusFilterChips({
  value,
  onChange,
  total,
  available,
  sold,
}: {
  value: StatusFilter;
  onChange: (f: StatusFilter) => void;
  total: number;
  available: number;
  sold: number;
}) {
  const { theme, isDark } = useTheme();
  const chips = [
    { id: 'all', label: `All (${total})` },
    { id: 'available', label: `Available (${available})` },
    { id: 'sold', label: `Sold (${sold})` },
  ] as const;

  return (
    <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 10 }}>
      {chips.map((f) => {
        const active = value === f.id;
        return (
          <Pressable
            key={f.id}
            testID={`status-chip-${f.id}`}
            onPress={() => onChange(f.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => ({
              height: 30,
              paddingHorizontal: 14,
              borderRadius: 15,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: active ? (isDark ? theme.panel : '#111111') : isDark ? theme.surface : theme.panel,
              borderWidth: 1,
              borderColor: active ? (isDark ? theme.border : '#111111') : theme.border,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '700', color: active ? '#FFFFFF' : theme.ink }}>
              {f.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
