// Supabase auth storage for iOS/Android: the session (access + refresh token)
// lives in the Keychain / Android Keystore via expo-secure-store instead of
// unencrypted AsyncStorage. Web keeps AsyncStorage (localStorage) — there is no
// equivalent store, and the strict CSP is the defence there.
//
// SecureStore values should stay under ~2 KB and a session JSON is larger, so
// each value is split into chunks (`<key>.0`, `<key>.1`, …) with the count at
// `<key>.n`. A session still sitting in AsyncStorage from before this change is
// moved over on first read, so nobody is signed out by the upgrade.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const CHUNK = 1800;
// Upper bound swept when the stored chunk count itself is unreadable (~28 KB).
const MAX_CHUNKS = 16;

// SecureStore keys allow only [A-Za-z0-9._-].
const safe = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_');

async function removeChunks(key: string, from = 0): Promise<void> {
  let n = MAX_CHUNKS;
  try {
    n = Number(await SecureStore.getItemAsync(`${key}.n`)) || 0;
  } catch {
    // Undecryptable count: sweep every slot so the next write starts clean.
  }
  for (let i = from; i < n; i++) await SecureStore.deleteItemAsync(`${key}.${i}`);
  if (from === 0) await SecureStore.deleteItemAsync(`${key}.n`);
}

async function write(key: string, value: string): Promise<void> {
  const parts = value.match(new RegExp(`[\\s\\S]{1,${CHUNK}}`, 'g')) ?? [''];
  await removeChunks(key, parts.length);
  for (let i = 0; i < parts.length; i++) await SecureStore.setItemAsync(`${key}.${i}`, parts[i]);
  await SecureStore.setItemAsync(`${key}.n`, String(parts.length));
}

export const secureSessionStorage = {
  async getItem(rawKey: string): Promise<string | null> {
    const key = safe(rawKey);
    try {
      return await read(rawKey, key);
    } catch (e) {
      // Android can fail to decrypt after a backup restore or Keystore reset.
      // An unreadable session is a signed-out session, not a startup crash.
      console.warn('[secureSessionStorage] unreadable session, clearing', e);
      await removeChunks(key).catch(() => {});
      return null;
    }
  },
  async setItem(rawKey: string, value: string): Promise<void> {
    await write(safe(rawKey), value);
  },
  async removeItem(rawKey: string): Promise<void> {
    await removeChunks(safe(rawKey));
    await AsyncStorage.removeItem(rawKey);
  },
};

async function read(rawKey: string, key: string): Promise<string | null> {
  const n = Number(await SecureStore.getItemAsync(`${key}.n`)) || 0;
  if (n > 0) {
    const parts: string[] = [];
    for (let i = 0; i < n; i++) {
      const part = await SecureStore.getItemAsync(`${key}.${i}`);
      if (part == null) return null; // torn write: treat as signed out
      parts.push(part);
    }
    return parts.join('');
  }
  // One-time migration from the old unencrypted store.
  const legacy = await AsyncStorage.getItem(rawKey);
  if (legacy != null) {
    await write(key, legacy);
    await AsyncStorage.removeItem(rawKey);
  }
  return legacy;
}
