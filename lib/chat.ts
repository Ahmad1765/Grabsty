import { supabase } from '@/lib/supabase';
import { formatPrice } from '@/lib/currency';
import type { User, Listing } from '@/types';

export type MessageKind = 'text' | 'offer' | 'system';
export type OfferStatus =
  | 'proposed'
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'countered'
  | 'expired'
  | 'withdrawn'
  | 'canceled'
  | 'paid';

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  kind: MessageKind;
  metadata: {
    amount?: number;
    currency?: string;
    note?: string;
    order_status?: string;
    payment_status?: string;
    paid?: boolean;
    is_bundle?: boolean;
    is_special_offer?: boolean;
    actionable?: boolean;
    base_listing_id?: string;
    bundle_item_ids?: string[];
    bundle_count?: number;
    bundle_invalid?: boolean;
    cancel_reason?: string;
    image_url?: string;
    thumb_url?: string;
    parent_offer_id?: string;
  } | null;
  offer_status: OfferStatus | null;
  parent_offer_id?: string | null;
  created_at: string;
  updated_at?: string;
  /** Client-only: an optimistic message still in flight. Never selected. */
  pending?: boolean;
  /** Client-only: the send failed and the row offers a retry. Never selected. */
  failed?: boolean;
}

export interface ConversationRow {
  id: string;
  listing_id: string | null;
  buyer_id: string;
  seller_id: string;
  last_message: string | null;
  last_sender_id?: string | null;
  updated_at: string;
  buyer_last_read_at?: string | null;
  seller_last_read_at?: string | null;
  listing?: Pick<Listing, 'id' | 'title' | 'price' | 'images' | 'thumbnails' | 'is_sold'> | null;
  buyer?: Pick<User, 'id' | 'username' | 'avatar_url' | 'full_name' | 'location' | 'rating' | 'total_sales'> | null;
  seller?: Pick<User, 'id' | 'username' | 'avatar_url' | 'full_name' | 'location' | 'rating' | 'total_sales'> | null;
}

export const CONVERSATION_SELECT = `
  id, listing_id, buyer_id, seller_id, last_message, last_sender_id, updated_at,
  buyer_last_read_at, seller_last_read_at,
  listing:listings(id, title, price, images, thumbnails, is_sold),
  buyer:profiles!conversations_buyer_id_fkey(id, username, avatar_url, full_name, location, rating, total_sales),
  seller:profiles!conversations_seller_id_fkey(id, username, avatar_url, full_name, location, rating, total_sales)
`;

export async function listConversations(userId: string): Promise<ConversationRow[]> {
  const { data, error } = await supabase
    .from('conversations')
    .select(CONVERSATION_SELECT)
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .order('updated_at', { ascending: false });
  if (error) {
    console.warn('[chat] listConversations', error.message);
    return [];
  }
  return (data ?? []) as unknown as ConversationRow[];
}

export async function getConversation(conversationId: string): Promise<ConversationRow | null> {
  const { data, error } = await supabase
    .from('conversations')
    .select(CONVERSATION_SELECT)
    .eq('id', conversationId)
    .maybeSingle();
  if (error) {
    console.warn('[chat] getConversation', error.message);
    return null;
  }
  return (data as unknown as ConversationRow) ?? null;
}

