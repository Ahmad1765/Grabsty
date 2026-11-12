import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { orderReference, trackingIdFor } from './orderTracking';

describe('order reference / tracking id', () => {
  const id = 'a9ac3ee6-47bf-4e98-b4e9-7c3004673159';
  it('is the first 12 hex of the order id, upper-cased (matches order_reference() in SQL)', () => {
    expect(orderReference(id)).toBe('A9AC3EE647BF');
  });
  it('prefixes the tracking id', () => {
    expect(trackingIdFor(id)).toBe('GRB-A9AC3EE647BF');
  });
});
