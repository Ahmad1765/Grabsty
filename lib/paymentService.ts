import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { BUYER_PROTECTION_FEE } from '@/lib/fees';
import {
  ShippingAddressSchema,
  type ValidatedShippingAddress,
} from '@/types/validation/order';
import type { Order, PaymentMethod, OrderStatus, FulfillmentStatus, ShippingMethod, SellerPickupAddress } from '@/types';
import { startDisputeSupportChat } from '@/lib/support';

export interface CheckoutRequest {
  listingId: string;
  paymentMethod: PaymentMethod;
  buyerId?: string;
  sellerId?: string;
  listingPrice?: number;
  offerAmount?: number | null;
  shippingAddress?: unknown;
  shippingMethod?: ShippingMethod;
  deliveryNotes?: string | null;
  bundleItemIds?: string[];
  expectedTotal?: number;
}

export interface CheckoutResult {
  success: boolean;
  orderId?: string;
  order?: Order | null;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  redirectUrl?: string;
  clientSecret?: string;
  sessionId?: string;
  message?: string;
  error?: string;
  failedBundleItemIds?: string[];
}

export interface PaymentProvider {
  readonly id: PaymentMethod;
  processCheckout(request: CheckoutRequest): Promise<CheckoutResult>;
}

const PK = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';
export const STRIPE_ENABLED = PK.startsWith('pk_test_') || PK.startsWith('pk_live_');

export function generateMockOrderId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function isDemoMode(): boolean {
  // Never inferred from a missing Stripe key: that is the production COD-only
  // configuration, where a failed RPC must surface instead of faking success.
  return process.env.EXPO_PUBLIC_DEMO_MODE === 'true' || process.env.NODE_ENV === 'test';
}

// ── Helper to normalize address shape for Zod validation ──────────────────────
export function normalizeAddressInput(input: any): any {
  if (!input || typeof input !== 'object') return null;
  return {
    recipientName: input.recipientName ?? input.recipient_name ?? '',
    phone: input.phone ?? '',
    line1: input.line1 ?? '',
    line2: input.line2 ?? null,
    city: input.city ?? '',
    state: input.state ?? '',
    postalCode: input.postalCode ?? input.postal_code ?? '',
    country: input.country ?? '',
    deliveryInstructions: input.deliveryInstructions ?? input.delivery_notes ?? null,
    coordinates: input.coordinates ?? null,
  };
}

export function toSnakeCaseAddress(addr: ValidatedShippingAddress | null | undefined): Record<string, any> | null {
  if (!addr) return null;
  return {
    recipient_name: addr.recipientName,
    phone: addr.phone,
    line1: addr.line1,
    line2: addr.line2 ?? null,
    city: addr.city,
    state: addr.state,
    postal_code: addr.postalCode,
    country: addr.country,
    delivery_notes: addr.deliveryInstructions ?? null,
    coordinates: addr.coordinates ?? null,
  };
}

// ── Cash on Delivery Provider ──────────────────────────────────────────────────
export class CodPaymentProvider implements PaymentProvider {
  readonly id = 'cod' as const;

  async processCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    if (!process.env.EXPO_PUBLIC_SUPABASE_URL && !isDemoMode()) {
      throw new Error('Supabase URL is not configured');
    }

    // 1. Strict Zod validation on shipping address before sending payload
    if (!request.shippingAddress) {
      throw new Error('Shipping address is required for Cash on Delivery');
    }

    const normalized = normalizeAddressInput(request.shippingAddress);
    const validatedAddress: ValidatedShippingAddress = ShippingAddressSchema.parse(normalized);

