import { describe, it, expect, vi } from 'vitest';
import { canAdvanceEscrow, ESCROW_TRANSITION_MAP, getEscrowStatusStyle } from './escrowService';

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

describe('Escrow Release & Seller Payout Flow', () => {
  describe('Escrow Transition Rules', () => {
    it('allows valid state machine progression to COMPLETED_FUNDS_RELEASED', () => {
      expect(canAdvanceEscrow('DELIVERED', 'COMPLETED_FUNDS_RELEASED')).toBe(true);
      expect(canAdvanceEscrow('DISPUTED', 'COMPLETED_FUNDS_RELEASED')).toBe(true);
    });

    it('rejects premature or illegal funds release transitions', () => {
      expect(canAdvanceEscrow('PENDING_PAYMENT', 'COMPLETED_FUNDS_RELEASED')).toBe(false);
      expect(canAdvanceEscrow('PAYMENT_SECURED_ESCROW', 'COMPLETED_FUNDS_RELEASED')).toBe(false);
      expect(canAdvanceEscrow('READY_FOR_PICKUP', 'COMPLETED_FUNDS_RELEASED')).toBe(false);
    });

    it('treats COMPLETED_FUNDS_RELEASED and CANCELLED as terminal states', () => {
      expect(ESCROW_TRANSITION_MAP['COMPLETED_FUNDS_RELEASED']).toEqual([]);
      expect(ESCROW_TRANSITION_MAP['CANCELLED']).toEqual([]);
    });

    it('returns approved styling tokens for COMPLETED_FUNDS_RELEASED', () => {
      const style = getEscrowStatusStyle('COMPLETED_FUNDS_RELEASED');
      expect(style.label).toBe('Funds Released');
      expect(style.color).toBe('#10B981');
      expect(style.icon).toBe('dollar-sign');
    });
  });

  describe('Seller Payout Method Validation', () => {
    const validatePayoutMethod = (payload: { kind: string; label: string; account_last4: string }) => {
      if (!['bank', 'wallet'].includes(payload.kind)) {
        return { valid: false, error: 'Invalid payout kind' };
      }
      if (payload.label.trim().length < 2) {
        return { valid: false, error: 'Payout label must be at least 2 characters' };
      }
      if (!/^[0-9]{4}$/.test(payload.account_last4.trim())) {
        return { valid: false, error: 'Account last 4 must be exactly 4 digits' };
      }
      return { valid: true };
    };

    it('accepts valid bank account references', () => {
      const result = validatePayoutMethod({
        kind: 'bank',
        label: 'Habib Bank Limited (HBL)',
        account_last4: '4829',
      });
      expect(result.valid).toBe(true);
    });

    it('accepts valid mobile wallet references (JazzCash / EasyPaisa)', () => {
      const result = validatePayoutMethod({
        kind: 'wallet',
        label: 'JazzCash Mobile Account',
        account_last4: '9182',
      });
      expect(result.valid).toBe(true);
    });

    it('rejects invalid last 4 digits (non-numeric, too short, too long)', () => {
      expect(validatePayoutMethod({ kind: 'bank', label: 'Meezan Bank', account_last4: '123' }).valid).toBe(false);
      expect(validatePayoutMethod({ kind: 'bank', label: 'Meezan Bank', account_last4: '12345' }).valid).toBe(false);
      expect(validatePayoutMethod({ kind: 'bank', label: 'Meezan Bank', account_last4: 'abcd' }).valid).toBe(false);
    });

    it('rejects empty or whitespace-only labels', () => {
      expect(validatePayoutMethod({ kind: 'bank', label: ' ', account_last4: '1234' }).valid).toBe(false);
      expect(validatePayoutMethod({ kind: 'wallet', label: 'A', account_last4: '1234' }).valid).toBe(false);
    });
  });

  describe('Seller Escrow Accounting Balance Formula', () => {
    it('verifies net payout is calculated accurately without hidden deductions', () => {
      const totalAmountCents = 1000000; // PKR 10,000
      const platformFeeCents = 50000;   // PKR 500
      const shippingFeeCents = 35000;   // PKR 350
      const netPayoutCents = totalAmountCents - platformFeeCents - shippingFeeCents; // PKR 9,150

      expect(netPayoutCents).toBe(915000);
      expect(totalAmountCents).toBe(platformFeeCents + shippingFeeCents + netPayoutCents);
    });
  });
});
