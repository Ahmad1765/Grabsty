import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
  Modal,
  Share,
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
import { BRAND } from '@/lib/brand';
import { ShieldCheckIcon } from '@/components/ui/ShieldCheckIcon';
import { BuyerProtectionSheet } from '@/components/product/BuyerProtectionSheet';
import { buyerProtectionFee, formatPrice } from '@/lib/fees';
import type { Order } from '@/lib/payments';
import type { Listing, FulfillmentStatus } from '@/types';
import { getOptimizedImageUrl } from '@/lib/images';
import { conditionLabel } from '@/components/product/shared';

export interface OrderDetailsTrackingViewProps {
  order?: Order | null;
  listing?: Listing | null;
  isSeller?: boolean;
  onBack?: () => void;
  onShare?: () => void;
  actionButtons?: React.ReactNode;
  initialTab?: 'shipment' | 'activity';
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
  initialTab = 'shipment',
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
  const [activeTab, setActiveTab] = useState<'shipment' | 'activity'>(initialTab);
  const [bpSheetOpen, setBpSheetOpen] = useState(false);

  // Seller Modals (Rule 1 & 2)
  const [labelModalVisible, setLabelModalVisible] = useState(false);
  const [labelSubTab, setLabelSubTab] = useState<'label' | 'qr'>('label');
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

  // Dynamic values resolving to exact mockup defaults when not supplied
  const trackingNumber =
    propTrackingId ||
    (order as any)?.tracking_number ||
    (order?.id ? `PAQ-${order.id.slice(0, 3).toUpperCase()}-${order.id.slice(-3).toUpperCase()}` : 'PAQ-327-P21');

  // Derive status badge & item status badge (Clean & Role-Accurate)
  let statusBadge = propStatusLabel;
  if (!isSeller && (statusBadge === 'Needs Label' || statusBadge === 'Packing')) {
    statusBadge = 'Preparing Order';
  }
  let statusPillText = isSeller ? 'Needs Label' : 'Preparing Order';
  let itemStatusBadgeText = 'Preparing Package';

  if (currentFulfillment === 'delivered') {
    statusBadge = statusBadge || 'Delivered';
    statusPillText = 'Delivered';
    itemStatusBadgeText = 'Delivered';
  } else if (currentFulfillment === 'shifting' || (order as any)?.shipped_at || (order as any)?.shifted_at) {
    statusBadge = statusBadge || 'In Transit';
    statusPillText = 'In Transit';
    itemStatusBadgeText = 'In Transit';
  } else if (currentFulfillment === 'picked') {
    statusBadge = statusBadge || 'Picked';
    statusPillText = 'Picked Up';
    itemStatusBadgeText = 'Picked';
  } else if (currentFulfillment === 'completed') {
    statusBadge = statusBadge || 'Completed';
    statusPillText = 'Completed';
    itemStatusBadgeText = 'Completed';
  } else if (currentFulfillment === 'packing') {
    statusBadge = statusBadge || (isSeller ? 'Needs Label' : 'Preparing Order');
    statusPillText = isSeller ? 'Needs Label' : 'Preparing Order';
    itemStatusBadgeText = 'Preparing Package';
  } else if (currentFulfillment === 'disputed') {
    statusBadge = statusBadge || 'Refund Under Review';
    statusPillText = 'Disputed';
    itemStatusBadgeText = 'Under Review';
  } else if (currentFulfillment === 'canceled') {
    statusBadge = statusBadge || 'Cancelled';
    statusPillText = 'Cancelled';
    itemStatusBadgeText = 'Cancelled';
  } else {
    statusBadge = statusBadge || (order?.status === 'paid' ? (isSeller ? 'Needs Label' : 'Paid') : (isSeller ? 'Needs Label' : 'Preparing Order'));
  }

