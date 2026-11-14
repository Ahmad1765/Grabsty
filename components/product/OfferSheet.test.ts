import { describe, it, expect } from 'vitest';
import { orderTotal, buyerProtectionFee } from '@/lib/fees';
import { formatPrice } from '@/lib/currency';
import {
  OFFER_PRESET_TIERS,
  calculateTierPrices,
  counterRange,
  defaultCounterAmount,
  isValidOfferAmount,
} from './offerHelpers';

describe('OfferSheet calculations and formatting', () => {
  it('contains the 5 preset tiers from Reference Image 7', () => {
    const labels = OFFER_PRESET_TIERS.map((t) => t.label);
    expect(labels).toEqual(['-20%', '-15%', '-10%', '-5%', 'Custom']);
  });

  it('calculates the exact reference discount amounts for $180 asking price (Image 7)', () => {
    const askingPrice = 180;
    const tiers = calculateTierPrices(askingPrice);

    // -20% of 180 is 144 (exact match to Image 7 $144)
    expect(tiers['20']).toBe(144);
    expect(tiers['15']).toBe(153);
    expect(tiers['10']).toBe(162);
    expect(tiers['5']).toBe(171);
  });

  it('handles higher asking prices with clean integer rounding', () => {
    const askingPrice = 155;
    const tiers = calculateTierPrices(askingPrice);

    expect(tiers['10']).toBe(140);
    expect(tiers['20']).toBe(124);
  });

  it('validates offer amounts against asking price', () => {
    const askingPrice = 20;

    expect(isValidOfferAmount(15, askingPrice)).toBe(true);
    expect(isValidOfferAmount(18, askingPrice)).toBe(true);
    expect(isValidOfferAmount(0, askingPrice)).toBe(false);
    expect(isValidOfferAmount(-5, askingPrice)).toBe(false);
    expect(isValidOfferAmount(20, askingPrice)).toBe(false);
    expect(isValidOfferAmount(25, askingPrice)).toBe(false);
  });

  it('DEV-010: a buyer offer starts at half the asking price (rounded up); a seller counter only beats the buyer', () => {
    expect(isValidOfferAmount(1, 1500)).toBe(false);
    expect(isValidOfferAmount(749, 1500)).toBe(false);
    expect(isValidOfferAmount(750, 1500)).toBe(true);
    expect(isValidOfferAmount(750, 1499)).toBe(true); // ceil(749.5) = 750
    expect(isValidOfferAmount(749, 1499)).toBe(false);
    // buyer countering a seller counter: same floor
    expect(isValidOfferAmount(700, 1500, counterRange({ metadata: { amount: 1400 } }, false))).toBe(false);
    // seller countering an old 600 offer: above it is enough
    expect(isValidOfferAmount(650, 1500, counterRange({ metadata: { amount: 600 } }, true))).toBe(true);
  });

  // WEB-002: buyer offers 1,300 on a 1,500 item; the old -20% default (1,200) undercut it.
  it('keeps a seller counter between the buyer offer and the asking price', () => {
    const range = counterRange({ metadata: { amount: 1300 } }, true);
    expect(range).toEqual({ min: 1300 });
    expect(isValidOfferAmount(1200, 1500, range)).toBe(false);
    expect(isValidOfferAmount(1300, 1500, range)).toBe(false);
    expect(isValidOfferAmount(1400, 1500, range)).toBe(true);
    expect(isValidOfferAmount(1500, 1500, range)).toBe(false);
    expect(defaultCounterAmount(1300, 1500)).toBe(1400);
    expect(defaultCounterAmount(1499, 1500)).toBeNull();
  });

  it('keeps a buyer counter below the seller counter', () => {
    const range = counterRange({ metadata: { amount: 1400 } }, false);
    expect(range).toEqual({ max: 1400 });
    expect(isValidOfferAmount(1350, 1500, range)).toBe(true);
    expect(isValidOfferAmount(1400, 1500, range)).toBe(false);
    expect(counterRange(null, true)).toBeUndefined();
  });

  it('computes buyer total with buyer protection fee included', () => {
    const offerAmount = 144;
    const fee = buyerProtectionFee(offerAmount);
    const total = orderTotal(offerAmount);

    expect(total).toBe(offerAmount + fee);
    expect(formatPrice(total)).toBe(formatPrice(offerAmount + fee));
  });
});
