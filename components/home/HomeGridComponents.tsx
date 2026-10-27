// ─────────────────────────────────────────────────────────────────────────────
// HOME GRID COMPONENTS (PRESENTATIONAL & VIRTUALIZATION)
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Chunked Row Virtualization
// Instead of rendering un-virtualized columns or passing individual cards to
// FlashList, `GridRow` renders a balanced horizontal row of cards. This prevents
// horizontal measurement recalculations on the layout thread.
// ─────────────────────────────────────────────────────────────────────────────

import { memo } from 'react';
import { View } from 'react-native';
import { Text } from '@/lib/rnText';
import { colors } from '@/lib/theme';
import { ListingCard } from '@/components/ListingCard';
import type { Listing } from '@/types';

const HORIZONTAL_PAD = 12;
const GRID_GAP = 8;

type GridRowProps = {
  row: Listing[];
  columns: number;
  cardWidth: number;
};

export const GridRow = memo(function GridRow({
  row,
  columns,
  cardWidth,
}: GridRowProps) {
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: GRID_GAP,
        paddingHorizontal: HORIZONTAL_PAD,
        marginBottom: GRID_GAP,
      }}
    >
      {row.map((listing) => (
        <View key={listing.id} style={{ width: cardWidth }}>
          <ListingCard listing={listing} width={cardWidth} />
        </View>
      ))}
      {row.length < columns &&
        Array.from({ length: columns - row.length }).map((_, i) => (
          <View key={`pad-${i}`} style={{ width: cardWidth }} />
        ))}
    </View>
  );
});

type GridPlaceholderProps = {
  loading: boolean;
  columns: number;
  cardWidth: number;
  emptyText?: string;
};

export const GridPlaceholder = memo(function GridPlaceholder({
  loading,
  columns,
  cardWidth,
  emptyText,
}: GridPlaceholderProps) {
  if (loading) {
    return (
      <View style={{ paddingHorizontal: HORIZONTAL_PAD, flexDirection: 'row', gap: GRID_GAP }}>
        {Array.from({ length: columns }).map((_, i) => (
          <View
            key={i}
            style={{
              width: cardWidth,
              aspectRatio: 1 / 1.33, // ListingCard image ratio
              borderRadius: 12,
              backgroundColor: 'rgba(15,15,15,0.06)',
            }}
          />
        ))}
      </View>
    );
  }
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 40, alignItems: 'center' }}>
      <Text style={{ fontSize: 13, color: colors.muteSoft, textAlign: 'center' }}>
        {emptyText ?? 'Nothing matches this feed yet.'}
      </Text>
    </View>
  );
});
