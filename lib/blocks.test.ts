import { describe, it, expect, beforeEach, vi } from 'vitest';
import { blockUser, getBlockRelation, getBlockedUserIds, listBlockedUsers, unblockUser } from './blocks';
import { supabase } from './supabase';

// Enforcement is tested against the database in
// tests/adversarial/blocks_and_launch_guards.sql; this covers what the client does
// with the answers, and the one-time move of device-only blocks to the server.

const storage: Record<string, string> = {};

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => storage[key] ?? null),
    removeItem: vi.fn(async (key: string) => {
      delete storage[key];
    }),
  },
}));

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }));

/** A table mock answering every chain with `result`, recording upserts. */
function table(result: { data?: unknown; error?: unknown }, upsert = vi.fn().mockResolvedValue({ error: null })) {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    delete: () => chain,
    order: () => chain,
    upsert,
    then: (resolve: (v: unknown) => void) => resolve(result),
  };
  return chain;
}

describe('blocks', () => {
  beforeEach(() => {
    Object.keys(storage).forEach((k) => delete storage[k]);
    vi.clearAllMocks();
  });

  it('reports each side of a block', async () => {
    vi.mocked(supabase.from).mockReturnValue(table({ data: [{ blocked_id: 'them' }], error: null }));
    vi.mocked(supabase.rpc).mockResolvedValue({ data: ['them', 'blocker'], error: null } as any);
    expect(await getBlockRelation('me', 'them')).toBe('blocked_by_me');
    expect(await getBlockRelation('me', 'blocker')).toBe('blocked_me');
    expect(await getBlockRelation('me', 'stranger')).toBe('none');
  });

  it('fails soft when the block list cannot be read', async () => {
    vi.mocked(supabase.from).mockReturnValue(table({ data: null, error: { message: 'offline' } }));
    expect(await getBlockedUserIds('reader')).toEqual([]);
  });

  it('surfaces a load failure to the settings screen instead of an empty list', async () => {
    vi.mocked(supabase.from).mockReturnValue(table({ data: null, error: new Error('offline') }));
    await expect(listBlockedUsers('reader')).rejects.toThrow('offline');
  });

  it('says when a block or unblock did not stick', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: { message: 'denied' } });
    vi.mocked(supabase.from).mockReturnValue(table({ error: { message: 'denied' } }, upsert));
    expect(await blockUser({ blockerId: 'a', blockedId: 'b' })).toBe(false);
    expect(await unblockUser({ blockerId: 'a', blockedId: 'b' })).toBe(false);
  });

  it('caps the stored reason', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(supabase.from).mockReturnValue(table({ error: null }, upsert));
    expect(await blockUser({ blockerId: 'a', blockedId: 'b', reason: 'x'.repeat(500) })).toBe(true);
    expect(upsert.mock.calls[0][0].reason).toHaveLength(200);
  });

  it('moves device-only blocks up once and clears them', async () => {
    storage['carrinex_blocked_users_mover'] = JSON.stringify(['b', 'mover', 42]);
    const upsert = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(supabase.from).mockReturnValue(table({ data: [], error: null }, upsert));
    await getBlockedUserIds('mover');
    await getBlockedUserIds('mover');
    expect(upsert).toHaveBeenCalledTimes(1);
    // Junk and self-blocks don't survive the move.
    expect(upsert.mock.calls[0][0]).toEqual([{ blocker_id: 'mover', blocked_id: 'b' }]);
    expect(storage['carrinex_blocked_users_mover']).toBeUndefined();
  });

  it('keeps device-only blocks if the move fails', async () => {
    storage['carrinex_blocked_users_retry'] = JSON.stringify(['b']);
    const upsert = vi.fn().mockResolvedValue({ error: { message: 'offline' } });
    vi.mocked(supabase.from).mockReturnValue(table({ data: [], error: null }, upsert));
    await getBlockedUserIds('retry');
    expect(storage['carrinex_blocked_users_retry']).toBeDefined();
  });
});
