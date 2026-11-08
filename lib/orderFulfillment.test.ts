import { describe, it, expect } from 'vitest';
import type { FulfillmentStatus } from '@/types';
import { orderBadge } from '@/lib/orders';

describe('Order Lifecycle & Fulfillment State Machine Specification', () => {
  // ── Transition Validator Simulation ───────────────────────────────────────
  function validateFulfillmentTransition(
    current: FulfillmentStatus,
    target: FulfillmentStatus,
    actor: 'seller' | 'buyer' | 'system',
  ): { valid: boolean; error?: string } {
    if (current === target) return { valid: true };

    // Terminal states cannot transition
    if (current === 'completed') {
      return { valid: false, error: 'Order is already completed (terminal state)' };
    }
    if (current === 'canceled') {
      return { valid: false, error: 'Order is already canceled' };
    }

    // Role-based authorization & transition sequence
    if (target === 'packing') {
      if (actor !== 'seller') return { valid: false, error: 'Only seller may advance to packing' };
      if (current !== 'pending') {
        return { valid: false, error: `Cannot advance to packing from ${current} (must be pending)` };
      }
      return { valid: true };
    }

    if (target === 'shifting') {
      if (actor !== 'seller') return { valid: false, error: 'Only seller may advance to shifting' };
      if (current !== 'packing') {
        return { valid: false, error: `Cannot advance to shifting from ${current} (must be packing/processing first)` };
      }
      return { valid: true };
    }

    if (target === 'delivered') {
      if (current !== 'shifting') {
        return { valid: false, error: `Cannot mark delivered from ${current} (must be shifting)` };
      }
      return { valid: true };
    }

    if (target === 'completed') {
      if (actor !== 'buyer' && actor !== 'system') {
        return { valid: false, error: 'Only buyer or auto-settlement can complete order' };
      }
      if (current !== 'delivered' && current !== 'shifting' && current !== 'disputed') {
        return { valid: false, error: `Cannot complete order from ${current}` };
      }
      return { valid: true };
    }

    if (target === 'disputed') {
      if (actor !== 'buyer') return { valid: false, error: 'Only buyer may open dispute' };
      if (current !== 'shifting' && current !== 'delivered') {
        return { valid: false, error: `Dispute cannot be opened from ${current}` };
      }
      return { valid: true };
    }

    if (target === 'canceled') {
      if (current === 'shifting' || current === 'delivered') {
        return { valid: false, error: 'Cannot cancel order once in transit or delivered' };
      }
      return { valid: true };
    }

    return { valid: false, error: `Invalid transition from ${current} to ${target}` };
  }

  it('permits deterministic forward progression (pending -> packing -> shifting -> delivered -> completed)', () => {
    expect(validateFulfillmentTransition('pending', 'packing', 'seller').valid).toBe(true);
    expect(validateFulfillmentTransition('packing', 'shifting', 'seller').valid).toBe(true);
    expect(validateFulfillmentTransition('shifting', 'delivered', 'system').valid).toBe(true);
    expect(validateFulfillmentTransition('delivered', 'completed', 'buyer').valid).toBe(true);
  });

  it('blocks illegal state jumping (pending -> shifting without packing)', () => {
    const res = validateFulfillmentTransition('pending', 'shifting', 'seller');
    expect(res.valid).toBe(false);
    expect(res.error).toContain('must be packing');
  });

  it('blocks illegal state jumping (pending -> completed without delivery)', () => {
    const res = validateFulfillmentTransition('pending', 'completed', 'buyer');
    expect(res.valid).toBe(false);
    expect(res.error).toContain('Cannot complete order from pending');
  });

  it('blocks regression / rewind (shifting -> packing)', () => {
    const res = validateFulfillmentTransition('shifting', 'packing', 'seller');
    expect(res.valid).toBe(false);
    expect(res.error).toContain('must be pending');
  });

  it('strictly enforces role-based permissions (buyer cannot advance packing)', () => {
    const res = validateFulfillmentTransition('pending', 'packing', 'buyer');
    expect(res.valid).toBe(false);
    expect(res.error).toContain('Only seller');
  });

  it('strictly enforces role-based permissions (seller cannot confirm buyer completion)', () => {
    const res = validateFulfillmentTransition('delivered', 'completed', 'seller');
    expect(res.valid).toBe(false);
    expect(res.error).toContain('Only buyer');
  });

  it('allows buyer protection dispute only during transit or delivery', () => {
    expect(validateFulfillmentTransition('shifting', 'disputed', 'buyer').valid).toBe(true);
    expect(validateFulfillmentTransition('delivered', 'disputed', 'buyer').valid).toBe(true);
    expect(validateFulfillmentTransition('pending', 'disputed', 'buyer').valid).toBe(false);
    expect(validateFulfillmentTransition('packing', 'disputed', 'buyer').valid).toBe(false);
  });

  it('blocks cancellation once package is shifting / in-transit', () => {
    const res = validateFulfillmentTransition('shifting', 'canceled', 'buyer');
    expect(res.valid).toBe(false);
    expect(res.error).toContain('Cannot cancel order once in transit');
  });

  it('derives correct status badges for history presentation', () => {
    expect(orderBadge('awaiting_payment', 'bought').label).toBe('Awaiting payment');
    expect(orderBadge('packing', 'bought').label).toBe('Seller packaging');
    expect(orderBadge('packing', 'sold').label).toBe('Packing order');
    expect(orderBadge('shifting', 'bought').label).toBe('Dispatched · In transit');
    expect(orderBadge('delivered', 'bought').label).toBe('Delivered · Please inspect');
    expect(orderBadge('disputed', 'bought').label).toBe('Dispute in review');
    expect(orderBadge('completed', 'bought').label).toBe('Completed');
  });
});
