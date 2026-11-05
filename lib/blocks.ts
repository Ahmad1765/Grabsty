import type { QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

// Lazy, like AsyncStorage below: lib/chat and lib/follows import this file and
// stay loadable outside React Native.
const report = (e: unknown, fn: string) => {
  import('@/lib/sentry').then((m) => m.captureError(e, { fn })).catch(() => {});
};

// Blocks live in public.user_blocks and are enforced by the database (messages,
// offers, orders, follows, listing visibility). Nothing here is a security check;
// these helpers only decide what the UI shows.

// Where blocks used to live, on the device only. Moved up once, then removed.
const LEGACY_KEY = (userId: string) => `carrinex_blocked_users_${userId}`;
const migrated = new Set<string>();

export type BlockedUser = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

export const BLOCK_REASONS = [
  {
    id: 'harassment',
    label: 'Harassment or offensive behavior',
    hint: 'Hostility, abusive messages, or unwanted contact',
    icon: 'alert-circle' as const,
  },
  {
    id: 'scam',
    label: 'Suspicious activity or scam',
    hint: 'Attempted off-app payment, phishing, or fraud',
    icon: 'shield-off' as const,
  },
  {
    id: 'spam',
    label: 'Spam or unsolicited advertising',
    hint: 'Repeated promotional messages or unsolicited offers',
    icon: 'mail' as const,
  },
  {
    id: 'inappropriate',
    label: 'Inappropriate content',
    hint: 'Violates community guidelines or standards',
    icon: 'slash' as const,
  },
  {
    id: 'no_longer_interested',
    label: 'No longer wish to communicate',
    hint: 'Prefer not to receive contact from this user',
    icon: 'user-x' as const,
  },
  {
    id: 'other',
    label: 'Other reason',
    hint: 'Other issue or concern',
    icon: 'more-horizontal' as const,
  },
];

async function migrateLegacyBlocks(blockerId: string): Promise<void> {
  if (migrated.has(blockerId)) return;
  migrated.add(blockerId);
  try {
    // Lazy: only this one-time move needs it, and lib/chat + lib/follows import this file.
    const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
    const raw = await AsyncStorage.getItem(LEGACY_KEY(blockerId));
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const ids = Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string' && id !== blockerId) : [];
    if (ids.length) {
      const { error } = await supabase
        .from('user_blocks')
        .upsert(
          ids.map((blocked_id) => ({ blocker_id: blockerId, blocked_id })),
          { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true },
        );
      if (error) {
        migrated.delete(blockerId); // keep the local copy and retry next launch
        report(error, 'migrateLegacyBlocks');
        return;
      }
    }
    await AsyncStorage.removeItem(LEGACY_KEY(blockerId));
  } catch (e: unknown) {
    report(e, 'migrateLegacyBlocks');
  }
}

/** People this user has blocked. Throws on failure so a screen can say so. */
export async function listBlockedUsers(blockerId: string): Promise<BlockedUser[]> {
  await migrateLegacyBlocks(blockerId);
  const { data, error } = await supabase
    .from('user_blocks')
    .select('created_at, profile:profiles!user_blocks_blocked_id_fkey(id, username, full_name, avatar_url)')
    .eq('blocker_id', blockerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).flatMap((row: any) => (row.profile ? [row.profile as BlockedUser] : []));
}

export async function getBlockedUserIds(blockerId: string): Promise<string[]> {
  await migrateLegacyBlocks(blockerId);
  const { data, error } = await supabase.from('user_blocks').select('blocked_id').eq('blocker_id', blockerId);
  if (error) {
    console.warn('[blocks] failed to read blocked users', error.message);
    return [];
  }
  return (data ?? []).map((row: { blocked_id: string }) => row.blocked_id);
}

/** Everyone separated from the signed-in user, whichever side did the blocking. */
export async function getBlockPeerIds(): Promise<string[]> {
  const { data, error } = await supabase.rpc('my_block_peers');
  if (error) {
    console.warn('[blocks] failed to read block peers', error.message);
    return [];
  }
  return (data ?? []) as string[];
}

/**
 * After a block changes, nothing cached may still show the old world. Invalidating
 * alone is not enough: inactive queries keep their data, get persisted to disk and
 * come back as fresh on the next launch, so they are dropped instead.
 */
export function refreshAfterBlockChange(queryClient: QueryClient): void {
  queryClient.removeQueries({ predicate: (q) => !q.isActive() });
  queryClient.invalidateQueries();
}

export type BlockRelation = 'none' | 'blocked_by_me' | 'blocked_me';

export async function getBlockRelation(myId: string, otherId: string): Promise<BlockRelation> {
  const [mine, peers] = await Promise.all([getBlockedUserIds(myId), getBlockPeerIds()]);
  if (mine.includes(otherId)) return 'blocked_by_me';
  return peers.includes(otherId) ? 'blocked_me' : 'none';
}

export async function isUserBlocked(blockerId: string, targetUserId: string): Promise<boolean> {
  return (await getBlockedUserIds(blockerId)).includes(targetUserId);
}

export async function blockUser(opts: {
  blockerId: string;
  blockedId: string;
  reason?: string;
}): Promise<boolean> {
  const { blockerId, blockedId, reason } = opts;
  const { error } = await supabase
    .from('user_blocks')
    .upsert(
      { blocker_id: blockerId, blocked_id: blockedId, reason: reason?.slice(0, 200) ?? null },
      { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true },
    );
  if (error) {
    report(error, 'blockUser');
    return false;
  }
  return true;
}

export async function unblockUser(opts: { blockerId: string; blockedId: string }): Promise<boolean> {
  const { error } = await supabase
    .from('user_blocks')
    .delete()
    .eq('blocker_id', opts.blockerId)
    .eq('blocked_id', opts.blockedId);
  if (error) {
    report(error, 'unblockUser');
    return false;
  }
  return true;
}