    // 2. Execute atomic Postgres RPC: process_checkout
    let rpcError: Error | null = null;
    try {
      const { data, error } = await supabase.rpc('process_checkout', {
        p_listing_id: request.listingId,
        p_buyer_id: request.buyerId ?? null,
        p_payment_method: 'cod',
        p_shipping_address: validatedAddress,
        p_offer_amount: request.offerAmount ?? null,
        p_delivery_notes: request.deliveryNotes?.trim() || validatedAddress.deliveryInstructions || null,
        p_shipping_method: request.shippingMethod ?? 'managed',
        p_bundle_item_ids: request.bundleItemIds?.length ? request.bundleItemIds : null,
        p_expected_total: request.expectedTotal ?? null,
      });

      if (!error && data) {
        return {
          success: true,
          orderId: data.id,
          order: data as Order,
          paymentMethod: 'cod',
          status: 'pending',
          message: 'Cash on delivery order placed successfully',
        };
      }

      if (error) {
        rpcError = new Error(error.message);
      }
    } catch (e: any) {
      rpcError = e instanceof Error ? e : new Error(String(e));
    }

    if (!isDemoMode()) {
      if (rpcError) throw rpcError;
      throw new Error('Checkout failed: could not create order');
    }

    // 3. Demo / Mock fallback (when running in demo mode)
    const itemPrice = request.offerAmount ?? request.listingPrice ?? 1000;
    const amountCents = Math.round(itemPrice * 100);
    const feeCents = Math.round(BUYER_PROTECTION_FEE * 100);
    const mockOrderId = generateMockOrderId();

    const mockOrder: Order = {
      id: mockOrderId,
      listing_id: request.listingId,
      buyer_id: request.buyerId ?? 'mock-buyer',
      seller_id: request.sellerId ?? 'mock-seller',
      amount_cents: amountCents,
      fee_cents: feeCents,
      currency: 'pkr',
      stripe_session_id: null,
      stripe_payment_intent: null,
      offer_message_id: null,
      payment_method: 'cod',
      status: 'pending',
      shipping_address: validatedAddress,
      delivery_notes: request.deliveryNotes ?? validatedAddress.deliveryInstructions ?? null,
      created_at: new Date().toISOString(),
    };

    return {
      success: true,
      orderId: mockOrderId,
      order: mockOrder,
      paymentMethod: 'cod',
      status: 'pending',
      message: 'Demo Cash on Delivery order placed successfully',
    };
  }
}

export class StripePaymentProvider implements PaymentProvider {
  readonly id = 'card' as const;

  async processCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    const itemPrice = request.offerAmount ?? request.listingPrice ?? 1000;
    const amountCents = Math.round(itemPrice * 100);
    const feeCents = Math.round(BUYER_PROTECTION_FEE * 100);

    // If Stripe is live and configured, invoke edge function for Checkout session
    if (STRIPE_ENABLED) {
      try {
        const returnUrl = this.buildReturnUrl(request.listingId);
        const { data, error } = await supabase.functions.invoke<{ url: string; sessionId: string }>(
          'create-checkout-session',
          {
            body: {
              listing_id: request.listingId,
              return_url: returnUrl,
              offer_amount: request.offerAmount ?? undefined,
            },
          },
        );

        if (!error && data?.url) {
          return {
            success: true,
            sessionId: data.sessionId,
            redirectUrl: data.url,
            paymentMethod: 'card',
            status: 'pending',
          };
        }
        console.warn('[paymentService] Stripe session creation failed, falling back to simulated checkout:', error?.message);
      } catch (err: any) {
        console.warn('[paymentService] Stripe edge function error, falling back to simulated checkout:', err?.message);
      }
    }

    if (!isDemoMode()) {
      throw new Error('Card payments are not configured and demo mode is disabled');
    }

    // Mock Stripe Payment Sheet / PaymentIntent simulation
    await new Promise((resolve) => setTimeout(resolve, 600));

