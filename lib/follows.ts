import { supabase } from '@/lib/supabase';
import { escapeSearchQuery } from '@/lib/search';

export type FollowState = {
  followersCount: number;
  followingCount: number;
  isFollowing: boolean;
};

type RpcShape = {
  is_following: boolean;
  followers_count: number;
  following_count: number;
};

function fromRpc(raw: RpcShape | null | undefined): FollowState {
  return {
    isFollowing: !!raw?.is_following,
    followersCount: Number(raw?.followers_count ?? 0),
    followingCount: Number(raw?.following_count ?? 0),
  };
}

// Module-level cache for follow states. Mirrors lib/listingCache.ts — same
// rationale: the Supabase web client occasionally wedges and the RPC either
// times out or fires without a valid JWT, in which case the read returns the
// fallback "is_following: false". Without a cache that's indistinguishable
// from a real unfollow, so the product/user screens used to flip back to
// "Follow" on every re-mount. The cache preserves last-known-good state
// across mounts within one app session.
const followCache = new Map<string, FollowState>();

function cacheKey(followerId: string | null | undefined, followeeId: string): string {
  return `${followerId ?? 'anon'}:${followeeId}`;
}

export function getCachedFollowState(
  followerId: string | null | undefined,
  followeeId: string | null | undefined,
): FollowState | null {
  if (!followeeId) return null;
  return followCache.get(cacheKey(followerId, followeeId)) ?? null;
}

function putCachedFollowState(
  followerId: string | null | undefined,
  followeeId: string,
  state: FollowState,
): void {
  followCache.set(cacheKey(followerId, followeeId), state);
}

export function clearFollowCache(): void {
  followCache.clear();
}

// One round trip: get_follow_state returns target's counts + whether the
// current auth.uid() follows them. Replaces the previous two-table fanout
// which paid two latencies for what is conceptually one read.
// Returns null on RPC error so callers can preserve last-known state instead
// of falsely committing "isFollowing: false" (the old fallback was the source
// of the "Follow button reverts on reopen" bug — that shape is indistinguishable
// from a real unfollow).
export async function fetchFollowState(
  followerId: string | null | undefined,
  followeeId: string,
): Promise<FollowState | null> {
  // get_follow_state is granted to `authenticated` only, so a signed-out viewer
  // is guaranteed a "permission denied for function get_follow_state" round
  // trip. The error path already returns null, so short-circuiting is
  // behaviour-identical — it just drops a request that can never succeed.
  if (!followerId) return getCachedFollowState(followerId, followeeId);

  const { data, error } = await supabase.rpc('get_follow_state', {
    p_followee: followeeId,
  });
  if (error) {
    console.warn('[follows] fetchFollowState', error.message);
    return null;
  }
  const raw = Array.isArray(data) ? data[0] : data;
  const state = fromRpc(raw as RpcShape | null);
  putCachedFollowState(followerId, followeeId, state);
  return state;
}

// "People to follow" suggestions. Hand-rolled with the standard query API
// because there's no RPC for this — we order profiles by `followers_count`
// desc and filter out (a) the caller themselves and (b) anyone they already
// follow. Tiny limit; the suggestions strip is supplementary UX.
export async function fetchSuggestedFollows(
  currentUserId: string | null,
  limit = 6,
): Promise<
  Pick<import('@/types').User, 'id' | 'username' | 'full_name' | 'avatar_url' | 'followers_count' | 'is_verified'>[]
> {
  // Build the exclusion list (self + already-followed) so we don't recommend
  // someone they already follow.
  let excluded: string[] = currentUserId ? [currentUserId] : [];
  if (currentUserId) {
    const { data: edges, error: followErr } = await supabase
      .from('user_follows')
      .select('followee_id')
      .eq('follower_id', currentUserId);
    if (!followErr && edges) {
      excluded = excluded.concat(
        edges.map((r) => (r as { followee_id: string }).followee_id),
      );
    }
  }
  let query = supabase
    .from('profiles')
    .select('id, username, full_name, avatar_url, followers_count, is_verified')
    .order('followers_count', { ascending: false, nullsFirst: false })
    // Buffer limit to ensure we hit the target limit after exclusion
    .limit(limit + Math.max(20, excluded.length * 3));
  if (excluded.length > 0) {
    // PostgREST needs the list parenthesised; a bare array serialises to `not.in.a,b` and 400s
    query = query.not('id', 'in', `(${excluded.join(',')})`);
  }
  const { data, error } = await query;
  if (error) {
    console.warn('[follows] fetchSuggestedFollows', error.message);
    return [];
  }
  return ((data ?? []) as any[]).slice(0, limit) as any;
}

// Edge rows joined to the profile on each side. Two queries because PostgREST
// embedded selects on the same FK pair are fiddly; the second roundtrip is
// cheap for the page sizes a follow list realistically renders.
export type FollowListRow = Pick<
  import('@/types').User,
  'id' | 'username' | 'full_name' | 'avatar_url' | 'is_verified' | 'followers_count'
> & {
  listingCount?: number;
};

