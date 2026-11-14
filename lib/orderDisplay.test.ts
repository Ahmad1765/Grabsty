import { describe, expect, it } from 'vitest';
import { expectedDelivery, isOrderClosed, orderMoneyLines, orderStatusBadge } from './orderDisplay';

// WF-011 / WEB-003 / DEV-007: an ended order doesn't read "In Transit" because it shipped once.
describe('orderStatusBadge', () => {
  const badge = (status: string, fulfillment: string, isSeller = false) =>
    orderStatusBadge({ status, fulfillment, shipped: true, isSeller });
  it('puts the end state before the shipped flag', () => {
    expect(badge('completed', 'completed', true)).toBe('Completed');
    expect(badge('pending', 'delivered')).toBe('Delivered');
    expect(badge('disputed', 'disputed', true)).toBe('Payment on hold');
    expect(badge('disputed', 'disputed')).toBe('Refund Under Review');
    expect(badge('canceled', 'canceled')).toBe('Cancelled');
    expect(badge('pending', 'shifting')).toBe('In Transit');
  });
  it('follows the status once a dispute or order is settled', () => {
    expect(badge('refunded', 'disputed')).toBe('Refunded');
    expect(badge('completed', 'disputed', true)).toBe('Completed');
    expect(badge('canceled', 'delivered')).toBe('Cancelled');
  });
  it('WF-008: a seller\'s untouched order is new, not "Ready to Deliver"', () => {
    expect(orderStatusBadge({ status: 'pending', fulfillment: 'pending', shipped: false, isSeller: true })).toBe('New order');
  });
});

describe('expectedDelivery (DEV-010)', () => {
  const day = 86_400_000;
  const created = '2026-11-14T10:00:00Z';
  it('is 5 days from ordering until pickup, then 3 days from pickup', () => {
    expect(expectedDelivery({ created_at: created })!.by.toISOString()).toBe('2026-11-19T10:00:00.000Z');
    expect(expectedDelivery({ created_at: created, shipped_at: '2026-11-15T10:00:00Z' })!.by.toISOString()).toBe(
      '2026-11-18T10:00:00.000Z',
    );
  });
  it('flags late orders and handles missing dates', () => {
    expect(expectedDelivery({ created_at: created }, Date.parse(created) + 6 * day)!.late).toBe(true);
    expect(expectedDelivery({ created_at: created }, Date.parse(created) + day)!.late).toBe(false);
    expect(expectedDelivery({})).toBeNull();
  });
});

describe('isOrderClosed', () => {
  it('is true for cancelled, refunded and failed orders', () => {
    expect(isOrderClosed({ status: 'refund_due' })).toBe(true);
    expect(isOrderClosed({ status: 'pending', fulfillment_status: 'canceled' })).toBe(true);
    expect(isOrderClosed({ status: 'completed' })).toBe(false);
    expect(isOrderClosed(null)).toBe(false);
  });
});

// DEV-008 / WF-003: the buyer sees what to pay; the seller sees what they earn.
describe('orderMoneyLines', () => {
  const order = { amount_cents: 120000, fee_cents: 7200, shipping_fee_cents: 13000, payment_method: 'cod', payment_status: 'pending' };
  it('gives the buyer the breakdown and the cash to hand over', () => {
    const m = orderMoneyLines(order, false);
    expect(m.lines.map((l) => l.cents)).toEqual([120000, 7200, 13000]);
    expect(m.total).toEqual({ label: 'Pay the rider in cash', cents: 140200 });
    expect(orderMoneyLines({ ...order, payment_status: 'paid' }, false).total.label).toBe('Total paid');
  });
  it('gives the seller what they earn, not the buyer total', () => {
    expect(orderMoneyLines(order, true)).toEqual({ lines: [], total: { label: 'You earn', cents: 120000 } });
    expect(orderMoneyLines({ ...order, payout_amount_cents: 110000 }, true).total.cents).toBe(110000);
    // an unset ledger share (column default 0) falls back to the item price
    expect(orderMoneyLines({ ...order, payout_amount_cents: 0 }, true).total.cents).toBe(120000);
  });
});
