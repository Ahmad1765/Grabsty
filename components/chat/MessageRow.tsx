// One row in a conversation thread: a text bubble, an offer, or a system
// notice. Grouping-aware — a run of messages from the same sender collapses
// into one visual block with a single tail and a single meta line.
//
// The meta (time, sender, delivery state) lives OUTSIDE the bubble. That's the
// Plick move and it's the right one: the bubble stays a clean container for
// what was actually said, and the metadata reads as a consistent muted column
// down each side instead of as chrome inside every message.

import { memo, useCallback, useRef } from 'react';
import { Platform, Pressable, View, ActivityIndicator, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Text } from '@/lib/rnText';

import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { PressableScale } from '@/components/PressableScale';
import { radii, shadow, type as typography } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';
import { formatPrice } from '@/lib/currency';
import { isImageMessage, getMessageImageUrl, type ChatMessage } from '@/lib/chat';
import type { Anchor } from './ReactionPicker';
import { bubbleStamp } from './format';
import Svg, { Path } from 'react-native-svg';
import { ShieldCheckIcon } from '@/components/ui/ShieldCheckIcon';
import { getOptimizedImageUrl } from '@/lib/images';

/** Renders **bold** spans (support bot replies and FAQ answers use them) as real bold. */
export function withBold(text: string | null | undefined) {
  if (!text || !text.includes('**')) return text;
  return text.split('**').map((part, i) =>
    i % 2 === 1 ? <Text key={i} style={{ fontFamily: typography.family.sansBold }}>{part}</Text> : part,
  );
}

const HIT_SLOP_8 = { top: 8, bottom: 8, left: 8, right: 8 };
const TAIL_RADIUS = 6;
const BUBBLE_RADIUS = 18;

export type MessageRowProps = {
  msg: ChatMessage;
  mine: boolean;
  /** Viewer is the seller on this listing — controls who can answer an offer. */
  isSeller: boolean;
  /** Continues a run from the same sender: tighten the top corner, tight margin. */
  grouped: boolean;
  /** Last of its run: draws the tail and the meta line. */
  lastOfGroup: boolean;
  /** Shown in the meta line of an incoming group, the way Plick attributes them. */
  senderName: string;
  senderAvatar?: string | null;
  listingId: string | null;
  listingTitle?: string | null;
  listingThumb?: string | null;
  listingPrice: number | null;
  listingSold: boolean;
  /** Every emoji on this message, in arrival order. */
  reactions: string[];
  onAccept: () => void;
  onDecline: () => void;
  onCounterOffer?: () => void;
  onPay: (amount: number, bundleIds?: string[]) => void;
  onRetry: () => void;
  /** Long-press: opens the reaction bar over the measured bubble. */
  onLongPress: (anchor: Anchor) => void;
  /** Tap on image: opens fullscreen viewer */
  onImagePress?: (imageUrl: string) => void;
};

// ── Meta line ─────────────────────────────────────────────────────────────

function MetaLine({
  msg,
  mine,
  senderName,
  onRetry,
}: Pick<MessageRowProps, 'msg' | 'mine' | 'senderName' | 'onRetry'>) {
  const { theme } = useTheme();
  const base = {
    fontFamily: typography.family.sans,
    fontSize: 12,
    lineHeight: 16,
    color: theme.muteSoft,
  } as const;

  if (mine && msg.failed) {
    return (
      <PressableScale
        onPress={onRetry}
        accessibilityLabel="Retry sending message"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}
      >
        <Feather name="rotate-cw" size={10} color={theme.ink} />
        <Text style={{ ...base, fontFamily: typography.family.sansSemibold, color: theme.ink }}>
          Not sent · Tap to retry
        </Text>
      </PressableScale>
    );
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: mine ? 'flex-end' : 'flex-start',
        marginTop: 3,
      }}
    >
      <Text style={base}>
        {msg.pending ? 'Sending…' : bubbleStamp(msg.created_at)}
      </Text>
    </View>
  );
}

