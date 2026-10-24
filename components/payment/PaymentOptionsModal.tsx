import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Pressable,
  ScrollView,
  Platform,
  StyleSheet,
} from 'react-native';
import { KeyboardAvoider } from '@/components/ui/SafeContainer';
import { Text, TextInput } from '@/lib/rnText';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/context/ThemeContext';
import { type as typography } from '@/lib/theme';
import { HIT_SLOP_8 } from '@/lib/responsive';
import { BRAND } from '@/lib/brand';
import { STRIPE_ENABLED } from '@/lib/payments';

export type PaymentMethodOption = 'card' | 'apple_pay' | 'cod' | 'jazzcash' | 'easypaisa';

export interface SelectedPaymentMethod {
  method: PaymentMethodOption;
  cardBrand?: string;
  cardLast4?: string;
  walletNumber?: string;
  saveCard?: boolean;
}

interface PaymentOptionsModalProps {
  visible: boolean;
  onClose: () => void;
  selectedMethod: PaymentMethodOption;
  onSelect: (selected: SelectedPaymentMethod) => void;
}

export function PaymentOptionsModal({
  visible,
  onClose,
  selectedMethod: initialSelected,
  onSelect,
}: PaymentOptionsModalProps) {
  const { theme, isDark } = useTheme();
  const [selected, setSelected] = useState<PaymentMethodOption>(initialSelected || (STRIPE_ENABLED ? 'card' : 'cod'));
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [cardName, setCardName] = useState('');
  const [showCardForm, setShowCardForm] = useState(false);
  const [saveCard, setSaveCard] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [walletPhone, setWalletPhone] = useState('');
  const [walletError, setWalletError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      const active = initialSelected || (STRIPE_ENABLED ? 'card' : 'cod');
      setSelected(active);
      setShowCardForm(active === 'card');
      setCardError(null);
      setWalletError(null);
    }
  }, [visible, initialSelected]);

  const handleSelect = (method: PaymentMethodOption) => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => {});
    }
    setSelected(method);
    setShowCardForm(method === 'card');
    setWalletError(null);
    setCardError(null);
  };

  const handleProceed = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }

    let brand: string | undefined = undefined;
    let last4: string | undefined = undefined;

    if (selected === 'card') {
      const clean = cardNumber.replace(/\s+/g, '');
      if (!clean) {
        setCardError('Please enter your card number');
        return;
      }
      if (clean.length >= 4) {
        last4 = clean.slice(-4);
        if (clean.startsWith('5')) brand = 'Mastercard';
        else if (clean.startsWith('3')) brand = 'Amex';
        else if (clean.startsWith('4')) brand = 'Visa';
        else brand = 'Card';
      } else {
        last4 = clean;
        brand = 'Card';
      }
    }

    if (selected === 'jazzcash' || selected === 'easypaisa') {
      const clean = walletPhone.replace(/\D/g, '');
      if (!clean) {
        setWalletError(`Please enter your ${selected === 'jazzcash' ? 'JazzCash' : 'Easypaisa'} mobile number`);
        return;
      }
      if (clean.length < 10) {
        setWalletError('Please enter a valid 11-digit mobile number');
        return;
      }
    }

    onSelect({
      method: selected,
      cardBrand: selected === 'card' ? brand : undefined,
      cardLast4: selected === 'card' ? last4 : undefined,
      walletNumber: selected === 'jazzcash' || selected === 'easypaisa' ? walletPhone : undefined,
      saveCard: selected === 'card' ? saveCard : undefined,
    });
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.surface }} edges={['top', 'bottom']}>
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingTop: 14,
            paddingBottom: 14,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: theme.border,
            backgroundColor: theme.surface,
          }}
        >
          <Pressable
            onPress={onClose}
            hitSlop={HIT_SLOP_8}
            accessibilityRole="button"
            accessibilityLabel="Close payment options"
            style={({ pressed }) => [
              {
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
              },
            ]}
          >
            <Feather name="x" size={18} color={theme.ink} />
          </Pressable>
          <Text
            style={{
              fontSize: 16,
              fontWeight: '700',
              color: theme.ink,
              fontFamily: typography.family.sansBold,
            }}
          >
            Payment options
          </Text>
          <View style={{ width: 36 }} />
        </View>

        <KeyboardAvoider style={{ flex: 1 }}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 30 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
          {/* Online methods all settle through Stripe; without it only COD can actually collect money. */}
          {STRIPE_ENABLED && (
          <>
          {/* Option 1: Bank Card */}
          <Pressable
            onPress={() => handleSelect('card')}
            accessibilityRole="radio"
            accessibilityState={{ selected: selected === 'card' }}
            style={({ pressed }) => [
              { paddingVertical: 14 },
              pressed && { opacity: 0.8 },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <View style={{ width: 38, height: 28, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                <Feather name="credit-card" size={22} color={theme.ink} />
              </View>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: theme.ink, fontFamily: typography.family.sansBold, marginBottom: 3 }}>
                  Bank card
                </Text>
                <Text style={{ fontSize: 12.5, color: theme.mute, fontFamily: typography.family.sans, lineHeight: 17 }}>
                  {BRAND} never shares your payment information with the seller.
                </Text>

                {/* Card Brand Badges */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 }}>
                  {/* Mastercard badge */}
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      height: 18,
                      paddingHorizontal: 4,
                      borderRadius: 3,
                      backgroundColor: '#FFFFFF',
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor: '#E0E0E0',
                      justifyContent: 'center',
                    }}
                  >
                    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#EB001B', zIndex: 1 }} />
                    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#F79E1B', marginLeft: -8 }} />
                  </View>
                  {/* Visa badge */}
                  <View
                    style={{
                      height: 18,
                      paddingHorizontal: 5,
                      borderRadius: 3,
                      backgroundColor: '#FFFFFF',
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor: '#E0E0E0',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: '900', color: '#1A1F71', letterSpacing: 0.5, fontStyle: 'italic' }}>
                      VISA
                    </Text>
                  </View>
                  {/* Amex / Generic badge */}
                  <View
                    style={{
                      height: 18,
                      paddingHorizontal: 5,
                      borderRadius: 3,
                      backgroundColor: theme.panel,
                      borderWidth: 1,
                      borderColor: theme.border,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 9, fontWeight: '700', color: theme.mute, letterSpacing: 0.3 }}>
                      CARD
                    </Text>
                  </View>
                </View>
              </View>

              {/* Radio Indicator */}
              <View
                style={[
                  {
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    borderWidth: 2,
                    borderColor: theme.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginTop: 2,
                  },
                  selected === 'card' && { borderColor: theme.purple },
                ]}
              >
                {selected === 'card' && <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: theme.purple }} />}
              </View>
            </View>

            {/* Optional Expandable Card Entry Form */}
            {selected === 'card' && showCardForm && (
              <View
                style={{
                  marginTop: 14,
                  marginLeft: 38,
                  padding: 12,
                  backgroundColor: theme.panel,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: theme.border,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: theme.ink, marginBottom: 4, fontFamily: typography.family.sansSemibold }}>
                  Cardholder Name
                </Text>
                <TextInput
                  value={cardName}
                  onChangeText={setCardName}
                  placeholder="e.g. Sam Lee"
                  placeholderTextColor={theme.muteSoft}
                  style={{
                    height: 40,
                    backgroundColor: theme.surface,
                    borderWidth: 1,
                    borderColor: theme.border,
                    borderRadius: 6,
                    paddingHorizontal: 10,
                    fontSize: Platform.OS === 'web' ? 16 : 14,
                    color: theme.ink,
                    fontFamily: typography.family.sansMedium,
                  }}
                />

                <Text style={{ fontSize: 12, fontWeight: '600', color: theme.ink, marginTop: 10, marginBottom: 4, fontFamily: typography.family.sansSemibold }}>
                  Card Number
                </Text>
                <TextInput
                  value={cardNumber}
                  onChangeText={(val) => {
                    if (cardError) setCardError(null);
                    const clean = val.replace(/\D/g, '').slice(0, 16);
                    const formatted = clean.match(/.{1,4}/g)?.join(' ') || clean;
                    setCardNumber(formatted);
                  }}
                  keyboardType="number-pad"
                  placeholder="•••• •••• •••• 2907"
                  placeholderTextColor={theme.muteSoft}
                  style={[
                    {
                      height: 40,
                      backgroundColor: theme.surface,
                      borderWidth: 1,
                      borderColor: theme.border,
                      borderRadius: 6,
                      paddingHorizontal: 10,
                      fontSize: Platform.OS === 'web' ? 16 : 14,
                      color: theme.ink,
                      fontFamily: typography.family.sansMedium,
                    },
                    cardError ? { borderColor: '#EF4444' } : null,
                  ]}
                />
                {cardError ? (
                  <Text style={{ fontSize: 11.5, color: '#EF4444', marginTop: 4, fontFamily: typography.family.sansMedium }}>
                    {cardError}
                  </Text>
                ) : null}

                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: theme.ink, marginTop: 10, marginBottom: 4, fontFamily: typography.family.sansSemibold }}>
                      Expiry Date
                    </Text>
                    <TextInput
                      value={cardExpiry}
                      onChangeText={(val) => {
                        const clean = val.replace(/\D/g, '').slice(0, 4);
                        if (clean.length >= 3) {
                          setCardExpiry(`${clean.slice(0, 2)}/${clean.slice(2)}`);
                        } else {
                          setCardExpiry(clean);
                        }
                      }}
                      keyboardType="number-pad"
                      placeholder="MM/YY"
                      placeholderTextColor={theme.muteSoft}
                      style={{
                        height: 40,
                        backgroundColor: theme.surface,
                        borderWidth: 1,
                        borderColor: theme.border,
                        borderRadius: 6,
                        paddingHorizontal: 10,
                        fontSize: Platform.OS === 'web' ? 16 : 14,
                        color: theme.ink,
                        fontFamily: typography.family.sansMedium,
                      }}
                    />
                  </View>

                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: theme.ink, marginTop: 10, marginBottom: 4, fontFamily: typography.family.sansSemibold }}>
                      CVV / CVC
                    </Text>
                    <TextInput
                      value={cardCvc}
                      onChangeText={(val) => setCardCvc(val.replace(/\D/g, '').slice(0, 4))}
                      keyboardType="number-pad"
                      secureTextEntry
                      placeholder="•••"
                      placeholderTextColor={theme.muteSoft}
                      style={{
                        height: 40,
                        backgroundColor: theme.surface,
                        borderWidth: 1,
                        borderColor: theme.border,
                        borderRadius: 6,
                        paddingHorizontal: 10,
                        fontSize: Platform.OS === 'web' ? 16 : 14,
                        color: theme.ink,
                        fontFamily: typography.family.sansMedium,
                      }}
                    />
                  </View>
                </View>

                {/* Save Card Toggle */}
                <Pressable
                  onPress={() => setSaveCard(!saveCard)}
                  style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: saveCard }}
                >
                  <View
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 4,
                      borderWidth: 1.5,
                      borderColor: saveCard ? theme.purple : theme.border,
                      backgroundColor: saveCard ? theme.purple : theme.surface,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 8,
                    }}
                  >
                    {saveCard && <Feather name="check" size={12} color="#FFFFFF" />}
                  </View>
                  <Text style={{ fontSize: 12.5, color: theme.ink, fontFamily: typography.family.sansMedium }}>
                    Save card for future purchases
                  </Text>
                </Pressable>
              </View>
            )}
          </Pressable>

          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.border, marginVertical: 6 }} />

          {/* Section: Mobile Wallets */}
          <View style={{ paddingTop: 6, paddingBottom: 2 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: theme.muteSoft, fontFamily: typography.family.sansBold, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
              Mobile Wallets (Pakistan)
            </Text>
          </View>

          {/* Option: JazzCash */}
          <Pressable
            onPress={() => handleSelect('jazzcash')}
            accessibilityRole="radio"
            accessibilityState={{ selected: selected === 'jazzcash' }}
            style={({ pressed }) => [
              { paddingVertical: 14 },
              pressed && { opacity: 0.8 },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <View
                style={{
                  width: 38,
                  height: 28,
                  borderRadius: 6,
                  backgroundColor: '#ED1B24',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 12,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.5 }}>
                  JC
                </Text>
              </View>
              <View style={{ flex: 1, marginRight: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: theme.ink, fontFamily: typography.family.sansBold }}>
                    JazzCash
                  </Text>
                  <View style={{ paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 4, backgroundColor: isDark ? 'rgba(237, 27, 36, 0.15)' : '#FEE2E2' }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#DC2626', fontFamily: typography.family.sansBold }}>
                      Preview
                    </Text>
                  </View>
                </View>
                <Text style={{ fontSize: 12.5, color: theme.mute, fontFamily: typography.family.sans, lineHeight: 17, marginTop: 2 }}>
                  Pay using your JazzCash mobile account or voucher.
                </Text>
              </View>

              {/* Radio Indicator */}
              <View
                style={[
                  {
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    borderWidth: 2,
                    borderColor: theme.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginTop: 2,
                  },
                  selected === 'jazzcash' && { borderColor: theme.purple },
                ]}
              >
                {selected === 'jazzcash' && <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: theme.purple }} />}
              </View>
            </View>

            {/* Expandable JazzCash Form */}
            {selected === 'jazzcash' && (
              <View
                style={{
                  marginTop: 14,
                  marginLeft: 38,
                  padding: 12,
                  backgroundColor: theme.panel,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: theme.border,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: theme.ink, marginBottom: 4, fontFamily: typography.family.sansSemibold }}>
                  JazzCash Account Number
                </Text>
                <TextInput
                  value={walletPhone}
                  onChangeText={(val) => {
                    if (walletError) setWalletError(null);
                    setWalletPhone(val.replace(/\D/g, '').slice(0, 11));
                  }}
                  keyboardType="phone-pad"
                  maxLength={11}
                  placeholder="0300 1234567"
                  placeholderTextColor={theme.muteSoft}
                  style={[
                    {
                      height: 40,
                      backgroundColor: theme.surface,
                      borderWidth: 1,
                      borderColor: theme.border,
                      borderRadius: 6,
                      paddingHorizontal: 10,
                      fontSize: Platform.OS === 'web' ? 16 : 14,
                      color: theme.ink,
                      fontFamily: typography.family.sansMedium,
                    },
                    walletError ? { borderColor: '#EF4444' } : null,
                  ]}
                />
                {walletError ? (
                  <Text style={{ fontSize: 11.5, color: '#EF4444', marginTop: 4, fontFamily: typography.family.sansMedium }}>
                    {walletError}
                  </Text>
                ) : (
                  <Text style={{ fontSize: 11, color: theme.mute, marginTop: 4, fontFamily: typography.family.sans }}>
                    You will receive an authorization prompt on your phone (UI Preview).
                  </Text>
                )}
              </View>
            )}
          </Pressable>

          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.border, marginVertical: 6 }} />

          {/* Option: Easypaisa */}
          <Pressable
            onPress={() => handleSelect('easypaisa')}
            accessibilityRole="radio"
            accessibilityState={{ selected: selected === 'easypaisa' }}
            style={({ pressed }) => [
              { paddingVertical: 14 },
              pressed && { opacity: 0.8 },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <View
                style={{
                  width: 38,
                  height: 28,
                  borderRadius: 6,
                  backgroundColor: '#00A859',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 12,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.5 }}>
                  EP
                </Text>
              </View>
              <View style={{ flex: 1, marginRight: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: theme.ink, fontFamily: typography.family.sansBold }}>
                    Easypaisa
                  </Text>
                  <View style={{ paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 4, backgroundColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#E5E7EB' }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: theme.ink, fontFamily: typography.family.sansBold }}>
                      Preview
                    </Text>
                  </View>
                </View>
                <Text style={{ fontSize: 12.5, color: theme.mute, fontFamily: typography.family.sans, lineHeight: 17, marginTop: 2 }}>
                  Pay using your Easypaisa mobile account or in-app approval.
                </Text>
              </View>

              {/* Radio Indicator */}
              <View
                style={[
                  {
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    borderWidth: 2,
                    borderColor: theme.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginTop: 2,
                  },
                  selected === 'easypaisa' && { borderColor: theme.purple },
                ]}
              >
                {selected === 'easypaisa' && <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: theme.purple }} />}
              </View>
            </View>

            {/* Expandable Easypaisa Form */}
            {selected === 'easypaisa' && (
              <View
                style={{
                  marginTop: 14,
                  marginLeft: 38,
                  padding: 12,
                  backgroundColor: theme.panel,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: theme.border,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: theme.ink, marginBottom: 4, fontFamily: typography.family.sansSemibold }}>
                  Easypaisa Account Number
                </Text>
                <TextInput
                  value={walletPhone}
                  onChangeText={(val) => {
                    if (walletError) setWalletError(null);
                    setWalletPhone(val.replace(/\D/g, '').slice(0, 11));
                  }}
                  keyboardType="phone-pad"
                  maxLength={11}
                  placeholder="0300 1234567"
                  placeholderTextColor={theme.muteSoft}
                  style={[
                    {
                      height: 40,
                      backgroundColor: theme.surface,
                      borderWidth: 1,
                      borderColor: theme.border,
                      borderRadius: 6,
                      paddingHorizontal: 10,
                      fontSize: Platform.OS === 'web' ? 16 : 14,
                      color: theme.ink,
                      fontFamily: typography.family.sansMedium,
                    },
                    walletError ? { borderColor: '#EF4444' } : null,
                  ]}
                />
                {walletError ? (
                  <Text style={{ fontSize: 11.5, color: '#EF4444', marginTop: 4, fontFamily: typography.family.sansMedium }}>
                    {walletError}
                  </Text>
                ) : (
                  <Text style={{ fontSize: 11, color: theme.mute, marginTop: 4, fontFamily: typography.family.sans }}>
                    Approve the payment request in your Easypaisa app (UI Preview).
                  </Text>
                )}
              </View>
            )}
          </Pressable>

          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.border, marginVertical: 6 }} />

          {/* Option 2: Apple Pay */}
          <Pressable
            onPress={() => handleSelect('apple_pay')}
            accessibilityRole="radio"
            accessibilityState={{ selected: selected === 'apple_pay' }}
            style={({ pressed }) => [
              { paddingVertical: 14 },
              pressed && { opacity: 0.8 },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 8,
                  paddingVertical: 5,
                  borderWidth: 1,
                  borderColor: isDark ? theme.border : '#111111',
                  borderRadius: 5,
                  backgroundColor: isDark ? '#000000' : '#FFFFFF',
                  marginTop: 2,
                }}
              >
                <Ionicons name="logo-apple" size={15} color={isDark ? '#FFFFFF' : '#000000'} style={{ marginRight: 2 }} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#FFFFFF' : '#000000', fontFamily: typography.family.sansBold }}>
                  Pay
                </Text>
              </View>
              <View style={{ flex: 1, marginLeft: 14, marginRight: 12 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: theme.ink, fontFamily: typography.family.sansBold, marginBottom: 3 }}>
                  Apple Pay
                </Text>
                <Text style={{ fontSize: 12.5, color: theme.mute, fontFamily: typography.family.sans, lineHeight: 17 }}>
                  Instant checkout using your Apple Wallet.
                </Text>
              </View>

              {/* Radio Indicator */}
              <View
                style={[
                  {
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    borderWidth: 2,
                    borderColor: theme.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginTop: 2,
                  },
                  selected === 'apple_pay' && { borderColor: theme.purple },
                ]}
              >
                {selected === 'apple_pay' && <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: theme.purple }} />}
              </View>
            </View>
          </Pressable>

          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.border, marginVertical: 6 }} />

          </>
          )}

          {/* Option 3: Cash on Delivery (COD) */}
          <Pressable
            onPress={() => handleSelect('cod')}
            accessibilityRole="radio"
            accessibilityState={{ selected: selected === 'cod' }}
            style={({ pressed }) => [
              { paddingVertical: 14 },
              pressed && { opacity: 0.8 },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <View style={{ width: 38, height: 28, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                <Feather name="package" size={20} color={theme.ink} />
              </View>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: theme.ink, fontFamily: typography.family.sansBold, marginBottom: 3 }}>
                  Cash on Delivery
                </Text>
                <Text style={{ fontSize: 12.5, color: theme.mute, fontFamily: typography.family.sans, lineHeight: 17 }}>
                  Pay with cash when the parcel is delivered to your door.
                </Text>
              </View>

              {/* Radio Indicator */}
              <View
                style={[
                  {
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    borderWidth: 2,
                    borderColor: theme.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginTop: 2,
                  },
                  selected === 'cod' && { borderColor: theme.purple },
                ]}
              >
                {selected === 'cod' && <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: theme.purple }} />}
              </View>
            </View>
          </Pressable>
        </ScrollView>

        {/* Bottom Proceed Action Button */}
        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: Platform.OS === 'ios' ? 12 : 20,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: theme.border,
            backgroundColor: theme.surface,
          }}
        >
          <Pressable
            onPress={handleProceed}
            style={({ pressed }) => [
              {
                height: 48,
                backgroundColor: theme.purple,
                borderRadius: 10,
                alignItems: 'center',
                justifyContent: 'center',
              },
              pressed && { opacity: 0.88, transform: [{ scale: 0.99 }] },
            ]}
          >
            <Text
              style={{
                fontSize: 15,
                fontWeight: '700',
                color: '#FFFFFF',
                fontFamily: typography.family.sansBold,
                letterSpacing: 0.2,
              }}
            >
              Proceed
            </Text>
          </Pressable>
        </View>
        </KeyboardAvoider>
      </SafeAreaView>
    </Modal>
  );
}
