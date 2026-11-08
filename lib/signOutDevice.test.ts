import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { signOutDevice } from './signOutDevice';

const KEY = 'sb-test-auth-token';
const jwt = (exp: number) =>
  ['{"alg":"HS256"}', JSON.stringify({ sub: 'u1', exp }), 'sig']
    .map((p, i) => (i < 2 ? Buffer.from(p).toString('base64url') : p))
    .join('.');

// A signed-in client whose network is down: /logout never answers.
function offlineClient() {
  const mem = new Map<string, string>();
  const exp = Math.floor(Date.now() / 1000) + 3600;
  mem.set(KEY, JSON.stringify({
    access_token: jwt(exp), refresh_token: 'rt', token_type: 'bearer',
    expires_in: 3600, expires_at: exp, user: { id: 'u1', aud: 'authenticated' },
  }));
  const client = createClient('https://example.supabase.co', 'anon', {
    auth: {
      storageKey: KEY,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage: {
        getItem: async (k) => mem.get(k) ?? null,
        setItem: async (k, v) => void mem.set(k, v),
        removeItem: async (k) => void mem.delete(k),
      },
    },
    global: { fetch: async () => { throw new TypeError('Network request failed'); } },
  });
  return { client, mem };
}

describe('signOutDevice', () => {
  it('auth-js alone keeps the stored session when /logout fails (the bug)', async () => {
    const { client, mem } = offlineClient();
    const { error } = await client.auth.signOut({ scope: 'local' });
    expect(error).toBeTruthy();
    expect(mem.has(KEY)).toBe(true);
  });

  it('clears the stored session even when /logout fails', async () => {
    const { client, mem } = offlineClient();
    await signOutDevice(client);
    expect(mem.has(KEY)).toBe(false);
    expect((await client.auth.getSession()).data.session).toBeNull();
  });
});
