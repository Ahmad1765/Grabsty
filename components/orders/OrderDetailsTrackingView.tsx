import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
  Modal,
} from 'react-native';
import { Text, TextInput } from '@/lib/rnText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '@/context/ThemeContext';
import { radii, type as typography, tabularNumberStyle, shadow } from '@/lib/theme';
import { tap } from '@/lib/haptics';
import { useToast } from '@/lib/toast';
import { safeBack } from '@/lib/nav';
import { HIT_SLOP_8, CONTENT_MAX_WIDTH } from '@/lib/responsive';
import { BRAND, APP_URL } from '@/lib/brand';
import QRCode from 'react-native-qrcode-svg';
import { getOrCreateConversation } from '@/lib/chat';
import type { Order } from '@/lib/payments';
import type { Listing, FulfillmentStatus } from '@/types';
import { getOptimizedImageUrl } from '@/lib/images';
import { conditionLabel } from '@/components/product/shared';
import { KeyboardAvoider } from '@/components/ui/SafeContainer';
import { orderReference, trackingIdFor } from '@/lib/orderTracking';
import { isOrderClosed, orderMoneyLines, orderStatusBadge } from '@/lib/orderDisplay';
import { formatPrice } from '@/lib/currency';

export interface OrderDetailsTrackingViewProps {
  order?: Order | null;
  listing?: Listing | null;
  isSeller?: boolean;
  onBack?: () => void;
  onShare?: () => void;
  actionButtons?: React.ReactNode;
  onConfirmPickup?: (address: any) => Promise<void>;
  sellerDefaultAddress?: any;
  onOrderUpdate?: (updatedOrder: Order) => void;
  // Overrides or custom fallbacks matching mockup
  trackingId?: string;
  statusLabel?: string;
  receiverName?: string;
  deliveryAddress?: string;
  contactPhone?: string;
  itemTitle?: string;
  deliveryNote?: string;
  riderName?: string;
  riderAvatar?: string;
  riderPhone?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// DESIGN PATTERN PRIMITIVES (EMIL KOWALSKI CRAFT & UI/UX PRO MAX STANDARD)
// ─────────────────────────────────────────────────────────────────────────────

function SectionEyebrow({
  title,
  icon,
  badge,
}: {
  title: string;
  icon?: keyof typeof Feather.glyphMap;
  badge?: string;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 4,
        marginBottom: 8,
        marginTop: 6,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {icon && <Feather name={icon} size={14} color={theme.mute} />}
        <Text
          style={{
            fontSize: 12,
            fontFamily: typography.family.sansSemibold,
            color: theme.mute,
            letterSpacing: 0.3,
            textTransform: 'uppercase',
          }}
        >
          {title}
        </Text>
      </View>
      {badge && (
        <View
          style={{
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: radii.pill,
            backgroundColor: theme.surface,
            borderWidth: 1,
            borderColor: theme.border,
          }}
        >
          <Text
            style={{
              fontSize: 11,
              fontFamily: typography.family.sansBold,
              color: theme.mute,
              letterSpacing: 0.1,
            }}
          >
            {badge}
          </Text>
        </View>
      )}
    </View>
  );
}

function GroupCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: any;
}) {
  const { theme, isDark } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: theme.panel,
          borderRadius: 14,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: isDark ? '#262626' : 'rgba(0,0,0,0.08)',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: isDark ? 0.2 : 0.04,
          shadowRadius: 3,
          elevation: 1,
          marginBottom: 16,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

function KeyValueRow({
  label,
  value,
  isLast = false,
  rightElement,
}: {
  label: string;
  value?: string;
  isLast?: boolean;
  rightElement?: React.ReactNode;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 13,
        minHeight: 50,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: theme.border,
      }}
    >
      <Text
        style={{
          fontSize: 14.5,
          fontFamily: typography.family.sansMedium,
          color: theme.ink,
          letterSpacing: -0.1,
        }}
      >
        {label}
      </Text>

      {rightElement ? (
        rightElement
      ) : value ? (
        <Text
          numberOfLines={3}
          style={[
            {
              fontSize: 14,
              fontFamily: typography.family.sansMedium,
              color: theme.mute,
              flexShrink: 1,
              textAlign: 'right',
              marginLeft: 16,
            },
            tabularNumberStyle,
          ]}
        >
          {value}
        </Text>
      ) : null}
    </View>
  );
}