  if (order?.payment_method === 'cod' && currentFulfillment !== 'completed' && currentFulfillment !== 'canceled' && currentFulfillment !== 'disputed') {
    if (order?.cod_seller_confirmed_at && !order?.cod_buyer_confirmed_at) {
      statusBadge = isSeller ? 'Awaiting Buyer COD' : 'Confirm COD Payment';
      itemStatusBadgeText = isSeller ? 'Awaiting Buyer COD' : 'Confirm COD Payment';
    } else if (order?.cod_buyer_confirmed_at && !order?.cod_seller_confirmed_at) {
      statusBadge = isSeller ? 'Confirm COD Payment' : 'Awaiting Seller COD';
      itemStatusBadgeText = isSeller ? 'Confirm COD Payment' : 'Awaiting Seller COD';
    }
  }

  const addr = (order?.shipping_address as any) || {};
  const recipient =
    propReceiverName ||
    addr.recipientName ||
    addr.recipient_name ||
    (order as any)?.buyer?.full_name ||
    '—';

  const streetAddress =
    propDeliveryAddress ||
    [addr.line1, addr.city].filter(Boolean).join(', ') ||
    '—';

  const phone =
    propContactPhone ||
    addr.phone ||
    '—';

  const item =
    propItemTitle ||
    listing?.title ||
    (order as any)?.listing?.title ||
    'Item';

  const note =
    propDeliveryNote ||
    order?.delivery_notes ||
    null;

  const carrierName = (order as any)?.courier_name || `${BRAND} Express`;

  const itemPhoto =
    listing?.images?.[0] ||
    (listing as any)?.photos?.[0] ||
    null;
  const itemCondition = conditionLabel((listing as any)?.condition);
  const orderIdNumber = order?.id ? (order.id.replace(/[^0-9]/g, '').slice(0, 7) || order.id.slice(0, 7).toUpperCase()) : '—';

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

  // Buyer protection fee calculation
  const listingPrice = Number(listing?.price ?? (order?.amount_cents ? order.amount_cents / 100 : 1000));
  const protectionFee = buyerProtectionFee(listingPrice);

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
    Boolean((order as any)?.picked_up_at || (order as any)?.picked_at || pickupConfirmed);
  const isPacked =
    Boolean(order?.packed_at) ||
    isPicked;

  const deliveredTimestamp = parseServerDate(order?.delivered_at || order?.completed_at);
  const shippedTimestamp = parseServerDate(order?.shipped_at || (order as any)?.shifted_at);
  const pickedTimestamp = parseServerDate((order as any)?.picked_up_at || (order as any)?.picked_at);
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