function SystemNotice({ msg }: { msg: ChatMessage }) {
  const { theme } = useTheme();
  if (msg.metadata?.paid === true) {
    return (
      <View style={{ paddingHorizontal: 16, marginVertical: 12 }}>
        <View
          style={{
            backgroundColor: theme.white,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: theme.border,
            padding: 14,
            ...shadow.sm,
          }}
        >
          <Text
            style={{
              fontFamily: typography.family.sansBold,
              fontSize: 14.5,
              fontWeight: '700',
              color: theme.ink,
              marginBottom: 4,
            }}
          >
            Done!
          </Text>
          <Text
            style={{
              fontFamily: typography.family.sans,
              fontSize: 13,
              lineHeight: 18,
              color: theme.mute,
            }}
          >
            {withBold(msg.content?.replace(/^Done!\s*\n?/, ''))}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ paddingHorizontal: 40, marginVertical: 12 }}>
      <Text
        style={{
          fontFamily: typography.family.sans,
          fontSize: 12,
          lineHeight: 17,
          color: theme.mute,
          textAlign: 'center',
        }}
      >
        {withBold(msg.content)}
      </Text>
    </View>
  );
}

// ── Canonical Depop / Vinted Style Offer UI (Matching Reference Images 1-5) ──

export function OfferTagIcon({ size = 15, color = '#111111' }: { size?: number; color?: string }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 6,
      }}
    >
      <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
        <Path
          d="M2.5 3C2.5 2.17 3.17 1.5 4 1.5H12C12.83 1.5 13.5 2.17 13.5 3V10C13.5 10.83 12.83 11.5 12 11.5H5.5L3 14V11.5H2.5C2.5 11.5 2.5 11.5 2.5 11.5V3Z"
          stroke={color}
          strokeWidth={1.25}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Path
          d="M5.5 5.2H5.51M10.5 8.2H10.51M10.5 5.2L5.5 8.2"
          stroke={color}
          strokeWidth={1.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

function getOfferExpiryLabel(createdAt?: string | null): { label: string; isExpiringSoon: boolean; isExpired: boolean } {
  if (!createdAt) {
    return { label: '22hr 39min', isExpiringSoon: true, isExpired: false };
  }
  const created = new Date(createdAt).getTime();
  const expiresAt = created + 24 * 3600 * 1000;
  const remainingMs = expiresAt - Date.now();
  if (remainingMs <= 0) {
    return { label: 'Expired', isExpiringSoon: true, isExpired: true };
  }
  const remainingHours = Math.floor(remainingMs / (3600 * 1000));
  const remainingMins = Math.floor((remainingMs % (3600 * 1000)) / (60 * 1000));
  return {
    label: `${remainingHours}hr ${remainingMins}min`,
    isExpiringSoon: remainingHours < 24,
    isExpired: false,
  };
}

// ── 1. Compact Offer Pill Bubble (Image 1, 2, 3, 4) ───────────────────────────
function OfferPillBubble({
  text,
  mine,
  tagColor,
}: {
  text: string;
  mine: boolean;
  tagColor?: string;
}) {
  const { theme, isDark } = useTheme();
  const bg = mine
    ? (isDark ? 'rgba(108, 71, 255, 0.18)' : '#EEF0FF')
    : (isDark ? '#262626' : '#F3F4F6');
  const border = mine
    ? (isDark ? 'rgba(108, 71, 255, 0.32)' : '#E0E3FF')
    : (isDark ? '#333333' : '#E5E7EB');
  const iconCol = tagColor || theme.ink;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: bg,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: border,
        alignSelf: mine ? 'flex-end' : 'flex-start',
      }}
    >
      <OfferTagIcon size={14} color={iconCol} />
      <Text
        style={{
          fontFamily: typography.family.sansMedium,
          fontSize: 14.5,
          color: theme.ink,
          letterSpacing: -0.1,
        }}
      >
        {text}
      </Text>
    </View>
  );
}

