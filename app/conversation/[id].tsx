// ─────────────────────────────────────────────────────────────────────────────
// CONVERSATION SCREEN (CONTAINER / COORDINATOR)
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Container vs. Presentational Component Pattern
//
// 1. Separation of Concerns:
//    This screen acts purely as a "Container / Coordinator":
//    - It manages route parameters (`useLocalSearchParams`).
//    - It coordinates custom hooks (`useConversationThread`, `useConversationBlock`).
//    - It delegates rendering to focused subcomponents (`ThreadHeader`, `MessageRow`,
//      `ConversationListingHeader`, `ConversationBlockedBanner`, `ConversationActionSheets`).
//
// 2. High Cohesion & Low Coupling:
//    WebSocket lifecycles, message reconciliation, and blocking workflows are no longer
//    tangled inside UI render trees. They are self-contained, easily testable hooks.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  ActivityIndicator,
  Animated,
  Easing,
  StyleSheet,
} from 'react-native';
import { Text } from '@/lib/rnText';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, router } from 'expo-router';
import { safeBack } from '@/lib/nav';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { uploadListingImages, type LocalImage } from '@/lib/upload';
import { FullscreenImageViewer } from '@/components/product/FullscreenImageViewer';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { type as typography } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';
import { formatPrice } from '@/lib/currency';
import { confirm } from '@/lib/confirm';
import { isImageMessage, type ChatMessage } from '@/lib/chat';
import { EmptyState, SafeContainer } from '@/components/ui';
import { explainCoverage } from '@/components/SafetyBanner';
import { HIT_SLOP_8 } from '@/lib/responsive';
import {
  type Anchor,
  type ChatAction,
  type MessageAction,
  type ThreadRow,
  Composer,
  ConversationActionSheets,
  ConversationBlockedBanner,
  ConversationListingHeader,
  DateDivider,
  MessageRow,
  ReactionPicker,
  SafetyNote,
  ThreadHeader,
  useConversationBlock,
  useConversationThread,
} from '@/components/chat';

/** Breathing room under composer when software keyboard is up */
const DOCK_GAP_KEYBOARD = 6;
const EMPTY_REACTIONS: string[] = [];

function useChatKeyboardLayout(containerRef?: React.RefObject<any>) {
  const [keyboardUp, setKeyboardUp] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [webViewportHeight, setWebViewportHeight] = useState<number | null>(null);
  const [webViewportOffsetTop, setWebViewportOffsetTop] = useState(0);
  const keyboardAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 1. Native Keyboard Events (iOS & Android)
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvt, (e) => {
      setKeyboardUp(true);
      const h = e?.endCoordinates?.height ?? 0;
      setKeyboardHeight(h);
      Animated.timing(keyboardAnim, {
        toValue: 1,
        duration: Platform.OS === 'ios' ? (e?.duration || 250) : 150,
        easing: Platform.OS === 'ios' ? Easing.bezier(0.17, 0.59, 0.4, 0.77) : Easing.out(Easing.ease),
        useNativeDriver: false,
      }).start();
    });

    const hideSub = Keyboard.addListener(hideEvt, (e) => {
      setKeyboardUp(false);
      setKeyboardHeight(0);
      Animated.timing(keyboardAnim, {
        toValue: 0,
        duration: Platform.OS === 'ios' ? (e?.duration || 250) : 150,
        easing: Platform.OS === 'ios' ? Easing.bezier(0.17, 0.59, 0.4, 0.77) : Easing.out(Easing.ease),
        useNativeDriver: false,
      }).start();
    });

    // 2. Web VisualViewport Events (Mobile Safari / iOS WebKit / Chrome Mobile)
    let cleanupWeb: (() => void) | null = null;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const applyDirectStyles = (isUp: boolean, height: number, offsetTop: number) => {
        if (containerRef?.current) {
          const el = containerRef.current as unknown as HTMLElement;
          if (el && el.style) {
            if (isUp) {
              el.style.position = 'fixed';
              el.style.top = `${offsetTop}px`;
              el.style.left = '0px';
              el.style.right = '0px';
              el.style.height = `${height}px`;
              el.style.maxHeight = `${height}px`;
              el.style.overflow = 'hidden';
            } else {
              el.style.position = '';
              el.style.top = '';
              el.style.left = '';
              el.style.right = '';
              el.style.height = '';
              el.style.maxHeight = '';
              el.style.overflow = '';
            }
          }
        }
      };

      const onViewportChange = () => {
        const vv = window.visualViewport;
        if (!vv) return;

        const currentHeight = vv.height;
        const offsetTop = vv.offsetTop;
        const totalHeight = window.innerHeight;
        const diff = Math.max(0, totalHeight - currentHeight);

        // Virtual keyboard is active on mobile web if visual viewport shrunk (> 60px)
        const isUp = diff > 60;
        setKeyboardUp(isUp);
        setKeyboardHeight(isUp ? diff : 0);
        setWebViewportHeight(isUp ? currentHeight : null);
        setWebViewportOffsetTop(isUp ? offsetTop : 0);

        Animated.timing(keyboardAnim, {
          toValue: isUp ? 1 : 0,
          duration: 150,
          useNativeDriver: false,
        }).start();

        applyDirectStyles(isUp, currentHeight, offsetTop);

        // Keep page/document scroll pinned to top on iOS Safari
        if (window.scrollY !== 0 || (document.body && document.body.scrollTop !== 0)) {
          window.scrollTo({ left: 0, top: 0, behavior: 'instant' as any });
          if (document.body) document.body.scrollTop = 0;
        }
      };

      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', onViewportChange);
        window.visualViewport.addEventListener('scroll', onViewportChange);
      }
      window.addEventListener('scroll', onViewportChange, { passive: true });

      cleanupWeb = () => {
        if (window.visualViewport) {
          window.visualViewport.removeEventListener('resize', onViewportChange);
          window.visualViewport.removeEventListener('scroll', onViewportChange);
        }
        window.removeEventListener('scroll', onViewportChange);
        applyDirectStyles(false, 0, 0);
      };
    }

    return () => {
      showSub.remove();
      hideSub.remove();
      cleanupWeb?.();
    };
  }, [containerRef, keyboardAnim]);

  return { keyboardUp, keyboardHeight, keyboardAnim, webViewportHeight, webViewportOffsetTop };
}

