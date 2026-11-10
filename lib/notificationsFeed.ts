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
  feed: (userId: string | null) => ['notifications', userId] as const,
  seenAt: (userId: string | null) => ['notificationsSeenAt', userId] as const,
  unread: (userId: string | null) => ['notificationsUnread', userId] as const,
};

export async function fetchNotifications(): Promise<AppNotification[]> {
  const { data, error } = await supabase.rpc('get_my_notifications', { p_limit: 120 });
  if (error) throw new Error(error.message);
  return (data ?? []) as AppNotification[];
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

export function useNotificationsQuery(userId: string | null) {
  return useQuery({
    queryKey: notificationKeys.feed(userId),
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: fetchNotifications,
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

/** Marks everything up to now as seen and clears the bell badge. */
export function useMarkNotificationsSeen(userId: string | null) {
  const qc = useQueryClient();
  return useCallback(async () => {
    if (!userId) return;
    const { error } = await supabase.rpc('mark_notifications_seen');
    if (error) {
      console.warn('[notifications] mark seen failed', error.message);
      return;
    }
    qc.setQueryData(notificationKeys.unread(userId), 0);
  }, [qc, userId]);
}

export function isUnread(n: Pick<AppNotification, 'created_at'>, seenAt: string | null | undefined): boolean {
  if (!seenAt) return true;
  return new Date(n.created_at).getTime() > new Date(seenAt).getTime();
}
