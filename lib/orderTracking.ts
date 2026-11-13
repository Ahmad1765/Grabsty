// Order numbers, tracking IDs, the public tracking lookup, issue reports and
// the rider (courier) calls.
// Server: supabase/migrations/20261112010000_riders_delivery_issue_reports_tracking.sql

import { supabase } from '@/lib/supabase';

/**
 * The order number shown everywhere: first 12 hex of the order id (same as the
 * server's order_reference). 12, not 8: at 8 two orders could share a number
 * after tens of thousands of orders. Old 8-character numbers still resolve.
 */
export function orderReference(orderId: string): string {
  return orderId.replace(/-/g, '').slice(0, 12).toUpperCase();
}

/** Grabsty tracking ID for an order. track_order() resolves it back to the order. */
export function trackingIdFor(orderId: string): string {
  return `GRB-${orderReference(orderId)}`;
}

export type TrackState = 'placed' | 'ready' | 'in_transit' | 'delivered' | 'completed' | 'cancelled' | 'under_review';

export type TrackResult =
  // throttled: too many lookups from this account / address in the last minute
  | { found: false; throttled?: boolean }
  | {
      found: true;
      reference: string;
      tracking_id: string;
      courier_tracking_number: string | null;
      courier: string | null;
      state: TrackState;
      title: string | null;
      image: string | null;
      city: string | null;
      placed_at: string | null;
      ready_at: string | null;
      picked_up_at: string | null;
      delivered_at: string | null;
      completed_at: string | null;
    };

export const TRACK_STATE_LABEL: Record<TrackState, string> = {
  placed: 'Order placed',
  ready: 'Ready for pickup',
  in_transit: 'In transit',
  delivered: 'Delivered',
  completed: 'Completed',
  cancelled: 'Cancelled',
  under_review: 'Under review',
};

/** Public lookup by tracking ID or order number. Throws on network / server errors. */
export async function trackOrder(code: string): Promise<TrackResult> {
  const { data, error } = await supabase.rpc('track_order', { p_code: code.trim() });
  if (error) throw new Error(error.message);
  return (data ?? { found: false }) as TrackResult;
}

// ── Report an issue ─────────────────────────────────────────────────────────
export type IssueCategory =
  | 'damaged'
  | 'not_as_described'
  | 'wrong_item'
  | 'missing'
  | 'not_delivered'
  | 'pickup'
  | 'payment'
  | 'other';

export const BUYER_ISSUES: { id: IssueCategory; label: string }[] = [
  { id: 'damaged', label: 'Arrived damaged' },
  { id: 'not_as_described', label: 'Not as described' },
  { id: 'wrong_item', label: 'Wrong item' },
  { id: 'missing', label: 'Something missing' },
  { id: 'not_delivered', label: 'Not delivered' },
  { id: 'other', label: 'Something else' },
];

export const SELLER_ISSUES: { id: IssueCategory; label: string }[] = [
  { id: 'pickup', label: 'Courier pickup' },
  { id: 'payment', label: 'Payment or payout' },
  { id: 'other', label: 'Something else' },
];

export const MAX_ISSUE_PHOTOS = 6;

export type IssueReportResult = { case_number: number; case_label: string; payment_on_hold: boolean };

/** Files the report with the support team. Throws with the server's message. */
export async function reportOrderIssue(input: {
  orderId: string;
  category: IssueCategory;
  description: string;
  imageUrls: string[];
}): Promise<IssueReportResult> {
  const { data, error } = await supabase.rpc('report_order_issue', {
    p_order_id: input.orderId,
    p_category: input.category,
    p_description: input.description.trim(),
    p_image_urls: input.imageUrls,
  });
  if (error) throw new Error(error.message);
  return data as IssueReportResult;
}

// ── Riders ──────────────────────────────────────────────────────────────────
export type CourierState =
  | 'signin'
  | 'forbidden'
  | 'ready'
  | 'in_transit'
  | 'other_rider'
  | 'delivered'
  | 'on_hold'
  | 'not_ready'
  | 'closed'
  | 'locked'
  | 'not_found'
  | 'wrong_code';

export type CourierDelivery = {
  name: string | null;
  line1: string | null;
  line2: string | null;
  city: string | null;
  postal_code: string | null;
  phone: string | null;
  notes: string | null;
};

export type CourierInfo = {
  state: CourierState;
  reference?: string;
  title?: string | null;
  image?: string | null;
  city?: string | null;
  attempts_left?: number;
  cod?: boolean;
  /** COD only: what the buyer pays the rider, in whole rupees. */
  collect?: number | null;
  delivery?: CourierDelivery | null;
};

/** "Rs 1,720" for a COD order's cash, or null when nothing is collected. */
export function codAmount(collect: number | null | undefined): string | null {
  return collect && collect > 0 ? `Rs ${collect.toLocaleString('en-US')}` : null;
}

/** "Collect Rs 1,720 in cash" for a COD order, or null when nothing is collected. */
export function cashToCollect(collect: number | null | undefined): string | null {
  const amount = codAmount(collect);
  return amount ? `Collect ${amount} in cash` : null;
}

export type RiderDelivery = {
  id: string;
  reference: string;
  title: string | null;
  image: string | null;
  city: string | null;
  collect?: number | null;
  active: boolean;
  state: 'to_pick_up' | 'in_transit' | 'delivered' | 'on_hold' | 'closed';
  at: string;
};

/** WEB-008: a rider's list: assigned and waiting for pickup, in transit, and the rest. */
export function groupRiderDeliveries(items: RiderDelivery[]): {
  toPickUp: RiderDelivery[];
  toDeliver: RiderDelivery[];
  past: RiderDelivery[];
} {
  return {
    toPickUp: items.filter((i) => i.state === 'to_pick_up'),
    toDeliver: items.filter((i) => i.active),
    past: items.filter((i) => !i.active && i.state !== 'to_pick_up'),
  };
}

/** Copy for every rider-page state that is just a message (no form). */
export const COURIER_MESSAGES: Partial<Record<CourierState, { icon: string; title: string; body: string }>> = {
  signin: {
    icon: 'log-in',
    title: 'Rider sign-in required',
    body: 'Sign in with your Grabsty rider account to continue.',
  },
  forbidden: {
    icon: 'lock',
    title: 'Riders only',
    body: 'This page is for Grabsty delivery riders. Buyers and sellers follow their orders in Activity.',
  },
  other_rider: { icon: 'truck', title: "Another rider's order", body: 'This order is assigned to another rider.' },
  delivered: { icon: 'check-circle', title: 'Delivered', body: 'This order was delivered. Nothing more to do.' },
  on_hold: { icon: 'pause-circle', title: 'On hold', body: 'An issue was reported on this order. Contact Grabsty logistics before doing anything.' },
  not_ready: { icon: 'clock', title: 'Not ready for pickup', body: "The seller hasn't confirmed Ready to deliver for this order yet." },
  closed: { icon: 'x-circle', title: 'Order closed', body: 'This order was cancelled. Do not collect or deliver the item.' },
  locked: { icon: 'lock', title: 'Code locked', body: 'Too many wrong codes. The seller now has a new pickup code; you can enter it in 30 minutes.' },
  not_found: { icon: 'alert-circle', title: 'Order not found', body: 'This QR code does not match a Grabsty order.' },
};
