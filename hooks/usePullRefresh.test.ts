import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// DEV-005: pulling to refresh while offline must stop the spinner instead of
// waiting on a refetch that Query has paused until the network returns.
const setRefreshing = vi.fn();
vi.mock('react', () => ({
  useState: (v: unknown) => [v, setRefreshing],
  useCallback: (fn: unknown) => fn,
}));
let online = true;
vi.mock('@tanstack/react-query', () => ({ onlineManager: { isOnline: () => online } }));

describe('usePullRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setRefreshing.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it('offline: does not refetch and turns the spinner off', async () => {
    online = false;
    const { usePullRefresh } = await import('./usePullRefresh');
    const refresh = vi.fn(() => new Promise(() => {})); // paused forever
    await usePullRefresh(refresh).onRefresh();
    expect(refresh).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(setRefreshing).toHaveBeenLastCalledWith(false);
  });

  it('online: refetches and clears the spinner when done', async () => {
    online = true;
    const { usePullRefresh } = await import('./usePullRefresh');
    const refresh = vi.fn(() => Promise.resolve());
    await usePullRefresh(refresh).onRefresh();
    expect(refresh).toHaveBeenCalledOnce();
    expect(setRefreshing.mock.calls).toEqual([[true], [false]]);
  });
});
