// app/(tabs)/wardrobe.tsx — Swipe / My Wardrobe / Liked.
import { useMemo, useState, useCallback } from 'react';
import { View, Pressable } from 'react-native';
import { Text } from '@/lib/rnText';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { RequireAuth } from '@/components/RequireAuth';
import { useAuth } from '@/lib/auth';
import { Tabs } from '@/components/ui/Tabs';
import { SwipeDeck } from '@/components/wardrobe/SwipeDeck';
import { WardrobeGrid } from '@/components/wardrobe/WardrobeGrid';
import { filterUnseen } from '@/lib/wardrobe/deckState';
import type { WardrobePost, SwipeDirection } from '@/lib/wardrobe';
import {
  useWardrobeDeckQuery, useMyWardrobeQuery, useLikedWardrobeQuery,
  useRecordSwipe, useDeleteWardrobePost,
} from '@/lib/queries';
import { useToast } from '@/lib/toast';
import { useTabBarClearance } from '@/lib/responsive';

import { useTheme } from '@/context/ThemeContext';
type Section = 'swipe' | 'mine' | 'liked';

// Stable empty reference so a pending query doesn't hand the grid a new array
// (and re-chunk its rows) on every render.
const EMPTY_POSTS: WardrobePost[] = [];

function WardrobeInner() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const [section, setSection] = useState<Section>('swipe');
  const [swiped, setSwiped] = useState<Set<string>>(new Set());

  const deck = useWardrobeDeckQuery(uid);
  const mine = useMyWardrobeQuery(uid);
  const liked = useLikedWardrobeQuery(uid);
  const recordSwipe = useRecordSwipe(uid);
  const deletePost = useDeleteWardrobePost(uid);
  const toast = useToast();
  // AnimatedTabBar floats over screen content and reserves no layout space, so
  // every section here has to pad its own bottom or the bar covers the last
  // grid row / the bottom of the swipe deck.
  const tabBarClearance = useTabBarClearance();

  // Cards not yet swiped in this session (deck refetch may lag the optimistic pop).
  const cards = useMemo(
    () => filterUnseen(deck.data ?? [], swiped),
    [deck.data, swiped],
  );

  const onSwipe = useCallback((post: WardrobePost, dir: SwipeDirection) => {
    setSwiped((prev) => new Set(prev).add(post.id));
    recordSwipe.mutate(
      { postId: post.id, direction: dir },
      {
        onError: () => {
          setSwiped((prev) => {
            const next = new Set(prev);
            next.delete(post.id);
            return next;
          });
          toast.show('Could not save your swipe', { variant: 'info' });
        },
      },
    );
  }, [recordSwipe, toast]);

  const refetchDeck = deck.refetch;
  const onNeedMore = useCallback(() => { refetchDeck(); }, [refetchDeck]);

  // Stable identity so WardrobeGrid's memoized rows/tiles don't all re-render
  // whenever this screen does.
  const handleDelete = useCallback((id: string) => { deletePost.mutate(id); }, [deletePost]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.background }}>
      <View className="flex-row items-center justify-between px-5 pt-2 pb-3">
        <Text style={{ fontSize: 26, fontWeight: '800', letterSpacing: -0.5 }}>Wardrobe</Text>
        <Pressable onPress={() => router.push('/wardrobe/new')} hitSlop={10} style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: '#6C47FF', alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="plus" size={20} color="#fff" />
        </Pressable>
      </View>

      <Tabs
        variant="underline"
        value={section}
        onChange={(v) => setSection(v as Section)}
        tabs={[
          { value: 'swipe', label: 'Swipe' },
          { value: 'mine', label: 'My Wardrobe' },
          { value: 'liked', label: 'Liked' },
        ]}
      />

      {section === 'swipe' && (
        <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 20, paddingBottom: tabBarClearance }}>
          {cards.length > 0 ? (
            <SwipeDeck posts={cards} onSwipe={onSwipe} onNeedMore={onNeedMore} />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="check-circle" size={30} color={theme.muteSoft} />
              <Text style={{ marginTop: 10, color: theme.mute }}>
                {deck.isLoading ? 'Loading outfits…' : "You're all caught up"}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* No ScrollView wrapper — WardrobeGrid is a FlashList and owns its own
          scroll. Nesting it in a ScrollView gives it unbounded height, which
          silently defeats virtualization and mounts every tile. The padding
          that used to live on the ScrollView is passed down instead. */}
      {section === 'mine' && (
        <WardrobeGrid
          posts={mine.data ?? EMPTY_POSTS}
          onDelete={handleDelete}
          paddingTop={16}
          paddingBottom={tabBarClearance}
        />
      )}

      {section === 'liked' && (
        <WardrobeGrid
          posts={liked.data ?? EMPTY_POSTS}
          paddingTop={16}
          paddingBottom={tabBarClearance}
        />
      )}
    </SafeAreaView>
  );
}

export default function WardrobeScreen() {
  return (
    <RequireAuth>
      <WardrobeInner />
    </RequireAuth>
  );
}
