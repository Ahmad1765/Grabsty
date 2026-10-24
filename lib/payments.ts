import { Linking, Platform } from "react-native";
import { supabase } from "@/lib/supabase";
// Type-only in the other direction (lib/orders.ts imports `type MyOrder` from
// here), so this pair does not form a runtime cycle.
import { normalizeMyOrder } from "@/lib/orders";
import type { Order as CanonicalOrder, OrderStatus, FulfillmentStatus, FulfillmentType } from "@/types";

// Server returns the hosted Stripe Checkout URL for a given listing.
type SessionResponse = { url: string; sessionId: string };

// A row of public.orders — the ONLY record of a real payment. Written solely by
// the stripe-webhook edge function under the service role after a signature-
// verified checkout.session.completed.
//
// Payment state must never be read off listings.is_sold: that flag is a seller-
// controlled listing-lifecycle toggle (app/product/[id].tsx "Mark as sold"),
// so trusting it lets a seller forge a Paid invoice, or flip a genuinely paid
// one back to Pending and send the buyer to pay a second time.
export type { OrderStatus, FulfillmentStatus, FulfillmentType };
export type Order = CanonicalOrder;

/**
 * The caller's order for a listing, newest first, or null if they never paid.
 *
 * RLS scopes public.orders to buyer_id/seller_id, so this returns rows only for
 * the two parties to the sale — a third party viewing the same listing sees
 * null and gets the Pending state, which is the truth for them.
 */
export async function fetchOrderForListing(
  idOrListingId: string,
): Promise<Order | null> {
  const SELECT_ORDER_COLS =
    "id, status, fulfillment_status, fulfillment_type, amount_cents, fee_cents, currency, payment_method, shipping_method, shipping_fee_cents, order_seller_pickups(pickup_address), shipping_address, delivery_notes, courier_name, tracking_number, cancel_reason, cancelled_by, dispute_reason, dispute_evidence_urls, disputed_at, dispute_resolved_at, payment_authorized_at, packed_at, shifted_at, shipped_at, delivered_at, completed_at, cod_paid_at, cod_buyer_confirmed_at, cod_seller_confirmed_at, supplier_name, supplier_order_id, created_at, listing_id, buyer_id, seller_id, listing:listings(id, title, images, thumbnails, price, category, seller_id, is_sold), buyer:profiles!orders_buyer_id_fkey(id, username, full_name, avatar_url), seller:profiles!orders_seller_id_fkey(id, username, full_name, avatar_url)";

  const formatOrderRow = (row: any): Order => {
    const rawPickup = row.order_seller_pickups;
    const pickupObj = Array.isArray(rawPickup) ? rawPickup[0] : rawPickup;
    const rawListing = row.listing;
    const listingObj = Array.isArray(rawListing) ? rawListing[0] : rawListing;
    const rawBuyer = row.buyer;
    const buyerObj = Array.isArray(rawBuyer) ? rawBuyer[0] : rawBuyer;
    const rawSeller = row.seller;
    const sellerObj = Array.isArray(rawSeller) ? rawSeller[0] : rawSeller;
    return {
      ...row,
      listing: listingObj ?? null,
      buyer: buyerObj ?? null,
      seller: sellerObj ?? null,
      seller_pickup_address: pickupObj?.pickup_address ?? null,
    } as Order;
  };

  // Check if idOrListingId is a valid UUID (Postgres UUID column requires valid syntax)
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrListingId);
  if (!isUuid) {
    return null;
  }

  // The id may be an order id (order row click) or a listing id (product page).
  // Both lookups run at once instead of one after the other — the product page
  // always lands in the second, so it saved a full round trip (~300 ms) there.
  // The direct order match still wins when both return a row.
  const [direct, byListing] = await Promise.all([
    supabase
      .from("orders")
      .select(SELECT_ORDER_COLS)
      .eq("id", idOrListingId)
      .maybeSingle(),
    supabase
      .from("orders")
      .select(SELECT_ORDER_COLS)
      .eq("listing_id", idOrListingId)
      .neq("status", "awaiting_payment")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!direct.error && direct.data) {
    return formatOrderRow(direct.data);
  }

  const { data, error } = byListing;

  if (error) {
    console.warn('[payments] fetchOrderForListing query error:', error.message);
    return null;
  }
  if (!data) return null;
  return formatOrderRow(data);
}