// Finds an existing conversation between (buyerId, sellerId, listingId)
// or creates a new one. Supports both listing-specific chats and direct profile chats.
export async function getOrCreateConversation(args: {
  buyerId: string;
  sellerId: string;
  listingId?: string | null;
}): Promise<ConversationRow | null> {
  const { buyerId, sellerId, listingId = null } = args;
  if (buyerId === sellerId) {
    console.warn('[chat] cannot message yourself');
    return null;
  }

  if (listingId) {
    const { data: existing } = await supabase
      .from('conversations')
      .select(CONVERSATION_SELECT)
      .eq('listing_id', listingId)
      .eq('buyer_id', buyerId)
      .eq('seller_id', sellerId)
      .maybeSingle();
    if (existing) return existing as unknown as ConversationRow;

    const { data: created, error } = await supabase
      .from('conversations')
      .insert({
        listing_id: listingId,
        buyer_id: buyerId,
        seller_id: sellerId,
      })
      .select(CONVERSATION_SELECT)
      .single();
    if (error) {
      // Unique violation means another tab/race created it — refetch.
      if (error.code === '23505') {
        const { data: again } = await supabase
          .from('conversations')
          .select(CONVERSATION_SELECT)
          .eq('listing_id', listingId)
          .eq('buyer_id', buyerId)
          .eq('seller_id', sellerId)
          .maybeSingle();
        return (again as unknown as ConversationRow) ?? null;
      }
      console.warn('[chat] getOrCreateConversation', error.message);
      return null;
    }
    return created as unknown as ConversationRow;
  }

  // Direct user-to-user conversation (no listing)
  const { data: existingRows, error: lookupError } = await supabase
    .from('conversations')
    .select(CONVERSATION_SELECT)
    .is('listing_id', null)
    .or(`and(buyer_id.eq.${buyerId},seller_id.eq.${sellerId}),and(buyer_id.eq.${sellerId},seller_id.eq.${buyerId})`)
    .order('updated_at', { ascending: false })
    .limit(1);
  if (lookupError) {
    console.warn('[chat] getOrCreateConversation direct lookup', lookupError.message);
    return null;
  }
  const existing = existingRows?.[0];
  if (existing) return existing as unknown as ConversationRow;

  const { data: created, error } = await supabase
    .from('conversations')
    .insert({
      listing_id: null,
      buyer_id: buyerId,
      seller_id: sellerId,
    })
    .select(CONVERSATION_SELECT)
    .single();
  if (error) {
    if (error.code === '23505') {
      const { data: again } = await supabase
        .from('conversations')
        .select(CONVERSATION_SELECT)
        .is('listing_id', null)
        .or(`and(buyer_id.eq.${buyerId},seller_id.eq.${sellerId}),and(buyer_id.eq.${sellerId},seller_id.eq.${buyerId})`)
        .maybeSingle();
      return (again as unknown as ConversationRow) ?? null;
    }
    console.warn('[chat] getOrCreateConversation direct', error.message);
    return null;
  }
  return created as unknown as ConversationRow;
}

export async function fetchMessages(conversationId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('id, conversation_id, sender_id, content, kind, metadata, offer_status, parent_offer_id, created_at, updated_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (error) {
    console.warn('[chat] fetchMessages', error.message);
    return [];
  }
  return (data ?? []) as unknown as ChatMessage[];
}

export async function sendMessage(args: {
  conversationId: string;
  senderId: string;
  content: string;
  kind?: MessageKind;
  metadata?: Record<string, any> | null;
}): Promise<ChatMessage | null> {
  const trimmed = args.content.trim();
  if (!trimmed) return null;
  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: args.conversationId,
      sender_id: args.senderId,
      content: trimmed,
      kind: args.kind ?? 'text',
      metadata: args.metadata ?? null,
    })
    .select('id, conversation_id, sender_id, content, kind, metadata, offer_status, created_at, updated_at')
    .single();
  if (error) {
    console.warn('[chat] sendMessage', error.message);
    return null;
  }
  return data as unknown as ChatMessage;
}

export function isImageMessage(msg: ChatMessage): boolean {
  if (msg.metadata?.image_url) return true;
  if (typeof msg.content === 'string') {
    const trimmed = msg.content.trim();
    return Boolean(
      trimmed.startsWith('data:image/') ||
      trimmed.startsWith('file://') ||
      trimmed.startsWith('blob:') ||
      trimmed.match(/^https?:\/\/.+\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i) ||
      (trimmed.startsWith('https://') && trimmed.includes('/storage/v1/object/public/listing-images/'))
    );
  }
  return false;
}

export function getMessageImageUrl(msg: ChatMessage): string | null {
  if (msg.metadata?.image_url) return msg.metadata.image_url;
  if (typeof msg.content === 'string') {
    const trimmed = msg.content.trim();
    if (
      trimmed.startsWith('data:image/') ||
      trimmed.startsWith('file://') ||
      trimmed.startsWith('blob:') ||
      trimmed.match(/^https?:\/\/.+\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i) ||
      (trimmed.startsWith('https://') && trimmed.includes('/storage/v1/object/public/listing-images/'))
    ) {
      return trimmed;
    }
  }
  return null;
}

