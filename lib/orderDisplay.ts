// Pure display helpers for an order (no app imports, safe anywhere).

const CLOSED_STATUSES = ['canceled', 'refunded', 'refund_due', 'failed'];

/** Cancelled, refunded or failed: nothing left to deliver, pay or report. */
export function isOrderClosed(o: { status?: string | null; fulfillment_status?: string | null } | null | undefined): boolean {
  return !!o && (CLOSED_STATUSES.includes(String(o.status ?? '')) || o.fulfillment_status === 'canceled');
}

/**
 * WF-011 / WEB-003 / DEV-007: the order page badge. The order's status (closed,
 * disputed, completed) wins over the fulfillment step, and an ended step wins
 * over "it was shipped once".
 */
export function orderStatusBadge(o: {
  status?: string | null;
  fulfillment: string;
  shipped: boolean;
  isSeller: boolean;
}): string {
  const s = o.status ?? '';
  const f = o.fulfillment;
  if (s === 'refunded' || s === 'refund_due') return 'Refunded';
  if (isOrderClosed({ status: s, fulfillment_status: f })) return 'Cancelled';
  if (s === 'disputed') return o.isSeller ? 'Payment on hold' : 'Refund Under Review';
  if (s === 'completed' || f === 'completed') return 'Completed';
  if (f === 'delivered') return 'Delivered';
  if (f === 'shifting' || o.shipped) return 'In Transit';
  if (f === 'picked') return 'Picked';
  if (f === 'packing') return o.isSeller ? 'Awaiting Pickup' : 'Preparing Order';
  if (o.isSeller) return 'Ready to Deliver';
  return s === 'paid' ? 'Paid' : 'Preparing Order';
}

type MoneyOrder = {
  amount_cents: number;
  fee_cents: number;
  shipping_fee_cents?: number | null;
  payout_amount_cents?: number | null;
  payment_method?: string | null;
  payment_status?: string | null;
};

/**
 * DEV-008 / WF-003: what the order costs, from each side. The buyer sees the
 * breakdown and what to hand the rider; the seller sees what they earn.
 */
export function orderMoneyLines(
  o: MoneyOrder,
  isSeller: boolean,
): { lines: { label: string; cents: number }[]; total: { label: string; cents: number } } {
  if (isSeller) {
    // payout_amount_cents defaults to 0 when the escrow ledger never set it.
    const payout = o.payout_amount_cents && o.payout_amount_cents > 0 ? o.payout_amount_cents : o.amount_cents;
    return { lines: [], total: { label: 'You earn', cents: payout } };
  }
  const delivery = o.shipping_fee_cents ?? 0;
  const unpaidCod = o.payment_method === 'cod' && o.payment_status !== 'paid';
  return {
    lines: [
      { label: 'Item', cents: o.amount_cents },
      { label: 'Buyer protection', cents: o.fee_cents },
      { label: 'Delivery', cents: delivery },
    ],
    total: { label: unpaidCod ? 'Pay the rider in cash' : 'Total paid', cents: o.amount_cents + o.fee_cents + delivery },
  };
}