// An order joined to the item it paid for, as the order history needs it.
// `buyer_id` / `seller_id` come along so the caller can tell which side of the
// sale the viewer was on — the same row is a purchase for one party and a sale
// for the other.
export type MyOrder = Order & {
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  listing: {
    id: string;
    title: string | null;
    images: string[] | null;
    thumbnails?: string[] | null;
    price: number | string | null;
  } | null;
  buyer?: {
    id: string;
    username: string | null;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
  seller?: {
    id: string;
    username: string | null;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
};

// The embed as PostgREST may actually hand it back — see the normalization in
// fetchMyOrders below.
type MyOrderRow = Omit<MyOrder, "listing"> & {
  listing: MyOrder["listing"] | MyOrder["listing"][];
  buyer?: any;
  seller?: any;
};

/**
 * Every order the caller is a party to, newest first.
 *
 * RLS ("Buyers and sellers can view own orders") is what actually restricts the
 * rows; the explicit .or() is here so the query uses orders_buyer_idx /
 * orders_seller_idx rather than filtering after a scan.
 *
 * Throws rather than returning [] so React Query can retry and the screen can
 * tell "no purchases yet" apart from "we failed to load your purchases" — the
 * two must not render the same way on a screen about money.
 */
export async function fetchMyOrders(userId: string): Promise<MyOrder[]> {
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, status, fulfillment_status, fulfillment_type, amount_cents, fee_cents, currency, payment_method, shipping_method, shipping_fee_cents, shipping_address, delivery_notes, courier_name, tracking_number, cancel_reason, cancelled_by, dispute_reason, dispute_evidence_urls, disputed_at, dispute_resolved_at, payment_authorized_at, packed_at, shifted_at, shipped_at, delivered_at, completed_at, cod_paid_at, cod_buyer_confirmed_at, cod_seller_confirmed_at, supplier_name, supplier_order_id, created_at, listing_id, buyer_id, seller_id, listing:listings(id, title, images, thumbnails, price), buyer:profiles!orders_buyer_id_fkey(id, username, full_name, avatar_url), seller:profiles!orders_seller_id_fkey(id, username, full_name, avatar_url)",
    )
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .neq("status", "awaiting_payment")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  // normalizeMyOrder lives in lib/orders.ts so it is reachable by a test — see
  // the note there for why the embed shape can't just be asserted.
  return ((data ?? []) as unknown as MyOrderRow[]).map(normalizeMyOrder) as MyOrder[];
}

// Stripe is "enabled" only when a publishable key has been set. Until then
// the Pay button runs in demo mode — no API call, just a simulated success
// redirect so the UI flow is still walkable.
const PK = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
export const STRIPE_ENABLED =
  PK.startsWith("pk_test_") || PK.startsWith("pk_live_");

export async function createCheckoutSession(
  listingId: string,
  opts: { offerAmount?: number } = {},
): Promise<SessionResponse> {
  const returnUrl = buildReturnUrl(listingId);
  // offer_amount is forwarded to the edge function so an accepted offer can
  // override the listing price. The server is responsible for verifying the
  // amount matches a real accepted offer for (buyer, listing) — never trust
  // the client value alone.
  const body: Record<string, unknown> = {
    listing_id: listingId,
    return_url: returnUrl,
  };
  // offerAmount is expected to be in dollars. If cents are passed, format to 2 decimals.
  if (typeof opts.offerAmount === 'number' && Number.isFinite(opts.offerAmount) && opts.offerAmount > 0) {
    body.offer_amount = Number(opts.offerAmount.toFixed(2));
  }
  const { data, error } = await supabase.functions.invoke<SessionResponse>(
    "create-checkout-session",
    { body },
  );
  if (error) throw new Error(error.message);
  if (!data?.url) throw new Error("No checkout URL returned");
  return data;
}

export async function openCheckout(url: string): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.location.href = url;
    return;
  }
  await Linking.openURL(url);
}

// Stripe redirects buyers here after a successful (or canceled) checkout.
// On web we use the current origin so the redirect stays in the same tab.
// On native we use the Expo dev/app scheme.
function buildReturnUrl(listingId: string) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return `${window.location.origin}/invoice/${listingId}?paid=1`;
  }
  // Expo deep-link scheme.
  return `grabsty://invoice/${listingId}?paid=1`;
}
