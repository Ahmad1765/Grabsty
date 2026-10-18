import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Modal,
  Pressable,
  Platform,
  ActivityIndicator,
  TouchableWithoutFeedback,
} from 'react-native';
import { KeyboardAvoider } from '@/components/ui/SafeContainer';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, TextInput } from '@/lib/rnText';
import { radii, shadow, type } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';
import { formatPrice, CURRENCY_SYMBOL } from '@/lib/currency';
import { orderTotal } from '@/lib/fees';
import {
  OFFER_PRESET_TIERS,
  type OfferTierId,
  calculateTierPrices,
  isValidOfferAmount,
} from './offerHelpers';

export interface OfferSheetProps {
  visible: boolean;
  askingPrice?: number | null;
  itemPrice?: number | null; // backward compatibility alias
  title?: string | null;
  imageUrl?: string | null;
  onClose: () => void;
  onSubmit: (amount: number, note?: string) => Promise<void> | void;
  loading?: boolean;
  offersLeftToday?: number;
  /** Extra seller items bundled with this one. Shows "+N Bundle" under Continue when > 0. */
  bundleExtraCount?: number;
}

/**
 * Make an Offer Bottom Sheet (Reference Image 7 adapted to Grabsty UI).
 * Features:
 * - Bottom sheet presentation with top pull bar
 * - Title "Select offer amount" with close button
 * - -20%, -15%, -10%, -5%, Custom discount chips
 * - "Your offer:" summary row with strikethrough original price, discounted price, and + shipping
 * - Signal Purple "Continue" CTA
 * - "+N Bundle" line under Continue (product page only)
 */