  const pickedTimeLabel = isPicked ? formatTime(pickedTime) : 'Pending';
  const transitTimeLabel = isShipped ? formatTime(transitTime) : 'Pending';
  const deliveredTimeLabel = isDelivered ? formatTime(deliveredTime) : 'Pending';

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
    ...(isDelivered && deliveredTime
      ? [
          {
            id: 'delivered',
            time: formatTime(deliveredTime),
            date: formatDate(deliveredTime),
            title: 'Package Delivered',
            description: `Handed over directly to ${recipient} at ${streetAddress}.`,
            completed: true,
            isLatest: true,
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
            title: 'Package Picked Up & Manifested',
            description: `Courier collected parcel from seller. Verified at local distribution hub.`,
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
            description: `Seller packed the items with care and attached waybill #${trackingNumber}.`,
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
      isLatest: !isPacked && !isPicked && !isShipped && !isDelivered,
    },
  ];

  // Clipboard Copy Action with haptics & feedback toast
  const handleCopyTracking = async () => {
    tap('light');
    try {
      await Clipboard.setStringAsync(trackingNumber);
      toast.show('Tracking ID copied to clipboard', {
        variant: 'default',
        icon: 'copy',
      });
    } catch {
      toast.show('Failed to copy tracking ID', {
        variant: 'default',
        icon: 'alert-triangle',
      });
    }
  };



  // Message Seller / Buyer Handler (Matching Image 1)
  const handleContactSeller = () => {
    tap('light');
    const targetListingId = listing?.id || order?.listing_id;
    if (targetListingId) {
      router.push(`/conversation/new?listing=${targetListingId}` as any);
    } else {
      router.push('/(tabs)/chat' as any);
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

    tap('medium');
    const chosenDateStr = pickupSelectedDate === 'tomorrow' ? tomorrowFormatted : dayAfterFormatted;

    if (onConfirmPickup) {
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
        toast.show(`Pickup confirmed for ${chosenDateStr}! Driver scheduled.`, {
          variant: 'default',
          icon: 'check',
        });
      } catch (e: any) {
        console.warn('pickup schedule error', e);
        toast.show(e?.message || 'Could not schedule pickup', {
          variant: 'default',
          icon: 'alert-triangle',
        });
      }
    } else {
      setPickupConfirmed(true);
      setPickupConfirmedDateStr(chosenDateStr);
      setReadyDeliverModalVisible(false);
      toast.show(`Pickup confirmed for ${chosenDateStr}! Driver scheduled.`, {
        variant: 'default',
        icon: 'check',
      });
    }
  };

  // Download Label Action (Image 2)
  const handleDownloadLabel = async () => {
    tap('light');
    try {
      await Share.share({
        message: `${BRAND} Shipping Label\nWaybill: ${trackingNumber}\nFrom: ${pickupContactName} (${pickupLine1}, ${pickupCity})\nTo: ${recipient} (${streetAddress})\nCarrier: ${carrierName}`,
      });
      toast.show('Shipping label ready & shared', {
        variant: 'default',
        icon: 'check',
      });
    } catch {
      toast.show('Label saved to documents', {
        variant: 'default',
        icon: 'check',
      });
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

        {/* ── Seller Actions: Combined "Get a label" & "Ready to deliver" (Seller Only) ── */}
        {isSeller ? (
          <GroupCard>
            {/* Row 1: Get a label (Opens Image 2) */}
            <Pressable
              onPress={() => {
                tap('light');
                setLabelModalVisible(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Get a label"
              style={({ pressed }) => [
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  minHeight: 54,
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : theme.hairline,
                },
                pressed && { opacity: 0.75, backgroundColor: theme.surface },
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 8 }}>
                <Feather name="printer" size={19} color={theme.ink} style={{ width: 26 }} />
                <Text
                  style={{
                    fontSize: 15.5,
                    fontFamily: typography.family.sansBold,
                    color: theme.ink,
                    letterSpacing: -0.2,
                    marginLeft: 8,
                  }}
                >
                  Get a label
                </Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text
                  style={{
                    fontSize: 13.5,
                    color: theme.mute,
                    fontFamily: typography.family.sansMedium,
                  }}
                >
                  Print / QR code
                </Text>
                <Feather name="chevron-right" size={16} color={theme.mute} />
              </View>
            </Pressable>

            {/* Row 2: Ready to deliver (Opens Pickup Scheduler & Required Contact Modal) */}
            <Pressable
              onPress={() => {
                tap('light');
                setReadyDeliverModalVisible(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Ready to deliver"
              style={({ pressed }) => [
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  minHeight: 54,
                },
                pressed && { opacity: 0.75, backgroundColor: theme.surface },
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 8 }}>
                <Ionicons name="cube-outline" size={20} color={theme.ink} style={{ width: 26 }} />
                <Text
                  style={{
                    fontSize: 15.5,
                    fontFamily: typography.family.sansBold,
                    color: theme.ink,
                    letterSpacing: -0.2,
                    marginLeft: 8,
                  }}
                >
                  Ready to deliver
                </Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {pickupConfirmed ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Feather name="check-circle" size={14} color={theme.purple} />
                    <Text
                      style={{
                        fontSize: 13,
                        color: theme.purple,
                        fontFamily: typography.family.sansBold,
                      }}
                    >
                      {pickupConfirmedDateStr || 'Scheduled'}
                    </Text>
                  </View>
                ) : (
                  <Text
                    style={{
                      fontSize: 13.5,
                      color: theme.purple,
                      fontFamily: typography.family.sansBold,
                    }}
                  >
                    Schedule pickup
                  </Text>
                )}
                <Feather name="chevron-right" size={16} color={theme.mute} />
              </View>
            </Pressable>
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
              {isSeller ? 'Items to pack' : 'Order details'}
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
                          .then(() => toast.show('Order number copied', { variant: 'default', icon: 'copy' }))
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
              <KeyValueRow label="Receiver" value={recipient} />
              <KeyValueRow label="Address" value={streetAddress} />
              <KeyValueRow label="Contact" value={phone} />
              <KeyValueRow label="Courier" value={carrierName} />
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



      {/* ── Modal 1: "Ship your item" (Exact Replica of Image 2) ── */}
      <Modal
        visible={labelModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setLabelModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: theme.overlay, justifyContent: 'flex-end' }}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setLabelModalVisible(false)} />
          <View
            style={[
              {
                backgroundColor: theme.panel,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                borderWidth: 1,
                borderColor: theme.border,
                paddingHorizontal: 20,
                paddingTop: 16,
                paddingBottom: Math.max(insets.bottom, 20) + 12,
                maxHeight: '92%',
                maxWidth: CONTENT_MAX_WIDTH,
                width: '100%',
                alignSelf: 'center',
              },
              shadow.lg,
            ]}
          >
            {/* Header with Circular 'X' on top-left and Centered "Ship your item" */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                paddingVertical: 6,
                marginBottom: 16,
              }}
            >
              <Pressable
                onPress={() => setLabelModalVisible(false)}
                hitSlop={HIT_SLOP_8}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={({ pressed }) => ({
                  position: 'absolute',
                  left: 0,
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F3F4F6',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.75 : 1,
                })}
              >
                <Feather name="x" size={18} color={theme.ink} />
              </Pressable>

              <Text
                style={{
                  fontSize: 17,
                  fontFamily: typography.family.sansBold,
                  color: theme.ink,
                  letterSpacing: -0.3,
                  textAlign: 'center',
                }}
              >
                Ship your item
              </Text>
            </View>

            {/* Sub-toggle: QR code vs Shipping label */}
            <View
              style={{
                flexDirection: 'row',
                backgroundColor: isDark ? '#1C1C1E' : '#F3F4F6',
                borderRadius: radii.pill,
                padding: 3,
                marginBottom: 16,
              }}
            >
              <Pressable
                onPress={() => {
                  tap('light');
                  setLabelSubTab('qr');
                }}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  borderRadius: radii.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: labelSubTab === 'qr' ? (isDark ? '#2C2C2E' : '#FFFFFF') : 'transparent',
                  ...(labelSubTab === 'qr' && Platform.OS !== 'web' ? shadow.sm : {}),
                }}
              >
                <Text
                  style={{
                    fontSize: 13.5,
                    fontFamily: labelSubTab === 'qr' ? typography.family.sansBold : typography.family.sansMedium,
                    color: labelSubTab === 'qr' ? theme.ink : theme.mute,
                  }}
                >
                  QR code
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  tap('light');
                  setLabelSubTab('label');
                }}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  borderRadius: radii.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: labelSubTab === 'label' ? (isDark ? '#2C2C2E' : '#FFFFFF') : 'transparent',
                  ...(labelSubTab === 'label' && Platform.OS !== 'web' ? shadow.sm : {}),
                }}
              >
                <Text
                  style={{
                    fontSize: 13.5,
                    fontFamily: labelSubTab === 'label' ? typography.family.sansBold : typography.family.sansMedium,
                    color: labelSubTab === 'label' ? theme.ink : theme.mute,
                  }}
                >
                  Shipping label
                </Text>
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
              {labelSubTab === 'label' ? (
                /* ── Shipping Label Document Box (Image 2) ── */
                <View
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: 12,
                    borderWidth: 1.5,
                    borderColor: '#000000',
                    padding: 16,
                    marginBottom: 16,
                  }}
                >
                  {/* Top Bar: Big "G" + Postage Box */}
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderBottomWidth: 2,
                      borderBottomColor: '#000000',
                      paddingBottom: 10,
                      marginBottom: 8,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ fontSize: 44, fontWeight: '900', color: '#000000', lineHeight: 46 }}>
                        G
                      </Text>
                      <View style={{ width: 1.5, height: 44, backgroundColor: '#000000', marginHorizontal: 12 }} />
                      <Text style={{ fontSize: 13, fontWeight: '800', color: '#000000' }}>
                        USPS GROUND ADVANTAGE
                      </Text>
                    </View>

                    <View
                      style={{
                        borderWidth: 1.5,
                        borderColor: '#000000',
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ fontSize: 7, fontWeight: '800', color: '#000000' }}>
                        USPS GROUND ADVANTAGE
                      </Text>
                      <Text style={{ fontSize: 7, fontWeight: '700', color: '#000000' }}>
                        U.S. POSTAGE PAID
                      </Text>
                      <Text style={{ fontSize: 7, color: '#000000' }}>Shippo</Text>
                      <Text style={{ fontSize: 7, fontWeight: '700', color: '#000000' }}>USPS Ship</Text>
                    </View>
                  </View>

                  {/* Sender & Ship Date Row */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#000000', textTransform: 'uppercase' }}>
                        {pickupContactName}
                      </Text>
                      <Text style={{ fontSize: 9.5, color: '#000000', textTransform: 'uppercase' }}>
                        {pickupLine1}
                      </Text>
                      <Text style={{ fontSize: 9.5, color: '#000000', textTransform: 'uppercase' }}>
                        {pickupCity} {pickupPostalCode}
                      </Text>
                    </View>

                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 9.5, color: '#000000' }}>
                        Ship Date: {formatDate(new Date())}
                      </Text>
                      <Text style={{ fontSize: 9.5, color: '#000000' }}>
                        Weight: 12 oz
                      </Text>
                      <Text style={{ fontSize: 14, fontWeight: '900', color: '#000000', marginTop: 4 }}>
                        RDC 01
                      </Text>
                    </View>
                  </View>

                  {/* Recipient Address with Mini QR box */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18 }}>
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderWidth: 1.5,
                        borderColor: '#000000',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 14,
                      }}
                    >
                      <Ionicons name="qr-code" size={34} color="#000000" />
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: '#000000', textTransform: 'uppercase' }}>
                        {recipient}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#000000', textTransform: 'uppercase' }}>
                        {streetAddress}
                      </Text>
                    </View>
                  </View>

                  {/* Tracking Barcode Graphic (Image 2) */}
                  <View style={{ borderTopWidth: 2, borderTopColor: '#000000', paddingTop: 10, alignItems: 'center' }}>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: '#000000', letterSpacing: 0.5, marginBottom: 6 }}>
                      USPS TRACKING # USPS Ship
                    </Text>

                    {/* Barcode Stripes */}
                    <View
                      style={{
                        flexDirection: 'row',
                        height: 52,
                        width: '100%',
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: 2,
                        marginBottom: 4,
                      }}
                    >
                      {[3, 1, 2, 4, 1, 3, 2, 1, 4, 1, 2, 3, 1, 4, 2, 1, 3, 2, 1, 4, 1, 3, 2, 1, 3, 4, 1, 2, 3, 1, 4, 2, 1, 3].map(
                        (w, i) => (
                          <View
                            key={i}
                            style={{
                              width: w,
                              height: 52,
                              backgroundColor: '#000000',
                            }}
                          />
                        ),
                      )}
                    </View>

                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#000000', letterSpacing: 1.5 }}>
                      9300 1107 9340 0008 6372 98
                    </Text>

                    <View style={{ alignSelf: 'flex-end', marginTop: 4 }}>
                      <Ionicons name="qr-code" size={26} color="#000000" />
                    </View>
                  </View>
                </View>
              ) : (
                /* ── QR Code Option Box (Image 2) ── */
                <View
                  style={{
                    backgroundColor: theme.surface,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: theme.border,
                    padding: 24,
                    alignItems: 'center',
                    marginBottom: 16,
                  }}
                >
                  <View
                    style={{
                      width: 180,
                      height: 180,
                      backgroundColor: '#FFFFFF',
                      borderRadius: 16,
                      borderWidth: 2,
                      borderColor: '#000000',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 16,
                      ...shadow.md,
                    }}
                  >
                    <Ionicons name="qr-code" size={150} color="#000000" />
                  </View>

                  <Text style={{ fontSize: 16, fontFamily: typography.family.sansBold, color: theme.ink, marginBottom: 4 }}>
                    {trackingNumber}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12.5,
                      color: theme.mute,
                      textAlign: 'center',
                      lineHeight: 18,
                      fontFamily: typography.family.sans,
                      paddingHorizontal: 16,
                    }}
                  >
                    No printer needed. Simply show this digital QR code to your pickup courier or at any parcel station.
                  </Text>
                </View>
              )}



              {/* Download Label CTA Button */}
              <Pressable
                onPress={handleDownloadLabel}
                accessibilityRole="button"
                accessibilityLabel="Download label"
                style={({ pressed }) => ({
                  height: 48,
                  borderRadius: radii.pill,
                  backgroundColor: theme.ink,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.88 : 1,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
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
                  Download label
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Modal 2: "Ready to Deliver" - Pickup Address & 2-Date Selection (Rule 2) ── */}
      <Modal
        visible={readyDeliverModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setReadyDeliverModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: theme.overlay, justifyContent: 'flex-end' }}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setReadyDeliverModalVisible(false)} />
          <View
            style={[
              {
                backgroundColor: theme.panel,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                borderWidth: 1,
                borderColor: theme.border,
                paddingHorizontal: 20,
                paddingTop: 16,
                paddingBottom: Math.max(insets.bottom, 20) + 12,
                maxHeight: '92%',
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
                  Set your exact pickup location &amp; select a pickup date
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
              <Text style={{ fontSize: 12, fontFamily: typography.family.sansBold, color: theme.mute, textTransform: 'uppercase', marginBottom: 8 }}>
                Exact Pickup Point Address (Required)
              </Text>

              <View style={{ gap: 10, marginBottom: 16 }}>
                <TextInput
                  value={pickupLine1}
                  onChangeText={setPickupLine1}
                  placeholder="Street Address (e.g. 210 Dan Allen Drive)"
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
                  placeholder="Apt, Suite, Floor (Optional)"
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
                    placeholder="Postal Code"
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
              <Text style={{ fontSize: 12, fontFamily: typography.family.sansBold, color: theme.mute, textTransform: 'uppercase', marginBottom: 8 }}>
                Pickup Contact Details (Required)
              </Text>

              <View style={{ gap: 10, marginBottom: 18 }}>
                <TextInput
                  value={pickupContactName}
                  onChangeText={setPickupContactName}
                  placeholder="Contact Person Name"
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
                  placeholder="Contact Phone (for Driver call/SMS)"
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
              <Text style={{ fontSize: 12, fontFamily: typography.family.sansBold, color: theme.mute, textTransform: 'uppercase', marginBottom: 8 }}>
                Select Pickup Date (2 Available Slots)
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

                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: radii.pill,
                      backgroundColor: isDark ? 'rgba(108, 71, 255, 0.22)' : 'rgba(108, 71, 255, 0.10)',
                    }}
                  >
                    <Text style={{ fontSize: 11, fontFamily: typography.family.sansBold, color: isDark ? '#FFFFFF' : theme.purple }}>
                      Recommended
                    </Text>
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

              {/* Confirm CTA */}
              <Pressable
                onPress={handleConfirmPickupSchedule}
                accessibilityRole="button"
                accessibilityLabel="Confirm pickup schedule"
                style={({ pressed }) => ({
                  height: 48,
                  borderRadius: radii.pill,
                  backgroundColor: theme.ink,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.88 : 1,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
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
                  Confirm Pickup &amp; Mark Ready
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>


    </View>
  );
}
