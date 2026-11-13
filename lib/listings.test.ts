import { describe, it, expect, vi } from 'vitest';
import { getSearchTokenVariants } from './listings';

vi.stubGlobal('__DEV__', true);

vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
  NativeModules: {},
}));

vi.mock('expo-constants', () => ({
  default: { expoConfig: { extra: {} } },
}));

const { listingsQuery } = vi.hoisted(() => {
  const listingsQuery: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of ['select', 'eq', 'is', 'order']) listingsQuery[m] = vi.fn(() => listingsQuery);
  (listingsQuery as unknown as PromiseLike<unknown>).then = ((resolve: (v: unknown) => void) =>
    resolve({ data: [], error: null })) as never;
  return { listingsQuery };
});

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(() => listingsQuery) },
}));

vi.mock('@/lib/sentry', () => ({
  captureError: vi.fn(),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => {}),
    removeItem: vi.fn(async () => {}),
  },
}));

vi.mock('@react-native-community/netinfo', () => ({
  default: {
    fetch: vi.fn(async () => ({ isConnected: true, isInternetReachable: true })),
    addEventListener: vi.fn(() => () => {}),
  },
}));

describe('getSearchTokenVariants plural/singular logic', () => {
  it('preserves valid singular/plural variants for dress and dresses without truncation', () => {
    const dressVariants = getSearchTokenVariants('dress');
    expect(dressVariants).toContain('dress');
    expect(dressVariants).toContain('dresses');
    expect(dressVariants).not.toContain('dr');
    expect(dressVariants).not.toContain('dre');
    expect(dressVariants).not.toContain('dresss');

    const dressesVariants = getSearchTokenVariants('dresses');
    expect(dressesVariants).toContain('dresses');
    expect(dressesVariants).toContain('dress');
    expect(dressesVariants).not.toContain('dr');
    expect(dressesVariants).not.toContain('dresse');
  });

  it('preserves valid singular/plural variants for glass and glasses without truncation', () => {
    const glassVariants = getSearchTokenVariants('glass');
    expect(glassVariants).toContain('glass');
    expect(glassVariants).toContain('glasses');
    expect(glassVariants).not.toContain('gl');
    expect(glassVariants).not.toContain('glasss');

    const glassesVariants = getSearchTokenVariants('glasses');
    expect(glassesVariants).toContain('glasses');
    expect(glassesVariants).toContain('glass');
    expect(glassesVariants).not.toContain('gl');
    expect(glassesVariants).not.toContain('glasse');
  });

  it('retains bag and bags standard plural/singular variant behavior', () => {
    const bagVariants = getSearchTokenVariants('bag');
    expect(bagVariants).toContain('bag');
    expect(bagVariants).toContain('bags');

    const bagsVariants = getSearchTokenVariants('bags');
    expect(bagsVariants).toContain('bags');
    expect(bagsVariants).toContain('bag');
  });

  it('avoids overly broad stems for vowel-preceded es endings like shoes and toes', () => {
    const shoesVariants = getSearchTokenVariants('shoes');
    expect(shoesVariants).toContain('shoes');
    expect(shoesVariants).toContain('shoe');
    expect(shoesVariants).not.toContain('sho');

    const toesVariants = getSearchTokenVariants('toes');
    expect(toesVariants).toContain('toes');
    expect(toesVariants).toContain('toe');
    expect(toesVariants).not.toContain('to');

    const watchesVariants = getSearchTokenVariants('watches');
    expect(watchesVariants).toContain('watches');
    expect(watchesVariants).toContain('watch');
  });
});

describe('fetchUserListings', () => {
  it('leaves soft-deleted listings off the profile', async () => {
    const { fetchUserListings } = await import('./listings');
    await fetchUserListings('seller-1');
    expect(listingsQuery.is).toHaveBeenCalledWith('deleted_at', null);
  });
});

describe('searchListings candidate pool cap', () => {
  it('defines a bounded candidate cap greater than default page limit', async () => {
    const { CANDIDATE_CAP } = await import('./listings');
    expect(CANDIDATE_CAP).toBeGreaterThanOrEqual(100);
    expect(CANDIDATE_CAP).toBe(200);
  });
});
