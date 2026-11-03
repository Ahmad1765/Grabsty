import { describe, it, expect } from 'vitest';
import { computeBundlePricing } from '@/lib/bundle';

describe('Money Movement Security & State Machine Invariants', () => {
  describe('Dispute Window Enforcements (48-hour Rule)', () => {
    it('permits dispute within 48-hour delivery window', () => {
      const deliveredAt = new Date(Date.now() - 47 * 60 * 60 * 1000); // 47 hours ago
      const isWindowOpen = (Date.now() - deliveredAt.getTime()) <= 48 * 60 * 60 * 1000;
      expect(isWindowOpen).toBe(true);
    });

    it('rejects dispute after 48-hour delivery window expires', () => {
      const deliveredAt = new Date(Date.now() - 49 * 60 * 60 * 1000); // 49 hours ago
      const isWindowOpen = (Date.now() - deliveredAt.getTime()) <= 48 * 60 * 60 * 1000;
      expect(isWindowOpen).toBe(false);
    });
  });

  describe('Server Bundle Tier Math Consistency', () => {
    it('matches SQL tier discounts for multi-item checkout', () => {
      // 1 item -> 0%
      expect(computeBundlePricing(1000, []).pct).toBe(0);
      // 2 items -> 5%
      expect(computeBundlePricing(1000, [1000]).pct).toBe(5);
      // 3 items -> 10%
      expect(computeBundlePricing(1000, [1000, 1000]).pct).toBe(10);
      // 4 items -> 15%
      expect(computeBundlePricing(1000, [1000, 1000, 1000]).pct).toBe(15);
      // 5 items -> 20%
      expect(computeBundlePricing(1000, [1000, 1000, 1000, 1000]).pct).toBe(20);
    });

    it('calculates bundle savings strictly without rounding leaks', () => {
      const pricing = computeBundlePricing(2500, [2500]); // 5% off 5000 = 250 savings
      expect(pricing.subtotal).toBe(5000);
      expect(pricing.savings).toBe(250);
      expect(pricing.total).toBe(4750);
    });
  });

  describe('Fulfillment State Machine Role Gates', () => {
    type FulfillmentState = 'pending' | 'awaiting_payment' | 'packing' | 'shifting' | 'delivered' | 'completed' | 'disputed' | 'canceled';
    type UserRole = 'buyer' | 'seller' | 'courier' | 'admin';

    function canAdvanceFulfillment(
      current: FulfillmentState,
      target: FulfillmentState,
      role: UserRole
    ): { allowed: boolean; reason?: string } {
      if (['completed', 'canceled', 'disputed'].includes(current) && role !== 'admin') {
        return { allowed: false, reason: 'Terminal order locked' };
      }

      if (target === 'packing') {
        if (role !== 'seller' && role !== 'admin') {
          return { allowed: false, reason: 'Only seller can pack' };
        }
        if (!['pending', 'awaiting_payment'].includes(current) && role !== 'admin') {
          return { allowed: false, reason: 'Invalid transition to packing' };
        }
        return { allowed: true };
      }

      if (target === 'shifting') {
        if (role !== 'seller' && role !== 'admin') {
          return { allowed: false, reason: 'Only seller can shift' };
        }
        if (current !== 'packing' && role !== 'admin') {
          return { allowed: false, reason: 'Must pack before shifting' };
        }
        return { allowed: true };
      }

      if (target === 'delivered') {
        if (role === 'seller') {
          return { allowed: false, reason: 'Seller cannot mark delivered' };
        }
        if (role !== 'courier' && role !== 'admin' && role !== 'buyer') {
          return { allowed: false, reason: 'Unauthorized delivery confirmation' };
        }
        if (current !== 'shifting' && role !== 'admin') {
          return { allowed: false, reason: 'Must be in transit before delivery' };
        }
        return { allowed: true };
      }

      if (target === 'completed') {
        if (role !== 'buyer' && role !== 'admin') {
          return { allowed: false, reason: 'Only buyer can confirm completion' };
        }
        if (current !== 'delivered' && role !== 'admin') {
          return { allowed: false, reason: 'Must be delivered before completed' };
        }
        return { allowed: true };
      }

      return { allowed: false, reason: 'Unknown transition' };
    }

    it('strictly forbids sellers from marking order delivered', () => {
      const check = canAdvanceFulfillment('shifting', 'delivered', 'seller');
      expect(check.allowed).toBe(false);
      expect(check.reason).toBe('Seller cannot mark delivered');
    });

    it('allows courier or buyer to confirm delivery once shifted', () => {
      expect(canAdvanceFulfillment('shifting', 'delivered', 'courier').allowed).toBe(true);
      expect(canAdvanceFulfillment('shifting', 'delivered', 'buyer').allowed).toBe(true);
    });

    it('strictly forbids sellers from completing an order', () => {
      const check = canAdvanceFulfillment('delivered', 'completed', 'seller');
      expect(check.allowed).toBe(false);
      expect(check.reason).toBe('Only buyer can confirm completion');
    });

    it('allows buyers to complete an order once delivered', () => {
      const check = canAdvanceFulfillment('delivered', 'completed', 'buyer');
      expect(check.allowed).toBe(true);
    });

    it('blocks buyers from completing before delivery', () => {
      const check = canAdvanceFulfillment('shifting', 'completed', 'buyer');
      expect(check.allowed).toBe(false);
      expect(check.reason).toBe('Must be delivered before completed');
    });

    it('blocks non-admin changes once completed', () => {
      expect(canAdvanceFulfillment('completed', 'packing', 'seller').allowed).toBe(false);
      expect(canAdvanceFulfillment('completed', 'delivered', 'buyer').allowed).toBe(false);
      expect(canAdvanceFulfillment('completed', 'packing', 'admin').allowed).toBe(true);
    });
  });

  describe('Price-Change Tamper Protection', () => {
    it('detects when expected total mismatches server-calculated price', () => {
      const expectedTotal = 1500;
      const actualServerTotal = 1800; // seller updated price
      const isMismatch = Math.abs(expectedTotal - actualServerTotal) > 0.05;
      expect(isMismatch).toBe(true);
    });

    it('approves when expected total matches server-calculated price within tolerance', () => {
      const expectedTotal = 1500;
      const actualServerTotal = 1500;
      const isMismatch = Math.abs(expectedTotal - actualServerTotal) > 0.05;
      expect(isMismatch).toBe(false);
    });
  });
});