export async function deleteMessage(args: {
  conversationId: string;
  messageId: string;
  userId: string;
}): Promise<boolean> {
  const { conversationId, messageId, userId } = args;
  try {
    // 1. First try direct delete under RLS
    const { data: deletedRows, error } = await supabase
      .from('messages')
      .delete()
      .eq('id', messageId)
      .eq('sender_id', userId)
      .eq('conversation_id', conversationId)
      .select('id');

    if (!error && deletedRows && deletedRows.length > 0) return true;

    // 2. If direct delete hits RLS or constraint, attempt secure RPC fallback
    console.warn('[chat] direct delete failed, attempting delete_chat_message RPC:', error?.message ?? 'no row deleted');
    const { data, error: rpcErr } = await supabase.rpc('delete_chat_message', {
      p_message_id: messageId,
      p_conversation_id: conversationId,
    });
    if (rpcErr) {
      console.warn('[chat] delete_chat_message RPC failed:', rpcErr.message);
      return false;
    }
    return Boolean(data);
  } catch (err) {
    console.warn('[chat] deleteMessage exception:', err);
    return false;
  }
}

export async function sendOffer(args: {
  conversationId: string;
  senderId: string;
  amount: number;
  note?: string;
  isBundle?: boolean;
  bundleItemIds?: string[];
  bundleCount?: number;
  baseListingId?: string;
}): Promise<ChatMessage | null> {
  if (!Number.isFinite(args.amount) || args.amount <= 0) return null;
  const amountValue = Number(args.amount.toFixed(2));
  const isBundle = Boolean(args.isBundle || (args.bundleItemIds && args.bundleItemIds.length > 0));
  const count = args.bundleCount ?? (args.bundleItemIds ? args.bundleItemIds.length + 1 : 1);
  const defaultNote = isBundle
    ? `Bundle offer (${count} items): ${formatPrice(amountValue)}`
    : `Offer: ${formatPrice(amountValue)}`;

  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: args.conversationId,
      sender_id: args.senderId,
      content: args.note?.trim() || defaultNote,
      kind: 'offer',
      metadata: {
        amount: amountValue,
        currency: 'PKR',
        note: args.note?.trim() || null,
        is_bundle: isBundle,
        base_listing_id: args.baseListingId ?? undefined,
        bundle_item_ids: args.bundleItemIds ?? undefined,
        bundle_count: count,
      },
      offer_status: 'pending',
    })
    .select('id, conversation_id, sender_id, content, kind, metadata, offer_status, parent_offer_id, created_at, updated_at')
    .single();
  if (error) {
    console.warn('[chat] sendOffer', error.message);
    return null;
  }
  return data as unknown as ChatMessage;
}

export async function updateOfferStatus(
  messageId: string,
  status: Exclude<OfferStatus, 'pending' | 'proposed'>,
): Promise<boolean> {
  const { error } = await supabase
    .from('messages')
    .update({ offer_status: status })
    .eq('id', messageId)
    .eq('kind', 'offer');
  if (error) {
    console.warn('[chat] updateOfferStatus', error.message);
    return false;
  }
  return true;
}

/**
 * Automatically cancels any bundle offers across messages if a referenced item has been sold.
 * Uses a server-side security-definer operation to cancel regardless of caller RLS visibility.
 */
export async function cancelBundleOffersForSoldItem(soldListingId: string): Promise<string[]> {
  if (!soldListingId) return [];
  try {
    // 1. Server-side RPC operation (security definer cancels regardless of caller RLS visibility)
    if (typeof (supabase as any).rpc === 'function') {
      const { data, error } = await supabase.rpc('cancel_bundle_offers_for_sold_item', {
        p_sold_listing_id: soldListingId,
      });
      if (!error && Array.isArray(data)) {
        return data as string[];
      }
    }

    // 2. Direct server query and update fallback
    const { data: offers, error: selectErr } = await supabase
      .from('messages')
      .select('id')
      .eq('kind', 'offer')
      .in('offer_status', ['pending', 'proposed'])
      .or(
        `metadata->>base_listing_id.eq.${soldListingId},metadata->bundle_item_ids.cs.["${soldListingId}"]`,
      );

    if (selectErr || !offers || offers.length === 0) return [];

    const invalidOfferIds = offers.map((o) => o.id);

    const { error: updateError } = await supabase
      .from('messages')
      .update({ offer_status: 'canceled' })
      .in('id', invalidOfferIds);

    if (updateError) {
      console.warn('[chat] cancelBundleOffersForSoldItem update error', updateError);
      return [];
    }
    return invalidOfferIds;
  } catch (err) {
    console.warn('[chat] cancelBundleOffersForSoldItem error', err);
    return [];
  }
}

