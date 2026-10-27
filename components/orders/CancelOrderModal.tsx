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
import { KeyboardAvoider } from '@/components/ui/SafeContainer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, TextInput } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { tap } from '@/lib/haptics';
import { useTheme } from '@/context/ThemeContext';
import { type as typography } from '@/lib/theme';
import { HIT_SLOP_8 } from '@/lib/responsive';

export const CANCELLATION_REASONS = [
  'Changed my mind',
  'Selected wrong delivery address',
  'Seller agreed to cancel',
  'Ordered by mistake / duplicate',
  'Taking too long to ship',
  'Other reason',
] as const;

export const SELLER_CANCELLATION_REASONS = [
  'Item damaged or unavailable',
  'Buyer requested cancellation',
  'Unable to ship in time',
  'Pricing error',
  'Other reason',
] as const;

interface CancelOrderModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirmCancel: (reason: string) => Promise<void>;
  isSeller?: boolean;
}

export function CancelOrderModal({
  visible,
  onClose,
  onConfirmCancel,
  isSeller = false,
}: CancelOrderModalProps) {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const reasons = isSeller ? SELLER_CANCELLATION_REASONS : CANCELLATION_REASONS;
  const [selectedReason, setSelectedReason] = useState<string>(
    isSeller ? SELLER_CANCELLATION_REASONS[0] : CANCELLATION_REASONS[0],
  );
  const [customReason, setCustomReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (visible) {
      setSelectedReason(isSeller ? SELLER_CANCELLATION_REASONS[0] : CANCELLATION_REASONS[0]);
      setCustomReason('');
    }
  }, [visible, isSeller]);

  const handleConfirm = async () => {
    tap('medium');
    const finalReason =
      selectedReason === 'Other reason' && customReason.trim()
        ? customReason.trim()
        : selectedReason;

    setCancelling(true);
    try {
      await onConfirmCancel(finalReason);
      onClose();
    } catch {
      // Handled cleanly; toast shown by caller
    } finally {
      setCancelling(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={cancelling ? undefined : onClose}
      statusBarTranslucent
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
          onPress={cancelling ? undefined : onClose}
          accessibilityLabel="Dismiss"
        />

        <KeyboardAvoider
          style={{ width: '100%', maxWidth: 480 }}
        >
          <View
            style={[
              {
                width: '100%',
                maxHeight: '88%',
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
                shadowOpacity: 0.12,
                shadowRadius: 16,
                elevation: 10,
                overflow: 'hidden',
              },
              {
                paddingBottom: Math.max(insets.bottom, 20),
              },
            ]}
          >
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: '700',
                  color: theme.ink,
                  fontFamily: typography.family.sansBold,
                  letterSpacing: -0.3,
                }}
              >
                {isSeller ? 'Cancel sale' : 'Cancel order'}
              </Text>
              <Text
                style={{
                  fontSize: 12.5,
                  color: theme.mute,
                  fontFamily: typography.family.sans,
                  marginTop: 4,
                  lineHeight: 17,
                }}
              >
                {isSeller
                  ? 'The buyer will be notified and this listing will be unlocked.'
                  : 'Please select a reason. The item will be relisted and the seller will be notified.'}
              </Text>
            </View>
            <Pressable
              disabled={cancelling}
              onPress={onClose}
              hitSlop={HIT_SLOP_8}
              style={({ pressed }) => [
                {
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: theme.panel,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginLeft: 10,
                },
                pressed && { opacity: 0.6 },
              ]}
            >
              <Feather name="x" size={18} color={theme.ink} />
            </Pressable>
          </View>

          {/* Reason Selection List */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{ paddingBottom: 10 }}
          >
            {reasons.map((r) => {
              const active = selectedReason === r;
              return (
                <Pressable
                  key={r}
                  onPress={() => {
                    tap('light');
                    setSelectedReason(r);
                  }}
                  style={({ pressed }) => [
                    {
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 12,
                      paddingHorizontal: 12,
                      borderRadius: 10,
                      marginBottom: 6,
                      backgroundColor: active
                        ? isDark
                          ? 'rgba(239, 68, 68, 0.15)'
                          : '#FEF2F2'
                        : theme.panel,
                      borderWidth: 1,
                      borderColor: active ? '#EF4444' : theme.border,
                    },
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <View
                    style={[
                      {
                        width: 20,
                        height: 20,
                        borderRadius: 10,
                        borderWidth: 1.8,
                        borderColor: theme.border,
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 12,
                      },
                      active && { borderColor: '#EF4444' },
                    ]}
                  >
                    {active && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444' }} />}
                  </View>
                  <Text
                    style={{
                      fontSize: 13.5,
                      fontWeight: active ? '700' : '500',
                      color: active ? '#EF4444' : theme.ink,
                      fontFamily: active ? typography.family.sansBold : typography.family.sansMedium,
                    }}
                  >
                    {r}
                  </Text>
                </Pressable>
              );
            })}

            {/* Optional Custom Input if 'Other' */}
            {selectedReason === 'Other reason' && (
              <View style={{ marginTop: 6, marginBottom: 10 }}>
                <TextInput
                  value={customReason}
                  onChangeText={setCustomReason}
                  placeholder="Please specify why you are cancelling..."
                  placeholderTextColor={theme.muteSoft}
                  multiline
                  numberOfLines={2}
                  style={{
                    backgroundColor: theme.panel,
                    borderWidth: 1,
                    borderColor: theme.border,
                    borderRadius: 8,
                    padding: 10,
                    fontSize: 13.5,
                    color: theme.ink,
                    fontFamily: typography.family.sans,
                    minHeight: 60,
                    textAlignVertical: 'top',
                  }}
                />
              </View>
            )}
          </ScrollView>

          {/* Action Buttons */}
          <View style={{ paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }}>
            <Pressable
              disabled={cancelling}
              onPress={handleConfirm}
              style={({ pressed }) => [
                {
                  height: 48,
                  backgroundColor: '#DC2626',
                  borderRadius: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 8,
                },
                pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] },
              ]}
            >
              {cancelling ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text
                  style={{
                    fontSize: 14.5,
                    fontWeight: '700',
                    color: '#FFFFFF',
                    fontFamily: typography.family.sansBold,
                  }}
                >
                  {isSeller ? 'Confirm Cancellation' : 'Cancel Order'}
                </Text>
              )}
            </Pressable>

            <Pressable
              disabled={cancelling}
              onPress={onClose}
              style={({ pressed }) => [
                {
                  paddingVertical: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                },
                pressed && { opacity: 0.6 },
              ]}
            >
              <Text
                style={{
                  fontSize: 13.5,
                  fontWeight: '600',
                  color: theme.mute,
                  fontFamily: typography.family.sansSemibold,
                }}
              >
                Keep order
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoider>
    </View>
  </Modal>
  );
}
