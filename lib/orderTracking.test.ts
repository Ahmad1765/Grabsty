import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { cashToCollect, codAmount, orderReference, trackingIdFor } from './orderTracking';

describe('order reference / tracking id', () => {
  const id = 'a9ac3ee6-47bf-4e98-b4e9-7c3004673159';
  it('is the first 12 hex of the order id, upper-cased (matches order_reference() in SQL)', () => {
    expect(orderReference(id)).toBe('A9AC3EE647BF');
  });
  it('prefixes the tracking id', () => {
    expect(trackingIdFor(id)).toBe('GRB-A9AC3EE647BF');
  });
});

// WF-009: the rider is told the exact cash to collect.
describe('cashToCollect', () => {
  it('formats the buyer total in whole rupees', () => {
    expect(cashToCollect(1720)).toBe('Collect Rs 1,720 in cash');
  });
  it('says nothing when there is no cash to collect', () => {
    expect(cashToCollect(null)).toBeNull();
    expect(cashToCollect(0)).toBeNull();
  });
});

describe('codAmount', () => {
  it('keeps the Rs label as written, for use inside a sentence', () => {
    expect(codAmount(1720)).toBe('Rs 1,720');
    expect(codAmount(undefined)).toBeNull();
  });
});
