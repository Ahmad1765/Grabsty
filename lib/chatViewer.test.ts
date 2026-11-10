import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { conversationForViewer, isConversationUnread, type ConversationRow } from './chat';

const conv: ConversationRow = {
  id: 'c',
  listing_id: 'l',
  buyer_id: 'b',
  seller_id: 's',
  last_message: 'Order cancelled by Buyer',
  last_sender_id: 'b',
  updated_at: '2026-11-10T12:00:00Z',
  seller_last_read_at: '2026-11-10T11:00:00Z',
  seller_last_message: 'Is it still available?',
  seller_last_sender_id: 'b',
  seller_activity_at: '2026-11-10T10:00:00Z',
};

describe('conversationForViewer', () => {
  it('shows the seller the last non-order message, so an order update is neither previewed nor unread', () => {
    const v = conversationForViewer(conv, 's');
    expect(v.last_message).toBe('Is it still available?');
    expect(isConversationUnread(v, 's')).toBe(false);
  });
  it('leaves the buyer view unchanged', () => {
    expect(conversationForViewer(conv, 'b')).toBe(conv);
  });
});
