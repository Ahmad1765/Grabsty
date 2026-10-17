// ─────────────────────────────────────────────────────────────────────────────
// USE CONVERSATION THREAD HOOK
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Realtime WebSocket Lifecycle & Optimistic State
//
// 1. WebSocket Subscriptions & Cleanups:
//    In React Native / React 19, multiple mounting or dynamic route changes
//    (e.g., navigating from one chat to another) can cause memory leaks and
//    duplicate message receipts if subscriptions aren't torn down cleanly.
//    Returning the `unsub` callback directly from `useEffect` ensures that
//    Supabase Realtime channels are cleanly closed whenever `conversationId` changes.
//
// 2. Optimistic Message Insertion:
//    When a user presses "Send", we immediately generate a local temporary message
//    (`id: temp-...`, `pending: true`) and append it to `messages`.
//    Once the database responds, we replace the temporary message with the real
//    database entity. If the network drops, `failed: true` triggers an in-place retry button.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Alert,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { User as AuthUser } from '@supabase/supabase-js';
import { qk } from '@/lib/queries';
import { useToast } from '@/lib/toast';
import { capture } from '@/lib/analytics';
import { captureError } from '@/lib/sentry';
import { withTimeout } from '@/lib/async';
import { maybeSoftAskForPush } from '@/lib/notifications';
import { getOptimizedImageUrl, cardImageUrl } from '@/lib/images';
import { reportListing } from '@/lib/reports';
import {
  isSupportConversation,
  sendSupportBotReply,
  SUPPORT_BOT_USER_ID,
  SUPPORT_BOT_NAME,
  SUPPORT_BOT_AVATAR,
} from '@/lib/support';
import {
  fetchMessages,
  fetchReactions,
  getConversation,
  markConversationRead,
  sendMessage,
  deleteMessage,
  sendOffer,
  acceptChatOffer,
  counterOffer,
  setReaction,
  subscribeToMessages,
  subscribeToReactions,
  updateOfferStatus,
  checkAndCancelInvalidBundleOffers,
  otherParticipant,
  isImageMessage,
  getMessageImageUrl,
  type ChatMessage,
  type ConversationRow,
  type MessageReaction,
} from '@/lib/chat';
import { deleteListingImages } from '@/lib/upload';
import { buildThreadRows, type ThreadRow } from './format';
import { listingStatus } from './ListingThumb';

const FETCH_MESSAGES_TIMEOUT = Symbol('FETCH_MESSAGES_TIMEOUT');

async function cleanupMessageImage(msg: ChatMessage) {
  if (isImageMessage(msg)) {
    const imgUrl = getMessageImageUrl(msg);
    if (imgUrl && imgUrl.includes('/listing-images/')) {
      try {
        await deleteListingImages([imgUrl]);
      } catch (err) {
        console.warn('[chat] deleteListingImages cleanup error', err);
      }
    }
  }
}

