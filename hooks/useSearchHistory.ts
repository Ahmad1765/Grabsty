import { useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@ceranix/previous_searches';
export type SearchTabType = 'listings' | 'seller';

export type SearchHistoryItem = {
  term: string;
  tab: SearchTabType;
};

export const DEFAULT_PREVIOUS_SEARCHES: SearchHistoryItem[] = [];

function normalizeHistory(raw: any): SearchHistoryItem[] {
  if (!Array.isArray(raw)) return [...DEFAULT_PREVIOUS_SEARCHES];
  return raw
    .map((item) => {
      if (typeof item === 'string') {
        return { term: item.trim(), tab: 'listings' as SearchTabType };
      }
      if (item && typeof item.term === 'string') {
        return {
          term: item.term.trim(),
          tab: (item.tab === 'seller' ? 'seller' : 'listings') as SearchTabType,
        };
      }
      return null;
    })
    .filter((item): item is SearchHistoryItem => !!item && item.term.length > 0);
}

let memoryHistory: SearchHistoryItem[] = [...DEFAULT_PREVIOUS_SEARCHES];
let isHydrated = false;
let hydrationPromise: Promise<SearchHistoryItem[]> | null = null;
const subscribers = new Set<(history: SearchHistoryItem[]) => void>();

function notifySubscribers(next: SearchHistoryItem[]) {
  memoryHistory = next;
  isHydrated = true;
  subscribers.forEach((fn) => fn(next));
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch((e) =>
    console.warn('[useSearchHistory] Failed to persist search history', e),
  );
}

async function hydrateHistory(): Promise<SearchHistoryItem[]> {
  if (isHydrated) return memoryHistory;
  if (!hydrationPromise) {
    hydrationPromise = (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (isHydrated) {
          return memoryHistory;
        }
        if (stored !== null) {
          const parsed = JSON.parse(stored);
          const normalized = normalizeHistory(parsed);
          memoryHistory = normalized;
          isHydrated = true;
          return normalized;
        }
      } catch (err) {
        console.warn('[useSearchHistory] Failed to load search history', err);
      }
      if (!isHydrated) {
        isHydrated = true;
      }
      return memoryHistory;
    })();
  }
  return hydrationPromise;
}

// Pre-hydrate on module evaluation
hydrateHistory();

export function useSearchHistory() {
  const [historyItems, setHistoryItems] = useState<SearchHistoryItem[]>(memoryHistory);
  const [isLoaded, setIsLoaded] = useState(isHydrated);

  useEffect(() => {
    let mounted = true;
    const handleChange = (history: SearchHistoryItem[]) => {
      if (mounted) setHistoryItems(history);
    };
    subscribers.add(handleChange);

    hydrateHistory().then((history) => {
      if (mounted) {
        setHistoryItems(history);
        setIsLoaded(true);
      }
    });

    return () => {
      mounted = false;
      subscribers.delete(handleChange);
    };
  }, []);

  const addSearch = useCallback(async (term: string, tab: SearchTabType = 'listings') => {
    const trimmed = term.trim();
    if (!trimmed) return;

    await hydrateHistory();
    const filtered = memoryHistory.filter(
      (item) => item.term.toLowerCase() !== trimmed.toLowerCase(),
    );
    const next: SearchHistoryItem[] = [{ term: trimmed, tab }, ...filtered].slice(0, 15);
    notifySubscribers(next);
  }, []);

  const removeSearch = useCallback(async (term: string) => {
    const trimmed = term.trim();
    await hydrateHistory();
    const next = memoryHistory.filter(
      (item) => item.term.toLowerCase() !== trimmed.toLowerCase(),
    );
    notifySubscribers(next);
  }, []);

  const clearAll = useCallback(() => {
    notifySubscribers([]);
  }, []);

  const previousSearches = useMemo(
    () => historyItems.map((item) => item.term),
    [historyItems],
  );

  return {
    previousSearches,
    historyItems,
    isLoaded,
    addSearch,
    removeSearch,
    clearAll,
  };
}
