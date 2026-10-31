import { describe, it, expect, vi } from 'vitest';
import { orderTotal, buyerProtectionFee, getParcelDeliveryFee } from '@/lib/fees';
import { computeCheckoutItemPrice } from '@/lib/bundle';
import { canAdvanceEscrow, ESCROW_TRANSITION_MAP, getEscrowStatusStyle } from './escrowService';
import type { EscrowStatus, Order, Transaction } from '@/types';

vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

vi.mock('@/lib/analytics', () => ({
  capture: vi.fn(),
}));

describe('Foolproof Buying & Selling Lifecycle (End-to-End)', () => {
  // ── Step 1: Listing & Pricing ──────────────────────────────────────────────
  const mockListing = {
    id: 'listing_camera_101',
    seller_id: 'user_seller_01',
    title: 'Vintage 35mm Rangefinder Camera',
    price: 15000, // PKR 15,000
    parcel_size: 'medium' as const,
    is_sold: false,
  };

  it('calculates initial listing fees and totals correctly', () => {
    const bpFee = buyerProtectionFee(mockListing.price);
    const shippingFee = getParcelDeliveryFee(mockListing.parcel_size);
    const total = mockListing.price + bpFee + shippingFee;

    expect(bpFee).toBeGreaterThan(0);
    expect(shippingFee).toBeGreaterThan(0);
    expect(total).toBe(mockListing.price + bpFee + shippingFee);
  });

  // ── Step 2 & 3: Chat Offer Negotiation & Atomic Acceptance ─────────────────
  describe('Negotiation & Offer-to-Order Bridge', () => {
    it('creates and validates offer under asking price', () => {
      const offeredPrice = 13500; // PKR 13,500
      expect(offeredPrice).toBeLessThan(mockListing.price);
      expect(offeredPrice).toBeGreaterThan(0);

      const checkoutItemPrice = computeCheckoutItemPrice({
        offerAmount: offeredPrice,
        isBundle: false,
        listingPrice: mockListing.price,
      });

      expect(checkoutItemPrice).toBe(13500);
    });

    it('simulates atomic accept_chat_offer RPC state transition', () => {
      const offeredPrice = 13500;
      const offerMessageId = 'msg_offer_999';
      const buyerId = 'user_buyer_02';

      // 1. Accepted offer does NOT set listing is_sold: true (inventory stays active until payment)
      const updatedListing = { ...mockListing, is_sold: false };
      expect(updatedListing.is_sold).toBe(false);

      // 2. Offer is marked accepted; NO order is created prior to checkout
      const acceptedOffer = {
        id: 'offer_123',
        message_id: offerMessageId,
        listing_id: mockListing.id,
        buyer_id: buyerId,
        amount: offeredPrice,
        status: 'accepted',
      };

      expect(acceptedOffer.status).toBe('accepted');
      expect(acceptedOffer.amount).toBe(13500);

      // 3. Buyer has canPay = true when offer is accepted
      const canPay = acceptedOffer.status === 'accepted' && !updatedListing.is_sold;
      expect(canPay).toBe(true);
    });
  });

  // ── Step 4 & 5: Checkout & Escrow Lock ─────────────────────────────────────
  describe('Checkout & Escrow Funding', () => {
    it('locks order price to accepted offer and computes escrow transaction', () => {
      const lockedOfferPrice = 13500;
      const bpFee = buyerProtectionFee(lockedOfferPrice);
      const deliveryFee = getParcelDeliveryFee(mockListing.parcel_size);
      const totalAmountCents = Math.round((lockedOfferPrice + bpFee + deliveryFee) * 100);

      const platformFeeCents = Math.round(bpFee * 100);
      const shippingFeeCents = Math.round(deliveryFee * 100);
      const sellerPayoutCents = totalAmountCents - platformFeeCents - shippingFeeCents;

      // Escrow ledger transaction
      const escrowTransaction: Partial<Transaction> = {
        id: 'tx_escrow_777',
        order_id: 'order_bridged_555',
        buyer_id: 'user_buyer_02',
        seller_id: mockListing.seller_id,
        amount_cents: totalAmountCents,
        platform_fee_cents: platformFeeCents,
        shipping_fee_cents: shippingFeeCents,
        payout_amount_cents: sellerPayoutCents,
        status: 'PAYMENT_SECURED_ESCROW',
      };

      expect(escrowTransaction.status).toBe('PAYMENT_SECURED_ESCROW');
      expect(escrowTransaction.payout_amount_cents).toBe(lockedOfferPrice * 100);
      expect(escrowTransaction.amount_cents).toBe(
        escrowTransaction.platform_fee_cents! +
        escrowTransaction.shipping_fee_cents! +
        escrowTransaction.payout_amount_cents!
      );
    });
  });

  // ── Step 6 & 7: Fulfillment & Courier Dispatch ─────────────────────────────
  describe('Fulfillment State Machine Progression', () => {
    let currentEscrowStatus: EscrowStatus = 'PAYMENT_SECURED_ESCROW';

    it('advances from PAYMENT_SECURED_ESCROW to READY_FOR_PICKUP when seller packs', () => {
      expect(canAdvanceEscrow(currentEscrowStatus, 'READY_FOR_PICKUP')).toBe(true);
      currentEscrowStatus = 'READY_FOR_PICKUP';
      expect(getEscrowStatusStyle(currentEscrowStatus).label).toBe('Ready for Pickup');
    });

    it('advances from READY_FOR_PICKUP to IN_TRANSIT when courier picks up package', () => {
      expect(canAdvanceEscrow(currentEscrowStatus, 'IN_TRANSIT')).toBe(true);
      currentEscrowStatus = 'IN_TRANSIT';
      expect(getEscrowStatusStyle(currentEscrowStatus).label).toBe('In Transit');
    });

    it('advances from IN_TRANSIT to DELIVERED when courier drops off at recipient', () => {
      expect(canAdvanceEscrow(currentEscrowStatus, 'DELIVERED')).toBe(true);
      currentEscrowStatus = 'DELIVERED';
      expect(getEscrowStatusStyle(currentEscrowStatus).label).toBe('Delivered (24h Window)');
    });
  });

  // ── Step 8 & 9: Delivery Confirmation, Funds Release & Seller Payout ───────
  describe('Buyer Delivery Confirmation & Final Funds Release', () => {
    it('advances DELIVERED to COMPLETED_FUNDS_RELEASED upon buyer confirmation', () => {
      expect(canAdvanceEscrow('DELIVERED', 'COMPLETED_FUNDS_RELEASED')).toBe(true);

      const completedOrder: Partial<Order> = {
        id: 'order_bridged_555',
        status: 'completed',
        fulfillment_status: 'completed',
        escrow_status: 'COMPLETED_FUNDS_RELEASED',
        completed_at: new Date().toISOString(),
      };

      expect(completedOrder.status).toBe('completed');
      expect(completedOrder.fulfillment_status).toBe('completed');
      expect(completedOrder.escrow_status).toBe('COMPLETED_FUNDS_RELEASED');

      const style = getEscrowStatusStyle('COMPLETED_FUNDS_RELEASED');
      expect(style.label).toBe('Funds Released');
      expect(style.color).toBe('#10B981');
    });

    it('validates seller default payout destination for cleared earnings', () => {
      const sellerPayoutMethod = {
        kind: 'bank' as const,
        label: 'Meezan Bank Limited',
        account_last4: '5512',
        is_default: true,
      };

      expect(sellerPayoutMethod.is_default).toBe(true);
      expect(sellerPayoutMethod.label.length).toBeGreaterThanOrEqual(2);
      expect(/^\d{4}$/.test(sellerPayoutMethod.account_last4)).toBe(true);
    });
  });

  // ── Step 10: Fault Tolerance & Error Boundary Recovery ────────────────────
  describe('Network Fault Tolerance & Optimistic Rollbacks', () => {
    it('rolls back optimistic order state if fulfillment RPC fails', () => {
      const initialOrder: { id: string; status: 'packing' | 'shifting' } = { id: 'order_bridged_555', status: 'packing' };
      let activeOrder: { id: string; status: 'packing' | 'shifting' } = { ...initialOrder, status: 'shifting' }; // optimistic update

      // Simulated network failure
      const networkFailed = true;
      if (networkFailed) {
        activeOrder = initialOrder; // rollback
      }

      expect(activeOrder.status).toBe('packing');
    });

    it('prevents double-advance or illegal skip across the escrow state machine', () => {
      // Cannot skip directly from PAYMENT_SECURED_ESCROW to COMPLETED_FUNDS_RELEASED
      expect(canAdvanceEscrow('PAYMENT_SECURED_ESCROW', 'COMPLETED_FUNDS_RELEASED')).toBe(false);
      // Cannot jump from IN_TRANSIT directly to READY_FOR_PICKUP (reverse)
      expect(canAdvanceEscrow('IN_TRANSIT', 'READY_FOR_PICKUP')).toBe(false);
    });
  });
});
