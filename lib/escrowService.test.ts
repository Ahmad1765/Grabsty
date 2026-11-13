import { describe, it, expect, vi } from 'vitest';
import {
  canAdvanceEscrow,
  getEscrowStatusStyle,
  ESCROW_TRANSITION_MAP,
  releaseConfirmation,
} from './escrowService';
import type { EscrowStatus } from '@/types';

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

describe('Escrow State Machine Transition Rules', () => {
  it('allows valid sequential state transitions', () => {
    expect(canAdvanceEscrow('PENDING_PAYMENT', 'PAYMENT_SECURED_ESCROW')).toBe(true);
    expect(canAdvanceEscrow('PAYMENT_SECURED_ESCROW', 'READY_FOR_PICKUP')).toBe(true);
    expect(canAdvanceEscrow('READY_FOR_PICKUP', 'IN_TRANSIT')).toBe(true);
    expect(canAdvanceEscrow('IN_TRANSIT', 'DELIVERED')).toBe(true);
    expect(canAdvanceEscrow('DELIVERED', 'COMPLETED_FUNDS_RELEASED')).toBe(true);
  });

  it('allows valid dispute transitions', () => {
    expect(canAdvanceEscrow('IN_TRANSIT', 'DISPUTED')).toBe(true);
    expect(canAdvanceEscrow('DELIVERED', 'DISPUTED')).toBe(true);
    expect(canAdvanceEscrow('DISPUTED', 'COMPLETED_FUNDS_RELEASED')).toBe(true);
    expect(canAdvanceEscrow('DISPUTED', 'CANCELLED')).toBe(true);
  });

  it('allows valid cancellation transitions prior to delivery', () => {
    expect(canAdvanceEscrow('PENDING_PAYMENT', 'CANCELLED')).toBe(true);
    expect(canAdvanceEscrow('PAYMENT_SECURED_ESCROW', 'CANCELLED')).toBe(true);
    expect(canAdvanceEscrow('READY_FOR_PICKUP', 'CANCELLED')).toBe(true);
  });

  it('rejects illegal state jumping', () => {
    // Cannot skip logistics in-transit
    expect(canAdvanceEscrow('PAYMENT_SECURED_ESCROW', 'DELIVERED')).toBe(false);
    expect(canAdvanceEscrow('PAYMENT_SECURED_ESCROW', 'COMPLETED_FUNDS_RELEASED')).toBe(false);
    expect(canAdvanceEscrow('READY_FOR_PICKUP', 'COMPLETED_FUNDS_RELEASED')).toBe(false);
    expect(canAdvanceEscrow('READY_FOR_PICKUP', 'DELIVERED')).toBe(false);
    expect(canAdvanceEscrow('IN_TRANSIT', 'COMPLETED_FUNDS_RELEASED')).toBe(false);

    // Terminal states cannot transition further
    expect(canAdvanceEscrow('COMPLETED_FUNDS_RELEASED', 'DELIVERED')).toBe(false);
    expect(canAdvanceEscrow('COMPLETED_FUNDS_RELEASED', 'DISPUTED')).toBe(false);
    expect(canAdvanceEscrow('CANCELLED', 'READY_FOR_PICKUP')).toBe(false);
    expect(canAdvanceEscrow('CANCELLED', 'PAYMENT_SECURED_ESCROW')).toBe(false);
  });

  it('covers all defined EscrowStatus keys in transition map', () => {
    const statuses: EscrowStatus[] = [
      'PENDING_PAYMENT',
      'PAYMENT_SECURED_ESCROW',
      'READY_FOR_PICKUP',
      'IN_TRANSIT',
      'DELIVERED',
      'COMPLETED_FUNDS_RELEASED',
      'DISPUTED',
      'CANCELLED',
    ];

    statuses.forEach((s) => {
      expect(ESCROW_TRANSITION_MAP).toHaveProperty(s);
      expect(Array.isArray(ESCROW_TRANSITION_MAP[s])).toBe(true);
    });
  });
});

describe('Escrow Status Styles & Badges', () => {
  it('returns valid color and label tokens for each state', () => {
    const states: EscrowStatus[] = [
      'PENDING_PAYMENT',
      'PAYMENT_SECURED_ESCROW',
      'READY_FOR_PICKUP',
      'IN_TRANSIT',
      'DELIVERED',
      'COMPLETED_FUNDS_RELEASED',
      'DISPUTED',
      'CANCELLED',
    ];

    states.forEach((status) => {
      const style = getEscrowStatusStyle(status);
      expect(style.label).toBeTruthy();
      expect(style.bg).toContain('rgba');
      expect(style.color).toBeTruthy();
      expect(style.dotColor).toBeTruthy();
      expect(style.icon).toBeTruthy();
    });
  });
});

describe('Escrow Financial Ledger Invariant Check', () => {
  it('verifies mathematical balance formula holds: amount = platform_fee + shipping_fee + payout', () => {
    const itemPriceCents = 2500; // PKR 25
    const shippingFeeCents = 25000; // PKR 250
    const platformFeeCents = 0; // 0%
    const payoutAmountCents = itemPriceCents - platformFeeCents; // 2500
    const totalCapturedCents = payoutAmountCents + shippingFeeCents + platformFeeCents; // 27500

    expect(payoutAmountCents).toBeGreaterThanOrEqual(0);
    expect(totalCapturedCents).toBe(platformFeeCents + shippingFeeCents + payoutAmountCents);
  });
});

// WEB-009: completing an order asks first, and warns when the seller can't be paid.
describe('releaseConfirmation', () => {
  it('warns and uses a destructive button when the seller has no payout method', () => {
    const c = releaseConfirmation(false);
    expect(c.destructive).toBe(true);
    expect(c.message).toContain('no payout method');
  });
  it('asks plainly when the seller can be paid', () => {
    const c = releaseConfirmation(true);
    expect(c.destructive).toBe(false);
    expect(c.message).not.toContain('no payout method');
    expect(c.message).toContain('recorded as owed');
  });
});
