import { View, Pressable } from 'react-native';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { radii } from '@/lib/theme';

import { useTheme } from '@/context/ThemeContext';
type Props = {
  icon?: keyof typeof Feather.glyphMap;
  iconBg?: string;
  iconColor?: string;
  title: string;
  subtitle?: string;
  badge?: string;
  badgeTone?: 'pink' | 'mute' | 'green' | 'amber';
  right?: React.ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  destructive?: boolean;
};

export function ListRow({
  icon,
  iconBg,
  iconColor,
  title,
  subtitle,
  badge,
  badgeTone = 'mute',
  right,
  onPress,
  chevron = true,
  destructive,
}: Props) {
  const { theme: colors } = useTheme();
  const titleColor = destructive ? colors.red : colors.ink2;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 14,
        backgroundColor: pressed ? colors.panel : 'transparent',
      })}
    >
      {icon && (
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: radii.md,
            backgroundColor: iconBg ?? colors.pinkSoft,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 14,
          }}
        >
          <Feather
            name={icon}
            size={17}
            color={iconColor ?? (destructive ? colors.red : colors.pinkDeep)}
          />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 14.5, fontWeight: '700', color: titleColor }} numberOfLines={1}>
            {title}
          </Text>
          {badge && <Badge label={badge} tone={badgeTone} />}
        </View>
        {subtitle && (
          <Text
            style={{ fontSize: 12.5, color: colors.smoke, marginTop: 2, lineHeight: 17 }}
            numberOfLines={2}
          >
            {subtitle}
          </Text>
        )}
      </View>
      {right ?? (chevron && <Feather name="chevron-right" size={18} color={colors.muteSoft} />)}
    </Pressable>
  );
}

function Badge({ label, tone }: { label: string; tone: NonNullable<Props['badgeTone']> }) {
  const { theme: colors } = useTheme();
  const map = {
    pink: { bg: colors.pinkSoft, fg: colors.pinkDeep },
    mute: { bg: colors.panel, fg: colors.smoke },
    green: { bg: colors.greenSoft, fg: colors.green },
    amber: { bg: colors.panel, fg: colors.amber },
  } as const;
  const t = map[tone];
  return (
    <View
      style={{
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 999,
        backgroundColor: t.bg,
      }}
    >
      <Text style={{ fontSize: 10, fontWeight: '800', color: t.fg, letterSpacing: 0.4 }}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
}
