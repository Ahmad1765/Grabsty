import { supabase } from '@/lib/supabase';
import type { Listing, ListingLiker } from '@/types';
import { putCachedListings } from '@/lib/listingCache';
import { getLikedIds, updateLikedCache } from '@/lib/engagementCache';
import { captureError } from '@/lib/sentry';
import { escapeSearchQuery } from '@/lib/search';
import { enqueueOfflineAction, isNetworkError } from '@/lib/offlineSync';

const SELECT_WITH_SELLER = '*, seller:profiles!listings_seller_id_fkey(*)';

// Slim feed payload: drop `description` (long, not shown on cards) and pull
// only the seller fields ListingCard actually reads. Cuts wire bytes per row
// by ~60% — the real fix for "feed takes 10s then expires" on cold start, since
// the DB query itself runs in <1ms (verified). Inner join so vacation_mode
// filter applies; every listing has a seller so no rows are lost.
const FEED_LISTING_COLS =
  'id, seller_id, title, brand, size, price, category, subcategory, color, gender, condition, images, thumbnails, is_sold, views, likes, tags, created_at';
const FEED_SELLER_COLS = 'id, username, full_name, avatar_url, is_verified, vacation_mode';
const SELECT_FEED = `${FEED_LISTING_COLS}, seller:profiles!listings_seller_id_fkey!inner(${FEED_SELLER_COLS})`;
const SELECT_SEARCH_FEED = `${FEED_LISTING_COLS}, description, seller:profiles!listings_seller_id_fkey!inner(${FEED_SELLER_COLS})`;

export type FeedTab = 'for_you' | 'popular';

// Sort options surfaced in Discover's category browse. When omitted, ordering
// falls back to the tab default (popular → likes, otherwise newest).
export type SortKey = 'newest' | 'price_asc' | 'price_desc' | 'popular';

// Discriminated result: ok=false means the network/client wedged, the timeout
// fired, or PostgREST returned an error — caller should preserve whatever
// listings are already on screen rather than commit an empty array. ok=true
// is "trust this" — a genuinely empty rows array is a real "no listings"
// signal worth committing.
export type FetchListingsResult = { ok: true; rows: Listing[] } | { ok: false };

