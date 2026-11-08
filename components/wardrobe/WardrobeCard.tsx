import { View } from 'react-native';
import { Text } from '@/lib/rnText';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import { getOptimizedImageUrl, IMAGE_TRANSITION } from '@/lib/images';
import type { WardrobePost } from '@/lib/wardrobe';

import { useTheme } from '@/context/ThemeContext';
export function WardrobeCard({ post }: { post: WardrobePost }) {
  const { theme } = useTheme();
  const optimizedSrc = getOptimizedImageUrl(post.image_url, { width: 600 });
  return (
    <View style={{ flex: 1, borderRadius: 24, overflow: 'hidden', backgroundColor: theme.surface }}>
      <Image
        source={{ uri: optimizedSrc }}
        style={{ width: '100%', height: '100%' }}
        contentFit="contain"
        cachePolicy="memory-disk"
        transition={IMAGE_TRANSITION}
      />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 18, backgroundColor: 'rgba(0,0,0,0.28)' }}>
        {!!post.author?.username && (
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>@{post.author.username}</Text>
        )}
        {!!post.caption && (
          <Text numberOfLines={2} style={{ color: 'rgba(255,255,255,0.92)', marginTop: 3, fontSize: 14 }}>{post.caption}</Text>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 }}>
          <Feather name="heart" size={14} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{post.likes_count}</Text>
        </View>
      </View>
    </View>
  );
}
