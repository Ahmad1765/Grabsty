import { Children, isValidElement, type ReactNode, type RefObject } from 'react';
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Card grid built from explicit rows of `columns` cards, never `flexWrap`.
 *
 * A wrap grid decides line breaks from widths: if `columns * cardWidth + gaps`
 * comes out even a sub-pixel wider than the row (Android pixel rounding, a
 * scrollbar, a first frame sized from the window before onLayout lands), the
 * last card wraps and the grid drops to one column. Fixed rows can't do that;
 * the worst case is a card overhanging the side padding by a pixel.
 */
export function CardGrid({
  columns,
  cardWidth,
  padding = 0,
  gap = 0,
  rowGap = gap,
  onLayout,
  gridRef,
  style,
  children,
}: {
  columns: number;
  cardWidth: number;
  padding?: number;
  gap?: number;
  rowGap?: number;
  onLayout?: (e: LayoutChangeEvent) => void;
  gridRef?: RefObject<View | null>;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const cards = Children.toArray(children);
  const cols = Math.max(1, columns);
  const rows: ReactNode[][] = [];
  for (let i = 0; i < cards.length; i += cols) rows.push(cards.slice(i, i + cols));

  return (
    <View ref={gridRef} onLayout={onLayout} style={[{ paddingHorizontal: padding, rowGap }, style]}>
      {rows.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row', gap }}>
          {row.map((card, c) => (
            <View key={(isValidElement(card) && card.key) || c} style={{ width: cardWidth }}>
              {card}
            </View>
          ))}
          {/* Empty slots keep the last row's cards at full card width. */}
          {Array.from({ length: cols - row.length }, (_, i) => (
            <View key={`pad-${i}`} style={{ width: cardWidth }} />
          ))}
        </View>
      ))}
    </View>
  );
}
