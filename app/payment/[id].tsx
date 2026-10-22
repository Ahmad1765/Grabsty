import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Platform,
  StyleSheet,
} from 'react-native';
import { Text } from '@/lib/rnText';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useLocalSearchParams, router, Redirect } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getOptimizedImageUrl, cardImageUrl, IMAGE_TRANSITION } from '@/lib/images';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/context/ThemeContext';
import { type as typography, radii, tabularNumberStyle } from '@/lib/theme';
import { useListingQuery } from '@/lib/queries';
import { queryClient } from '@/lib/queryClient';
import { qk } from '@/lib/queries/keys';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { safeBack } from '@/lib/nav';
import { HIT_SLOP_8, CONTENT_MAX_WIDTH } from '@/lib/responsive';
import { supabase } from '@/lib/supabase';
import { buyerProtectionFee, formatPrice, getParcelDeliveryFee } from '@/lib/fees';
import { ShieldCheckIcon } from '@/components/ui/ShieldCheckIcon';
import {
  computeBundlePricing,
  sanitizeBundleItemIds,
  computeCheckoutItemPrice,
} from '@/lib/bundle';
import { AddressSheet, type AddressForm } from '@/components/settings/AddressSheet';
import { BuyerProtectionSheet } from '@/components/product/BuyerProtectionSheet';
import {
  PaymentOptionsModal,
  type PaymentMethodOption,
  type SelectedPaymentMethod,
} from '@/components/payment/PaymentOptionsModal';
import { paymentService, normalizeAddressInput } from '@/lib/paymentService';
import { ShippingAddressSchema } from '@/lib/schemas/order';
import { getOrCreateConversation, cancelBundleOffersForSoldItem } from '@/lib/chat';
import { SELECT_LISTING_WITH_SELLER } from '@/lib/listings';
import { openCheckout, STRIPE_ENABLED } from '@/lib/payments';
import type { ShippingAddress, Listing } from '@/types';

