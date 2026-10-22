// components/wardrobe/SwipeDeck.tsx
// Custom Tinder-style deck. The top card follows a horizontal pan; releasing
// past a threshold (or with enough velocity) flings it off and reports a swipe.
// Renders up to 3 stacked cards for depth. Works on web + native (RNGH+reanimated).
import { useEffect } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming, runOnJS, interpolate, Extrapolation,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import type { WardrobePost, SwipeDirection } from '@/lib/wardrobe';
import { needsMore } from '@/lib/wardrobe/deckState';
import { WardrobeCard } from './WardrobeCard';

const SWIPE_OUT = 480;

export function SwipeDeck({
  posts,
  onSwipe,
  onNeedMore,
}: {
  posts: WardrobePost[];
  onSwipe: (post: WardrobePost, dir: SwipeDirection) => void;
  onNeedMore: () => void;
}) {
  const { width } = useWindowDimensions();
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);

  const top = posts[0];
  const under = posts.slice(1, 3);

  useEffect(() => {
    if (needsMore(posts.length)) onNeedMore();
  }, [posts.length, onNeedMore]);

  const commit = (dir: SwipeDirection) => {
    const post = top;
    tx.value = 0; ty.value = 0; // reset for the next card
    if (post) onSwipe(post, dir);
  };

  const pan = Gesture.Pan()
    .onUpdate((e) => { tx.value = e.translationX; ty.value = e.translationY; })
    .onEnd((e) => {
      const past = Math.abs(tx.value) > width * 0.28 || Math.abs(e.velocityX) > 800;
      if (past) {
        const dir: SwipeDirection = tx.value > 0 ? 'like' : 'pass';
        tx.value = withTiming(Math.sign(tx.value) * SWIPE_OUT, { duration: 180 }, (done) => {
          if (done) runOnJS(commit)(dir);
        });
      } else {
        tx.value = withSpring(0); ty.value = withSpring(0);
      }
    });

  const topStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { rotate: `${interpolate(tx.value, [-width, width], [-12, 12], Extrapolation.CLAMP)}deg` },
    ],
  }));
  const likeStyle = useAnimatedStyle(() => ({ opacity: interpolate(tx.value, [0, width * 0.25], [0, 1], Extrapolation.CLAMP) }));
  const passStyle = useAnimatedStyle(() => ({ opacity: interpolate(tx.value, [0, -width * 0.25], [0, 1], Extrapolation.CLAMP) }));

  if (!top) return null;

  return (
    <View style={{ flex: 1 }}>
      {under.reverse().map((p, i) => (
        <Animated.View
          key={p.id}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, transform: [{ scale: 0.94 + i * 0.03 }, { translateY: -(i + 1) * 8 }] }}
        >
          <WardrobeCard post={p} />
        </Animated.View>
      ))}
      <GestureDetector gesture={pan}>
        <Animated.View style={[{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }, topStyle]}>
          <WardrobeCard post={top} />
          <Animated.View style={[{ position: 'absolute', top: 24, left: 20, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 10, borderWidth: 3, borderColor: '#6C47FF', transform: [{ rotate: '-14deg' }] }, likeStyle]}>
            <Animated.Text style={{ color: '#6C47FF', fontFamily: 'Inter_700Bold', fontWeight: '900', fontSize: 22 }}>LIKE</Animated.Text>
          </Animated.View>
          <Animated.View style={[{ position: 'absolute', top: 24, right: 20, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 10, borderWidth: 3, borderColor: '#EF4444', transform: [{ rotate: '14deg' }] }, passStyle]}>
            <Animated.Text style={{ color: '#EF4444', fontFamily: 'Inter_700Bold', fontWeight: '900', fontSize: 22 }}>PASS</Animated.Text>
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