    const mockSessionId = `cs_test_mock_${Date.now()}`;
    const mockPaymentIntent = `pi_test_mock_${Date.now()}`;
    const mockOrderId = generateMockOrderId();
    const mockOrder: Order = {
      id: mockOrderId,
      listing_id: request.listingId,
      buyer_id: request.buyerId ?? 'mock-buyer',
      seller_id: request.sellerId ?? 'mock-seller',
      amount_cents: amountCents,
      fee_cents: feeCents,
      currency: 'pkr',
      stripe_session_id: mockSessionId,
      stripe_payment_intent: mockPaymentIntent,
      offer_message_id: null,
      payment_method: 'card',
      status: 'paid',
      shipping_address: null,
      delivery_notes: request.deliveryNotes ?? null,
      created_at: new Date().toISOString(),
    };

    return {
      success: true,
      orderId: mockOrderId,
      order: mockOrder,
      sessionId: mockSessionId,
      clientSecret: `${mockPaymentIntent}_secret_test`,
      paymentMethod: 'card',
      status: 'paid',
      message: 'Demo Card payment processed successfully',
    };
  }

  private buildReturnUrl(listingId: string): string {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return `${window.location.origin}/invoice/${listingId}?paid=1`;
    }
    return `grabsty://invoice/${listingId}?paid=1`;
  }
}

type OrderUpdateListener = (listingId?: string | null) => void;
const orderUpdateListeners = new Set<OrderUpdateListener>();

export function onOrderUpdated(listener: OrderUpdateListener): () => void {
  orderUpdateListeners.add(listener);
  return () => {
    orderUpdateListeners.delete(listener);
  };
}

export function notifyOrderUpdated(listingId?: string | null): void {
  orderUpdateListeners.forEach((listener) => {
    try {
      listener(listingId);
    } catch {
      // Non-fatal subscriber error
    }
  });
}

// ── Payment Service Registry & Dispatcher ──────────────────────────────────────
export class PaymentService {
  private providers = new Map<PaymentMethod, PaymentProvider>();

  constructor() {
    this.registerProvider(new CodPaymentProvider());
    this.registerProvider(new StripePaymentProvider());
  }

  registerProvider(provider: PaymentProvider) {
    this.providers.set(provider.id, provider);
  }

  getProvider(method: PaymentMethod): PaymentProvider {
    const provider = this.providers.get(method);
    if (!provider) {
      throw new Error(`Unsupported payment method: ${method}`);
    }
    return provider;
  }

  async checkout(request: CheckoutRequest): Promise<CheckoutResult> {
    const provider = this.getProvider(request.paymentMethod);
    const result = await provider.processCheckout(request);
    if (result.success) {
      notifyOrderUpdated(request.listingId);
    }
    return result;
  }

  /**
   * Cancel an order (buyer or seller) and relist the item.
   */
  async cancelOrder({
    orderId,
    listingId,
    reason = 'Buyer requested cancellation',
  }: {
    orderId: string;
    listingId?: string;
    reason?: string;
  }): Promise<Order> {
    let rpcError: Error | null = null;
    try {
      const { data, error } = await supabase.rpc('cancel_order', {
        p_order_id: orderId,
        p_reason: reason,
      });

      if (!error && data) {
        notifyOrderUpdated(listingId ?? (data as Order)?.listing_id);
        return data as Order;
      }
      if (error) {
        rpcError = new Error(error.message);
      }
    } catch (e: any) {
      rpcError = e instanceof Error ? e : new Error(String(e));
    }

    if (!isDemoMode()) {
      throw rpcError || new Error('Failed to cancel order');
    }

    return {
      id: orderId,
      listing_id: listingId,
      status: 'canceled',
      amount_cents: 0,
      fee_cents: 0,
      currency: 'pkr',
      created_at: new Date().toISOString(),
    } as Order;
  }

