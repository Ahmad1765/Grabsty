import type { ValidatedShippingAddress } from './validation/order';

export type { ValidatedShippingAddress };

export type Gender = 'all' | 'men' | 'women' | 'unisex';

export type Condition = 'new_with_tags' | 'like_new' | 'good' | 'fair';

export type Category =
  | 'clothing'
  | 'shoes'
  | 'bags'
  | 'accessories'
  | 'beauty'
  | 'other';

export type Authenticity = 'original' | 'inspired' | 'replica' | 'not_sure';

export interface ListingLiker {
  id: string;
  user_id: string;
  username: string;
  full_name?: string | null;
  avatar_url?: string | null;
  is_verified?: boolean;
  created_at: string;
}

export interface User {
  id: string;
  username: string;
  avatar_url: string | null;
  // Wide header image behind the avatar on the profile screens. Null on every
  // row created before the column existed — callers must render a fallback.
  banner_url?: string | null;
  full_name: string;
  bio: string | null;
  location: string | null;
  website?: string | null;
  rating: number;
  total_sales: number;
  created_at: string;
  // Settings-driven fields (optional for backwards compat with existing reads)
  vacation_mode?: boolean;
  bundle_discount_pct?: number;
  saved_collection_privacy?: 'public' | 'private';
  is_verified?: boolean;
  is_pro?: boolean;
  followers_count?: number;
  following_count?: number;
  // Category slugs captured at onboarding (feed personalization, future use).
  interests?: string[] | null;
  is_admin?: boolean;
  phone?: string | null;
}

export type Profile = User;

export interface ShippingAddress {
  id: string;
  user_id: string;
  recipient_name: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string | null;
  postal_code: string;
  country: string;
  phone: string | null;
  is_default: boolean;
  coordinates?: { lat: number; lng: number } | null;
  delivery_instructions?: string | null;
  created_at: string;
  updated_at: string;
}

export type PaymentMethod = 'card' | 'cod';

export type OrderStatus =
  | 'awaiting_payment'
  | 'pending'
  | 'paid'
  | 'packing'
  | 'picked'
  | 'shifting'
  | 'delivered'
  | 'completed'
  | 'disputed'
  | 'refund_due'
  | 'refunded'
  | 'canceled'
  | 'failed';

export type FulfillmentStatus =
  | 'awaiting_payment'
  | 'pending'
  | 'packing'
  | 'picked'
  | 'shifting'
  | 'delivered'
  | 'completed'
  | 'disputed'
  | 'canceled';

export type FulfillmentType = 'direct' | 'dropship';
export type ShippingMethod = 'managed' | 'self_ship';

export interface SellerPickupAddress {
  recipientName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
}

// A row of public.orders — record of payments, fulfillment lifecycle, and Cash on Delivery orders.
export interface Order {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  amount_cents: number;
  fee_cents: number;
  currency: string;
  shipping_method?: ShippingMethod | null;
  shipping_fee_cents?: number | null;
  /** Attached value sourced through get_order_seller_pickup(p_order_id); not returned by standard reads of public.orders. */
  seller_pickup_address?: SellerPickupAddress | null;
  /** Courier pickup code from Ready to deliver. Seller + admins only (RLS). */
  pickup_code?: string | null;
  /** Set when the courier entered the pickup code (order locked In Transit). */
  pickup_verified_at?: string | null;
  stripe_session_id?: string | null;
  stripe_payment_intent?: string | null;
  offer_message_id?: string | null;
  payment_method?: PaymentMethod;
  payment_status?: string | null;
  status: OrderStatus;
  fulfillment_status?: FulfillmentStatus | null;
  fulfillment_type?: FulfillmentType | null;
  supplier_name?: string | null;
  supplier_order_id?: string | null;
  shipping_address?: ValidatedShippingAddress | null;
  delivery_notes?: string | null;
  courier_name?: string | null;
  tracking_number?: string | null;
  cancel_reason?: string | null;
  cancelled_by?: string | null;
  dispute_reason?: string | null;
  dispute_evidence_urls?: string[] | null;
  disputed_at?: string | null;
  dispute_resolved_at?: string | null;
  payment_authorized_at?: string | null;
  packed_at?: string | null;
  shifted_at?: string | null;
  shipped_at?: string | null;
  delivered_at?: string | null;
  completed_at?: string | null;
  cod_paid_at?: string | null;
  cod_buyer_confirmed_at?: string | null;
  cod_seller_confirmed_at?: string | null;
  escrow_status?: EscrowStatus | null;
  payout_amount_cents?: number | null;
  bundle_item_ids?: string[] | null;
  bundle_count?: number | null;
  listing?: any;
  buyer?: any;
  seller?: any;
  created_at: string;
}

