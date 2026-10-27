import React from 'react';
import { View } from 'react-native';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/context/ThemeContext';
import { type as typography } from '@/lib/theme';
import { ShieldCheckIcon } from '@/components/ui/ShieldCheckIcon';
import type { FulfillmentStatus, FulfillmentType } from '@/types';

export interface OrderStepperProps {
  status?: string;
  fulfillmentStatus?: FulfillmentStatus | string | null;
  fulfillmentType?: FulfillmentType | string | null;
  paymentMethod?: string;
  shippedAt?: string | null;
  courierName?: string | null;
  trackingNumber?: string | null;
  cancelReason?: string | null;
  disputeReason?: string | null;
  isSeller?: boolean;
}

export function OrderStepper({
  status,
  fulfillmentStatus,
  fulfillmentType = 'direct',
  paymentMethod,
  shippedAt,
  courierName,
  trackingNumber,
  cancelReason,
  disputeReason,
  isSeller = false,
}: OrderStepperProps) {
  const { theme, isDark } = useTheme();

  // Effective state combining fulfillmentStatus & legacy status
  const effectiveFulfillment = fulfillmentStatus || (
    status === 'completed' ? 'completed' :
    status === 'delivered' ? 'delivered' :
    status === 'disputed' ? 'disputed' :
    status === 'canceled' || status === 'refunded' || status === 'failed' ? 'canceled' :
    status === 'shifting' || shippedAt || status === 'shipped' ? 'shifting' :
    status === 'packing' ? 'packing' :
    status === 'awaiting_payment' ? 'awaiting_payment' :
    'pending'
  );

  // ── 1. Canceled / Refunded / Failed Banner ──────────────────────────────────
  if (effectiveFulfillment === 'canceled' || status === 'canceled' || status === 'refunded' || status === 'failed') {
    return (
      <View
        style={{
          backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : '#FEF2F2',
          borderRadius: 14,
          borderWidth: 1,
          borderColor: isDark ? 'rgba(239, 68, 68, 0.25)' : '#FECACA',
          padding: 14,
          marginBottom: 16,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
          <Feather name="x-circle" size={20} color="#EF4444" style={{ marginRight: 8 }} />
          <Text
            style={{
              fontSize: 15,
              fontWeight: '700',
              color: '#EF4444',
              fontFamily: typography.family.sansBold,
            }}
          >
            {status === 'refunded' ? 'Order Refunded' : status === 'failed' ? 'Order Failed' : 'Order Canceled'}
          </Text>
        </View>
        <Text
          style={{
            fontSize: 12.5,
            color: isDark ? '#FCA5A5' : '#991B1B',
            fontFamily: typography.family.sans,
            lineHeight: 17,
          }}
        >
          {cancelReason
            ? `Reason: ${cancelReason}`
            : status === 'failed'
            ? 'Payment could not be processed for this order.'
            : 'This transaction was cancelled and the listing is now available.'}
        </Text>
      </View>
    );
  }

  // ── 2. Buyer Protection Dispute Active Banner ──────────────────────────────
  if (effectiveFulfillment === 'disputed' || status === 'disputed') {
    return (
      <View
        style={{
          backgroundColor: isDark ? 'rgba(83, 86, 238, 0.12)' : '#F2F3FE',
          borderRadius: 14,
          borderWidth: 1,
          borderColor: isDark ? 'rgba(83, 86, 238, 0.3)' : '#DCDFFE',
          padding: 14,
          marginBottom: 16,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
          <ShieldCheckIcon size={20} style={{ marginRight: 8 }} />
          <Text
            style={{
              fontSize: 15,
              fontWeight: '700',
              color: theme.ink,
              fontFamily: typography.family.sansBold,
            }}
          >
            Buyer Protection Dispute Open
          </Text>
        </View>
        <Text
          style={{
            fontSize: 12.5,
            color: theme.mute,
            fontFamily: typography.family.sans,
            lineHeight: 17,
          }}
        >
          {disputeReason
            ? `Claim: ${disputeReason}. Funds are held securely in Escrow pending resolution.`
            : 'A claim has been opened for this order. Funds are held in Escrow pending inspection review.'}
        </Text>
      </View>
    );
  }

  // ── 3. Derive Active Stage (1 to 4) ────────────────────────────────────────
  // Stage 1: Placed / Authorized
  // Stage 2: Packing / Supplier Processing
  // Stage 3: Shifting / Dispatched
  // Stage 4: Delivered / Completed
  let currentStage = 1;
  if (effectiveFulfillment === 'completed' || effectiveFulfillment === 'delivered') {
    currentStage = 4;
  } else if (effectiveFulfillment === 'shifting' || shippedAt) {
    currentStage = 3;
  } else if (effectiveFulfillment === 'packing') {
    currentStage = 2;
  } else if (effectiveFulfillment === 'pending' || effectiveFulfillment === 'awaiting_payment') {
    currentStage = 1;
  }

  const isAwaitingPayment = effectiveFulfillment === 'awaiting_payment';
  const isDropship = fulfillmentType === 'dropship';

  let placedSubtitle = 'Paid';
  if (paymentMethod === 'cod') {
    placedSubtitle = 'CoD Order';
  } else if (isAwaitingPayment) {
    placedSubtitle = 'Awaiting Auth';
  } else if (status === 'pending') {
    placedSubtitle = 'Pending';
  }

  const steps = [
    { title: 'Placed', subtitle: placedSubtitle },
    {
      title: isDropship ? 'Supplier' : 'Packing',
      subtitle: isDropship ? 'Processing' : 'Seller preparing',
    },
    { title: 'Shifting', subtitle: courierName || 'In transit' },
    {
      title: effectiveFulfillment === 'delivered' ? 'Delivered' : 'Completed',
      subtitle: effectiveFulfillment === 'delivered' ? 'Please inspect' : 'Delivered',
    },
  ];

  return (
    <View
      style={{
        backgroundColor: theme.paper,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: theme.border,
        padding: 16,
        marginBottom: 16,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        {steps.map((step, index) => {
          const stepNum = index + 1;
          const isDone = stepNum < currentStage;
          const isCurrent = stepNum === currentStage;
          const isUpcoming = stepNum > currentStage;

          return (
            <React.Fragment key={step.title}>
              {/* Step Circle + Labels */}
              <View style={{ alignItems: 'center', width: 68 }}>
                <View
                  style={[
                    {
                      width: 26,
                      height: 26,
                      borderRadius: 13,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 6,
                    },
                    isDone && { backgroundColor: theme.purple },
                    isCurrent && {
                      backgroundColor: theme.purpleSoft,
                      borderWidth: 2,
                      borderColor: theme.primary,
                    },
                    isUpcoming && { backgroundColor: theme.panel },
                  ]}
                >
                  {isDone ? (
                    <Feather name="check" size={12} color="#FFFFFF" />
                  ) : isCurrent ? (
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: theme.primary,
                      }}
                    />
                  ) : (
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: '600',
                        color: theme.muteSoft,
                        fontFamily: typography.family.sansSemibold,
                      }}
                    >
                      {stepNum}
                    </Text>
                  )}
                </View>

                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: isCurrent ? '800' : '600',
                    color: isCurrent ? theme.ink : theme.mute,
                    fontFamily: isCurrent ? typography.family.sansBold : typography.family.sansSemibold,
                    textAlign: 'center',
                  }}
                >
                  {step.title}
                </Text>
                <Text
                  style={{
                    fontSize: 10.5,
                    color: theme.muteSoft,
                    fontFamily: typography.family.sans,
                    textAlign: 'center',
                    marginTop: 2,
                  }}
                  numberOfLines={1}
                >
                  {step.subtitle}
                </Text>
              </View>

              {/* Connecting Line between steps */}
              {index < steps.length - 1 && (
                <View
                  style={{
                    flex: 1,
                    height: 2,
                    backgroundColor: stepNum < currentStage ? theme.purple : theme.border,
                    marginTop: 12,
                    marginHorizontal: -4,
                  }}
                />
              )}
            </React.Fragment>
          );
        })}
      </View>

      {/* Tracking info badge if shifting / in-transit */}
      {trackingNumber ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            alignSelf: 'center',
            backgroundColor: theme.purpleSoft,
            borderRadius: 20,
            paddingHorizontal: 12,
            paddingVertical: 6,
            marginTop: 14,
          }}
        >
          <Feather name="truck" size={14} color={theme.primary} style={{ marginRight: 6 }} />
          <Text
            style={{
              fontSize: 12,
              color: theme.primary,
              fontFamily: typography.family.sansMedium,
            }}
          >
            {courierName ? `${courierName}: ` : ''}
            <Text style={{ fontWeight: '700' }}>{trackingNumber}</Text>
          </Text>
        </View>
      ) : null}
    </View>
  );
}