export async function fetchListingsResult(
  opts: {
    tab?: FeedTab;
    limit?: number;
    offset?: number;
    category?: string | null;
    subcategory?: string | null;
    sort?: SortKey | null;
  } = {},
): Promise<FetchListingsResult> {
  const { tab = 'for_you', limit = 60, offset = 0, category = null, subcategory = null, sort = null } = opts;
  let query = supabase
    .from('listings')
    .select(SELECT_FEED)
    .eq('is_sold', false)
    .eq('seller.vacation_mode', false);
  if (category) query = query.eq('category', category);
  if (subcategory) query = query.eq('subcategory', subcategory);

  if (sort === 'price_asc') {
    query = query.order('price', { ascending: true }).order('created_at', { ascending: false });
  } else if (sort === 'price_desc') {
    query = query.order('price', { ascending: false }).order('created_at', { ascending: false });
  } else if (sort === 'popular' || (!sort && tab === 'popular')) {
    query = query
      .order('likes', { ascending: false, nullsFirst: false })
      .order('views', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
  } else {
    // 'newest' or the for_you default.
    query = query.order('created_at', { ascending: false });
  }
  if (offset > 0) {
    query = query.range(offset, offset + limit - 1);
  }

  // Belt-and-braces: even with the global fetch ceiling in lib/supabase.ts,
  // race against an explicit timeout AND wrap the await in try/catch so this
  // function can NEVER hang or throw. The home feed depends on this resolving
  // — a hung promise means an eternal skeleton, which is the worst UX.
  const limited = offset > 0 ? query : query.limit(limit);
  let timer: ReturnType<typeof setTimeout>;
  try {
    const result = await Promise.race([
      limited,
      new Promise<{ data: null; error: Error }>((resolve) => {
        timer = setTimeout(
          () =>
            resolve({
              data: null,
              error: new Error('fetchListings hard timeout'),
            }),
          10_000,
        );
      }),
    ]);
    const { data, error } = result as { data: unknown; error: { message: string } | null };
    if (error) {
      console.warn('[listings] fetchListings', error.message);
      return { ok: false };
    }
    const rows = (data ?? []) as unknown as Listing[];
    putCachedListings(rows);
    return { ok: true, rows };
  } catch (e: any) {
    captureError(e, { fn: 'fetchListings' });
    return { ok: false };
  } finally {
    clearTimeout(timer!);
  }
}

// Back-compat thin wrapper for any caller that doesn't care about the
// failure mode and just wants "whatever rows we got, or []". The home feed
// uses fetchListingsResult directly so it can tell a wedge from an empty feed.
export async function fetchListings(
  opts: {
    tab?: FeedTab;
    limit?: number;
    category?: string | null;
    subcategory?: string | null;
    sort?: SortKey | null;
  } = {},
): Promise<Listing[]> {
  const r = await fetchListingsResult(opts);
  return r.ok ? r.rows : [];
}

// Listings whose seller the current user follows. Two-step query because
// PostgREST doesn't let us join through `user_follows` and back into
// `listings` in one shot. Returns the same discriminated result shape as
// `fetchListingsResult` so the home screen's wedge-vs-empty branch stays
// uniform.
export async function fetchFollowingListingsResult(
  userId: string,
  limit = 60,
): Promise<FetchListingsResult> {
  try {
    const { data: rows, error: followErr } = await supabase
      .from('user_follows')
      .select('followee_id')
      .eq('follower_id', userId);
    if (followErr) {
      console.warn('[listings] fetchFollowingListings follow', followErr.message);
      return { ok: false };
    }
    const followeeIds = (rows ?? []).map((r) => (r as { followee_id: string }).followee_id);
    if (followeeIds.length === 0) return { ok: true, rows: [] };

    const { data, error } = await supabase
      .from('listings')
      .select(SELECT_FEED)
      .in('seller_id', followeeIds)
      .eq('is_sold', false)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      console.warn('[listings] fetchFollowingListings', error.message);
      return { ok: false };
    }
    const out = (data ?? []) as unknown as Listing[];
    putCachedListings(out);
    return { ok: true, rows: out };
  } catch (e: any) {
    captureError(e, { fn: 'fetchFollowingListings' });
    return { ok: false };
  }
}

// Server-side search across the WHOLE catalog (title, brand, description,
// tags). The Discover screen previously filtered its 60 cached "popular" rows
// client-side, which silently missed anything outside that window. Escapes
// PostgREST `or()` metacharacters and ilike wildcards so user input can't
// break the filter expression.
const SEARCH_STOP_WORDS = new Set([
  'for',
  'with',
  'and',
  'the',
  'a',
  'an',
  'in',
  'on',
  'at',
  'of',
  'to',
  'by',
  'from',
]);

export function getSearchTokenVariants(token: string): string[] {
  const t = token.toLowerCase().trim();
  if (!t) return [];
  const variants = new Set<string>([t]);

  if (t.endsWith('ies') && t.length > 4) {
    variants.add(t.slice(0, -3) + 'y');
  } else if (t.endsWith('ss')) {
    variants.add(t + 'es');
  } else if (t.endsWith('es') && t.length > 3) {
    const pre = t[t.length - 3];
    const isConsonant = /[^aeiou]/i.test(pre);
    if (isConsonant) {
      variants.add(t.slice(0, -2));
    }
    if (!t.endsWith('sses')) {
      variants.add(t.slice(0, -1));
    }
  } else if (t.endsWith('s') && t.length > 3 && !t.endsWith('ss')) {
    variants.add(t.slice(0, -1));
  } else {
    variants.add(t + 's');
  }
  return Array.from(variants);
}