  /**
   * Seller action to mark order as shipped with tracking.
   */
  async markOrderShipped({
    orderId,
    courier = 'Standard Delivery',
    trackingNumber = '',
  }: {
    orderId: string;
    courier?: string;
    trackingNumber?: string;
  }): Promise<Order> {
    let rpcError: Error | null = null;
    try {
      const { data, error } = await supabase.rpc('mark_order_shipped', {
        p_order_id: orderId,
        p_courier: courier,
        p_tracking_number: trackingNumber,
      });

      if (!error && data) {
        return data as Order;
      }
      if (error) {
        rpcError = new Error(error.message);
      }
    } catch (e: any) {
      rpcError = e instanceof Error ? e : new Error(String(e));
    }

    if (!isDemoMode()) {
      throw rpcError || new Error('Failed to mark order as shipped');
    }

    return {
      id: orderId,
      status: 'paid',
      amount_cents: 0,
      fee_cents: 0,
      currency: 'pkr',
      created_at: new Date().toISOString(),
    } as Order;
  }

  /**
   * Buyer action to confirm receipt and complete order.
   * Atomically transitions escrow to COMPLETED_FUNDS_RELEASED and marks order completed.
   */
  async confirmOrderReceived({ orderId }: { orderId: string }): Promise<Order> {
    let rpcError: Error | null = null;
    try {
      const { data, error } = await supabase.rpc('confirm_order_received', {
        p_order_id: orderId,
      });

      if (!error && data) {
        notifyOrderUpdated((data as Order)?.listing_id);
        return data as Order;
      }
      if (error) {
        rpcError = new Error(error.message);
      }
    } catch (e: any) {
      rpcError = e instanceof Error ? e : new Error(String(e));
    }

    if (!isDemoMode()) {
      throw rpcError || new Error('Failed to confirm order received');
    }

    return {
      id: orderId,
      status: 'completed',
      fulfillment_status: 'completed',
      escrow_status: 'COMPLETED_FUNDS_RELEASED',
      amount_cents: 0,
      fee_cents: 0,
      currency: 'pkr',
      created_at: new Date().toISOString(),
    } as Order;
  }

  /**
   * Dual Buyer & Seller action to confirm Cash on Delivery payment.
   * Both parties must select "Confirm COD Payment" to finalize the order.
   * Clears escrow and marks fulfillment as completed via atomic Security Definer RPC once both confirm.
   */
  async markCodOrderPaid(orderId: string, role?: 'seller' | 'buyer'): Promise<Order> {
    const params: { p_order_id: string; p_role?: string } = { p_order_id: orderId };
    if (role) {
      params.p_role = role;
    }

    const { data, error } = await supabase.rpc('complete_cod_order', params);

    if (error) {
      if (!isDemoMode()) throw new Error(error.message);
      // Fallback for mock demo mode only when RPC is unavailable
      const nowIso = new Date().toISOString();
      return {
        id: orderId,
        listing_id: 'mock-listing',
        buyer_id: 'mock-buyer',
        seller_id: 'mock-seller',
        amount_cents: 100000,
        fee_cents: Math.round(BUYER_PROTECTION_FEE * 100),
        currency: 'pkr',
        payment_method: 'cod',
        status: 'completed',
        fulfillment_status: 'completed',
        escrow_status: 'COMPLETED_FUNDS_RELEASED',
        cod_paid_at: nowIso,
        cod_buyer_confirmed_at: nowIso,
        cod_seller_confirmed_at: nowIso,
        created_at: nowIso,
      };
    }

    if (data) {
      notifyOrderUpdated((data as Order)?.listing_id);
      return data as Order;
    }

    throw new Error('Failed to complete order');
  }

