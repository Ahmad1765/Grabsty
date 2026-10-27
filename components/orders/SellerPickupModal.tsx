import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Platform,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SafeContainer } from '@/components/ui/SafeContainer';
import { Text, TextInput } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { tap } from '@/lib/haptics';
import { useTheme } from '@/context/ThemeContext';
import { type as typography } from '@/lib/theme';
import { HIT_SLOP_8 } from '@/lib/responsive';
import { BRAND } from '@/lib/brand';
import type { ShippingAddress } from '@/types';

export interface SellerPickupAddressInput {
  recipientName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
}

interface SellerPickupModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirmPickup: (address: SellerPickupAddressInput) => Promise<void>;
  initialAddress?: Partial<ShippingAddress> | null;
  defaultContactName?: string;
}

export function SellerPickupModal({
  visible,
  onClose,
  onConfirmPickup,
  initialAddress,
  defaultContactName = '',
}: SellerPickupModalProps) {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();

  const [recipientName, setRecipientName] = useState('');
  const [phone, setPhone] = useState('');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [city, setCity] = useState('');
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setRecipientName(
        initialAddress?.recipient_name || defaultContactName || '',
      );
      setPhone(initialAddress?.phone || '');
      setLine1(initialAddress?.line1 || '');
      setLine2(initialAddress?.line2 || '');
      setCity(initialAddress?.city || '');
      setSaving(false);
      setValidationError(null);
    }
  }, [visible, initialAddress, defaultContactName]);

  const handleConfirm = async () => {
    if (!recipientName.trim()) {
      setValidationError('Contact name is required');
      return;
    }
    if (!phone.trim()) {
      setValidationError('Contact phone is required for courier rider');
      return;
    }
    // Same rule as the buyer's checkout address: the rider has to reach this number.
    const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');
    if (!/^\+?\d{10,15}$/.test(cleanPhone)) {
      setValidationError('Enter a valid phone number (10 to 15 digits)');
      return;
    }
    if (!line1.trim()) {
      setValidationError('Pickup street address is required');
      return;
    }
    if (!city.trim()) {
      setValidationError('City is required');
      return;
    }

    setValidationError(null);
    tap('medium');
    setSaving(true);
    try {
      await onConfirmPickup({
        recipientName: recipientName.trim(),
        phone: phone.trim(),
        line1: line1.trim(),
        line2: line2.trim() || undefined,
        city: city.trim(),
      });
      onClose();
    } catch {
      // Sheet stays open if error thrown
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={saving ? undefined : onClose}
      statusBarTranslucent
    >
      <SafeContainer
        mode="keyboard-avoiding"
        noScroll
        edges={[]}
        backgroundColor="transparent"
        style={{ flex: 1 }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: theme.overlay,
            justifyContent: Platform.OS === 'web' ? 'center' : 'flex-end',
            alignItems: 'center',
            paddingHorizontal: Platform.OS === 'web' ? 16 : 0,
          }}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={saving ? undefined : onClose}
            accessibilityLabel="Dismiss"
          />

          <View
            style={[
              {
                width: '100%',
                maxWidth: 480,
                maxHeight: '90%',
                backgroundColor: theme.paper,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                borderRadius: Platform.OS === 'web' ? 24 : 0,
                borderWidth: 1,
                borderColor: theme.border,
                paddingTop: 18,
                paddingHorizontal: 20,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: -4 },
                shadowOpacity: 0.1,
                shadowRadius: 16,
                elevation: 10,
              },
              { paddingBottom: Math.max(insets.bottom, 16) + 12 },
            ]}
          >
            {/* Grabber */}
            <View style={{ alignItems: 'center', marginBottom: 12 }}>
              <View
                style={{
                  width: 38,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: theme.border,
                }}
              />
            </View>

            {/* Header */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 14,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: '700',
                    color: theme.ink,
                    fontFamily: typography.family.sansBold,
                  }}
                >
                  Confirm Pickup Address
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: theme.mute,
                    marginTop: 2,
                    fontFamily: typography.family.sans,
                  }}
                >
                  {BRAND} Operations will arrange a courier to collect from here.
                </Text>
              </View>

              <Pressable
                onPress={saving ? undefined : onClose}
                hitSlop={HIT_SLOP_8}
                accessibilityLabel="Close sheet"
                style={({ pressed }) => [
                  {
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.panel,
                  },
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Feather name="x" size={18} color={theme.mute} />
              </Pressable>
            </View>

            {validationError && (
              <View
                style={{
                  backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : '#FEF2F2',
                  borderWidth: 1,
                  borderColor: isDark ? 'rgba(239,68,68,0.35)' : '#FECACA',
                  borderRadius: 10,
                  padding: 10,
                  marginBottom: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <Feather name="alert-circle" size={16} color="#EF4444" style={{ marginRight: 6 }} />
                <Text style={{ fontSize: 13, color: isDark ? '#FCA5A5' : '#991B1B', fontFamily: typography.family.sansMedium }}>
                  {validationError}
                </Text>
              </View>
            )}

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 10 }}>
              {/* Contact Name */}
              <Text
                style={{
                  fontSize: 12.5,
                  fontWeight: '700',
                  color: theme.ink,
                  fontFamily: typography.family.sansBold,
                  marginBottom: 6,
                }}
              >
                Contact / Sender Name *
              </Text>
              <TextInput
                value={recipientName}
                onChangeText={setRecipientName}
                placeholder="e.g. John Doe"
                placeholderTextColor={theme.muteSoft}
                style={{
                  height: 46,
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  fontSize: 14,
                  color: theme.ink,
                  backgroundColor: theme.surface,
                  marginBottom: 12,
                }}
              />

              {/* Phone */}
              <Text
                style={{
                  fontSize: 12.5,
                  fontWeight: '700',
                  color: theme.ink,
                  fontFamily: typography.family.sansBold,
                  marginBottom: 6,
                }}
              >
                Phone Number (for Courier Rider) *
              </Text>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="03001234567"
                keyboardType="phone-pad"
                placeholderTextColor={theme.muteSoft}
                style={{
                  height: 46,
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  fontSize: 14,
                  color: theme.ink,
                  backgroundColor: theme.surface,
                  marginBottom: 12,
                }}
              />

              {/* Street Address */}
              <Text
                style={{
                  fontSize: 12.5,
                  fontWeight: '700',
                  color: theme.ink,
                  fontFamily: typography.family.sansBold,
                  marginBottom: 6,
                }}
              >
                Pickup Street Address *
              </Text>
              <TextInput
                value={line1}
                onChangeText={setLine1}
                placeholder="House / Flat / Street / Area"
                placeholderTextColor={theme.muteSoft}
                style={{
                  height: 46,
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  fontSize: 14,
                  color: theme.ink,
                  backgroundColor: theme.surface,
                  marginBottom: 12,
                }}
              />

              {/* Apartment / Landmark */}
              <Text
                style={{
                  fontSize: 12.5,
                  fontWeight: '700',
                  color: theme.ink,
                  fontFamily: typography.family.sansBold,
                  marginBottom: 6,
                }}
              >
                Apartment, Suite, Unit, Landmark (Optional)
              </Text>
              <TextInput
                value={line2}
                onChangeText={setLine2}
                placeholder="e.g. Near Mall / Block B"
                placeholderTextColor={theme.muteSoft}
                style={{
                  height: 46,
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  fontSize: 14,
                  color: theme.ink,
                  backgroundColor: theme.surface,
                  marginBottom: 12,
                }}
              />

              {/* City */}
              <Text
                style={{
                  fontSize: 12.5,
                  fontWeight: '700',
                  color: theme.ink,
                  fontFamily: typography.family.sansBold,
                  marginBottom: 6,
                }}
              >
                City *
              </Text>
              <TextInput
                value={city}
                onChangeText={setCity}
                placeholder="e.g. Lahore, Karachi, Islamabad"
                placeholderTextColor={theme.muteSoft}
                style={{
                  height: 46,
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  fontSize: 14,
                  color: theme.ink,
                  backgroundColor: theme.surface,
                  marginBottom: 16,
                }}
              />

              {/* Confirm Button */}
              <Pressable
                onPress={handleConfirm}
                disabled={saving}
                style={({ pressed }) => [
                  {
                    height: 50,
                    borderRadius: 14,
                    backgroundColor: theme.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                  },
                  saving && { opacity: 0.7 },
                  pressed && { opacity: 0.88, transform: [{ scale: 0.99 }] },
                ]}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Feather name="check-circle" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: '700',
                        color: '#FFFFFF',
                        fontFamily: typography.family.sansBold,
                      }}
                    >
                      Confirm & Mark Ready for Pickup
                    </Text>
                  </>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </SafeContainer>
    </Modal>
  );
}
