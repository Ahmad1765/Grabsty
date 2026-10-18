// Buyer Protection — the single source of truth for what a buyer pays on top
// of the item price. Every surface that shows or charges a total (product page,
// payment sheet, invoice, and the create-checkout-session edge function) must
// derive its numbers from here so the buyer is never shown one price and
// charged another.
//
// Fee mode:
//   'flat'       — a fixed PKR amount on every order (e.g. Rs 5 flat).
//   'percentage' — a % of the item price (e.g. 5% of Rs 2,000 → Rs 100).
//
// Switch BUYER_PROTECTION_MODE to whichever model you want. Only that
// constant's partner value is used; the other is ignored.
//
// IMPORTANT: the edge function re-implements this same math in Deno
// (supabase/functions/create-checkout-session). Keep the two in sync.

import type { ShippingMethod } from '@/types';

/** Choose 'flat' for a fixed fee, or 'percentage' for a % of item price. */
export const BUYER_PROTECTION_MODE: 'flat' | 'percentage' = 'percentage';

/** Flat Buyer Protection fee in PKR. Used when BUYER_PROTECTION_MODE = 'flat'. */
export const BUYER_PROTECTION_FEE = 6;

/**
 * Percentage Buyer Protection fee (0–100). Used when
 * BUYER_PROTECTION_MODE = 'percentage'.
 * Example: set to 5 for a 5% fee.
 */
export const BUYER_PROTECTION_PERCENTAGE = 6;

/** Platform-managed delivery fee in PKR (doorstep pickup from seller + delivery by Grabsty). */
export const MANAGED_SHIPPING_FEE = 250;

/** Parcel delivery rates in PKR based on parcel size. */
export const PARCEL_DELIVERY_RATES = {
  small: 130,
  medium: 130,
  large: 180,
} as const;

/** Default delivery fee for standard small/medium parcel in PKR. */
export const DEFAULT_PARCEL_DELIVERY_FEE = 130;

/**
 * Returns the courier delivery fee in PKR based on parcel size.
 * Small & Medium: 130 PKR.
 * Large: 180 PKR.
 */
export function getParcelDeliveryFee(parcelSize?: string | null): number {
  if (parcelSize === 'large') return PARCEL_DELIVERY_RATES.large;
  return PARCEL_DELIVERY_RATES.medium; // 130 PKR for small, medium, or unspecified
}

/** Default shipping fee in PKR (free / zero-fee platform basis for self-ship). */
export const DEFAULT_SHIPPING_FEE = 0;

/**
 * Calculates shipping fee depending on chosen shipping method and optional parcel size.
 * 'managed' with parcel size -> PKR 130 (small/medium) or PKR 180 (large).
 * 'self_ship' -> PKR 0 platform fee (seller transfers/ships directly).
 */
export function getShippingFee(
  method?: ShippingMethod | string | null,
  parcelSize?: string | null,
): number {
  if (method === 'managed') {
    if (parcelSize !== undefined) {
      return getParcelDeliveryFee(parcelSize);
    }
    return MANAGED_SHIPPING_FEE;
  }
  return DEFAULT_SHIPPING_FEE;
}

/**
 * Calculates shipping fee depending on chosen shipping method.
 *
 * @param _compatItemPrice - Retained strictly for legacy call-site compatibility;
 *   platform delivery fees are determined by delivery method, not item price.
 * @param method - Chosen shipping method ('managed' | 'self_ship').
 */
export function shippingFee(
  _compatItemPrice?: number | string | null | undefined,
  method?: ShippingMethod | string | null,
): number {
  if (method) return getShippingFee(method);
  return DEFAULT_SHIPPING_FEE;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Coerce anything into a clean, non-negative price. */
function safePrice(itemPrice: number | string | null | undefined): number {
  const n = typeof itemPrice === 'string' ? parseFloat(itemPrice) : Number(itemPrice);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * The Buyer Protection fee added to a given item price, in PKR.
 *
 * Calculates either a flat fee or a percentage of the item price,
 * depending on BUYER_PROTECTION_MODE.
 */
export function buyerProtectionFee(itemPrice: number | string | null | undefined): number {
  const price = safePrice(itemPrice);
  if (price <= 0) return 0;
  if (BUYER_PROTECTION_MODE === 'percentage') {
    return round2(round2(price) * (BUYER_PROTECTION_PERCENTAGE / 100));
  }
  return BUYER_PROTECTION_FEE;
}

/** What the buyer actually pays: item price + Buyer Protection. */
export function orderTotal(itemPrice: number | string | null | undefined): number {
  const price = safePrice(itemPrice);
  if (price <= 0) return 0;
  return round2(price + buyerProtectionFee(price));
}

/** Full breakdown for a price row / sheet, all in the store currency. */
export function priceBreakdown(itemPrice: number | string | null | undefined) {
  const item = round2(safePrice(itemPrice));
  const protection = buyerProtectionFee(item);
  return { item, protection, total: round2(item + protection) };
}

// Money formatting lives in lib/currency.ts (PKR). Re-exported here so the
// checkout surfaces that already import from lib/fees keep one import.
export { formatPrice } from './currency';
