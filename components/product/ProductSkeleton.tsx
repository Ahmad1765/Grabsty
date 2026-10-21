import { useEffect } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
} from 'react-native-reanimated';
import { useTheme } from '@/context/ThemeContext';
import { useProductDimensions } from '@/components/product/shared';

export function SkeletonBlock({
  width,
  height,
  radius = 8,
  style,
}: {
  width: number | string;
  height: number;
  radius?: number;
  style?: any;
}) {
  const { theme } = useTheme();
  const opacity = useSharedValue(0.5);
  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 700 }),
        withTiming(0.5, { duration: 700 }),
      ),
      -1,
      true,
    );
  }, [opacity]);
  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: theme.primarySoft,
        },
        animStyle,
        style,
      ]}
    />
  );
}

export function ProductSkeleton({
  insetsTop,
  placeholderImage,
}: {
  insetsTop: number;
  placeholderImage?: string;
}) {
  const { theme } = useTheme();
  // Same 4:5 height as the real hero so nothing jumps when data lands.
  const { imageHeight } = useProductDimensions();
  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Header (back button area) */}
      <View
        style={{
          paddingTop: insetsTop + 8,
          paddingHorizontal: 16,
          paddingBottom: 8,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <SkeletonBlock width={40} height={40} radius={20} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <SkeletonBlock width={40} height={40} radius={20} />
          <SkeletonBlock width={40} height={40} radius={20} />
        </View>
      </View>

      {/* Hero image */}
      {placeholderImage ? (
        <View style={{ width: '100%', height: imageHeight, marginTop: 4, overflow: 'hidden', backgroundColor: theme.panel }}>
          <Image
            source={{ uri: placeholderImage }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        </View>
      ) : (
        <SkeletonBlock
          width="100%"
          height={imageHeight}
          radius={0}
          style={{ marginTop: 4 }}
        />
      )}

      {/* Content block */}
      <View style={{ paddingHorizontal: 20, paddingTop: 22 }}>
        <SkeletonBlock width={80} height={14} radius={4} />
        <SkeletonBlock width="86%" height={22} radius={6} style={{ marginTop: 10 }} />
        <SkeletonBlock width="60%" height={22} radius={6} style={{ marginTop: 8 }} />

        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 20 }}>
          <SkeletonBlock width={120} height={34} radius={8} />
          <SkeletonBlock width={70} height={20} radius={4} style={{ marginLeft: 12 }} />
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: 24,
            paddingTop: 20,
            borderTopWidth: 1,
            borderTopColor: theme.primarySoft,
          }}
        >
          <SkeletonBlock width={44} height={44} radius={22} />
          <View style={{ marginLeft: 12, flex: 1 }}>
            <SkeletonBlock width="55%" height={14} radius={4} />
            <SkeletonBlock width="35%" height={11} radius={4} style={{ marginTop: 6 }} />
          </View>
        </View>
      </View>
    </View>
  );
}
