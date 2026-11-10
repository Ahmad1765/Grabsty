// Buyer delivery details (full address, phone, delivery note) live in
// order_delivery_contacts, readable only by the buyer and admins. The order
// row itself only keeps city + country, so a seller never receives them.
// Loaders embed `order_delivery_contacts(address, delivery_notes)` and run the
// row through this: buyer/admin get the full details back on the usual
// fields, a seller's embed comes back empty and nothing changes.

export const DELIVERY_CONTACT_EMBED = 'order_delivery_contacts(address, delivery_notes)';

type Contact = { address?: Record<string, unknown> | null; delivery_notes?: string | null };

export function withDeliveryContact<T extends Record<string, any>>(row: T): T {
  if (!row) return row;
  const raw = row.order_delivery_contacts as Contact | Contact[] | null | undefined;
  const c = Array.isArray(raw) ? raw[0] : raw;
  const { order_delivery_contacts: _drop, ...rest } = row;
  if (!c) return rest as unknown as T;
  return {
    ...rest,
    shipping_address: c.address && Object.keys(c.address).length ? c.address : row.shipping_address,
    delivery_notes: c.delivery_notes ?? row.delivery_notes ?? null,
  } as unknown as T;
}

/**
 * Merge a server update into the order on screen. RPC results and realtime
 * rows are plain public.orders rows: they carry neither the private delivery
 * details nor the embeds, so keep those from what's already loaded.
 */
export function mergeOrderUpdate<T extends Record<string, any>>(prev: T | null | undefined, next: Partial<T>): T {
  if (!prev) return next as T;
  const keep = (k: string) => (prev[k] !== undefined && prev[k] !== null ? prev[k] : (next as any)[k]);
  const prevAddr = prev.shipping_address as Record<string, unknown> | null | undefined;
  const nextAddr = (next as any).shipping_address as Record<string, unknown> | null | undefined;
  const prevIsFuller = !!prevAddr && Object.keys(prevAddr).length > Object.keys(nextAddr ?? {}).length;
  return {
    ...prev,
    ...next,
    shipping_address: prevIsFuller ? prevAddr : (nextAddr ?? prevAddr ?? null),
    delivery_notes: keep('delivery_notes'),
    pickup_code: keep('pickup_code'),
    pickup_verified_at: keep('pickup_verified_at'),
    seller_pickup_address: keep('seller_pickup_address'),
    listing: keep('listing'),
    buyer: keep('buyer'),
    seller: keep('seller'),
  } as T;
}
