// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT DETAIL SCREEN (CONTAINER / COORDINATOR)
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Coordinator Architecture & Worklet Performance
//
// 1. Separation of Responsibilities:
//    The product detail page (previously 1,764 lines) is now a slim Coordinator:
//    - Server State: React Query hooks (`useListingQuery`, `useFollowStateQuery`).
//    - Domain State: `useProductEngagement` (likes, saves, overlays) &
//      `useProductBundle` (multi-item discount builder).
//    - Presentational Subcomponents: `ProductHeaderNav`, `ProductHeroSection`,
//      `ProductDetailsTable`, `ProductSellerProfileCard`, `ProductRelatedSection`.
//
// 2. UI Thread Performance:
//    Parallax scrolling and hero stretch run entirely on the UI thread via
//    Reanimated worklets (`scrollHandler`, `heroParallaxStyle`). Subcomponents
//    are wrapped in `React.memo` with stable callback identities to guarantee
//    smooth 60fps gesture handling.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, Alert, Share, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import { Text } from '@/lib/rnText';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { safeBack } from '@/lib/nav';
import Feather from '@expo/vector-icons/Feather';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  useAnimatedReaction,
  runOnJS,
} from 'react-native-reanimated';
import type { Listing } from '@/types';
import {
  useDeleteListing,
  useFollowStateQuery,
  useListingLikersQuery,
  useListingQuery,
  useSellerOtherListingsQuery,
  useSimilarListingsQuery,
  useToggleFollow,
} from '@/lib/queries';
import { confirm } from '@/lib/confirm';
import { logListingView } from '@/lib/recommendations';
import { capture, buildListingViewedProps } from '@/lib/analytics';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { captureError } from '@/lib/sentry';
import { fetchOrderForListing, type Order } from '@/lib/payments';
import { getOrCreateConversation, sendOffer } from '@/lib/chat';
import { cardImageUrl, prefetchImages, getImagePlaceholder } from '@/lib/images';
import { SaveListSheet } from '@/components/SaveListSheet';
import { FullscreenImageViewer } from '@/components/product/FullscreenImageViewer';
import { ProductActionBar } from '@/components/product/ProductActionBar';
import { SellerOptionsSheet } from '@/components/product/SellerOptionsSheet';
import { OfferSheet } from '@/components/product/OfferSheet';
import type { PopIconHandle } from '@/components/product/PopIcon';
import { ProductSkeleton } from '@/components/product/ProductSkeleton';
import {
  tap,
  useProductDimensions,
  FALLBACK_SELLER,
  EMPTY_LISTINGS,
  DESKTOP_COLUMN_GAP,
  DESKTOP_DETAILS_WIDTH,
} from '@/components/product/shared';
import { CONTENT_MAX_WIDTH } from '@/lib/responsive';
import { categoryLabel, subcategoryLabel } from '@/lib/categories';
import { useTheme } from '@/context/ThemeContext';
import { BRAND, APP_URL } from '@/lib/brand';
import { reportListing, REPORT_REASONS } from '@/lib/reports';
import { useGuestGate } from '@/components/GuestGate';
import { buyerProtectionFee, orderTotal, formatPrice } from '@/lib/fees';
import { isBundlesEnabled, computeBundlePricing } from '@/lib/bundle';
import { useSellSheet } from '@/components/sell/SellSheet';
import { BuyerProtectionSheet } from '@/components/product/BuyerProtectionSheet';
import { errorMessage } from '@/lib/errors';
import {
  LikersSheet,
  ProductDetailsTable,
  ProductHeaderNav,
  ProductHeroSection,
  ProductOverviewHeader,
  ProductRelatedSection,
  ProductSellerProfileCard,
  useProductBundle,
  useProductEngagement,
} from '@/components/product';

// Read-side normalization for useListingQuery.
const withFallbackSeller = (row: Listing | null): Listing | null =>
  row ? { ...row, seller: row.seller ?? (FALLBACK_SELLER as Listing['seller']) } : null;