async function fetchProfilesByIds(ids: string[]): Promise<FollowListRow[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, full_name, avatar_url, is_verified, followers_count')
    .in('id', ids);
  if (error) {
    console.warn('[follows] fetchProfilesByIds', error.message);
    return [];
  }
  // Preserve the input order (which carries the most-recent-first sort from
  // user_follows.created_at).
  const byId = new Map<string, FollowListRow>();
  for (const row of (data ?? []) as any[]) byId.set(row.id, row as FollowListRow);
  return ids.map((id) => byId.get(id)).filter(Boolean) as FollowListRow[];
}

// Rows per page for both follow lists.
//
// These two used to be unpaginated: every edge row for the profile, plus a
// profile join for each. On a seller with 5,000 followers that is 5,000 rows
// over the wire before a single name renders — the list virtualization on those
// screens bounds the *rendering* cost but can do nothing about the query.
//
// Offset paging via .range() rather than a created_at keyset, to match the
// convention lib/listings.ts already uses. The tradeoff is the usual one: a
// follow added while the reader is mid-scroll shifts the window and can repeat
// or skip one row at a page boundary. For a follow list that is acceptable;
// switch to a keyset on (created_at, id) if it ever isn't.
export const FOLLOW_PAGE_SIZE = 30;

/** One page of follow edges, newest first, resolved to profiles. */
async function fetchFollowPage(
  matchColumn: 'follower_id' | 'followee_id',
  selectColumn: 'follower_id' | 'followee_id',
  userId: string,
  page: number,
  pageSize: number,
): Promise<FollowListRow[]> {
  const from = page * pageSize;
  const { data, error } = await supabase
    .from('user_follows')
    .select(`${selectColumn}, created_at`)
    .eq(matchColumn, userId)
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1);
  if (error) {
    console.warn(`[follows] fetchFollowPage(${selectColumn})`, error.message);
    return [];
  }
  return fetchProfilesByIds((data ?? []).map((r: any) => r[selectColumn]));
}

// Profiles that `userId` follows (i.e. their "Following" list).
export async function fetchFollowing(
  userId: string,
  page = 0,
  pageSize = FOLLOW_PAGE_SIZE,
): Promise<FollowListRow[]> {
  return fetchFollowPage('follower_id', 'followee_id', userId, page, pageSize);
}

// Profiles that follow `userId` (i.e. their "Followers" list).
export async function fetchFollowers(
  userId: string,
  page = 0,
  pageSize = FOLLOW_PAGE_SIZE,
): Promise<FollowListRow[]> {
  return fetchFollowPage('followee_id', 'follower_id', userId, page, pageSize);
}

// Free-text search across profiles by username / full name. Powers the
// "People" results on the discover screen. Leading "@" is stripped so both
// "@grabsty" and "grabsty" match; LIKE wildcards are escaped so a user
// typing "%" can't broaden the query.
export async function searchUsers(query: string, limit = 20): Promise<FollowListRow[]> {
  const raw = query.trim().replace(/^@+/, '');
  if (!raw) return [];
  // Reuse lib/search.ts rather than re-implementing the escape inline: this
  // copy had drifted, missing the backslash case, so a "\" typed here broke the
  // wildcard escaping that the other copy handled.
  const safe = escapeSearchQuery(raw);
  if (!safe) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, full_name, avatar_url, is_verified, followers_count, listings:listings!listings_seller_id_fkey(count)')
    .eq('listings.is_sold', false)
    .or(`username.ilike.%${safe}%,full_name.ilike.%${safe}%`)
    .order('followers_count', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) {
    console.warn('[follows] searchUsers', error.message);
    return [];
  }
  return (data ?? []).map((row: any) => ({
    id: row.id,
    username: row.username,
    full_name: row.full_name,
    avatar_url: row.avatar_url,
    is_verified: row.is_verified,
    followers_count: row.followers_count,
    listingCount: Array.isArray(row.listings)
      ? (row.listings[0]?.count ?? 0)
      : (row.listings?.count ?? 0),
  }));
}

// Given a list of target profile ids, return the subset the current viewer
// already follows. Used to render correct "Follow"/"Following" state on each
// row of a follow list.
export async function fetchFollowingMask(
  viewerId: string | null,
  targetIds: string[],
): Promise<Set<string>> {
  if (!viewerId || targetIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from('user_follows')
    .select('followee_id')
    .eq('follower_id', viewerId)
    .in('followee_id', targetIds);
  if (error) {
    console.warn('[follows] fetchFollowingMask', error.message);
    return new Set();
  }
  return new Set((data ?? []).map((r: any) => r.followee_id as string));
}

// Atomic toggle: one server call decides insert-vs-delete based on the row's
// real state and returns the new counts. The previous insert/delete pair had
// two failure surfaces (RLS, web fetch wedge), and a transient abort on the
// write was rolling back the optimistic UI — the "follow flips back" bug.
// SECURITY DEFINER means no RLS round-trip; the RPC itself enforces caller
// identity via auth.uid().
export async function toggleFollow(
  followerId: string,
  followeeId: string,
  _currentlyFollowing: boolean,
): Promise<FollowState> {
  const { data, error } = await supabase.rpc('toggle_follow', {
    p_followee: followeeId,
  });
  if (error) {
    console.warn('[follows] toggleFollow', error.code, error.message);
    throw new Error(error.message);
  }
  const raw = Array.isArray(data) ? data[0] : data;
  const state = fromRpc(raw as RpcShape | null);
  putCachedFollowState(followerId, followeeId, state);
  return state;
}
