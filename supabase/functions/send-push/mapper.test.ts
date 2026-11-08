import { describe, it, expect } from 'vitest';
import {
  buildPushNotifications,
  formatAmount,
  truncate,
  type ConversationLookup,
  type WebhookPayload,
} from './mapper';

const BUYER = '11111111-1111-1111-1111-111111111111';
const SELLER = '22222222-2222-2222-2222-222222222222';
const STRANGER = '33333333-3333-3333-3333-333333333333';
const CONV_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const MSG_ID = 'mmmmmmmm-mmmm-mmmm-mmmm-mmmmmmmmmmmm';

const conversation: ConversationLookup = {
  id: CONV_ID,
  buyer_id: BUYER,
  seller_id: SELLER,
};

function messageInsert(record: Record<string, unknown>): WebhookPayload {
  return {
    type: 'INSERT',
    table: 'messages',
    record: { id: MSG_ID, conversation_id: CONV_ID, kind: 'text', ...record },
    old_record: null,
  };
}

describe('formatAmount', () => {
  it('renders PKR with the app symbol and no decimals', () => {
    expect(formatAmount(1250)).toBe('Rs 1,250');
    expect(formatAmount('900.4')).toBe('Rs 900');
  });

  it('never renders NaN', () => {
    expect(formatAmount(undefined)).toBe('Rs 0');
    expect(formatAmount('not a number')).toBe('Rs 0');
  });
});

describe('truncate', () => {
  it('leaves short text alone and collapses whitespace', () => {
    expect(truncate('hello   there')).toBe('hello there');
  });

  it('cuts at a word boundary with an ellipsis', () => {
    const out = truncate('a'.repeat(30) + ' ' + 'b'.repeat(30), 40);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(41);
  });
});

describe('buildPushNotifications — messages INSERT', () => {
  it('notifies the other participant of a text message', () => {
    const out = buildPushNotifications(
      messageInsert({ sender_id: BUYER, content: 'Is this still available?' }),
      { conversation, senderName: 'ayesha' },
    );
    expect(out).toHaveLength(1);
    expect(out[0].userId).toBe(SELLER);
    expect(out[0].title).toBe('ayesha');
    expect(out[0].body).toBe('Is this still available?');
    expect(out[0].data).toEqual({ type: 'message', conversationId: CONV_ID });
  });

  it('routes seller → buyer as well as buyer → seller', () => {
    const out = buildPushNotifications(
      messageInsert({ sender_id: SELLER, content: 'Yes it is' }),
      { conversation, senderName: 'zain' },
    );
    expect(out[0].userId).toBe(BUYER);
  });

  it('never notifies the sender about their own message', () => {
    const out = buildPushNotifications(
      messageInsert({ sender_id: BUYER, content: 'hi' }),
      { conversation, senderName: 'ayesha' },
    );
    expect(out.every((n) => n.userId !== BUYER)).toBe(true);
  });

  it('drops messages from a non-participant', () => {
    const out = buildPushNotifications(
      messageInsert({ sender_id: STRANGER, content: 'hi' }),
      { conversation, senderName: 'nobody' },
    );
    expect(out).toEqual([]);
  });

  it('formats an offer with the amount', () => {
    const out = buildPushNotifications(
      messageInsert({
        sender_id: BUYER,
        kind: 'offer',
        content: null,
        metadata: { amount: 4500, currency: 'PKR' },
      }),
      { conversation, senderName: 'ayesha' },
    );
    expect(out[0].body).toBe('ayesha sent an offer: Rs 4,500');
    expect(out[0].userId).toBe(SELLER);
  });

  it('falls back to a generic sender name when the profile is missing', () => {
    const out = buildPushNotifications(
      messageInsert({ sender_id: BUYER, content: 'hi' }),
      { conversation, senderName: null },
    );
    expect(out[0].title).toBe('Someone');
  });

  it('drops a text message with no content', () => {
    const out = buildPushNotifications(
      messageInsert({ sender_id: BUYER, content: '' }),
      { conversation, senderName: 'ayesha' },
    );
    expect(out).toEqual([]);
  });

  it('drops the row when the conversation could not be looked up', () => {
    const out = buildPushNotifications(
      messageInsert({ sender_id: BUYER, content: 'hi' }),
      { conversation: null, senderName: 'ayesha' },
    );
    expect(out).toEqual([]);
  });
});

