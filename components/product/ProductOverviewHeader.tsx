// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT OVERVIEW HEADER (PRESENTATIONAL)
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Clean Title, Meta & Price Hierarchy
// Renders the product title, like counts, category/brand metadata, price and
// buyer protection fee badge directly beneath the hero image.
// ─────────────────────────────────────────────────────────────────────────────

import { memo, useMemo } from 'react';
import { View, Pressable } from 'react-native';
import { Text } from '@/lib/rnText';
import { router } from 'expo-router';

import { ShieldCheckIcon } from '@/components/ui/ShieldCheckIcon';
import { useTheme } from '@/context/ThemeContext';
import { formatPrice } from '@/lib/currency';
import { categoryLabel } from '@/lib/categories';
import {
  BRAND_PURPLE,
  conditionLabel,
  tap,
  timeAgo,
} from '@/components/product/shared';
import type { Listing, ListingLiker } from '@/types';



type ProductOverviewHeaderProps = {
  listing: Listing;
  bpFee: number;
  onOpenBpSheet: () => void;
  hasBundleItems?: boolean;
  onScrollToBundle?: () => void;
  likers?: ListingLiker[];
  onOpenLikersSheet?: () => void;
};

export const ProductOverviewHeader = memo(function ProductOverviewHeader({
  listing,
  bpFee,
  onOpenBpSheet,
  likers,
  onOpenLikersSheet,
}: ProductOverviewHeaderProps) {
  const { theme } = useTheme();
  const heartCount = Math.max(0, Number(listing.likes ?? 0), likers?.length ?? 0);
  const itemPrice = Number(listing.price ?? 0);

  // Metadata segments (only non-empty values)
  const metaSegments = useMemo(() => {
    const cond = conditionLabel(listing.condition);
    const sizeVal = listing.size?.trim();
    const brandVal = listing.brand?.trim();
    const catVal = listing.category ? categoryLabel(listing.category) : '';
    const locationVal = listing.seller?.location?.trim();

    return [
      catVal ? { text: catVal, link: true, isCategory: true, categoryKey: listing.category } : null,
      sizeVal ? { text: `Size ${sizeVal}` } : null,
      cond ? { text: cond } : null,
      brandVal ? { text: brandVal, link: true, isCategory: false } : null,
      locationVal ? { text: locationVal } : null,
    ].filter(Boolean) as { text: string; link?: boolean; isCategory?: boolean; categoryKey?: string }[];
  }, [listing.category, listing.size, listing.condition, listing.brand, listing.seller?.location]);
  // Outside the memo: a relative time must re-render, not freeze at first paint.
  const uploaded = listing.created_at ? timeAgo(listing.created_at) : '';
  const segments = uploaded ? [...metaSegments, { text: `Uploaded ${uploaded}` }] : metaSegments;

  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 22, paddingBottom: 14 }}>
      {heartCount > 0 && (
        <Pressable
          onPress={() => {
            tap('light');
            onOpenLikersSheet?.();
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="View who liked this item"
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: 8,
            alignSelf: 'flex-start',
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text
            style={{
              fontSize: 13,
              color: theme.mute,
            }}
          >
            Liked by{' '}
            {likers && likers.length > 0 ? (
              likers.length === 1 ? (
                <Text style={{ fontWeight: '700', color: theme.ink }}>
                  @{likers[0].username}
                </Text>
              ) : likers.length === 2 ? (
                <>
                  <Text style={{ fontWeight: '700', color: theme.ink }}>
                    @{likers[0].username}
                  </Text>
                  {' and '}
                  <Text style={{ fontWeight: '700', color: theme.ink }}>
                    @{likers[1].username}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={{ fontWeight: '700', color: theme.ink }}>
                    @{likers[0].username}
                  </Text>
                  {` and ${heartCount > 1 ? heartCount - 1 : likers.length - 1} others`}
                </>
              )
            ) : (
              <Text style={{ fontWeight: '700', color: theme.ink }}>
                {heartCount} {heartCount === 1 ? 'person' : 'people'}
              </Text>
            )}
          </Text>
        </Pressable>
      )}

      <Text
        style={{
          fontSize: 28,
          fontFamily: 'Inter_700Bold',
          color: theme.ink,
          lineHeight: 33,
          letterSpacing: -0.7,
        }}
        numberOfLines={2}
      >
        {listing.title}
      </Text>

      {segments.length > 0 && (
        <Text
          numberOfLines={2}
          style={{ marginTop: 10, fontSize: 14, lineHeight: 20, color: theme.mute, fontFamily: 'Inter_500Medium' }}
        >
          {segments.map((s: (typeof metaSegments)[number], i) => (
            <Text key={i}>
              {i > 0 ? <Text style={{ color: theme.muteSoft }}>{' · '}</Text> : null}
              {s.link ? (
                <Text
                  style={{
                    color: BRAND_PURPLE,
                    fontFamily: 'Inter_600SemiBold',
                    textDecorationLine: 'underline',
                  }}
                  accessibilityRole="link"
                  accessibilityLabel={`Shop more from ${s.text}`}
                  onPress={() => {
                    tap('selection');
                    if (s.isCategory && s.categoryKey) {
                      router.push(`/?searchOpen=1&searchCategory=${encodeURIComponent(s.categoryKey)}` as any);
                    } else {
                      router.push(`/?searchOpen=1&searchQuery=${encodeURIComponent(s.text)}` as any);
                    }
                  }}
                >
                  {s.text}
                </Text>
              ) : (
                s.text
              )}
            </Text>
          ))}
        </Text>
      )}

      <View style={{ marginTop: 18 }}>
        <Text
          style={{
            fontSize: 28,
            fontFamily: 'Inter_700Bold',
            color: theme.ink,
            lineHeight: 34,
            letterSpacing: -0.6,
          }}
        >
          {formatPrice(itemPrice, { whole: true })}
        </Text>
        {bpFee > 0 ? (
          <Pressable
            onPress={() => {
              tap('selection');
              onOpenBpSheet();
            }}
            accessibilityRole="button"
            accessibilityLabel={`Plus ${formatPrice(bpFee)} Buyer Protection fee. See the breakdown.`}
            hitSlop={8}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              marginTop: 6,
              alignSelf: 'flex-start',
              minHeight: 28,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text style={{ fontSize: 15, fontFamily: 'Inter_400Regular', color: theme.ink }}>
              +{formatPrice(bpFee)} Buyer Protection fee
            </Text>
            <ShieldCheckIcon size={22} />
          </Pressable>
        ) : null}

      </View>
    </View>
  );
});