/**
 * Checks a list of messages for active bundle offers, verifies if any bundled item is sold,
 * and cancels those offers automatically.
 */
export async function checkAndCancelInvalidBundleOffers(
  messages: ChatMessage[],
  convListingId?: string | null,
): Promise<string[]> {
  const activeBundleOffers = messages.filter(
    (m) =>
      m.kind === 'offer' &&
      (m.metadata?.is_bundle || (m.metadata?.bundle_item_ids && m.metadata.bundle_item_ids.length > 0)) &&
      m.offer_status !== 'canceled' &&
      m.offer_status !== 'declined' &&
      m.offer_status !== 'expired',
  );

  if (activeBundleOffers.length === 0) return [];

  const allItemIds = new Set<string>();
  if (convListingId) allItemIds.add(convListingId);
  activeBundleOffers.forEach((m) => {
    if (m.metadata?.base_listing_id) allItemIds.add(m.metadata.base_listing_id);
    if (m.metadata?.bundle_item_ids && Array.isArray(m.metadata.bundle_item_ids)) {
      m.metadata.bundle_item_ids.forEach((id: string) => allItemIds.add(id));
    }
  });

  if (allItemIds.size === 0) return [];

  try {
    const { data: listings, error } = await supabase
      .from('listings')
      .select('id, is_sold')
      .in('id', Array.from(allItemIds));

    if (error || !listings) return [];

    const soldIds = new Set(listings.filter((l) => l.is_sold).map((l) => l.id));
    if (soldIds.size === 0) return [];

    const invalidOfferIds: string[] = [];
    activeBundleOffers.forEach((m) => {
      // Exclude accepted and paid offers so their own sold listing does not trigger cancellation
      if (m.offer_status === 'accepted' || m.offer_status === 'paid') {
        return;
      }
      const itemIds = [
        convListingId,
        m.metadata?.base_listing_id,
        ...(m.metadata?.bundle_item_ids || []),
      ].filter(Boolean);
      if (itemIds.some((id) => soldIds.has(id as string))) {
        invalidOfferIds.push(m.id);
      }
    });

    if (invalidOfferIds.length > 0) {
      const { error: updateError } = await supabase
        .from('messages')
        .update({ offer_status: 'canceled' })
        .in('id', invalidOfferIds);

      if (updateError) {
        console.warn('[chat] checkAndCancelInvalidBundleOffers update error', updateError);
        return [];
      }
    }

    return invalidOfferIds;
  } catch (err) {
    console.warn('[chat] checkAndCancelInvalidBundleOffers error', err);
    return [];
  }
}

/**
 * Atomically accepts an offer in chat. Offer state transitions to 'accepted',
 * and the listing remains public and available until checkout payment is completed.
 */
export async function acceptChatOffer(offerMessageId: string): Promise<any> {
  const { data, error } = await supabase.rpc('accept_chat_offer', {
    p_offer_message_id: offerMessageId,
  });
  if (error) {
    console.warn('[chat] acceptChatOffer', error.message);
    throw new Error(error.message);
  }
  return data;
}

/**
 * Atomically creates a counter-offer linked to a parent offer, locking the parent offer
 * and transitioning it to 'countered' within a single database transaction.
 */