export function useConversationThread(
  conversationId: string,
  user: AuthUser | null,
  initialInput: string = '',
) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const listRef = useRef<FlatList<ThreadRow>>(null);
  const pinnedRef = useRef(true);

  const [conv, setConv] = useState<ConversationRow | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<MessageReaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState(initialInput);

  const messagesRef = useRef<ChatMessage[]>(messages);
  messagesRef.current = messages;

  const canceledTempIdsRef = useRef<Set<string>>(new Set());
  const activeDeliveriesRef = useRef<Map<string, Promise<ChatMessage | null>>>(new Map());

  useEffect(() => {
    setInput(initialInput);
  }, [conversationId, initialInput]);

  // ── Initial Parallel Fetch ────────────────────────────────────────────────
  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    setLoading(true);

    if (conversationId === 'demo') {
      const myId = user?.id || 'demo-seller';
      const otherId = 'demo-buyer';
      setConv({
        id: 'demo',
        listing_id: 'listing-demo',
        buyer_id: otherId,
        seller_id: myId,
        last_message: 'hello thank you for showing interest!',
        last_sender_id: myId,
        updated_at: new Date('2025-02-25T15:30:00Z').toISOString(),
        buyer_last_read_at: new Date().toISOString(),
        seller_last_read_at: new Date().toISOString(),
        listing: {
          id: 'listing-demo',
          title: 'Vintage Designer Jacket',
          price: 35,
          images: ['https://images.unsplash.com/photo-1551028719-00167b16eac5?w=400'],
          thumbnails: ['https://images.unsplash.com/photo-1551028719-00167b16eac5?w=120'],
          is_sold: false,
        },
        buyer: {
          id: otherId,
          username: 'bella',
          full_name: 'Bella',
          avatar_url: null,
          location: 'New York, NY',
          rating: 5,
          total_sales: 12,
        },
      });
      setMessages([
        {
          id: 'm1',
          conversation_id: 'demo',
          sender_id: otherId,
          content: 'Offer: $90.00',
          kind: 'offer',
          offer_status: 'pending',
          metadata: { amount: 90, actionable: false },
          created_at: '2025-02-23T20:55:00Z',
        },
        {
          id: 'm2',
          conversation_id: 'demo',
          sender_id: myId,
          content: 'Declined offer: $90.00',
          kind: 'offer',
          offer_status: 'declined',
          metadata: { amount: 90 },
          created_at: '2025-02-24T16:14:00Z',
        },
        {
          id: 'm3',
          conversation_id: 'demo',
          sender_id: otherId,
          content: 'Offer: $123.00',
          kind: 'offer',
          offer_status: 'pending',
          metadata: { amount: 123, actionable: false },
          created_at: '2025-02-24T16:16:00Z',
        },
        {
          id: 'm4',
          conversation_id: 'demo',
          sender_id: myId,
          content: 'Countered with: $140.00',
          kind: 'offer',
          offer_status: 'countered',
          metadata: { amount: 140 },
          created_at: '2025-02-24T16:18:00Z',
        },
        {
          id: 'm5',
          conversation_id: 'demo',
          sender_id: otherId,
          content: 'Countered with: $125.00',
          kind: 'offer',
          offer_status: 'countered',
          metadata: { amount: 125 },
          created_at: '2025-02-25T15:25:00Z',
        },
        {
          id: 'm6',
          conversation_id: 'demo',
          sender_id: myId,
          content: 'hello thank you for showing interest! unfortunately i will be firm on the price considering that every other listing is $200+ thank you!',
          kind: 'text',
          metadata: null,
          offer_status: null,
          created_at: '2025-02-25T15:26:00Z',
        },
        {
          id: 'm7',
          conversation_id: 'demo',
          sender_id: myId,
          content: 'Your offer has expired',
          kind: 'offer',
          offer_status: 'expired',
          metadata: { amount: 20 },
          created_at: '2025-12-10T13:59:00Z',
        },
        {
          id: 'm8',
          conversation_id: 'demo',
          sender_id: myId,
          content: 'Special offer',
          kind: 'offer',
          offer_status: 'pending',
          metadata: { amount: 23, is_special_offer: true },
          created_at: new Date(Date.now() - 3600 * 1000 * 1.35).toISOString(),
        },
        {
          id: 'm9',
          conversation_id: 'demo',
          sender_id: otherId,
          content: 'can you stop sending offers',
          kind: 'text',
          metadata: null,
          offer_status: null,
          created_at: '2025-12-11T09:06:00Z',
        },
        {
          id: 'm10',
          conversation_id: 'demo',
          sender_id: otherId,
          content: 'Offer is no longer available',
          kind: 'offer',
          offer_status: 'canceled',
          metadata: { amount: 50 },
          created_at: '2026-05-27T20:50:00Z',
        },
        {
          id: 'm11',
          conversation_id: 'demo',
          sender_id: otherId,
          content: 'girl',
          kind: 'text',
          metadata: null,
          offer_status: null,
          created_at: '2026-05-28T12:59:00Z',
        },
        {
          id: 'm12',
          conversation_id: 'demo',
          sender_id: otherId,
          content: 'cease',
          kind: 'text',
          metadata: null,
          offer_status: null,
          created_at: '2026-05-28T13:00:00Z',
        },
        {
          id: 'm13',
          conversation_id: 'demo',
          sender_id: otherId,
          content: 'Offer received',
          kind: 'offer',
          offer_status: 'pending',
          metadata: { amount: 18 },
          created_at: new Date(Date.now() - 3600 * 1000 * 13.25).toISOString(),
        },
      ]);
      setLoading(false);
      return;
    }

    if (conversationId === 'demo-deal') {
      const myId = user?.id || 'demo-buyer';
      const sellerId = 'demo-seller';
      setConv({
        id: 'demo-deal',
        listing_id: 'listing-demo',
        buyer_id: myId,
        seller_id: sellerId,
        last_message: "I accepted ur offer why haven't you bought",
        last_sender_id: sellerId,
        updated_at: new Date('2026-07-22T22:39:00Z').toISOString(),
        buyer_last_read_at: new Date().toISOString(),
        seller_last_read_at: new Date().toISOString(),
        listing: {
          id: 'listing-demo',
          title: 'Vintage Cotton Tee',
          price: 6,
          images: ['https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=400'],
          thumbnails: ['https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=120'],
          is_sold: false,
        },
      });
      setMessages([
        {
          id: 'd1',
          conversation_id: 'demo-deal',
          sender_id: myId,
          content: 'You made an offer',
          kind: 'offer',
          offer_status: 'pending',
          metadata: { amount: 4.7 },
          created_at: new Date(Date.now() - 3600 * 1000 * 4.7).toISOString(),
        },
        {
          id: 'd2',
          conversation_id: 'demo-deal',
          sender_id: sellerId,
          content: "It's a deal",
          kind: 'offer',
          offer_status: 'accepted',
          metadata: { amount: 4.7 },
          created_at: new Date(Date.now() - 3600 * 1000 * 4.7).toISOString(),
        },
        {
          id: 'd3',
          conversation_id: 'demo-deal',
          sender_id: sellerId,
          content: "I accepted ur offer why haven't you bought",
          kind: 'text',
          metadata: null,
          offer_status: null,
          created_at: new Date(Date.now() - 3600 * 1000 * 2).toISOString(),
        },
      ]);
      setLoading(false);
      return;
    }

    (async () => {
      let loaded:
        | [
            Awaited<ReturnType<typeof getConversation>>,
            ChatMessage[] | typeof FETCH_MESSAGES_TIMEOUT,
            MessageReaction[],
          ]
        | null = null;
      try {
        loaded = await Promise.all([
          withTimeout(getConversation(conversationId), 12_000, null),
          withTimeout<ChatMessage[] | typeof FETCH_MESSAGES_TIMEOUT>(
            fetchMessages(conversationId),
            12_000,
            FETCH_MESSAGES_TIMEOUT,
          ),
          withTimeout(fetchReactions(conversationId), 12_000, [] as MessageReaction[]),
        ]);
      } catch (e) {
        console.warn('[conversation] load failed', e);
      }

      if (cancelled) return;
      if (loaded !== null) {
        setConv(loaded[0]);
        const msgsResult = loaded[1];
        const isTimeout = msgsResult === FETCH_MESSAGES_TIMEOUT;
        let initialMsgs: ChatMessage[] = isTimeout ? [] : msgsResult;
        if (!isTimeout && isSupportConversation(loaded[0]) && initialMsgs.length === 0) {
          initialMsgs = [
            {
              id: 'support-welcome-initial',
              conversation_id: conversationId,
              sender_id: SUPPORT_BOT_USER_ID,
              content:
                `👋 Welcome to Grabsty Support!\n\n` +
                `How can we assist you today? Feel free to ask about your orders, Buyer Protection, payments, or selling on Grabsty.`,
              kind: 'text',
              metadata: null,
              offer_status: null,
              created_at: (loaded[0] as any)?.created_at || loaded[0]?.updated_at || new Date().toISOString(),
              updated_at: loaded[0]?.updated_at || new Date().toISOString(),
            },
          ];
        }
        setMessages(initialMsgs);
        setReactions(loaded[2]);

        // Auto-cancel bundle offers if any item in the bundle was purchased by another buyer
        checkAndCancelInvalidBundleOffers(initialMsgs, loaded[0]?.listing_id)
          .then((canceledIds) => {
            if (!cancelled && canceledIds.length > 0) {
              setMessages((prev) =>
                prev.map((m) =>
                  canceledIds.includes(m.id)
                    ? {
                        ...m,
                        offer_status: 'canceled',
                        metadata: {
                          ...m.metadata,
                          bundle_invalid: true,
                        },
                      }
                    : m,
                ),
              );
            }
          })
          .catch(() => {});
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  // ── Push Notification Permission Soft-Ask ────────────────────────────────
  useEffect(() => {
    if (!user?.id || !conversationId) return;
    maybeSoftAskForPush(user.id).catch(() => {});
  }, [user?.id, conversationId]);

  // ── Realtime Messages Subscription ───────────────────────────────────────
  useEffect(() => {
    if (!conversationId) return;
    const unsub = subscribeToMessages(conversationId, (event) => {
      setMessages((prev) => {
        if (event.type === 'insert') {
          if (prev.some((m) => m.id === event.message.id)) return prev;
          return [...prev, event.message];
        }
        if (event.type === 'delete') {
          return prev.filter((m) => m.id !== event.messageId);
        }
        return prev.map((m) => (m.id === event.message.id ? { ...m, ...event.message } : m));
      });
    });
    return unsub;
  }, [conversationId]);

  // ── Read Receipts Synchronization ────────────────────────────────────────
  useEffect(() => {
    if (!conversationId || !user?.id) return;
    markConversationRead(conversationId, user.id)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: qk.inbox(user.id) });
      })
      .catch((error) => {
        console.warn('[chat] markConversationRead error', error);
      });
  }, [conversationId, user?.id, messages.length, queryClient]);

  // ── Realtime Reactions Subscription ──────────────────────────────────────
  useEffect(() => {
    if (!conversationId) return;
    return subscribeToReactions(conversationId, (event) => {
      setReactions((prev) => {
        if (event.type === 'cleared') {
          return prev.filter(
            (r) => !(r.message_id === event.messageId && r.user_id === event.userId),
          );
        }
        const { message_id, user_id, emoji } = event.reaction;
        const rest = prev.filter((r) => !(r.message_id === message_id && r.user_id === user_id));
        return [...rest, { message_id, user_id, emoji }];
      });
    });
  }, [conversationId]);

  // ── Scroll & Pin to Bottom Handlers ──────────────────────────────────────
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    if (layoutMeasurement.height <= 0) return;
    const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    pinnedRef.current = distanceFromBottom < 80;
  }, []);

  // FlatList.scrollToEnd targets its own estimate of the content length, which
  // lags a just-appended (not yet measured) message, so a send landed one bubble
  // short. The underlying ScrollView scrolls to the real, already-laid-out end.
  const scrollListToEnd = useCallback((animated: boolean) => {
    const list = listRef.current as any;
    (list?.getNativeScrollRef?.() ?? list)?.scrollToEnd?.({ animated });
  }, []);

  const followEnd = useCallback((force: boolean = false, animated: boolean = false) => {
    if (force || pinnedRef.current) scrollListToEnd(animated);
  }, [scrollListToEnd]);

  const scrollToBottom = useCallback((animated: boolean = false) => {
    pinnedRef.current = true;
    scrollListToEnd(animated);
  }, [scrollListToEnd]);

  // ── Derived Participant & Listing State ──────────────────────────────────
  const isSupport = useMemo(() => isSupportConversation(conv), [conv]);
  const currentUserId = user?.id || (conversationId.startsWith('demo') ? (conversationId === 'demo-deal' ? 'demo-buyer' : 'demo-seller') : null);
  const other = useMemo(() => {
    if (!conv) return null;
    if (currentUserId) return otherParticipant(conv, currentUserId);
    return conv.buyer || null;
  }, [currentUserId, conv]);
  const isSeller = Boolean(currentUserId && conv && conv.seller_id === currentUserId);
  const rows = useMemo(() => buildThreadRows(messages), [messages]);

  const convListingId = conv?.listing_id ?? null;
  const convListingPrice = conv?.listing?.price ?? null;
  const convListingSold = conv?.listing?.is_sold ?? false;
  const status = conv?.listing ? listingStatus(conv.listing) : null;
  const canOffer = !isSeller && !!conv?.listing_id && status === 'active';

  const senderName = isSupport
    ? SUPPORT_BOT_NAME
    : other?.full_name || other?.username || (conv?.buyer ? conv.buyer.full_name || conv.buyer.username : null) || 'User';
  const otherAvatar = isSupport
    ? SUPPORT_BOT_AVATAR
    : other?.avatar_url
    ? getOptimizedImageUrl(other.avatar_url, { width: 120 })
    : null;
  const listingThumb = conv?.listing
    ? getOptimizedImageUrl(cardImageUrl(conv.listing, 0), { width: 120 })
    : null;

  // ── Reaction Mapping ─────────────────────────────────────────────────────
  const byMessage = useMemo(() => {
    const map = new Map<string, string[]>();
    reactions.forEach((r) => {
      const list = map.get(r.message_id);
      if (list) list.push(r.emoji);
      else map.set(r.message_id, [r.emoji]);
    });
    return map;
  }, [reactions]);

  const myReactionOn = useCallback(
    (messageId: string) =>
      reactions.find((r) => r.message_id === messageId && r.user_id === user?.id)?.emoji ?? null,
    [reactions, user?.id],
  );

  const handleReact = useCallback(
    async (msgId: string, emoji: string) => {
      if (!user) return;
      const current = myReactionOn(msgId);
      const removing = current === emoji;

      setReactions((prev) => {
        const rest = prev.filter((r) => !(r.message_id === msgId && r.user_id === user.id));
        return removing ? rest : [...rest, { message_id: msgId, user_id: user.id, emoji }];
      });

      const ok = await setReaction({
        messageId: msgId,
        userId: user.id,
        emoji: removing ? null : emoji,
      });
      if (!ok) {
        setReactions(await fetchReactions(conversationId));
        toast.show("Couldn't save reaction", { variant: 'default', icon: 'alert-triangle' });
      }
    },
    [conversationId, myReactionOn, toast, user],
  );

  // ── Outgoing Messages Delivery ───────────────────────────────────────────
  const deliver = useCallback(
    async (text: string, tempId: string) => {
      if (!user || !conversationId) return;

      if (canceledTempIdsRef.current.has(tempId)) {
        canceledTempIdsRef.current.delete(tempId);
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        return;
      }

      const deliverPromise = (async (): Promise<ChatMessage | null> => {
        let saved: ChatMessage | null = null;
        let failure: unknown = null;
        try {
          saved = await sendMessage({ conversationId, senderId: user.id, content: text });
        } catch (e) {
          failure = e;
        }

        if (canceledTempIdsRef.current.has(tempId)) {
          setMessages((prev) => prev.filter((m) => m.id !== tempId && (!saved || m.id !== saved.id)));
          return saved;
        }

        const delivered = saved;
        if (delivered) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === delivered.id)) return prev.filter((m) => m.id !== tempId);
            return prev.map((m) => (m.id === tempId ? delivered : m));
          });

          // Trigger intelligent support concierge automated response ONLY on initial general inquiries
          // (Disputes and active admin threads are personally handled by the administration team)
          if (isSupport) {
            const hasDispute = messagesRef.current.some((m) => (m.content || '').toLowerCase().includes('dispute'));
            const isInitialInquiry = messagesRef.current.length <= 2;

            if (!hasDispute && isInitialInquiry) {
              let botReply: ChatMessage | null = null;
              try {
                botReply = await sendSupportBotReply(conversationId, text);
              } catch (err) {
                console.warn('[conversation] support bot reply error', err);
              }

              if (botReply) {
                setMessages((prev) => {
                  if (prev.some((m) => m.id === botReply!.id)) return prev;
                  return [...prev, botReply!];
                });
              }
            }
          }
          return delivered;
        }

        console.warn('[conversation] send failed', failure ?? 'insert returned no row');
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)),
        );
        return null;
      })();

      activeDeliveriesRef.current.set(tempId, deliverPromise);
      try {
        await deliverPromise;
      } finally {
        activeDeliveriesRef.current.delete(tempId);
      }
    },
    [conversationId, isSupport, toast, user],
  );

  const handleSend = useCallback(() => {
    if (!user || !conversationId) return;
    const text = input.trim();
    if (!text) return;
    const temp: ChatMessage = {
      id: `temp-${Date.now()}`,
      conversation_id: conversationId,
      sender_id: user.id,
      content: text,
      kind: 'text',
      metadata: null,
      offer_status: null,
      created_at: new Date().toISOString(),
      pending: true,
    };
    pinnedRef.current = true;
    setMessages((prev) => [...prev, temp]);
    setInput('');
    deliver(text, temp.id);
  }, [conversationId, deliver, input, user]);

  const addOptimisticMessage = useCallback((msg: ChatMessage) => {
    pinnedRef.current = true;
    setMessages((prev) => [...prev, msg]);
  }, []);

  const handleSendImage = useCallback(
    async (imageUrl: string, tempId?: string) => {
      if (!user || !conversationId) return;
      const tId = tempId || `temp-${Date.now()}`;

      if (canceledTempIdsRef.current.has(tId)) {
        canceledTempIdsRef.current.delete(tId);
        if (imageUrl && imageUrl.includes('/listing-images/')) {
          deleteListingImages([imageUrl]).catch((err) =>
            console.warn('[chat] deleteListingImages cleanup error', err),
          );
        }
        setMessages((prev) => prev.filter((m) => m.id !== tId));
        return;
      }

      if (!tempId) {
        const temp: ChatMessage = {
          id: tId,
          conversation_id: conversationId,
          sender_id: user.id,
          content: imageUrl,
          kind: 'text',
          metadata: { image_url: imageUrl },
          offer_status: null,
          created_at: new Date().toISOString(),
          pending: true,
        };
        pinnedRef.current = true;
        setMessages((prev) => [...prev, temp]);
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tId
              ? { ...m, content: imageUrl, metadata: { ...m.metadata, image_url: imageUrl } }
              : m,
          ),
        );
      }

      const sendPromise = (async (): Promise<ChatMessage | null> => {
        let saved: ChatMessage | null = null;
        let failure: unknown = null;
        try {
          saved = await sendMessage({
            conversationId,
            senderId: user.id,
            content: imageUrl,
            metadata: { image_url: imageUrl },
          });
        } catch (e) {
          failure = e;
        }

        if (canceledTempIdsRef.current.has(tId)) {
          setMessages((prev) => prev.filter((m) => m.id !== tId && (!saved || m.id !== saved.id)));
          return saved;
        }

        if (saved) {
          const delivered = saved;
          setMessages((prev) => {
            if (prev.some((m) => m.id === delivered.id)) return prev.filter((m) => m.id !== tId);
            return prev.map((m) => (m.id === tId ? delivered : m));
          });
          return delivered;
        }

        console.warn('[conversation] send image failed', failure ?? 'insert returned no row');
        setMessages((prev) =>
          prev.map((m) => (m.id === tId ? { ...m, pending: false, failed: true } : m)),
        );
        return null;
      })();

      activeDeliveriesRef.current.set(tId, sendPromise);
      try {
        await sendPromise;
      } finally {
        activeDeliveriesRef.current.delete(tId);
      }
    },
    [conversationId, user],
  );

  const handleRetry = useCallback(
    (msg: ChatMessage) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, pending: true, failed: false } : m)),
      );
      if (isImageMessage(msg)) {
        handleSendImage(getMessageImageUrl(msg) || msg.content, msg.id);
      } else {
        deliver(msg.content, msg.id);
      }
    },
    [deliver, handleSendImage],
  );

  // ── Offer Workflows ──────────────────────────────────────────────────────
  const handleSendOffer = useCallback(
    async (amount: number, note: string) => {
      if (!user || !conversationId) return false;
      try {
        const saved = await sendOffer({ conversationId, senderId: user.id, amount, note });
        if (saved) {
          pinnedRef.current = true;
          setMessages((prev) => (prev.some((m) => m.id === saved.id) ? prev : [...prev, saved]));
          toast.show('Offer sent', { variant: 'success', icon: 'check' });
          capture('offer_made', { listing_id: convListingId, amount });
          return true;
        } else {
          Alert.alert('Could not send offer', 'Please try again.');
          return false;
        }
      } catch (e: any) {
        captureError(e, { fn: 'conversation.sendOffer' });
        toast.show("Couldn't send offer", { variant: 'default', icon: 'alert-triangle' });
        return false;
      }
    },
    [conversationId, user, toast, convListingId],
  );

  const handleOfferResponse = useCallback(
    async (msg: ChatMessage, offerStatus: 'accepted' | 'declined') => {
      const prev = msg.offer_status ?? 'pending';
      setMessages((m) => m.map((x) => (x.id === msg.id ? { ...x, offer_status: offerStatus } : x)));

      try {
        if (offerStatus === 'accepted') {
          await acceptChatOffer(msg.id);
          if (convListingId) {
            queryClient.invalidateQueries({ queryKey: qk.listing(convListingId) });
          }
          if (user?.id) {
            queryClient.invalidateQueries({ queryKey: qk.inbox(user.id) });
          }
          toast.show('Offer accepted! Buyer can now complete purchase.', {
            variant: 'success',
            icon: 'check',
          });
        } else {
          const ok = await updateOfferStatus(msg.id, 'declined');
          if (!ok) throw new Error('Could not decline offer');
          toast.show('Offer declined', {
            variant: 'info',
            icon: 'x',
          });
        }
      } catch (err: any) {
        setMessages((m) => m.map((x) => (x.id === msg.id ? { ...x, offer_status: prev } : x)));
        Alert.alert('Could not update offer', err.message || 'Please try again.');
      }
    },
    [convListingId, queryClient, toast, user?.id],
  );

  const handleCounterOffer = useCallback(
    async (parentMsg: ChatMessage, amount: number, note?: string) => {
      if (!user || !conversationId) return false;
      try {
        const saved = await counterOffer({
          conversationId,
          senderId: user.id,
          parentOfferId: parentMsg.id,
          amount,
          note,
        });
        if (saved) {
          pinnedRef.current = true;
          setMessages((prev) => [
            ...prev.map((m) => (m.id === parentMsg.id ? { ...m, offer_status: 'countered' as const } : m)),
            saved,
          ]);
          toast.show('Counter-offer sent', { variant: 'success', icon: 'check' });
          return true;
        }
        return false;
      } catch (e: any) {
        captureError(e, { fn: 'conversation.counterOffer' });
        toast.show(e?.message || "Couldn't send counter-offer", { variant: 'default', icon: 'alert-triangle' });
        return false;
      }
    },
    [conversationId, toast, user],
  );

  // ── Message Deletion ───────────────────────────────────────────────────
  const handleDeleteMessage = useCallback(
    async (messageId: string): Promise<boolean> => {
      if (!user || !conversationId) return false;

      const targetIndex = messagesRef.current.findIndex((m) => m.id === messageId);
      const targetMsg = targetIndex !== -1 ? messagesRef.current[targetIndex] : null;

      if (!targetMsg && !activeDeliveriesRef.current.has(messageId)) {
        return false;
      }

      // 1. Failed messages: preserve immediate local removal, but clean up referenced uploaded photo
      if (targetMsg?.failed) {
        await cleanupMessageImage(targetMsg);
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
        return true;
      }

      // 2. Pending messages with active delivery:
      // Track canceled temporary ID, defer deletion until delivery finishes,
      // and do not report as successfully deleted while delivery is active.
      const activeDelivery = activeDeliveriesRef.current.get(messageId);
      if (activeDelivery) {
        canceledTempIdsRef.current.add(messageId);
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
        const saved = await activeDelivery;
        canceledTempIdsRef.current.delete(messageId);
        if (saved) {
          try {
            const ok = await deleteMessage({
              conversationId,
              messageId: saved.id,
              userId: user.id,
            });
            await cleanupMessageImage(saved);
            return ok;
          } catch (err) {
            console.warn('[chat] deleteMessage for deferred temp message failed', err);
            return false;
          }
        }
        return true;
      }

      // 3. Temporary or pending messages not currently active in delivery pipeline
      if (messageId.startsWith('temp-') || targetMsg?.pending) {
        canceledTempIdsRef.current.add(messageId);
        if (targetMsg) {
          await cleanupMessageImage(targetMsg);
        }
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
        return true;
      }

      // 4. Persisted messages: optimistically remove, delete on server, rollback on failure
      setMessages((prev) => prev.filter((m) => m.id !== messageId));

      const rollback = () => {
        setMessages((current) => {
          if (!targetMsg || current.some((m) => m.id === targetMsg.id)) return current;
          const next = [...current];
          const insertIdx = Math.min(Math.max(0, targetIndex), next.length);
          next.splice(insertIdx, 0, targetMsg);
          return next;
        });
      };

      try {
        const ok = await deleteMessage({
          conversationId,
          messageId,
          userId: user.id,
        });

        if (!ok) {
          rollback();
          return false;
        }

        if (targetMsg) {
          await cleanupMessageImage(targetMsg);
        }

        return true;
      } catch (err) {
        console.warn('[chat] handleDeleteMessage error', err);
        rollback();
        return false;
      }
    },
    [conversationId, user],
  );

  // ── Reporting ────────────────────────────────────────────────────────────
  const handleReport = useCallback(
    async (reason: string) => {
      if (!user || !convListingId) return;
      const ok = await reportListing({
        listingId: convListingId,
        reporterId: user.id,
        reason,
        reportedUserId: other?.id ?? null,
      });
      toast.show(ok ? 'Report sent — thank you' : "Couldn't send report", {
        variant: ok ? 'success' : 'default',
        icon: ok ? 'check' : 'alert-triangle',
      });
    },
    [convListingId, other?.id, toast, user],
  );

  return {
    conv,
    messages,
    reactions,
    loading,
    input,
    setInput,
    listRef,
    pinnedRef,
    onScroll,
    followEnd,
    scrollToBottom,
    other,
    isSeller,
    rows,
    convListingId,
    convListingPrice,
    convListingSold,
    status,
    canOffer,
    senderName,
    otherAvatar,
    listingThumb,
    byMessage,
    myReactionOn,
    handleReact,
    handleSend,
    handleSendImage,
    addOptimisticMessage,
    handleRetry,
    handleDeleteMessage,
    handleSendOffer,
    handleCounterOffer,
    handleOfferResponse,
    handleReport,
  };
}