function parseServerDate(val?: string | Date | null): Date | null {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  let s = String(val).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}/.test(s)) {
    s = s.replace(' ', 'T');
  }
  if (!/Z|[+-]\d{2}(?::?\d{2})?$/i.test(s)) {
    s = `${s}Z`;
  }
  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function formatCondition(condition?: string): string {
  if (!condition) return 'New with tags';
  const map: Record<string, string> = {
    new_with_tags: 'New with tags',
    like_new: 'Like new',
    good: 'Good',
    fair: 'Fair',
  };
  return map[condition] || condition.replace(/_/g, ' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// ORDER FULFILLMENT STATUS NORMALIZER
// ─────────────────────────────────────────────────────────────────────────────

function deriveFulfillmentStatus(
  order: Order | null | undefined,
  propStatusLabel?: string,
): FulfillmentStatus {
  // 1. Explicit fulfillment_status on order
  const fs = (order?.fulfillment_status || '').toLowerCase();
  if (fs === 'completed') return 'completed';
  if (fs === 'delivered') return 'delivered';
  if (fs === 'shifting' || fs === 'in_transit' || fs === 'shipped') return 'shifting';
  if (fs === 'picked') return 'picked';
  if (fs === 'packing') return 'packing';
  if (fs === 'disputed') return 'disputed';
  if (fs === 'canceled' || fs === 'cancelled') return 'canceled';
  if (fs === 'pending') return 'pending';
  if (fs === 'awaiting_payment') return 'awaiting_payment';

  // 2. Escrow status on order
  const es = ((order as any)?.escrow_status || '').toUpperCase();
  if (es === 'COMPLETED_FUNDS_RELEASED') return 'completed';
  if (es === 'DELIVERED') return 'delivered';
  if (es === 'IN_TRANSIT') return 'shifting';
  if (es === 'READY_FOR_PICKUP') return (order as any)?.picked_up_at || (order as any)?.picked_at ? 'picked' : 'packing';
  if (es === 'DISPUTED') return 'disputed';
  if (es === 'CANCELLED') return 'canceled';

  // 3. Timestamps
  if (order?.completed_at) return 'completed';
  if (order?.delivered_at) return 'delivered';
  if (order?.shipped_at || (order as any)?.shifted_at) return 'shifting';
  if ((order as any)?.picked_up_at || (order as any)?.picked_at) return 'picked';
  if (order?.packed_at) return 'packing';

  // 4. Order status
  const st = (order?.status || '').toLowerCase();
  if (st === 'completed') return 'completed';
  if (st === 'delivered') return 'delivered';
  if (st === 'shifting' || st === 'in_transit' || st === 'shipped') return 'shifting';
  if (st === 'picked') return 'picked';
  if (st === 'packing') return 'packing';
  if (st === 'disputed') return 'disputed';
  if (st === 'canceled' || st === 'cancelled') return 'canceled';
  if (st === 'pending') return 'pending';
  if (st === 'awaiting_payment') return 'awaiting_payment';

  // 5. Fallback from propStatusLabel if supplied
  if (propStatusLabel) {
    const psl = propStatusLabel.toLowerCase();
    if (psl.includes('deliver')) return 'delivered';
    if (psl.includes('transit') || psl.includes('shift') || psl.includes('dispatch')) return 'shifting';
    if (psl.includes('pick')) return 'picked';
    if (psl.includes('pack')) return 'packing';
    if (psl.includes('complete')) return 'completed';
    if (psl.includes('dispute') || psl.includes('review')) return 'disputed';
    if (psl.includes('cancel')) return 'canceled';
    if (psl.includes('placed') || psl.includes('pending') || psl.includes('paid')) return 'pending';
  }

  return 'pending';
}

// ─────────────────────────────────────────────────────────────────────────────
// ORDER DETAILS TRACKING VIEW
// ─────────────────────────────────────────────────────────────────────────────

export function OrderDetailsTrackingView({
  order,
  listing,
  isSeller = false,
  onBack,
  onShare,
  actionButtons,
  onConfirmPickup,
  sellerDefaultAddress,
  onOrderUpdate,
  trackingId: propTrackingId,
  statusLabel: propStatusLabel,
  receiverName: propReceiverName,
  deliveryAddress: propDeliveryAddress,
  contactPhone: propContactPhone,
  itemTitle: propItemTitle,
  deliveryNote: propDeliveryNote,
  riderName: propRiderName,
  riderAvatar: propRiderAvatar,
  riderPhone: propRiderPhone,
}: OrderDetailsTrackingViewProps) {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();

  // Seller Modals (Rule 1 & 2)
  const [labelModalVisible, setLabelModalVisible] = useState(false);
  const [readyDeliverModalVisible, setReadyDeliverModalVisible] = useState(false);

  // Dynamic status state synchronized reactively with incoming order
  const [currentFulfillment, setCurrentFulfillment] = useState<FulfillmentStatus>(() =>
    deriveFulfillmentStatus(order, propStatusLabel),
  );

  useEffect(() => {
    setCurrentFulfillment(deriveFulfillmentStatus(order, propStatusLabel));
  }, [order, propStatusLabel]);

  // Ready to Deliver Form State
  const [pickupContactName, setPickupContactName] = useState(
    sellerDefaultAddress?.recipient_name || '',
  );
  const [pickupContactPhone, setPickupContactPhone] = useState(
    sellerDefaultAddress?.phone || '',
  );
  const [pickupLine1, setPickupLine1] = useState(
    sellerDefaultAddress?.line1 || '',
  );
  const [pickupLine2, setPickupLine2] = useState(
    sellerDefaultAddress?.line2 || '',
  );
  const [pickupCity, setPickupCity] = useState(
    sellerDefaultAddress?.city || '',
  );
  const [pickupPostalCode, setPickupPostalCode] = useState(
    sellerDefaultAddress?.postal_code || '',
  );
  // The seller's saved address is fetched after mount; fill only the fields
  // the seller hasn't typed into yet.
  useEffect(() => {
    const a = sellerDefaultAddress;
    if (!a) return;
    const fill = (set: (fn: (v: string) => string) => void, v?: string | null) =>
      v && set((cur) => cur || v);
    fill(setPickupContactName, a.recipient_name);
    fill(setPickupContactPhone, a.phone);
    fill(setPickupLine1, a.line1);
    fill(setPickupLine2, a.line2);
    fill(setPickupCity, a.city);
    fill(setPickupPostalCode, a.postal_code);
  }, [sellerDefaultAddress]);

  const [pickupSelectedDate, setPickupSelectedDate] = useState<'tomorrow' | 'day_after'>('tomorrow');
  const [pickupConfirmed, setPickupConfirmed] = useState(false);
  const [pickupConfirmedDateStr, setPickupConfirmedDateStr] = useState<string | null>(null);
  const [bookingPickup, setBookingPickup] = useState(false);
  // Ready to deliver is one-time: once the order is past pending it's booked.
  const pickupBooked =
    pickupConfirmed ||
    ['packing', 'picked', 'shifting', 'delivered', 'completed'].includes(String(order?.fulfillment_status ?? ''));
  const orderClosed = isOrderClosed(order);
  const pickupCode = order?.pickup_code ?? null;
  const courierUrl = order?.id ? `${APP_URL}/courier/${order.id}` : '';
  const pickedUp = Boolean(order?.pickup_verified_at) ||
    ['shifting', 'delivered', 'completed'].includes(String(order?.fulfillment_status ?? ''));

  // Dynamic values resolving to exact mockup defaults when not supplied
  // Grabsty tracking ID: resolves on /track (track_order) for the buyer, the
  // seller and the team.
  const trackingNumber = propTrackingId || (order?.id ? trackingIdFor(order.id) : '—');

  // Derive status badge & item status badge (Clean & Role-Accurate)
  let statusBadge = propStatusLabel;
  if (!isSeller && (statusBadge === 'Ready to Deliver' || statusBadge === 'Awaiting Pickup' || statusBadge === 'Packing')) {
    statusBadge = 'Preparing Order';
  }

  statusBadge =
    statusBadge ||
    orderStatusBadge({
      status: order?.status,
      fulfillment: currentFulfillment,
      shipped: Boolean((order as any)?.shipped_at || (order as any)?.shifted_at),
      isSeller,
    });
  // An open dispute; a resolved one moves the status on (completed / refunded).
  const isDisputed = order?.status === 'disputed';


  // Sellers never see the buyer's delivery details: the server doesn't send
  // them (order_delivery_contacts is buyer/admin only), and the UI doesn't
  // render them either.
  const addr = isSeller ? {} : ((order?.shipping_address as any) || {});
  const deliveryCity = ((order?.shipping_address as any)?.city as string | undefined) || null;
  const buyerHandle = (order as any)?.buyer?.username ? `@${(order as any).buyer.username}` : 'Buyer';
  const recipient = isSeller
    ? buyerHandle
    : propReceiverName ||
      addr.recipientName ||
      addr.recipient_name ||
      (order as any)?.buyer?.full_name ||
      '—';

  const streetAddress = isSeller
    ? deliveryCity || '—'
    : propDeliveryAddress ||
      [addr.line1, addr.city].filter(Boolean).join(', ') ||
      '—';

  const phone = isSeller ? '—' : propContactPhone || addr.phone || '—';

  const item =
    propItemTitle ||
    listing?.title ||
    (order as any)?.listing?.title ||
    'Item';

  const note = isSeller ? null : propDeliveryNote || order?.delivery_notes || null;

  const carrierName = (order as any)?.courier_name || `${BRAND} Express`;

  const itemPhoto =
    listing?.images?.[0] ||
    (listing as any)?.photos?.[0] ||
    null;
  const itemCondition = conditionLabel((listing as any)?.condition);
  const orderIdNumber = order?.id ? orderReference(order.id) : '—';

  const actualItems = useMemo(() => {
    const rawItems = (order as any)?.order_items;
    if (rawItems && Array.isArray(rawItems) && rawItems.length > 0) {
      return rawItems.map((oi: any, idx: number) => ({
        id: oi.id || `item-${idx}`,
        title: oi.listing?.title || oi.title || item,
        orderId: `Order #${orderIdNumber}`,
        condition: oi.listing?.condition ? conditionLabel(oi.listing.condition) : itemCondition,
        photo: oi.listing?.images?.[0] || itemPhoto,
      }));
    }
    return [
      {
        id: 'item-1',
        title: listing?.title || (order as any)?.listing?.title || item,
        orderId: `Order #${orderIdNumber}`,
        condition: itemCondition,
        photo: itemPhoto,
      },
    ];
  }, [order, listing, item, orderIdNumber, itemCondition, itemPhoto]);

  // ── Dynamic order timestamps & live chronological event calculation ──
  const orderCreatedAt = useMemo(() => {
    const parsed = parseServerDate(order?.created_at);
    if (parsed) return parsed;
    return new Date(); // Fallback to real-time moment, never 5 hours in the past
  }, [order?.created_at]);

  const isCompleted =
    currentFulfillment === 'completed' ||
    Boolean(order?.completed_at) ||
    (order as any)?.escrow_status === 'COMPLETED_FUNDS_RELEASED';
  const isDelivered =
    currentFulfillment === 'delivered' ||
    isCompleted ||
    Boolean(order?.delivered_at) ||
    (order as any)?.escrow_status === 'DELIVERED';
  const isShipped =
    currentFulfillment === 'shifting' ||
    isDelivered ||
    Boolean(order?.shipped_at || (order as any)?.shifted_at) ||
    (order as any)?.escrow_status === 'IN_TRANSIT';
  const isPicked =
    currentFulfillment === 'picked' ||
    isShipped ||
    Boolean((order as any)?.picked_up_at || (order as any)?.picked_at);
  const isPacked =
    Boolean(order?.packed_at) ||
    pickupConfirmed ||
    isPicked;

  const deliveredTimestamp = parseServerDate(order?.delivered_at || order?.completed_at);
  const shippedTimestamp = parseServerDate(order?.shipped_at || (order as any)?.shifted_at);
  const pickedTimestamp = parseServerDate(
    (order as any)?.picked_up_at || (order as any)?.picked_at || order?.pickup_verified_at || order?.shipped_at || (order as any)?.shifted_at,
  );
  const packedTimestamp = parseServerDate(order?.packed_at);

  // Exact localized timestamps bounded so no stage ever prints into the future
  const placedTime = orderCreatedAt;
  const nowMs = Date.now();

  const packedTime = packedTimestamp || (isPicked
    ? new Date(Math.min(nowMs, placedTime.getTime() + Math.max(60000, Math.floor((nowMs - placedTime.getTime()) * 0.25))))
    : null);

  const pickedTime = pickedTimestamp || (isPicked
    ? new Date(Math.min(nowMs, (packedTime ? packedTime.getTime() : placedTime.getTime()) + Math.max(60000, Math.floor((nowMs - placedTime.getTime()) * 0.5))))
    : null);

  const transitTime = shippedTimestamp || (isShipped
    ? new Date(Math.min(nowMs, (pickedTime ? pickedTime.getTime() : placedTime.getTime()) + Math.max(60000, Math.floor((nowMs - placedTime.getTime()) * 0.75))))
    : null);

  const deliveredTime = deliveredTimestamp || (isDelivered
    ? new Date(Math.min(nowMs, (transitTime ? transitTime.getTime() : placedTime.getTime()) + 60000))
    : null);

  // Standard localized formatters for time and date
  const formatTime = (d: Date | null) => {
    if (!d || isNaN(d.getTime())) return 'Pending';
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  const formatDate = (d: Date | null) => {
    if (!d || isNaN(d.getTime())) return '';
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    if (isToday) return 'Today';
    return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  };

  // DEV-007: a step a cancelled order never reached isn't "Pending".
  const notReached = orderClosed ? '—' : 'Pending';
  const pickedTimeLabel = isPicked ? formatTime(pickedTime) : notReached;
  const transitTimeLabel = isShipped ? formatTime(transitTime) : notReached;
  const deliveredTimeLabel = isDelivered ? formatTime(deliveredTime) : notReached;
  const completedTime = parseServerDate(order?.completed_at);
  const disputedTime = parseServerDate(order?.disputed_at);
  const canceledTime = parseServerDate(
    (order as any)?.cancelled_at || (order as any)?.canceled_at || (order as any)?.updated_at,
  );

  // Available Pickup Dates (Rule 2: Tomorrow & Day after tomorrow)
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const dayAfterTomorrowDate = new Date();
  dayAfterTomorrowDate.setDate(dayAfterTomorrowDate.getDate() + 2);

  const tomorrowFormatted = tomorrowDate.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const dayAfterFormatted = dayAfterTomorrowDate.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  // Chronological activity timeline events with exact working times
  const activityEvents = [
    ...(orderClosed
      ? [
          {
            id: 'canceled',
            time: canceledTime ? formatTime(canceledTime) : '',
            date: formatDate(canceledTime),
            title: 'Order Cancelled',
            description: order?.cancel_reason ? `Reason: ${order.cancel_reason}` : 'This order was cancelled.',
            completed: true,
            isLatest: true,
          },
        ]
      : []),
    ...(isDisputed
      ? [
          {
            id: 'disputed',
            time: disputedTime ? formatTime(disputedTime) : '',
            date: formatDate(disputedTime),
            title: 'Issue Reported',
            description: isSeller
              ? 'The buyer reported a problem. Your payment is on hold while Grabsty reviews it.'
              : 'You reported a problem. Payment to the seller is on hold while Grabsty reviews it.',
            completed: true,
            isLatest: !orderClosed,
          },
        ]
      : []),
    ...(isCompleted && !isDisputed
      ? [
          {
            id: 'completed',
            time: completedTime ? formatTime(completedTime) : '',
            date: formatDate(completedTime),
            title: 'Order Completed',
            description: isSeller ? "Your payout is now due." : 'This order is complete.',
            completed: true,
            isLatest: true,
          },
        ]
      : []),
    ...(isDelivered && deliveredTime
      ? [
          {
            id: 'delivered',
            time: formatTime(deliveredTime),
            date: formatDate(deliveredTime),
            title: 'Package Delivered',
            description: isSeller ? 'Handed over to the buyer.' : `Handed over directly to ${recipient} at ${streetAddress}.`,
            completed: true,
            isLatest: !isCompleted && !isDisputed && !orderClosed,
          },
        ]
      : []),
    ...(isShipped && transitTime
      ? [
          {
            id: 'in_transit',
            time: formatTime(transitTime),
            date: formatDate(transitTime),
            title: 'Out for Delivery / In Transit',
            description: `Package is on the route via ${carrierName}.`,
            completed: true,
            isLatest: !isDelivered,
          },
        ]
      : []),
    ...(isPicked && pickedTime
      ? [
          {
            id: 'picked',
            time: formatTime(pickedTime),
            date: formatDate(pickedTime),
            title: 'Package Picked Up',
            description: `A Grabsty rider collected the parcel from the seller.`,
            completed: true,
            isLatest: !isShipped && !isDelivered,
          },
        ]
      : []),
    ...(isPacked && packedTime
      ? [
          {
            id: 'packed',
            time: formatTime(packedTime),
            date: formatDate(packedTime),
            title: 'Order Packed & Ready',
            description: `Seller booked a pickup. A rider will collect the parcel with the pickup code.`,
            completed: true,
            isLatest: !isPicked,
          },
        ]
      : []),
    {
      id: 'placed',
      time: formatTime(placedTime),
      date: formatDate(placedTime),
      title: order?.payment_method === 'cod' ? 'Order Placed (Cash on Delivery)' : 'Order Placed & Payment Confirmed',
      description: order?.payment_method === 'cod'
        ? `Order confirmed and awaiting seller dispatch. Pay upon physical delivery.`
        : `Payment secured under ${BRAND} Buyer Protection escrow guarantee.`,
      completed: true,
      isLatest: !isPacked && !isPicked && !isShipped && !isDelivered && !isDisputed && !orderClosed,
    },
  ];
  // Newest first: only the top entry is the latest.
  activityEvents.forEach((e, i) => {
    e.isLatest = i === 0;
  });

  // Clipboard Copy Action with haptics & feedback toast
  const handleCopyTracking = async () => {
    tap('light');
    try {
      await Clipboard.setStringAsync(trackingNumber);
      toast.done('Tracking ID copied to clipboard', 'copy');
    } catch {
      toast.show('Failed to copy tracking ID', {
        variant: 'default',
        icon: 'alert-triangle',
      });
    }
  };



  // Message the other party: straight into the order's chat thread (no
  // compose screen). The thread normally exists from checkout; if not it's
  // created, and anything unexpected falls back to the inbox.
  const [openingChat, setOpeningChat] = useState(false);
  const handleContactSeller = async () => {
    tap('light');
    if (openingChat) return;
    const listingId = listing?.id || order?.listing_id || null;
    if (!order?.buyer_id || !order?.seller_id) {
      router.push('/(tabs)/chat' as any);
      return;
    }
    setOpeningChat(true);
    try {
      const conv = await getOrCreateConversation({
        buyerId: order.buyer_id,
        sellerId: order.seller_id,
        listingId,
      });
      router.push((conv?.id ? `/conversation/${conv.id}` : '/(tabs)/chat') as any);
    } catch {
      router.push('/(tabs)/chat' as any);
    } finally {
      setOpeningChat(false);
    }
  };

  const handleBack = () => {
    tap('light');
    if (onBack) {
      onBack();
    } else {
      safeBack();
    }
  };

  // Save Ready to Deliver Pickup Schedule
  const handleConfirmPickupSchedule = async () => {
    if (!pickupContactName.trim()) {
      toast.show('Contact name is required', { variant: 'default', icon: 'alert-circle' });
      return;
    }
    if (!pickupContactPhone.trim()) {
      toast.show('Contact phone is required for courier pickup', { variant: 'default', icon: 'alert-circle' });
      return;
    }
    if (!pickupLine1.trim() || !pickupCity.trim()) {
      toast.show('Full pickup street address & city are required', { variant: 'default', icon: 'alert-circle' });
      return;
    }

    if (bookingPickup || pickupBooked) return;
    tap('medium');
    const chosenDateStr = pickupSelectedDate === 'tomorrow' ? tomorrowFormatted : dayAfterFormatted;

    if (onConfirmPickup) {
      setBookingPickup(true);
      try {
        await onConfirmPickup({
          recipientName: pickupContactName,
          phone: pickupContactPhone,
          line1: pickupLine1,
          line2: pickupLine2,
          city: pickupCity,
          postalCode: pickupPostalCode,
          pickupDate: chosenDateStr,
        });
        setPickupConfirmed(true);
        setPickupConfirmedDateStr(chosenDateStr);
        setReadyDeliverModalVisible(false);
        toast.done(`Pickup booked for ${chosenDateStr}`);
      } catch {
        // invoice screen already showed the server's message
      } finally {
        setBookingPickup(false);
      }
    }
  };

  // Safe bottom clearance accounting for the floating dock
  const bottomScrollPadding = Math.max(insets.bottom, 24) + 64;

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {/* ── Top Header Navigation Bar (Quiet Atelier Standard) ── */}
      <View
        style={{
          paddingTop: Platform.OS === 'ios' ? 10 : 12,
          paddingBottom: 10,
          paddingHorizontal: 16,
          backgroundColor: theme.background,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            maxWidth: CONTENT_MAX_WIDTH,
            width: '100%',
            alignSelf: 'center',
          }}
        >
          {/* Back Circular Button */}
          <Pressable
            onPress={handleBack}
            hitSlop={HIT_SLOP_8}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={({ pressed }) => ({
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: theme.surface,
              borderWidth: 1,
              borderColor: theme.border,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.75 : 1,
              transform: [{ scale: pressed ? 0.96 : 1 }],
            })}
          >
            <Feather name="arrow-left" size={18} color={theme.ink} />
          </Pressable>

          {/* Centered Screen Title */}
          <Text
            style={{
              fontSize: 16.5,
              fontFamily: typography.family.sansBold,
              color: theme.ink,
              letterSpacing: -0.2,
            }}
          >
            Tracking
          </Text>

          {/* Symmetrical Right Spacer */}
          <View style={{ width: 36 }} />
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: bottomScrollPadding,
          maxWidth: CONTENT_MAX_WIDTH,
          width: '100%',
          alignSelf: 'center',
        }}
      >
        {/* ── Card 1: Tracking Hero & Stepper (Picked / In Transit / Delivered) ── */}
        <GroupCard style={{ padding: 18 }}>
          {/* Tracking ID Header Row */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            {/* Package Isometric Icon Squircle */}
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                backgroundColor: theme.surface,
                borderWidth: 1,
                borderColor: theme.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="cube" size={20} color={theme.ink} />
            </View>

            {/* Tracking ID & Interactive Clipboard Pill */}
            <View style={{ flex: 1, marginLeft: 12, marginRight: 8 }}>
              <Text
                style={{
                  fontSize: 11.5,
                  color: theme.mute,
                  fontFamily: typography.family.sansMedium,
                  letterSpacing: 0.2,
                }}
              >
                Tracking ID:
              </Text>
              <Pressable
                onPress={handleCopyTracking}
                hitSlop={HIT_SLOP_8}
                accessibilityRole="button"
                accessibilityLabel={`Copy tracking ID ${trackingNumber}`}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  marginTop: 2,
                  opacity: pressed ? 0.75 : 1,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                })}
              >
                <Text
                  numberOfLines={1}
                  style={[
                    {
                      fontSize: 14,
                      fontFamily: typography.family.sansBold,
                      color: theme.ink,
                      letterSpacing: -0.3,
                      flexShrink: 1,
                    },
                    tabularNumberStyle,
                  ]}
                >
                  {trackingNumber}
                </Text>
                <View
                  style={{
                    marginLeft: 6,
                    padding: 3,
                    borderRadius: 4,
                    backgroundColor: theme.surface,
                  }}
                >
                  <Feather name="copy" size={12} color={theme.mute} />
                </View>
              </Pressable>
                {/* Canonical Status Pill */}
                <View
                  style={{
                    alignSelf: 'flex-start',
                    marginTop: 8,
                    height: 30,
                    borderRadius: 15,
                    backgroundColor: isDark ? 'rgba(108, 71, 255, 0.16)' : '#F2F3FE',
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(108, 71, 255, 0.32)' : 'rgba(83, 86, 238, 0.22)',
                    paddingHorizontal: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontFamily: typography.family.sansBold,
                      color: isDark ? '#A5B4FC' : '#5356EE',
                      letterSpacing: -0.1,
                    }}
                  >
                    {statusBadge}
                  </Text>
                </View>
            </View>

            {order?.id ? (
              <Pressable
                testID="track-order-link"
                onPress={() => {
                  tap('light');
                  router.push(`/track?code=${encodeURIComponent(trackingNumber)}` as any);
                }}
                hitSlop={HIT_SLOP_8}
                accessibilityRole="link"
                accessibilityLabel="Open tracking page"
                style={({ pressed }) => ({
                  alignSelf: 'flex-start',
                  height: 30,
                  borderRadius: 15,
                  paddingHorizontal: 14,
                  justifyContent: 'center',
                  backgroundColor: theme.panel,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: theme.border,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ fontSize: 13, fontFamily: typography.family.sansSemibold, color: theme.ink }}>Track</Text>
              </Pressable>
            ) : null}
          </View>

          {/* Stepper Progress Nodes: Picked -> In Transit -> Delivered */}
          <View style={{ marginTop: 22, paddingHorizontal: 4 }}>
            {/* Top Node Track Bar */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              {/* Node 1: Picked (Completed) */}
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  backgroundColor: isPicked ? theme.ink : isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 2,
                }}
              >
                {isPicked ? (
                  <Feather name="check" size={11} color={theme.background} strokeWidth={3} />
                ) : null}
              </View>

              {/* Line 1 -> 2 */}
              <View
                style={{
                  flex: 1,
                  height: 2.5,
                  backgroundColor: isShipped ? theme.ink : isDark ? 'rgba(255,255,255,0.12)' : theme.hairline,
                  marginHorizontal: -2,
                  zIndex: 1,
                }}
              />

              {/* Node 2: In Transit */}
              <View
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  borderWidth: isShipped && !isDelivered ? 2.5 : 0,
                  borderColor: isDark ? '#6C47FF' : '#5356EE',
                  backgroundColor: isShipped ? theme.ink : isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 3,
                }}
              >
                {isShipped ? (
                  <Feather name="check" size={10} color={theme.background} strokeWidth={3} />
                ) : null}
              </View>

              {/* Line 2 -> 3 */}
              <View
                style={{
                  flex: 1,
                  height: 2.5,
                  backgroundColor: isDelivered ? theme.ink : isDark ? 'rgba(255,255,255,0.12)' : theme.hairline,
                  marginHorizontal: -2,
                  zIndex: 1,
                }}
              />

              {/* Node 3: Delivered */}
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  backgroundColor: isDelivered ? theme.ink : isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 2,
                }}
              >
                {isDelivered && (
                  <Feather name="check" size={11} color={theme.background} strokeWidth={3} />
                )}
              </View>
            </View>

            {/* Labels Beneath Stepper Nodes */}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginTop: 8,
              }}
            >
              {/* Step 1 Label: Picked */}
              <View style={{ alignItems: 'flex-start', minWidth: 68 }}>
                <Text
                  style={{
                    fontSize: 12,
                    fontFamily: typography.family.sansBold,
                    color: isPicked ? theme.ink : theme.mute,
                  }}
                >
                  Picked
                </Text>
                <Text
                  style={[
                    {
                      fontSize: 11,
                      color: theme.mute,
                      fontFamily: typography.family.sans,
                      marginTop: 1,
                    },
                    tabularNumberStyle,
                  ]}
                >
                  {pickedTimeLabel}
                </Text>
              </View>

              {/* Step 2 Label: In Transit */}
              <View style={{ alignItems: 'center', minWidth: 68 }}>
                <Text
                  style={{
                    fontSize: 12,
                    fontFamily: typography.family.sansBold,
                    color: isShipped ? (isDark ? '#A5B4FC' : '#5356EE') : theme.mute,
                  }}
                >
                  In Transit
                </Text>
                <Text
                  style={[
                    {
                      fontSize: 11,
                      color: theme.mute,
                      fontFamily: typography.family.sans,
                      marginTop: 1,
                    },
                    tabularNumberStyle,
                  ]}
                >
                  {transitTimeLabel}
                </Text>
              </View>

              {/* Step 3 Label: Delivered */}
              <View style={{ alignItems: 'flex-end', minWidth: 68 }}>
                <Text
                  style={{
                    fontSize: 12,
                    fontFamily: typography.family.sansBold,
                    color: isDelivered ? theme.ink : theme.mute,
                  }}
                >
                  Delivered
                </Text>
                <Text
                  style={[
                    {
                      fontSize: 11,
                      color: theme.mute,
                      fontFamily: typography.family.sans,
                      marginTop: 1,
                    },
                    tabularNumberStyle,
                  ]}
                >
                  {deliveredTimeLabel}
                </Text>
              </View>
            </View>
          </View>

        </GroupCard>

        {/* ── Seller: Pickup QR code + Ready to deliver (the only booking button) ── */}
        {isSeller && !orderClosed ? (
          <GroupCard>
            <Pressable
              testID="pickup-qr-row"
              disabled={!pickupBooked || !pickupCode}
              onPress={() => {
                tap('light');
                setLabelModalVisible(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Pickup QR code"
              accessibilityState={{ disabled: !pickupBooked || !pickupCode }}
              style={({ pressed }) => [
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  minHeight: 60,
                  gap: 12,
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : theme.hairline,
                },
                pressed && { backgroundColor: theme.surface },
              ]}
            >
              <Ionicons name="qr-code-outline" size={20} color={pickupBooked ? theme.ink : theme.mute} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15.5, fontFamily: typography.family.sansBold, color: pickupBooked ? theme.ink : theme.mute }}>
                  Pickup QR code
                </Text>
                <Text style={{ fontSize: 12.5, color: theme.mute, fontFamily: typography.family.sans, marginTop: 2 }}>
                  {pickedUp
                    ? isDelivered
                      ? 'Scanned by the courier · delivered'
                      : 'Scanned by the courier · in transit'
                    : pickupBooked
                      ? 'Show it to the courier at pickup'
                      : 'Available after Ready to deliver'}
                </Text>
              </View>
              {pickupBooked && pickupCode ? <Feather name="chevron-right" size={18} color={theme.mute} /> : null}
            </Pressable>

            <Pressable
              testID="ready-to-deliver-row"
              disabled={pickupBooked}
              onPress={() => {
                tap('light');
                setReadyDeliverModalVisible(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Ready to deliver"
              accessibilityState={{ disabled: pickupBooked }}
              style={({ pressed }) => [
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  minHeight: 60,
                  gap: 12,
                },
                pressed && { backgroundColor: theme.surface },
              ]}
            >
              <Ionicons name="cube-outline" size={20} color={theme.ink} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15.5, fontFamily: typography.family.sansBold, color: theme.ink }}>
                  Ready to deliver
                </Text>
                <Text style={{ fontSize: 12.5, color: theme.mute, fontFamily: typography.family.sans, marginTop: 2 }}>
                  {pickupBooked
                    ? `Pickup booked${pickupConfirmedDateStr ? ` for ${pickupConfirmedDateStr}` : ''} · can't be changed`
                    : 'Book the courier once the item is packed'}
                </Text>
              </View>
              {pickupBooked ? (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    height: 26,
                    paddingHorizontal: 10,
                    borderRadius: 13,
                    backgroundColor: theme.surface,
                  }}
                >
                  <Feather name="lock" size={11} color={theme.ink} />
                  <Text style={{ fontSize: 12, fontFamily: typography.family.sansSemibold, color: theme.ink }}>Booked</Text>
                </View>
              ) : (
                <View
                  style={{
                    height: 32,
                    paddingHorizontal: 14,
                    borderRadius: 10,
                    backgroundColor: theme.purple,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 13, fontFamily: typography.family.sansBold, color: '#FFFFFF' }}>Book pickup</Text>
                </View>
              )}
            </Pressable>
          </GroupCard>
        ) : null}

        {/* ── WEB-003: an open issue puts the payment on hold; say so to both sides ── */}
        {isDisputed && !orderClosed ? (
          <GroupCard style={{ padding: 16, marginBottom: 16, flexDirection: 'row', gap: 12 }}>
            <Feather name="alert-triangle" size={20} color={theme.ink} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontFamily: typography.family.sansBold, color: theme.ink }}>
                {isSeller ? 'The buyer reported an issue' : 'You reported an issue'}
              </Text>
              <Text style={{ fontSize: 13, color: theme.mute, marginTop: 4, lineHeight: 18 }}>
                {isSeller
                  ? 'Your payment for this order is on hold while Grabsty reviews it. Our support team will contact you in Support chat.'
                  : 'Payment to the seller is on hold while Grabsty reviews it. Our support team will reply in Support chat.'}
              </Text>
            </View>
          </GroupCard>
        ) : null}

        {/* ── DEV-008 / WF-003: what this order costs (buyer) or earns (seller) ── */}
        {order && !orderClosed && Number.isFinite(order.amount_cents) ? (
          <GroupCard style={{ padding: 16, marginBottom: 16 }}>
            {(() => {
              const money = orderMoneyLines(order as any, isSeller);
              const row = (label: string, cents: number, bold = false) => (
                <View
                  key={label}
                  style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: bold ? 10 : 4 }}
                >
                  <Text
                    style={{
                      fontSize: bold ? 15 : 13.5,
                      color: bold ? theme.ink : theme.mute,
                      fontFamily: bold ? typography.family.sansBold : typography.family.sans,
                    }}
                  >
                    {label}
                  </Text>
                  <Text
                    style={[
                      {
                        fontSize: bold ? 15 : 13.5,
                        color: theme.ink,
                        fontFamily: bold ? typography.family.sansBold : typography.family.sans,
                      },
                      tabularNumberStyle,
                    ]}
                  >
                    {formatPrice(cents / 100)}
                  </Text>
                </View>
              );
              return (
                <>
                  {money.lines.map((l) => row(l.label, l.cents))}
                  {row(money.total.label, money.total.cents, true)}
                  {isSeller ? (
                    <Text style={{ fontSize: 12.5, color: theme.mute, marginTop: 6 }}>
                      Buyer protection and delivery are paid by the buyer.
                    </Text>
                  ) : null}
                </>
              );
            })()}
          </GroupCard>
        ) : null}

        {/* ── Items Overview Card ── */}
        <GroupCard style={{ padding: 18, marginBottom: 16 }}>
          {/* Header Row */}
          <View style={{ marginBottom: 14 }}>
            <Text
              style={{
                fontSize: 18,
                fontFamily: typography.family.sansBold,
                color: theme.ink,
                letterSpacing: -0.3,
              }}
            >
              {isSeller && !pickedUp && !orderClosed ? 'Items to pack' : 'Order details'}
            </Text>
                <Text
                  style={{
                    fontSize: 13,
                    fontFamily: typography.family.sans,
                    color: theme.mute,
                    marginTop: 2,
                  }}
                >
                  {actualItems.length} {actualItems.length === 1 ? 'Item' : 'Items'}
                </Text>
              </View>

              {/* Items List (Dynamic Order Items) */}
              {actualItems.map((sItem) => (
                <View
                  key={sItem.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    paddingVertical: 14,
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: isDark ? 'rgba(255, 255, 255, 0.08)' : theme.hairline,
                  }}
                >
                  {/* Square Thumbnail with subtle radius */}
                  <Image
                    source={{ uri: getOptimizedImageUrl(sItem.photo, { width: 200 }) }}
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: 8,
                      backgroundColor: theme.surface,
                      borderWidth: 1,
                      borderColor: theme.border,
                      marginRight: 14,
                    }}
                    contentFit="cover"
                  />

                  {/* Item Information */}
                  <View style={{ flex: 1 }}>
                    {/* Title */}
                    <Text
                      style={{
                        fontSize: 15,
                        fontFamily: typography.family.sansBold,
                        color: theme.ink,
                        letterSpacing: -0.2,
                        lineHeight: 20,
                        marginBottom: 3,
                      }}
                      numberOfLines={2}
                    >
                      {sItem.title}
                    </Text>

                    {/* Order ID Link */}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Copy ${sItem.orderId}`}
                      onPress={() => {
                        tap('light');
                        Clipboard.setStringAsync(sItem.orderId.replace('Order #', ''))
                          .then(() => toast.done('Order number copied', 'copy'))
                          .catch(() => {});
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13.5,
                          fontFamily: typography.family.sansBold,
                          color: theme.purple,
                          marginBottom: 3,
                        }}
                      >
                        {sItem.orderId}
                      </Text>
                    </Pressable>

                    {/* Condition Metadata */}
                    <Text
                      style={{
                        fontSize: 12.5,
                        fontFamily: typography.family.sans,
                        color: theme.mute,
                      }}
                    >
                      {formatCondition(sItem.condition)}
                    </Text>
                  </View>
                </View>
              ))}
            </GroupCard>

            {/* ── Section: Delivery Details ── */}
            <SectionEyebrow title="Delivery Details" icon="truck" />
            <GroupCard>
              {isSeller ? (
                // Sellers never get the buyer's address or phone; the courier handles delivery.
                <>
                  <KeyValueRow label="Buyer" value={recipient} />
                  {deliveryCity ? <KeyValueRow label="Delivery city" value={deliveryCity} /> : null}
                  <KeyValueRow label="Courier" value={carrierName} />
                </>
              ) : (
                <>
                  <KeyValueRow label="Receiver" value={recipient} />
                  <KeyValueRow label="Address" value={streetAddress} />
                  <KeyValueRow label="Contact" value={phone} />
                  <KeyValueRow label="Courier" value={carrierName} />
                </>
              )}
              {note ? (
                <KeyValueRow
                  label="Note"
                  rightElement={
                    <View
                      style={{
                        height: 30,
                        borderRadius: 15,
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: isDark ? 'rgba(239, 68, 68, 0.16)' : '#FEF2F2',
                        paddingHorizontal: 12,
                        borderWidth: 1,
                        borderColor: isDark ? 'rgba(239, 68, 68, 0.3)' : '#FECACA',
                      }}
                    >
                      <Feather
                        name="alert-triangle"
                        size={12}
                        color={theme.danger}
                        style={{ marginRight: 5 }}
                      />
                      <Text
                        style={{
                          fontSize: 12,
                          fontFamily: typography.family.sansBold,
                          color: theme.danger,
                        }}
                      >
                        {note}
                      </Text>
                    </View>
                  }
                />
              ) : null}

              {/* Message Buyer / Seller Action (Integrated in Delivery Details) */}
              <Pressable
                onPress={handleContactSeller}
                accessibilityRole="button"
                accessibilityLabel={isSeller ? 'Message Buyer' : 'Message Seller'}
                style={({ pressed }) => [
                  {
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    minHeight: 52,
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : theme.hairline,
                  },
                  pressed && { opacity: 0.75, backgroundColor: theme.surface },
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 8 }}>
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F3F4F6',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Feather name="message-square" size={16} color={theme.ink} />
                  </View>

                  <Text
                    style={{
                      fontSize: 14.5,
                      fontFamily: typography.family.sansBold,
                      color: theme.ink,
                      marginLeft: 12,
                      letterSpacing: -0.2,
                    }}
                  >
                    {isSeller ? 'Message Buyer' : 'Message Seller'}
                  </Text>
                </View>

                <Feather name="chevron-right" size={18} color={theme.mute} />
              </Pressable>
            </GroupCard>

            {/* ── Chronological Activity Timeline (Bottom of Fulfillment View) ── */}
            {activityEvents.length > 0 ? (
              <>
                <SectionEyebrow title="Activity Timeline" icon="activity" badge={`${activityEvents.length} ${activityEvents.length === 1 ? 'update' : 'updates'}`} />
                <GroupCard style={{ padding: 18 }}>
                  {activityEvents.map((evt, idx) => {
                    const isLast = idx === activityEvents.length - 1;
                    return (
                      <View key={evt.id} style={{ flexDirection: 'row', minHeight: isLast ? 48 : 64 }}>
                        {/* Timestamp Column */}
                        <View style={{ width: 84, paddingRight: 6 }}>
                          <Text
                            style={[
                              {
                                fontSize: 13,
                                fontFamily: typography.family.sansBold,
                                color: theme.ink,
                              },
                              tabularNumberStyle,
                            ]}
                          >
                            {evt.time}
                          </Text>
                          <Text
                            style={[
                              {
                                fontSize: 11,
                                color: theme.mute,
                                fontFamily: typography.family.sans,
                                marginTop: 1,
                              },
                              tabularNumberStyle,
                            ]}
                          >
                            {evt.date}
                          </Text>
                        </View>

                        {/* Stepper Node & Connector */}
                        <View style={{ alignItems: 'center', width: 22 }}>
                          <View
                            style={{
                              width: evt.isLatest ? 20 : 18,
                              height: evt.isLatest ? 20 : 18,
                              borderRadius: evt.isLatest ? 10 : 9,
                              backgroundColor: theme.ink,
                              borderWidth: evt.isLatest ? 2 : 0,
                              borderColor: theme.purple,
                              alignItems: 'center',
                              justifyContent: 'center',
                              zIndex: 2,
                            }}
                          >
                            <Feather name="check" size={10} color={theme.background} strokeWidth={3} />
                          </View>
                          {!isLast && (
                            <View
                              style={{
                                flex: 1,
                                width: 1,
                                borderWidth: 1,
                                borderStyle: 'dashed',
                                borderColor: isDark ? 'rgba(255,255,255,0.2)' : theme.hairline,
                                marginVertical: 4,
                              }}
                            />
                          )}
                        </View>

                        {/* Event Description */}
                        <View style={{ flex: 1, paddingLeft: 12, paddingBottom: isLast ? 0 : 16 }}>
                          <Text
                            style={{
                              fontSize: 13.5,
                              color: theme.ink,
                              fontFamily: typography.family.sansBold,
                              marginBottom: 2,
                            }}
                          >
                            {evt.title}
                          </Text>
                          <Text
                            style={{
                              fontSize: 12.5,
                              color: theme.mute,
                              lineHeight: 17,
                              fontFamily: typography.family.sansMedium,
                            }}
                          >
                            {evt.description}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </GroupCard>
              </>
            ) : null}

        {/* ── Contextual Order Action Buttons (Invoice E2E & Flow Compliant) ── */}
        {actionButtons ? (
          <View style={{ paddingBottom: 12 }}>
            {actionButtons}
          </View>
        ) : null}
      </ScrollView>



      {/* ── Pickup QR code: the courier scans it and enters the code to lock the order In Transit ── */}
      <Modal
        visible={labelModalVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setLabelModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: theme.overlay, justifyContent: 'flex-end' }}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setLabelModalVisible(false)} accessibilityLabel="Close" />
          <View
            style={{
              backgroundColor: theme.panel,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderColor: theme.border,
              paddingHorizontal: 20,
              paddingTop: 12,
              paddingBottom: Math.max(insets.bottom, 16) + 8,
              maxWidth: CONTENT_MAX_WIDTH,
              width: '100%',
              alignSelf: 'center',
            }}
          >
            <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: theme.hairline, marginBottom: 14 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <Text style={{ fontSize: 18, fontFamily: typography.family.sansBold, color: theme.ink, letterSpacing: -0.3 }}>
                Pickup QR code
              </Text>
              <Pressable
                onPress={() => setLabelModalVisible(false)}
                hitSlop={HIT_SLOP_8}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={({ pressed }) => ({
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  backgroundColor: theme.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Feather name="x" size={18} color={theme.ink} />
              </Pressable>
            </View>

            {pickedUp ? (
              <View style={{ alignItems: 'center', paddingVertical: 28 }}>
                <Feather name="truck" size={30} color={theme.ink} />
                <Text style={{ fontSize: 16, fontFamily: typography.family.sansBold, color: theme.ink, marginTop: 12 }}>
                  Picked up · in transit
                </Text>
                <Text style={{ fontSize: 13, color: theme.mute, marginTop: 6, textAlign: 'center' }}>
                  The courier verified the pickup code. This order is locked.
                </Text>
              </View>
            ) : (
              <>
                <View style={{ alignItems: 'center' }}>
                  <View
                    style={{
                      padding: 14,
                      borderRadius: 16,
                      backgroundColor: '#FFFFFF',
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor: theme.border,
                    }}
                  >
                    {courierUrl ? <QRCode value={courierUrl} size={196} color="#111111" backgroundColor="#FFFFFF" /> : null}
                  </View>
                  <Text style={{ fontSize: 12, color: theme.mute, fontFamily: typography.family.sansSemibold, marginTop: 18, letterSpacing: 0.4 }}>
                    PICKUP CODE
                  </Text>
                  <Text
                    testID="pickup-code"
                    selectable
                    style={[
                      { fontSize: 34, fontFamily: typography.family.sansBold, color: theme.ink, letterSpacing: 6, marginTop: 4 },
                      tabularNumberStyle,
                    ]}
                  >
                    {pickupCode ? `${pickupCode.slice(0, 3)} ${pickupCode.slice(3)}` : '— — —'}
                  </Text>
                </View>
                <View style={{ marginTop: 18, gap: 10 }}>
                  {[
                    'Hand the packed item to the courier.',
                    'The rider scans this QR, signs in to the rider dashboard and enters the pickup code.',
                    'The order locks as In Transit automatically. Only share the code with the rider in person.',
                  ].map((t, i) => (
                    <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
                      <Text style={{ width: 18, fontSize: 13, fontFamily: typography.family.sansBold, color: theme.ink }}>{i + 1}.</Text>
                      <Text style={{ flex: 1, fontSize: 13, lineHeight: 19, color: theme.mute, fontFamily: typography.family.sans }}>{t}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Modal 2: "Ready to Deliver" - Pickup Address & 2-Date Selection (Rule 2) ── */}
      <Modal
        visible={readyDeliverModalVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => (bookingPickup ? undefined : setReadyDeliverModalVisible(false))}
      >
        <View style={{ flex: 1, backgroundColor: theme.overlay, justifyContent: 'flex-end' }}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => (bookingPickup ? undefined : setReadyDeliverModalVisible(false))}
            accessibilityLabel="Close"
          />
          <KeyboardAvoider style={{ width: '100%', maxHeight: '92%' }}>
          <View
            style={[
              {
                backgroundColor: theme.panel,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                borderTopWidth: StyleSheet.hairlineWidth,
                borderColor: theme.border,
                paddingHorizontal: 20,
                paddingTop: 16,
                paddingBottom: Math.max(insets.bottom, 20) + 12,
                maxHeight: '100%',
                maxWidth: CONTENT_MAX_WIDTH,
                width: '100%',
                alignSelf: 'center',
              },
              shadow.lg,
            ]}
          >
            {/* Header */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: 12,
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: theme.border,
                marginBottom: 16,
              }}
            >
              <View>
                <Text style={{ fontSize: 17, fontFamily: typography.family.sansBold, color: theme.ink }}>
                  Ready to deliver
                </Text>
                <Text style={{ fontSize: 12, color: theme.mute, fontFamily: typography.family.sans, marginTop: 2 }}>
                  Where and when the courier should collect the item
                </Text>
              </View>

              <Pressable
                onPress={() => setReadyDeliverModalVisible(false)}
                hitSlop={HIT_SLOP_8}
                style={({ pressed }) => ({
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: theme.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.75 : 1,
                })}
              >
                <Feather name="x" size={16} color={theme.ink} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
              {/* Pickup Address Fields */}
              <Text style={{ fontSize: 13, fontFamily: typography.family.sansSemibold, color: theme.ink, marginBottom: 8 }}>
                Pickup address
              </Text>

              <View style={{ gap: 10, marginBottom: 16 }}>
                <TextInput
                  value={pickupLine1}
                  onChangeText={setPickupLine1}
                  placeholder="House / street (e.g. 12 Main Boulevard, Gulberg)"
                  placeholderTextColor={theme.mute}
                  style={{
                    height: 46,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: theme.border,
                    backgroundColor: theme.surface,
                    paddingHorizontal: 14,
                    fontSize: 14,
                    color: theme.ink,
                    fontFamily: typography.family.sans,
                  }}
                />
                <TextInput
                  value={pickupLine2}
                  onChangeText={setPickupLine2}
                  placeholder="Apartment, floor (optional)"
                  placeholderTextColor={theme.mute}
                  style={{
                    height: 46,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: theme.border,
                    backgroundColor: theme.surface,
                    paddingHorizontal: 14,
                    fontSize: 14,
                    color: theme.ink,
                    fontFamily: typography.family.sans,
                  }}
                />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TextInput
                    value={pickupCity}
                    onChangeText={setPickupCity}
                    placeholder="City"
                    placeholderTextColor={theme.mute}
                    style={{
                      flex: 1,
                      height: 46,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: theme.border,
                      backgroundColor: theme.surface,
                      paddingHorizontal: 14,
                      fontSize: 14,
                      color: theme.ink,
                      fontFamily: typography.family.sans,
                    }}
                  />
                  <TextInput
                    value={pickupPostalCode}
                    onChangeText={setPickupPostalCode}
                    placeholder="Postal code"
                    placeholderTextColor={theme.mute}
                    style={{
                      width: 110,
                      height: 46,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: theme.border,
                      backgroundColor: theme.surface,
                      paddingHorizontal: 14,
                      fontSize: 14,
                      color: theme.ink,
                      fontFamily: typography.family.sans,
                    }}
                  />
                </View>
              </View>

              {/* Necessary Contact Details */}
              <Text style={{ fontSize: 13, fontFamily: typography.family.sansSemibold, color: theme.ink, marginBottom: 8 }}>
                Contact at pickup
              </Text>

              <View style={{ gap: 10, marginBottom: 18 }}>
                <TextInput
                  value={pickupContactName}
                  onChangeText={setPickupContactName}
                  placeholder="Name"
                  placeholderTextColor={theme.mute}
                  style={{
                    height: 46,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: theme.border,
                    backgroundColor: theme.surface,
                    paddingHorizontal: 14,
                    fontSize: 14,
                    color: theme.ink,
                    fontFamily: typography.family.sans,
                  }}
                />
                <TextInput
                  value={pickupContactPhone}
                  onChangeText={setPickupContactPhone}
                  placeholder="Phone, for the courier (03XXXXXXXXX)"
                  keyboardType="phone-pad"
                  placeholderTextColor={theme.mute}
                  style={{
                    height: 46,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: theme.border,
                    backgroundColor: theme.surface,
                    paddingHorizontal: 14,
                    fontSize: 14,
                    color: theme.ink,
                    fontFamily: typography.family.sans,
                  }}
                />
              </View>

              {/* 2 Dates Selection: Tomorrow vs Day After (Rule 2) */}
              <Text style={{ fontSize: 13, fontFamily: typography.family.sansSemibold, color: theme.ink, marginBottom: 8 }}>
                Pickup day
              </Text>

              <View style={{ gap: 10, marginBottom: 22 }}>
                {/* Date Option 1: Tomorrow */}
                <Pressable
                  onPress={() => {
                    tap('light');
                    setPickupSelectedDate('tomorrow');
                  }}
                  style={({ pressed }) => [
                    {
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: 14,
                      borderRadius: 12,
                      borderWidth: 1.5,
                      borderColor: pickupSelectedDate === 'tomorrow' ? theme.purple : theme.border,
                      backgroundColor:
                        pickupSelectedDate === 'tomorrow'
                          ? isDark
                            ? 'rgba(108, 71, 255, 0.14)'
                            : '#F2F3FE'
                          : theme.surface,
                    },
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 10,
                        borderWidth: 2,
                        borderColor: pickupSelectedDate === 'tomorrow' ? theme.purple : theme.mute,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {pickupSelectedDate === 'tomorrow' && (
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: theme.purple }} />
                      )}
                    </View>

                    <View>
                      <Text style={{ fontSize: 14.5, fontFamily: typography.family.sansBold, color: theme.ink }}>
                        Tomorrow ({tomorrowFormatted})
                      </Text>
                      <Text style={{ fontSize: 12, color: theme.mute, fontFamily: typography.family.sans, marginTop: 1 }}>
                        Pickup window: 10:00 AM – 2:00 PM
                      </Text>
                    </View>
                  </View>

                </Pressable>

                {/* Date Option 2: The Day After That */}
                <Pressable
                  onPress={() => {
                    tap('light');
                    setPickupSelectedDate('day_after');
                  }}
                  style={({ pressed }) => [
                    {
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: 14,
                      borderRadius: 12,
                      borderWidth: 1.5,
                      borderColor: pickupSelectedDate === 'day_after' ? theme.purple : theme.border,
                      backgroundColor:
                        pickupSelectedDate === 'day_after'
                          ? isDark
                            ? 'rgba(108, 71, 255, 0.14)'
                            : '#F2F3FE'
                          : theme.surface,
                    },
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 10,
                        borderWidth: 2,
                        borderColor: pickupSelectedDate === 'day_after' ? theme.purple : theme.mute,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {pickupSelectedDate === 'day_after' && (
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: theme.purple }} />
                      )}
                    </View>

                    <View>
                      <Text style={{ fontSize: 14.5, fontFamily: typography.family.sansBold, color: theme.ink }}>
                        Day after tomorrow ({dayAfterFormatted})
                      </Text>
                      <Text style={{ fontSize: 12, color: theme.mute, fontFamily: typography.family.sans, marginTop: 1 }}>
                        Pickup window: 11:00 AM – 3:00 PM
                      </Text>
                    </View>
                  </View>
                </Pressable>
              </View>

              {/* Final step: can't be undone */}
              <View
                style={{
                  flexDirection: 'row',
                  gap: 10,
                  padding: 12,
                  borderRadius: 10,
                  backgroundColor: theme.surface,
                  marginBottom: 14,
                }}
              >
                <Feather name="lock" size={14} color={theme.ink} style={{ marginTop: 2 }} />
                <Text style={{ flex: 1, fontSize: 12.5, lineHeight: 18, color: theme.ink, fontFamily: typography.family.sans }}>
                  This books the courier and can&apos;t be undone or booked again. After confirming you won&apos;t be able to cancel the order.
                </Text>
              </View>

              {/* Confirm CTA */}
              <Pressable
                testID="confirm-ready-to-deliver"
                onPress={handleConfirmPickupSchedule}
                disabled={bookingPickup}
                accessibilityRole="button"
                accessibilityLabel="Confirm ready to deliver"
                style={({ pressed }) => ({
                  height: 48,
                  borderRadius: 10,
                  backgroundColor: theme.ink,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: bookingPickup ? 0.6 : pressed ? 0.88 : 1,
                })}
              >
                <Text
                  style={{
                    fontSize: 15,
                    fontFamily: typography.family.sansBold,
                    color: theme.background,
                    letterSpacing: -0.2,
                  }}
                >
                  {bookingPickup ? 'Booking pickup…' : 'Confirm ready to deliver'}
                </Text>
              </Pressable>
            </ScrollView>
          </View>
          </KeyboardAvoider>
        </View>
      </Modal>


    </View>
  );
}