function scoreListingRelevance(listing: Listing, rawQuery: string, tokens: string[]): number {
  let score = 0;
  const qLower = rawQuery.toLowerCase();
  const title = (listing.title ?? '').toLowerCase();
  const brand = (listing.brand ?? '').toLowerCase();
  const desc = (listing.description ?? '').toLowerCase();
  const sub = (listing.subcategory ?? '').toLowerCase();
  const cat = (listing.category ?? '').toLowerCase();
  const tags = Array.isArray(listing.tags)
    ? listing.tags.map((t) => (typeof t === 'string' ? t.toLowerCase() : ''))
    : [];

  // Exact phrase matches
  if (title.includes(qLower)) score += 100;
  if (brand.includes(qLower)) score += 80;

  // Individual token matches
  for (const token of tokens) {
    const variants = getSearchTokenVariants(token);
    const inTitle = variants.some((v) => title.includes(v));
    const inBrand = variants.some((v) => brand.includes(v));
    const inTags = variants.some((v) => tags.some((tag) => tag.includes(v)));
    const inSub = variants.some((v) => sub.includes(v) || cat.includes(v));
    const inDesc = variants.some((v) => desc.includes(v));

    if (inTitle) score += 35;
    if (inBrand) score += 30;
    if (inTags) score += 25;
    if (inSub) score += 20;
    if (inDesc) score += 10;
  }

  score += Math.min(15, (listing.likes ?? 0) * 0.1);
  return score;
}

// Bounded candidate pool cap to prevent unbounded full-table fetches
// while providing enough candidates for client-side relevance ranking.
export const CANDIDATE_CAP = 200;

