// Cancel order / Cancel sale sheet.
//
// Built on the shared BottomSheetModal: the old hand-rolled Modal +
// KeyboardAvoidingView left a band of overlay under the sheet on iOS and
// Android (fine on web). The "Other reason" field lifts above the keyboard
// with an animated spacer synced to the keyboard's own show/hide timing.

import React, { useEffect, useRef, useState } from 'react';
import { View, Pressable, ActivityIndicator, Animated, Keyboard, Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, TextInput } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { tap } from '@/lib/haptics';
import { useTheme } from '@/context/ThemeContext';
import { type as typography } from '@/lib/theme';
import { BottomSheetModal } from '@/components/ui/BottomSheetModal';

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

function useKeyboardSpacer(active: boolean, bottomInset: number) {
  const height = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active || Platform.OS === 'web') return;
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, (e) =>
      Animated.timing(height, {
        toValue: Math.max(0, e.endCoordinates.height - bottomInset),
        duration: e.duration || 220,
        useNativeDriver: false,
      }).start(),
    );
    const hide = Keyboard.addListener(hideEvt, (e) =>
      Animated.timing(height, { toValue: 0, duration: e?.duration || 200, useNativeDriver: false }).start(),
    );
    return () => {
      show.remove();
      hide.remove();
      height.setValue(0);
    };
  }, [active, bottomInset, height]);
  return height;
}

export function CancelOrderModal({ visible, onClose, onConfirmCancel, isSeller = false }: CancelOrderModalProps) {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const reasons = isSeller ? SELLER_CANCELLATION_REASONS : CANCELLATION_REASONS;
  const [selectedReason, setSelectedReason] = useState<string>(reasons[0]);
  const [customReason, setCustomReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const keyboardSpacer = useKeyboardSpacer(visible, insets.bottom);

  useEffect(() => {
    if (visible) {
      setSelectedReason((isSeller ? SELLER_CANCELLATION_REASONS : CANCELLATION_REASONS)[0]);
      setCustomReason('');
      setCancelling(false);
    }
  }, [visible, isSeller]);

  const isOther = selectedReason === 'Other reason';
  const canConfirm = !cancelling && (!isOther || customReason.trim().length >= 3);

  const close = () => {
    if (!cancelling) onClose();
  };

  const handleConfirm = async () => {
    if (!canConfirm) return;
    tap('medium');
    Keyboard.dismiss();
    setCancelling(true);
    try {
      await onConfirmCancel(isOther ? customReason.trim() : selectedReason);
      onClose();
    } catch {
      // caller shows the error toast
    } finally {
      setCancelling(false);
    }
  };

  return (
    <BottomSheetModal
      visible={visible}
      onClose={close}
      title={isSeller ? 'Cancel sale' : 'Cancel order'}
      subtitle={isSeller ? 'The buyer is notified and the item is relisted.' : 'The item is relisted and the seller is notified.'}
      autoHeight
      disableDrag={cancelling}
    >
      <View style={{ paddingBottom: 4 }}>
        <Text style={{ fontSize: 13, fontFamily: typography.family.sansSemibold, color: theme.ink, marginBottom: 10 }}>
          Why are you cancelling?
        </Text>
        <View
          style={{
            borderRadius: 12,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: theme.border,
            overflow: 'hidden',
          }}
        >
          {reasons.map((r, i) => {
            const active = selectedReason === r;
            return (
              <Pressable
                key={r}
                testID={`cancel-reason-${i}`}
                onPress={() => {
                  tap('light');
                  setSelectedReason(r);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  minHeight: 48,
                  paddingHorizontal: 14,
                  gap: 12,
                  backgroundColor: pressed ? theme.surface : theme.panel,
                  borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth,
                  borderTopColor: theme.border,
                })}
              >
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    borderWidth: 1.5,
                    borderColor: active ? theme.ink : theme.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {active ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: theme.ink }} /> : null}
                </View>
                <Text
                  style={{
                    flex: 1,
                    fontSize: 14.5,
                    color: theme.ink,
                    fontFamily: active ? typography.family.sansSemibold : typography.family.sans,
                  }}
                >
                  {r}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {isOther ? (
          <TextInput
            value={customReason}
            onChangeText={(t) => setCustomReason(t.slice(0, 300))}
            placeholder="Tell us a little more"
            placeholderTextColor={theme.muteSoft}
            multiline
            autoFocus
            style={{
              marginTop: 12,
              minHeight: 72,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: theme.panel,
              padding: 12,
              fontSize: 14,
              color: theme.ink,
              fontFamily: typography.family.sans,
              textAlignVertical: 'top',
            }}
          />
        ) : null}

        <Pressable
          testID="confirm-cancel-order"
          disabled={!canConfirm}
          onPress={handleConfirm}
          accessibilityRole="button"
          style={({ pressed }) => ({
            marginTop: 18,
            height: 48,
            borderRadius: 10,
            backgroundColor: theme.danger,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 8,
            opacity: !canConfirm ? 0.5 : pressed ? 0.85 : 1,
          })}
        >
          {cancelling ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              <Feather name="x-circle" size={16} color="#FFFFFF" />
              <Text style={{ fontSize: 15, color: '#FFFFFF', fontFamily: typography.family.sansBold }}>
                {isSeller ? 'Cancel sale' : 'Cancel order'}
              </Text>
            </>
          )}
        </Pressable>
        <Pressable
          disabled={cancelling}
          onPress={close}
          accessibilityRole="button"
          style={({ pressed }) => ({
            height: 44,
            marginTop: 6,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text style={{ fontSize: 14, color: isDark ? theme.ink : theme.mute, fontFamily: typography.family.sansSemibold }}>
            {isSeller ? 'Keep sale' : 'Keep order'}
          </Text>
        </Pressable>
        <Animated.View style={{ height: keyboardSpacer }} />
      </View>
    </BottomSheetModal>
  );
}
