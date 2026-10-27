import type { LocalImage } from '@/lib/upload';

// One picked photo in the Sell form; `id` keys the thumbnail grid.
export type PhotoSlot = { id: string; original: LocalImage };
