import { describe, it, expect, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  createDefaultSellValues,
  listingToSellFormValues,
  patchListingInCache,
  parseTagInput,
} from './editHelpers';
import { qk } from '@/lib/queries/keys';
import type { Listing } from '@/types';

vi.mock('@/lib/queryClient', () => ({
  queryClient: {
    setQueryData: vi.fn(),
    setQueriesData: vi.fn(),
    invalidateQueries: vi.fn(),
    getQueryData: vi.fn(),
  },
}));

describe('createDefaultSellValues', () => {
  it('returns default empty values', () => {
    const values = createDefaultSellValues();
    expect(values.title).toBe('');
    expect(values.price).toBe('');
    expect(values.slots).toEqual([]);
    expect(values.tags).toEqual([]);
    expect(values.condition).toBeNull();
    expect(values.category).toBeNull();
    expect(values.gender).toBeNull();
    expect(values.parcelSize).toBeNull();
  });

  it('returns fresh array and object instances on every call', () => {
    const first = createDefaultSellValues();
    const second = createDefaultSellValues();
    expect(first).not.toBe(second);
    expect(first.slots).not.toBe(second.slots);
    expect(first.tags).not.toBe(second.tags);
  });
});

describe('listingToSellFormValues', () => {
  it('returns default empty values when no listing is provided', () => {
    const values = listingToSellFormValues(null);
    expect(values.title).toBe('');
    expect(values.price).toBe('');
    expect(values.slots).toEqual([]);
    expect(values.condition).toBeNull();
    expect(values.category).toBeNull();
    expect(values.gender).toBeNull();
  });

  it('returns fresh array instances on subsequent null/undefined calls', () => {
    const first = listingToSellFormValues(null);
    const second = listingToSellFormValues(undefined);
    expect(first).not.toBe(second);
    expect(first.slots).not.toBe(second.slots);
    expect(first.tags).not.toBe(second.tags);
  });

  it('correctly maps a full existing listing into form values and photo slots', () => {
    const mockListing: Listing = {
      id: 'listing-123',
      seller_id: 'user-456',
      seller: {
        id: 'user-456',
        username: 'testuser',
        avatar_url: null,
        full_name: 'Test User',
        bio: null,
        location: null,
        rating: 5,
        total_sales: 10,
        created_at: '2026-01-01T00:00:00Z',
      },
      title: 'Vintage Leather Jacket',
      description: 'Genuine leather, like new condition.',
      price: 15000,
      category: 'clothing',
      subcategory: 'jackets_coats',
      brand: 'Zara',
      size: 'L',
      condition: 'like_new',
      color: 'black',
      gender: 'men',
      parcel_size: 'medium',
      images: [
        'https://example.com/storage/listing-images/img1.jpg',
        'https://example.com/storage/listing-images/img2.jpg',
      ],
      thumbnails: [
        'https://example.com/storage/listing-images/img1_thumb.jpg',
        'https://example.com/storage/listing-images/img2_thumb.jpg',
      ],
      tags: ['leather', 'vintage', 'winter'],
      is_sold: false,
      views: 120,
      likes: 15,
      created_at: '2026-02-01T00:00:00Z',
    };

    const values = listingToSellFormValues(mockListing);

    expect(values.title).toBe('Vintage Leather Jacket');
    expect(values.description).toBe('Genuine leather, like new condition.');
    expect(values.price).toBe('15000');
    expect(values.category).toBe('clothing');
    expect(values.subcategory).toBe('jackets_coats');
    expect(values.brand).toBe('Zara');
    expect(values.size).toBe('L');
    expect(values.condition).toBe('like_new');
    expect(values.color).toBe('black');
    expect(values.gender).toBe('men');
    expect(values.parcelSize).toBe('medium');
    expect(values.tags).toEqual(['leather', 'vintage', 'winter']);

    expect(values.slots).toHaveLength(2);
    const [slot0, slot1] = values.slots as NonNullable<(typeof values.slots)[number]>[];
    expect(slot0?.original?.uri).toBe('https://example.com/storage/listing-images/img1.jpg');
    expect(slot1?.original?.uri).toBe('https://example.com/storage/listing-images/img2.jpg');
  });

  it('handles null optional fields gracefully', () => {
    const minimalListing: Listing = {
      id: 'listing-999',
      seller_id: 'user-456',
      seller: {} as any,
      title: 'Simple Tee',
      description: '',
      price: 2500,
      category: 'clothing',
      gender: 'unisex',
      condition: 'good',
      images: null,
      is_sold: false,
      views: 0,
      likes: 0,
      created_at: '2026-03-01T00:00:00Z',
      brand: null,
      size: null,
      color: null,
      subcategory: null,
      parcel_size: null,
      tags: undefined,
    };

    const values = listingToSellFormValues(minimalListing);

    expect(values.title).toBe('Simple Tee');
    expect(values.price).toBe('2500');
    expect(values.brand).toBe('');
    expect(values.size).toBe('');
    expect(values.color).toBeNull();
    expect(values.subcategory).toBeNull();
    expect(values.parcelSize).toBeNull();
    expect(values.tags).toEqual([]);
    expect(values.slots).toEqual([]);
  });
});

