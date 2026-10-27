import { View, Pressable } from 'react-native';
import { Text } from '@/lib/rnText';

import { useTheme } from '@/context/ThemeContext';
type Props =
  | {
      title: string;
      count?: number;
      action: { label: string; onPress: () => void; accessibilityLabel?: string; accessibilityHint?: string };
      rightText?: never;
    }
  | {
      title: string;
      count?: number;
      rightText: string;
      action?: never;
    }
  | {
      title: string;
      count?: number;
      action?: never;
      rightText?: never;
    };

export function SectionHeader({ title, count, action, rightText }: Props) {
  const { theme: colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        marginBottom: 10,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Text
          style={{
            fontSize: 17,
            fontWeight: '800',
            color: colors.ink2,
            letterSpacing: -0.3,
          }}
        >
          {title}
        </Text>
        {typeof count === 'number' && (
          <Text style={{ fontSize: 12, color: colors.smoke, fontWeight: '700' }}>
            {count}
          </Text>
        )}
      </View>
      {action ? (
        <Pressable
          onPress={action.onPress}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel={action.accessibilityLabel ?? action.label}
          accessibilityHint={action.accessibilityHint}
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.pinkDeep }}>
            {action.label}
          </Text>
        </Pressable>
      ) : rightText ? (
        <Text style={{ fontSize: 12, color: colors.smoke, fontWeight: '600' }}>{rightText}</Text>
      ) : null}
    </View>
  );
}