// Desktop renders ProductActionBar inside the details column instead of as a
// fixed bottom dock: strip only the dock container (position, edge padding,
// top border, shadow). The Offer / Buy buttons keep their Rule 2.9 geometry.
const DESKTOP_INLINE_BAR = {
  position: 'relative',
  left: undefined,
  right: undefined,
  bottom: undefined,
  zIndex: 0,
  paddingHorizontal: 0,
  paddingTop: 0,
  paddingBottom: 0,
  borderTopWidth: 0,
  backgroundColor: 'transparent',
  boxShadow: 'none',
} as ViewStyle;

export default function ProductScreen() {
  const { theme, isDark } = useTheme();
  const { id, initialImage } = useLocalSearchParams<{ id: string; initialImage?: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const toast = useToast();
  const guestGate = useGuestGate();
  const { open: openSellSheet } = useSellSheet();
  const productIdParam = Array.isArray(id) ? id[0] : id;

  const placeholderImage =
    (typeof initialImage === 'string' && initialImage.length > 0 ? initialImage : undefined) ||
    getImagePlaceholder(productIdParam);

  const [showStickyHeader, setShowStickyHeader] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [offerLoading, setOfferLoading] = useState(false);
  const [likersVisible, setLikersVisible] = useState(false);

  // Imperative pop icon animation handles
  const heartAnimRef = useRef<PopIconHandle>(null);
  const saveAnimRef = useRef<PopIconHandle>(null);
  const mainScrollRef = useRef<any>(null);
  const bundleSectionYRef = useRef<number | null>(null);

  const handleRelatedSectionLayout = useCallback((e: LayoutChangeEvent) => {
    bundleSectionYRef.current = e.nativeEvent.layout.y;
  }, []);

  // ── Primary Listing Query ────────────────────────────────────────────────
  const listingQ = useListingQuery(productIdParam, withFallbackSeller);
  const listing = listingQ.data ?? null;

  // ── Related Listings & Likers Queries ────────────────────────────────────
  const sellerItemsQ = useSellerOtherListingsQuery(
    listing?.seller_id ?? null,
    listing?.id ?? null,
  );
  const similarItemsQ = useSimilarListingsQuery(productIdParam ?? null, 6, listing?.category ?? null);
  const likersQ = useListingLikersQuery(productIdParam ?? null);
  const likers = likersQ.data ?? [];
  const sellerItems = (sellerItemsQ.data ?? EMPTY_LISTINGS).filter((s) => !s.is_sold);
  const similarItems = (similarItemsQ.data ?? EMPTY_LISTINGS).filter((s) => !s.is_sold);

  // Proactively warm up browser/disk cache with carousel photos and related item cards
  useEffect(() => {
    if (listing?.images && listing.images.length > 1) {
      prefetchImages(listing.images.slice(1));
    }
    const related = [...sellerItems, ...similarItems].slice(0, 6);
    if (related.length > 0) {
      prefetchImages(related.map((l) => cardImageUrl(l, 0)));
    }
  }, [listing?.images, sellerItems, similarItems]);

  // ── Engagement Domain Hook (Likes, Saves, Modals) ────────────────────────
  const engagement = useProductEngagement({
    listingId: productIdParam,
    listing,
    user,
    guestGate,
    heartAnimRef,
    saveAnimRef,
  });

  // ── Bundle Domain Hook (Multi-Item Math & Selections) ────────────────────
  const sellerBundlesEnabled = isBundlesEnabled(listing?.seller?.bundle_discount_pct);
  const bundle = useProductBundle({
    listing,
    sellerItems,
    user,
    guestGate,
    bundlesEnabled: sellerBundlesEnabled,
    sellerItemsLoading: sellerItemsQ.isLoading,
    onOpenOfferSheet: () => engagement.setOfferVisible(true),
  });

  const selectedSellerItems = useMemo(
    () => sellerItems.filter((s: Listing) => bundle.selectedBundleIds.has(s.id)),
    [sellerItems, bundle.selectedBundleIds],
  );

  const isBundleActive = bundle.selectedBundleIds.size > 0;
  const bundleCount = 1 + bundle.selectedBundleIds.size;

  const bundlePricing = useMemo(() => {
    if (!isBundleActive || !listing) return null;
    return computeBundlePricing(
      listing.price,
      selectedSellerItems.map((s: Listing) => Number(s.price ?? 0)),
      listing.seller?.bundle_discount_pct ?? 0,
    );
  }, [isBundleActive, listing, selectedSellerItems]);

  // ── Social & Follow State ────────────────────────────────────────────────
  const sellerId = listing?.seller?.id ?? '';
  const isOwnListing = !!user?.id && listing?.seller_id === user.id;

  // Check if current user is the buyer of this listing
  const [buyerOrder, setBuyerOrder] = useState<Order | null>(null);
  useEffect(() => {
    if (!productIdParam || !user?.id) {
      setBuyerOrder(null);
      return;
    }
    let active = true;
    fetchOrderForListing(productIdParam)
      .then((ord) => {
        if (active && ord && ord.buyer_id === user.id && ord.status !== 'canceled' && ord.status !== 'awaiting_payment') {
          setBuyerOrder(ord);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [productIdParam, user?.id]);

  const followStateQ = useFollowStateQuery(user?.id ?? null, isOwnListing ? '' : sellerId);
  const followState = followStateQ.data;
  const followed = followState ? followState.isFollowing : false;
  const toggleFollowM = useToggleFollow(user?.id ?? null, sellerId);
  const followBusy = toggleFollowM.isPending;

  // ── Owner Actions (Delete) ───────────────────────────────────────────────
  // Sold state is driven by orders now (checkout marks sold, refund/cancel relists),
  // so there is no manual Mark sold / Available toggle.
  const deleteM = useDeleteListing(listing?.seller_id ?? null);
  const deleteBusy = deleteM.isPending;
  const ownerBusy = deleteBusy;

  // ── Analytics & Recommender Logging ──────────────────────────────────────
  useEffect(() => {
    if (productIdParam && user?.id) logListingView(productIdParam);
  }, [productIdParam, user?.id]);

  const viewedId = listing?.id;
  const viewedSellerId = listing?.seller_id;
  const viewedPrice = listing?.price;
  const viewedCategory = listing?.category;
  useEffect(() => {
    if (!viewedId) return;
    capture('listing_viewed', buildListingViewedProps(
      {
        id: viewedId,
        seller_id: viewedSellerId ?? '',
        price: Number(viewedPrice ?? 0),
        category: viewedCategory ?? '',
      },
      'product_page',
    ));
  }, [viewedId, viewedSellerId, viewedPrice, viewedCategory]);

  const refetchFollow = followStateQ.refetch;
  useFocusEffect(
    useCallback(() => {
      if (sellerId && !isOwnListing) refetchFollow();
    }, [sellerId, isOwnListing, refetchFollow]),
  );

  const {
    imageHeight: heroHeight,
    contentWidth: heroWidth,
    desktop,
    frameWidth,
  } = useProductDimensions();
  const heroHeightSv = useSharedValue(heroHeight);
  useEffect(() => {
    heroHeightSv.value = heroHeight;
  }, [heroHeight, heroHeightSv]);

  // ── Reanimated Scroll & Parallax Handlers ────────────────────────────────
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  useAnimatedReaction(
    () => scrollY.value > heroHeightSv.value - 80,
    (curr, prev) => {
      if (curr !== prev) runOnJS(setShowStickyHeader)(curr);
    },
  );

  const heroParallaxStyle = useAnimatedStyle(() => {
    const y = scrollY.value;
    if (y >= 0) {
      return { transform: [{ translateY: 0 }, { scale: 1 }] };
    }
    const h = heroHeightSv.value > 0 ? heroHeightSv.value : 1;
    const stretch = -y / h;
    return {
      transform: [
        { translateY: y / 2 },
        { scale: 1 + stretch },
      ],
    };
  });

  // ── Action Callbacks ─────────────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    if (!listing || ownerBusy) return;
    const ok = await confirm({
      title: 'Delete listing?',
      message: 'This permanently removes the listing. This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;

    let success = false;
    try {
      success = await deleteM.mutateAsync(listing.id);
    } catch {
      success = false;
    }

    if (!success) {
      toast.show("Couldn't delete the listing", {
        variant: 'default',
        icon: 'alert-triangle',
      });
      return;
    }
    toast.show('Listing deleted', { variant: 'success', icon: 'check' });
    safeBack();
  }, [listing, ownerBusy, deleteM, toast]);

  const handleFollowPress = useCallback(async () => {
    tap('selection');
    if (!user) {
      guestGate.prompt({
        title: 'Follow sellers you love',
        message: 'Create a free account to follow sellers and get their new drops in your feed.',
        icon: 'user-plus',
        resume: sellerId ? { kind: 'follow', sellerId } : undefined,
      });
      return;
    }
    if (!sellerId || sellerId === user.id || followBusy) return;


    const wasFollowing = followed;

    let next: any = null;
    let failure: unknown = null;
    try {
      next = await toggleFollowM.mutateAsync({ currentlyFollowing: wasFollowing });
    } catch (e) {
      failure = e;
    }

    if (next === null) {
      toast.show(errorMessage(failure) || 'Could not update follow', {
        variant: 'default',
        icon: 'alert-triangle',
      });
    } else {
      const nowFollowing = next.isFollowing;
      if (nowFollowing) capture('seller_followed', { seller_id: sellerId });
    }
  }, [user, sellerId, followBusy, followed, toggleFollowM, guestGate, toast]);

  const openChat = useCallback((mode: 'message' | 'offer') => {
    tap('medium');
    if (!user) {
      guestGate.prompt({
        title: 'Message the seller',
        message: 'Create a free account to message sellers, make offers, and track your chats.',
        icon: 'message-circle',
      });
      return;
    }
    if (!listing) return;
    if (listing.seller_id === user.id) {
      toast.show("That's your own listing", { variant: 'default', icon: 'info' });
      return;
    }
    router.push({
      pathname: '/conversation/new',
      params: { listing: listing.id, mode },
    } as any);
  }, [user, listing, guestGate, toast]);

  const canOffer = useCallback(() => {
    if (!user) {
      guestGate.prompt({
        title: 'Make an offer',
        message: 'Create a free account to send the seller a price suggestion.',
        icon: 'tag',
      });
      return false;
    }
    if (!listing) return false;
    if (listing.seller_id === user.id) {
      toast.show("That's your own listing", { variant: 'default', icon: 'info' });
      return false;
    }
    return true;
  }, [user, listing, guestGate, toast]);

  const submitOffer = useCallback(async (amount: number) => {
    if (!listing || !user) return;
    setOfferLoading(true);
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
      const bundleItemIds = isBundleActive ? Array.from(bundle.selectedBundleIds) : undefined;
      const saved = await sendOffer({
        conversationId: conv.id,
        senderId: user.id,
        amount,
        isBundle: isBundleActive,
        bundleItemIds,
        bundleCount: isBundleActive ? bundleCount : 1,
        baseListingId: listing.id,
      });
      if (saved) {
        engagement.setOfferVisible(false);
        toast.show('Offer sent', { variant: 'success', icon: 'check' });
        router.push(`/conversation/${conv.id}` as any);
      } else {
        Alert.alert('Could not send offer', 'Please try again.');
      }
    } catch (e: any) {
      captureError(e, { fn: 'product.submitOffer' });
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setOfferLoading(false);
    }
  }, [listing, user, isBundleActive, bundle.selectedBundleIds, bundleCount, engagement, toast]);

  const shareListing = useCallback(async () => {
    if (!listing) return;
    tap('light');
    try {
      const url = `${APP_URL}/product/${listing.id}`;
      await Share.share({
        message: `${listing.title} · ${formatPrice(listing.price)} on ${BRAND}\n${url}`,
        url,
      });
    } catch {
      // User dismissed share sheet
    }
  }, [listing]);

  const handleReport = useCallback(() => {
    tap('selection');
    if (!user) {
      toast.show('Sign in to report a listing', { variant: 'info', icon: 'log-in' });
      router.push('/auth/login');
      return;
    }
    if (!listing) return;
    if (listing.seller_id === user.id) {
      toast.show("You can't report your own listing", { variant: 'default', icon: 'info' });
      return;
    }
    Alert.alert('Report listing', 'Why are you reporting this item?', [
      ...REPORT_REASONS.map((r) => ({
        text: r.label,
        onPress: async () => {
          const ok = await reportListing({
            listingId: listing.id,
            reporterId: user.id,
            reportedUserId: listing.seller_id,
            reason: r.id,
          });
          toast.show(ok ? 'Thanks — our team will review this.' : "Couldn't submit report", {
            variant: ok ? 'success' : 'default',
            icon: ok ? 'check' : 'alert-triangle',
          });
        },
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }, [user, listing, toast]);

  // ── Loading & Not Found States ───────────────────────────────────────────
  const notFound = !productIdParam || (listingQ.isSuccess && !listing);
  const loadErrorText = listingQ.error ? errorMessage(listingQ.error) : '';

  if (notFound) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: insets.top }}>
        <Pressable onPress={() => safeBack()} hitSlop={10} style={{ padding: 16 }} accessibilityRole="button" accessibilityLabel="Go back">
          <Feather name="arrow-left" size={22} color={theme.ink} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          <Feather name="alert-circle" size={42} color={theme.mute} />
          <Text style={{ fontSize: 17, fontWeight: '700', color: theme.ink, marginTop: 14 }}>
            Listing not available
          </Text>
          <Text style={{ fontSize: 14, color: theme.mute, marginTop: 6, textAlign: 'center' }}>
            It may have been removed or never existed.
          </Text>
        </View>
      </View>
    );
  }

  if (listingQ.isError && !listing) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: insets.top }}>
        <Pressable onPress={() => safeBack()} hitSlop={10} style={{ padding: 16 }} accessibilityRole="button" accessibilityLabel="Go back">
          <Feather name="arrow-left" size={22} color={theme.ink} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          <Feather name="wifi-off" size={36} color={theme.mute} />
          <Text style={{ fontSize: 17, fontWeight: '800', color: theme.ink, marginTop: 14, letterSpacing: -0.3 }}>
            Couldn&apos;t load this listing
          </Text>
          <Text style={{ fontSize: 13, color: theme.mute, marginTop: 6, textAlign: 'center', lineHeight: 19 }}>
            {loadErrorText === 'Request timed out'
              ? 'The connection is slow right now. Try again in a moment.'
              : 'Something went wrong. Check your connection and try again.'}
          </Text>
          <Pressable
            onPress={() => { tap('light'); listingQ.refetch(); }}
            style={({ pressed }) => ({
              marginTop: 22,
              height: 48,
              borderRadius: 14,
              paddingHorizontal: 28,
              backgroundColor: theme.ink,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Feather name="refresh-cw" size={14} color="#FFFFFF" />
            <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 14, marginLeft: 8 }}>
              Retry
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!listing) {
    return <ProductSkeleton insetsTop={insets.top} placeholderImage={placeholderImage} />;
  }

  const itemPrice = Number(listing.price ?? 0);
  const bpFee = buyerProtectionFee(itemPrice);
  const buyTotal = orderTotal(itemPrice);

  const activeBuyTotal = bundlePricing ? bundlePricing.total : buyTotal;
  const images = listing.images ?? [];
  const heroPlaceholder = placeholderImage || cardImageUrl(listing, 0) || undefined;

  // 2. Hero Image Carousel & Action Discs
  const hero = (
    <ProductHeroSection
      images={images}
      placeholderImage={heroPlaceholder}
      listingId={productIdParam}
      isSold={listing.is_sold}
      liked={engagement.liked}
      saved={engagement.saved}
      heartCount={engagement.heartCount}
      heroParallaxStyle={heroParallaxStyle}
      heartAnimRef={heartAnimRef}
      saveAnimRef={saveAnimRef}
      onImagePress={(i) => {
        tap('selection');
        engagement.setFullscreenIndex(i);
      }}
      onHeartPress={engagement.handleHeartPress}
      onOpenSaveList={engagement.handleOpenSaveList}
    />
  );

  // 3. Product Overview (Title, Metadata, Price & Buyer Protection)
  const overview = (
    <ProductOverviewHeader
      listing={listing}
      bpFee={bpFee}
      onOpenBpSheet={() => engagement.setBpVisible(true)}
      likers={likers}
      onOpenLikersSheet={() => setLikersVisible(true)}
    />
  );

  // 4. Seller Profile Card
  const sellerCard = (
    <ProductSellerProfileCard
      seller={listing.seller}
      createdAt={listing.created_at}
      isOwnListing={isOwnListing}
      ownerBusy={ownerBusy}
      deleteBusy={deleteBusy}
      followed={followed}
      onDelete={handleDelete}
      onEdit={() => openSellSheet(listing)}
      onFollowPress={handleFollowPress}
      onMessagePress={() => openChat('message')}
      onMoreOptionsPress={() => {
        tap('selection');
        engagement.setSellerOptionsVisible(true);
      }}
    />
  );

  // 5. Product Editorial Details Table (Description, Details Box, Safety)
  const details = (
    <ProductDetailsTable
      listing={listing}
      descExpanded={descExpanded}
      onToggleDescExpanded={() => {
        tap('selection');
        setDescExpanded((v) => !v);
      }}
      onShare={shareListing}
      onReport={handleReport}
    />
  );

  // 6. Multi-Item Bundle Section & Related Grid
  const related = (
    <ProductRelatedSection
      listing={listing}
      relatedTab={bundle.relatedTab}
      sellerItems={sellerItems}
      similarItems={similarItems}
      selectedBundleIds={bundle.selectedBundleIds}
      bundlesEnabled={sellerBundlesEnabled}
      onTabChange={bundle.setRelatedTab}
      onToggleBundleItem={bundle.handleToggleBundleItem}
      onSelectAllBundle={bundle.handleSelectAllBundle}
      onClearAllBundle={bundle.handleClearAllBundle}
      onBuyBundle={bundle.handleBuyBundle}
      onSendBundleOffer={bundle.handleSendBundleOffer}
      onLayout={handleRelatedSectionLayout}
    />
  );

  const actionBar = (
    <ProductActionBar
      style={desktop ? DESKTOP_INLINE_BAR : undefined}
      price={itemPrice}
      buyTotal={activeBuyTotal}
      bottomInset={insets.bottom}
      isOwner={isOwnListing}
      isSold={listing.is_sold || Boolean(buyerOrder && buyerOrder.status !== 'awaiting_payment')}
      hasPurchased={Boolean(buyerOrder && buyerOrder.status !== 'awaiting_payment')}
      isAwaitingPayment={false}
      awaitingAmount={undefined}
      isBundle={isBundleActive}
      bundleCount={bundleCount}
      onCompleteCheckoutPress={() => {
        tap('medium');
        const amount = buyerOrder?.amount_cents ? Math.round(buyerOrder.amount_cents / 100) : undefined;
        router.push({
          pathname: `/payment/${listing.id}`,
          params: amount ? { offer: String(amount) } : undefined,
        } as any);
      }}
      onViewOrderPress={() => {
        tap('selection');
        router.push(`/invoice/${buyerOrder?.id || listing.id}` as any);
      }}
      onChatPress={() => openChat('message')}
      onOfferPress={() => {
        if (!canOffer()) return;
        engagement.setOfferVisible(true);
      }}
      onBuyPress={() => {
        tap('medium');
        if (isOwnListing) {
          openSellSheet(listing);
          return;
        }
        if (!user) {
          guestGate.prompt({
            title: isBundleActive ? 'Sign in to bundle' : 'Almost yours',
            message: isBundleActive
              ? 'Create a free account to buy bundled items with a discount.'
              : 'Create a free account to check out securely with buyer protection included.',
            icon: isBundleActive ? 'package' : 'shopping-bag',
            cta: 'Create account & continue',
          });
          return;
        }
        if (!listing?.id) return;

        if (isBundleActive) {
          bundle.handleBuyBundle(
            bundlePricing?.total ?? itemPrice,
            Array.from(bundle.selectedBundleIds),
          );
          return;
        }

        router.push({
          pathname: `/payment/${listing.id}`,
        } as any);
      }}
    />
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <StatusBar style={isDark ? 'light' : 'dark'} animated />

      {/* 1. Floating Top Navigation Bar (Z: 30) */}
      {/* Desktop has DesktopTopNav and browser back instead. */}
      {!desktop && (
        <ProductHeaderNav
          showStickyHeader={showStickyHeader}
          title={listing.title}
          onBack={() => safeBack()}
        />
      )}

      <Animated.ScrollView
        ref={mainScrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={
          desktop
            ? { paddingTop: 28, paddingBottom: 64, width: frameWidth, alignSelf: 'center' }
            : {
                paddingBottom: Math.max(insets.bottom, 16) + 120,
                width: '100%',
                maxWidth: CONTENT_MAX_WIDTH,
                alignSelf: 'center',
              }
        }
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
      >
        {desktop ? (
          <>
            {/* Desktop: gallery | details column, related grid full width below. */}
            <Breadcrumbs category={listing.category} subcategory={listing.subcategory} />
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: DESKTOP_COLUMN_GAP }}>
              <View style={{ width: heroWidth }}>{hero}</View>
              <View style={{ width: DESKTOP_DETAILS_WIDTH }}>
                {overview}
                <View style={{ paddingHorizontal: 16, marginTop: 4, marginBottom: 8 }}>{actionBar}</View>
                {sellerCard}
                {details}
              </View>
            </View>
            {related}
          </>
        ) : (
          <>
            {hero}
            {overview}
            {sellerCard}
            {details}
            {related}
          </>
        )}
      </Animated.ScrollView>

      {/* 7. Fixed Bottom Thumb Zone Action Bar (Z: 50) — inline in the details column on desktop */}
      {!desktop && actionBar}

      {/* 8. Modal & Sheet Overlays */}
      {user?.id ? (
        <SaveListSheet
          visible={engagement.saveListVisible}
          userId={user.id}
          listingId={listing.id}
          onClose={() => engagement.setSaveListVisible(false)}
          onChanged={engagement.onSaveListChanged}
        />
      ) : null}

      <OfferSheet
        visible={engagement.offerVisible}
        askingPrice={isBundleActive && bundlePricing ? bundlePricing.total : itemPrice}
        title={isBundleActive ? `Bundle (${bundleCount} items)` : listing?.title}
        imageUrl={listing?.images?.[0] ?? (listing as any)?.image_url ?? null}
        loading={offerLoading}
        bundleExtraCount={bundle.selectedBundleIds.size}
        onClose={() => engagement.setOfferVisible(false)}
        onSubmit={submitOffer}
      />

      <BuyerProtectionSheet
        visible={engagement.bpVisible}
        itemPrice={itemPrice}
        onClose={() => engagement.setBpVisible(false)}
      />

      <FullscreenImageViewer
        visible={engagement.fullscreenIndex !== null}
        images={images}
        initialIndex={engagement.fullscreenIndex ?? 0}
        onClose={() => engagement.setFullscreenIndex(null)}
      />

      {listing?.seller ? (
        <SellerOptionsSheet
          visible={engagement.sellerOptionsVisible}
          seller={listing.seller}
          listingId={listing.id}
          onClose={() => engagement.setSellerOptionsVisible(false)}
        />
      ) : null}

      <LikersSheet
        visible={likersVisible}
        listingId={listing.id}
        onClose={() => setLikersVisible(false)}
      />
    </View>
  );
}

// Desktop: where this item sits in the catalogue, and a way back up it. Takes
// the place of the phone's floating back button.
function Breadcrumbs({ category, subcategory }: { category?: string | null; subcategory?: string | null }) {
  const { theme } = useTheme();
  const crumbs: { label: string; href?: string }[] = [{ label: 'Home', href: '/' }];
  if (category) {
    crumbs.push({ label: categoryLabel(category), href: `/?searchOpen=1&searchCategory=${category}` });
    if (subcategory) crumbs.push({ label: subcategoryLabel(category, subcategory) });
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
      {crumbs.map((c, i) => (
        <View key={c.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {i > 0 && <Feather name="chevron-right" size={13} color={theme.mute} />}
          {c.href && i < crumbs.length - 1 ? (
            <Pressable accessibilityRole="link" onPress={() => router.navigate(c.href as any)}>
              {(state) => (
                <Text
                  style={{
                    fontSize: 13,
                    color: theme.textMuted,
                    textDecorationLine: (state as { hovered?: boolean }).hovered ? 'underline' : 'none',
                  }}
                >
                  {c.label}
                </Text>
              )}
            </Pressable>
          ) : (
            <Text style={{ fontSize: 13, color: theme.ink, fontWeight: '600' }}>{c.label}</Text>
          )}
        </View>
      ))}
    </View>
  );
}
