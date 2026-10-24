import { memo, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Platform,
  ScrollView,
} from 'react-native';
import { Text } from '@/lib/rnText';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { tap } from '@/lib/haptics';
import { type as typography, tabularNumberStyle } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';
import { EmptyState } from '@/components/ui/EmptyState';
import { useSellSheet } from '@/components/sell/SellSheet';
import { useMyOrdersQuery } from '@/lib/queries';
import { getOptimizedImageUrl, cardImageUrl, IMAGE_TRANSITION } from '@/lib/images';
import { buyerProtectionFee, formatPrice } from '@/lib/fees';
import { deriveInvoiceAmounts } from '@/lib/invoiceStatus';
import { partitionOrders, getOrderCategory, type OrderSide } from '@/lib/orders';
import { ShieldCheckIcon } from '@/components/ui/ShieldCheckIcon';
import { usePullRefresh } from '@/hooks/usePullRefresh';
import type { MyOrder } from '@/lib/payments';

type FilterStatus = 'all' | 'in_progress' | 'completed' | 'refunds' | 'canceled';

const FILTER_CHIPS: { key: FilterStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed', label: 'Completed' },
  { key: 'refunds', label: 'Refunds' },
  { key: 'canceled', label: 'Canceled' },
];

function formatOrderDate(dateStr?: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const year = d.getFullYear() % 100;
  return `${month}/${day}/${year < 10 ? '0' : ''}${year}`;
}