  /**
   * Advance order through the fulfillment pipeline (Pending -> Packing -> Shifting -> Delivered/Completed).
   * Strictly enforces caller authorization (seller vs buyer) and state machine invariants.
   */
  async advanceOrderFulfillment({
    orderId,
    targetStatus,
    courier,
    trackingNumber,
    supplierOrderId,
    supplierName,
    sellerPickupAddress,
  }: {
    orderId: string;
    targetStatus: FulfillmentStatus;
    courier?: string;
    trackingNumber?: string;
    supplierOrderId?: string;
    supplierName?: string;
    sellerPickupAddress?: SellerPickupAddress | null;
  }): Promise<Order> {
    const { data, error } = await supabase.rpc('advance_order_fulfillment', {
      p_order_id: orderId,
      p_target_status: targetStatus,
      p_courier: courier?.trim() || null,
      p_tracking_number: trackingNumber?.trim() || null,
      p_supplier_order_id: supplierOrderId?.trim() || null,
      p_supplier_name: supplierName?.trim() || null,
      p_seller_pickup_address: sellerPickupAddress ?? null,
    });

    if (error) {
      if (
        targetStatus === 'picked' &&
        (error.message.includes('orders_fulfillment_status_check') ||
         error.message.includes('violates check constraint'))
      ) {
        // Graceful fallback for unmigrated databases where 'picked' is not yet in orders_fulfillment_status_check
        const { data: retryData, error: retryErr } = await supabase.rpc('advance_order_fulfillment', {
          p_order_id: orderId,
          p_target_status: 'packing',
          p_courier: courier?.trim() || null,
          p_tracking_number: trackingNumber?.trim() || null,
          p_supplier_order_id: supplierOrderId?.trim() || null,
          p_supplier_name: supplierName?.trim() || null,
          p_seller_pickup_address: sellerPickupAddress ?? null,
        });

        if (!retryErr && retryData) {
          notifyOrderUpdated((retryData as Order)?.listing_id);
          return {
            ...(retryData as Order),
            fulfillment_status: 'picked',
            ...(sellerPickupAddress ? { seller_pickup_address: sellerPickupAddress } : {}),
          };
        }
      }

      if (!isDemoMode() || !orderId.startsWith('demo')) throw new Error(error.message || 'Network error');
      // Demo fallback
      return {
        id: orderId,
        status: targetStatus === 'completed' ? 'completed' : 'paid',
        fulfillment_status: targetStatus,
        courier_name: courier,
        tracking_number: trackingNumber,
        supplier_order_id: supplierOrderId,
        supplier_name: supplierName,
        amount_cents: 0,
        fee_cents: 0,
        currency: 'pkr',
        created_at: new Date().toISOString(),
      } as Order;
    }

    notifyOrderUpdated((data as Order)?.listing_id);
    return {
      ...(data as Order),
      ...(sellerPickupAddress ? { seller_pickup_address: sellerPickupAddress } : {}),
    };
  }

  /**
   * Buyer Protection: Open a dispute for damaged, defective, or lost goods.
   */
  async openOrderDispute({
    orderId,
    reason,
    evidenceUrls = [],
  }: {
    orderId: string;
    reason: string;
    evidenceUrls?: string[];
  }): Promise<Order> {
    const { data, error } = await supabase.rpc('open_order_dispute', {
      p_order_id: orderId,
      p_reason: reason.trim(),
      p_evidence_urls: evidenceUrls,
    });

    if (error) {
      if (!isDemoMode()) throw new Error(error.message);
      return {
        id: orderId,
        status: 'disputed',
        fulfillment_status: 'disputed',
        dispute_reason: reason,
        dispute_evidence_urls: evidenceUrls,
        amount_cents: 0,
        fee_cents: 0,
        currency: 'pkr',
        created_at: new Date().toISOString(),
      } as Order;
    }

    const finalOrder = (data as Order);
    notifyOrderUpdated(finalOrder?.listing_id);

    // Automatically start a support chat when an order is disputed
    try {
      let buyerId: string | undefined = finalOrder?.buyer_id;
      if (!buyerId) {
        const { data: o } = await supabase
          .from('orders')
          .select('buyer_id')
          .eq('id', orderId)
          .maybeSingle();
        buyerId = o?.buyer_id;
      }
      if (!buyerId) {
        const { data: { user } } = await supabase.auth.getUser();
        buyerId = user?.id;
      }
      if (buyerId) {
        await startDisputeSupportChat({
          orderId,
          buyerId,
        });
      }
    } catch (e) {
      console.warn('[paymentService] failed to auto-start support chat for dispute', e);
    }

    return finalOrder;
  }

