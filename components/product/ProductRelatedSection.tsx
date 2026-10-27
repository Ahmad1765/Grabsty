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
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/context/ThemeContext';
import { BundleSection } from '@/components/product/BundleSection';
import { ListingCard } from '@/components/ListingCard';
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
  const { cardWidth } = useProductDimensions();

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
              <Ionicons
                name={tab === 'members' ? 'person' : 'sparkles'}
                size={13}
                color={theme.ink}
                style={{ marginRight: 6 }}
              />
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '700',
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
            <View
              style={{
                width: '100%',
                flexDirection: 'row',
                flexWrap: 'wrap',
                paddingHorizontal: CARD_OUTER_PAD,
                columnGap: CARD_GAP,
                rowGap: 16,
              }}
            >
              {similarItems.map((item) => (
                <View key={item.id} style={{ width: cardWidth }}>
                  <ListingCard listing={item} width={cardWidth} />
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
});

