// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT RELATED SECTION (PRESENTATIONAL)
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Tabbed Content Switcher & Related Discovery
// Encapsulates the multi-item bundle builder tab and the collaborative filtering
// similar items tab into a single memoized component.
// ─────────────────────────────────────────────────────────────────────────────

import { memo } from 'react';
import { View, Pressable, type LayoutChangeEvent } from 'react-native';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/context/ThemeContext';
import { BundleSection } from '@/components/product/BundleSection';
import { ListingCard } from '@/components/ListingCard';
import { useFittedCardWidth } from '@/lib/responsive';
import { CardGrid } from '@/components/ui/CardGrid';
import {
  CARD_GAP,
  CARD_OUTER_PAD,
  useProductDimensions,
  tap,
} from '@/components/product/shared';

import type { Listing } from '@/types';

type ProductRelatedSectionProps = {
  listing: Listing;
  relatedTab: 'members' | 'similar';
  sellerItems: Listing[];
  similarItems: Listing[];
  selectedBundleIds: Set<string>;
  /** When false the bundle/seller's-items tab is hidden. */
  bundlesEnabled?: boolean;
  onTabChange: (tab: 'members' | 'similar') => void;
  onToggleBundleItem: (id: string) => void;
  onSelectAllBundle: () => void;
  onClearAllBundle: () => void;
  onBuyBundle: (total: number, selectedIds: string[]) => void;
  onSendBundleOffer: (amount: number, selectedIds: string[]) => void;
  onLayout?: (event: LayoutChangeEvent) => void;
};

export const ProductRelatedSection = memo(function ProductRelatedSection({
  listing,
  relatedTab,
  sellerItems,
  similarItems,
  selectedBundleIds,
  bundlesEnabled = false,
  onTabChange,
  onToggleBundleItem,
  onSelectAllBundle,
  onClearAllBundle,
  onBuyBundle,
  onSendBundleOffer,
  onLayout,
}: ProductRelatedSectionProps) {
  const { theme } = useTheme();
  const { cardWidth: estimatedCardWidth, columns } = useProductDimensions();
  const { cardWidth, onLayout: onGridLayout, ref: gridRef } = useFittedCardWidth(estimatedCardWidth, {
    horizontalPadding: CARD_OUTER_PAD,
    gap: CARD_GAP,
    columns,
  });

  const effectiveTab = relatedTab;

  return (
    <View style={{ marginTop: 22 }} onLayout={onLayout}>
      {/* Tab Pills: Always display both Seller's items and Similar items buttons */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 4 }}>
        {(['members', 'similar'] as const).map((tab) => {
          const active = effectiveTab === tab;
          return (
            <Pressable
              key={tab}
              onPress={() => {
                tap('selection');
                onTabChange(tab);
              }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 16,
                paddingVertical: 9,
                borderRadius: 999,
                backgroundColor: active ? theme.selected : theme.paper,
                borderWidth: 1,
                borderColor: theme.border,
                transform: [{ scale: pressed ? 0.96 : 1 }],
              })}
            >
              <Feather
                name={tab === 'members' ? 'user' : 'grid'}
                size={13}
                color={theme.ink}
                style={{ marginRight: 6 }}
              />
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: theme.ink,
                }}
              >
                {tab === 'members' ? "Seller's items" : 'Similar items'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Tab Contents */}
      {effectiveTab === 'members' ? (
        <BundleSection
          listing={listing}
          sellerItems={sellerItems}
          selectedIds={selectedBundleIds}
          bundlesEnabled={bundlesEnabled}
          onToggle={onToggleBundleItem}
          onSelectAll={onSelectAllBundle}
          onClearAll={onClearAllBundle}
          onBuyBundle={onBuyBundle}
          onSendBundleOffer={onSendBundleOffer}
        />
      ) : (
        <View style={{ paddingTop: 18 }}>
          {similarItems.length === 0 ? (
            <View style={{ paddingHorizontal: 20, paddingVertical: 14 }}>
              <Text style={{ fontSize: 13, color: theme.mute }}>
                No similar items found yet — check back soon.
              </Text>
            </View>
          ) : (
            <CardGrid
              gridRef={gridRef}
              onLayout={onGridLayout}
              columns={columns}
              cardWidth={cardWidth}
              padding={CARD_OUTER_PAD}
              gap={CARD_GAP}
              rowGap={16}
            >
              {similarItems.map((item) => (
                <ListingCard key={item.id} listing={item} width={cardWidth} />
              ))}
            </CardGrid>
          )}
        </View>
      )}
    </View>
  );
});

