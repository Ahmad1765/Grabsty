import React from 'react';
import {
  View,
  Pressable,
  Platform,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Text } from '@/lib/rnText';
import { formatPrice } from '@/lib/currency';
import { useTheme } from '@/context/ThemeContext';
import { radii, tabularNumberStyle } from '@/lib/theme';

export interface ProductActionBarProps {
  price?: number;
  buyTotal?: number;
  bpFee?: number;
  bottomInset?: number;
  onOfferPress?: () => void;
  onOfferOpen?: () => boolean | void;
  onSubmitOffer?: (amount: number) => void;
  onBuyPress?: () => void;
  onChatPress?: () => void;
  onViewOrderPress?: () => void;
  onCompleteCheckoutPress?: () => void;
  isOwner?: boolean;
  isSold?: boolean;
  hasPurchased?: boolean;
  isAwaitingPayment?: boolean;
  awaitingAmount?: number;
  disabled?: boolean;
  isBundle?: boolean;
  bundleCount?: number;
  className?: string;
  style?: ViewStyle;
}

export function ProductActionBar({
  price,
  buyTotal,
  bpFee,
  bottomInset,
  onOfferPress,
  onOfferOpen,
  onSubmitOffer,
  onBuyPress,
  onChatPress,
  onViewOrderPress,
  onCompleteCheckoutPress,
  isOwner = false,
  isSold = false,
  hasPurchased = false,
  isAwaitingPayment = false,
  awaitingAmount,
  disabled = false,
  isBundle = false,
  bundleCount,
  className = '',
  style,
}: ProductActionBarProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const safeBottom = bottomInset !== undefined ? bottomInset : insets.bottom;

  const handleOffer = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    if (onOfferPress) {
      onOfferPress();
      return;
    }
    const allowed = onOfferOpen ? onOfferOpen() : true;
    if (allowed === false) return;
  };

  // Double-tap guard only. It must release on its own: the screen stays mounted
  // under checkout, so a latched flag left Buy greyed out and dead on return.
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  React.useEffect(() => {
    if (!isSubmitting) return;
    const t = setTimeout(() => setIsSubmitting(false), 800);
    return () => clearTimeout(t);
  }, [isSubmitting]);

  const handleBuy = () => {
    if (disabled || isSubmitting) return;
    setIsSubmitting(true);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    onBuyPress?.();
  };

  if (isAwaitingPayment) {
    return (
      <View
        className={className}
        style={[
          styles.container,
          {
            backgroundColor: theme.surface,
            borderTopColor: theme.border,
            paddingBottom: Math.max(safeBottom, 16),
          },
          style,
        ]}
      >
        <View style={styles.actionRow}>
          <View style={{ flex: 1, marginRight: 10, justifyContent: 'center' }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: theme.primary, fontFamily: 'Inter_700Bold' }}>
              Offer accepted!
            </Text>
            <Text style={{ fontSize: 11.5, color: theme.mute, fontFamily: 'Inter_500Medium' }}>
              Complete checkout to lock order
            </Text>
          </View>
          <Pressable
            onPress={onCompleteCheckoutPress}
            style={({ pressed }) => [
              styles.buyButton,
              {
                backgroundColor: theme.ink,
                paddingHorizontal: 18,
                height: 48,
                borderRadius: 10,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={[styles.buyButtonText, { color: theme.background, fontFamily: 'Inter_700Bold' }]}>
              {awaitingAmount ? `Pay ${formatPrice(awaitingAmount)}` : 'Pay now'}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (hasPurchased) {
    return (
      <View
        className={className}
        style={[
          styles.container,
          {
            backgroundColor: theme.surface,
            borderTopColor: theme.border,
            paddingBottom: Math.max(safeBottom, 16),
          },
          style,
        ]}
      >
        <View style={styles.actionRow}>
          <View style={{ flex: 1, marginRight: 10, justifyContent: 'center' }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: theme.ink, fontFamily: 'Inter_700Bold' }}>
              You purchased this item
            </Text>
            <Text style={{ fontSize: 11.5, color: theme.mute, fontFamily: 'Inter_500Medium' }}>
              Tap to track fulfillment status
            </Text>
          </View>
          <Pressable
            onPress={onViewOrderPress}
            style={({ pressed }) => [
              styles.buyButton,
              {
                backgroundColor: theme.primary,
                paddingHorizontal: 18,
                height: 44,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={[styles.buyButtonText, { color: '#FFFFFF' }]}>Track Order</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (isOwner && isSold) {
    return (
      <View
        className={className}
        style={[
          styles.container,
          {
            backgroundColor: theme.surface,
            borderTopColor: theme.border,
            paddingBottom: Math.max(safeBottom, 16),
          },
          style,
        ]}
      >
        <View style={styles.actionRow}>
          <View style={{ flex: 1, marginRight: 10, justifyContent: 'center' }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: theme.primary, fontFamily: 'Inter_700Bold' }}>
              Item Sold!
            </Text>
            <Text style={{ fontSize: 11.5, color: theme.mute, fontFamily: 'Inter_500Medium' }}>
              View order and manage fulfillment
            </Text>
          </View>
          <Pressable
            onPress={onViewOrderPress}
            accessibilityRole="button"
            accessibilityLabel="View sold order"
            accessibilityHint="Opens the order details and fulfillment dashboard"
            style={({ pressed }) => [
              styles.buyButton,
              {
                backgroundColor: theme.ink,
                paddingHorizontal: 18,
                height: 48,
                borderRadius: 10,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={[styles.buyButtonText, { color: theme.background, fontFamily: 'Inter_700Bold' }]}>
              View Order
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (isSold) {
    return (
      <View
        className={className}
        style={[
          styles.container,
          {
            backgroundColor: theme.surface,
            borderTopColor: theme.border,
            paddingBottom: Math.max(safeBottom, 16),
          },
          style,
        ]}
      >
        <View style={[styles.soldContainer, { backgroundColor: theme.panel }]}>
          <Text style={[styles.soldText, { color: theme.mute }]}>This item has been sold</Text>
        </View>
      </View>
    );
  }

  return (
    <View
      className={className}
      style={[
        styles.container,
        {
          backgroundColor: theme.surface,
          borderTopColor: theme.border,
          paddingBottom: Math.max(safeBottom, 16),
        },
        style,
      ]}
    >
      {/* PROTECTED INVARIANT (Rule 2.9): Offer & Buy buttons must strictly remain 10px radius (borderRadius: 10)
          and monochrome palette (Paper White / Solid Ink). Never style Buy now purple or convert to pill radius. */}
      <View style={styles.actionRow}>
        {!isOwner && (
          <Pressable
            testID="make-offer-button"
            onPress={handleOffer}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel="Make an offer"
            accessibilityHint="Opens a sheet to send the seller a price suggestion"
            style={({ pressed }) => [
              styles.offerButton,
              {
                backgroundColor: theme.panel,
                borderColor: theme.border,
                opacity: pressed ? 0.75 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              },
            ]}
          >
            <Text style={[styles.offerButtonText, { color: theme.ink }]}>Make an offer</Text>
          </Pressable>
        )}

        <Pressable
          testID="buy-now-button"
          onPress={handleBuy}
          disabled={disabled || isSubmitting}
          aria-disabled={disabled || isSubmitting}
          accessibilityState={{ disabled: disabled || isSubmitting }}
          accessibilityRole="button"
          accessibilityLabel={
            isOwner
              ? 'Edit listing'
              : `${isBundle || (bundleCount !== undefined && bundleCount > 1) ? 'Buy bundle' : 'Buy now'} for ${buyTotal ? formatPrice(buyTotal) : price ? formatPrice(price) : ''}`
          }
          accessibilityHint="Proceeds to secure checkout"
          style={({ pressed }) => [
            styles.buyButton,
            {
              backgroundColor: theme.ink,
              borderColor: theme.ink,
              opacity: disabled || isSubmitting ? 0.6 : pressed ? 0.88 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            },
          ]}
        >
          <Text style={[styles.buyButtonText, { color: theme.background }]}>
            {isOwner ? 'Edit listing' : isBundle || (bundleCount !== undefined && bundleCount > 1) ? 'Buy bundle' : 'Buy now'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(15, 15, 15, 0.08)',
    paddingHorizontal: 16,
    paddingTop: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
      },
      android: {
        elevation: 6,
      },
      default: {
        boxShadow: '0px -4px 10px rgba(0, 0, 0, 0.05)',
      },
    }),
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  offerButton: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offerButtonText: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    ...tabularNumberStyle,
  },
  buyButton: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buyButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.2,
    ...tabularNumberStyle,
  },
  soldContainer: {
    height: 48,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  soldText: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
});
