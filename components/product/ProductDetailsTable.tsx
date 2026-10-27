// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT DETAILS TABLE (PRESENTATIONAL)
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Structured Attribute Grids & Controlled Text Clamping
// This component organizes all product attributes (condition, size, color, brand,
// categories) and controlled text expansion into a cohesive editorial block.
// ─────────────────────────────────────────────────────────────────────────────

import { memo, useMemo } from 'react';
import { View, Pressable, Alert } from 'react-native';
import { Text } from '@/lib/rnText';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/context/ThemeContext';
import { categoryLabel, subcategoryLabel } from '@/lib/categories';
import { itemColorLabel } from '@/lib/itemColors';
import { ColorSwatch } from '@/components/ColorSwatch';
import { SafetyBanner } from '@/components/SafetyBanner';
import {
  BRAND_PURPLE,
  CONDITION_LABELS,
  HAIRLINE,
  tap,
  timeAgo,
} from '@/components/product/shared';
import type { Listing } from '@/types';

const DESC_CLAMP_LINES = 6;
const LABEL_W = 104;

type DetailRow = {
  label: string;
  value?: string | null;
  link?: boolean;
  onPress?: () => void;
  trailing?: React.ReactNode;
};

type ProductDetailsTableProps = {
  listing: Listing;
  descExpanded: boolean;
  onToggleDescExpanded: () => void;
  onShare: () => void;
  onReport: () => void;
};