describe('buildPushNotifications — messages UPDATE (offer status)', () => {
  function statusUpdate(prev: string | null, next: string | null): WebhookPayload {
    return {
      type: 'UPDATE',
      table: 'messages',
      record: {
        id: MSG_ID,
        conversation_id: CONV_ID,
        sender_id: BUYER,
        kind: 'offer',
        offer_status: next,
      },
      old_record: { offer_status: prev },
    };
  }

  it('notifies the offer sender when accepted', () => {
    const out = buildPushNotifications(statusUpdate('pending', 'accepted'), {
      conversation,
    });
    expect(out).toHaveLength(1);
    expect(out[0].userId).toBe(BUYER);
    expect(out[0].body).toBe('Your offer was accepted');
  });

  it('notifies the offer sender when declined', () => {
    const out = buildPushNotifications(statusUpdate('pending', 'declined'), {
      conversation,
    });
    expect(out[0].body).toBe('Your offer was declined');
  });

  it('is a no-op when offer_status did not actually change', () => {
    expect(
      buildPushNotifications(statusUpdate('accepted', 'accepted'), { conversation }),
    ).toEqual([]);
  });

  it('ignores transitions to states that are not settled', () => {
    expect(
      buildPushNotifications(statusUpdate(null, 'pending'), { conversation }),
    ).toEqual([]);
  });
});

describe('buildPushNotifications — orders INSERT', () => {
  const orderInsert: WebhookPayload = {
    type: 'INSERT',
    table: 'orders',
    record: {
      id: 'oooooooo-oooo-oooo-oooo-oooooooooooo',
      listing_id: 'llllllll-llll-llll-llll-llllllllllll',
      seller_id: SELLER,
      buyer_id: BUYER,
    },
    old_record: null,
  };

  it('notifies both the seller and the buyer', () => {
    const out = buildPushNotifications(orderInsert, { listingTitle: 'Vintage Levi 501' });
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ userId: SELLER, body: 'You sold Vintage Levi 501' });
    expect(out[1]).toMatchObject({
      userId: BUYER,
      body: 'Payment confirmed — Vintage Levi 501',
    });
    expect(out[0].data).toEqual({
      type: 'order',
      listingId: 'llllllll-llll-llll-llll-llllllllllll',
    });
  });

  it('falls back when the listing title is missing', () => {
    const out = buildPushNotifications(orderInsert, {});
    expect(out[0].body).toBe('You sold your item');
  });

  it('tells a cash-on-delivery buyer the order is placed, not paid', () => {
    const cod = { ...orderInsert, record: { ...orderInsert.record, status: 'pending', payment_method: 'cod' } };
    const out = buildPushNotifications(cod, { listingTitle: 'Vintage Levi 501' });
    expect(out).toHaveLength(2);
    expect(out[1]).toMatchObject({
      userId: BUYER,
      title: 'Order placed',
      body: 'Order placed — Vintage Levi 501. Pay cash on delivery.',
    });
  });

  it('sends nothing for a losing duplicate payment awaiting refund', () => {
    const dup = { ...orderInsert, record: { ...orderInsert.record, status: 'refund_due', payment_method: 'card' } };
    expect(buildPushNotifications(dup, { listingTitle: 'x' })).toEqual([]);
  });

  it('ignores order updates', () => {
    expect(
      buildPushNotifications({ ...orderInsert, type: 'UPDATE' }, {}),
    ).toEqual([]);
  });
});

describe('buildPushNotifications — safety', () => {
  it('gives every notification a recipient-scoped idempotency key', () => {
    const out = buildPushNotifications(
      {
        type: 'INSERT',
        table: 'orders',
        record: { id: 'order-1', listing_id: 'l1', seller_id: SELLER, buyer_id: BUYER },
        old_record: null,
      },
      {},
    );
    expect(new Set(out.map((n) => n.idempotencyKey)).size).toBe(out.length);
    expect(out[0].idempotencyKey).toBe(`orders:order-1:INSERT:${SELLER}`);
  });

  it('ignores tables that are not in scope', () => {
    expect(
      buildPushNotifications({
        type: 'INSERT',
        table: 'listings',
        record: { id: 'x' },
        old_record: null,
      }),
    ).toEqual([]);
  });

  it('ignores a payload with no record', () => {
    expect(
      buildPushNotifications({
        type: 'INSERT',
        table: 'messages',
        record: null,
        old_record: null,
      }),
    ).toEqual([]);
  });
});
