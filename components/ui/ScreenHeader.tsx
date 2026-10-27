import { View, Pressable } from 'react-native';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { HIT_SLOP_8 } from '@/lib/responsive';
import { safeBack } from '@/lib/nav';

import { useTheme } from '@/context/ThemeContext';
type Props = {
  title: string;
  subtitle?: string;
  back?: boolean;
  onBack?: () => void;
  right?: React.ReactNode;
  variant?: 'plain' | 'large';
};

export function ScreenHeader({
  title,
  subtitle,
  back = false,
  onBack,
  right,
  variant = 'plain',
}: Props) {
  const { theme: colors } = useTheme();
  const large = variant === 'large';
  return (
    <View
      style={{
        paddingHorizontal: 16,
        paddingTop: 4,
        paddingBottom: large ? 12 : 8,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: 40,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
          {back && (
            <Pressable
              onPress={onBack ?? (() => safeBack())}
              hitSlop={HIT_SLOP_8}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Back"
              style={({ pressed }) => ({
                width: 38,
                height: 38,
                borderRadius: 19,
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 4,
                marginLeft: -8,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Feather name="chevron-left" size={26} color={colors.ink2} />
            </Pressable>
          )}
          {!large && (
            <Text
              style={{
                fontSize: 22,
                fontWeight: '800',
                color: colors.ink2,
                letterSpacing: -0.4,
                flexShrink: 1,
              }}
              numberOfLines={1}
            >
              {title}
            </Text>
          )}
        </View>
        {right ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>{right}</View> : null}
      </View>
      {large && (
        <View style={{ marginTop: 6 }}>
          <Text
            style={{
              fontSize: 28,
              fontWeight: '800',
              color: colors.ink2,
              letterSpacing: -0.6,
            }}
          >
            {title}
          </Text>
          {subtitle && (
            <Text style={{ fontSize: 13, color: colors.smoke, marginTop: 4, lineHeight: 18 }}>
              {subtitle}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}
