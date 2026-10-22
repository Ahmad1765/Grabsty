import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  BUYER_PROTECTION_MODE,
  BUYER_PROTECTION_PERCENTAGE,
  buyerProtectionFee,
  orderTotal,
  priceBreakdown,
  formatPrice,
  MANAGED_SHIPPING_FEE,
  getShippingFee,
  shippingFee,
} from '@/lib/fees';

describe('getShippingFee', () => {
  it('returns MANAGED_SHIPPING_FEE (250 PKR) for managed delivery', () => {
    expect(getShippingFee('managed')).toBe(MANAGED_SHIPPING_FEE);
    expect(getShippingFee('managed')).toBe(250);
  });

  it('returns 0 for self_ship delivery', () => {
    expect(getShippingFee('self_ship')).toBe(0);
  });

  it('defaults to 0 for null or undefined', () => {
    expect(getShippingFee(null)).toBe(0);
    expect(getShippingFee(undefined)).toBe(0);
  });

  it('supports shippingFee helper with shipping method', () => {
    expect(shippingFee(500, 'managed')).toBe(250);
    expect(shippingFee(500, 'self_ship')).toBe(0);
  });

  it('supports parcel delivery rates: small and medium 130 PKR, large 180 PKR', () => {
    expect(getShippingFee('managed', 'small')).toBe(130);
    expect(getShippingFee('managed', 'medium')).toBe(130);
    expect(getShippingFee('managed', 'large')).toBe(180);
    expect(getShippingFee('managed', null)).toBe(130);
  });
});

describe('buyerProtectionFee', () => {
  it('calculates percentage fee correctly', () => {
    expect(buyerProtectionFee(500)).toBe(30);
    expect(buyerProtectionFee(5_000)).toBe(300);
    expect(buyerProtectionFee(50_000)).toBe(3000);
  });

  it('rounds to whole rupees (COD cash has no paise)', () => {
    expect(buyerProtectionFee(2_999)).toBe(180); // 179.94
    expect(buyerProtectionFee(1_234)).toBe(74); // 74.04
    expect(buyerProtectionFee(25)).toBe(2); // 1.5 rounds half up, like Postgres round()
    expect(orderTotal(2_999)).toBe(3_179);
  });

  it('scales proportionally with item price', () => {
    expect(buyerProtectionFee(100_000)).toBe(6000);
    expect(buyerProtectionFee(100)).toBe(6);
  });

  it('is zero for empty, zero, or invalid prices', () => {
    expect(buyerProtectionFee(0)).toBe(0);
    expect(buyerProtectionFee(-5)).toBe(0);
    expect(buyerProtectionFee(null)).toBe(0);
    expect(buyerProtectionFee(undefined)).toBe(0);
    expect(buyerProtectionFee('' as any)).toBe(0);
  });

  it('accepts numeric strings', () => {
    expect(buyerProtectionFee('1200')).toBe(72);
  });
});

describe('orderTotal', () => {
  it('is item price plus the buyer protection fee', () => {
    expect(orderTotal(500)).toBe(530);
    expect(orderTotal(5_000)).toBe(5_300);
    expect(orderTotal(50_000)).toBe(53_000);
  });

  it('is zero for invalid prices', () => {
    expect(orderTotal(0)).toBe(0);
    expect(orderTotal(null)).toBe(0);
  });
});

describe('priceBreakdown', () => {
  it('returns item, protection, and total that add up', () => {
    const { item, protection, total } = priceBreakdown(2_499);
    expect(item).toBe(2_499);
    expect(protection).toBe(150);
    expect(total).toBe(2_649);
    expect(item + protection).toBe(total);
  });

  it('shows no protection line for a priceless row', () => {
    expect(priceBreakdown(0)).toEqual({ item: 0, protection: 0, total: 0 });
  });
});

describe('the edge function copy of the fee', () => {
  // create-checkout-session runs on Deno and cannot import lib/fees.ts, so it
  // re-declares BUYER_PROTECTION_FEE. That duplicate is what the buyer is
  // actually charged; this file is what the buyer is shown. If they drift, the
  // app quotes one total and Stripe collects another — read the constant out of
  // the source rather than trusting the "keep in sync" comment above it.
  const source = readFileSync(
    path.resolve(__dirname, '../supabase/functions/create-checkout-session/index.ts'),
    'utf8',
  );

  it('declares the same percentage mode and percentage fee as lib/fees.ts', () => {
    const modeMatch = source.match(
      /const BUYER_PROTECTION_MODE(?::\s*[^=]+)?\s*=\s*['"]([^'"]+)['"]\s*;/,
    );
    expect(modeMatch, 'BUYER_PROTECTION_MODE not found in the edge function').not.toBeNull();
    expect(modeMatch![1]).toBe(BUYER_PROTECTION_MODE);

    const percentMatch = source.match(
      /const BUYER_PROTECTION_PERCENTAGE\s*=\s*(\d+(?:\.\d+)?)\s*;/,
    );
    expect(percentMatch, 'BUYER_PROTECTION_PERCENTAGE not found in the edge function').not.toBeNull();
    expect(Number(percentMatch![1])).toBe(BUYER_PROTECTION_PERCENTAGE);
  });

  it('still passes the split to the webhook as metadata', () => {
    // stripe-webhook derives fee_cents from this metadata instead of re-deriving
    // the formula. Drop it and every order silently records fee_cents = 0.
    expect(source).toContain("params.append('metadata[fee_cents]'");
  });
});

describe('formatPrice', () => {
  it('formats in PKR — whole amounts without decimals, fractional with two', () => {
    expect(formatPrice(1.75)).toBe('Rs 1.75');
    expect(formatPrice(1250)).toBe('Rs 1,250');
    expect(formatPrice(0)).toBe('Rs 0');
  });

  it('is safe on non-finite input', () => {
    expect(formatPrice(NaN)).toBe('Rs 0');
  });
});
