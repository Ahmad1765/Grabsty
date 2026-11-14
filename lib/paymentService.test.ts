import { describe, it, expect, vi } from 'vitest';
import { supabase } from '@/lib/supabase';
import {
  paymentService,
  CodPaymentProvider,
  StripePaymentProvider,
} from '@/lib/paymentService';
import { ShippingAddressSchema, CheckoutPayloadSchema } from '@/types/validation/order';

vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
  NativeModules: {},
}));

const mockQueryBuilder = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  neq: vi.fn().mockReturnThis(),
  not: vi.fn().mockReturnThis(),
  or: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  then: vi.fn((onfulfilled?: ((value: any) => any) | null, onrejected?: ((reason: any) => any) | null) =>
    Promise.resolve({ data: [], error: null }).then(onfulfilled, onrejected),
  ),
};

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'function not found' } }),
    from: vi.fn(() => mockQueryBuilder),
    functions: {
      invoke: vi.fn(),
    },
  },
}));

vi.mock('@/lib/analytics', () => ({
  capture: vi.fn(),
}));

describe('ShippingAddressSchema (Zod Strict Validation)', () => {
  const validAddress = {
    recipientName: 'Muhammad Ahmad',
    phone: '03254864702',
    line1: 'E-381 Block C Nishat Colony',
    line2: 'Flat 3B',
    city: 'Lahore',
    state: 'Punjab',
    postalCode: '54000',
    country: 'Pakistan',
    deliveryInstructions: 'Ring doorbell twice',
    coordinates: { lat: 31.5204, lng: 74.3587 },
  };

  it('validates a complete address with optional coordinates and delivery instructions', () => {
    const result = ShippingAddressSchema.safeParse(validAddress);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.coordinates?.lat).toBe(31.5204);
      expect(result.data.deliveryInstructions).toBe('Ring doorbell twice');
    }
  });

  it('allows optional line2, deliveryInstructions, and coordinates to be null or omitted', () => {
    const minimal = {
      recipientName: 'Jane Doe',
      phone: '03001234567',
      line1: '456 Main Street',
      city: 'Karachi',
      state: 'Sindh',
      postalCode: '75000',
      country: 'Pakistan',
    };
    const result = ShippingAddressSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.line2).toBeNull();
      expect(result.data.coordinates).toBeNull();
    }
  });

  it('parses successfully when line2, deliveryInstructions, and coordinates are explicitly null', () => {
    const withNulls = {
      recipientName: 'Null Test User',
      phone: '03009876543',
      line1: '789 Null Street',
      city: 'Lahore',
      state: 'Punjab',
      postalCode: '54000',
      country: 'Pakistan',
      line2: null,
      deliveryInstructions: null,
      coordinates: null,
    };
    const result = ShippingAddressSchema.safeParse(withNulls);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.line2).toBeNull();
      expect(result.data.deliveryInstructions).toBeNull();
      expect(result.data.coordinates).toBeNull();
    }
  });

  it('rejects missing or short recipient name', () => {
    const invalid = { ...validAddress, recipientName: 'A' };
    expect(ShippingAddressSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects invalid coordinates outside bounds', () => {
    const invalid = { ...validAddress, coordinates: { lat: 95, lng: 74 } };
    expect(ShippingAddressSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects short phone number', () => {
    const invalid = { ...validAddress, phone: '123' };
    expect(ShippingAddressSchema.safeParse(invalid).success).toBe(false);
  });
});

