import { View } from 'react-native';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { Button } from './Button';

import { useTheme } from '@/context/ThemeContext';
type Props = {
  emoji?: string;
  icon?: keyof typeof Feather.glyphMap;
  title: string;
  description: string;
  cta?: { label: string; onPress: () => void; icon?: keyof typeof Feather.glyphMap };
  align?: 'left' | 'center';
};

export function EmptyState({
  emoji,
  icon = 'package',
  title,
  description,
  cta,
  align = 'center',
}: Props) {
  const { theme: colors } = useTheme();
  return (
    <View
      style={{
        alignItems: align === 'center' ? 'center' : 'flex-start',
        paddingHorizontal: 28,
        paddingTop: 40,
        paddingBottom: 40,
      }}
    >
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: colors.purpleSoft,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 16,
        }}
      >
        {emoji ? (
          <Text style={{ fontSize: 28 }}>{emoji}</Text>
        ) : (
          <Feather name={icon} size={26} color={colors.purple} />
        )}
      </View>
      <Text
        style={{
          fontSize: 18,
          fontWeight: '800',
          color: colors.ink,
          textAlign: align === 'center' ? 'center' : 'left',
          letterSpacing: -0.2,
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          fontSize: 13.5,
          color: colors.mute,
          marginTop: 6,
          lineHeight: 19,
          textAlign: align === 'center' ? 'center' : 'left',
          maxWidth: 320,
        }}
      >
        {description}
      </Text>
      {cta && (
        <View style={{ marginTop: 18 }}>
          <Button label={cta.label} onPress={cta.onPress} icon={cta.icon} variant="primary" />
        </View>
      )}
    </View>
  );
}
