import { beforeEach, describe, expect, it, vi } from 'vitest';

const secure = new Map<string, string>();
const plain = new Map<string, string>();

vi.mock('expo-secure-store', () => ({
  getItemAsync: async (k: string) => secure.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => void secure.set(k, v),
  deleteItemAsync: async (k: string) => void secure.delete(k),
}));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k: string) => plain.get(k) ?? null,
    setItem: async (k: string, v: string) => void plain.set(k, v),
    removeItem: async (k: string) => void plain.delete(k),
  },
}));

const { secureSessionStorage: s } = await import('./secureSessionStorage');
const KEY = 'sb-abc-auth-token';

describe('secureSessionStorage', () => {
  beforeEach(() => {
    secure.clear();
    plain.clear();
  });

  it('round-trips a value larger than one chunk', async () => {
    const big = 'x'.repeat(4000) + 'end';
    await s.setItem(KEY, big);
    expect(Number(secure.get(`${KEY}.n`))).toBe(3);
    expect(await s.getItem(KEY)).toBe(big);
  });

  it('drops stale chunks when the value shrinks', async () => {
    await s.setItem(KEY, 'y'.repeat(4000));
    await s.setItem(KEY, 'short');
    expect(secure.has(`${KEY}.1`)).toBe(false);
    expect(await s.getItem(KEY)).toBe('short');
  });

  it('migrates a legacy AsyncStorage session once, then reads it from SecureStore', async () => {
    plain.set(KEY, '{"access_token":"t"}');
    expect(await s.getItem(KEY)).toBe('{"access_token":"t"}');
    expect(plain.has(KEY)).toBe(false);
    expect(await s.getItem(KEY)).toBe('{"access_token":"t"}');
  });

  it('removes every chunk and the legacy copy', async () => {
    await s.setItem(KEY, 'z'.repeat(3000));
    plain.set(KEY, 'old');
    await s.removeItem(KEY);
    expect(secure.size).toBe(0);
    expect(plain.size).toBe(0);
    expect(await s.getItem(KEY)).toBeNull();
  });

  it('treats an undecryptable store as signed out and can sign in again', async () => {
    await s.setItem(KEY, 'v'.repeat(3000));
    const real = secure.get.bind(secure);
    secure.get = () => {
      throw new Error('Could not decrypt');
    };
    expect(await s.getItem(KEY)).toBeNull();
    secure.get = real;
    expect(secure.size).toBe(0);
    await s.setItem(KEY, 'fresh');
    expect(await s.getItem(KEY)).toBe('fresh');
  });

  it('treats a torn write as signed out', async () => {
    await s.setItem(KEY, 'w'.repeat(3000));
    secure.delete(`${KEY}.1`);
    expect(await s.getItem(KEY)).toBeNull();
  });
});