export default function ConversationScreen() {
  const { id, prefill } = useLocalSearchParams<{ id: string; prefill?: string }>();
  const conversationId = typeof id === 'string' ? id : '';
  const prefillParam = typeof prefill === 'string' ? prefill : '';
  const { user } = useAuth();
  const { theme } = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const containerRef = useRef<any>(null);
  const { keyboardUp, keyboardAnim, webViewportHeight, webViewportOffsetTop } = useChatKeyboardLayout(containerRef);

  const restingBottomPadding = Math.max(insets.bottom, 12);
  const animatedDockPaddingBottom = keyboardAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [restingBottomPadding, DOCK_GAP_KEYBOARD],
  });

  const keyboardVerticalOffset = Platform.select({
    ios: 0,
    android: 0,
    default: 0,
  });

  // Prevent document body scrolling on mobile web when in a conversation
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const html = document.documentElement;
    const body = document.body;
    const origHtmlOverflow = html.style.overflow;
    const origBodyOverflow = body.style.overflow;
    const origBodyHeight = body.style.height;

    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.height = '100%';

    return () => {
      html.style.overflow = origHtmlOverflow;
      body.style.overflow = origBodyOverflow;
      body.style.height = origBodyHeight;
    };
  }, []);

  // ── Custom Domain Hooks ──────────────────────────────────────────────────
  const thread = useConversationThread(conversationId, user, prefillParam);
  const { scrollToBottom } = thread;
  const block = useConversationBlock(user, thread.other);

  // ── Sheet & Context Menu Visibility States ───────────────────────────────
  const [pressed, setPressed] = useState<{ msg: any; anchor: Anchor } | null>(null);
  const [offerVisible, setOfferVisible] = useState(false);
  const [counterParentMsg, setCounterParentMsg] = useState<ChatMessage | null>(null);
  const [plusOpen, setPlusOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);

  // ── Writing State & Product Overview Slide Animation ─────────────────────
  const [isWriting, setIsWriting] = useState(false);
  const slideAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: isWriting ? 0 : 1,
      duration: 220,
      useNativeDriver: false,
    }).start();
  }, [isWriting, slideAnim]);

  const overviewMaxHeight = slideAnim.interpolate({
    inputRange: [0, 1],
    // Cap, not exact height: the card is ~80dp and grows with system font scale
    outputRange: [0, 140],
  });

  const overviewOpacity = slideAnim.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0, 0, 1],
  });

  const overviewTranslateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [16, 0],
  });

  const overviewMarginBottom = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 6],
  });

  // Android's back-to-dismiss hides the keyboard without blurring the input, so
  // onBlur never fires (and re-tapping the still-focused input skips onFocus);
  // follow the keyboard so the listing card comes back when it goes away.
  useEffect(() => {
    setIsWriting(keyboardUp);
  }, [keyboardUp]);

  // Ensure message list follows bottom when keyboard opens
  useEffect(() => {
    if (keyboardUp) {
      scrollToBottom(true);
      const timer = setTimeout(() => {
        scrollToBottom(false);
      }, Platform.OS === 'ios' ? 260 : 160);
      return () => clearTimeout(timer);
    }
  }, [keyboardUp, scrollToBottom]);

  // ── Navigation & Clipboard Helpers ───────────────────────────────────────
  const openListing = useCallback(() => {
    if (thread.convListingId) router.push(`/product/${thread.convListingId}` as any);
  }, [thread.convListingId]);

  const handleCopy = useCallback(async () => {
    const msg = pressed?.msg;
    if (!msg) return;
    const text =
      msg.kind === 'offer' && msg.metadata?.amount
        ? formatPrice(msg.metadata.amount)
        : msg.content;
    await Clipboard.setStringAsync(text);
    toast.show('Copied', { variant: 'success', icon: 'check' });
  }, [pressed?.msg, toast]);

  const handleDeleteMessage = useCallback(async () => {
    const msg = pressed?.msg;
    if (!msg || !user) return;
    const isImage = isImageMessage(msg);

    const ok = await confirm({
      title: isImage ? 'Delete photo?' : 'Delete message?',
      message: 'This message will be deleted for everyone in this conversation. This cannot be undone.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      destructive: true,
    });
    if (!ok) return;

    const success = await thread.handleDeleteMessage(msg.id);
    if (!success) {
      toast.show("Couldn't delete message", { variant: 'default', icon: 'alert-triangle' });
    } else {
      toast.show(isImage ? 'Photo deleted' : 'Message deleted', { variant: 'success', icon: 'check' });
    }
  }, [pressed?.msg, thread, toast, user]);

  const messageActions: MessageAction[] = useMemo(() => {
    const actions: MessageAction[] = [
      { id: 'copy', label: 'Copy', icon: 'copy', onPress: handleCopy },
    ];
    if (pressed?.msg && user && pressed.msg.sender_id === user.id) {
      const isImage = isImageMessage(pressed.msg);
      actions.push({
        id: 'delete',
        label: isImage ? 'Delete photo' : 'Delete message',
        icon: 'trash-2',
        tone: 'destructive',
        onPress: handleDeleteMessage,
      });
    }
    return actions;
  }, [handleCopy, handleDeleteMessage, pressed?.msg, user]);

  const openNewOffer = useCallback(() => {
    setCounterParentMsg(null);
    setOfferVisible(true);
  }, []);

  // ── Context Action Sheets Menus ──────────────────────────────────────────
  const plusActions: ChatAction[] = useMemo(
    () => [
      ...(thread.canOffer
        ? [
            {
              id: 'offer',
              label: 'Make an offer',
              hint: thread.convListingPrice ? `Listed at ${formatPrice(thread.convListingPrice)}` : undefined,
              icon: 'tag' as const,
              tone: 'primary' as const,
              onPress: openNewOffer,
            },
          ]
        : []),
      ...(thread.convListingId
        ? [
            {
              id: 'listing',
              label: 'View listing',
              icon: 'external-link' as const,
              onPress: openListing,
            },
          ]
        : []),
      {
        id: 'coverage',
        label: "How you're covered",
        hint: 'Buyer Protection, payments, and support',
        icon: 'shield' as const,
        onPress: explainCoverage,
      },
    ],
    [thread.canOffer, thread.convListingPrice, thread.convListingId, openListing, openNewOffer],
  );

  const overflowActions: ChatAction[] = useMemo(
    () => [
      ...(thread.canOffer
        ? [
            {
              id: 'offer',
              label: 'Make an offer',
              hint: thread.convListingPrice ? `Listed at ${formatPrice(thread.convListingPrice)}` : undefined,
              icon: 'tag' as const,
              tone: 'primary' as const,
              onPress: openNewOffer,
            },
          ]
        : []),
      ...(thread.other?.id
        ? [
            {
              id: 'profile',
              label: 'View profile',
              icon: 'user' as const,
              onPress: () => router.push(`/user/${thread.other!.id}` as any),
            },
          ]
        : []),
      ...(thread.convListingId
        ? [
            {
              id: 'listing',
              label: 'View listing',
              icon: 'external-link' as const,
              onPress: openListing,
            },
          ]
        : []),
      {
        id: 'coverage',
        label: "How you're covered",
        icon: 'shield' as const,
        onPress: explainCoverage,
      },
      ...(thread.convListingId || thread.other?.id
        ? [
            {
              id: 'report',
              label: 'Report this conversation',
              icon: 'flag' as const,
              onPress: () => setReportOpen(true),
            },
          ]
        : []),
      ...(thread.other?.id
        ? [
            {
              id: 'block',
              label: block.isBlocked
                ? `Unblock ${thread.other.username ? `@${thread.other.username}` : 'user'}`
                : `Block ${thread.other.username ? `@${thread.other.username}` : 'user'}`,
              hint: block.isBlocked ? 'Allow messages from this user' : 'Prevent messages and interaction',
              icon: 'slash' as const,
              tone: block.isBlocked ? ('default' as const) : ('destructive' as const),
              onPress: block.handleToggleBlock,
            },
          ]
        : []),
    ],
    [thread.other, thread.canOffer, thread.convListingPrice, thread.convListingId, openListing, block.isBlocked, block.handleToggleBlock],
  );

  // ── Image Picking & Sending ──────────────────────────────────────────────
  const handlePickAndSendImage = useCallback(async () => {
    if (!user || !conversationId || uploadingImage) return;
    let tempId: string | null = null;
    try {
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
        base64: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      setUploadingImage(true);
      const asset = result.assets[0];
      const localImg: LocalImage = {
        uri: asset.uri,
        base64: asset.base64 ?? null,
      };

      // Optimistic message shown in thread immediately
      tempId = `temp-${Date.now()}`;
      const tempMsg = {
        id: tempId,
        conversation_id: conversationId,
        sender_id: user.id,
        content: asset.uri,
        kind: 'text' as const,
        metadata: { image_url: asset.uri },
        offer_status: null,
        created_at: new Date().toISOString(),
        pending: true,
      };
      thread.addOptimisticMessage(tempMsg);

      // Upload image via the standard upload pipeline
      const uploaded = await uploadListingImages([localImg], user.id);
      const publicUrl = uploaded[0]?.url;

      if (!publicUrl) {
        throw new Error('Could not upload photo');
      }

      // Deliver the server message
      await thread.handleSendImage(publicUrl, tempId);
    } catch (err: any) {
      if (tempId) {
        try {
          await thread.handleDeleteMessage(tempId);
        } catch (cleanupErr) {
          console.warn('[conversation] cleanup temp message error', cleanupErr);
        }
      }
      console.warn('[conversation] send image error', err);
      toast.show(err?.message || 'Failed to send image', {
        variant: 'default',
        icon: 'alert-triangle',
      });
    } finally {
      setUploadingImage(false);
    }
  }, [conversationId, thread, toast, uploadingImage, user]);

  // ── Message Thread Row Renderer ──────────────────────────────────────────
  const renderRow = useCallback(
    ({ item }: { item: ThreadRow }) => {
      if (item.type === 'date') return <DateDivider iso={item.iso} />;
      return (
        <MessageRow
          msg={item.msg}
          mine={!!user && item.msg.sender_id === user.id}
          isSeller={thread.isSeller}
          grouped={item.grouped}
          lastOfGroup={item.lastOfGroup}
          senderName={thread.senderName}
          senderAvatar={thread.otherAvatar}
          listingId={thread.convListingId}
          listingTitle={thread.conv?.listing?.title ?? null}
          listingThumb={thread.listingThumb}
          listingPrice={thread.convListingPrice}
          listingSold={thread.convListingSold}
          reactions={thread.byMessage.get(item.msg.id) ?? EMPTY_REACTIONS}
          onAccept={() => thread.handleOfferResponse(item.msg, 'accepted')}
          onDecline={() => thread.handleOfferResponse(item.msg, 'declined')}
          onCounterOffer={() => {
            setCounterParentMsg(item.msg);
            setOfferVisible(true);
          }}
          onPay={(amount, bundleIds) => {
            if (!thread.convListingId) return;
            const params: Record<string, string> = { offer: String(amount) };
            if (bundleIds && bundleIds.length > 0) {
              params.bundle_ids = bundleIds.join(',');
            }
            router.push({
              pathname: `/payment/${thread.convListingId}`,
              params,
            } as any);
          }}
          onRetry={() => thread.handleRetry(item.msg)}
          onLongPress={(anchor) => setPressed({ msg: item.msg, anchor })}
          onImagePress={(url) => setFullscreenImage(url)}
        />
      );
    },
    [user, thread],
  );

  // ── Loading & Empty Fallbacks ────────────────────────────────────────────
  if (thread.loading) {
    return (
      <SafeContainer edges={['top', 'left', 'right']} backgroundColor={theme.background} style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6 }}>
          <Pressable
            onPress={() => safeBack()}
            hitSlop={HIT_SLOP_8}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
          >
            <Feather name="arrow-left" size={22} color={theme.ink} />
          </Pressable>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.primary} />
        </View>
      </SafeContainer>
    );
  }

  if (!thread.conv) {
    return (
      <SafeContainer edges={['top', 'left', 'right']} backgroundColor={theme.background} style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6 }}>
          <Pressable
            onPress={() => safeBack()}
            hitSlop={HIT_SLOP_8}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
          >
            <Feather name="arrow-left" size={22} color={theme.ink} />
          </Pressable>
        </View>
        <EmptyState
          icon="alert-circle"
          title="Conversation unavailable"
          description="This thread may have been removed."
        />
      </SafeContainer>
    );
  }

  return (
    <SafeContainer
      ref={containerRef}
      mode="keyboard-avoiding"
      noScroll
      edges={['top', 'left', 'right']}
      backgroundColor={theme.background}
      keyboardVerticalOffset={keyboardVerticalOffset}
      style={[
        { flex: 1 },
        Platform.OS === 'web' && webViewportHeight != null
          ? ({
              height: webViewportHeight,
              maxHeight: webViewportHeight,
              position: 'fixed',
              top: webViewportOffsetTop,
              left: 0,
              right: 0,
              overflow: 'hidden',
            } as any)
          : null,
      ]}
    >
      {/* Top Header */}
      <View
        style={{
          backgroundColor: theme.background,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.hairline,
          zIndex: 10,
        }}
      >
        <ThreadHeader
          name={thread.senderName}
          subtitle={thread.other?.username ? `@${thread.other.username}` : null}
          avatar={thread.otherAvatar}
          onBack={() => safeBack()}
          onPressIdentity={thread.other?.id ? () => router.push(`/user/${thread.other!.id}` as any) : undefined}
          onOverflow={() => setOverflowOpen(true)}
        />
      </View>

      {/* Message Thread FlatList (safety note is the list header so it scrolls away like WhatsApp's notice) */}
      <FlatList
        ref={thread.listRef}
        data={thread.rows}
        keyExtractor={(row) => row.key}
        renderItem={renderRow}
        style={{ flex: 1 }}
        contentContainerStyle={[
          {
            flexGrow: 1,
            paddingTop: 8,
            paddingBottom: 8,
          },
          thread.rows.length < 8 ? { justifyContent: 'flex-end' } : null,
        ]}
        onContentSizeChange={() => thread.followEnd(false, false)}
        onLayout={() => {
          if (thread.pinnedRef.current || keyboardUp) {
            thread.scrollToBottom(false);
          }
        }}
        onScroll={thread.onScroll}
        onScrollBeginDrag={() => {
          if (Platform.OS === 'web' && typeof document !== 'undefined') {
            if (document.activeElement instanceof HTMLElement && document.activeElement.tagName === 'TEXTAREA') {
              document.activeElement.blur();
            }
          }
        }}
        scrollEventThrottle={16}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={<SafetyNote onPress={explainCoverage} />}
        ListEmptyComponent={
          <View style={{ paddingHorizontal: 32, paddingVertical: 16 }}>
            <Text
              style={{
                fontFamily: typography.family.sans,
                fontSize: 13,
                color: theme.muteSoft,
                textAlign: 'center',
              }}
            >
              No messages yet. Ask a question, or send an offer.
            </Text>
          </View>
        }
      />

      {/* Bottom Composer / Order Overview Dock */}
      <Animated.View
        style={{
          backgroundColor: theme.background,
          zIndex: 10,
          paddingTop: thread.convListingId ? 6 : 0,
          paddingBottom: animatedDockPaddingBottom,
        }}
      >
        {/* Animated Order Overview (slides down when writing, slides up when leaving field) */}
        {thread.convListingId && (
          <Animated.View
            pointerEvents={isWriting ? 'none' : 'auto'}
            style={{
              maxHeight: overviewMaxHeight,
              opacity: overviewOpacity,
              transform: [{ translateY: overviewTranslateY }],
              marginBottom: overviewMarginBottom,
              overflow: 'hidden',
              paddingHorizontal: 12,
              width: '100%',
              maxWidth: 500,
              alignSelf: 'center',
            }}
          >
            <ConversationListingHeader
              listing={thread.conv.listing}
              listingId={thread.convListingId}
              listingThumb={thread.listingThumb}
              status={thread.status}
              isSeller={thread.isSeller}
              onPressListing={openListing}
              onPressBuyNow={() => router.push(`/payment/${thread.convListingId}` as any)}
            />
          </Animated.View>
        )}

        {/* Light grey separating line between the message bar and product overview */}
        <View
          style={{
            width: '100%',
            height: 1,
            backgroundColor: theme.hairline,
          }}
        />

        {block.blockStatus === 'unblocked' ? (
          <Composer
            value={thread.input}
            onChangeText={(text) => {
              if (!isWriting) setIsWriting(true);
              thread.setInput(text);
            }}
            onSend={thread.handleSend}
            onSendImage={handlePickAndSendImage}
            uploadingImage={uploadingImage}
            onPlus={() => setPlusOpen(true)}
            onFocus={() => {
              setIsWriting(true);
              thread.scrollToBottom(true);
              if (Platform.OS === 'web' && typeof window !== 'undefined') {
                window.scrollTo({ left: 0, top: 0, behavior: 'instant' as any });
                if (document.body) document.body.scrollTop = 0;
                if (document.documentElement) document.documentElement.scrollTop = 0;
                requestAnimationFrame(() => {
                  window.scrollTo({ left: 0, top: 0, behavior: 'instant' as any });
                  if (document.body) document.body.scrollTop = 0;
                });
                setTimeout(() => {
                  window.scrollTo({ left: 0, top: 0, behavior: 'instant' as any });
                  if (document.body) document.body.scrollTop = 0;
                  thread.scrollToBottom(false);
                }, 100);
              } else {
                setTimeout(() => {
                  thread.scrollToBottom(false);
                }, 150);
              }
            }}
            onBlur={() => {
              setIsWriting(false);
              if (Platform.OS === 'web' && typeof window !== 'undefined') {
                window.scrollTo({ left: 0, top: 0, behavior: 'instant' as any });
                if (document.body) document.body.scrollTop = 0;
                if (document.documentElement) document.documentElement.scrollTop = 0;
              }
            }}
          />
        ) : (
          <ConversationBlockedBanner
            blockStatus={block.blockStatus}
            onUnblock={block.handleToggleBlock}
          />
        )}
      </Animated.View>

      {/* Pop-up Reaction Picker */}
      <ReactionPicker
        anchor={pressed?.anchor ?? null}
        selected={pressed ? thread.myReactionOn(pressed.msg.id) : null}
        actions={messageActions}
        onSelect={(emoji) => {
          if (pressed?.msg?.id) thread.handleReact(pressed.msg.id, emoji);
          setPressed(null);
        }}
        onClose={() => setPressed(null)}
      />

      {/* Overlays & Action Sheets */}
      <ConversationActionSheets
        plusOpen={plusOpen}
        plusActions={plusActions}
        onClosePlus={() => setPlusOpen(false)}
        overflowOpen={overflowOpen}
        overflowActions={overflowActions}
        onCloseOverflow={() => setOverflowOpen(false)}
        reportOpen={reportOpen}
        onCloseReport={() => setReportOpen(false)}
        onSelectReportReason={thread.handleReport}
        blockSheetOpen={block.blockSheetOpen}
        onCloseBlockSheet={() => block.setBlockSheetOpen(false)}
        onSelectBlockReason={block.handleBlockWithReason}
        offerVisible={offerVisible}
        listingPrice={thread.convListingPrice}
        listingTitle={thread.conv?.listing?.title}
        listingThumb={thread.listingThumb}
        onCloseOffer={() => {
          setOfferVisible(false);
          setCounterParentMsg(null);
        }}
        onSubmitOffer={async (amount) => {
          if (counterParentMsg) {
            const success = await thread.handleCounterOffer(counterParentMsg, amount);
            if (success) {
              setOfferVisible(false);
              setCounterParentMsg(null);
            }
          } else {
            const success = await thread.handleSendOffer(amount, '');
            if (success) setOfferVisible(false);
          }
        }}
      />

      {/* Fullscreen Photo Viewer */}
      <FullscreenImageViewer
        visible={!!fullscreenImage}
        images={fullscreenImage ? [fullscreenImage] : []}
        initialIndex={0}
        onClose={() => setFullscreenImage(null)}
      />
    </SafeContainer>
  );
}
