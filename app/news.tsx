// Notifications: orders, offers and activity (followers, likes, price drops,
// new listings from sellers you follow) in one feed. Opening the screen marks
// everything seen (clears the bell badge). A row's unread dot goes when the row
// is opened; the rest go when the screen is left. Rows can be archived, which
// moves them to the Archived filter.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, FlatList, RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { Text } from '@/lib/rnText';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { HIT_SLOP_8, CONTENT_MAX_WIDTH } from '@/lib/responsive';
import { safeBack } from '@/lib/nav';
import { useAuth } from '@/lib/auth';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/lib/toast';
import { tap } from '@/lib/haptics';
import { type as typography } from '@/lib/theme';
import { getOptimizedImageUrl } from '@/lib/images';
import { timeAgo } from '@/components/product/shared';
import { EmptyState } from '@/components/ui';
import { NewsSkeletonList } from '@/components/news/NewsRowSkeleton';
import {
  isUnread,
  notificationKeys,
  useArchiveNotifications,
  useArchivedNotificationIds,
  useMarkNotificationsSeen,
  useNotificationsQuery,
  useSeenAtQuery,
  useSetNotificationArchived,
  type AppNotification,
  type NotificationCategory,
} from '@/lib/notificationsFeed';

type Filter = 'all' | NotificationCategory | 'archived';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'orders', label: 'Orders' },
  { key: 'offers', label: 'Offers' },
  { key: 'activity', label: 'Activity' },
  { key: 'archived', label: 'Archived' },
];

const KIND_ICON: Record<string, keyof typeof Feather.glyphMap> = {
  order_placed: 'shopping-bag',
  order_ready: 'package',
  order_in_transit: 'truck',
  order_delivered: 'home',
  order_completed: 'check-circle',
  order_cancelled: 'x-circle',
  offer_received: 'tag',
  offer_accepted: 'check',
  offer_declined: 'x',
  new_follower: 'user-plus',
  listing_liked: 'heart',
  price_drop: 'trending-down',
  listing_created: 'plus-square',
};

const EMPTY_COPY: Record<Filter, { title: string; body: string; icon: keyof typeof Feather.glyphMap }> = {
  all: { title: 'No notifications yet', body: 'Orders, offers, new followers and price drops will show up here.', icon: 'bell' },
  orders: { title: 'No order updates', body: 'When you buy or sell, every step of the order shows up here.', icon: 'shopping-bag' },
  offers: { title: 'No offers', body: 'Offers on your items, and answers to offers you make, show up here.', icon: 'tag' },
  activity: { title: 'No activity', body: 'New followers, likes on your items and price drops on things you like show up here.', icon: 'heart' },
  archived: { title: 'Nothing archived', body: 'Archive a notification to move it out of your feed. You can find it here later.', icon: 'archive' },
};

function NotificationRow({
  n,
  unread,
  archived,
  onRead,
  onToggleArchive,
}: {
  n: AppNotification;
  unread: boolean;
  archived: boolean;
  onRead: (id: string) => void;
  onToggleArchive: (id: string, archived: boolean) => void;
}) {
  const { theme } = useTheme();
  const isSocial = n.category === 'activity' && !!n.actor_username;
  return (
    // Archive is a sibling of the row button, not a child: a button inside a
    // button is invalid on web.
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingRight: 10 }}>
    <Pressable
      testID="notification-row"
      onPress={() => {
        tap('light');
        onRead(n.id);
        router.push(n.route as any);
      }}
      accessibilityRole="button"
      accessibilityLabel={`${n.title}. ${isSocial ? `@${n.actor_username} ` : ''}${n.body}`}
      style={({ pressed }) => ({
        flex: 1,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingLeft: 16,
        paddingRight: 8,
        paddingVertical: 14,
        backgroundColor: pressed ? theme.surface : theme.background,
      })}
    >
      <View style={{ width: 44, height: 44 }}>
        {n.actor_avatar_url && n.category !== 'orders' ? (
          <Image
            source={{ uri: getOptimizedImageUrl(n.actor_avatar_url, { width: 96 }) }}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: theme.surface }}
            contentFit="cover"
          />
        ) : (
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: theme.surface,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Feather
              name={KIND_ICON[n.kind] ?? 'bell'}
              size={18}
              color={n.kind === 'order_cancelled' ? theme.danger : theme.ink}
            />
          </View>
        )}
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: 14.5, fontFamily: typography.family.sansBold, color: theme.ink }}>
          {n.title}
        </Text>
        <Text numberOfLines={2} style={{ fontSize: 13.5, lineHeight: 19, color: theme.ink, marginTop: 2, fontFamily: typography.family.sans }}>
          {isSocial ? <Text style={{ fontFamily: typography.family.sansSemibold }}>@{n.actor_username} </Text> : null}
          {n.body}
        </Text>
        <Text style={{ fontSize: 12, color: theme.mute, marginTop: 4, fontFamily: typography.family.sans }}>
          {timeAgo(n.created_at)}
        </Text>
      </View>

      {n.listing_image ? (
        <Image
          source={{ uri: getOptimizedImageUrl(n.listing_image, { width: 120 }) }}
          style={{ width: 48, height: 48, borderRadius: 8, backgroundColor: theme.surface }}
          contentFit="cover"
        />
      ) : null}
      {unread ? (
        <View
          accessibilityLabel="Unread"
          style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.purple }}
        />
      ) : (
        <View style={{ width: 8 }} />
      )}
    </Pressable>
      <Pressable
        testID="notification-archive"
        onPress={() => {
          tap('light');
          onToggleArchive(n.id, !archived);
        }}
        hitSlop={HIT_SLOP_8}
        accessibilityRole="button"
        accessibilityLabel={archived ? 'Move back to notifications' : 'Archive notification'}
        style={({ pressed }) => ({ width: 28, height: 28, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.5 : 1 })}
      >
        <Feather name={archived ? 'inbox' : 'archive'} size={17} color={theme.mute} />
      </Pressable>
    </View>
  );
}

