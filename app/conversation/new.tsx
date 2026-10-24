import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
  StyleSheet,
} from 'react-native';
import { Text, TextInput } from '@/lib/rnText';
import { useAndroidKeyboardShown } from '@/components/ui';
import { useLocalSearchParams, router } from 'expo-router';
import { safeBack } from '@/lib/nav';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/lib/auth';
import { useListingQuery, useProfileQuery } from '@/lib/queries';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { getOrCreateConversation, sendMessage, sendOffer } from '@/lib/chat';
import { getOrCreateSupportConversation, SUPPORT_BOT_USER_ID, SUPPORT_BOT_NAME, SUPPORT_BOT_AVATAR } from '@/lib/support';
import { getOptimizedImageUrl, cardImageUrl, IMAGE_TRANSITION } from '@/lib/images';
import { formatPrice } from '@/lib/currency';
import { orderTotal } from '@/lib/fees';
import { calculateOfferPresets, isOfferAmountValid } from '@/lib/bundle';
import { useToast } from '@/lib/toast';
import { captureError } from '@/lib/sentry';
import { radii, shadow, type } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';
import { PressableScale } from '@/components/PressableScale';

type Mode = 'message' | 'offer';

const QUICK_REPLIES_LISTING = [
  'Hi! Is this still available?',
  'Could you share more details or photos?',
  'Would you bundle this with another item?',
  'Is the price negotiable?',
];


function Eyebrow({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <Text
      style={{
        fontSize: 11,
        fontFamily: type.family.sansBold,
        letterSpacing: 1.0,
        textTransform: 'uppercase',
        marginBottom: 8,
        color: theme.muteSoft,
      }}
    >
      {children}
    </Text>
  );
}

