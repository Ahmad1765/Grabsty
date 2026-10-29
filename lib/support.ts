import { supabase } from '@/lib/supabase';
import {
  getOrCreateConversation,
  CONVERSATION_SELECT,
  isTransactionalConversation,
  type ConversationRow,
  type ChatMessage,
} from '@/lib/chat';
import { SUPPORT_KNOWLEDGE_BASE, SUPPORT_DEFAULT_REPLY, SUPPORT_WELCOME_MESSAGE } from '@/lib/supportReplies';

export const SUPPORT_BOT_USER_ID = '00000000-0000-0000-0000-000000000001';
export const SUPPORT_BOT_NAME = 'Grabsty Support';
export const SUPPORT_BOT_USERNAME = 'grabsty_support';
export const SUPPORT_BOT_AVATAR = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=200&auto=format&fit=crop&q=80';

export interface SupportTopic {
  id: string;
  icon: string;
  title: string;
  description: string;
  prompt: string;
}

export const SUPPORT_TOPICS: SupportTopic[] = [
  {
    id: 'order_status',
    icon: 'package',
    title: 'Order status & tracking',
    description: 'Track deliveries, delays, or dispatch status',
    prompt: 'How do I track my order or check delivery status?',
  },
  {
    id: 'buyer_protection',
    icon: 'shield',
    title: 'Buyer Protection & refunds',
    description: 'How your money and purchases stay safe',
    prompt: 'How does Buyer Protection and refunds work on Grabsty?',
  },
  {
    id: 'payouts_fees',
    icon: 'credit-card',
    title: 'Payments & payouts',
    description: 'Withdraw balance, payment methods & fees',
    prompt: 'How do seller payouts and wallet withdrawals work?',
  },
  {
    id: 'selling_guide',
    icon: 'tag',
    title: 'Selling & shipping',
    description: 'Tips to price, list and ship items fast',
    prompt: 'How do I ship sold items and get prepaid shipping labels?',
  },
  {
    id: 'report_issue',
    icon: 'alert-triangle',
    title: 'Report a problem',
    description: 'Suspicious sellers, fraud or fakes',
    prompt: 'I want to report an issue or suspicious seller.',
  },
];

export function isSupportConversation(conv: ConversationRow | null | undefined): boolean {
  if (!conv) return false;
  return (
    conv.seller_id === SUPPORT_BOT_USER_ID ||
    conv.buyer_id === SUPPORT_BOT_USER_ID ||
    conv.seller?.username === SUPPORT_BOT_USERNAME ||
    conv.buyer?.username === SUPPORT_BOT_USERNAME
  );
}

/**
 * A direct conversation is a user-to-user thread not tied to any listing (non-transactional)
 * and not involving the Support Bot.
 */
