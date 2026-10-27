import { View } from 'react-native';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { radii } from '@/lib/theme';
import { CONTENT_MAX_WIDTH } from '@/lib/responsive';

import { useTheme } from '@/context/ThemeContext';
type Props = {
  name: string;
  username: string;
  /** One quiet line under the handle — seller level, location, or tenure. */
  subtitle?: string | null;
  /** Seller level pill, shown beside the name once it's been earned. */
  levelName?: string | null;
  /** Action row (Follow / Message, or Edit / Share). */
  children?: React.ReactNode;
};

/**
 * Centred name block beneath the avatar: display name, handle, one supporting
 * line, then the screen's actions.
 */
export function ProfileIdentity({ name, username, subtitle, levelName, children }: Props) {
  const { theme: colors } = useTheme();
  return (
    // Clamped so the action row doesn't stretch two buttons across a desktop
    // viewport. A no-op below the cap.
    <View
      style={{
        alignItems: 'center',
        alignSelf: 'center',
        width: '100%',
        maxWidth: CONTENT_MAX_WIDTH,
        paddingHorizontal: 20,
        marginTop: 12,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '100%' }}>
        <Text
          style={{
            fontSize: 22,
            fontWeight: '800',
            color: colors.ink,
            letterSpacing: -0.4,
            flexShrink: 1,
            textAlign: 'center',
          }}
          numberOfLines={1}
        >
          {name}
        </Text>
        {levelName ? (
          <View
            accessibilityRole="text"
            accessibilityLabel={`Seller level: ${levelName}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: radii.pill,
              backgroundColor: colors.purpleSoft,
            }}
          >
            <Feather name="award" size={10} color={colors.purple} />
            <Text style={{ fontSize: 11, fontWeight: '800', color: colors.purple }}>
              {levelName}
            </Text>
          </View>
        ) : null}
      </View>

      <Text style={{ fontSize: 13.5, color: colors.mute, marginTop: 4 }} numberOfLines={1}>
        @{username}
      </Text>

      {subtitle ? (
        <Text
          style={{
            fontSize: 13,
            color: colors.muteSoft,
            marginTop: 6,
            textAlign: 'center',
          }}
          numberOfLines={2}
        >
          {subtitle}
        </Text>
      ) : null}

      {children ? <View style={{ alignSelf: 'stretch', marginTop: 16 }}>{children}</View> : null}
    </View>
  );
}
