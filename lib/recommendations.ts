import { supabase } from '@/lib/supabase';
import { fetchListings } from '@/lib/listings';
import { putCachedListings } from '@/lib/listingCache';
import type { Listing } from '@/types';

// Why a recommendation can rank: lets the UI hint at provenance ("For you"
// vs "Trending") without exposing raw scores.
export type RecReason = 'intent' | 'cf' | 'social' | 'taste' | 'trending';

export type RecommendedListing = Listing & {
  rec_score?: number;
  rec_reason?: RecReason;
};

const SELLER_COLS = 'id, username, full_name, avatar_url, is_verified, vacation_mode';

// Hydrate bare RPC rows with their seller profiles in one round-trip, the
// same pattern fetchSimilarListings uses (RPCs can't embed relations).
async function hydrateSellers<T extends Listing>(rows: T[]): Promise<T[]> {
  const sellerIds = Array.from(new Set(rows.map((r) => r.seller_id).filter(Boolean)));
  if (sellerIds.length === 0) return rows;
  const { data: sellers, error } = await supabase
    .from('profiles')
    .select(SELLER_COLS)
    .in('id', sellerIds);
  if (error) {
    console.warn('[recs] hydrateSellers', error.message);
    return rows;
  }
  const byId = new Map<string, Listing['seller']>(
    ((sellers ?? []) as Listing['seller'][]).map((s) => [s.id, s]),
  );
  return rows.map((r) => ({ ...r, seller: byId.get(r.seller_id) ?? r.seller }));
}

// Personalized feed via the get_recommendations RPC (hybrid recommender:
// taste profile + item-to-item collaborative filtering + social + saved-search
// intent + quality prior; trending cold-start for new/anonymous users).
// Falls back to the popular feed on RPC failure, and backfills with popular
// when personalization excludes too much (small catalogs, power users who
// already engaged with most items) — the rail should never look empty.
//
// The three requests used to run one after another (rpc → backfill → sellers),
// and each costs a full round trip (~300–600 ms from Pakistan to the Tokyo
// region). Now the backfill is fetched alongside the rpc, and only rpc rows —
// which can't embed relations — get their sellers looked up, overlapping the
// backfill. Same rows, same order; one round trip shorter at worst.
// viewerId comes from the caller: reading the session here can deadlock with
// supabase-js's auth lock when a sign-in listener triggers this refetch.
export async function fetchRecommendations(limit = 24, viewerId: string | null = null): Promise<RecommendedListing[]> {
  const recsPromise = (async (): Promise<RecommendedListing[]> => {
    const { data, error } = await supabase.rpc('get_recommendations', { p_limit: limit });
    if (error) {
      console.warn('[recs] get_recommendations rpc', error.message);
      return [];
    }
    return hydrateSellers((data ?? []) as RecommendedListing[]);
  })();
  // Backfill already embeds sellers (SELECT_FEED). A failure just means no backfill.
  const fallbackPromise = fetchListings({ tab: 'for_you', limit }).catch((e) => {
    console.warn('[recs] backfill', e);
    return [] as Listing[];
  });

  const [recs, fallback] = await Promise.all([recsPromise, fallbackPromise]);
  // The rpc already skips the viewer's own listings; the trending backfill doesn't.
  const rows: RecommendedListing[] = recs.slice(0, limit);
  const seen = new Set(rows.map((r) => r.id));
  for (const p of fallback) {
    if (rows.length >= limit) break;
    if (seen.has(p.id) || (viewerId && p.seller_id === viewerId)) continue;
    seen.add(p.id);
    rows.push({ ...p, rec_reason: 'trending' });
  }

  if (rows.length === 0) return [];
  putCachedListings(rows);
  return rows;
}

// Fire-and-forget view tracking. The RPC dedupes repeat views inside a
// 30-minute window and ignores sellers viewing their own listings, so the
// caller doesn't need any guards — just call it on product-page mount.
export function logListingView(listingId: string): void {
  supabase
    .rpc('log_listing_view', { p_listing_id: listingId })
    .then(({ error }) => {
      if (error) console.warn('[recs] log_listing_view', error.message);
    });
}

// Fire-and-forget "seller opened from search" hit for Most searched. The RPC
// ignores anon/self and keeps one row per seller+searcher+day.
export function logSellerSearch(sellerId: string): void {
  supabase.rpc('log_seller_search', { p_seller_id: sellerId }).then(({ error }) => {
    if (error) console.warn('[recs] log_seller_search', error.message);
  });
}

// The signed-in user's recent views (own rows only via RLS), hydrated to
// full listings for the "Recently viewed" rail. Sold items are kept out:
// the rail is a "pick up where you left off" affordance, not a history page.
export async function fetchRecentlyViewed(limit = 10): Promise<Listing[]> {
  const { data: views, error } = await supabase
    .from('listing_views')
    .select('listing_id, last_viewed_at')
    .order('last_viewed_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.warn('[recs] fetchRecentlyViewed views', error.message);
    return [];
  }
  const ids = (views ?? []).map((v) => (v as { listing_id: string }).listing_id);
  if (ids.length === 0) return [];

  const { data: listings, error: lErr } = await supabase
    .from('listings')
    .select(`*, seller:profiles!listings_seller_id_fkey(${SELLER_COLS})`)
    .in('id', ids)
    .eq('is_sold', false);
  if (lErr) {
    console.warn('[recs] fetchRecentlyViewed listings', lErr.message);
    return [];
  }
  // Restore recency order lost by the IN query.
  const order = new Map(ids.map((id, i) => [id, i]));
  const rows = ((listings ?? []) as unknown as Listing[]).sort(
    (a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99),
  );
  putCachedListings(rows);
  return rows;
}
