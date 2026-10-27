import { memo } from 'react';
import { View, Pressable } from 'react-native';
import { Text } from '@/lib/rnText';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import {
  cardImageUrl,
  getOptimizedImageUrl,
  thumbWidthFor,
  IMAGE_TRANSITION,
  setImagePlaceholder,
} from '@/lib/images';
import { putCachedListing } from '@/lib/listingCache';
import type { PriceDropListing } from '@/lib/myFeed';
import { formatPrice as formatMoney } from '@/lib/currency';

import { useTheme } from '@/context/ThemeContext';
interface Props {
  listing: PriceDropListing;
  width?: number;
}

function formatPrice(value: unknown): string {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? formatMoney(n, { whole: true }) : 'N/A';
}

export const PriceDropCard = memo(function PriceDropCard({ listing, width = 130 }: Props) {
  const { theme } = useTheme();
  const src = getOptimizedImageUrl(cardImageUrl(listing, 0), { width: thumbWidthFor(width) });
  // Clamp negative pct to 0: if new_price > old_price (price went up) the
  // render guard `pct > 0` will hide the discount badge anyway, but the
  // clamp keeps the math honest for any future consumers of `pct`.
  const pct =
    listing.old_price > 0
      ? Math.max(
          0,
          Math.round(((listing.old_price - listing.new_price) / listing.old_price) * 100),
        )
      : 0;
  return (
    <Pressable
      onPress={() => {
        putCachedListing(listing);
        setImagePlaceholder(listing.id, src);
        router.push({
          pathname: `/product/${listing.id}`,
          params: { initialImage: src },
        } as any);
      }}
      style={{ width }}
      accessibilityRole="button"
      accessibilityLabel={`${listing.title}, price dropped to ${formatPrice(listing.new_price)}`}
    >
      <View
        style={{
          width,
          aspectRatio: 1,
          backgroundColor: theme.surface,
          borderRadius: 12,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <Image
          source={{ uri: src }}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={IMAGE_TRANSITION}
        />
        {pct > 0 ? (
          <View
            style={{
              position: 'absolute',
              top: 6,
              right: 6,
              backgroundColor: '#6C47FF',
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: 6,
            }}
          >
            <Text style={{ color: 'white', fontSize: 10, fontWeight: '800' }}>−{pct}%</Text>
          </View>
        ) : null}
      </View>
      <Text
        numberOfLines={1}
        style={{ marginTop: 6, fontSize: 12.5, fontWeight: '600', color: theme.ink }}
      >
        {listing.title}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 6 }}>
        <Text
          style={{
            fontSize: 11.5,
            color: theme.mute,
            textDecorationLine: 'line-through',
          }}
        >
          {formatPrice(listing.old_price)}
        </Text>
        <Text style={{ fontSize: 13, fontWeight: '800', color: '#6C47FF' }}>
          {formatPrice(listing.new_price)}
        </Text>
      </View>
    </Pressable>
  );
});
