export const OFFER_PRESET_TIERS = [
  { id: '20', label: '-20%', rate: 0.8 },
  { id: '15', label: '-15%', rate: 0.85 },
  { id: '10', label: '-10%', rate: 0.9 },
  { id: '5', label: '-5%', rate: 0.95 },
  { id: 'custom', label: 'Custom', rate: null },
] as const;

export type OfferTierId = (typeof OFFER_PRESET_TIERS)[number]['id'];

export function calculateTierPrices(askingPrice: number): Record<Exclude<OfferTierId, 'custom'>, number> {
  return {
    '20': Math.max(1, Math.round(askingPrice * 0.8)),
    '15': Math.max(1, Math.round(askingPrice * 0.85)),
    '10': Math.max(1, Math.round(askingPrice * 0.9)),
    '5': Math.max(1, Math.round(askingPrice * 0.95)),
  };
}

/** An unanswered offer lapses after this long; matches offers.expires_at and the server sweep. */
export const OFFER_TTL_MS = 24 * 3600 * 1000;

/** Exclusive bounds for a counter-offer: above `min`, below `max` (defaults to the asking price). */
export type OfferRange = { min?: number; max?: number };

export function isValidOfferAmount(amount: number, askingPrice: number, range?: OfferRange): boolean {
  const max = range?.max ?? askingPrice;
  return amount > (range?.min ?? 0) && (max <= 0 || amount < max);
}

/**
 * Bounds for countering `parent` (an offer message): a seller counters above the
 * buyer's offer (and below the asking price; a bundle's ceiling is left to the
 * server), a buyer counters below the seller's offer.
 */
export function counterRange(
  parent: { metadata?: unknown } | null,
  isSeller: boolean,
): OfferRange | undefined {
  const meta = (parent?.metadata ?? null) as { amount?: unknown; bundle_item_ids?: unknown } | null;
  const amount = Number(meta?.amount);
  if (!parent || !Number.isFinite(amount) || amount <= 0) return undefined;
  if (!isSeller) return { max: amount };
  const isBundle = Array.isArray(meta?.bundle_item_ids) && meta.bundle_item_ids.length > 0;
  return isBundle ? { min: amount, max: Infinity } : { min: amount };
}

/** Halfway between the two bounds, or null when no whole rupee fits between them. */
export function defaultCounterAmount(min: number, max: number): number | null {
  const mid = Math.round((min + max) / 2);
  return mid > min && mid < max ? mid : null;
}