describe('CheckoutPayloadSchema (offerAmount & Order Validation)', () => {
  const validPayload = {
    listingId: '11111111-1111-1111-1111-111111111111',
    buyerId: '22222222-2222-2222-2222-222222222222',
    paymentMethod: 'cod' as const,
    shippingAddress: {
      recipientName: 'Muhammad Ahmad',
      phone: '03254864702',
      line1: 'E-381 Block C Nishat Colony',
      city: 'Lahore',
      state: 'Punjab',
      postalCode: '54000',
      country: 'Pakistan',
    },
  };

  it('validates a payload with optional and nullable offerAmount', () => {
    expect(CheckoutPayloadSchema.safeParse(validPayload).success).toBe(true);
    expect(CheckoutPayloadSchema.safeParse({ ...validPayload, offerAmount: null }).success).toBe(true);
    expect(CheckoutPayloadSchema.safeParse({ ...validPayload, offerAmount: 1500 }).success).toBe(true);
    expect(CheckoutPayloadSchema.safeParse({ ...validPayload, offerAmount: 1500.5 }).success).toBe(true);
    expect(CheckoutPayloadSchema.safeParse({ ...validPayload, offerAmount: 1500.99 }).success).toBe(true);
  });

  it('accepts max safe integer cents bound for offerAmount', () => {
    expect(CheckoutPayloadSchema.safeParse({ ...validPayload, offerAmount: 21474836.47 }).success).toBe(true);
  });

  it('rejects offerAmount exceeding max safe integer cents bound', () => {
    expect(CheckoutPayloadSchema.safeParse({ ...validPayload, offerAmount: 21474836.48 }).success).toBe(false);
    expect(CheckoutPayloadSchema.safeParse({ ...validPayload, offerAmount: 30000000 }).success).toBe(false);
  });

  it('rejects non-positive offerAmount', () => {
    expect(CheckoutPayloadSchema.safeParse({ ...validPayload, offerAmount: 0 }).success).toBe(false);
    expect(CheckoutPayloadSchema.safeParse({ ...validPayload, offerAmount: -10 }).success).toBe(false);
  });

  it('rejects offerAmount with more than two decimal places', () => {
    expect(CheckoutPayloadSchema.safeParse({ ...validPayload, offerAmount: 15.123 }).success).toBe(false);
    expect(CheckoutPayloadSchema.safeParse({ ...validPayload, offerAmount: 9.999 }).success).toBe(false);
  });

  it('validates optional bundleItemIds with valid UUIDs', () => {
    expect(
      CheckoutPayloadSchema.safeParse({
        ...validPayload,
        bundleItemIds: [
          '33333333-3333-3333-3333-333333333333',
          '44444444-4444-4444-4444-444444444444',
        ],
      }).success,
    ).toBe(true);

    expect(
      CheckoutPayloadSchema.safeParse({
        ...validPayload,
        bundleItemIds: [],
      }).success,
    ).toBe(true);
  });

  it('rejects bundleItemIds containing non-UUID values', () => {
    const res = CheckoutPayloadSchema.safeParse({
      ...validPayload,
      bundleItemIds: ['not-a-uuid'],
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0].message).toBe('Invalid bundle item ID');
    }
  });
});

describe('CodPaymentProvider (Atomic RPC integration)', () => {
  const provider = new CodPaymentProvider();
  const validAddress = {
    recipient_name: 'Ahmed Khan',
    phone: '03211234567',
    line1: 'House 12, Street 5',
    city: 'Islamabad',
    state: 'Islamabad',
    postal_code: '44000',
    country: 'Pakistan',
  };

  it('throws error if shipping address is absent for CoD', async () => {
    await expect(
      provider.processCheckout({
        listingId: '11111111-1111-1111-1111-111111111111',
        paymentMethod: 'cod',
        listingPrice: 2500,
        shippingAddress: null,
      }),
    ).rejects.toThrow('Shipping address is required for Cash on Delivery');
  });

  it('successfully executes CoD order creation in demo/fallback mode', async () => {
    const result = await provider.processCheckout({
      listingId: '11111111-1111-1111-1111-111111111111',
      paymentMethod: 'cod',
      listingPrice: 2500,
      buyerId: 'buyer-uuid',
      sellerId: 'seller-uuid',
      shippingAddress: validAddress,
      deliveryNotes: 'Leave with guard',
    });

    expect(result.success).toBe(true);
    expect(result.paymentMethod).toBe('cod');
    expect(result.status).toBe('pending');
    expect(result.order?.payment_method).toBe('cod');
    expect(result.order?.status).toBe('pending');
    expect(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.orderId!)).toBe(true);
  });
});

describe('StripePaymentProvider (PCI-Compliant Mock / Gateway)', () => {
  const provider = new StripePaymentProvider();

  it('processes card checkout and simulates instant paid state in demo mode', async () => {
    const result = await provider.processCheckout({
      listingId: '22222222-2222-2222-2222-222222222222',
      paymentMethod: 'card',
      listingPrice: 4500,
      buyerId: 'buyer-uuid',
      sellerId: 'seller-uuid',
    });

    expect(result.success).toBe(true);
    expect(result.paymentMethod).toBe('card');
    expect(result.status).toBe('paid');
    expect(result.sessionId).toBeDefined();
    expect(result.clientSecret).toBeDefined();
    expect(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.orderId!)).toBe(true);
  });
});