describe('patchListingInCache', () => {
  it('synchronously updates listing detail and all feed query arrays in TanStack Query cache', () => {
    const qc = new QueryClient();

    const originalListing: Listing = {
      id: 'item-888',
      seller_id: 'seller-1',
      seller: {} as any,
      title: 'Original Title',
      description: 'Original Desc',
      price: 1000,
      category: 'clothing',
      gender: 'women',
      condition: 'good',
      brand: null,
      size: null,
      images: ['https://example.com/img1.jpg'],
      is_sold: false,
      views: 10,
      likes: 2,
      created_at: '2026-01-01T00:00:00Z',
    };

    // Pre-populate query client with detail and feed lists
    qc.setQueryData(qk.listing('item-888'), originalListing);
    qc.setQueryData(qk.myFeedListings('user-1'), [originalListing]);
    qc.setQueryData(qk.userListings('seller-1'), [originalListing]);

    const updatedListing: Listing = {
      ...originalListing,
      title: 'Updated Title',
      price: 2500,
    };

    patchListingInCache('item-888', updatedListing, qc);

    // Detail query is updated immediately
    const updatedDetail = qc.getQueryData<Listing>(qk.listing('item-888'));
    expect(updatedDetail?.title).toBe('Updated Title');
    expect(updatedDetail?.price).toBe(2500);

    // Home feed query is updated immediately
    const updatedFeed = qc.getQueryData<Listing[]>(qk.myFeedListings('user-1'));
    expect(updatedFeed?.[0]?.price).toBe(2500);
    expect(updatedFeed?.[0]?.title).toBe('Updated Title');

    // Profile query is updated immediately
    const updatedUserListings = qc.getQueryData<Listing[]>(qk.userListings('seller-1'));
    expect(updatedUserListings?.[0]?.price).toBe(2500);
  });

  it('synchronously updates infinite-query paginated cache with pages and pageParams', () => {
    const qc = new QueryClient();

    const originalListing: Listing = {
      id: 'item-888',
      seller_id: 'seller-1',
      seller: {} as any,
      title: 'Original Title',
      description: 'Original Desc',
      price: 1000,
      category: 'clothing',
      gender: 'women',
      condition: 'good',
      brand: null,
      size: null,
      images: ['https://example.com/img1.jpg'],
      is_sold: false,
      views: 10,
      likes: 2,
      created_at: '2026-01-01T00:00:00Z',
    };

    const infiniteData = {
      pages: [
        [
          { id: 'other-1', title: 'Other Item', price: 500 } as Listing,
          originalListing,
        ],
        [
          { id: 'other-2', title: 'Second Page Item', price: 800 } as Listing,
        ],
      ],
      pageParams: [0, 1],
    };

    qc.setQueryData(qk.homeFeed('for_you', 'user-1'), infiniteData);

    const updatedListing: Listing = {
      ...originalListing,
      title: 'Updated Title',
      price: 2500,
    };

    patchListingInCache('item-888', updatedListing, qc);

    const updatedCache = qc.getQueryData<typeof infiniteData>(qk.homeFeed('for_you', 'user-1'));
    expect(updatedCache?.pageParams).toEqual([0, 1]);
    expect(updatedCache?.pages[0]?.[1]?.title).toBe('Updated Title');
    expect(updatedCache?.pages[0]?.[1]?.price).toBe(2500);
    expect(updatedCache?.pages[0]?.[0]?.title).toBe('Other Item');
    expect(updatedCache?.pages[1]?.[0]?.title).toBe('Second Page Item');
  });
});

describe('parseTagInput (TagsSheet tag-processing)', () => {
  it('splits comma-separated input such as "vintage, y2k"', () => {
    const result = parseTagInput('vintage, y2k', []);
    expect(result).toEqual(['vintage', 'y2k']);
  });

  it('normalizes candidates by trimming whitespace and converting to lowercase', () => {
    const result = parseTagInput('  Oversized ,  STREETWEAR  ', []);
    expect(result).toEqual(['oversized', 'streetwear']);
  });

  it('strips leading # hash characters', () => {
    const result = parseTagInput('#grunge, #aesthetic', []);
    expect(result).toEqual(['grunge', 'aesthetic']);
  });

  it('deduplicates against existing tags', () => {
    const result = parseTagInput('vintage, y2k, denim', ['vintage']);
    expect(result).toEqual(['vintage', 'y2k', 'denim']);
  });

  it('deduplicates repeated tags within the same input draft', () => {
    const result = parseTagInput('vintage, Y2K, vintage, y2k', []);
    expect(result).toEqual(['vintage', 'y2k']);
  });

  it('ignores empty tokens from multiple or trailing commas', () => {
    const result = parseTagInput('vintage, , , y2k, ', []);
    expect(result).toEqual(['vintage', 'y2k']);
  });

  it('caps total tags at 10 items when new candidates exceed limit', () => {
    const existing = ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8'];
    const result = parseTagInput('t9, t10, t11, t12', existing);
    expect(result).toHaveLength(10);
    expect(result).toEqual(['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9', 't10']);
  });

  it('preserves existing tags when already at 10 items limit', () => {
    const existing = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
    const result = parseTagInput('vintage, y2k', existing);
    expect(result).toEqual(existing);
  });

  it('honors lower custom limits and copies at most maxTags from existingTags', () => {
    const existing = ['t1', 't2', 't3', 't4', 't5'];
    const result = parseTagInput('t6, t7', existing, 3);
    expect(result).toEqual(['t1', 't2', 't3']);
  });
});

