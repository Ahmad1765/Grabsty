import type { Category, Condition, Gender, Listing } from '@/types';
import type { PhotoSlot } from '@/lib/photoSlots';
import type { SellFormValues, ParcelSize } from '@/lib/schemas/sell';
import { queryClient } from '@/lib/queryClient';
import {
  qk,
  LISTING_QUERY_PREFIXES,
} from '@/lib/queries/keys';
import type { QueryClient } from '@tanstack/react-query';

export function createDefaultSellValues(): SellFormValues {
  return {
    slots: [],
    title: '',
    description: '',
    price: '',
    brand: '',
    size: '',
    condition: null,
    category: null,
    subcategory: null,
    color: null,
    gender: null,
    tags: [],
    parcelSize: null,
    authenticity: null,
  };
}

export function listingToSellFormValues(listing: Listing | null | undefined): SellFormValues {
  if (!listing) return createDefaultSellValues();
  const initialSlots: PhotoSlot[] = (listing.images ?? []).filter(Boolean).map((url, i) => ({
    id: `existing-${i}-${url}`,
    original: { uri: url, base64: null },
  }));

  return {
    slots: initialSlots,
    title: listing.title || '',
    description: listing.description || '',
    price: listing.price != null ? String(listing.price) : '',
    brand: listing.brand || '',
    size: listing.size || '',
    condition: (listing.condition as Condition) || null,
    category: (listing.category as Category) || null,
    subcategory: listing.subcategory || null,
    color: listing.color || null,
    gender: (listing.gender as Gender) || null,
    tags: Array.isArray(listing.tags) ? listing.tags : [],
    parcelSize: (listing.parcel_size as ParcelSize) || null,
    authenticity: (listing.authenticity as any) || null,
  };
}

export function patchListingInCache(
  listingId: string,
  updatedListing: Listing,
  qc: QueryClient = queryClient,
): void {
  // 1. Authoritative direct detail update (stamped fresh, prevents refetch flicker)
  qc.setQueryData<Listing>(qk.listing(listingId), updatedListing);

  // 2. Generic helper that handles both flat arrays (Listing[]) and infinite query structures ({ pages: Listing[][] })
  const patchItem = (item: any) =>
    item && item.id === listingId ? { ...item, ...updatedListing } : item;

  const patchData = (old: any) => {
    if (!old) return old;
    if (Array.isArray(old)) {
      return old.map(patchItem);
    }
    if (old.pages && Array.isArray(old.pages)) {
      return {
        ...old,
        pages: old.pages.map((page: any) => (Array.isArray(page) ? page.map(patchItem) : page)),
      };
    }
    return old;
  };

  // Synchronously update all feed and listing queries in memory using listing query prefixes:
  for (const prefix of LISTING_QUERY_PREFIXES) {
    qc.setQueriesData({ queryKey: [prefix] }, patchData);
  }
}

/**
 * Splits comma-delimited input into separate tag candidates, trims and normalizes
 * (strips `#`, converts to lowercase), deduplicates against existing tags, and caps at maxTags (default 10).
 */
export function parseTagInput(
  candidate: string,
  existingTags: string[] = [],
  maxTags = 10,
): string[] {
  const parts = candidate.split(',');
  const next = existingTags.slice(0, Math.max(0, maxTags));
  for (const part of parts) {
    const raw = part.trim().replace(/#/g, '').toLowerCase();
    if (raw && !next.includes(raw) && next.length < maxTags) {
      next.push(raw);
    }
  }
  return next;
}