// Server-side search across the WHOLE catalog (title, brand, description, tags, category, subcategory).
// Supports multi-token conjunctions, word stemming, and client-side relevance scoring.
export async function searchListings(opts: {
  query: string;
  category?: string | null;
  subcategory?: string | null;
  limit?: number;
}): Promise<FetchListingsResult> {
  const { query, category = null, subcategory = null, limit = 60 } = opts;
  const raw = query.trim();
  if (!raw) return { ok: true, rows: [] };

  const rawTokens = raw.split(/\s+/).filter((t) => t.length > 0);
  const significantTokens = rawTokens.filter((t) => !SEARCH_STOP_WORDS.has(t.toLowerCase()));
  const tokens = significantTokens.length > 0 ? significantTokens : rawTokens;

  try {
    let q = supabase
      .from('listings')
      .select(SELECT_SEARCH_FEED)
      .eq('is_sold', false)
      .eq('seller.vacation_mode', false);

    if (category) q = q.eq('category', category);
    if (subcategory) q = q.eq('subcategory', subcategory);

    // Apply tokenized conjunction filters (each token must match one of the listing fields)
    for (const token of tokens) {
      const variants = getSearchTokenVariants(token);
      const tokenConds: string[] = [];

      for (const variant of variants) {
        const safe = escapeSearchQuery(variant);
        if (!safe) continue;
        tokenConds.push(`title.ilike.%${safe}%`);
        tokenConds.push(`brand.ilike.%${safe}%`);
        tokenConds.push(`description.ilike.%${safe}%`);
        tokenConds.push(`category.ilike.%${safe}%`);
        tokenConds.push(`subcategory.ilike.%${safe}%`);
        if (/^[a-zA-Z0-9_-]+$/.test(safe)) {
          tokenConds.push(`tags.cs.{${safe}}`);
        }
      }

      if (tokenConds.length > 0) {
        q = q.or(tokenConds.join(','));
      }
    }

    let { data, error } = await q
      .order('likes', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(CANDIDATE_CAP);

    // Fallback: If strict multi-token AND returned 0 results, fall back to matching primary token
    if ((!data || data.length === 0) && tokens.length > 1) {
      const primaryToken = tokens[0];
      const variants = getSearchTokenVariants(primaryToken);
      const primaryConds: string[] = [];
      for (const variant of variants) {
        const safe = escapeSearchQuery(variant);
        if (!safe) continue;
        primaryConds.push(`title.ilike.%${safe}%`);
        primaryConds.push(`brand.ilike.%${safe}%`);
        primaryConds.push(`description.ilike.%${safe}%`);
        primaryConds.push(`category.ilike.%${safe}%`);
        primaryConds.push(`subcategory.ilike.%${safe}%`);
        if (/^[a-zA-Z0-9_-]+$/.test(safe)) {
          primaryConds.push(`tags.cs.{${safe}}`);
        }
      }

      if (primaryConds.length > 0) {
        let fallbackQ = supabase
          .from('listings')
          .select(SELECT_SEARCH_FEED)
          .eq('is_sold', false)
          .eq('seller.vacation_mode', false)
          .or(primaryConds.join(','));

        if (category) fallbackQ = fallbackQ.eq('category', category);
        if (subcategory) fallbackQ = fallbackQ.eq('subcategory', subcategory);

        const fallbackRes = await fallbackQ
          .order('likes', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .limit(CANDIDATE_CAP);

        if (!fallbackRes.error && fallbackRes.data) {
          data = fallbackRes.data;
          error = null;
        } else if (fallbackRes.error) {
          error = fallbackRes.error;
        }
      }
    }

    if (error) {
      console.warn('[listings] searchListings', error.message);
      return { ok: false };
    }


    let rows = (data ?? []) as unknown as Listing[];

    // Relevance scoring and ranking
    if (rows.length > 1) {
      rows = [...rows].sort((a, b) => {
        const scoreA = scoreListingRelevance(a, raw, tokens);
        const scoreB = scoreListingRelevance(b, raw, tokens);
        if (scoreB !== scoreA) {
          return scoreB - scoreA;
        }
        return (b.likes ?? 0) - (a.likes ?? 0);
      });
    }

    if (limit > 0 && rows.length > limit) {
      rows = rows.slice(0, limit);
    }

    putCachedListings(rows);
    return { ok: true, rows };
  } catch (e: any) {
    captureError(e, { fn: 'searchListings' });
    return { ok: false };
  }
}

// Single-listing reads are NOT exported from here. They live in the queryFn of
// useListingQuery (lib/queries.ts), which is the only way to fetch one — four
// screens each hand-rolled their own load effect around the old
// `fetchListingById`, complete with duplicated abort flags, cache seeding, and a
// 25s Promise.race that could never fire (lib/supabase.ts already aborts every
// request at 12s). The column list they shared is exported instead.
export const SELECT_LISTING_WITH_SELLER = SELECT_WITH_SELLER;

export async function fetchUserListings(sellerId: string): Promise<Listing[]> {
  const { data, error } = await supabase
    .from('listings')
    .select(SELECT_WITH_SELLER)
    .eq('seller_id', sellerId)
    .order('is_sold', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('[listings] fetchUserListings', error.message);
    return [];
  }
  return (data ?? []) as unknown as Listing[];
}

// Ranked "more from this seller" — calls the find_seller_other_listings RPC
// which orders by likes desc, then freshness, and excludes the current item +
// sold rows server-side. The seller embed is re-fetched in a follow-up so the
// row shape matches the rest of the app (ListingCard etc. expect `seller`).
export async function fetchSellerOtherListings(
  sellerId: string,
  excludeId: string | null,
  limit = 6,
): Promise<Listing[]> {
  let rows: Listing[] = [];
  // The seller is known up front, so fetch their profile alongside the RPC
  // instead of after it: one round trip (~300 ms from Pakistan) shorter.
  const sellerPromise = supabase.from('profiles').select('*').eq('id', sellerId).maybeSingle();
  const { data, error } = await supabase.rpc('find_seller_other_listings', {
    p_seller_id: sellerId,
    p_exclude_id: excludeId,
    p_limit: limit,
  });
  if (error) {
    // Surfaces e.g. PostgREST schema-cache lag or transient 5xx. We fall
    // through to a direct table read so the "more from this seller" grid
    // still renders even when the RPC is briefly unreachable.
    console.warn('[listings] fetchSellerOtherListings rpc', error.message);
  } else {
    rows = (data ?? []) as Listing[];
  }
  // Fallback: if the RPC errored OR returned nothing, query the table
  // directly with the same filters/ordering. This makes the seller items
  // section resilient to schema cache invalidation, brief network blips,
  // and any client/RPC version mismatch.
  if (rows.length === 0) {
    let q = supabase
      .from('listings')
      .select('*')
      .eq('seller_id', sellerId)
      .eq('is_sold', false)
      .order('likes', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(limit);
    if (excludeId) q = q.neq('id', excludeId);
    const { data: fallbackData, error: fallbackErr } = await q;
    if (fallbackErr) {
      console.warn('[listings] fetchSellerOtherListings fallback', fallbackErr.message);
      return [];
    }
    rows = (fallbackData ?? []) as Listing[];
  }
  if (rows.length === 0) return [];
  // Hydrate the seller profile (the RPC returns bare rows); already in flight.
  const { data: sellerData, error: sellerErr } = await sellerPromise;
  if (sellerErr) {
    console.warn('[listings] fetchSellerOtherListings hydrate', sellerErr.message);
  }
  const seller = (sellerData as Listing['seller'] | null) ?? null;
  return rows.map((r) => ({ ...r, seller: seller ?? (r as Listing).seller })) as Listing[];
}

// Ranked "you might also like" — calls find_similar_listings which combines
// brand/gender/size/condition exact matches, price proximity, title trigram
// similarity, likes, and freshness into a single weighted score. The seller
// embed is hydrated per row so the existing card components render normally.
//
// `category` is optional: the product page already has the listing loaded, so
// passing it lets the fallback skip looking it up (one round trip shorter).
export async function fetchSimilarListings(
  listingId: string,
  limit = 6,
  category?: string | null,
): Promise<Listing[]> {
  let rows: Listing[] = [];
  const { data, error } = await supabase.rpc('find_similar_listings', {
    p_listing_id: listingId,
    p_limit: limit,
  });
  if (error) {
    console.warn('[listings] fetchSimilarListings rpc', error.message);
  } else {
    rows = (data ?? []) as Listing[];
  }
  // Fallback: if the RPC was unavailable or returned nothing, use the source
  // listing's category to drive a plain table read so the Similar tab still
  // shows something — same-category, not-sold, not-itself, newest first.
  if (rows.length === 0) {
    let fallbackCategory = category ?? null;
    if (!fallbackCategory) {
      const { data: srcRow, error: srcErr } = await supabase
        .from('listings')
        .select('category, seller_id')
        .eq('id', listingId)
        .maybeSingle();
      if (srcErr || !srcRow) {
        if (srcErr) console.warn('[listings] fetchSimilarListings src', srcErr.message);
        return [];
      }
      fallbackCategory = (srcRow as { category: string }).category;
    }
    // Sellers embedded here, so these rows need no separate hydrate below.
    const { data: fallbackData, error: fallbackErr } = await supabase
      .from('listings')
      .select(SELECT_WITH_SELLER)
      .eq('category', fallbackCategory)
      .eq('is_sold', false)
      .neq('id', listingId)
      .order('likes', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(limit);
    if (fallbackErr) {
      console.warn('[listings] fetchSimilarListings fallback', fallbackErr.message);
      return [];
    }
    return (fallbackData ?? []) as unknown as Listing[];
  }
  if (rows.length === 0) return [];
  const sellerIds = Array.from(new Set(rows.map((r) => r.seller_id).filter(Boolean)));
  if (sellerIds.length === 0) return rows;
  const { data: sellers, error: sellerErr } = await supabase
    .from('profiles')
    .select('*')
    .in('id', sellerIds);
  if (sellerErr) {
    console.warn('[listings] fetchSimilarListings hydrate', sellerErr.message);
    return rows;
  }
  const byId = new Map<string, Listing['seller']>(
    ((sellers ?? []) as Listing['seller'][]).map((s) => [s.id, s]),
  );
  return rows.map((r) => ({ ...r, seller: byId.get(r.seller_id) ?? (r as Listing).seller })) as Listing[];
}

export async function fetchLikedListings(userId: string): Promise<Listing[]> {
  const { data, error } = await supabase
    .from('listing_likes')
    .select(`listing:listings(${SELECT_WITH_SELLER})`)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('[listings] fetchLikedListings', error.message);
    return [];
  }
  const rows = (data ?? []) as unknown as { listing: Listing | Listing[] | null }[];
  return rows
    .map((row) => (Array.isArray(row.listing) ? row.listing[0] : row.listing))
    .filter((l): l is Listing => l != null);
}

// Answered from the batched engagement cache: one query per user per 30s
// instead of one query per card mount (the heart icons on a 60-card grid
// used to cost 60 round-trips).
export async function isLiked(listingId: string, userId: string): Promise<boolean> {
  const ids = await getLikedIds(userId);
  return ids.has(listingId);
}

// Owner action: hard-delete the row. RLS only lets the seller delete their
// own listing. We return a bool so the UI can show a toast instead of
// throwing.
export async function deleteListing(listingId: string): Promise<boolean> {
  const { error } = await supabase.from('listings').delete().eq('id', listingId);
  if (error) {
    console.warn('[listings] deleteListing', error.message);
    return false;
  }
  return true;
}

export type UpdateListingInput = {
  title?: string;
  description?: string | null;
  price?: number;
  category?: Listing['category'];
  subcategory?: string | null;
  color?: string | null;
  gender?: Listing['gender'];
  brand?: string | null;
  size?: string | null;
  condition?: Listing['condition'];
  parcel_size?: string | null;
  authenticity?: Listing['authenticity'];
  taxonomy_version?: number | null;
  images?: string[];
  thumbnails?: string[];
  tags?: string[];
};

// Owner action: update listing fields. RLS only allows the seller to update
// their own listing.
export async function updateListing(
  listingId: string,
  input: UpdateListingInput,
): Promise<{ ok: boolean; error?: string; code?: string; count?: number }> {
  const { data, error } = await supabase
    .from('listings')
    .update(input)
    .eq('id', listingId)
    .select('id');
  if (error) {
    console.warn('[listings] updateListing', error.message);
    return { ok: false, error: error.message, code: error.code };
  }
  const count = data?.length ?? 0;
  if (count === 0) {
    return { ok: false, error: 'Listing not found or update not permitted', count: 0 };
  }
  return { ok: true, count };
}

export async function toggleLike(
  listingId: string,
  userId: string,
  currentlyLiked: boolean,
): Promise<boolean> {
  if (currentlyLiked) {
    const { error } = await supabase
      .from('listing_likes')
      .delete()
      .eq('user_id', userId)
      .eq('listing_id', listingId);
    if (error) {
      if (isNetworkError(error)) {
        await enqueueOfflineAction({
          type: 'like_toggle',
          userId,
          listingId,
          targetLiked: false,
        });
        return false;
      }
      console.warn('[listings] unlike', error.message);
      return currentlyLiked;
    }
    updateLikedCache(userId, listingId, false);
    return false;
  }
  const { error } = await supabase
    .from('listing_likes')
    .insert({ user_id: userId, listing_id: listingId });
  if (error && error.code !== '23505') {
    if (isNetworkError(error)) {
      await enqueueOfflineAction({
        type: 'like_toggle',
        userId,
        listingId,
        targetLiked: true,
      });
      return true;
    }
    console.warn('[listings] like', error.message);
    return currentlyLiked;
  }
  updateLikedCache(userId, listingId, true);
  return true;
}

export async function fetchListingLikers(listingId: string): Promise<ListingLiker[]> {
  if (!listingId) return [];
  try {
    const { data, error } = await supabase
      .from('listing_likes')
      .select('user_id, created_at, profiles:user_id(username, full_name, avatar_url, is_verified)')
      .eq('listing_id', listingId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.warn('[listings] fetchListingLikers error', error.message);
      throw error;
    }

    if (!data) return [];

    return data.map((row: any) => {
      const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      return {
        id: `${row.user_id}-${listingId}`,
        user_id: row.user_id,
        username: p?.username || 'user',
        full_name: p?.full_name || null,
        avatar_url: p?.avatar_url || null,
        is_verified: !!p?.is_verified,
        created_at: row.created_at,
      };
    });
  } catch (err) {
    console.warn('[listings] fetchListingLikers error', err);
    throw err;
  }
}