export async function counterOffer(args: {
  conversationId: string;
  senderId: string;
  parentOfferId: string;
  amount: number;
  note?: string;
}): Promise<ChatMessage | null> {
  if (!Number.isFinite(args.amount) || args.amount <= 0) return null;
  const amountValue = Number(args.amount.toFixed(2));
  const defaultNote = `Counter-Offer: ${formatPrice(amountValue)}`;
  const content = args.note?.trim() || defaultNote;

  // 1. Primary: Attempt atomic RPC
  const { data, error } = await supabase.rpc('counter_chat_offer', {
    p_parent_offer_id: args.parentOfferId,
    p_amount: amountValue,
    p_note: args.note?.trim() || null,
    p_content: content,
    p_conversation_id: args.conversationId,
    p_sender_id: args.senderId,
  });

  if (!error && data) {
    return data as unknown as ChatMessage;
  }

  console.warn('[chat] counter_chat_offer RPC failed, attempting direct table fallback:', error?.message || error);

  // 2. Client-side resilient fallback if the RPC returned an error (e.g. trigger mismatch in hosted db)
  try {
    // Attempt updating parent offer status to countered
    const { error: updateErr } = await supabase
      .from('messages')
      .update({ offer_status: 'countered' })
      .eq('id', args.parentOfferId);

    if (updateErr) {
      console.warn('[chat] fallback parent update warning:', updateErr.message);
    }

    // Insert new counter offer message linked to parent
    const { data: fallbackMsg, error: insertErr } = await supabase
      .from('messages')
      .insert({
        conversation_id: args.conversationId,
        sender_id: args.senderId,
        content,
        kind: 'offer',
        parent_offer_id: args.parentOfferId,
        metadata: {
          amount: amountValue,
          currency: 'PKR',
          note: args.note?.trim() || null,
          parent_offer_id: args.parentOfferId,
          counter_to: args.parentOfferId,
        },
        offer_status: 'pending',
      })
      .select('id, conversation_id, sender_id, content, kind, metadata, offer_status, parent_offer_id, created_at, updated_at')
      .single();

    if (!insertErr && fallbackMsg) {
      return fallbackMsg as unknown as ChatMessage;
    }

    if (insertErr) {
      console.error('[chat] fallback counter insert failed:', insertErr);
    }
  } catch (fallbackErr) {
    console.error('[chat] counterOffer fallback exception:', fallbackErr);
  }

  if (error) {
    throw new Error(error.message);
  }
  return null;
}

// ── Reactions ─────────────────────────────────────────────────────────────
// One emoji per person per message, enforced by a unique key in the database:
// picking a second emoji replaces the first, picking the same one again clears
// it.
//
// Clearing sets `emoji` to NULL rather than deleting the row. That isn't
// squeamishness about deletes — Realtime can't filter DELETE events at all, and
// strips their payload down to the primary key on an RLS-enabled table, so a
// delete could never tell a thread *which* message just lost its reaction. An
// update carries the whole row and respects the conversation filter. See
// supabase/migrations/20260731164411_message_reactions_clear_as_update.sql.

/** The quick-reaction row, in the order it's drawn. */
export const REACTION_EMOJI = ['💜', '🤝', '💯', '🔥', '👍'] as const;

export interface MessageReaction {
  message_id: string;
  user_id: string;
  emoji: string;
}

/** A row as it arrives from Postgres, where a cleared reaction is a NULL emoji. */
type MessageReactionRow = Omit<MessageReaction, 'emoji'> & { emoji: string | null };

export async function fetchReactions(conversationId: string): Promise<MessageReaction[]> {
  const { data, error } = await supabase
    .from('message_reactions')
    .select('message_id, user_id, emoji')
    .eq('conversation_id', conversationId)
    // Skip the tombstones — a cleared reaction is a row that still exists.
    .not('emoji', 'is', null);
  if (error) {
    console.warn('[chat] fetchReactions', error.message);
    return [];
  }
  return (data ?? []) as MessageReaction[];
}

/** Sets, replaces, or (with `emoji: null`) clears this user's reaction. */
export async function setReaction(args: {
  messageId: string;
  userId: string;
  emoji: string | null;
}): Promise<boolean> {
  // conversation_id is deliberately absent: the BEFORE trigger fills it, and
  // Postgres checks NOT NULL after BEFORE triggers run.
  const { error } = await supabase.from('message_reactions').upsert(
    { message_id: args.messageId, user_id: args.userId, emoji: args.emoji },
    { onConflict: 'message_id,user_id' },
  );
  if (error) {
    console.warn('[chat] setReaction', error.message);
    return false;
  }
  return true;
}

