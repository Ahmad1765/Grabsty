import React, { useState, useEffect } from 'react';
import {
  View,
  Modal,
  Pressable,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { ShieldCheckIcon } from '@/components/ui/ShieldCheckIcon';

import { formatPrice } from '@/lib/fees';
import { HIT_SLOP_8 } from '@/lib/responsive';

import { useTheme } from '@/context/ThemeContext';
interface MockStripePaymentSheetProps {
  visible: boolean;
  totalAmount: number;
  itemTitle?: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  loading?: boolean;
}

export function MockStripePaymentSheet({
  visible,
  totalAmount,
  itemTitle,
  onClose,
  onConfirm,
  loading = false,
}: MockStripePaymentSheetProps) {
  const { theme: colors } = useTheme();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) {
      setSubmitting(false);
    }
  }, [visible]);

  const isBusy = loading || submitting;

  const handlePay = async () => {
    if (isBusy) return;
    setSubmitting(true);
    try {
      await onConfirm();
    } catch {
      // Error handled by onConfirm or toast; avoid unhandled promise rejection
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => {
        if (!isBusy) onClose();
      }}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.65)',
          justifyContent: Platform.OS === 'web' ? 'center' : 'flex-end',
          alignItems: 'center',
          paddingHorizontal: Platform.OS === 'web' ? 16 : 0,
        }}
      >
        {/* Backdrop press */}
        <Pressable
          style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}
          onPress={() => {
            if (!isBusy) onClose();
          }}
        />

        {/* Sheet Content */}
        <View
          style={{
            width: '100%',
            maxWidth: 480,
            backgroundColor: colors.paper,
            borderRadius: Platform.OS === 'web' ? 24 : 0,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingHorizontal: 22,
            paddingTop: 18,
            paddingBottom: Platform.OS === 'ios' ? 38 : 24,
            maxHeight: '90%',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.2,
            shadowRadius: 24,
            elevation: 10,
          }}
        >
          {/* Grab handle for native */}
          {Platform.OS !== 'web' ? (
            <View
              style={{
                width: 38,
                height: 4,
                borderRadius: 2,
                backgroundColor: 'rgba(0,0,0,0.15)',
                alignSelf: 'center',
                marginBottom: 16,
              }}
            />
          ) : null}

          {/* Stripe Header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 18,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  backgroundColor: '#635BFF',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Feather name="lock" size={13} color={colors.white} />
              </View>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '800',
                  color: colors.ink,
                  letterSpacing: -0.2,
                }}
              >
                Stripe Payment Sheet
              </Text>
              <View
                style={{
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  borderRadius: 6,
                  backgroundColor: colors.primarySofter,
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: '800',
                    color: colors.primary,
                    letterSpacing: 0.5,
                  }}
                >
                  SIMULATED
                </Text>
              </View>
            </View>

            <Pressable
              onPress={() => {
                if (!isBusy) onClose();
              }}
              hitSlop={HIT_SLOP_8}
              disabled={isBusy}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: colors.panel,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Feather name="x" size={18} color={colors.ink} />
            </Pressable>
          </View>

          {/* Amount & Item Breakdown */}
          <View
            style={{
              backgroundColor: colors.panel,
              borderRadius: 16,
              padding: 16,
              marginBottom: 16,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'baseline',
              }}
            >
              <Text style={{ fontSize: 13, color: colors.mute, fontWeight: '500' }}>
                Total amount
              </Text>
              <Text
                style={{
                  fontSize: 22,
                  fontWeight: '900',
                  color: colors.ink,
                  letterSpacing: -0.5,
                }}
              >
                {formatPrice(totalAmount)}
              </Text>
            </View>
            {itemTitle ? (
              <Text
                style={{
                  fontSize: 12,
                  color: colors.mute,
                  marginTop: 4,
                }}
                numberOfLines={1}
              >
                {itemTitle}
              </Text>
            ) : null}
          </View>

          {/* Payment Method - Credit Card */}
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
            <View
              style={{
                flex: 1,
                paddingVertical: 12,
                paddingHorizontal: 12,
                borderRadius: 12,
                borderWidth: 1.5,
                borderColor: '#635BFF',
                backgroundColor: '#F4F3FF',
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <Feather
                name="credit-card"
                size={16}
                color="#635BFF"
              />
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '700',
                  color: '#635BFF',
                }}
              >
                Credit / Debit Card
              </Text>
            </View>
          </View>

          {/* Mock Test Card Banner */}
          <View
            style={{
              borderRadius: 14,
              borderWidth: 1,
              borderColor: 'rgba(0,0,0,0.1)',
              backgroundColor: '#FAFAFA',
              padding: 16,
              marginBottom: 16,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 8,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View
                  style={{
                    width: 32,
                    height: 22,
                    borderRadius: 4,
                    backgroundColor: '#1A1F71',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 9, fontWeight: '900', color: colors.white }}>
                    VISA
                  </Text>
                </View>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink }}>
                  •••• 4242 (Stripe Test Card)
                </Text>
              </View>
              <Feather name="check-circle" size={16} color="#00D924" />
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 12, color: colors.mute }}>Expires 12/28</Text>
              <Text style={{ fontSize: 12, color: colors.mute }}>CVC •••</Text>
            </View>
          </View>

          {/* PCI Security Note */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              marginBottom: 20,
              paddingHorizontal: 4,
            }}
          >
            <ShieldCheckIcon size={16} />
            <Text
              style={{
                fontSize: 11.5,
                color: colors.mute,
                lineHeight: 16,
                flex: 1,
              }}
            >
              PCI-DSS Compliant. Direct integration ready for @stripe/stripe-react-native.
            </Text>
          </View>


          {/* Simulate Payment Button */}
          <Pressable
            onPress={handlePay}
            disabled={isBusy}
            style={({ pressed }) => ({
              height: 54,
              borderRadius: 14,
              backgroundColor: isBusy ? '#A09CFF' : '#635BFF',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 10,
              opacity: pressed ? 0.9 : 1,
              shadowColor: '#635BFF',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 10,
              elevation: 4,
            })}
          >
            {isBusy ? (
              <>
                <ActivityIndicator size="small" color={colors.white} />
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: '800',
                    color: colors.white,
                  }}
                >
                  Simulating payment…
                </Text>
              </>
            ) : (
              <>
                <Feather name="zap" size={15} color={colors.white} />
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: '800',
                    color: colors.white,
                  }}
                >
                  Simulate Payment ({formatPrice(totalAmount)})
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