  /**
   * Confirm Stripe payment authorization and advance order to pending fulfillment.
   */
  async confirmPaymentAuthorization({
    orderId,
    stripeEventId,
    paymentIntent,
  }: {
    orderId: string;
    stripeEventId: string;
    paymentIntent?: string;
  }): Promise<Order> {
    const { data, error } = await supabase.rpc('confirm_order_payment_authorization', {
      p_order_id: orderId,
      p_stripe_event_id: stripeEventId,
      p_payment_intent: paymentIntent || null,
    });

    if (error) {
      if (!isDemoMode()) throw new Error(error.message);
      return {
        id: orderId,
        status: 'paid',
        fulfillment_status: 'pending',
        amount_cents: 0,
        fee_cents: 0,
        currency: 'pkr',
        created_at: new Date().toISOString(),
      } as Order;
    }

    return data as Order;
  }

  /**
   * Admin-only query to fetch orders across the platform for logistics and dispatch management.
   * Includes listing, buyer, and seller profiles.
   */
  async fetchAdminLogisticsOrders(
    statusFilter?: string,
    limit: number = 50,
  ): Promise<Order[]> {
    let query = supabase
      .from('orders')
      .select(`
        *,
        listing:listings(id, title, price, images, brand, category),
        buyer:profiles!orders_buyer_id_fkey(id, username, full_name, avatar_url),
        seller:profiles!orders_seller_id_fkey(id, username, full_name, avatar_url),
        order_seller_pickups(pickup_address)
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (statusFilter && statusFilter !== 'everything') {
      if (statusFilter === 'all') {
        query = query
          .not('status', 'in', '("canceled","refunded","failed","refund_due")')
          .neq('fulfillment_status', 'canceled');
      } else if (statusFilter === 'packing') {
        query = query
          .eq('fulfillment_status', 'packing')
          .not('status', 'in', '("canceled","refunded","failed","refund_due")');
      } else if (statusFilter === 'shifting') {
        query = query
          .eq('fulfillment_status', 'shifting')
          .not('status', 'in', '("canceled","refunded","failed","refund_due")');
      } else if (statusFilter === 'delivered') {
        query = query.eq('fulfillment_status', 'delivered');
      } else if (statusFilter === 'disputed') {
        query = query.or('fulfillment_status.eq.disputed,status.eq.disputed');
      } else if (statusFilter === 'canceled') {
        query = query.or('fulfillment_status.eq.canceled,status.eq.canceled,status.eq.refunded,status.eq.failed,status.eq.refund_due');
      } else {
        query = query.eq('fulfillment_status', statusFilter);
      }
    }

    const { data, error } = await query;
    if (error) {
      if (!isDemoMode()) {
        console.warn('[paymentService] fetchAdminLogisticsOrders error:', error.message);
        throw new Error(error.message);
      }
      return [];
    }
    return (((data as any[]) ?? []).map((row) => {
      const rawPickup = row.order_seller_pickups;
      const pickupObj = Array.isArray(rawPickup) ? rawPickup[0] : rawPickup;
      return {
        ...row,
        seller_pickup_address: pickupObj?.pickup_address ?? row.seller_pickup_address ?? null,
      };
    })) as Order[];
  }

  /**
   * Securely fetch seller pickup address for an order (restricted to seller and admins).
   */
  async getOrderSellerPickup(orderId: string): Promise<SellerPickupAddress | null> {
    const { data, error } = await supabase.rpc('get_order_seller_pickup', {
      p_order_id: orderId,
    });
    if (error) return null;
    return (data as SellerPickupAddress) ?? null;
  }
}

export const paymentService = new PaymentService();
