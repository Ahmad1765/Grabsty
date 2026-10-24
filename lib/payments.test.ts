import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Linking: { openURL: vi.fn() },
}));

import { fetchOrderForListing } from './payments';
import { supabase } from './supabase';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe('lib/payments fetchOrderForListing dual-lookup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Both lookups (by order id, by listing id) now start together, so every
  // test's query builder must support both chains.
  function mockBothLookups(directData: unknown, listingData: unknown) {
    const maybeDirect = vi.fn().mockResolvedValue({ data: directData, error: null });
    const maybeListing = vi.fn().mockResolvedValue({ data: listingData, error: null });
    const eqMock = vi.fn((col: string) =>
      col === 'id'
        ? { maybeSingle: maybeDirect }
        : { neq: () => ({ order: () => ({ limit: () => ({ maybeSingle: maybeListing }) }) }) },
    );
    (supabase.from as any).mockReturnValue({ select: vi.fn().mockReturnValue({ eq: eqMock }) });
    return { eqMock, maybeDirect, maybeListing };
  }

  const mockOrderData = {
    id: 'a0000000-0000-0000-0000-000000000001',
    listing_id: 'b0000000-0000-0000-0000-000000000002',
    buyer_id: 'c0000000-0000-0000-0000-000000000003',
    seller_id: 'd0000000-0000-0000-0000-000000000004',
    amount_cents: 50000,
    fee_cents: 2500,
    status: 'paid',
    order_seller_pickups: [{ pickup_address: { city: 'Lahore', line1: 'Main Blvd' } }],
    listing: [{ id: 'b0000000-0000-0000-0000-000000000002', title: 'Vintage Jacket', price: 500 }],
  };

  it('resolves directly by order UUID when an order UUID is passed', async () => {
    const { eqMock } = mockBothLookups(mockOrderData, null);

    const res = await fetchOrderForListing('a0000000-0000-0000-0000-000000000001');

    expect(supabase.from).toHaveBeenCalledWith('orders');
    expect(eqMock).toHaveBeenCalledWith('id', 'a0000000-0000-0000-0000-000000000001');
    expect(res).not.toBeNull();
    expect(res?.id).toBe('a0000000-0000-0000-0000-000000000001');
    expect(res?.seller_pickup_address).toEqual({ city: 'Lahore', line1: 'Main Blvd' });
    expect(res?.listing).toEqual({ id: 'b0000000-0000-0000-0000-000000000002', title: 'Vintage Jacket', price: 500 });
  });

  it('falls back to listing_id if direct UUID lookup yields no order', async () => {
    // 1st call for eq('id', ...) returns null
    const maybeSingleDirect = vi.fn().mockResolvedValue({
      data: null,
      error: null,
    });
    const eqDirect = vi.fn().mockReturnValue({ maybeSingle: maybeSingleDirect });

    // 2nd call for eq('listing_id', ...) returns order
    const maybeSingleFallback = vi.fn().mockResolvedValue({
      data: mockOrderData,
      error: null,
    });
    const limitFallback = vi.fn().mockReturnValue({ maybeSingle: maybeSingleFallback });
    const orderFallback = vi.fn().mockReturnValue({ limit: limitFallback });
    const neqFallback = vi.fn().mockReturnValue({ order: orderFallback });
    const eqFallback = vi.fn().mockReturnValue({ neq: neqFallback });

    const selectMock = vi.fn()
      .mockReturnValueOnce({ eq: eqDirect })
      .mockReturnValueOnce({ eq: eqFallback });

    (supabase.from as any).mockReturnValue({
      select: selectMock,
    });

    const res = await fetchOrderForListing('b0000000-0000-0000-0000-000000000002');

    expect(eqDirect).toHaveBeenCalledWith('id', 'b0000000-0000-0000-0000-000000000002');
    expect(eqFallback).toHaveBeenCalledWith('listing_id', 'b0000000-0000-0000-0000-000000000002');
    expect(res).not.toBeNull();
    expect(res?.listing_id).toBe('b0000000-0000-0000-0000-000000000002');
  });

  it('normalizes listing and pickup object when returned as non-arrays', async () => {
    const singleObjOrder = {
      ...mockOrderData,
      order_seller_pickups: { pickup_address: { city: 'Karachi' } },
      listing: { id: 'listing-1', title: 'Silk Scarf' },
    };

    mockBothLookups(singleObjOrder, null);

    const res = await fetchOrderForListing('a0000000-0000-0000-0000-000000000001');

    expect(res?.seller_pickup_address).toEqual({ city: 'Karachi' });
    expect(res?.listing).toEqual({ id: 'listing-1', title: 'Silk Scarf' });
  });

  it('starts both lookups before either finishes (one round trip, not two)', async () => {
    const { eqMock } = mockBothLookups(null, mockOrderData);
    const pending = fetchOrderForListing('b0000000-0000-0000-0000-000000000002');
    expect(eqMock.mock.calls.map((c) => c[0])).toEqual(['id', 'listing_id']);
    const res = await pending;
    expect(res?.listing_id).toBe('b0000000-0000-0000-0000-000000000002');
  });

  it('prefers the direct order match when both lookups return a row', async () => {
    mockBothLookups({ ...mockOrderData, id: 'direct' }, { ...mockOrderData, id: 'by-listing' });
    const res = await fetchOrderForListing('a0000000-0000-0000-0000-000000000001');
    expect(res?.id).toBe('direct');
  });

  it('returns null immediately for non-UUID strings without querying Supabase', async () => {
    const res = await fetchOrderForListing('cod_mock_123456');
    expect(res).toBeNull();
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
