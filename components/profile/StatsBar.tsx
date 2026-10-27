import { View, Pressable } from 'react-native';
import { Text } from '@/lib/rnText';
import { radii, shadow } from '@/lib/theme';
import { HIT_SLOP_8, CONTENT_MAX_WIDTH } from '@/lib/responsive';
import { formatCount } from './format';

import { useTheme } from '@/context/ThemeContext';
export type StatItem = {
  key: string;
  value: number;
  label: string;
  onPress?: () => void;
};

/**
 * Horizontal metrics card: prominent numbers over quiet labels, hairline
 * dividers between columns.
 *
 * Columns are evenly weighted (`flex: 1`) rather than content-sized, so a
 * seller with "12K" followers and "3" items still gets an even rhythm.
 *
 * `variant`:
 * - `'card'` (default) — bordered card with shadow, used on public profiles.
 * - `'flat'` — borderless, no shadow, plain TikTok-style row.
 */
export function StatsBar({
  items,
  variant = 'card',
}: {
  items: StatItem[];
  variant?: 'card' | 'flat';
}) {
  const { theme: colors } = useTheme();
  const isFlat = variant === 'flat';
  return (
    // Clamped and centred so four columns don't stretch across a desktop
    // viewport. A no-op on any phone, where the width is already under the cap.
    <View style={{ alignItems: 'center', paddingHorizontal: 16, marginTop: 20 }}>
      <View
        style={{
          width: '100%',
          maxWidth: CONTENT_MAX_WIDTH,
          flexDirection: 'row',
          alignItems: 'stretch',
          paddingVertical: 14,
          backgroundColor: isFlat ? 'transparent' : colors.surface,
          ...(isFlat
            ? {}
            : {
                borderRadius: radii.xl,
                borderWidth: 1,
                borderColor: colors.border,
                ...shadow.sm,
              }),
        }}
      >
        {items.map((item, i) => (
          <View key={item.key} style={{ flex: 1, flexDirection: 'row' }}>
            {i > 0 ? (
              <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: colors.border }} />
            ) : null}
            <Stat item={item} />
          </View>
        ))}
      </View>
    </View>
  );
}

function Stat({ item }: { item: StatItem }) {
  const { theme: colors } = useTheme();
  const body = (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ fontSize: 20, fontWeight: '800', color: colors.ink, letterSpacing: -0.4 }}>
        {formatCount(item.value)}
      </Text>
      <Text style={{ fontSize: 11.5, color: colors.mute, marginTop: 3 }}>{item.label}</Text>
    </View>
  );

  if (!item.onPress) return <View style={{ flex: 1 }}>{body}</View>;

  return (
    <Pressable
      onPress={item.onPress}
      hitSlop={HIT_SLOP_8}
      accessibilityRole="button"
      accessibilityLabel={`${item.value} ${item.label}`}
      style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.6 : 1 })}
    >
      {body}
    </Pressable>
  );
}
