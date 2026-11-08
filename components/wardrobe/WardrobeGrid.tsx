import { memo, useCallback, useMemo } from 'react';
import { View, Pressable, useWindowDimensions } from 'react-native';
import { Text } from '@/lib/rnText';
import { Image } from 'expo-image';
import { FlashList } from '@shopify/flash-list';
import Feather from '@expo/vector-icons/Feather';
import { GRID_DRAW_DISTANCE } from '@/lib/responsive';
import { getOptimizedImageUrl, IMAGE_TRANSITION } from '@/lib/images';
import type { WardrobePost } from '@/lib/wardrobe';

import { useTheme } from '@/context/ThemeContext';
const COLUMNS = 2;
const GAP = 10;
const PAD = 20;

// Rows are the list item and numColumns stays 1 — the same shape the four
// listing grids use. `data` is WardrobePost[][], and each row renders the flex
// row the old wrapper produced, so the layout is pixel-identical: the wrapper's
// paddingHorizontal moved onto the row and its vertical `gap` became a
// marginBottom.
const rowKey = (row: WardrobePost[]) => row[0]?.id ?? 'empty';

export function WardrobeGrid({
  posts,
  onDelete,
  // The grid owns its own scroll now (a FlashList nested in a ScrollView can't
  // virtualize — it gets unbounded height and mounts every row), so the padding
  // the parent screen used to put on its ScrollView comes in as props.
  paddingTop = 0,
  paddingBottom = 0,
}: {
  posts: WardrobePost[];
  onDelete?: (id: string) => void;
  paddingTop?: number;
  paddingBottom?: number;
}) {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const tile = (Math.min(width, 560) - PAD * 2 - GAP) / COLUMNS;

  const rows = useMemo(() => {
    const out: WardrobePost[][] = [];
    for (let i = 0; i < posts.length; i += COLUMNS) out.push(posts.slice(i, i + COLUMNS));
    return out;
  }, [posts]);

  const renderRow = useCallback(
    ({ item }: { item: WardrobePost[] }) => (
      <WardrobeRow row={item} tile={tile} onDelete={onDelete} />
    ),
    [tile, onDelete],
  );

  if (posts.length === 0) {
    return (
      <View style={{ alignItems: 'center', paddingTop: paddingTop + 60, paddingBottom: 60 }}>
        <Feather name="image" size={28} color={theme.muteSoft} />
        <Text style={{ marginTop: 10, color: theme.mute }}>Nothing here yet</Text>
      </View>
    );
  }

  // The flex:1 wrapper is required, not cosmetic. This grid renders as one
  // sibling among several in the wardrobe screen's column (header, tabs, then
  // this), and a flex child with no flex style sizes to its CONTENT. An
  // unbounded-height list does not scroll and does not virtualize — it would
  // mount every tile, silently undoing the point of the FlashList. The screen's
  // other section wraps itself the same way.
  return (
    <View style={{ flex: 1 }}>
      <FlashList
        data={rows}
        renderItem={renderRow}
        keyExtractor={rowKey}
        drawDistance={GRID_DRAW_DISTANCE}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop, paddingBottom }}
      />
    </View>
  );
}

const WardrobeRow = memo(function WardrobeRow({
  row,
  tile,
  onDelete,
}: {
  row: WardrobePost[];
  tile: number;
  onDelete?: (id: string) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: GAP, paddingHorizontal: PAD, marginBottom: GAP }}>
      {row.map((p) => (
        <WardrobeTile key={p.id} post={p} tile={tile} onDelete={onDelete} />
      ))}
      {/* Keeps a short final row left-aligned instead of stretching its tile. */}
      {Array.from({ length: COLUMNS - row.length }).map((_, i) => (
        <View key={`pad-${i}`} style={{ width: tile }} />
      ))}
    </View>
  );
});

const WardrobeTile = memo(function WardrobeTile({
  post,
  tile,
  onDelete,
}: {
  post: WardrobePost;
  tile: number;
  onDelete?: (id: string) => void;
}) {
  const { theme } = useTheme();
  const handleDelete = useCallback(() => onDelete?.(post.id), [onDelete, post.id]);
  return (
    <View
      style={{
        width: tile,
        height: tile * 1.3,
        borderRadius: 14,
        overflow: 'hidden',
        backgroundColor: theme.surface,
      }}
    >
      <Image
        source={{ uri: getOptimizedImageUrl(post.image_url, { width: Math.round(tile * 1.5) }) }}
        style={{ width: '100%', height: '100%' }}
        contentFit="contain"
        cachePolicy="memory-disk"
        transition={IMAGE_TRANSITION}
        recyclingKey={post.id}
      />
      <View
        style={{
          position: 'absolute',
          bottom: 6,
          left: 6,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          backgroundColor: 'rgba(0,0,0,0.5)',
          borderRadius: 999,
          paddingHorizontal: 8,
          paddingVertical: 3,
        }}
      >
        <Feather name="heart" size={11} color="#fff" />
        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{post.likes_count}</Text>
      </View>
      {onDelete && (
        <Pressable
          onPress={handleDelete}
          hitSlop={8}
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            width: 26,
            height: 26,
            borderRadius: 999,
            backgroundColor: 'rgba(15,15,15,0.72)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name="trash-2" size={13} color="#fff" />
        </Pressable>
      )}
    </View>
  );
});