// ── 2. Active Incoming Offer Card with Counter & Accept (Image 5) ─────────────
function IncomingOfferCard({
  amount,
  listingPrice,
  expiryLabel,
  onAccept,
  onDecline,
  onCounterOffer,
  badgeLabel = 'Offer received',
}: {
  amount: number;
  listingPrice: number | null;
  expiryLabel: string;
  onAccept: () => void;
  onDecline: () => void;
  onCounterOffer?: () => void;
  badgeLabel?: string;
}) {
  const { theme, isDark } = useTheme();
  const showStruck = !!listingPrice && listingPrice > amount;

  return (
    <View
      style={{
        width: 290,
        maxWidth: '100%',
        backgroundColor: isDark ? '#1C1C1E' : '#F4F4F6',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: isDark ? '#2C2C2E' : '#E5E7EB',
        padding: 16,
      }}
    >
      {/* Top Row: Pill Badge and Close Button */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#E5E7EB',
            borderRadius: 12,
            paddingHorizontal: 8,
            paddingVertical: 3.5,
          }}
        >
          <OfferTagIcon size={13} color={theme.ink} />
          <Text
            style={{
              fontSize: 12.5,
              fontFamily: typography.family.sansMedium,
              color: theme.ink,
            }}
          >
            {badgeLabel}
          </Text>
        </View>

        <Pressable
          onPress={onDecline}
          hitSlop={HIT_SLOP_8}
          accessibilityRole="button"
          accessibilityLabel="Decline offer"
          style={({ pressed }) => ({
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Feather name="x" size={17} color={theme.ink} />
        </Pressable>
      </View>

      {/* Price Row */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          gap: 8,
          marginTop: 10,
        }}
      >
        <Text
          style={{
            fontSize: 24,
            fontFamily: typography.family.sansBold,
            color: theme.ink,
            letterSpacing: -0.4,
          }}
        >
          {formatPrice(amount, { forceDecimals: true })}
        </Text>
        {showStruck && (
          <Text
            style={{
              fontSize: 16,
              fontFamily: typography.family.sans,
              color: theme.muteSoft,
              textDecorationLine: 'line-through',
            }}
          >
            {Number.isInteger(listingPrice)
              ? formatPrice(listingPrice, { whole: true })
              : formatPrice(listingPrice)}
          </Text>
        )}
      </View>

      {/* Expiry Subtitle */}
      <Text
        style={{
          fontSize: 13,
          fontFamily: typography.family.sans,
          color: theme.muteSoft,
          marginTop: 4,
          marginBottom: 14,
        }}
      >
        {expiryLabel.toLowerCase().includes('expired') ? 'Offer has expired' : `Expires in ${expiryLabel}`}
      </Text>

      {/* Side-by-Side Action Buttons: Counter & Accept */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <PressableScale
          onPress={onCounterOffer}
          accessibilityRole="button"
          accessibilityLabel="Counter offer"
          style={{
            flex: 1,
            height: 42,
            borderRadius: radii.pill,
            backgroundColor: isDark ? '#2C2C2E' : '#FFFFFF',
            borderWidth: 1.5,
            borderColor: theme.ink,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            style={{
              fontSize: 14.5,
              fontFamily: typography.family.sansBold,
              color: theme.ink,
            }}
          >
            Counter
          </Text>
        </PressableScale>

        <PressableScale
          onPress={onAccept}
          accessibilityRole="button"
          accessibilityLabel="Accept offer"
          style={{
            flex: 1,
            height: 42,
            borderRadius: radii.pill,
            backgroundColor: theme.ink,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            style={{
              fontSize: 14.5,
              fontFamily: typography.family.sansBold,
              color: theme.background,
            }}
          >
            Accept
          </Text>
        </PressableScale>
      </View>
    </View>
  );
}

// ── 3. "It's a deal" Card with "Buy now" (Image 4) ───────────────────────────
function DealAcceptedCard({
  amount,
  listingPrice,
  expiryLabel,
  onBuyNow,
}: {
  amount: number;
  listingPrice: number | null;
  expiryLabel: string;
  onBuyNow: () => void;
}) {
  const { theme, isDark } = useTheme();
  const showStruck = !!listingPrice && listingPrice > amount;

  return (
    <View
      style={{
        width: 290,
        maxWidth: '100%',
        backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: isDark ? '#2C2C2E' : '#E5E7EB',
        padding: 16,
      }}
    >
      {/* Top Row: "It's a deal" in green */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <OfferTagIcon size={14} color="#16A34A" />
        <Text
          style={{
            fontSize: 14,
            fontFamily: typography.family.sansBold,
            color: '#16A34A',
          }}
        >
          It&apos;s a deal
        </Text>
      </View>

      {/* Price Row */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          gap: 8,
          marginTop: 8,
        }}
      >
        <Text
          style={{
            fontSize: 24,
            fontFamily: typography.family.sansBold,
            color: theme.ink,
            letterSpacing: -0.4,
          }}
        >
          {formatPrice(amount, { forceDecimals: true })}
        </Text>
        {showStruck && (
          <Text
            style={{
              fontSize: 16,
              fontFamily: typography.family.sans,
              color: theme.muteSoft,
              textDecorationLine: 'line-through',
            }}
          >
            {Number.isInteger(listingPrice)
              ? formatPrice(listingPrice, { whole: true })
              : formatPrice(listingPrice)}
          </Text>
        )}
      </View>

      {/* Expiration line in red/burgundy */}
      <Text
        style={{
          fontSize: 13,
          fontFamily: typography.family.sansMedium,
          color: '#991B1B',
          marginTop: 4,
          marginBottom: 14,
        }}
      >
        {expiryLabel.toLowerCase().includes('expired') ? 'Offer has expired' : `Expires in ${expiryLabel}`}
      </Text>

      {/* Full width "Buy now" pill */}
      <PressableScale
        onPress={onBuyNow}
        accessibilityRole="button"
        accessibilityLabel="Buy now"
        style={{
          height: 44,
          borderRadius: radii.pill,
          backgroundColor: theme.ink,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text
          style={{
            fontSize: 15,
            fontFamily: typography.family.sansBold,
            color: theme.background,
          }}
        >
          Buy now
        </Text>
      </PressableScale>
    </View>
  );
}

// ── 4. Outgoing Special Offer Card (Image 2 & Image 3) ────────────────────────
function SpecialOfferCard({
  amount,
  listingPrice,
  expiryLabel,
  isExpiringSoon,
  isMine,
}: {
  amount: number;
  listingPrice: number | null;
  expiryLabel: string;
  isExpiringSoon: boolean;
  isMine: boolean;
}) {
  const { theme, isDark } = useTheme();
  const showStruck = !!listingPrice && listingPrice > amount;

  return (
    <View
      style={{
        width: 270,
        maxWidth: '100%',
        backgroundColor: isDark ? 'rgba(108, 71, 255, 0.16)' : '#EEF0FF',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(108, 71, 255, 0.28)' : '#E0E3FF',
        padding: 16,
        alignSelf: isMine ? 'flex-end' : 'flex-start',
      }}
    >
      {/* Top Row: "You sent a special offer" */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <OfferTagIcon size={14} color={theme.ink} />
        <Text
          style={{
            fontSize: 13.5,
            fontFamily: typography.family.sansMedium,
            color: theme.ink,
          }}
        >
          {isMine ? 'You sent a special offer' : 'Special offer'}
        </Text>
      </View>

      {/* Price Row */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          gap: 8,
          marginTop: 8,
        }}
      >
        <Text
          style={{
            fontSize: 24,
            fontFamily: typography.family.sansBold,
            color: theme.ink,
            letterSpacing: -0.4,
          }}
        >
          {formatPrice(amount, { forceDecimals: true })}
        </Text>
        {showStruck && (
          <Text
            style={{
              fontSize: 16,
              fontFamily: typography.family.sans,
              color: theme.muteSoft,
              textDecorationLine: 'line-through',
            }}
          >
            {Number.isInteger(listingPrice)
              ? formatPrice(listingPrice, { whole: true })
              : formatPrice(listingPrice)}
          </Text>
        )}
      </View>

      {/* Expiry line */}
      <Text
        style={{
          fontSize: 13,
          fontFamily: typography.family.sansMedium,
          color: isExpiringSoon ? '#991B1B' : theme.muteSoft,
          marginTop: 4,
        }}
      >
        {expiryLabel.toLowerCase().includes('expired') ? 'Offer has expired' : `Expires in ${expiryLabel}`}
      </Text>
    </View>
  );
}

// ── OfferBubble Coordinator (Selecting Exact Format Based on State) ───────────
function OfferBubble(
  props: Omit<
    MessageRowProps,
    'grouped' | 'lastOfGroup' | 'onRetry' | 'reactions' | 'onLongPress'
  >,
) {
  const {
    msg,
    mine,
    isSeller,
    listingId,
    listingPrice,
    listingSold,
    onAccept,
    onDecline,
    onCounterOffer,
    onPay,
  } = props;

  const amount = msg.metadata?.amount ?? 0;
  const isExpiredTtl = Boolean(
    (msg.offer_status === 'pending' || msg.offer_status === 'proposed') &&
    msg.metadata?.actionable !== false &&
    msg.created_at &&
    Date.now() - new Date(msg.created_at).getTime() > 48 * 3600 * 1000
  );
  const status = isExpiredTtl ? 'expired' : (msg.offer_status ?? 'pending');
  const isPaid = Boolean(
    msg.metadata?.paid ||
    msg.metadata?.order_status === 'paid' ||
    msg.metadata?.payment_status === 'paid'
  );
  const isBundle = Boolean(msg.metadata?.is_bundle || (msg.metadata?.bundle_item_ids && msg.metadata.bundle_item_ids.length > 0));
  const isBundleInvalid = isBundle && (Boolean(msg.metadata?.bundle_invalid) || status === 'canceled');
  const canPay = !isSeller && status === 'accepted' && !!listingId && !isPaid && !isBundleInvalid;
  const { label: expiryLabel, isExpiringSoon } = getOfferExpiryLabel(msg.created_at);

  // 1. Paid Offer Confirmation
  if (isPaid) {
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 14,
          paddingVertical: 9,
          borderRadius: 18,
          backgroundColor: 'rgba(16, 185, 129, 0.12)',
          borderWidth: 1,
          borderColor: 'rgba(16, 185, 129, 0.24)',
        }}
      >
        <ShieldCheckIcon size={15} />
        <Text style={{ fontSize: 14, fontFamily: typography.family.sansBold, color: '#10B981' }}>
          Paid · {formatPrice(amount)}
        </Text>
      </View>
    );
  }

  // 2. Image 4: "It's a deal" Card with "Buy now" for Buyer
  if (status === 'accepted' && canPay) {
    return (
      <DealAcceptedCard
        amount={amount}
        listingPrice={listingPrice}
        expiryLabel={expiryLabel}
        onBuyNow={() => onPay(amount, msg.metadata?.bundle_item_ids)}
      />
    );
  }

  // 3. Image 5: Incoming Active Offer Card with "Counter" & "Accept" (for whichever user received the offer)
  const isActionable = msg.metadata?.actionable !== false;
  const isCounter = Boolean(msg.metadata?.parent_offer_id || msg.parent_offer_id);
  if (!mine && (status === 'pending' || status === 'proposed') && !listingSold && !isBundleInvalid && isActionable) {
    return (
      <IncomingOfferCard
        amount={amount}
        listingPrice={listingPrice}
        expiryLabel={expiryLabel}
        onAccept={onAccept}
        onDecline={onDecline}
        onCounterOffer={onCounterOffer}
        badgeLabel={isCounter ? 'Counter-offer received' : 'Offer received'}
      />
    );
  }

  // 4. Image 2 & 3: Outgoing Special Offer Card
  if (mine && (msg.metadata?.is_special_offer || (isSeller && (status === 'pending' || status === 'proposed')))) {
    return (
      <SpecialOfferCard
        amount={amount}
        listingPrice={listingPrice}
        expiryLabel={expiryLabel}
        isExpiringSoon={isExpiringSoon}
        isMine={mine}
      />
    );
  }

  // 5. Image 1, 2, 3, 4: Clean Offer Pill Bubbles
  let pillText = '';
  const formattedAmt = formatPrice(amount, { forceDecimals: true });
  if (status === 'declined') {
    pillText = mine
      ? `You declined their offer: ${formattedAmt}`
      : `They declined your offer: ${formattedAmt}`;
  } else if (status === 'countered') {
    pillText = mine ? 'Your offer was countered' : 'You countered this offer';
  } else if (status === 'expired') {
    pillText = mine ? 'Your offer has expired' : 'Offer has expired';
  } else if (status === 'canceled' || isBundleInvalid) {
    pillText = 'Offer is no longer available';
  } else if (status === 'accepted') {
    pillText = mine
      ? `You accepted their offer: ${formattedAmt}`
      : `Offer accepted: ${formattedAmt}`;
  } else {
    // Pending
    if (mine) {
      pillText = isCounter
        ? `You sent a counter-offer: ${formattedAmt}`
        : `You made an offer: ${formattedAmt}`;
    } else {
      pillText = `Made you an offer: ${formattedAmt}`;
    }
  }

  return <OfferPillBubble text={pillText} mine={mine} />;
}

// ── Image ─────────────────────────────────────────────────────────────────

function ImageBubble({
  msg,
  mine,
  grouped,
  lastOfGroup,
}: Pick<MessageRowProps, 'msg' | 'mine' | 'grouped' | 'lastOfGroup'>) {
  const { theme } = useTheme();
  const imageUrl = getMessageImageUrl(msg) || msg.content;

  return (
    <View
      style={{
        borderRadius: BUBBLE_RADIUS,
        borderTopRightRadius: mine && grouped ? TAIL_RADIUS : BUBBLE_RADIUS,
        borderTopLeftRadius: !mine && grouped ? TAIL_RADIUS : BUBBLE_RADIUS,
        borderBottomRightRadius: mine && lastOfGroup ? TAIL_RADIUS : BUBBLE_RADIUS,
        borderBottomLeftRadius: !mine && lastOfGroup ? TAIL_RADIUS : BUBBLE_RADIUS,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: theme.panel,
        width: 220,
        height: 220,
        alignSelf: mine ? 'flex-end' : 'flex-start',
      }}
    >
      <Image
        // 220pt bubble at 3x. Above 640 so the optimizer never swaps in a
        // listing-style _thumb sibling, which chat uploads do not have.
        source={{ uri: getOptimizedImageUrl(imageUrl, { width: 660 }) }}
        style={{ width: '100%', height: '100%' }}
        contentFit="cover"
        transition={200}
      />
      {msg.pending && (
        <View
          style={{
            ...StyleSheet.absoluteFillObject,
            backgroundColor: 'rgba(0, 0, 0, 0.35)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ActivityIndicator size="small" color="#FFFFFF" />
        </View>
      )}
    </View>
  );
}

// ── Text ──────────────────────────────────────────────────────────────────

function TextBubble({
  msg,
  mine,
  grouped,
  lastOfGroup,
}: Pick<MessageRowProps, 'msg' | 'mine' | 'grouped' | 'lastOfGroup'>) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        paddingHorizontal: 14,
        paddingVertical: 9,
        backgroundColor: mine ? theme.purple : theme.panel,
        borderWidth: mine ? 0 : 1,
        borderColor: theme.border,
        opacity: msg.pending ? 0.65 : 1,
        borderRadius: BUBBLE_RADIUS,
        // The tail sits on the sender's own side: tightened at the bottom of a
        // run, and at the top of any bubble continuing one.
        borderTopRightRadius: mine && grouped ? TAIL_RADIUS : BUBBLE_RADIUS,
        borderTopLeftRadius: !mine && grouped ? TAIL_RADIUS : BUBBLE_RADIUS,
        borderBottomRightRadius: mine && lastOfGroup ? TAIL_RADIUS : BUBBLE_RADIUS,
        borderBottomLeftRadius: !mine && lastOfGroup ? TAIL_RADIUS : BUBBLE_RADIUS,
        alignSelf: mine ? 'flex-end' : 'flex-start',
      }}
    >
      <Text
        style={{
          fontFamily: typography.family.sans,
          fontSize: 15,
          lineHeight: 21,
          color: mine ? '#FFFFFF' : theme.ink,
          ...(Platform.OS === 'web'
            ? ({
                wordBreak: 'normal',
                overflowWrap: 'break-word',
                wordWrap: 'break-word',
              } as any)
            : null),
        }}
      >
        {withBold(msg.content)}
      </Text>
    </View>
  );
}

// ── Reactions ─────────────────────────────────────────────────────────────

/** The chip that rides the bottom edge of a reacted-to bubble, iMessage-style:
 *  it overlaps the corner so it reads as attached to that message and not as a
 *  new row in the thread. */
function ReactionChip({ reactions, mine }: { reactions: string[]; mine: boolean }) {
  const { theme } = useTheme();
  if (reactions.length === 0) return null;

  // Two people, one reaction each — so at most a couple of emoji, and counting
  // duplicates is cheaper than showing the same emoji twice.
  const counts = new Map<string, number>();
  reactions.forEach((e) => counts.set(e, (counts.get(e) ?? 0) + 1));

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        alignSelf: mine ? 'flex-end' : 'flex-start',
        marginTop: -9,
        marginRight: mine ? 8 : 0,
        marginLeft: mine ? 0 : 8,
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: radii.pill,
        backgroundColor: theme.surface,
        borderWidth: 1,
        borderColor: theme.border,
      }}
    >
      {[...counts.entries()].map(([emoji, count]) => (
        <View key={emoji} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Text style={{ fontSize: 13, lineHeight: 17 }}>{emoji}</Text>
          {count > 1 && (
            <Text
              style={{
                fontFamily: typography.family.sansSemibold,
                fontSize: 11,
                color: theme.mute,
              }}
            >
              {count}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────

function MessageRowImpl(props: MessageRowProps) {
  const { theme, isDark } = useTheme();
  const { msg, mine, grouped, lastOfGroup, senderName, senderAvatar, reactions, onRetry, onLongPress } = props;
  const bubbleRef = useRef<View>(null);

  // A message that hasn't landed yet has no server id to hang a reaction off.
  const canReact = msg.kind !== 'system' && !msg.pending && !msg.failed;

  const handleLongPress = useCallback(() => {
    if (!canReact) return;
    bubbleRef.current?.measureInWindow((x, y, width, height) => {
      // A zero measurement means the row scrolled out from under the press —
      // opening a bar pinned to (0,0) would be worse than doing nothing.
      if (!width && !height) return;
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      }
      onLongPress({ x, y, width, height, mine });
    });
  }, [canReact, mine, onLongPress]);

  if (msg.kind === 'system') return <SystemNotice msg={msg} />;

  return (
    <View
      style={{
        paddingHorizontal: 16,
        marginTop: grouped ? 2 : 10,
        alignItems: mine ? 'flex-end' : 'flex-start',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          justifyContent: mine ? 'flex-end' : 'flex-start',
          gap: 8,
          maxWidth: '100%',
        }}
      >
        {!mine && (
          <View style={{ width: 28, height: 28, marginBottom: 2 }}>
            {lastOfGroup ? (
              senderAvatar ? (
                <Image
                  source={{ uri: senderAvatar }}
                  style={{ width: 28, height: 28, borderRadius: 14 }}
                  contentFit="cover"
                />
              ) : (
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: isDark ? '#3A3A3C' : '#5A5A5E',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {senderName ? (
                    <Text
                      style={{
                        fontFamily: typography.family.sansBold,
                        fontSize: 13,
                        fontWeight: '700',
                        color: '#FFFFFF',
                        lineHeight: 16,
                      }}
                    >
                      {senderName.trim().charAt(0).toUpperCase()}
                    </Text>
                  ) : (
                    <View
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 14,
                        backgroundColor: isDark ? '#3A3A3C' : '#8E8E93',
                      }}
                    />
                  )}
                </View>
              )
            ) : null}
          </View>
        )}

        <Pressable
          ref={bubbleRef}
          onPress={() => {
            if (isImageMessage(msg)) {
              props.onImagePress?.(getMessageImageUrl(msg) || msg.content);
            }
          }}
          onLongPress={canReact ? handleLongPress : undefined}
          // Long enough not to fire while someone is scrolling with a finger
          // resting on a bubble, short enough to feel deliberate.
          delayLongPress={320}
          {...(Platform.OS === 'web'
            ? ({
                onContextMenu: (e: any) => {
                  if (canReact) {
                    e.preventDefault?.();
                    handleLongPress();
                  }
                },
              } as any)
            : null)}
          accessibilityRole={canReact ? 'button' : undefined}
          accessibilityLabel={
            isImageMessage(msg)
              ? 'Photo message. Tap to view full size'
              : canReact
                ? 'Message. Long press to react'
                : undefined
          }
          style={{
            maxWidth: msg.kind === 'offer' ? (mine ? '86%' : '82%') : isImageMessage(msg) ? '78%' : '78%',
            alignItems: mine ? 'flex-end' : 'flex-start',
            alignSelf: mine ? 'flex-end' : 'flex-start',
          }}
        >
          {msg.kind === 'offer' ? (
            <OfferBubble {...props} />
          ) : isImageMessage(msg) ? (
            <ImageBubble {...props} />
          ) : (
            <TextBubble {...props} />
          )}
          <ReactionChip reactions={reactions} mine={mine} />
        </Pressable>
      </View>

      {lastOfGroup && (
        <View style={{ width: '100%', alignItems: mine ? 'flex-end' : 'flex-start' }}>
          <MetaLine msg={msg} mine={mine} senderName={senderName} onRetry={onRetry} />
        </View>
      )}
    </View>
  );
}

export const MessageRow = memo(MessageRowImpl);
