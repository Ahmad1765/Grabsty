// ─────────────────────────────────────────────────────────────────────────────
// PROFILE & SOCIAL GRAPH QUERY HOOKS
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Scoped Key Invalidation for Paginated Lists
//
// When viewing paginated followers or following lists, a simple `toggleFollow`
// could cause UI jitter if the cache key relied strictly on the array of visible IDs.
// As the list paginates, the `ids` array grows. A mutation settling mid-flight
// could target a stale key snapshot.
//
// Solution: We use `followingMaskScope` (a prefix key `['followingMask', viewerId, scope]`)
// so that `useToggleFollowInList` invalidates and patches every cached page of the
// list simultaneously.
// ─────────────────────────────────────────────────────────────────────────────

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fetchUserListings } from '@/lib/listings';
import {
  FOLLOW_PAGE_SIZE,
  fetchFollowers,
  fetchFollowing,
  fetchFollowingMask,
  fetchFollowState,
  getCachedFollowState,
  toggleFollow,
  type FollowState,
} from '@/lib/follows';
import type { User as Profile, Listing } from '@/types';
import { qk } from './keys';

export type FollowRow = Awaited<ReturnType<typeof fetchFollowers>>[number];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Fetch a single user profile by ID or username.
 */
export function useProfileQuery(userId: string) {
  const decoded = userId ? decodeURIComponent(userId).trim() : '';
  const clean = decoded.startsWith('@') ? decoded.slice(1) : decoded;
  const isUuid = UUID_RE.test(clean);

  return useQuery({
    queryKey: qk.profile(clean || userId),
    enabled: !!clean,
    queryFn: async (): Promise<Profile | null> => {
      if (isUuid) {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', clean)
          .maybeSingle();
        if (error) throw new Error(error.message);
        return (data as Profile | null) ?? null;
      }

      // 1. Try exact username first
      const { data: exact, error: exactErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', clean)
        .maybeSingle();
      if (!exactErr && exact) return exact as Profile;

      // 2. Fallback to case-insensitive username match
      const { data: ilike, error: ilikeErr } = await supabase
        .from('profiles')
        .select('*')
        .ilike('username', clean)
        .maybeSingle();
      if (ilikeErr && !exactErr) throw new Error(ilikeErr.message);
      return (ilike as Profile | null) ?? null;
    },
  });
}

/**
 * Fetch all listings posted by a specific seller.
 */
export function useUserListingsQuery(userId: string) {
  return useQuery({
    queryKey: qk.userListings(userId),
    enabled: !!userId,
    queryFn: (): Promise<Listing[]> => fetchUserListings(userId),
  });
}

/**
 * Query the relationship state between the viewer and a target user (isFollowing, followerCounts).
 */
export function useFollowStateQuery(viewerId: string | null, targetId: string) {
  return useQuery({
    queryKey: qk.followState(viewerId, targetId),
    enabled: !!viewerId && !!targetId,
    initialData: () => getCachedFollowState(viewerId, targetId) ?? undefined,
    queryFn: async (): Promise<FollowState> => {
      const state = await fetchFollowState(viewerId, targetId);
      if (!state) throw new Error('follow state unavailable');
      return state;
    },
  });
}

/**
 * Optimistic follow toggle for profile header.
 */
export function useToggleFollow(viewerId: string | null, targetId: string) {
  const qc = useQueryClient();
  const key = qk.followState(viewerId, targetId);
  return useMutation({
    mutationFn: ({ currentlyFollowing }: { currentlyFollowing: boolean }) =>
      toggleFollow(viewerId as string, targetId, currentlyFollowing),
    onMutate: async ({ currentlyFollowing }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<FollowState>(key);
      if (prev) {
        qc.setQueryData<FollowState>(key, {
          ...prev,
          isFollowing: !currentlyFollowing,
          followersCount: Math.max(0, prev.followersCount + (currentlyFollowing ? -1 : 1)),
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSuccess: (next) => {
      qc.setQueryData(key, next);
    },
  });
}

/**
 * Paginated list of a user's followers.
 */
export function useFollowersQuery(userId: string) {
  return useInfiniteQuery({
    queryKey: qk.followers(userId),
    enabled: !!userId,
    initialPageParam: 0,
    queryFn: ({ pageParam }): Promise<FollowRow[]> => fetchFollowers(userId, pageParam),
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < FOLLOW_PAGE_SIZE ? undefined : allPages.length,
  });
}

/**
 * Paginated list of users followed by a user.
 */
export function useFollowingQuery(userId: string) {
  return useInfiniteQuery({
    queryKey: qk.following(userId),
    enabled: !!userId,
    initialPageParam: 0,
    queryFn: ({ pageParam }): Promise<FollowRow[]> => fetchFollowing(userId, pageParam),
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < FOLLOW_PAGE_SIZE ? undefined : allPages.length,
  });
}

/**
 * Returns string[] of user IDs the viewer already follows within a given list.
 */
export function useFollowingMaskQuery(
  viewerId: string | null,
  scope: string,
  ids: string[],
) {
  return useQuery({
    queryKey: qk.followingMask(viewerId, scope, ids),
    enabled: !!viewerId && ids.length > 0,
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<string[]> =>
      Array.from(await fetchFollowingMask(viewerId, ids)),
  });
}

/**
 * Follow/unfollow a row inside a list with scope prefix optimistic updating.
 */
export function useToggleFollowInList(viewerId: string | null, scope: string) {
  const qc = useQueryClient();
  const prefix = qk.followingMaskScope(viewerId, scope);

  const withId = (list: string[] | undefined, id: string, following: boolean) => {
    const without = (list ?? []).filter((x) => x !== id);
    return following ? [...without, id] : without;
  };

  return useMutation({
    mutationFn: ({ id, currentlyFollowing }: { id: string; currentlyFollowing: boolean }) =>
      toggleFollow(viewerId as string, id, currentlyFollowing),
    onMutate: async ({ id, currentlyFollowing }) => {
      await qc.cancelQueries({ queryKey: prefix });
      const prev = qc.getQueriesData<string[]>({ queryKey: prefix });
      qc.setQueriesData<string[]>({ queryKey: prefix }, (old) =>
        withId(old, id, !currentlyFollowing),
      );
      return { prev };
    },
    onError: (_e, _vars, ctx) => {
      for (const [key, data] of ctx?.prev ?? []) qc.setQueryData(key, data);
    },
    onSuccess: (state, { id }) => {
      qc.setQueriesData<string[]>({ queryKey: prefix }, (old) =>
        withId(old, id, state.isFollowing),
      );
      qc.invalidateQueries({ queryKey: qk.followState(viewerId, id) });
    },
  });
}
