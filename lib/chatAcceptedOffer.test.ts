import { describe, expect, it, vi } from 'vitest';
import { fetchAcceptedOfferAmount } from './chat';

const { rows } = vi.hoisted(() => ({ rows: { data: [] as unknown[] } }));

vi.mock('@/lib/supabase', () => {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'or', 'order', 'limit']) q[m] = () => q;
  q.then = (resolve: (v: unknown) => void) => resolve({ data: rows.data, error: null });
  return { supabase: { from: () => q } };
});

// WEB-001: checkout opened without ?offer= must still price the accepted offer.
describe('fetchAcceptedOfferAmount', () => {
  it('returns the newest single-item accepted offer and skips bundle offers', async () => {
    rows.data = [
      { amount: 2500, message: { metadata: { bundle_item_ids: ['l1', 'l2'] } } },
      { amount: 1200, message: { metadata: { amount: 1200 } } },
    ];
    expect(await fetchAcceptedOfferAmount('l1', 'b')).toBe(1200);
  });

  it('returns null when there is no accepted offer', async () => {
    rows.data = [];
    expect(await fetchAcceptedOfferAmount('l1', 'b')).toBeNull();
  });
});
