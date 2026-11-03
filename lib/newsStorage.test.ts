import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  markNewsItemOpened,
  MAX_OPENED_NEWS_ITEMS,
  _resetOpenedNewsIdsForTesting,
} from './newsStorage';

const mockStorage: Record<string, string> = {};

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => mockStorage[key] ?? null),
    setItem: vi.fn(async (key: string, val: string) => {
      mockStorage[key] = val;
    }),
    removeItem: vi.fn(async (key: string) => {
      delete mockStorage[key];
    }),
  },
}));

describe('lib/newsStorage', () => {
  beforeEach(() => {
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
    vi.clearAllMocks();
    _resetOpenedNewsIdsForTesting();
  });

  it('marks a news item as opened and persists it to AsyncStorage', async () => {
    await markNewsItemOpened('item-1');

    const stored = JSON.parse(mockStorage['@ceranix_opened_news_items'] || '[]');
    expect(stored).toEqual(['item-1']);
  });

  it('ignores duplicate IDs', async () => {
    await markNewsItemOpened('item-1');
    await markNewsItemOpened('item-1');

    const stored = JSON.parse(mockStorage['@ceranix_opened_news_items'] || '[]');
    expect(stored).toEqual(['item-1']);
  });

  it('ignores empty ID', async () => {
    await markNewsItemOpened('');
    expect(mockStorage['@ceranix_opened_news_items']).toBeUndefined();
  });

  it('caps persisted and in-memory list to MAX_OPENED_NEWS_ITEMS retaining only most recent', async () => {
    // Pre-populate with existing items up to MAX_OPENED_NEWS_ITEMS
    const initialItems = Array.from({ length: MAX_OPENED_NEWS_ITEMS }, (_, i) => `item-${i}`);
    mockStorage['@ceranix_opened_news_items'] = JSON.stringify(initialItems);

    // Add one more item
    await markNewsItemOpened('newest-item');

    const stored: string[] = JSON.parse(mockStorage['@ceranix_opened_news_items']);
    expect(stored.length).toBe(MAX_OPENED_NEWS_ITEMS);
    expect(stored[stored.length - 1]).toBe('newest-item');
    expect(stored[0]).toBe('item-1'); // Oldest item-0 was evicted
    expect(stored.includes('item-0')).toBe(false);
  });
});