export function isDirectConversation(conv: ConversationRow | null | undefined): boolean {
  if (!conv) return false;
  return !isTransactionalConversation(conv) && !isSupportConversation(conv);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesKeyword(text: string, kw: string): boolean {
  const regex = new RegExp(`\\b${escapeRegex(kw.toLowerCase())}\\b`, 'i');
  return regex.test(text);
}

export function generateSupportResponse(query: string): string {
  const clean = query.toLowerCase().trim();

  let bestMatch: (typeof SUPPORT_KNOWLEDGE_BASE)[number] | null = null;
  let highestScore = 0;

  // Find highest scoring topic by number of matched whole-term keywords
  for (const item of SUPPORT_KNOWLEDGE_BASE) {
    let score = 0;
    for (const kw of item.keywords) {
      if (matchesKeyword(clean, kw)) {
        score += 1;
      }
    }
    if (score > highestScore) {
      highestScore = score;
      bestMatch = item;
    }
  }

  if (bestMatch && highestScore > 0) {
    return bestMatch.answer;
  }

  return SUPPORT_DEFAULT_REPLY;
}

export async function ensureSupportProfile(): Promise<void> {
  // Upsert the system support profile if not already present
  try {
    await supabase.from('profiles').upsert(
      {
        id: SUPPORT_BOT_USER_ID,
        username: SUPPORT_BOT_USERNAME,
        full_name: SUPPORT_BOT_NAME,
        avatar_url: SUPPORT_BOT_AVATAR,
        bio: 'Official Grabsty Customer Support & Help Assistant. Available 24/7.',
        location: 'Grabsty Care, PK',
        rating: 5.0,
        total_sales: 9999,
      },
      { onConflict: 'id' },
    );
  } catch {
    // Ignore if already exists or permission
  }
}

export async function getOrCreateSupportConversation(userId: string): Promise<ConversationRow | null> {
  await ensureSupportProfile();

  // Find existing conversation with support bot
  const { data: existingRows, error: lookupError } = await supabase
    .from('conversations')
    .select(CONVERSATION_SELECT)
    .is('listing_id', null)
    .or(`and(buyer_id.eq.${userId},seller_id.eq.${SUPPORT_BOT_USER_ID}),and(buyer_id.eq.${SUPPORT_BOT_USER_ID},seller_id.eq.${userId})`)
    .order('updated_at', { ascending: false })
    .limit(1);

  if (lookupError) {
    console.warn('[support] getOrCreateSupportConversation lookup', lookupError.message);
  }

  const existing = existingRows?.[0];
  if (existing) return existing as unknown as ConversationRow;

  // Otherwise create a new direct conversation
  const created = await getOrCreateConversation({
    buyerId: userId,
    sellerId: SUPPORT_BOT_USER_ID,
    listingId: null,
  });

  if (created) {
    // Only the server can post as the bot (RLS rejects inserts with someone
    // else's sender_id), and only one of its built-in replies.
    const { error } = await supabase.rpc('dispatch_support_bot_reply', {
      p_conversation_id: created.id,
      p_content: SUPPORT_WELCOME_MESSAGE,
    });
    if (error) console.warn('[support] welcome message failed', error.message);
  }

  return created;
}

export async function sendSupportBotReply(conversationId: string, userMessage: string): Promise<ChatMessage | null> {
  const { data, error } = await supabase.rpc('dispatch_support_bot_reply', {
    p_conversation_id: conversationId,
    p_content: generateSupportResponse(userMessage),
  });
  if (error) {
    console.warn('[support] bot reply failed', error.message);
    return null;
  }
  return (data as unknown as ChatMessage) ?? null;
}

// ── Admin Support Team Interfaces & Helpers ─────────────────────────────────

export interface AdminSupportConversation {
  id: string;
  user_id: string;
  username: string;
  full_name: string;
  avatar_url?: string | null;
  last_message?: string | null;
  updated_at: string;
  message_count: number;
  is_dispute: boolean;
}

/**
 * Automatically starts a support chat for an order dispute and has the server
 * post the "ticket opened" notice. The server builds the notice from the
 * order's stored dispute reason, so the client can't put words in the bot's mouth.
 */
export async function startDisputeSupportChat({
  orderId,
  buyerId,
}: {
  orderId: string;
  buyerId: string;
}): Promise<ConversationRow | null> {
  try {
    const conv = await getOrCreateSupportConversation(buyerId);
    if (!conv) return null;

    const { error } = await supabase.rpc('post_dispute_support_notice', { p_order_id: orderId });
    if (error) console.warn('[support] dispute notice failed', error.message);

    return conv;
  } catch (err) {
    console.warn('[support] startDisputeSupportChat failed', err);
    return null;
  }
}

/**
 * Fetch all support conversations for the administrative workbench.
 */
export async function fetchAdminSupportConversations(
  filter: 'all' | 'disputes' | 'general' = 'all',
): Promise<AdminSupportConversation[]> {
  try {
    const { data, error } = await supabase.rpc('admin_get_support_conversations', {
      p_filter: filter,
    });
    if (!error && data) {
      return data as AdminSupportConversation[];
    }
  } catch (e) {
    console.warn('[support] admin_get_support_conversations rpc failed, falling back', e);
  }

  // Fallback: direct query on conversations
  try {
    const { data: convs, error } = await supabase
      .from('conversations')
      .select(`
        id,
        buyer_id,
        seller_id,
        last_message,
        updated_at,
        buyer:profiles!conversations_buyer_id_fkey(id, username, full_name, avatar_url),
        seller:profiles!conversations_seller_id_fkey(id, username, full_name, avatar_url)
      `)
      .or(`buyer_id.eq.${SUPPORT_BOT_USER_ID},seller_id.eq.${SUPPORT_BOT_USER_ID}`)
      .order('updated_at', { ascending: false });

    if (error || !convs) return [];

    return convs.map((c: any) => {
      const isBotBuyer = c.buyer_id === SUPPORT_BOT_USER_ID;
      const user = isBotBuyer ? c.seller : c.buyer;
      const isDispute = (c.last_message || '').toLowerCase().includes('dispute');
      return {
        id: c.id,
        user_id: user?.id || (isBotBuyer ? c.seller_id : c.buyer_id),
        username: user?.username || 'member',
        full_name: user?.full_name || 'Grabsty Member',
        avatar_url: user?.avatar_url,
        last_message: c.last_message,
        updated_at: c.updated_at,
        message_count: 1,
        is_dispute: isDispute,
      };
    }).filter((item) => {
      if (filter === 'disputes') return item.is_dispute;
      if (filter === 'general') return !item.is_dispute;
      return true;
    });
  } catch (err) {
    console.warn('[support] fetchAdminSupportConversations fallback failed', err);
    return [];
  }
}

/**
 * Fetch messages for a support conversation for admin viewing.
 */
export async function fetchAdminSupportMessages(
  conversationId: string,
): Promise<ChatMessage[]> {
  try {
    const { data, error } = await supabase.rpc('admin_get_support_messages', {
      p_conversation_id: conversationId,
    });
    if (!error && data) {
      return data as ChatMessage[];
    }
  } catch (e) {
    console.warn('[support] admin_get_support_messages rpc failed, falling back', e);
  }

  // Fallback direct messages query
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error || !data) return [];
    return data as ChatMessage[];
  } catch (err) {
    console.warn('[support] fetchAdminSupportMessages fallback failed', err);
    return [];
  }
}

/**
 * Admin personally responds to a user query in a support conversation.
 */
export async function adminSendSupportMessage({
  conversationId,
  content,
}: {
  conversationId: string;
  content: string;
}): Promise<ChatMessage | null> {
  const trimmed = content.trim();
  if (!trimmed) return null;

  // Server checks is_admin() and posts as the support account. No client-side
  // fallback: anything else would let non-admins impersonate support.
  const { data, error } = await supabase.rpc('admin_send_support_message', {
    p_conversation_id: conversationId,
    p_content: trimmed,
  });
  if (error) {
    console.warn('[support] admin_send_support_message failed', error.message);
    return null;
  }
  return (data as ChatMessage) ?? null;
}