function tap(style: 'light' | 'medium' = 'light') {
  if (Platform.OS !== 'ios') return;
  Haptics.impactAsync(
    style === 'light'
      ? Haptics.ImpactFeedbackStyle.Light
      : Haptics.ImpactFeedbackStyle.Medium,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DESIGN PATTERN PRIMITIVES (CLEAN CARD ARCHITECTURE)
// ─────────────────────────────────────────────────────────────────────────────

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
          marginBottom: 14,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENT & CHECKOUT SCREEN
// ─────────────────────────────────────────────────────────────────────────────

export default function PaymentScreen() {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    id,
    offer,
    bundle_ids,
    fulfillment: fulfillmentParam,
    paymentMethod: paymentMethodParam,
  } = useLocalSearchParams<{
    id: string;
    offer?: string;
    bundle_ids?: string;
    fulfillment?: string;
    paymentMethod?: string;
  }>();
  const { user, profile, loading: authLoading } = useAuth();
  const toast = useToast();

  const isDemo = id === 'demo' || !id;

  const listingQ = useListingQuery(id && !isDemo ? String(id) : null);
  const fetchedListing = listingQ.data ?? null;

  // Mock demo listing for instant demo preview matching the mockup
  const demoListing: Listing = useMemo(
    () => ({
      id: 'demo',
      title: 'Samsung 75" Oled 4K Smart TV',
      brand: 'Samsung',
      price: 1250,
      size: '75 inch',
      condition: 'like_new',
      category: 'other',
      description: '75 inch OLED 4K UHD smart television',
      gender: 'unisex',
      seller_id: 'demo-seller',
      seller: {
        id: 'demo-seller',
        username: 'atelier_electronics',
        full_name: 'Atelier Electronics',
        avatar_url:
          'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
        rating: 4.9,
        total_sales: 128,
        bio: null,
        location: null,
        created_at: new Date().toISOString(),
      },
      images: [
        'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=800&auto=format&fit=crop&q=80',
      ],
      thumbnails: [
        'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=240&auto=format&fit=crop&q=80',
      ],
      is_sold: false,
      views: 342,
      likes: 28,
      created_at: new Date().toISOString(),
    }),
    [],
  );

  const listing = fetchedListing || (isDemo ? demoListing : null);

  const bundleIdsParam = typeof bundle_ids === 'string' ? bundle_ids : '';
  const bundleItemIds = useMemo(
    () => sanitizeBundleItemIds(bundleIdsParam, id, listing?.id),
    [bundleIdsParam, id, listing?.id],
  );
  const isBundle = bundleItemIds.length > 0;

  const [bundledListings, setBundledListings] = useState<Listing[]>([]);
  const [bundleFetchStatus, setBundleFetchStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >(isBundle ? 'loading' : 'idle');
  const [bundleFetchError, setBundleFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (bundleItemIds.length === 0) {
      setBundledListings([]);
      setBundleFetchStatus('idle');
      setBundleFetchError(null);
      return;
    }
    if (!listing?.seller_id) return;

    let active = true;
    setBundleFetchStatus('loading');
    setBundleFetchError(null);

    (async () => {
      try {
        const queryIds = bundleItemIds.filter(
          (itemId) => itemId !== String(listing.id || id),
        );
        const { data, error } = await supabase
          .from('listings')
          .select(SELECT_LISTING_WITH_SELLER)
          .in('id', queryIds)
          .eq('seller_id', listing.seller_id)
          .eq('is_sold', false);

        if (!active) return;

        if (error) {
          console.warn('[payment] Error fetching bundle listings', error.message);
          setBundleFetchStatus('error');
          setBundleFetchError(error.message || 'Failed to load bundle listings.');
          toast.show('Failed to load bundle items. Please try again.', {
            variant: 'default',
            icon: 'alert-triangle',
          });
          return;
        }

        const rows = (data as unknown as Listing[]) ?? [];
        if (rows.length !== bundleItemIds.length) {
          setBundleFetchStatus('error');
          setBundleFetchError('One or more bundled items are no longer available.');
          toast.show('Some items in this bundle are no longer available.', {
            variant: 'default',
            icon: 'alert-triangle',
          });
          return;
        }

        setBundledListings(rows);
        setBundleFetchStatus('success');
      } catch (err: any) {
        if (!active) return;
        setBundleFetchStatus('error');
        setBundleFetchError(err?.message || 'Error loading bundle items.');
        toast.show('Error loading bundle items.', {
          variant: 'default',
          icon: 'alert-triangle',
        });
      }
    })();

    return () => {
      active = false;
    };
  }, [bundleIdsParam, bundleItemIds, listing?.seller_id, listing?.id, id, toast]);

  const allOrderItems = useMemo(
    () => (listing ? [listing, ...bundledListings] : []),
    [listing, bundledListings],
  );

  // Fulfillment: tracked courier by default
  const fulfillment = fulfillmentParam === 'handshake' ? 'handshake' : 'managed';

  // Shipping address state
  const demoAddress: ShippingAddress = useMemo(
    () => ({
      id: 'mock_demo_addr',
      user_id: 'demo-user',
      recipient_name: 'John Doe',
      line1: '12, Palm Groove',
      line2: null,
      city: 'Lagos',
      state: 'Lagos State',
      postal_code: '100001',
      country: 'NG',
      phone: '+234 - 123 -201-419',
      is_default: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
    [],
  );

  const [shippingAddress, setShippingAddress] = useState<ShippingAddress | null>(
    isDemo ? demoAddress : null,
  );
  const [addressSheetOpen, setAddressSheetOpen] = useState(false);

  // Delivery Notes state (optional, defaults to empty)
  const [deliveryNotes, setDeliveryNotes] = useState<string>('');

  // Payment method selection state
  const initialMethod: PaymentMethodOption =
    paymentMethodParam === 'cod' ||
    paymentMethodParam === 'apple_pay' ||
    paymentMethodParam === 'jazzcash' ||
    paymentMethodParam === 'easypaisa'
      ? paymentMethodParam
      : 'card';
  // Without Stripe the only method that can collect money is Cash on Delivery.
  const defaultMethod: PaymentMethodOption = STRIPE_ENABLED ? initialMethod : 'cod';
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodOption>(defaultMethod);
  const [cardBrand, setCardBrand] = useState<string | null>('Visa');
  const [cardLast4, setCardLast4] = useState<string | null>('4242');
  const [walletNumber, setWalletNumber] = useState<string | null>(null);
  const [hasChosenMethod, setHasChosenMethod] = useState<boolean>(true);
  const [paymentOptionsOpen, setPaymentOptionsOpen] = useState(false);

  // Buyer protection sheet
  const [bpSheetOpen, setBpSheetOpen] = useState(false);

  // Checkout submission state
  const [paying, setPaying] = useState(false);

  // Fetch user default address on mount
  useEffect(() => {
    if (isDemo || !user?.id) {
      return;
    }

    let active = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('shipping_addresses')
          .select('*')
          .eq('user_id', user.id)
          .order('is_default', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!active) return;
        if (error) throw error;
        if (data) {
          setShippingAddress(data as ShippingAddress);
        }
      } catch (err) {
        console.warn('[payment] Error fetching address:', err);
      }
    })();

    return () => {
      active = false;
    };
  }, [user?.id, isDemo]);

  const offerAmount = (() => {
    const n = Number(offer);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
  })();

  const bundleCalculation = useMemo(() => {
    if (!listing) return null;
    const addOnPrices = bundledListings.map((b) => Number(b.price ?? 0));
    return computeBundlePricing(
      listing.price,
      addOnPrices,
      listing.seller?.bundle_discount_pct ?? 0,
    );
  }, [listing, bundledListings]);

  const bundleSavings = bundleCalculation?.savings ?? 0;
  const bundleSubtotal = bundleCalculation?.subtotal ?? Number(listing?.price ?? 0);
  const bundleDiscountPct = bundleCalculation?.pct ?? 0;

  if (authLoading) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: theme.background,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <ActivityIndicator color={theme.purple} />
      </SafeAreaView>
    );
  }

  if (!user && !isDemo) {
    return <Redirect href="/auth/login" />;
  }

  if (!listing && id && listingQ.isPending) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: theme.background,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <ActivityIndicator color={theme.purple} />
      </SafeAreaView>
    );
  }

  if (!listing) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: theme.background,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <Feather name="alert-circle" size={32} color={theme.mute} />
        <Text
          style={{
            fontSize: 17,
            fontFamily: typography.family.sansBold,
            color: theme.ink,
            marginTop: 12,
          }}
        >
          Item unavailable
        </Text>
        <Pressable
          onPress={() => safeBack()}
          style={({ pressed }) => ({
            marginTop: 16,
            height: 44,
            borderRadius: radii.pill,
            paddingHorizontal: 20,
            backgroundColor: theme.ink,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text
            style={{
              color: theme.background,
              fontFamily: typography.family.sansBold,
              fontSize: 14,
            }}
          >
            Go back
          </Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  // Price breakdown calculations
  const itemPrice = computeCheckoutItemPrice({
    offerAmount,
    isBundle,
    bundleCalculationTotal: bundleCalculation?.total,
    listingPrice: Number(listing.price ?? 0),
  });

  const parcelSize = listing?.parcel_size || 'medium';
  const bpFee = buyerProtectionFee(itemPrice);
  const deliveryFee =
    fulfillment === 'handshake' ? 0 : getParcelDeliveryFee(parcelSize);
  const salesTax = 0;
  const totalAmount =
    Math.round((itemPrice + bpFee + deliveryFee + salesTax) * 100) / 100;
  const finalTotal = Math.max(0, totalAmount);

  const handleSaveAddress = async (form: AddressForm) => {
    let validated: any;
    try {
      const normalized = normalizeAddressInput(form);
      validated = ShippingAddressSchema.parse(normalized);
    } catch {
      toast.show('Please fill in required address fields', {
        variant: 'default',
        icon: 'alert-triangle',
      });
      return;
    }

    const effectiveUserId = user?.id || 'demo-user';
    const payload = {
      user_id: effectiveUserId,
      recipient_name: validated.recipientName.trim(),
      line1: validated.line1.trim(),
      line2: validated.line2?.trim() || null,
      city: validated.city.trim(),
      state: validated.state?.trim() || null,
      postal_code: validated.postalCode.trim(),
      country: validated.country.trim(),
      phone: validated.phone?.trim() || null,
      is_default: true,
    };

    const previousAddress = shippingAddress;
    const mockAddress: ShippingAddress = {
      id: `mock_addr_${Date.now()}`,
      ...payload,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setShippingAddress(mockAddress);
    setAddressSheetOpen(false);

    if (isDemo || !user?.id) {
      toast.show('Shipping address updated', { variant: 'default', icon: 'check' });
      return;
    }

    try {
      const isRealUuid =
        Boolean(previousAddress?.id) &&
        !previousAddress!.id.startsWith('mock_') &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          previousAddress!.id,
        );

      const rpcPayload = isRealUuid
        ? { ...payload, id: previousAddress!.id }
        : payload;

      let savedAddress: ShippingAddress | null = null;

      const { data: rpcData, error: rpcError } = await (supabase.rpc as any)(
        'upsert_shipping_address_with_default',
        { p_payload: rpcPayload },
      );

      if (!rpcError && rpcData) {
        savedAddress = rpcData as ShippingAddress;
      } else {
        await supabase
          .from('shipping_addresses')
          .update({ is_default: false })
          .eq('user_id', user.id)
          .eq('is_default', true);

        if (isRealUuid) {
          const { data: updateData, error: updateError } = await (supabase
            .from('shipping_addresses')
            .update(payload)
            .eq('id', previousAddress!.id)
            .eq('user_id', user.id)
            .select()
            .single() as any);

          if (updateError) throw updateError;
          savedAddress = updateData as ShippingAddress;
        } else {
          const { data: insertData, error: insertError } = await (supabase
            .from('shipping_addresses')
            .insert(payload)
            .select()
            .single() as any);

          if (insertError) throw insertError;
          savedAddress = insertData as ShippingAddress;
        }
      }

      if (savedAddress) {
        setShippingAddress(savedAddress);
      }
      toast.show('Shipping address saved', { variant: 'default', icon: 'check' });
    } catch (err: any) {
      setShippingAddress(previousAddress);
      toast.show(err?.message || 'Could not save address. Please try again.', {
        variant: 'default',
        icon: 'alert-triangle',
      });
    }
  };

  const handleSelectPaymentMethod = (selected: SelectedPaymentMethod) => {
    setSelectedMethod(selected.method);
    if (selected.cardBrand) setCardBrand(selected.cardBrand);
    if (selected.cardLast4) setCardLast4(selected.cardLast4);
    if (selected.walletNumber) setWalletNumber(selected.walletNumber);
    if (selected.method !== 'card' || selected.cardLast4) {
      setHasChosenMethod(true);
    }
    setPaymentOptionsOpen(false);
  };

  const selectedMethodTitle = (() => {
    if (selectedMethod === 'card') {
      return cardBrand && cardLast4
        ? `${cardBrand} ····${cardLast4}`
        : cardLast4
        ? `Card ····${cardLast4}`
        : 'Card';
    }
    if (selectedMethod === 'apple_pay') return 'Apple Pay';
    if (selectedMethod === 'cod') return 'Cash on Delivery';
    if (selectedMethod === 'jazzcash') return walletNumber ? `JazzCash (${walletNumber})` : 'JazzCash';
    if (selectedMethod === 'easypaisa') return walletNumber ? `Easypaisa (${walletNumber})` : 'Easypaisa';
    return 'Card';
  })();

  const handlePay = async () => {
    if (paying) return;

    if (isBundle && bundleFetchStatus !== 'success') {
      toast.show(
        bundleFetchStatus === 'error'
          ? bundleFetchError ||
              'Unable to checkout: some bundle items could not be loaded.'
          : 'Please wait for bundle items to load.',
        {
          variant: 'default',
          icon: 'alert-circle',
        },
      );
      return;
    }

    if (fulfillment !== 'handshake') {
      if (!shippingAddress?.line1 || !shippingAddress?.city || !shippingAddress?.phone) {
        toast.show('Please provide a complete delivery address with phone number', {
          variant: 'default',
          icon: 'map-pin',
        });
        setAddressSheetOpen(true);
        return;
      }

      const cleanPhone = (shippingAddress.phone || '').replace(/[\s\-\(\)]/g, '');
      if (cleanPhone.length < 10 || cleanPhone.length > 15) {
        toast.show('Please enter a valid contact phone number (10 to 15 digits)', {
          variant: 'default',
          icon: 'phone',
        });
        setAddressSheetOpen(true);
        return;
      }
    }

    const isMethodReady =
      hasChosenMethod && (selectedMethod !== 'card' || Boolean(cardLast4));
    if (!isMethodReady) {
      toast.show('Please choose a payment method', {
        variant: 'default',
        icon: 'credit-card',
      });
      setPaymentOptionsOpen(true);
      return;
    }

    tap('medium');
    setPaying(true);
    try {
      const effectiveBuyerId = user?.id || 'demo-user';
      const result = await paymentService.checkout({
        listingId: String(listing.id),
        bundleItemIds: isBundle ? bundleItemIds : undefined,
        paymentMethod: selectedMethod === 'cod' ? 'cod' : 'card',
        buyerId: effectiveBuyerId,
        sellerId: listing.seller_id,
        listingPrice: Number(listing.price),
        offerAmount: itemPrice,
        shippingAddress,
        shippingMethod: fulfillment === 'handshake' ? 'self_ship' : 'managed',
        deliveryNotes: deliveryNotes.trim() || undefined,
        // The server recomputes the total and refuses to charge anything else.
        expectedTotal: finalTotal,
      });

      if (!result.success) {
        throw new Error(result.error || result.message || 'Checkout failed');
      }

      // If Stripe Checkout session redirect URL was returned, open the external Stripe checkout flow
      if (result.redirectUrl) {
        await openCheckout(result.redirectUrl);
        return;
      }

      const allItemIds = Array.from(
        new Set([String(listing.id), ...bundleItemIds]),
      );
      allItemIds.forEach((itemId) => {
        queryClient.setQueryData<Listing>(qk.listing(itemId), (old) =>
          old ? { ...old, is_sold: true } : old,
        );
        queryClient.invalidateQueries({ queryKey: qk.listing(itemId) });
        cancelBundleOffersForSoldItem(itemId).catch(() => {});
      });

      const isPaid = result.status === 'paid';
      const allTitles = allOrderItems.map((item) => item.title).filter(Boolean);

      try {
        const conv = await getOrCreateConversation({
          buyerId: effectiveBuyerId,
          sellerId: listing.seller_id,
          listingId: listing.id,
        });
        // The notice is built server-side from the real order: clients can't
        // insert system messages (they'd be able to forge "payment received").
        if (conv?.id && result.orderId) {
          await supabase.rpc('post_order_placed_message', {
            p_order_id: result.orderId,
            p_conversation_id: conv.id,
          });
        }
      } catch {
        // chat confirmation fallback
      }

      const targetOrderId = result.orderId || listing.id;
      router.replace({
        pathname: `/invoice/${targetOrderId}`,
        params: {
          paid: isPaid ? '1' : '0',
          placed: '1',
          side: 'bought',
          listing_id: String(listing.id),
          method: selectedMethod === 'cod' ? 'cod' : 'card',
          title:
            isBundle && allTitles.length > 1
              ? `Bundle (${allTitles.length} items)`
              : listing.title,
          amount: String(finalTotal),
        },
      } as any);
    } catch (e: any) {
      // Seller deleted/sold the item while the buyer sat on checkout: say so
      // plainly and leave, instead of a cut-off DB message on a dead screen.
      if (/not found|already sold|been sold/i.test(e?.message ?? '')) {
        queryClient.invalidateQueries({ queryKey: qk.listing(String(listing.id)) });
        toast.show('This item is no longer available', { variant: 'default', icon: 'alert-triangle' });
        router.back();
        return;
      }
      toast.show(e?.message ?? 'Could not complete payment', {
        variant: 'default',
        icon: 'alert-triangle',
      });
    } finally {
      setPaying(false);
    }
  };

  const imageUrl = listing
    ? getOptimizedImageUrl(cardImageUrl(listing, 0), { width: 240 })
    : null;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.background }}
      edges={['top', 'bottom']}
    >
      {/* ── Top Header Navigation Bar (Quiet Atelier Standard) ── */}
      <View
        style={{
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.border,
          backgroundColor: theme.background,
          paddingTop: Platform.OS === 'ios' ? 10 : 12,
          paddingBottom: 12,
          paddingHorizontal: 16,
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
          {/* Circular Back / Close Button */}
          <Pressable
            onPress={() => safeBack()}
            hitSlop={HIT_SLOP_8}
            accessibilityRole="button"
            accessibilityLabel="Close checkout"
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

          {/* Centered Title */}
          <Text
            style={{
              fontSize: 16,
              fontFamily: typography.family.sansBold,
              color: theme.ink,
              letterSpacing: -0.2,
            }}
          >
            {isBundle ? 'Bundle Checkout' : 'Checkout'}
          </Text>

          {/* Canonical Mercari Shield Badge */}
          <View
            style={{
              width: 36,
              height: 36,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ShieldCheckIcon size={20} />
          </View>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1, backgroundColor: theme.background }}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: Math.max(Platform.OS === 'ios' ? 36 : 44, insets.bottom + 24),
          width: '100%',
          maxWidth: CONTENT_MAX_WIDTH,
          alignSelf: 'center',
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Item / Bundle Showcase (No Headings) ── */}
        <GroupCard style={{ padding: 14 }}>
          {isBundle ? (
            bundleFetchStatus === 'loading' ? (
              <View
                style={{
                  paddingVertical: 20,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ActivityIndicator color={theme.purple} />
                <Text
                  style={{
                    fontSize: 13,
                    color: theme.mute,
                    marginTop: 8,
                    fontFamily: typography.family.sans,
                  }}
                >
                  Loading bundle items...
                </Text>
              </View>
            ) : bundleFetchStatus === 'error' ? (
              <View
                style={{
                  padding: 12,
                  borderRadius: 10,
                  backgroundColor: isDark
                    ? 'rgba(239, 68, 68, 0.15)'
                    : '#FEE2E2',
                  borderWidth: 1,
                  borderColor: isDark ? '#EF4444' : '#FCA5A5',
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    color: isDark ? '#FCA5A5' : '#991B1B',
                    fontFamily: typography.family.sansBold,
                  }}
                >
                  {bundleFetchError ||
                    'Could not load bundle items. Please go back and try again.'}
                </Text>
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 10 }}
              >
                {allOrderItems.map((item) => (
                  <View
                    key={item.id}
                    style={{
                      width: 124,
                      padding: 8,
                      borderRadius: 12,
                      backgroundColor: theme.surface,
                      borderWidth: 1,
                      borderColor: theme.border,
                    }}
                  >
                    <Image
                      source={{
                        uri: getOptimizedImageUrl(cardImageUrl(item, 0), {
                          width: 240,
                        }),
                      }}
                      style={{
                        width: '100%',
                        height: 90,
                        borderRadius: 8,
                        backgroundColor: theme.surface,
                      }}
                      contentFit="cover"
                    />
                    <Text
                      numberOfLines={1}
                      style={{
                        fontSize: 12,
                        fontFamily: typography.family.sansBold,
                        color: theme.ink,
                        marginTop: 6,
                      }}
                    >
                      {item.brand || item.title}
                    </Text>
                    <Text
                      style={[
                        {
                          fontSize: 11.5,
                          color: theme.mute,
                          marginTop: 2,
                          fontFamily: typography.family.sansMedium,
                        },
                        tabularNumberStyle,
                      ]}
                    >
                      {formatPrice(Number(item.price ?? 0))}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            )
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              {imageUrl ? (
                <Image
                  source={{ uri: imageUrl }}
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 10,
                    backgroundColor: theme.surface,
                    borderWidth: 1,
                    borderColor: theme.border,
                  }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={IMAGE_TRANSITION}
                />
              ) : (
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 10,
                    backgroundColor: theme.surface,
                    borderWidth: 1,
                    borderColor: theme.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Feather name="image" size={22} color={theme.mute} />
                </View>
              )}

              <View style={{ flex: 1, justifyContent: 'center' }}>
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 15,
                    fontFamily: typography.family.sansBold,
                    color: theme.ink,
                    letterSpacing: -0.2,
                    marginBottom: 3,
                  }}
                >
                  {listing.title}
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    flexWrap: 'wrap',
                  }}
                >
                  {listing.brand ? (
                    <Text
                      style={{
                        fontSize: 13,
                        color: theme.mute,
                        fontFamily: typography.family.sans,
                      }}
                    >
                      {listing.brand}
                    </Text>
                  ) : null}
                  {listing.brand && listing.size ? (
                    <Text style={{ fontSize: 13, color: theme.muteSoft }}>·</Text>
                  ) : null}
                  {listing.size ? (
                    <Text
                      style={{
                        fontSize: 13,
                        color: theme.mute,
                        fontFamily: typography.family.sans,
                      }}
                    >
                      {listing.size}
                    </Text>
                  ) : null}
                </View>
                <Text
                  style={[
                    {
                      fontSize: 15,
                      fontFamily: typography.family.sansBold,
                      color: theme.ink,
                      marginTop: 4,
                    },
                    tabularNumberStyle,
                  ]}
                >
                  {formatPrice(itemPrice)}
                </Text>
              </View>
            </View>
          )}
        </GroupCard>

        {/* ── Delivery Details (Plick Vibe: Specifically for Delivery with Edit Option) ── */}
        <GroupCard style={{ padding: 16 }}>
          {shippingAddress?.line1 ? (
            <View>
              {/* Header row inside card with Delivery icon + Edit option */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 12,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name="truck" size={16} color={theme.ink} />
                  <Text
                    style={{
                      fontSize: 14.5,
                      fontFamily: typography.family.sansBold,
                      color: theme.ink,
                      letterSpacing: -0.1,
                    }}
                  >
                    Delivery details
                  </Text>
                </View>

                <Pressable
                  onPress={() => {
                    tap('light');
                    setAddressSheetOpen(true);
                  }}
                  hitSlop={HIT_SLOP_8}
                  accessibilityRole="button"
                  accessibilityLabel="Edit delivery address"
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontFamily: typography.family.sansBold,
                      color: theme.ink,
                      textDecorationLine: 'underline',
                    }}
                  >
                    Edit
                  </Text>
                </Pressable>
              </View>

              {/* Recipient & Address Details */}
              <Text
                style={{
                  fontSize: 14,
                  fontFamily: typography.family.sansBold,
                  color: theme.ink,
                  marginBottom: 2,
                }}
              >
                {shippingAddress.recipient_name || profile?.full_name || 'Recipient'}
              </Text>
              <Text
                style={{
                  fontSize: 13.5,
                  color: theme.mute,
                  lineHeight: 19,
                  fontFamily: typography.family.sans,
                }}
              >
                {shippingAddress.line1}
                {shippingAddress.line2 && shippingAddress.line2.trim() !== shippingAddress.line1.trim()
                  ? `, ${shippingAddress.line2}`
                  : ''}
              </Text>
              <Text
                style={{
                  fontSize: 13.5,
                  color: theme.mute,
                  lineHeight: 19,
                  fontFamily: typography.family.sans,
                }}
              >
                {/* Legacy rows store "City, Country" in city; the country is shown below. */}
                {shippingAddress.country ? shippingAddress.city.split(',')[0].trim() : shippingAddress.city}
                {shippingAddress.postal_code ? `, ${shippingAddress.postal_code}` : ''}
                {shippingAddress.country ? ` · ${shippingAddress.country}` : ''}
              </Text>
              {shippingAddress.phone ? (
                <Text
                  style={[
                    {
                      fontSize: 13,
                      color: theme.mute,
                      marginTop: 4,
                      fontFamily: typography.family.sansMedium,
                    },
                    tabularNumberStyle,
                  ]}
                >
                  {shippingAddress.phone}
                </Text>
              ) : (
                <Pressable
                  onPress={() => setAddressSheetOpen(true)}
                  style={{ marginTop: 4 }}
                >
                  <Text
                    style={{
                      fontSize: 12.5,
                      fontFamily: typography.family.sansMedium,
                      color: theme.danger,
                    }}
                  >
                    Phone required for courier delivery · Tap to add
                  </Text>
                </Pressable>
              )}

              {/* Courier service line */}
              <View
                style={{
                  marginTop: 12,
                  paddingTop: 12,
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: theme.border,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Feather name="package" size={14} color={theme.mute} />
                  <Text
                    style={{
                      fontSize: 13,
                      fontFamily: typography.family.sansMedium,
                      color: theme.ink,
                    }}
                  >
                    Tracked Courier (1–3 days)
                  </Text>
                </View>
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
                  {deliveryFee > 0 ? formatPrice(deliveryFee) : 'Free'}
                </Text>
              </View>
            </View>
          ) : (
            <Pressable
              onPress={() => {
                tap('light');
                setAddressSheetOpen(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Add delivery address"
              style={({ pressed }) => [
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                },
                pressed && { opacity: 0.75 },
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    backgroundColor: theme.surface,
                    borderWidth: 1,
                    borderColor: theme.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Feather name="truck" size={18} color={theme.ink} />
                </View>
                <View>
                  <Text
                    style={{
                      fontSize: 14.5,
                      fontFamily: typography.family.sansBold,
                      color: theme.ink,
                    }}
                  >
                    Add delivery address
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: theme.mute,
                      fontFamily: typography.family.sans,
                      marginTop: 2,
                    }}
                  >
                    Required for tracked courier delivery
                  </Text>
                </View>
              </View>
              <Feather name="chevron-right" size={18} color={theme.ink} />
            </Pressable>
          )}
        </GroupCard>

        {/* ── Order Summary (Plick Vibe matching Reference Image 1) ── */}
        <GroupCard style={{ paddingHorizontal: 16, paddingVertical: 18, gap: 12, marginBottom: 4 }}>
          {/* Row 1: Item price */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text
              style={{
                fontSize: 14.5,
                fontFamily: typography.family.sansMedium,
                color: theme.mute,
              }}
            >
              Item price
            </Text>
            <Text
              style={[
                {
                  fontSize: 14.5,
                  fontFamily: typography.family.sansMedium,
                  color: theme.mute,
                },
                tabularNumberStyle,
              ]}
            >
              {formatPrice(
                isBundle && !offerAmount ? bundleSubtotal : itemPrice,
              )}
            </Text>
          </View>

          {/* Row 2: Buyer protection */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text
              style={{
                fontSize: 14.5,
                fontFamily: typography.family.sansMedium,
                color: theme.ink,
              }}
            >
              Buyer protection
            </Text>
            <Text
              style={[
                {
                  fontSize: 14.5,
                  fontFamily: typography.family.sansMedium,
                  color: theme.mute,
                },
                tabularNumberStyle,
              ]}
            >
              {bpFee > 0 ? formatPrice(bpFee) : 'Free'}
            </Text>
          </View>

          {/* Delivery fee row (if applicable) */}
          {deliveryFee > 0 && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Text
                style={{
                  fontSize: 14.5,
                  fontFamily: typography.family.sansMedium,
                  color: theme.ink,
                }}
              >
                Delivery
              </Text>
              <Text
                style={[
                  {
                    fontSize: 14.5,
                    fontFamily: typography.family.sansMedium,
                    color: theme.mute,
                  },
                  tabularNumberStyle,
                ]}
              >
                {formatPrice(deliveryFee)}
              </Text>
            </View>
          )}

          {/* Bundle discount row (if applicable) */}
          {isBundle && !offerAmount && bundleSavings > 0 && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Text
                style={{
                  fontSize: 14.5,
                  fontFamily: typography.family.sansMedium,
                  color: theme.purple,
                }}
              >
                Bundle discount ({bundleDiscountPct}%)
              </Text>
              <Text
                style={[
                  {
                    fontSize: 14.5,
                    fontFamily: typography.family.sansBold,
                    color: theme.purple,
                  },
                  tabularNumberStyle,
                ]}
              >
                − {formatPrice(bundleSavings)}
              </Text>
            </View>
          )}

          {/* Row 3: Total */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: 2,
            }}
          >
            <Text
              style={{
                fontSize: 17,
                fontFamily: typography.family.sansBold,
                color: theme.ink,
                letterSpacing: -0.2,
              }}
            >
              Total
            </Text>
            <Text
              style={[
                {
                  fontSize: 17,
                  fontFamily: typography.family.sansBold,
                  color: theme.ink,
                  letterSpacing: -0.2,
                },
                tabularNumberStyle,
              ]}
            >
              {formatPrice(finalTotal)}
            </Text>
          </View>
        </GroupCard>

        {/* ── Payment Method card (Plick Section) ── */}
        <Pressable
          onPress={() => {
            tap('light');
            setPaymentOptionsOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="Choose payment method"
          style={({ pressed }) => [
            {
              backgroundColor: theme.panel,
              borderRadius: 14,
              overflow: 'hidden',
              borderWidth: 1,
              borderColor: isDark ? '#262626' : 'rgba(0,0,0,0.08)',
              paddingHorizontal: 16,
              paddingVertical: 16,
              marginBottom: 20,
            },
            pressed && { opacity: 0.75 },
          ]}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {selectedMethod === 'card' ? (
                <Ionicons name="card" size={20} color={theme.ink} />
              ) : selectedMethod === 'apple_pay' ? (
                <Ionicons name="logo-apple" size={19} color={theme.ink} />
              ) : selectedMethod === 'cod' ? (
                <Feather name="package" size={18} color={theme.ink} />
              ) : (
                <Feather name="credit-card" size={18} color={theme.ink} />
              )}
              <Text
                style={{
                  fontSize: 15,
                  fontFamily: typography.family.sansBold,
                  color: theme.ink,
                  letterSpacing: -0.1,
                }}
              >
                {selectedMethodTitle}
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color={theme.ink} />
          </View>
        </Pressable>

        {/* ── Primary Action: Pay Button (Plick Standard) ── */}
        <Pressable
          onPress={handlePay}
          disabled={paying || (isBundle && bundleFetchStatus !== 'success')}
          accessibilityRole="button"
          accessibilityLabel={`Pay ${formatPrice(finalTotal)}`}
          style={({ pressed }) => {
            const isBlocked =
              paying || (isBundle && bundleFetchStatus !== 'success');
            return [
              {
                height: 50,
                width: '100%',
                backgroundColor:
                  isBlocked && !paying
                    ? isDark
                      ? '#374151'
                      : '#F3F4F6'
                    : isDark
                      ? '#FFFFFF'
                      : '#0F0F0F',
                borderWidth: 1,
                borderColor:
                  isBlocked && !paying
                    ? isDark
                      ? '#374151'
                      : '#E5E7EB'
                    : isDark
                      ? '#FFFFFF'
                      : '#0F0F0F',
                borderRadius: 10,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 18,
              },
              (pressed || paying) &&
                !isBlocked && {
                  opacity: 0.88,
                  transform: [{ scale: 0.99 }],
                },
            ];
          }}
        >
          {paying ? (
            <ActivityIndicator color={isDark ? '#000000' : '#FFFFFF'} size="small" />
          ) : (
            <Text
              style={{
                fontSize: 16,
                fontFamily: typography.family.sansBold,
                color: isDark ? '#000000' : '#FFFFFF',
                letterSpacing: 0.1,
              }}
            >
              Pay
            </Text>
          )}
        </Pressable>

        {/* ── Canonical Mercari Shield Link: What is buyer protection? ── */}
        <Pressable
          onPress={() => {
            tap('light');
            setBpSheetOpen(true);
          }}
          hitSlop={HIT_SLOP_8}
          accessibilityRole="button"
          accessibilityLabel="What is buyer protection?"
          style={({ pressed }) => [
            {
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              marginBottom: 16,
            },
            pressed && { opacity: 0.7 },
          ]}
        >
          <ShieldCheckIcon size={18} />
          <Text
            style={{
              fontSize: 13,
              fontFamily: typography.family.sansMedium,
              color: theme.ink,
              textDecorationLine: 'underline',
            }}
          >
            What is buyer protection?
          </Text>
        </Pressable>

        {/* ── Legal & Escrow Disclaimer ── */}
        <Text
          style={{
            fontSize: 11.5,
            fontFamily: typography.family.sans,
            color: theme.mute,
            textAlign: 'center',
            lineHeight: 16,
            paddingHorizontal: 16,
          }}
        >
          {selectedMethod === 'cod'
            ? 'Pay the courier in cash when your order arrives. Grabsty Buyer Protection covers you if the item isn’t as described.'
            : 'Your transaction is handled securely by Stripe. Grabsty Buyer Protection holds payment in escrow until delivery is verified.'}
        </Text>
      </ScrollView>

      {/* Address Edit Sheet */}
      <AddressSheet
        visible={addressSheetOpen}
        onClose={() => setAddressSheetOpen(false)}
        onSave={handleSaveAddress}
        initial={shippingAddress}
      />

      {/* Payment Options Selection Modal */}
      <PaymentOptionsModal
        visible={paymentOptionsOpen}
        onClose={() => setPaymentOptionsOpen(false)}
        selectedMethod={selectedMethod}
        onSelect={handleSelectPaymentMethod}
      />

      {/* Buyer Protection Breakdown Sheet */}
      <BuyerProtectionSheet
        visible={bpSheetOpen}
        itemPrice={itemPrice}
        onClose={() => setBpSheetOpen(false)}
      />
    </SafeAreaView>
  );
}