describe('PaymentService Dispatcher & Seller Completion', () => {
  it('dispatches to CoD provider when paymentMethod is cod', async () => {
    const result = await paymentService.checkout({
      listingId: '33333333-3333-3333-3333-333333333333',
      paymentMethod: 'cod',
      listingPrice: 1800,
      shippingAddress: {
        recipient_name: 'Sara Ali',
        phone: '03009876543',
        line1: 'Block A, DHA',
        city: 'Lahore',
        state: 'Punjab',
        postal_code: '54000',
        country: 'Pakistan',
      },
    });

    expect(result.success).toBe(true);
    expect(result.paymentMethod).toBe('cod');
    expect(result.status).toBe('pending');
  });

  it('handles cancelOrder in demo mode', async () => {
    const cancelled = await paymentService.cancelOrder({
      orderId: 'order-cancel-123',
      listingId: 'listing-123',
      reason: 'Buyer changed mind',
    });
    expect(cancelled.status).toBe('canceled');
    expect(cancelled.id).toBe('order-cancel-123');
  });

  it('orders a COD bundle with one process_checkout call covering every item', async () => {
    const provider = new CodPaymentProvider();
    const rpc = supabase.rpc as any;
    rpc.mockReset();
    rpc.mockResolvedValue({ data: { id: 'order-bundle-1', amount_cents: 180000, status: 'pending' }, error: null });

    const result = await provider.processCheckout({
      listingId: 'primary-listing-id',
      bundleItemIds: ['addon-1', 'addon-2'],
      paymentMethod: 'cod',
      shippingAddress: {
        recipient_name: 'Test Buyer',
        phone: '03001234567',
        line1: '123 Test St',
        city: 'Lahore',
        state: 'Punjab',
        postal_code: '54000',
        country: 'Pakistan',
      },
    });

    // A second per-item call would always fail: the first call already sold them.
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][1].p_bundle_item_ids).toEqual(['addon-1', 'addon-2']);
    expect(result.success).toBe(true);
    expect(result.orderId).toBe('order-bundle-1');
  });

  it('surfaces a failed COD checkout outside demo mode instead of faking an order', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('EXPO_PUBLIC_DEMO_MODE', '');
    vi.stubEnv('EXPO_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    try {
      (supabase.rpc as any).mockResolvedValue({ data: null, error: { message: 'Listing is already sold' } });
      await expect(
        new CodPaymentProvider().processCheckout({
          listingId: 'sold-listing',
          paymentMethod: 'cod',
          shippingAddress: {
            recipient_name: 'Test Buyer',
            phone: '03001234567',
            line1: '123 Test St',
            city: 'Lahore',
            state: 'Punjab',
            postal_code: '54000',
            country: 'Pakistan',
          },
        }),
      ).rejects.toThrow('Listing is already sold');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('passes shippingMethod to process_checkout RPC', async () => {
    const provider = new CodPaymentProvider();
    const rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: {
        id: 'order-shipping-method-123',
        amount_cents: 100000,
        status: 'pending',
        shipping_method: 'managed',
      },
      error: null,
    } as any);

    const result = await provider.processCheckout({
      listingId: 'listing-method-test',
      paymentMethod: 'cod',
      shippingMethod: 'managed',
      shippingAddress: {
        recipient_name: 'Test Buyer',
        phone: '03001234567',
        line1: '123 Test St',
        city: 'Lahore',
        state: 'Punjab',
        postal_code: '54000',
        country: 'Pakistan',
      },
    });

    expect(rpcSpy).toHaveBeenCalledWith(
      'process_checkout',
      expect.objectContaining({
        p_shipping_method: 'managed',
      }),
    );
    expect(result.success).toBe(true);
  });

  it('passes sellerPickupAddress to advance_order_fulfillment RPC', async () => {
    const rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: {
        id: 'order-pickup-123',
        fulfillment_status: 'packing',
        seller_pickup_address: { city: 'Lahore', line1: 'Street 5' },
      },
      error: null,
    } as any);

    const updated = await paymentService.advanceOrderFulfillment({
      orderId: 'order-pickup-123',
      targetStatus: 'packing',
      sellerPickupAddress: {
        recipientName: 'Seller Ahmad',
        phone: '03001234567',
        line1: 'Street 5',
        city: 'Lahore',
      },
    });

    expect(rpcSpy).toHaveBeenCalledWith(
      'advance_order_fulfillment',
      expect.objectContaining({
        p_target_status: 'packing',
        p_seller_pickup_address: {
          recipientName: 'Seller Ahmad',
          phone: '03001234567',
          line1: 'Street 5',
          city: 'Lahore',
        },
      }),
    );
    expect(updated.id).toBe('order-pickup-123');
  });

  it('fetches admin logistics orders with status filtering', async () => {
    mockQueryBuilder.not.mockClear();
    mockQueryBuilder.or.mockClear();

    const packingOrders = await paymentService.fetchAdminLogisticsOrders('packing', 20);
    expect(Array.isArray(packingOrders)).toBe(true);
    expect(mockQueryBuilder.not).toHaveBeenCalledWith(
      'status',
      'in',
      '("canceled","refunded","failed","refund_due")',
    );

    mockQueryBuilder.not.mockClear();

    const allOrders = await paymentService.fetchAdminLogisticsOrders('all', 20);
    expect(Array.isArray(allOrders)).toBe(true);
    expect(mockQueryBuilder.not).toHaveBeenCalledWith(
      'status',
      'in',
      '("canceled","refunded","failed","refund_due")',
    );

    const canceledOrders = await paymentService.fetchAdminLogisticsOrders('canceled', 20);
    expect(Array.isArray(canceledOrders)).toBe(true);
    expect(mockQueryBuilder.or).toHaveBeenCalledWith(
      'fulfillment_status.eq.canceled,status.eq.canceled,status.eq.refunded,status.eq.failed,status.eq.refund_due',
    );
  });

});