function SignedOut() {
  return (
    <EmptyState
      icon="bell"
      title="Sign in to see notifications"
      description="Order updates, offers, new followers and price drops on items you like."
      cta={{ label: 'Sign in', icon: 'log-in', onPress: () => router.push('/auth/login' as any) }}
    />
  );
}

export default function NotificationsScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [filter, setFilter] = useState<Filter>('all');

  const feedQ = useNotificationsQuery(userId);
  // Archived rows load only when that filter is opened.
  const archivedFeedQ = useNotificationsQuery(userId, true, filter === 'archived');
  const seenQ = useSeenAtQuery(userId);
  const markSeen = useMarkNotificationsSeen(userId);
  const archivedQ = useArchivedNotificationIds(userId);
  const setArchived = useSetNotificationArchived(userId);
  const qc = useQueryClient();
  const toast = useToast();
  // Captured on open: rows newer than this keep their dot until opened or the screen is left.
  const seenAt = seenQ.data;
  // Rows opened during this visit.
  const [readIds, setReadIds] = useState<ReadonlySet<string>>(() => new Set());
  const onRead = useCallback((id: string) => setReadIds((prev) => new Set(prev).add(id)), []);

  // Opening the screen = seen (clears the bell badge). Leaving it moves the
  // cached seen-at forward, so the next visit starts with no stale dots.
  const markedAt = useRef<string | null>(null);
  const mark = useCallback(async () => {
    const at = await markSeen();
    if (at) markedAt.current = at;
  }, [markSeen]);
  useEffect(() => {
    if (feedQ.isSuccess && seenQ.isSuccess) mark();
  }, [feedQ.isSuccess, seenQ.isSuccess, mark]);
  useEffect(
    () => () => {
      if (userId && markedAt.current) qc.setQueryData(notificationKeys.seenAt(userId), markedAt.current);
    },
    [qc, userId],
  );

  const archivedIds = useMemo(() => new Set(archivedQ.data ?? []), [archivedQ.data]);
  const onToggleArchive = useCallback(
    (id: string, archived: boolean) => {
      setArchived(id, archived).catch(() =>
        toast.show(archived ? "Couldn't archive. Try again." : "Couldn't move it back. Try again."),
      );
    },
    [setArchived, toast],
  );

  const unreadOf = useCallback(
    (n: AppNotification) => !readIds.has(n.id) && isUnread(n, seenAt),
    [readIds, seenAt],
  );

  // Live + archived rows as one list; archivedIds (updated the moment a row is
  // archived or moved back) decides which view each row is in.
  const allRows = useMemo(() => {
    const seen = new Set<string>();
    return [...(feedQ.data ?? []), ...(archivedFeedQ.data ?? [])]
      .filter((n) => (seen.has(n.id) ? false : (seen.add(n.id), true)))
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }, [feedQ.data, archivedFeedQ.data]);

  const items = useMemo(() => {
    const all = allRows;
    if (filter === 'archived') return all.filter((n) => archivedIds.has(n.id));
    const live = all.filter((n) => !archivedIds.has(n.id));
    return filter === 'all' ? live : live.filter((n) => n.category === filter);
  }, [allRows, filter, archivedIds]);

  // Clear all = archive everything in the current filter (still under Archived).
  const archiveMany = useArchiveNotifications(userId);
  const canClear = filter !== 'archived' && items.length > 0;
  const onClearAll = useCallback(() => {
    const n = items.length;
    archiveMany(items.map((i) => i.id)).then(
      () => toast.show(`Moved ${n} to Archived`),
      () => toast.show("Couldn't clear. Try again."),
    );
  }, [items, archiveMany, toast]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, orders: 0, offers: 0, activity: 0, archived: 0 };
    for (const n of feedQ.data ?? []) {
      if (!archivedIds.has(n.id) && unreadOf(n)) {
        c.all += 1;
        c[n.category] += 1;
      }
    }
    return c;
  }, [feedQ.data, archivedIds, unreadOf]);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([feedQ.refetch(), archivedQ.refetch(), filter === 'archived' ? archivedFeedQ.refetch() : null]);
    await mark();
    setRefreshing(false);
  }, [feedQ, archivedQ, archivedFeedQ, filter, mark]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', flex: 1 }}>
        {/* Header */}
        <View style={{ height: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 }}>
          <Pressable
            onPress={() => {
              tap('light');
              safeBack();
            }}
            hitSlop={HIT_SLOP_8}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={({ pressed }) => ({ width: 40, height: 40, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
          >
            <Feather name="chevron-left" size={26} color={theme.ink} />
          </Pressable>
          <Text style={{ flex: 1, textAlign: 'center', fontSize: 17, fontFamily: typography.family.sansBold, color: theme.ink }}>
            Notifications
          </Text>
          <View style={{ width: 40 }} />
          {canClear ? (
            <Pressable
              testID="notifications-clear-all"
              onPress={() => {
                tap('light');
                onClearAll();
              }}
              hitSlop={HIT_SLOP_8}
              accessibilityRole="button"
              accessibilityLabel="Clear all notifications"
              style={({ pressed }) => ({ position: 'absolute', right: 16, height: 40, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
            >
              <Text style={{ fontSize: 13, fontFamily: typography.family.sansMedium, color: theme.mute }}>Clear all</Text>
            </Pressable>
          ) : null}
        </View>

        {user ? (
          <>
            {/* Filters */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ flexGrow: 0 }}
              contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10, gap: 8 }}
            >
              {FILTERS.map((f) => {
                const active = filter === f.key;
                const unread = counts[f.key];
                return (
                  <Pressable
                    key={f.key}
                    testID={`notifications-filter-${f.key}`}
                    onPress={() => {
                      tap('light');
                      setFilter(f.key);
                    }}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    style={({ pressed }) => ({
                      height: 30,
                      borderRadius: 15,
                      paddingHorizontal: 14,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      backgroundColor: active ? theme.ink : theme.panel,
                      borderWidth: active ? 0 : StyleSheet.hairlineWidth,
                      borderColor: theme.border,
                      opacity: pressed ? 0.8 : 1,
                    })}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontFamily: typography.family.sansSemibold,
                        color: active ? theme.background : theme.ink,
                      }}
                    >
                      {f.label}
                    </Text>
                    {unread > 0 ? (
                      <Text
                        style={{
                          fontSize: 12,
                          fontFamily: typography.family.sansBold,
                          color: active ? theme.background : theme.purple,
                        }}
                      >
                        {unread}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>

            {feedQ.isPending ? (
              <NewsSkeletonList count={6} />
            ) : feedQ.isError ? (
              <EmptyState
                icon="wifi-off"
                title="Couldn't load notifications"
                description="Check your connection and try again."
                cta={{ label: 'Try again', icon: 'refresh-cw', onPress: () => feedQ.refetch() }}
              />
            ) : (
              <FlatList
                data={items}
                keyExtractor={(n) => n.id}
                renderItem={({ item }) => (
                  <NotificationRow
                    n={item}
                    unread={unreadOf(item)}
                    archived={archivedIds.has(item.id)}
                    onRead={onRead}
                    onToggleArchive={onToggleArchive}
                  />
                )}
                ItemSeparatorComponent={() => (
                  <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.border, marginLeft: 72 }} />
                )}
                contentContainerStyle={items.length === 0 ? { flexGrow: 1 } : { paddingBottom: insets.bottom + 80 }}
                ListEmptyComponent={
                  <EmptyState icon={EMPTY_COPY[filter].icon} title={EMPTY_COPY[filter].title} description={EMPTY_COPY[filter].body} />
                }
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.purple} />}
              />
            )}
          </>
        ) : (
          <SignedOut />
        )}
      </View>
    </SafeAreaView>
  );
}
