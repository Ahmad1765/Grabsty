import { View, Pressable } from 'react-native';
import { Text } from '@/lib/rnText';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { getOptimizedImageUrl, cardImageUrl } from '@/lib/images';
import { formatPrice } from '@/lib/currency';
import { priceBreakdown } from '@/lib/fees';
import { ShieldCheckIcon } from '@/components/ui/ShieldCheckIcon';
import { ListingCard } from '@/components/ListingCard';
import { useFittedCardWidth } from '@/lib/responsive';
import { CardGrid } from '@/components/ui/CardGrid';
import type { Listing } from '@/types';
import { useTheme } from '@/context/ThemeContext';
import { BundleProgressBar } from './BundleProgressBar';
import {
  BRAND_PURPLE,
  CARD_OUTER_PAD,
  CARD_GAP,
  useProductDimensions,
  conditionLabel,
} from './shared';

export function BundleSection({
  listing,
  sellerItems,
  selectedIds,
  bundlesEnabled = false,
  onToggle,
  onSelectAll,
  onClearAll,
  onBuyBundle,
  onSendBundleOffer,
}: {
  listing: Listing;
  sellerItems: Listing[];
  selectedIds: Set<string>;
  bundlesEnabled?: boolean;
  onToggle: (id: string) => void;
  onSelectAll?: () => void;
  onClearAll?: () => void;
  onBuyBundle: (total: number, selectedIds: string[]) => void;
  onSendBundleOffer: (totalAfterDiscount: number, selectedIds: string[]) => void;
}) {
  const { theme } = useTheme();
  const { cardWidth: estimatedCardWidth, columns } = useProductDimensions();
  // All four grids below span the same width, so one measurement sizes them.
  const { cardWidth, onLayout: onGridLayout, ref: gridRef } = useFittedCardWidth(estimatedCardWidth, {
    horizontalPadding: CARD_OUTER_PAD,
    gap: CARD_GAP,
    columns,
  });
  const username = listing.seller.username;
  const isSold = listing.is_sold;

  // Ensure sold items never appear in the bundle offers
  const activeSellerItems = sellerItems.filter((s) => !s.is_sold);

  // If the current listing is already sold, bundling is unavailable — show other available items to browse cleanly
  if (isSold) {
    return (
      <View style={{ paddingTop: 18 }}>
        {activeSellerItems.length === 0 ? (
          <View>
            <CardGrid
              gridRef={gridRef}
              onLayout={onGridLayout}
              columns={columns}
              cardWidth={cardWidth}
              padding={CARD_OUTER_PAD}
              gap={CARD_GAP}
              rowGap={16}
            >
              <View style={{ width: cardWidth }}>
                <ListingCard listing={listing} width={cardWidth} />
              </View>
            </CardGrid>
            <View style={{ paddingHorizontal: 20, paddingVertical: 18, alignItems: 'center' }}>
              <Feather name="package" size={20} color={theme.mute} />
              <Text
                style={{
                  fontSize: 13,
                  color: theme.mute,
                  marginTop: 6,
                  textAlign: 'center',
                  lineHeight: 19,
                }}
              >
                @{username} has no other available items right now.
              </Text>
            </View>
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
            {activeSellerItems.map((item) => (
              <View key={item.id} style={{ width: cardWidth }}>
                <ListingCard listing={item} width={cardWidth} />
              </View>
            ))}
          </CardGrid>
        )}
      </View>
    );
  }

  return (
    <View style={{ paddingTop: 18 }}>
      {/* Bundle Progress Banner (only when bundle discounts are enabled) */}
      {bundlesEnabled && (
        <View style={{ marginBottom: 18 }}>
          <BundleProgressBar
            listing={listing}
            sellerItems={activeSellerItems}
            selectedIds={selectedIds}
          />
        </View>
      )}

      {/* Selectable seller items grid */}
      {activeSellerItems.length === 0 ? (
        <View>
          <CardGrid
            gridRef={gridRef}
            onLayout={onGridLayout}
            columns={columns}
            cardWidth={cardWidth}
            padding={CARD_OUTER_PAD}
            gap={CARD_GAP}
            rowGap={16}
          >
            {/* The item being viewed is the seller's available listing */}
            <BaseItemCard item={listing} width={cardWidth} />
          </CardGrid>
          <View style={{ paddingHorizontal: 20, paddingVertical: 18, alignItems: 'center' }}>
            <Feather name="package" size={20} color={theme.mute} />
            <Text
              style={{
                fontSize: 13,
                color: theme.mute,
                marginTop: 6,
                textAlign: 'center',
                lineHeight: 19,
              }}
            >
              @{username} has no other available items right now.{'\n'}Follow them to catch their next drop.
            </Text>
          </View>
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
          {/* The item being viewed is always part of the bundle — pin it first */}
          <BaseItemCard item={listing} width={cardWidth} />
          {activeSellerItems.map((item) => {
            const isSelected = selectedIds.has(item.id);
            return (
              <BundleSelectCard
                key={item.id}
                item={item}
                width={cardWidth}
                selected={isSelected}
                onToggle={() => onToggle(item.id)}
                onOpen={() => router.push(`/product/${item.id}`)}
              />
            );
          })}
        </CardGrid>
      )}
    </View>
  );
}