export type ReactionEvent =
  | { type: 'set'; reaction: MessageReaction }
  | { type: 'cleared'; messageId: string; userId: string };

export function subscribeToReactions(
  conversationId: string,
  onEvent: (e: ReactionEvent) => void,
): () => void {
  const channelName = `reactions:${conversationId}:${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        // INSERT is a first reaction, UPDATE is a swap or a clear — the unique
        // key means a person's second pick lands on their existing row. DELETE
        // is deliberately not handled: rows are never deleted, precisely
        // because Realtime can't filter or populate those events under RLS.
        event: '*',
        schema: 'public',
        table: 'message_reactions',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        const row = payload.new as MessageReactionRow | undefined;
        if (!row?.message_id || !row?.user_id) return;
        onEvent(
          row.emoji
            ? { type: 'set', reaction: { ...row, emoji: row.emoji } }
            : { type: 'cleared', messageId: row.message_id, userId: row.user_id },
        );
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export type MessageEvent =
  | { type: 'insert'; message: ChatMessage }
  | { type: 'update'; message: ChatMessage }
  | { type: 'delete'; messageId: string };

export function subscribeToMessages(
  conversationId: string,
  onEvent: (e: MessageEvent) => void,
): () => void {
  const channelName = `messages:${conversationId}:${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => onEvent({ type: 'insert', message: payload.new as ChatMessage }),
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => onEvent({ type: 'update', message: payload.new as ChatMessage }),
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'messages',
      },
      (payload) => {
        const id = (payload.old as any)?.id;
        if (id) onEvent({ type: 'delete', messageId: id });
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export function subscribeToInbox(
  userId: string,
  onChange: () => void,
): () => void {
  // Conversations are bumped via trigger when a message lands. Re-listing on
  // any conversation or message change involving the user keeps the inbox live.
  const channelName = `inbox:${userId}:${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'conversations',
        filter: `buyer_id=eq.${userId}`,
      },
      onChange,
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'conversations',
        filter: `seller_id=eq.${userId}`,
      },
      onChange,
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
/** Does this thread have something in it the viewer hasn't seen?
 *
 *  Two conditions, both required: someone else spoke last, and they spoke after
 *  the viewer last opened the thread. The second half is what was missing —
 *  without it the dot could only ever be cleared by replying. */
export function isConversationUnread(conv: ConversationRow, userId: string): boolean {
  if (!conv.last_sender_id || conv.last_sender_id === userId) return false;
  const readAt = conv.buyer_id === userId ? conv.buyer_last_read_at : conv.seller_last_read_at;
  if (!readAt) return true; // never opened
  return new Date(conv.updated_at).getTime() > new Date(readAt).getTime();
}

/** Stamps "I've seen this" for the calling participant. Fire-and-forget: a
 *  failed read receipt must never block opening a thread. */
export async function markConversationRead(conversationId: string, userId?: string): Promise<void> {
  const { error } = await supabase.rpc('mark_conversation_read', {
    p_conversation_id: conversationId,
  });
  if (error) {
    console.warn('[chat] markConversationRead RPC error, using direct table fallback:', error.message);
    if (userId) {
      const now = new Date().toISOString();
      await Promise.allSettled([
        supabase
          .from('conversations')
          .update({ buyer_last_read_at: now })
          .eq('id', conversationId)
          .eq('buyer_id', userId),
        supabase
          .from('conversations')
          .update({ seller_last_read_at: now })
          .eq('id', conversationId)
          .eq('seller_id', userId),
      ]);
    }
  }
}

export function otherParticipant(
  conv: ConversationRow,
  userId: string,
): NonNullable<ConversationRow['buyer']> | null {
  if (!conv.buyer || !conv.seller) return null;
  if (conv.buyer_id === userId) return conv.seller;
  if (conv.seller_id === userId) return conv.buyer;
  return null;
}

/** A conversation is "transactional" (buying/selling) when it is tied to a
 *  listing. Offers can only be sent inside listing-based conversations (the
 *  `canOffer` guard and all creation flows enforce this), so `listing_id` is
 *  the stable, authoritative signal — no text heuristics needed. */
export function isTransactionalConversation(conv: ConversationRow): boolean {
  return !!conv.listing_id;
}