export function OrderRow({ order, side }: { order: MyOrder; side: OrderSide }) {
  const { theme, isDark } = useTheme();
  const { total } = deriveInvoiceAmounts(order, order.listing?.price, buyerProtectionFee);
  const image = order.listing ? cardImageUrl(order.listing, 0) : '';

  const handlePress = () => {
    tap();
    const targetId = order.id || order.listing_id;
    if (targetId) {
      router.push(`/invoice/${targetId}` as any);
    }
  };

  const fulfillment = (order as any).fulfillment_status;
  const isDisputed = fulfillment === 'disputed' || order.status === 'disputed';
  const isDelivered = fulfillment === 'delivered' || order.status === 'delivered';
  const isShipped =
    order.shipped_at ||
    (order as any).shifted_at ||
    (order as any).tracking_number ||
    order.status === 'shifting' ||
    fulfillment === 'shifting';
  const isPicked = fulfillment === 'picked' || order.status === 'picked';
  const isPacking = fulfillment === 'packing' || order.status === 'packing';
  const isCompleted = fulfillment === 'completed' || order.status === 'completed';
  const isAwaitingPayment = fulfillment === 'awaiting_payment' || order.status === 'awaiting_payment';
  const isCanceled =
    order.status === 'canceled' ||
    order.status === 'refunded' ||
    order.status === 'failed' ||
    fulfillment === 'canceled' ||
    fulfillment === 'refunded';

  const purchasedDate = formatOrderDate(order.created_at);
  const counterpartName =
    side === 'bought'
      ? (order.seller?.username || order.seller?.full_name || (order.listing as any)?.seller?.username || 'Seller')
      : (order.buyer?.username || order.buyer?.full_name || (order.shipping_address as any)?.recipientName || (order.shipping_address as any)?.recipient_name || 'Buyer');

  let badgeLabel = 'In Progress';
  let badgeBg: string = isDark ? 'rgba(255, 255, 255, 0.10)' : '#E5E7EB';
  let badgeColor: string = theme.ink;

  if (isCanceled) {
    badgeLabel = order.status === 'refunded' || fulfillment === 'refunded' ? 'Refunded' : 'Cancelled';
    badgeBg = isDark ? 'rgba(239, 68, 68, 0.18)' : '#FEE2E2';
    badgeColor = '#EF4444';
  } else if (isDisputed) {
    badgeLabel = 'Refund Under Review';
    badgeBg = isDark ? 'rgba(255, 255, 255, 0.12)' : '#E5E7EB';
    badgeColor = theme.ink;
  } else if (isCompleted) {
    badgeLabel = 'Completed';
    badgeBg = isDark ? 'rgba(108, 71, 255, 0.22)' : 'rgba(108, 71, 255, 0.10)';
    badgeColor = isDark ? '#FFFFFF' : theme.purple;
  } else if (isDelivered) {
    badgeLabel = 'Delivered';
    badgeBg = isDark ? 'rgba(108, 71, 255, 0.22)' : 'rgba(108, 71, 255, 0.10)';
    badgeColor = isDark ? '#FFFFFF' : theme.purple;
  } else if (isShipped) {
    badgeLabel = 'In Transit';
    badgeBg = isDark ? 'rgba(255, 255, 255, 0.12)' : '#E5E7EB';
    badgeColor = theme.ink;
  } else if (isPicked) {
    badgeLabel = 'Picked';
    badgeBg = isDark ? 'rgba(255, 255, 255, 0.12)' : '#E5E7EB';
    badgeColor = theme.ink;
  } else if (isPacking) {
    badgeLabel = 'Packing';
    badgeBg = isDark ? 'rgba(255, 255, 255, 0.12)' : '#E5E7EB';
    badgeColor = theme.ink;
  } else if (isAwaitingPayment) {
    badgeLabel = 'Awaiting Payment';
    badgeBg = isDark ? 'rgba(255, 255, 255, 0.10)' : '#E5E7EB';
    badgeColor = theme.mute;
  }

  const deliveryExpected =
    isShipped || isPacking || fulfillment === 'pending'
      ? formatOrderDate(order.created_at ? new Date(new Date(order.created_at).getTime() + 7 * 86400000).toISOString() : null)
      : null;

  return (
    <Pressable
      onPress={handlePress}
      testID="order-row"
      accessibilityRole="button"
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'flex-start',
          paddingHorizontal: 16,
          paddingVertical: 14,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.08)' : theme.hairline,
        },
        pressed && { opacity: 0.75 },
      ]}
    >
      {/* Thumbnail */}
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: 8,
          backgroundColor: isDark ? '#222224' : theme.panel,
          borderWidth: 1,
          borderColor: isDark ? '#2E2E30' : theme.border,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 14,
          marginTop: 2,
        }}
      >
        {image ? (
          <Image
            source={{ uri: getOptimizedImageUrl(image, { width: 160 }) }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={IMAGE_TRANSITION}
          />
        ) : (
          <Feather name="package" size={24} color={isDark ? '#666' : theme.muteSoft} />
        )}
      </View>

      {/* Item info */}
      <View style={{ flex: 1 }}>
        {/* Status Pill Badge */}
        <View
          style={{
            alignSelf: 'flex-start',
            paddingHorizontal: 7,
            paddingVertical: 2.5,
            borderRadius: 4,
            backgroundColor: badgeBg,
            marginBottom: 4,
          }}
        >
          <Text
            style={{
              fontSize: 11.5,
              fontFamily: typography.family.sansBold,
              fontWeight: '700',
              color: badgeColor,
            }}
          >
            {badgeLabel}
          </Text>
        </View>

        {/* Title */}
        <Text
          style={{
            fontSize: 15,
            color: theme.ink,
            fontFamily: typography.family.sansBold,
            fontWeight: '700',
            letterSpacing: -0.3,
            marginBottom: 2,
          }}
          numberOfLines={1}
        >
          {order.listing?.title ?? 'Item'}
        </Text>

        {/* Price */}
        <Text
          style={{
            fontSize: 13,
            color: isDark ? '#A1A1AA' : theme.mute,
            fontFamily: typography.family.sans,
            marginBottom: 1,
          }}
        >
          Price:{' '}
          <Text
            style={[
              { fontFamily: typography.family.sansBold, fontWeight: '700', color: theme.ink },
              tabularNumberStyle,
            ]}
          >
            {formatPrice(total)}
          </Text>
        </Text>

        {/* Purchased Date */}
        {purchasedDate ? (
          <Text
            style={{
              fontSize: 13,
              color: isDark ? '#A1A1AA' : theme.mute,
              fontFamily: typography.family.sans,
              marginBottom: 1,
            }}
          >
            Purchased: <Text style={{ fontFamily: typography.family.sansMedium, color: theme.ink }}>{purchasedDate}</Text>
          </Text>
        ) : null}

        {/* Delivery expected if active */}
        {deliveryExpected && !isCanceled && !isCompleted ? (
          <Text
            style={{
              fontSize: 13,
              color: isDark ? '#A1A1AA' : theme.mute,
              fontFamily: typography.family.sans,
              marginBottom: 1,
            }}
          >
            Delivery expected: <Text style={{ fontFamily: typography.family.sansMedium, color: theme.ink }}>{deliveryExpected}</Text>
          </Text>
        ) : null}

        {/* Counterparty / From or Buyer */}
        <Text
          style={{
            fontSize: 13,
            color: isDark ? '#A1A1AA' : theme.mute,
            fontFamily: typography.family.sans,
          }}
        >
          {side === 'bought' ? 'From: ' : 'Buyer: '}
          <Text style={{ fontFamily: typography.family.sansMedium, color: theme.primary }}>{counterpartName}</Text>
        </Text>
      </View>
    </Pressable>
  );
}

