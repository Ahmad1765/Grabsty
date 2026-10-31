// Pure row-change → notification mapping for the `send-push` edge function.
//
// Deliberately free of Deno globals, `fetch`, and the Supabase client: every
// piece of data the mapping needs arrives via `lookups`, already fetched by the
// caller. That keeps this file loadable by vitest (see mapper.test.ts) so the
// recipient and copy rules — the part that is easy to get wrong and impossible
// to verify without a device — are covered by ordinary unit tests.

export type WebhookPayload = {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: Record<string, unknown> | null;
  old_record: Record<string, unknown> | null;
};

export type ConversationLookup = {
  id: string;
  buyer_id: string | null;
  seller_id: string | null;
};

export type Lookups = {
  /** Conversation for a `messages` row, keyed by conversation_id. */
  conversation?: ConversationLookup | null;
  /** Display name of the acting user (message sender), already resolved. */
  senderName?: string | null;
  /** Title of the listing a conversation/order refers to. */
  listingTitle?: string | null;
};

export type PushNotification = {
  userId: string;
  title: string;
  body: string;
  data: Record<string, string>;
  /**
   * Stable per (source row, event, recipient). `send-push` claims this in
   * push_deliveries before sending, so a webhook redelivery is a no-op.
   */
  idempotencyKey: string;
};

// Mirrors lib/currency.ts. The app trades in PKR and never shows `$`; the edge
// function cannot import from lib/, so the format is restated here. Keep the
// two in sync — this is the only duplicate.
const CURRENCY_SYMBOL = 'Rs';

export function formatAmount(amount: unknown): string {
  const n = typeof amount === 'string' ? parseFloat(amount) : Number(amount);
  if (!Number.isFinite(n)) return `${CURRENCY_SYMBOL} 0`;
  return `${CURRENCY_SYMBOL} ${Math.round(n).toLocaleString('en-US')}`;
}

// Push bodies are shown in a system banner with very little room, and the OS
// truncates mid-word. Cut at a word boundary with an ellipsis instead.
export function truncate(text: string, max = 120): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/**
 * The other participant in a conversation. Returns null when the actor is not
 * a participant at all, or when the conversation is missing a side.
 */
function otherParticipant(
  conv: ConversationLookup,
  actorId: string,
): string | null {
  const buyer = str(conv.buyer_id);
  const seller = str(conv.seller_id);
  if (actorId === buyer) return seller;
  if (actorId === seller) return buyer;
  return null;
}

/**
 * Map one database webhook payload to the notifications it should produce.
 * Returns [] for anything not in scope — an unknown table, a no-op update, a
 * message the sender would be notified about, or a malformed row.
 */
export function buildPushNotifications(
  payload: WebhookPayload,
  lookups: Lookups = {},
): PushNotification[] {
  const record = payload.record;
  if (!record) return [];

  if (payload.table === 'messages') return fromMessage(payload, record, lookups);
  if (payload.table === 'orders') return fromOrder(payload, record, lookups);
  return [];
}

function fromMessage(
  payload: WebhookPayload,
  record: Record<string, unknown>,
  lookups: Lookups,
): PushNotification[] {
  const messageId = str(record.id);
  const conversationId = str(record.conversation_id);
  const senderId = str(record.sender_id);
  const conv = lookups.conversation;
  if (!messageId || !conversationId || !senderId || !conv) return [];

  const senderName = str(lookups.senderName) ?? 'Someone';
  const data = { type: 'message', conversationId };

  if (payload.type === 'INSERT') {
    // The sender never gets a push for their own message.
    const recipient = otherParticipant(conv, senderId);
    if (!recipient) return [];

    const kind = str(record.kind) ?? 'text';
    if (kind === 'offer') {
      const metadata = (record.metadata ?? {}) as Record<string, unknown>;
      return [
        {
          userId: recipient,
          title: senderName,
          body: `${senderName} sent an offer: ${formatAmount(metadata.amount)}`,
          data,
          idempotencyKey: `messages:${messageId}:INSERT:${recipient}`,
        },
      ];
    }
    const content = str(record.content);
    if (!content) return [];
    return [
      {
        userId: recipient,
        title: senderName,
        body: truncate(content),
        data,
        idempotencyKey: `messages:${messageId}:INSERT:${recipient}`,
      },
    ];
  }

  if (payload.type === 'UPDATE') {
    // The webhook fires on any write to the row. Only a real transition of
    // offer_status into a settled state is worth a notification — otherwise an
    // unrelated edit (or a redelivered no-op) would push again.
    const next = str(record.offer_status);
    const prev = str(payload.old_record?.offer_status);
    if (!next || next === prev) return [];
    if (next !== 'accepted' && next !== 'declined') return [];

    // The person who MADE the offer is the one who wants to hear about it.
    return [
      {
        userId: senderId,
        title: 'Grabsty',
        body: `Your offer was ${next}`,
        data,
        idempotencyKey: `messages:${messageId}:${next}:${senderId}`,
      },
    ];
  }

  return [];
}

function fromOrder(
  payload: WebhookPayload,
  record: Record<string, unknown>,
  lookups: Lookups,
): PushNotification[] {
  if (payload.type !== 'INSERT') return [];
  const orderId = str(record.id);
  const listingId = str(record.listing_id);
  const sellerId = str(record.seller_id);
  const buyerId = str(record.buyer_id);
  if (!orderId || !listingId) return [];
  // A losing duplicate payment is inserted as refund_due: that buyer is owed
  // their money back and the seller already got "Sold!" for the winning order.
  const status = str(record.status);
  if (status && ['refund_due', 'refunded', 'failed', 'canceled', 'cancelled'].includes(status)) {
    return [];
  }
  // Cash on delivery: nothing has been paid yet, so don't say it has.
  const isCod = str(record.payment_method) === 'cod';

  const title = str(lookups.listingTitle) ?? 'your item';
  const data = { type: 'order', listingId };
  const out: PushNotification[] = [];

  if (sellerId) {
    out.push({
      userId: sellerId,
      title: 'Sold!',
      body: `You sold ${truncate(title, 60)}`,
      data,
      idempotencyKey: `orders:${orderId}:INSERT:${sellerId}`,
    });
  }
  // The buyer is notified too, even though they initiated the purchase — this
  // is the payment confirmation, not a social ping.
  if (buyerId) {
    out.push({
      userId: buyerId,
      title: isCod ? 'Order placed' : 'Payment confirmed',
      body: isCod
        ? `Order placed — ${truncate(title, 60)}. Pay cash on delivery.`
        : `Payment confirmed — ${truncate(title, 60)}`,
      data,
      idempotencyKey: `orders:${orderId}:INSERT:${buyerId}`,
    });
  }
  return out;
}