export default function NewConversationScreen() {
  const { theme } = useTheme();
  const params = useLocalSearchParams<{
    listing?: string;
    user?: string;
    support?: string;
    mode?: string;
    amount?: string;
    bundle_ids?: string;
  }>();

  const listingId = typeof params.listing === 'string' ? params.listing : '';
  const targetUserId = typeof params.user === 'string' ? params.user : '';
  const isSupport = params.support === 'true' || targetUserId === SUPPORT_BOT_USER_ID;

  const initialMode: Mode = params.mode === 'offer' && !!listingId ? 'offer' : 'message';
  const initialAmountRaw = typeof params.amount === 'string' ? params.amount : '';
  const initialAmount = initialAmountRaw ? String(parseFloat(initialAmountRaw) || '') : '';
  const bundleIdsParam = typeof params.bundle_ids === 'string' ? params.bundle_ids : '';
  const bundleItemIds = useMemo(
    () => bundleIdsParam.split(',').filter(Boolean),
    [bundleIdsParam],
  );
  const isBundle = bundleItemIds.length > 0;
  const bundleCount = 1 + bundleItemIds.length;

  const { user } = useAuth();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const keyboardShown = useAndroidKeyboardShown();
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const compact = winHeight < 700 || winWidth < 360;

  const listingQ = useListingQuery(listingId || null);
  const listing = listingQ.data ?? null;

  const targetProfileQ = useProfileQuery(!listingId && targetUserId ? targetUserId : '');
  const targetProfile = targetProfileQ.data ?? null;

  const [mode, setMode] = useState<Mode>(initialMode);
  const [message, setMessage] = useState('');
  const [amount, setAmount] = useState(initialAmount);
  const [sending, setSending] = useState(false);
  const [selectedCard, setSelectedCard] = useState<'tier10' | 'tier20' | 'custom'>('custom');

  const messageRef = useRef<any>(null);
  const amountRef = useRef<any>(null);

  // Fetch authoritative prices for bundle items from the server so the offer
  // ceiling is never derived from the (untrusted) URL `amount` param.
  const bundleItemPricesQ = useQuery({
    queryKey: ['bundleItemPrices', ...bundleItemIds],
    enabled: isBundle && bundleItemIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('listings')
        .select('id, price')
        .in('id', bundleItemIds);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as { id: string; price: number }[];
      if (rows.length !== bundleItemIds.length) {
        throw new Error('One or more bundled items are no longer available.');
      }
      return rows;
    },
  });
  const bundleItemPrices = bundleItemPricesQ.data ?? null;

  useEffect(() => {
    if (bundleItemPricesQ.isError) {
      toast.show(
        bundleItemPricesQ.error?.message || 'Some items in this bundle could not be loaded.',
        { variant: 'default', icon: 'alert-triangle' },
      );
    }
  }, [bundleItemPricesQ.isError, bundleItemPricesQ.error, toast]);
  // If navigating to message a user directly from their profile without a listing,
  // redirect straight to that user's inbox conversation thread
  useEffect(() => {
    if (!listingId && targetUserId && !isSupport && user && targetUserId !== user.id) {
      getOrCreateConversation({
        buyerId: user.id,
        sellerId: targetUserId,
        listingId: null,
      })
        .then((conv) => {
          if (conv?.id) {
            router.replace(`/conversation/${conv.id}` as any);
          }
        })
        .catch((err) => {
          console.warn('[conversation/new] failed to initialize conversation', err);
          captureError(err, { fn: 'conversationNew.directRedirect' });
          toast.show('Could not start conversation. Please try again.', {
            variant: 'default',
            icon: 'alert-triangle',
          });
        });
    }
  }, [listingId, targetUserId, isSupport, user, toast]);

  // Base price reference for offer presets and ceiling.
  // Non-bundle: listing.price (authoritative from the DB).
  // Bundle: listing.price + sum of fetched bundle item prices.
  const baseReferencePrice = useMemo(() => {
    const listingPrice = Number(listing?.price ?? 0);
    if (isBundle) {
      if (bundleItemPrices && bundleItemPrices.length === bundleItemIds.length && bundleItemPrices.length > 0) {
        const addOnTotal = bundleItemPrices.reduce((sum, item) => sum + Number(item.price ?? 0), 0);
        return listingPrice + addOnTotal;
      }
      return 0;
    }
    return listingPrice;
  }, [isBundle, bundleItemPrices, bundleItemIds.length, listing?.price]);

  // Preset tiers: 10% and 20%
  const { preset10, preset20 } = useMemo(
    () => calculateOfferPresets(baseReferencePrice),
    [baseReferencePrice],
  );

  const hasInitializedAmount = useRef(Boolean(initialAmount));
  const isBundlePricesLoading = isBundle && bundleItemIds.length > 0 && bundleItemPricesQ.isLoading;
  const isBundleReady =
    !isBundle ||
    (bundleItemPricesQ.isSuccess &&
      Array.isArray(bundleItemPrices) &&
      bundleItemPrices.length === bundleItemIds.length);

  useEffect(() => {
    if (
      baseReferencePrice > 0 &&
      !hasInitializedAmount.current &&
      isBundleReady &&
      !isBundlePricesLoading
    ) {
      hasInitializedAmount.current = true;
      setAmount(String(preset20 || Math.round(baseReferencePrice * 0.8)));
      setSelectedCard('custom');
    }
  }, [baseReferencePrice, preset20, isBundleReady, isBundlePricesLoading]);

  const handleSelectCard = (card: 'tier10' | 'tier20' | 'custom') => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    setSelectedCard(card);

    if (card === 'tier10') {
      setAmount(String(preset10));
      amountRef.current?.blur?.();
    } else if (card === 'tier20') {
      setAmount(String(preset20));
      amountRef.current?.blur?.();
    } else if (card === 'custom') {
      amountRef.current?.focus?.();
    }
  };

  const handleCustomChange = (text: string) => {
    const clean = text.replace(/[^0-9.]/g, '');
    setSelectedCard('custom');
    setAmount(clean);
  };

  const amountNum = parseFloat(amount) || 0;
  const offerValid =
    mode === 'offer' &&
    isBundleReady &&
    isOfferAmountValid({
      amountNum,
      isBundle,
      baseReferencePrice,
      listingPrice: listing?.price,
    });
  const msgValid = mode === 'message' && message.trim().length > 0;

  const totalWithProtection = useMemo(() => {
    if (amountNum <= 0) return 0;
    return orderTotal(amountNum);
  }, [amountNum]);

  const handleSend = async () => {
    if (!user) {
      Alert.alert('Sign in required', 'Please sign in to send messages or offers.');
      return;
    }

    if (isSupport) {
      setSending(true);
      try {
        const conv = await getOrCreateSupportConversation(user.id);
        if (!conv) {
          Alert.alert('Could not connect to support', 'Please try again.');
          return;
        }
        const saved = await sendMessage({
          conversationId: conv.id,
          senderId: user.id,
          content: message.trim(),
        });
        if (!saved) {
          Alert.alert('Could not send message', 'Please try again.');
          return;
        }
        toast.show('Message sent to Support', { variant: 'success', icon: 'check' });
        router.replace(`/conversation/${conv.id}` as any);
      } catch (err) {
        captureError(err, { fn: 'conversationNew.sendSupport' });
        Alert.alert('Error', 'Could not send message. Please try again.');
      } finally {
        setSending(false);
      }
      return;
    }

    // Direct user messaging without listing
    if (!listingId && targetUserId) {
      if (targetUserId === user.id) {
        Alert.alert('Heads up', "You can't message yourself.");
        return;
      }
      setSending(true);
      try {
        const conv = await getOrCreateConversation({
          buyerId: user.id,
          sellerId: targetUserId,
          listingId: null,
        });
        if (!conv) {
          Alert.alert('Could not start chat', 'Please try again.');
          return;
        }
        const saved = await sendMessage({
          conversationId: conv.id,
          senderId: user.id,
          content: message.trim(),
        });
        if (!saved) {
          Alert.alert('Could not send message', 'Please try again.');
          return;
        }
        toast.show('Message sent', { variant: 'success', icon: 'check' });
        router.replace(`/conversation/${conv.id}` as any);
      } catch (err) {
        captureError(err, { fn: 'conversationNew.sendDirect' });
        Alert.alert('Error', 'Could not start conversation. Please try again.');
      } finally {
        setSending(false);
      }
      return;
    }

    // Listing-based messaging or offer
    if (!listing) return;
    if (listing.seller_id === user.id) {
      Alert.alert('Heads up', "You can't message yourself.");
      return;
    }
    setSending(true);

    try {
      const conv = await getOrCreateConversation({
        buyerId: user.id,
        sellerId: listing.seller_id,
        listingId: listing.id,
      });
      if (!conv) {
        Alert.alert('Could not start chat', 'Please try again.');
        return;
      }

      let ok = false;
      if (mode === 'offer') {
        if (isBundle && (!bundleItemPrices || bundleItemPrices.length !== bundleItemIds.length)) {
          Alert.alert('Bundle Unavailable', 'One or more bundled items could not be verified.');
          return;
        }
        const saved = await sendOffer({
          conversationId: conv.id,
          senderId: user.id,
          amount: amountNum,
          note: undefined,
          isBundle: isBundle,
          bundleItemIds: isBundle ? bundleItemIds : undefined,
          bundleCount: isBundle ? bundleCount : undefined,
          baseListingId: listing.id,
        });
        ok = !!saved;
      } else {
        const saved = await sendMessage({
          conversationId: conv.id,
          senderId: user.id,
          content: message.trim(),
        });
        ok = !!saved;
      }

      if (!ok) {
        Alert.alert('Could not send', 'Please try again.');
        return;
      }
      toast.show(mode === 'offer' ? (isBundle ? 'Bundle offer sent' : 'Offer sent') : 'Message sent', {
        variant: 'success',
        icon: 'check',
      });
      router.replace(`/conversation/${conv.id}` as any);
    } catch (err) {
      captureError(err, { fn: 'conversationNew.send' });
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleLearnWhy = () => {
    Alert.alert(
      'Daily Offer Limit',
      'To prevent spam and keep negotiations active and meaningful for sellers, buyers are limited to 25 offers per day.',
      [{ text: 'Got it' }]
    );
  };

  // Loading state
  if ((listingId && listingQ.isPending) || (targetUserId && targetProfileQ.isPending && !isSupport)) {
    return (
      <SafeAreaView
        edges={['top']}
        style={{ flex: 1, backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center' }}
      >
        <ActivityIndicator color={theme.primary} />
      </SafeAreaView>
    );
  }

  // Unavailable state if no listing and no target user
  if (!listing && !targetUserId && !isSupport) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.background }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 }}>
          <Pressable onPress={() => safeBack()} hitSlop={12}>
            <Feather name="x" size={24} color={theme.ink} />
          </Pressable>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: theme.panel,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
            }}
          >
            <Feather name="alert-circle" size={24} color={theme.mute} />
          </View>
          <Text style={{ fontSize: 18, fontFamily: type.family.sansBold, color: theme.ink }}>
            Conversation unavailable
          </Text>
          <Text
            style={{ fontSize: 14, marginTop: 6, textAlign: 'center', lineHeight: 20, color: theme.mute }}
          >
            The selected item or profile is no longer accessible.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const thumb = listing ? getOptimizedImageUrl(cardImageUrl(listing, 0), { width: 240 }) : null;
  const targetName = isSupport
    ? SUPPORT_BOT_NAME
    : targetProfile?.full_name || targetProfile?.username || (listing?.seller ? (listing.seller as any).username : 'User');
  const targetAvatar = isSupport
    ? SUPPORT_BOT_AVATAR
    : targetProfile?.avatar_url
    ? getOptimizedImageUrl(targetProfile.avatar_url, { width: 120 })
    : null;

  return (
    <SafeAreaView
      edges={['top']}
      style={{ flex: 1, backgroundColor: theme.background, overflow: 'hidden' }}
    >
      <KeyboardAvoidingView
        // Edge-to-edge (Expo 54) disables adjustResize, so Android needs padding too
        behavior={Platform.OS === 'web' ? undefined : 'padding'}
        enabled={keyboardShown}
        style={{ flex: 1 }}
      >
        {/* Top Header */}
        <View
          style={[
            styles.headerBar,
            { borderBottomColor: theme.hairline },
          ]}
        >
          <Pressable
            onPress={() => safeBack()}
            hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
            style={styles.closeButton}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Text style={[styles.closeText, { color: theme.muteSoft }]}>Cancel</Text>
          </Pressable>

          <Text
            numberOfLines={1}
            style={[
              styles.headerTitle,
              { color: theme.ink, fontFamily: type.family.sansBold },
            ]}
          >
            {mode === 'offer' ? 'Make an offer' : `Message ${targetName}`}
          </Text>

          {listing && mode === 'message' ? (
            <Pressable
              onPress={() => setMode('offer')}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={styles.modeSwitchBtn}
            >
              <Text style={[styles.modeSwitchText, { color: theme.primary, fontFamily: type.family.sansBold }]}>
                Offer
              </Text>
            </Pressable>
          ) : (
            <View style={styles.headerSpacer} />
          )}
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 14,
            paddingBottom: Math.max(insets.bottom, 24) + 80,
          }}
        >
          {/* Listing Context Card (if from a listing) */}
          {listing && (
            <View style={[styles.itemRow, { backgroundColor: theme.panel, borderColor: theme.hairline }]}>
              {thumb ? (
                <Image
                  source={{ uri: thumb }}
                  style={styles.itemImage}
                  contentFit="cover"
                  transition={IMAGE_TRANSITION}
                />
              ) : (
                <View style={[styles.itemImagePlaceholder, { backgroundColor: theme.surface }]}>
                  <Feather name="tag" size={20} color={theme.mute} />
                </View>
              )}

              <View style={styles.itemDetails}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.itemTitle,
                      { flex: 1, color: theme.ink, fontFamily: type.family.sansBold },
                    ]}
                  >
                    {listing.title}
                  </Text>
                  {isBundle && (
                    <View
                      style={{
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: radii.pill,
                        backgroundColor: theme.primary,
                      }}
                    >
                      <Text style={{ fontSize: 10.5, fontWeight: '800', color: '#FFFFFF' }}>
                        Bundle · {bundleCount} items
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.itemPrice, { color: theme.mute }]}>
                  {isBundle ? `Base total: ${formatPrice(baseReferencePrice)}` : `Item price: ${formatPrice(listing.price)}`}
                </Text>
              </View>
            </View>
          )}

          {/* Profile Context Card (if direct messaging a user or support) */}
          {!listing && (
            <View
              style={[
                styles.itemRow,
                { backgroundColor: theme.panel, borderColor: theme.hairline },
              ]}
            >
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: theme.surface,
                  borderWidth: 1,
                  borderColor: theme.border,
                  overflow: 'hidden',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {targetAvatar ? (
                  <Image
                    source={{ uri: targetAvatar }}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                  />
                ) : (
                  <Feather name="user" size={22} color={theme.primary} />
                )}
              </View>

              <View style={styles.itemDetails}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.itemTitle,
                      { color: theme.ink, fontFamily: type.family.sansBold, flexShrink: 1 },
                    ]}
                  >
                    {targetName}
                  </Text>
                  {isSupport && (
                    <View
                      style={{
                        paddingHorizontal: 7,
                        paddingVertical: 1.5,
                        borderRadius: radii.pill,
                        backgroundColor: theme.purpleSoft,
                        flexShrink: 0,
                      }}
                    >
                      <Text style={{ fontSize: 10, fontFamily: type.family.sansBold, color: theme.purple }}>
                        OFFICIAL SUPPORT
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.itemPrice, { color: theme.muteSoft }]}>
                  {isSupport
                    ? '24/7 Live Customer Concierge'
                    : targetProfile?.username
                    ? `@${targetProfile.username} · Active Seller`
                    : 'Direct Conversation'}
                </Text>
              </View>
            </View>
          )}

          {/* Offer Mode (for Listings) */}
          {mode === 'offer' && listing ? (
            <>
              {/* 3 Preset Tier Cards */}
              <View style={styles.cardsRow}>
                {/* 10% off card */}
                <Pressable
                  onPress={() => handleSelectCard('tier10')}
                  style={[
                    styles.presetCard,
                    {
                      backgroundColor: selectedCard === 'tier10' ? theme.primarySoft : theme.panel,
                      borderColor: selectedCard === 'tier10' ? theme.primary : theme.border,
                      borderWidth: selectedCard === 'tier10' ? 1.5 : 1,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`10% off: ${formatPrice(preset10)}`}
                >
                  <Text
                    style={[
                      styles.cardTopText,
                      { color: selectedCard === 'tier10' ? theme.primary : theme.ink, fontFamily: type.family.sansBold },
                    ]}
                  >
                    {formatPrice(preset10)}
                  </Text>
                  <Text style={[styles.cardBottomText, { color: selectedCard === 'tier10' ? theme.primary : theme.muteSoft, fontFamily: type.family.sansMedium }]}>
                    10% off
                  </Text>
                </Pressable>

                {/* 20% off card */}
                <Pressable
                  onPress={() => handleSelectCard('tier20')}
                  style={[
                    styles.presetCard,
                    {
                      backgroundColor: selectedCard === 'tier20' ? theme.primarySoft : theme.panel,
                      borderColor: selectedCard === 'tier20' ? theme.primary : theme.border,
                      borderWidth: selectedCard === 'tier20' ? 1.5 : 1,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`20% off: ${formatPrice(preset20)}`}
                >
                  <Text
                    style={[
                      styles.cardTopText,
                      { color: selectedCard === 'tier20' ? theme.primary : theme.ink, fontFamily: type.family.sansBold },
                    ]}
                  >
                    {formatPrice(preset20)}
                  </Text>
                  <Text style={[styles.cardBottomText, { color: selectedCard === 'tier20' ? theme.primary : theme.muteSoft, fontFamily: type.family.sansMedium }]}>
                    20% off
                  </Text>
                </Pressable>

                {/* Custom card */}
                <Pressable
                  onPress={() => handleSelectCard('custom')}
                  style={[
                    styles.presetCard,
                    {
                      backgroundColor: selectedCard === 'custom' ? theme.primarySoft : theme.panel,
                      borderColor: selectedCard === 'custom' ? theme.primary : theme.border,
                      borderWidth: selectedCard === 'custom' ? 1.5 : 1,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Custom set a price"
                >
                  <Text
                    style={[
                      styles.cardTopText,
                      { color: selectedCard === 'custom' ? theme.primary : theme.ink, fontFamily: type.family.sansBold },
                    ]}
                  >
                    Custom
                  </Text>
                  <Text style={[styles.cardBottomText, { color: selectedCard === 'custom' ? theme.primary : theme.muteSoft, fontFamily: type.family.sansMedium }]}>
                    Set a price
                  </Text>
                </Pressable>
              </View>

              {/* Input Section */}
              <Pressable
                onPress={() => {
                  setSelectedCard('custom');
                  amountRef.current?.focus?.();
                }}
                style={[
                  styles.inputSection,
                  {
                    backgroundColor: theme.panel,
                    borderColor: selectedCard === 'custom' ? theme.primary : theme.border,
                  },
                ]}
              >
                <Text style={[styles.inputEyebrow, { color: theme.muteSoft }]}>YOUR OFFER AMOUNT</Text>
                <View style={styles.displayRow}>
                  <TextInput
                    ref={amountRef}
                    value={amount}
                    onChangeText={handleCustomChange}
                    placeholder="0"
                    placeholderTextColor={theme.muteSoft}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                    style={[
                      styles.amountInput,
                      {
                        color: theme.ink,
                        fontFamily: type.family.sansBold,
                      },
                    ]}
                  />
                </View>

                {/* Fee breakdown helper text */}
                <Text style={[styles.feeHelperText, { color: theme.mute }]}>
                  {amountNum > 0
                    ? `${formatPrice(totalWithProtection)} incl. Buyer Protection fee`
                    : `Includes Buyer Protection guarantee`}
                </Text>
              </Pressable>

              {/* Action Button */}
              <View style={styles.actionButtonContainer}>
                <PressableScale
                  onPress={handleSend}
                  disabled={!offerValid || sending}
                  style={[
                    styles.actionButton,
                    {
                      backgroundColor: theme.primary,
                      opacity: !offerValid || sending ? 0.45 : 1,
                      ...shadow.sm,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={
                    amountNum > 0 ? `Offer ${formatPrice(amountNum)}` : 'Make an offer'
                  }
                >
                  <Text
                    style={[
                      styles.actionButtonText,
                      { fontFamily: type.family.sansBold },
                    ]}
                  >
                    {sending
                      ? 'Sending offer…'
                      : amountNum > 0
                      ? `Send Offer · ${formatPrice(amountNum)}`
                      : 'Make an offer'}
                  </Text>
                </PressableScale>
              </View>

              {/* Limit Subtext */}
              <View style={styles.limitRow}>
                <Text style={[styles.limitText, { color: theme.muteSoft }]}>
                  Offers left for today.{' '}
                </Text>
                <Pressable onPress={handleLearnWhy} hitSlop={6}>
                  <Text style={[styles.learnWhyText, { color: theme.primary }]}>Learn why.</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              {/* Message Mode */}
              <View style={{ marginTop: 12 }}>
                <Eyebrow>Your message</Eyebrow>
                <View
                  style={{
                    borderRadius: radii.xl,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    minHeight: compact ? 120 : 140,
                    backgroundColor: theme.panel,
                    borderWidth: 1,
                    borderColor: theme.border,
                  }}
                >
                  <TextInput
                    ref={messageRef}
                    placeholder={
                      isSupport
                        ? 'Describe your question or issue…'
                        : `Hi ${targetName}! I have a question…`
                    }
                    value={message}
                    onChangeText={setMessage}
                    multiline
                    textAlignVertical="top"
                    placeholderTextColor={theme.muteSoft}
                    style={{
                      fontSize: 15,
                      color: theme.ink,
                      padding: 0,
                      minHeight: compact ? 100 : 120,
                      fontFamily: type.family.sans,
                      outlineStyle: 'none',
                      outlineWidth: 0,
                    } as any}
                  />
                </View>
              </View>

              {/* Quick replies (listing inquiries only) */}
              {listing && (
                <View style={{ marginTop: 18 }}>
                  <Eyebrow>Quick starters</Eyebrow>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {QUICK_REPLIES_LISTING.map((q) => {
                      const active = message === q;
                      return (
                        <PressableScale
                          key={q}
                          onPress={() => setMessage(q)}
                          style={{
                            paddingHorizontal: 13,
                            paddingVertical: 8,
                            borderRadius: radii.pill,
                            borderWidth: 1,
                            borderColor: active ? theme.primary : theme.border,
                            backgroundColor: active ? theme.primarySoft : theme.panel,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 13,
                              fontFamily: type.family.sansMedium,
                              color: active ? theme.primary : theme.ink,
                            }}
                            numberOfLines={1}
                          >
                            {q}
                          </Text>
                        </PressableScale>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Message Send Button */}
              <View style={{ marginTop: 24 }}>
                <PressableScale
                  onPress={handleSend}
                  disabled={!msgValid || sending}
                  style={[
                    styles.actionButton,
                    {
                      backgroundColor: theme.primary,
                      opacity: !msgValid || sending ? 0.45 : 1,
                      ...shadow.sm,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.actionButtonText,
                      { fontFamily: type.family.sansBold },
                    ]}
                  >
                    {sending ? 'Sending message…' : 'Send message'}
                  </Text>
                </PressableScale>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  closeButton: {
    paddingVertical: 4,
    paddingHorizontal: 4,
    minWidth: 50,
  },
  closeText: {
    fontSize: 15,
  },
  headerTitle: {
    fontSize: 16,
    textAlign: 'center',
    letterSpacing: -0.2,
    maxWidth: 200,
  },
  headerSpacer: {
    minWidth: 50,
  },
  modeSwitchBtn: {
    paddingVertical: 4,
    paddingHorizontal: 4,
    minWidth: 50,
    alignItems: 'flex-end',
  },
  modeSwitchText: {
    fontSize: 15,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    padding: 10,
    borderRadius: radii.xl,
    borderWidth: 1,
  },
  itemImage: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
  },
  itemImagePlaceholder: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemDetails: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  itemTitle: {
    fontSize: 15,
    marginBottom: 2,
    letterSpacing: -0.1,
  },
  itemPrice: {
    fontSize: 13,
  },
  cardsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  presetCard: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: radii.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTopText: {
    fontSize: 15,
    marginBottom: 2,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  cardBottomText: {
    fontSize: 12,
    textAlign: 'center',
  },
  inputSection: {
    marginBottom: 18,
    padding: 14,
    borderRadius: radii.xl,
    borderWidth: 1,
  },
  inputEyebrow: {
    fontSize: 10.5,
    fontFamily: type.family.sansBold,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  displayRow: {
    paddingVertical: 2,
  },
  amountInput: {
    fontSize: 24,
    padding: 0,
    margin: 0,
    height: 36,
    outlineStyle: 'none',
    outlineWidth: 0,
  } as any,
  feeHelperText: {
    fontSize: 12.5,
    marginTop: 6,
  },
  actionButtonContainer: {
    marginBottom: 12,
  },
  actionButton: {
    height: 48,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  actionButtonText: {
    fontSize: 15,
    color: '#FFFFFF',
    letterSpacing: 0.1,
  },
  limitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  limitText: {
    fontSize: 12.5,
  },
  learnWhyText: {
    fontSize: 12.5,
    fontFamily: type.family.sansBold,
    textDecorationLine: 'underline',
  },
});