export function OfferSheet({
  visible,
  askingPrice: askingPriceProp,
  itemPrice: itemPriceProp,
  title,
  imageUrl,
  onClose,
  onSubmit,
  loading = false,
  offersLeftToday = 25,
  bundleExtraCount,
}: OfferSheetProps) {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<any>(null);

  // Normalize asking price
  const askingPrice = Number(askingPriceProp ?? itemPriceProp ?? 0);

  const [selectedTier, setSelectedTier] = useState<OfferTierId>('20');
  const [customAmount, setCustomAmount] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  // Preset discount prices
  const tierPrices = useMemo(() => {
    return calculateTierPrices(askingPrice);
  }, [askingPrice]);

  // Reset state when opening
  useEffect(() => {
    if (visible) {
      setSelectedTier('20');
      setCustomAmount('');
      setSubmitting(false);
    }
  }, [visible, askingPrice]);

  // Web Escape key listener
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visible, onClose]);

  const handleSelectTier = (tierId: OfferTierId) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    setSelectedTier(tierId);
    if (tierId === 'custom') {
      setTimeout(() => {
        inputRef.current?.focus?.();
      }, 60);
    } else {
      inputRef.current?.blur?.();
    }
  };

  const handleCustomChange = (text: string) => {
    const clean = text.replace(/[^0-9.]/g, '');
    setCustomAmount(clean);
  };

  // Determine active offer amount
  const activeOfferAmount = useMemo(() => {
    if (selectedTier === 'custom') {
      return parseFloat(customAmount) || 0;
    }
    return tierPrices[selectedTier] || 0;
  }, [selectedTier, customAmount, tierPrices]);

  const isValidOffer = isValidOfferAmount(activeOfferAmount, askingPrice);

  const isCustomInvalid =
    selectedTier === 'custom' &&
    customAmount.trim().length > 0 &&
    (!isValidOffer || (askingPrice > 0 && activeOfferAmount >= askingPrice));

  const totalWithProtection = useMemo(() => {
    if (activeOfferAmount <= 0) return 0;
    return orderTotal(activeOfferAmount);
  }, [activeOfferAmount]);

  const handleSubmit = async () => {
    if (!isValidOffer || submitting || loading) return;
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }

    setSubmitting(true);
    try {
      await onSubmit(activeOfferAmount);
    } catch (e) {
      console.warn('[OfferSheet] submit failed', e);
    } finally {
      setSubmitting(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.55)',
            justifyContent: 'flex-end',
            alignItems: 'center',
          }}
        >
          <KeyboardAvoider
            style={{ width: '100%', alignItems: 'center' }}
          >
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View
                style={{
                  width: '100%',
                  maxWidth: 480,
                  backgroundColor: isDark ? theme.surface : '#FFFFFF',
                  borderTopLeftRadius: 24,
                  borderTopRightRadius: 24,
                  paddingHorizontal: 20,
                  paddingTop: 10,
                  paddingBottom: Math.max(insets.bottom + 8, 24),
                  ...shadow.lg,
                }}
              >
                {/* Drag Handle */}
                <View
                  style={{
                    alignSelf: 'center',
                    width: 38,
                    height: 4.5,
                    borderRadius: 2.5,
                    backgroundColor: isDark ? theme.border : '#E5E7EB',
                    marginBottom: 16,
                  }}
                />

                {/* Header: Title & Close Button */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 20,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 18,
                      fontFamily: type.family.sansBold,
                      color: theme.ink,
                      letterSpacing: -0.2,
                    }}
                  >
                    Select offer amount
                  </Text>
                  <Pressable
                    onPress={onClose}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                    hitSlop={8}
                    style={({ pressed }) => ({
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: pressed
                        ? isDark
                          ? theme.panel
                          : '#F4F4F5'
                        : 'transparent',
                    })}
                  >
                    <Feather name="x" size={20} color={theme.ink} />
                  </Pressable>
                </View>

                {/* Preset Chips Row: -20%, -15%, -10%, -5%, Custom */}
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
                  {OFFER_PRESET_TIERS.map((tier) => {
                    const isSelected = selectedTier === tier.id;
                    return (
                      <Pressable
                        key={tier.id}
                        onPress={() => handleSelectTier(tier.id)}
                        style={({ pressed }) => ({
                          flex: 1,
                          height: 42,
                          paddingHorizontal: 4,
                          borderRadius: 10,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: isSelected
                            ? isDark
                              ? '#FFFFFF'
                              : '#18181B'
                            : isDark
                            ? theme.panel
                            : '#F3F4F6',
                          transform: [{ scale: pressed ? 0.96 : 1 }],
                        })}
                        accessibilityRole="button"
                        accessibilityLabel={tier.label}
                      >
                        <Text
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.75}
                          style={{
                            fontSize: 14.5,
                            fontFamily: type.family.sansBold,
                            color: isSelected
                              ? isDark
                                ? '#111111'
                                : '#FFFFFF'
                              : theme.ink,
                            letterSpacing: -0.1,
                          }}
                        >
                          {tier.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Custom Amount Input Field (Expands when 'Custom' chip selected) */}
                {selectedTier === 'custom' && (
                  <View style={{ marginBottom: 18 }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: isDark ? theme.panel : '#F9FAFB',
                        borderWidth: 1.5,
                        borderColor: isCustomInvalid
                          ? '#EF4444'
                          : isDark
                          ? theme.border
                          : '#E5E7EB',
                        borderRadius: 12,
                        paddingHorizontal: 14,
                        height: 46,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 16,
                          fontFamily: type.family.sansBold,
                          color: theme.ink,
                          marginRight: 6,
                        }}
                      >
                        {CURRENCY_SYMBOL}
                      </Text>
                      <TextInput
                        ref={inputRef}
                        autoFocus
                        value={customAmount}
                        onChangeText={handleCustomChange}
                        placeholder={`Enter amount lower than ${formatPrice(askingPrice)}`}
                        placeholderTextColor={theme.muteSoft}
                        keyboardType="decimal-pad"
                        returnKeyType="done"
                        selectTextOnFocus
                        style={
                          {
                            flex: 1,
                            fontSize: 16,
                            fontFamily: type.family.sansBold,
                            color: theme.ink,
                            padding: 0,
                            outlineStyle: 'none',
                          } as any
                        }
                      />
                      {customAmount.length > 0 && (
                        <Pressable onPress={() => setCustomAmount('')} hitSlop={8}>
                          <Feather name="x-circle" size={16} color={theme.mute} />
                        </Pressable>
                      )}
                    </View>
                    {isCustomInvalid && (
                      <Text
                        style={{
                          fontSize: 12,
                          color: '#EF4444',
                          marginTop: 5,
                          paddingHorizontal: 2,
                        }}
                      >
                        {activeOfferAmount >= askingPrice
                          ? `Offer must be less than the asking price (${formatPrice(askingPrice)})`
                          : 'Please enter a valid offer amount'}
                      </Text>
                    )}
                  </View>
                )}

                {/* Summary Row: "Your offer:" with Strikethrough & Savings */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    marginBottom: 24,
                    paddingHorizontal: 2,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 15.5,
                      fontFamily: type.family.sansMedium,
                      color: theme.ink,
                      paddingTop: 2,
                      flexShrink: 0,
                    }}
                  >
                    Your offer:
                  </Text>

                  {/* Shrink + wrap so large system font sizes can't push prices off-screen */}
                  <View style={{ alignItems: 'flex-end', flexShrink: 1, marginLeft: 12 }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        justifyContent: 'flex-end',
                        alignItems: 'baseline',
                        columnGap: 6,
                      }}
                    >
                      {askingPrice > 0 && (
                        <Text
                          style={{
                            fontSize: 16,
                            fontFamily: type.family.sansBold,
                            color: '#9CA3AF',
                            textDecorationLine: 'line-through',
                          }}
                        >
                          {formatPrice(askingPrice)}
                        </Text>
                      )}
                      <Text
                        style={{
                          fontSize: 20,
                          fontFamily: type.family.sansBold,
                          color: isValidOffer ? '#16A34A' : theme.ink,
                        }}
                      >
                        {activeOfferAmount > 0
                          ? formatPrice(activeOfferAmount)
                          : '—'}
                      </Text>
                      <Text
                        style={{
                          fontSize: 13,
                          fontFamily: type.family.sans,
                          color: theme.mute,
                        }}
                      >
                        + shipping
                      </Text>
                    </View>

                    {isValidOffer && totalWithProtection > 0 && (
                      <Text
                        style={{
                          fontSize: 12,
                          fontFamily: type.family.sans,
                          color: theme.mute,
                          marginTop: 4,
                          textAlign: 'right',
                        }}
                      >
                        (est. {formatPrice(totalWithProtection)} with Buyer Protection)
                      </Text>
                    )}
                  </View>
                </View>

                {/* Action CTA: Signal Purple "Continue" button */}
                <Pressable
                  onPress={handleSubmit}
                  disabled={!isValidOffer || submitting || loading}
                  style={({ pressed }) => ({
                    height: 48,
                    borderRadius: radii.pill,
                    backgroundColor: theme.purple,
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%',
                    marginBottom: 16,
                    opacity:
                      !isValidOffer || submitting || loading
                        ? 0.45
                        : pressed
                        ? 0.88
                        : 1,
                    transform: [{ scale: pressed ? 0.985 : 1 }],
                    ...shadow.sm,
                  })}
                  accessibilityRole="button"
                  accessibilityLabel={
                    activeOfferAmount > 0
                      ? `Continue with offer of ${formatPrice(activeOfferAmount)}`
                      : 'Continue'
                  }
                >
                  {submitting || loading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text
                      style={{
                        fontSize: 16,
                        fontFamily: type.family.sansBold,
                        color: '#FFFFFF',
                        letterSpacing: 0.1,
                      }}
                    >
                      Continue
                    </Text>
                  )}
                </Pressable>

                {!!bundleExtraCount && (
                  <View
                    testID="offer-bundle-count"
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  >
                    <Feather name="package" size={14} color={bundleExtraCount > 0 ? theme.purple : theme.mute} />
                    <Text
                      style={{
                        fontSize: 13,
                        fontFamily: type.family.sansSemibold,
                        color: bundleExtraCount > 0 ? theme.purple : theme.mute,
                      }}
                    >
                      +{bundleExtraCount} Bundle
                    </Text>
                  </View>
                )}
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAvoider>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}
