// ─────────────────────────────────────────────────────────────────────────────
// CONVERSATION LISTING HEADER (PRESENTATIONAL)
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Presentational (Dumb) Component
// This component has zero side effects, no network calls, and no local state.
// It receives pure props (listing, prices, callbacks) and purely renders the
// sticky listing context bar. This allows effortless UI testing and reusability.
// ─────────────────────────────────────────────────────────────────────────────

import { View, Pressable, Platform, StyleSheet } from 'react-native';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { radii, type as typography } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';
import { formatPrice } from '@/lib/currency';
import { buyerProtectionFee } from '@/lib/fees';
import { ThumbButton } from '@/components/ui';
import { ShieldCheckIcon } from '@/components/ui/ShieldCheckIcon';
import { ListingThumb, type ListingStatus } from './ListingThumb';
import type { ConversationRow } from '@/lib/chat';

type ConversationListingHeaderProps = {
  listing: ConversationRow['listing'];
  listingId: string | null;
  listingThumb: string | null;
  status: ListingStatus | null;
  isSeller: boolean;
  onPressListing: () => void;
  onPressBuyNow: () => void;
};

export function ConversationListingHeader({
  listing,
  listingId,
  listingThumb,
  status,
  isSeller,
  onPressListing,
  onPressBuyNow,
}: ConversationListingHeaderProps) {
  const { theme } = useTheme();
  if (!listingId) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open listing ${listing?.title ?? 'Listing'}`}
      onPress={onPressListing}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.panel,
          borderColor: theme.hairline,
          opacity: pressed ? 0.92 : 1,
        },
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
        <ListingThumb uri={listingThumb} width={42} height={42} status={status ?? 'active'} radius={radii.sm} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{
              fontFamily: typography.family.sansBold,
              fontSize: 13,
              color: theme.ink,
            }}
          >
            {listing?.title ?? 'Listing removed'}
          </Text>
          <Text
            style={{
              fontFamily: typography.family.sansBold,
              fontSize: 12,
              color: theme.ink,
              marginTop: 1,
            }}
          >
            {listing?.price != null ? formatPrice(listing.price) : '—'}
          </Text>
          {listing?.price != null && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 }}>
              <Text
                numberOfLines={1}
                style={{
                  fontFamily: typography.family.sans,
                  fontSize: 11,
                  color: theme.mute,
                  flexShrink: 1,
                }}
              >
                {`${formatPrice(listing.price + buyerProtectionFee(listing.price))} Includes Buyer Protection`}
              </Text>
              <ShieldCheckIcon size={12} />
            </View>
          )}
        </View>
      </View>

      {!isSeller && status === 'active' ? (
        <View style={{ flexShrink: 0 }}>
          <ThumbButton
            label="Buy Now"
            variant="primary"
            size="sm"
            onPress={onPressBuyNow}
            accessibilityLabel="Buy now"
          />
        </View>
      ) : (
        <Feather name="chevron-right" size={18} color={theme.muteSoft} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 500,
    alignSelf: 'center',
    marginHorizontal: 'auto',
    marginBottom: 6,
    borderRadius: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 4px rgba(0, 0, 0, 0.05)',
      } as any,
    }),
  },
});