function OrdersSkeleton() {
  const { theme } = useTheme();
  return (
    <View style={{ paddingVertical: 6 }}>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingVertical: 14,
          }}
        >
          <View
            style={{
              width: 58,
              height: 58,
              borderRadius: 8,
              backgroundColor: theme.panel,
              marginRight: 14,
            }}
          />
          <View style={{ flex: 1, gap: 6 }}>
            <View style={{ width: '60%', height: 14, borderRadius: 4, backgroundColor: theme.panel }} />
            <View style={{ width: '30%', height: 13, borderRadius: 4, backgroundColor: theme.panel }} />
            <View style={{ width: '45%', height: 12, borderRadius: 4, backgroundColor: theme.panel }} />
          </View>
        </View>
      ))}
    </View>
  );
}

export const OrdersInboxPage = memo(function OrdersInboxPage({
  userId,
  pageWidth,
  pageHeight,
  bottomInset,
  initialSide = 'bought',
  justPaid,
  recentTitle,
  recentAmount,
}: {
  userId: string;
  pageWidth: number;
  pageHeight: number;
  bottomInset: number;
  initialSide?: OrderSide;
  justPaid?: string;
  recentTitle?: string;
  recentAmount?: string;
}) {
  const { theme, isDark } = useTheme();
  const sell = useSellSheet();
  const [subTab, setSubTab] = useState<OrderSide>(initialSide);
  const [filter, setFilter] = useState<FilterStatus>('in_progress');
  const [showToast, setShowToast] = useState(justPaid === '1' || justPaid === '0');
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    if (initialSide) setSubTab(initialSide);
  }, [initialSide]);

  const q = useMyOrdersQuery(userId);
  const { refetch, isPending } = q;

  // Orders change on other devices too (a buyer's purchase lands in the seller's
  // Selling list), so re-check whenever Activity comes into view.
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  useEffect(() => {
    if (justPaid === '1' || justPaid === '0') {
      setShowToast(true);
      refetch();
      const timer = setTimeout(() => setShowToast(false), 7000);
      return () => clearTimeout(timer);
    }
  }, [justPaid, refetch]);

  // When switching filter or subTab, cleanly reset scroll position on iOS
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [filter, subTab]);

  const sanitizedOrders = useMemo(
    () =>
      (q.data ?? []).filter(
        (o) =>
          o.status !== 'awaiting_payment' &&
          (o as any).fulfillment_status !== 'awaiting_payment',
      ),
    [q.data],
  );

  const { bought, sold } = useMemo(
    () => partitionOrders(sanitizedOrders, userId),
    [sanitizedOrders, userId],
  );

  const filterList = useCallback(
    (raw: MyOrder[]) => {
      if (filter === 'all') return raw;
      if (filter === 'refunds') {
        return raw.filter((o) => getOrderCategory(o) === 'refunds');
      }
      if (filter === 'canceled') {
        return raw.filter((o) => getOrderCategory(o) === 'canceled');
      }
      if (filter === 'completed') {
        return raw.filter((o) => getOrderCategory(o) === 'completed');
      }
      if (filter === 'in_progress') {
        return raw.filter((o) => getOrderCategory(o) === 'in_progress');
      }
      return raw;
    },
    [filter],
  );

  const orders = useMemo(() => {
    return filterList(subTab === 'bought' ? bought : sold);
  }, [subTab, bought, sold, filterList]);

  const { refreshing, onRefresh } = usePullRefresh(refetch);

  return (
    <View
      style={{
        width: pageWidth,
        height: pageHeight > 0 ? pageHeight : undefined,
        flex: 1,
        backgroundColor: theme.background,
        overflow: 'hidden',
      }}
    >
      {/* Toast banner after checkout */}
      {showToast && (
        <View
          style={{
            marginHorizontal: 16,
            marginTop: 8,
            marginBottom: 4,
            padding: 12,
            borderRadius: 12,
            backgroundColor: isDark ? 'rgba(108, 71, 255, 0.14)' : 'rgba(108, 71, 255, 0.08)',
            borderWidth: 1,
            borderColor: isDark ? 'rgba(108, 71, 255, 0.28)' : 'rgba(108, 71, 255, 0.20)',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            flexShrink: 0,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
            <Feather name="check-circle" size={16} color="#6C47FF" />
            <Text style={{ fontSize: 13, color: theme.ink, fontFamily: typography.family.sansMedium, flex: 1 }}>
              {justPaid === '1'
                ? `Payment successful! Your order${recentTitle ? ` for "${recentTitle}"` : ''} is confirmed.`
                : `Order placed! Cash on delivery confirmed${recentTitle ? ` for "${recentTitle}"` : ''}.`}
            </Text>
          </View>
          <Pressable onPress={() => setShowToast(false)} hitSlop={8}>
            <Feather name="x" size={15} color={theme.mute} />
          </Pressable>
        </View>
      )}

      {/* Sub-toggle: Purchases | Selling */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 16,
          paddingTop: 10,
          paddingBottom: 6,
          backgroundColor: theme.background,
          flexShrink: 0,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            backgroundColor: isDark ? '#1C1C1E' : '#F1F2F4',
            borderRadius: 10,
            padding: 3,
            width: '100%',
          }}
        >
          <Pressable
            onPress={() => {
              tap();
              setSubTab('bought');
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: subTab === 'bought' }}
            accessibilityLabel="Purchases"
            style={{
              flex: 1,
              paddingVertical: 7,
              borderRadius: 8,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: subTab === 'bought' ? (isDark ? '#2C2C2E' : '#FFFFFF') : 'transparent',
              ...(subTab === 'bought' && Platform.OS !== 'web'
                ? {
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.12,
                    shadowRadius: 2,
                    elevation: 2,
                  }
                : {}),
            }}
          >
            <Text
              style={{
                fontFamily: subTab === 'bought' ? typography.family.sansBold : typography.family.sansMedium,
                fontWeight: subTab === 'bought' ? '700' : '500',
                fontSize: 13.5,
                color: subTab === 'bought' ? theme.ink : (isDark ? '#8E8E93' : '#6B7280'),
              }}
            >
              Purchases ({bought.length})
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              tap();
              setSubTab('sold');
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: subTab === 'sold' }}
            accessibilityLabel="Selling"
            style={{
              flex: 1,
              paddingVertical: 7,
              borderRadius: 8,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: subTab === 'sold' ? (isDark ? '#2C2C2E' : '#FFFFFF') : 'transparent',
              ...(subTab === 'sold' && Platform.OS !== 'web'
                ? {
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.12,
                    shadowRadius: 2,
                    elevation: 2,
                  }
                : {}),
            }}
          >
            <Text
              style={{
                fontFamily: subTab === 'sold' ? typography.family.sansBold : typography.family.sansMedium,
                fontWeight: subTab === 'sold' ? '700' : '500',
                fontSize: 13.5,
                color: subTab === 'sold' ? theme.ink : (isDark ? '#8E8E93' : '#6B7280'),
              }}
            >
              Selling ({sold.length})
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Active Shop Inventory Bar on Sales */}
      {subTab === 'sold' && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingTop: 10,
            paddingBottom: 2,
          }}
        >
          {/* Label gives way (ellipsis) so the two actions never get pushed off-screen at large font scales. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, marginRight: 8 }}>
            <Feather name="tag" size={13} color={theme.primary} />
            <Text
              numberOfLines={1}
              style={{
                flexShrink: 1,
                fontSize: 13,
                fontFamily: typography.family.sansBold,
                color: theme.ink,
              }}
            >
              Shop Listings
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <Pressable
              onPress={() => sell.open()}
              style={({ pressed }) => [
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 6,
                  backgroundColor: theme.primary,
                },
                pressed && { opacity: 0.8 },
              ]}
            >
              <Feather name="plus" size={12} color="#FFFFFF" />
              <Text
                style={{
                  fontSize: 12,
                  fontFamily: typography.family.sansBold,
                  color: '#FFFFFF',
                }}
              >
                New item
              </Text>
            </Pressable>

            <Pressable
              onPress={() => router.push('/(tabs)/profile?tab=selling' as any)}
              style={({ pressed }) => [
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 6,
                  backgroundColor: isDark ? '#2C2C2E' : theme.panel,
                  borderWidth: 1,
                  borderColor: isDark ? 'transparent' : theme.border,
                },
                pressed && { opacity: 0.8 },
              ]}
            >
              <Feather name="grid" size={12} color={theme.ink} />
              <Text
                style={{
                  fontSize: 12,
                  fontFamily: typography.family.sansBold,
                  color: theme.ink,
                }}
              >
                View shop
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Filter Status Chips matching Whatnot Image 4 */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 10,
          paddingBottom: 12,
          gap: 8,
          alignItems: 'center',
        }}
        style={{
          backgroundColor: theme.background,
          flexGrow: 0,
          flexShrink: 0,
        }}
      >
        {FILTER_CHIPS.map((item) => {
          const active = filter === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => {
                tap();
                setFilter(item.key);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={item.label}
              style={({ pressed }) => [
                {
                  height: 36,
                  paddingHorizontal: 16,
                  borderRadius: 8,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: active
                    ? isDark ? '#FFFFFF' : '#111111'
                    : isDark ? '#2C2C2E' : '#E5E7EB',
                },
                pressed && { opacity: 0.8 },
              ]}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '700',
                  color: active
                    ? isDark ? '#000000' : '#FFFFFF'
                    : isDark ? '#FFFFFF' : '#111111',
                  fontFamily: typography.family.sansBold,
                  letterSpacing: -0.2,
                }}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Orders List */}
      {isPending && orders.length === 0 ? (
        <OrdersSkeleton />
      ) : (
        <FlatList
          ref={listRef}
          style={{ flex: 1 }}
          data={orders}
          keyExtractor={(o) => o.id}
          renderItem={({ item }) => <OrderRow order={item} side={subTab} />}
          contentContainerStyle={[
            { paddingVertical: 4, paddingBottom: bottomInset + 20 },
            orders.length === 0 && { flexGrow: 1, justifyContent: 'center' },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.purple}
            />
          }
          ListEmptyComponent={
            <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
              <EmptyState
                icon="shopping-bag"
                title={
                  filter === 'in_progress'
                    ? subTab === 'bought'
                      ? 'No orders in progress'
                      : 'No sales in progress'
                    : filter === 'refunds'
                    ? subTab === 'bought'
                      ? 'No refunds'
                      : 'No refund requests'
                    : filter === 'canceled'
                    ? subTab === 'bought'
                      ? 'No canceled orders'
                      : 'No canceled sales'
                    : filter === 'completed'
                    ? subTab === 'bought'
                      ? 'No completed orders'
                      : 'No completed sales'
                    : subTab === 'bought'
                    ? 'No orders'
                    : 'No sales'
                }
                description="When you buy or sell items, they will show up here."
                cta={{
                  label: subTab === 'bought' ? 'Browse items' : 'List an item',
                  onPress: () => (subTab === 'bought' ? router.push('/(tabs)' as any) : sell.open()),
                  icon: subTab === 'bought' ? 'search' : 'plus',
                }}
              />
            </View>
          }
        />
      )}
    </View>
  );
});
