// Notifications feed (Notifications screen + bell badge).
// Server: get_my_notifications / mark_notifications_seen / unread_notification_count
// (supabase/migrations/20261111020000_notifications_feed.sql).

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export type NotificationCategory = 'orders' | 'offers' | 'activity';

export type AppNotification = {
  id: string;
  category: NotificationCategory;
  kind: string;
  created_at: string;
  title: string;
  body: string;
  route: string;
  actor_id: string | null;
  actor_username: string | null;
  actor_avatar_url: string | null;
  listing_id: string | null;
  listing_image: string | null;
};

export const notificationKeys = {
  feed: (userId: string | null, archived = false) => ['notifications', userId, archived] as const,
  seenAt: (userId: string | null) => ['notificationsSeenAt', userId] as const,
  unread: (userId: string | null) => ['notificationsUnread', userId] as const,
  archived: (userId: string | null) => ['notificationArchives', userId] as const,
};

/**
 * The live feed (archived = false) or the archived rows. The server filters, so
 * archived notifications don't use up the feed's 200 slots.
 */
export async function fetchNotifications(archived = false): Promise<AppNotification[]> {
  const { data, error } = await supabase.rpc('get_my_notifications_v2', { p_limit: 200, p_archived: archived });
  if (!error) return (data ?? []) as AppNotification[];
  // A backend without v2 yet: the unfiltered feed; the screen filters by archived ids.
  if (error.code !== 'PGRST202' && error.code !== '42883') throw new Error(error.message);
  if (archived) return [];
  const old = await supabase.rpc('get_my_notifications', { p_limit: 200 });
  if (old.error) throw new Error(old.error.message);
  return (old.data ?? []) as AppNotification[];
}

/** When the user last opened Notifications (null = never). */
export async function fetchSeenAt(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('user_notification_state')
    .select('seen_at')
    .eq('user_id', userId)
    .maybeSingle();
  return (data as { seen_at?: string } | null)?.seen_at ?? null;
}

export function useNotificationsQuery(userId: string | null, archived = false, enabled = true) {
  return useQuery({
    queryKey: notificationKeys.feed(userId, archived),
    enabled: !!userId && enabled,
    staleTime: 30_000,
    queryFn: () => fetchNotifications(archived),
  });
}

/** The seen-at captured when the screen opened, so unread dots survive marking seen. */
export function useSeenAtQuery(userId: string | null) {
  return useQuery({
    queryKey: notificationKeys.seenAt(userId),
    enabled: !!userId,
    staleTime: Infinity,
    queryFn: () => fetchSeenAt(userId as string),
  });
}

export function useUnreadNotificationsCount(userId: string | null): number {
  const q = useQuery({
    queryKey: notificationKeys.unread(userId),
    enabled: !!userId,
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('unread_notification_count');
      if (error) throw new Error(error.message);
      return Number(data ?? 0);
    },
  });
  return q.data ?? 0;
}

/** Marks everything up to now as seen and clears the bell badge. Resolves to the new seen-at. */
export function useMarkNotificationsSeen(userId: string | null) {
  const qc = useQueryClient();
  return useCallback(async (): Promise<string | null> => {
    if (!userId) return null;
    const { data, error } = await supabase.rpc('mark_notifications_seen');
    if (error) {
      console.warn('[notifications] mark seen failed', error.message);
      return null;
    }
    qc.setQueryData(notificationKeys.unread(userId), 0);
    return (data as string | null) ?? null;
  }, [qc, userId]);
}

/** Ids the user archived (table notification_archives). The feed is filtered on the client. */
export function useArchivedNotificationIds(userId: string | null) {
  return useQuery({
    queryKey: notificationKeys.archived(userId),
    enabled: !!userId,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('notification_archives')
        .select('notification_id')
        .eq('user_id', userId as string);
      if (error) throw new Error(error.message);
      return ((data ?? []) as { notification_id: string }[]).map((r) => r.notification_id);
    },
  });
}

/** Archives many at once ("Clear all"). Optimistic; rolls back and throws on failure. */
export function useArchiveNotifications(userId: string | null) {
  const qc = useQueryClient();
  return useCallback(
    async (ids: string[]) => {
      if (!userId || ids.length === 0) return;
      const key = notificationKeys.archived(userId);
      // A list fetch still in flight would land after this and bring the row back.
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<string[]>(key) ?? [];
      qc.setQueryData(key, [...new Set([...prev, ...ids])]);
      const { error } = await supabase.from('notification_archives').upsert(
        ids.map((id) => ({ user_id: userId, notification_id: id })),
        { onConflict: 'user_id,notification_id', ignoreDuplicates: true },
      );
      if (error) {
        qc.setQueryData(key, prev);
        throw new Error(error.message);
      }
      // The server filters by archive, so let both lists catch up (frees feed slots).
      qc.invalidateQueries({ queryKey: ['notifications', userId] });
    },
    [qc, userId],
  );
}

/** Archives / unarchives one notification. Optimistic; rolls back and throws on failure. */
export function useSetNotificationArchived(userId: string | null) {
  const qc = useQueryClient();
  return useCallback(
    async (id: string, archived: boolean) => {
      if (!userId) return;
      const key = notificationKeys.archived(userId);
      // A list fetch still in flight would land after this and bring the row back.
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<string[]>(key) ?? [];
      const without = prev.filter((x) => x !== id);
      qc.setQueryData(key, archived ? [...without, id] : without);
      const table = supabase.from('notification_archives');
      const { error } = archived
        ? await table.upsert(
            { user_id: userId, notification_id: id },
            { onConflict: 'user_id,notification_id', ignoreDuplicates: true },
          )
        : await table.delete().eq('user_id', userId).eq('notification_id', id);
      if (error) {
        qc.setQueryData(key, prev);
        throw new Error(error.message);
      }
      // The server filters by archive, so let both lists catch up (frees feed slots).
      qc.invalidateQueries({ queryKey: ['notifications', userId] });
    },
    [qc, userId],
  );
}

export function isUnread(n: Pick<AppNotification, 'created_at'>, seenAt: string | null | undefined): boolean {
  if (!seenAt) return true;
  return new Date(n.created_at).getTime() > new Date(seenAt).getTime();
}