export const ProductDetailsTable = memo(function ProductDetailsTable({
  listing,
  descExpanded,
  onToggleDescExpanded,
  onShare,
  onReport,
}: ProductDetailsTableProps) {
  const { theme } = useTheme();
  const catSubLabel = listing.subcategory
    ? subcategoryLabel(listing.category, listing.subcategory)
    : '';

  // Description paragraphs handling
  const descParas = useMemo(
    () =>
      String(listing.description ?? '')
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean),
    [listing.description],
  );
  const descFull = useMemo(() => descParas.join('\n\n'), [descParas]);
  const descIsLong = descFull.length > 240 || descParas.length > 3;
  const hasDescription = descParas.length > 0;

  // Attribute Rows (only included when data is present)
  const detailRows: DetailRow[] = useMemo(() => {
    const rows: DetailRow[] = [];

    if (listing.brand?.trim()) {
      const brandVal = listing.brand.trim();
      rows.push({
        label: 'Brand',
        value: brandVal,
        link: true,
        onPress: () => {
          tap('selection');
          router.push(`/?searchOpen=1&searchQuery=${encodeURIComponent(brandVal)}` as any);
        },
        trailing: <Feather name="chevron-right" size={18} color={theme.mute} />,
      });
    }

    if (listing.size?.trim()) {
      rows.push({
        label: 'Size',
        value: listing.size.trim(),
      });
    }

    if (listing.condition) {
      rows.push({
        label: 'Condition',
        value: CONDITION_LABELS[listing.condition] ?? listing.condition,
        onPress: () =>
          Alert.alert(
            'Condition guide',
            'New with tags — Unworn, original tags still attached\n\n' +
              'Like new — Worn once or twice, no visible flaws\n\n' +
              'Very good — Gently used, only minor signs of wear\n\n' +
              'Fair — Noticeable wear, but still fully wearable',
          ),
        trailing: <Feather name="info" size={17} color={theme.mute} />,
      });
    }

    if (listing.color?.trim()) {
      rows.push({
        label: 'Color',
        value: itemColorLabel(listing.color.trim()),
        trailing: <ColorSwatch colorId={listing.color.trim()} size={18} />,
      });
    }

    if (listing.material?.trim()) {
      rows.push({
        label: 'Material',
        value: listing.material.trim(),
      });
    }

    if (listing.created_at) {
      rows.push({
        label: 'Uploaded',
        value: timeAgo(listing.created_at),
      });
    }

    return rows;
  }, [
    listing.brand,
    listing.size,
    listing.condition,
    listing.color,
    listing.material,
    listing.created_at,
    theme.mute,
  ]);

  return (
    <>
      {/* ── Description + Details Box ── */}
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6 }}>
        <View
          style={{
            backgroundColor: theme.paper,
            borderRadius: 18,
            borderWidth: HAIRLINE,
            borderColor: theme.border,
            overflow: 'hidden',
          }}
        >
          {hasDescription && (
            <View
              style={{
                paddingHorizontal: 18,
                paddingTop: 18,
                paddingBottom: descIsLong ? 8 : 18,
              }}
            >
              <Text
                numberOfLines={descIsLong && !descExpanded ? DESC_CLAMP_LINES : undefined}
                style={{
                  fontSize: 15,
                  color: theme.ink,
                  lineHeight: 24,
                  fontFamily: 'Inter_400Regular',
                }}
              >
                {descFull}
              </Text>
              {descIsLong && (
                <Pressable
                  onPress={() => { tap('selection'); onToggleDescExpanded(); }}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={descExpanded ? 'Collapse description' : 'Expand full description'}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    minHeight: 44,
                    opacity: pressed ? 0.6 : 1,
                  })}
                >
                  <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: BRAND_PURPLE, letterSpacing: 0.2 }}>
                    {descExpanded ? 'Show less' : 'Read more'}
                  </Text>
                  <Feather
                    name={descExpanded ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={BRAND_PURPLE}
                  />
                </Pressable>
              )}
            </View>
          )}

          {/* Category Breadcrumb */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 18,
              paddingVertical: 16,
              borderTopWidth: hasDescription ? HAIRLINE : 0,
              borderTopColor: theme.border,
            }}
          >
            <Text
              style={{
                width: LABEL_W,
                fontFamily: 'Inter_600SemiBold',
                fontSize: 15,
                color: theme.ink,
                letterSpacing: 0.1,
              }}
            >
              Category
            </Text>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
              <Pressable
                onPress={() => {
                  tap('selection');
                  router.push(`/?searchOpen=1&searchCategory=${encodeURIComponent(listing.category)}` as any);
                }}
                style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
              >
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 15, color: theme.mute }}>
                  {categoryLabel(listing.category)}
                </Text>
              </Pressable>
              {catSubLabel ? (
                <>
                  <Feather
                    name="chevron-right"
                    size={14}
                    color={theme.mute}
                    style={{ marginHorizontal: 3 }}
                  />
                  <Pressable
                    onPress={() => {
                      tap('selection');
                      router.push(
                        `/?searchOpen=1&searchCategory=${encodeURIComponent(listing.category)}&searchQuery=${encodeURIComponent(listing.subcategory!)}` as any,
                      );
                    }}
                    style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
                  >
                    <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 15, color: theme.mute }}>
                      {catSubLabel}
                    </Text>
                  </Pressable>
                </>
              ) : null}
            </View>
            <Feather
              name="chevron-right"
              size={18}
              color={theme.mute}
              style={{ marginLeft: 10 }}
            />
          </View>

          {/* Attribute Rows */}
          {detailRows.map((row) => (
            <Pressable
              key={row.label}
              onPress={row.onPress}
              disabled={!row.onPress}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 18,
                paddingVertical: 16,
                borderTopWidth: HAIRLINE,
                borderTopColor: theme.border,
                backgroundColor: pressed && row.onPress ? theme.panel : theme.paper,
              })}
            >
              <Text
                style={{
                  width: LABEL_W,
                  fontSize: 15,
                  fontFamily: 'Inter_600SemiBold',
                  color: theme.ink,
                  letterSpacing: 0.1,
                }}
              >
                {row.label}
              </Text>
              <Text
                style={{
                  flex: 1,
                  fontSize: 15,
                  fontFamily: 'Inter_400Regular',
                  color: row.link ? BRAND_PURPLE : theme.mute,
                }}
                numberOfLines={1}
              >
                {row.value}
              </Text>
              {row.trailing ? <View style={{ marginLeft: 10 }}>{row.trailing}</View> : null}
            </Pressable>
          ))}
        </View>

        {/* Tag Chips */}
        {Array.isArray(listing.tags) && listing.tags.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 16, gap: 8, paddingHorizontal: 4 }}>
            {listing.tags.map((tag) => (
              <Pressable
                key={tag}
                onPress={() => {
                  tap('selection');
                  router.push(`/?searchOpen=1&searchQuery=${encodeURIComponent(tag)}` as any);
                }}
                style={({ pressed }) => ({
                  backgroundColor: theme.paper,
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Text
                  style={{
                    fontSize: 12,
                    color: theme.ink,
                    fontFamily: 'Inter_500Medium',
                    letterSpacing: 0.1,
                  }}
                >
                  #{tag}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Share / Report / ID Footer Row */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 22,
            paddingHorizontal: 4,
          }}
        >
          <Pressable
            onPress={onShare}
            accessibilityRole="button"
            accessibilityLabel="Share this listing"
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingVertical: 6,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Feather name="share-2" size={16} color={theme.ink} />
            <Text
              style={{
                fontSize: 13,
                color: theme.ink,
                fontFamily: 'Inter_600SemiBold',
                letterSpacing: 0.2,
              }}
            >
              Share
            </Text>
          </Pressable>

          <View
            pointerEvents="box-none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Pressable
              onPress={onReport}
              accessibilityRole="button"
              accessibilityLabel="Report this listing"
              hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingVertical: 6,
                transform: [{ translateX: -12 }],
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Feather name="flag" size={16} color={theme.mute} />
              <Text
                style={{
                  fontSize: 13,
                  color: theme.mute,
                  fontFamily: 'Inter_600SemiBold',
                  letterSpacing: 0.2,
                }}
              >
                Report
              </Text>
            </Pressable>
          </View>

          <Text
            style={{
              fontSize: 12,
              color: theme.mute,
              letterSpacing: 0.4,
              fontFamily: 'Inter_500Medium',
            }}
          >
            ID · {listing.id.slice(0, 8)}
          </Text>
        </View>
      </View>

      {/* Safety & Trust Banner */}
      <View style={{ paddingHorizontal: 16, paddingTop: 22, paddingBottom: 6 }}>
        <SafetyBanner />
      </View>
    </>
  );
});
