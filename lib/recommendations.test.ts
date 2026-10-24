import { describe, it, expect, vi, beforeEach } from 'vitest';

const started: string[] = [];
let resolveRpc: (v: unknown) => void = () => {};
let rpcRows: unknown[] = [];

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(() => {
      started.push('rpc');
      return new Promise((r) => { resolveRpc = r; });
    }),
    from: vi.fn(() => ({
      select: () => ({
        in: async () => {
          started.push('sellers');
          return { data: [{ id: 's1', username: 'seller1' }], error: null };
        },
      }),
    })),
  },
}));
vi.mock('@/lib/listings', () => ({
  fetchListings: vi.fn(async () => {
    started.push('fallback');
    return [
      { id: 'a', seller_id: 's1', seller: { id: 's1', username: 'seller1' } },
      { id: 'f1', seller_id: 's2', seller: { id: 's2', username: 'seller2' } },
      { id: 'f2', seller_id: 's2', seller: { id: 's2', username: 'seller2' } },
    ];
  }),
}));
vi.mock('@/lib/listingCache', () => ({ putCachedListings: vi.fn() }));

import { fetchRecommendations } from './recommendations';

beforeEach(() => {
  started.length = 0;
  rpcRows = [{ id: 'a', seller_id: 's1' }, { id: 'b', seller_id: 's1' }];
});

describe('fetchRecommendations', () => {
  it('starts the backfill without waiting for the rpc', async () => {
    const p = fetchRecommendations(4);
    await Promise.resolve();
    expect(started).toEqual(['rpc', 'fallback']);
    resolveRpc({ data: rpcRows, error: null });
    await p;
  });

  it('keeps rpc order first, dedupes, backfills to the limit, and hydrates rpc sellers', async () => {
    const p = fetchRecommendations(3);
    resolveRpc({ data: rpcRows, error: null });
    const rows = await p;
    expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'f1']);
    expect(rows[0].seller).toMatchObject({ username: 'seller1' });
    expect(rows[2].rec_reason).toBe('trending');
  });

  it('falls back to the backfill alone when the rpc fails', async () => {
    const p = fetchRecommendations(2);
    resolveRpc({ data: null, error: { message: 'boom' } });
    const rows = await p;
    expect(rows.map((r) => r.id)).toEqual(['a', 'f1']);
  });
});
