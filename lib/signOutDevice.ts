import type { SupabaseClient } from '@supabase/supabase-js';

// Sign this device out: revoke its session server-side, then drop it locally.
//
// auth-js signOut() returns early on any /logout failure other than 401/403/404
// (offline, timeout, 5xx) WITHOUT removing the stored session — the UI showed
// "signed out" but the next launch restored the account, which on a shared phone
// hands it to the next person. Local removal must not depend on the network.
// The server session then just expires with its refresh token.
export async function signOutDevice(client: SupabaseClient): Promise<void> {
  const { error } = await client.auth.signOut({ scope: 'local' });
  if (!error) return;
  const auth = client.auth as unknown as {
    storage: { removeItem(key: string): Promise<void> | void };
    storageKey: string;
  };
  await auth.storage.removeItem(auth.storageKey);
}