export type EscrowStatus =
  | 'PENDING_PAYMENT'
  | 'PAYMENT_SECURED_ESCROW'
  | 'READY_FOR_PICKUP'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'COMPLETED_FUNDS_RELEASED'
  | 'DISPUTED'
  | 'CANCELLED';

// A row of public.transactions — formal Escrow ledger with strict state machine and accounting balance.
export interface Transaction {
  id: string;
  order_id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  amount_cents: number;
  platform_fee_cents: number;
  shipping_fee_cents: number;
  payout_amount_cents: number;
  currency: string;
  payment_method: 'card' | 'cod';
  status: EscrowStatus;
  escrow_secured_at?: string | null;
  ready_for_pickup_at?: string | null;
  picked_up_at?: string | null;
  delivered_at?: string | null;
  funds_released_at?: string | null;
  disputed_at?: string | null;
  cancelled_at?: string | null;
  dispute_reason?: string | null;
  dispute_evidence_urls?: string[] | null;
  cancel_reason?: string | null;
  cancelled_by?: string | null;
  courier_name?: string | null;
  tracking_number?: string | null;
  logistics_notes?: string | null;
  logistics_agent_id?: string | null;
  created_at: string;
  updated_at: string;
  order?: Order | null;
  listing?: Listing | null;
  buyer?: Profile | null;
  seller?: Profile | null;
}

export interface TransactionEventLog {
  id: string;
  transaction_id: string;
  order_id: string;
  from_status?: string | null;
  to_status: string;
  actor_id?: string | null;
  action: string;
  notes?: string | null;
  metadata?: Record<string, any>;
  created_at: string;
}

export type PayoutKind = 'bank' | 'wallet';

export interface PayoutMethod {
  id: string;
  user_id: string;
  kind: PayoutKind;
  /** Bank / wallet name (legacy rows: free-text label). */
  label: string;
  provider?: string | null;
  account_title?: string | null;
  /** Full IBAN / account no. / wallet mobile. Owner + admins only (RLS). */
  account_number?: string | null;
  account_last4: string;
  is_default: boolean;
  created_at: string;
}

export type VerificationStatus = 'submitted' | 'approved' | 'rejected';
export type DocumentKind = 'passport' | 'national_id' | 'drivers_license';

export interface Verification {
  user_id: string;
  status: VerificationStatus;
  legal_name: string;
  document_kind: DocumentKind;
  document_number_last4: string | null;
  notes: string | null;
  id_photo_url?: string | null;
  /** 13-digit CNIC, digits only. */
  cnic_number?: string | null;
  /** verification-docs path of the CNIC back photo (front is in `notes`). */
  id_back_photo_path?: string | null;
  submitted_at: string;
  reviewed_at: string | null;
}

export interface Listing {
  id: string;
  seller_id: string;
  seller: User;
  title: string;
  description: string;
  price: number; // in USD
  category: Category;
  // Optional one-level subcategory (slug from lib/categories). Null on legacy
  // rows created before the taxonomy landed.
  subcategory?: string | null;
  gender: Gender;
  brand: string | null;
  size: string | null;
  // Optional colour slug from lib/itemColors. Null on legacy rows.
  color?: string | null;
  condition: Condition;
  // `listings.images` is `text[]` with no NOT NULL constraint, so Postgres can
  // and does hand back null. Typing this as `string[]` hid that from the
  // compiler and let `listing.images.map()` white-screen the product page on
  // any such row. Keep it nullable so every read has to answer for it.
  images: string[] | null;
  // Card-sized copies of `images`, index-aligned, written at upload time (see
  // lib/upload.ts). Null on rows created before the column existed, and absent
  // from any query that doesn't select it — read it through
  // `cardImageUrl()` in lib/images.ts rather than indexing it directly, so the
  // fallback to the full-size image stays in one place.
  thumbnails?: string[] | null;
  is_sold: boolean;
  views: number;
  likes: number;
  // Seller-defined free-form tags. Stored as text[] in Postgres with a GIN
  // index so discover can do `tags && '{x,y}'` lookups cheaply.
  tags?: string[];
  // Optional free-text material (e.g. "Faux fur", "Cotton"). Null on legacy rows.
  material?: string | null;
  // Optional shipping parcel size, one of 'small' | 'medium' | 'large'. Null on legacy rows.
  parcel_size?: string | null;
  // Authenticity declaration (original | inspired | replica | not_sure)
  authenticity?: Authenticity | null;
  // Taxonomy version applied when creating/updating the listing (e.g. 3)
  taxonomy_version?: number | null;
  user_has_liked?: boolean;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

export interface Conversation {
  id: string;
  listing_id: string;
  listing: Listing;
  buyer_id: string;
  seller_id: string;
  other_user: User;
  last_message: string | null;
  updated_at: string;
}
