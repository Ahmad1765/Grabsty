import { View } from 'react-native';
import { Text } from '@/lib/rnText';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import { getOptimizedImageUrl, thumbWidthFor, IMAGE_TRANSITION } from '@/lib/images';

import { useTheme } from '@/context/ThemeContext';
type Props = {
  uri?: string | null;
  size?: number;
  ring?: 'purple' | 'none' | 'pink';
  initial?: string;
};

export function StoryAvatar({ uri, size = 56, ring = 'purple', initial }: Props) {
  const { theme: colors } = useTheme();
  const innerSize = ring === 'none' ? size : size - 6;
  const optimizedUri = uri ? getOptimizedImageUrl(uri, { width: thumbWidthFor(innerSize) }) : null;
  const inner = (
    <View
      style={{
        width: innerSize,
        height: innerSize,
        borderRadius: innerSize / 2,
        backgroundColor: colors.purpleSoft,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {optimizedUri ? (
        <Image
          source={{ uri: optimizedUri }}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={IMAGE_TRANSITION}
          accessible={true}
          accessibilityLabel="Profile picture"
        />
      ) : (
        <View accessible={true} accessibilityLabel="Profile picture" style={{ alignItems: 'center', justifyContent: 'center' }}>
          {initial ? (
            <Text style={{ fontSize: innerSize * 0.4, fontWeight: '800', color: colors.purple }}>
              {initial.charAt(0).toUpperCase()}
            </Text>
          ) : (
            <Feather name="user" size={innerSize * 0.42} color={colors.muteSoft} />
          )}
        </View>
      )}
    </View>
  );

  if (ring === 'none') return inner;

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 2,
        borderColor: ring === 'pink' ? colors.pink : colors.purple,
        padding: 1,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {inner}
    </View>
  );
}
