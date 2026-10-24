import { useCallback, useMemo } from 'react';
import { View, Pressable, FlatList, ActivityIndicator, Platform, RefreshControl } from 'react-native';
import { Text } from '@/lib/rnText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { safeBack } from '@/lib/nav';
import { getOptimizedImageUrl, IMAGE_TRANSITION } from '@/lib/images';
import { useTheme } from '@/context/ThemeContext';
import { colors } from '@/lib/theme';
import { HIT_SLOP_8 } from '@/lib/responsive';
import { Button, EmptyState } from '@/components/ui';
import { ShieldCheckIcon } from '@/components/ui/ShieldCheckIcon';
import {
  useFollowersQuery,
  useFollowingMaskQuery,
  useProfileQuery,
  useToggleFollowInList,
} from '@/lib/queries';
import { fetchFollowers } from '@/lib/follows';
import { usePullRefresh } from '@/hooks/usePullRefresh';

type Row = Awaited<ReturnType<typeof fetchFollowers>>[number];

// Module-level so the list doesn't see a new keyExtractor identity each render.
const keyById = (r: Row) => r.id;

// Stable empty reference so a pending query doesn't churn the memos below.
const EMPTY_ROWS: Row[] = [];

export default function FollowersScreen() {
  const { theme } = useTheme();
  const { user: authUser, profile: authProfile } = useAuth();
  const params = useLocalSearchParams<{ user?: string; username?: string }>();
  const targetId = (typeof params.user === 'string' && params.user) || authUser?.id || '';
  const isSelf = targetId === authUser?.id;
  const toast = useToast();

  const listQuery = useFollowersQuery(targetId);
  // The list is paged now (FOLLOW_PAGE_SIZE rows at a time) — flatten the pages
  // the way the home feed does.
  const rows = useMemo(
    () => listQuery.data?.pages.flat() ?? EMPTY_ROWS,
    [listQuery.data],
  );

  const { fetchNextPage, hasNextPage, isFetchingNextPage } = listQuery;
  const onEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Sibling query, not a follow-on: the header's username depends on neither
  // the rows nor the mask, so it no longer waits behind them.
  const profileQuery = useProfileQuery(targetId);

  // Scoped so the followers and following lists for the same viewer keep
  // separate cached masks.
  const scope = `followers:${targetId}`;
  const ids = useMemo(() => rows.map((r) => r.id), [rows]);
  const maskQuery = useFollowingMaskQuery(authUser?.id ?? null, scope, ids);
  // The cache holds string[] (see useFollowingMaskQuery); rebuild the Set here
  // so row lookups stay O(1).
  const followingSet = useMemo(() => new Set(maskQuery.data ?? []), [maskQuery.data]);
  // Until the mask loads the follow state is unknown: showing "Follow" on every
  // row would flash the wrong button, so buttons stay hidden.
  const maskReady = !authUser || maskQuery.data !== undefined;
  const isFollowingRow = (id: string) => (maskReady ? followingSet.has(id) : false);
  const hideButton = (id: string) => id === authUser?.id || (!maskReady);

  const toggle = useToggleFollowInList(authUser?.id ?? null, scope);

  // authProfile is only a valid fallback when this is the viewer's own list.
  // Using it unconditionally (as the previous seed did) meant opening another
  // user's followers without a `username` param showed the *viewer's* handle,
  // and the `prev || …` guard then blocked the fetched value from correcting it.
  const headerName =
    (typeof params.username === 'string' && params.username) ||
    profileQuery.data?.username ||
    (isSelf ? authProfile?.username : '') ||
    '';

  // A disabled query sits in `pending` forever, so an absent targetId must not
  // read as "still loading" or the screen would spin with nothing in flight.
  const loading = !!targetId && listQuery.isPending;
  // `isRefetching` is also true while fetchNextPage is in flight, so it has to
  // be excluded — otherwise scrolling to the bottom spins the pull-to-refresh
  // control as well as the list footer.
  const refetchAll = useCallback(
    () => Promise.all([listQuery.refetch(), maskQuery.refetch()]),
    [listQuery, maskQuery],
  );
  const { refreshing, onRefresh } = usePullRefresh(refetchAll);

  const handleToggle = (row: Row) => {
    if (!authUser) {
      toast.show('Sign in to follow', { variant: 'info', icon: 'log-in' });
      // deliberate temporary exception: route not yet declared in expo-router type map
      router.push('/auth/login' as any);
      return;
    }
    if (row.id === authUser.id || toggle.isPending) return;
    toggle.mutate(
      { id: row.id, currentlyFollowing: isFollowingRow(row.id) },
      {
        onError: (e: any) =>
          toast.show(e?.message ?? 'Could not update follow', {
            variant: 'default',
            icon: 'alert-triangle',
          }),
      },
    );
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.background }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 14,
          paddingTop: 6,
          paddingBottom: 10,
        }}
      >
        <Pressable onPress={() => safeBack()} hitSlop={HIT_SLOP_8} style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="chevron-left" size={24} color={theme.text} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: theme.text }} numberOfLines={1}>
            {headerName ? `@${headerName}` : 'Followers'}
          </Text>
          <Text style={{ fontSize: 12, color: theme.mute, marginTop: 1 }}>Followers</Text>
        </View>
        <View style={{ width: 38 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.purple} />
        </View>
      ) : rows.length === 0 ? (
        <EmptyState
          icon="users"
          title={isSelf ? 'No followers yet' : 'No followers'}
          description={
            isSelf
              ? 'Share your profile or post items — people who follow you will appear here.'
              : 'No one follows this profile yet.'
          }
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={keyById}
          contentContainerStyle={{ paddingVertical: 4, paddingBottom: 80 }}
          // The query is paged (FOLLOW_PAGE_SIZE at a time), so what is mounted
          // is bounded by what has been pulled. These still matter on a popular
          // account after several pages: the RN defaults (windowSize 21) keep
          // ~10 screens of rows mounted in each direction off a single fling.
          windowSize={7}
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={50}
          removeClippedSubviews={Platform.OS === 'android'}
          onEndReached={onEndReached}
          // Half a screen of runway: far enough that the next page is usually
          // there before the user reaches the bottom, near enough that idle
          // scrolling doesn't pull pages nobody looks at.
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            isFetchingNextPage ? (
              <View style={{ paddingVertical: 20 }}>
                <ActivityIndicator color={colors.purple} />
              </View>
            ) : null
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.purple} />
          }
          renderItem={({ item }) => (
            <UserRow
              row={item}
              isFollowing={isFollowingRow(item.id)}
              isSelfRow={hideButton(item.id)}
              busy={toggle.isPending && toggle.variables?.id === item.id}
              onToggle={() => handleToggle(item)}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function UserRow({
  row,
  isFollowing,
  isSelfRow,
  busy,
  onToggle,
}: {
  row: Row;
  isFollowing: boolean;
  isSelfRow: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  const { theme } = useTheme();
  const avatar = row.avatar_url ? getOptimizedImageUrl(row.avatar_url, { width: 120 }) : null;
  const initial = (row.full_name || row.username || 'U').trim().charAt(0).toUpperCase();

  return (
    <Pressable
      onPress={() => router.push(`/user/${row.id}` as any)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: pressed ? theme.panel : 'transparent',
      })}
    >
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          overflow: 'hidden',
          backgroundColor: theme.primarySoft,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 12,
        }}
      >
        {avatar ? (
          <Image
            source={{ uri: avatar }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={IMAGE_TRANSITION}
          />
        ) : (
          <Text style={{ fontSize: 18, fontWeight: '900', color: theme.primary }}>{initial}</Text>
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: theme.text }} numberOfLines={1}>
            {row.full_name || row.username}
          </Text>
          {row.is_verified && <ShieldCheckIcon size={14} />}
        </View>

        <Text style={{ fontSize: 12.5, color: theme.mute, marginTop: 1 }} numberOfLines={1}>
          @{row.username}
        </Text>
      </View>
      {!isSelfRow && (
        <View style={{ marginLeft: 10 }}>
          <Button
            label={isFollowing ? 'Following' : 'Follow'}
            icon={isFollowing ? 'check' : 'user-plus'}
            variant={isFollowing ? 'ghost' : 'primary'}
            size="sm"
            loading={busy}
            onPress={onToggle}
          />
        </View>
      )}
    </Pressable>
  );
}