function BaseItemCard({ item, width: cardWidth }: { item: Listing; width: number }) {
  const { theme } = useTheme();
  const cardImageHeight = Math.round(cardWidth * 1.25);
  const meta = [item.size, conditionLabel(item.condition)].filter(Boolean).join(' · ');
  const itemPrice = Number(item.price ?? 0);
  const { total: totalPrice } = priceBreakdown(itemPrice);

  return (
    <View style={{ width: cardWidth, marginBottom: 4 }}>
      <View
        style={{
          width: cardWidth,
          height: cardImageHeight,
          borderRadius: 14,
          overflow: 'hidden',
          backgroundColor: theme.panel,
          borderWidth: 2,
          borderColor: BRAND_PURPLE,
        }}
      >
        {cardImageUrl(item, 0) ? (
          <Image
            source={{ uri: getOptimizedImageUrl(cardImageUrl(item, 0), { width: 500 }) }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : null}
        <View
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingHorizontal: 9,
            height: 26,
            borderRadius: 13,
            backgroundColor: BRAND_PURPLE,
          }}
        >
          <Feather name="check" size={12} color="white" />
          <Text style={{ fontSize: 11, fontWeight: '800', color: 'white', letterSpacing: 0.2 }}>
            This item
          </Text>
        </View>
      </View>

      <View style={{ marginTop: 6, width: '100%' }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: theme.ink }} numberOfLines={1}>
          {item.brand || item.title}
        </Text>
        {!!meta && (
          <Text style={{ fontSize: 11, color: theme.mute, marginTop: 2 }} numberOfLines={1}>
            {meta}
          </Text>
        )}
        <Text style={{ fontSize: 11, color: theme.mute, marginTop: 4 }}>
          {formatPrice(itemPrice, { whole: true })}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 3 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: theme.ink }}>
            {formatPrice(totalPrice, { whole: true })} incl.
          </Text>
          <ShieldCheckIcon size={13} />
        </View>
      </View>
    </View>
  );
}

function BundleSelectCard({
  item,
  width: cardWidth,
  selected,
  onToggle,
  onOpen,
}: {
  item: Listing;
  width: number;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const { theme } = useTheme();
  const cardImageHeight = Math.round(cardWidth * 1.25);
  const meta = [item.size, conditionLabel(item.condition)].filter(Boolean).join(' · ');
  const itemPrice = Number(item.price ?? 0);
  const { total: totalPrice } = priceBreakdown(itemPrice);

  return (
    <View style={{ width: cardWidth, marginBottom: 4 }}>
      <View
        style={{
          width: cardWidth,
          height: cardImageHeight,
          borderRadius: 14,
          overflow: 'hidden',
          backgroundColor: theme.panel,
          borderWidth: 2,
          borderColor: selected ? BRAND_PURPLE : 'transparent',
          position: 'relative',
        }}
      >
        <Pressable
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityState={{ selected }}
          accessibilityLabel={`${selected ? 'Remove' : 'Add'} ${item.brand || item.title} ${selected ? 'from' : 'to'} bundle`}
          style={({ pressed }) => ({
            width: '100%',
            height: '100%',
            transform: [{ scale: pressed ? 0.98 : 1 }],
          })}
        >
          {cardImageUrl(item, 0) ? (
            <Image
              source={{ uri: getOptimizedImageUrl(cardImageUrl(item, 0), { width: 500 }) }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          ) : null}
          {selected ? (
            <View
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                backgroundColor: 'rgba(108,71,255,0.12)',
              }}
            />
          ) : null}
        </Pressable>

        <Pressable
          onPress={onOpen}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Open ${item.brand || item.title}`}
          style={({ pressed }) => ({
            position: 'absolute',
            top: 8,
            left: 8,
            width: 30,
            height: 30,
            borderRadius: 15,
            backgroundColor: theme.surface,
            borderWidth: 1,
            borderColor: theme.border,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.7 : 1,
            zIndex: 10,
          })}
        >
          <Feather name="maximize-2" size={13} color={theme.ink} />
        </Pressable>

        <Pressable
          onPress={onToggle}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`${selected ? 'Remove' : 'Add'} ${item.brand || item.title}`}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 30,
            height: 30,
            borderRadius: 15,
            backgroundColor: selected ? BRAND_PURPLE : theme.surface,
            borderWidth: selected ? 0 : 1,
            borderColor: theme.border,
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
          }}
        >
          <Feather name={selected ? 'check' : 'plus'} size={16} color={selected ? 'white' : theme.ink} />
        </Pressable>
      </View>

      <View style={{ marginTop: 6, width: '100%' }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: theme.ink }} numberOfLines={1}>
          {item.brand || item.title}
        </Text>
        {!!meta && (
          <Text style={{ fontSize: 11, color: theme.mute, marginTop: 2 }} numberOfLines={1}>
            {meta}
          </Text>
        )}
        <Text style={{ fontSize: 11, color: theme.mute, marginTop: 4 }}>
          {formatPrice(itemPrice, { whole: true })}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 3 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: theme.ink }}>
            {formatPrice(totalPrice, { whole: true })} incl.
          </Text>
          <ShieldCheckIcon size={13} />
        </View>
      </View>
    </View>
  );
}
