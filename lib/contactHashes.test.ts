import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn(async () => ({ error: null }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...(a as [])) } }));
vi.mock('@/lib/cryptoPepper', () => ({ getContactPepper: () => 'PEPPER' }));
vi.mock('expo-localization', () => ({ getLocales: () => [{ regionCode: 'PK' }] }));
vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_alg: string, s: string) => `h(${s})`,
}));

import { registerMyHashes } from './contactHashes';

describe('registerMyHashes', () => {
  beforeEach(() => rpc.mockClear());

  it('hashes the E.164 phone and normalized email with the pepper', async () => {
    await registerMyHashes('0300 1234567', '  Ali@Example.COM ');
    expect(rpc).toHaveBeenCalledWith('register_my_contact_hashes', {
      p_phone_hashes: ['h(+923001234567:PEPPER)'],
      p_email_hashes: ['h(ali@example.com:PEPPER)'],
    });
  });

  it('sends null for the side that is missing', async () => {
    await registerMyHashes(null, 'a@b.co');
    expect(rpc).toHaveBeenCalledWith('register_my_contact_hashes', {
      p_phone_hashes: null,
      p_email_hashes: ['h(a@b.co:PEPPER)'],
    });
  });

  it('does nothing without a phone or email', async () => {
    await registerMyHashes(null, null);
    expect(rpc).not.toHaveBeenCalled();
  });
});
