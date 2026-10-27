import { capture } from '@/lib/analytics';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { Text } from '@/lib/rnText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { safeBack } from '@/lib/nav';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated from 'react-native-reanimated';
import {
  useProfileQuery,
  useUserListingsQuery,
  useFollowStateQuery,
  useToggleFollow,
  useSavedListingsQuery,
  useLikedListingsQuery,
  useSaveListsQuery,
  useListingsInListQuery,
} from '@/lib/queries';
import { getOrCreateConversation } from '@/lib/chat';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { useTheme } from '@/context/ThemeContext';
import { radii } from '@/lib/theme';
import { useGridDimensions, GRID_DRAW_DISTANCE } from '@/lib/responsive';
import { useFadeIn } from '@/lib/motion';
import type { Listing } from '@/types';
import { EmptyState } from '@/components/ui';
import { BottomSheetModal } from '@/components/ui/BottomSheetModal';
import { SafeContainer } from '@/components/ui/SafeContainer';
import { ShieldCheckIcon } from '@/components/ui/ShieldCheckIcon';
import {
  ProfileBanner,
  formatCount,
} from '@/components/profile';
import { ListingCard } from '@/components/ListingCard';
import { ProfileQrSheet } from '@/components/profile/ProfileQrSheet';
import { StatusFilterChips } from '@/components/profile/StatusFilterChips';
import { useUserSafetyActions } from '@/hooks/useUserSafetyActions';
import { usePullRefresh } from '@/hooks/usePullRefresh';

type SellerTab = 'shop' | 'liked' | 'collections';

const EMPTY_LISTINGS: Listing[] = [];
const HORIZONTAL_PAD = 12;
const GRID_GAP = 8;

export default function UserProfileScreen() {
  const { theme: colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = typeof id === 'string' ? id : '';
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const { user: authUser } = useAuth();
  const toast = useToast();
  const [shopFilter, setShopFilter] = useState<'all' | 'available' | 'sold'>('all');
  const [likedFilter, setLikedFilter] = useState<'all' | 'available' | 'sold'>('all');
  const [savedFilter, setSavedFilter] = useState<'all' | 'available' | 'sold'>('all');
  const [activeTab, setActiveTab] = useState<SellerTab>('shop');

  const fade = useFadeIn(0, 320);

  const UUID_RE = useMemo(
    () => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    [],
  );
  const isInputUuid = useMemo(() => UUID_RE.test(userId), [UUID_RE, userId]);

  const { columns, cardWidth: cardW } = useGridDimensions({
    min: 2,
    max: 4,
    thresholds: [560, 900, 1200],
    horizontalPadding: HORIZONTAL_PAD,
    gap: GRID_GAP,
  });

  const listRef = useRef<FlashListRef<Listing[]>>(null);

  const profileQ = useProfileQuery(userId);
  const profile = profileQ.data ?? null;
  // Downstream queries need the real UUID, not a username slug
  const profileId = profile?.id ?? (isInputUuid ? userId : '');
  const listingsQ = useUserListingsQuery(profileId);
  const followQ = useFollowStateQuery(authUser?.id ?? null, profileId);
  const toggleFollowM = useToggleFollow(authUser?.id ?? null, profileId);

  useEffect(() => {
    if (authUser?.id && (authUser.id === userId || (profileId && authUser.id === profileId))) {
      router.replace('/(tabs)/profile' as any);
    }
  }, [authUser?.id, userId, profileId]);

  const listings = listingsQ.data ?? EMPTY_LISTINGS;
  const loading = profileQ.isLoading || (!!profileId && listingsQ.isLoading);
  const followed = followQ.data?.isFollowing ?? false;
  const followersCount = followQ.data?.followersCount ?? profile?.followers_count ?? 0;
  const followingCount = followQ.data?.followingCount ?? profile?.following_count ?? 0;
  const followBusy = toggleFollowM.isPending;

  const handleFollowToggle = () => {
    if (!authUser) {
      toast.show('Sign in to follow', { variant: 'info', icon: 'log-in' });
      router.push('/auth/login' as any);
      return;
    }
    if (!profileId || authUser.id === profileId || followBusy) return;
    toggleFollowM.mutate(
      { currentlyFollowing: followed },
      {
        onSuccess: (next) => {
          if (next.isFollowing) capture('seller_followed', { seller_id: profileId });
        },
        onError: (e: any) =>
          toast.show(e?.message ?? 'Could not update follow', {
            variant: 'default',
            icon: 'alert-triangle',
          }),
      },
    );
  };

  // Sharing someone's profile opens the same QR sheet as your own (share + copy live inside it).
  const handleShare = () => {
    if (profile) setShowQrSheet(true);
  };

  const safety = useUserSafetyActions({
    onBlocked: () => {
      safeBack();
    },
  });

  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);
  const [showQrSheet, setShowQrSheet] = useState(false);
  const handleMore = () => {
    setMoreOptionsOpen(true);
  };

  const isCollectionsPublic = profile?.saved_collection_privacy === 'public';
  const savedQ = useSavedListingsQuery(isCollectionsPublic ? profileId : null);
  const savedListings = savedQ.data ?? EMPTY_LISTINGS;
  const saveListsQ = useSaveListsQuery(isCollectionsPublic ? profileId : null);
  const saveLists = saveListsQ.data ?? [];
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const listItemsQ = useListingsInListQuery(activeListId);
  const listItems = listItemsQ.data ?? EMPTY_LISTINGS;

  const likedQ = useLikedListingsQuery(profileId);
  const likedListings = likedQ.data ?? EMPTY_LISTINGS;

  const visibleSavedListings = useMemo(
    () => (activeListId ? listItems : savedListings),
    [activeListId, listItems, savedListings],
  );

  const [messagingBusy, setMessagingBusy] = useState(false);
  const handleDirectMessage = async () => {
    if (!authUser) {
      toast.show('Sign in to message creators', { variant: 'info', icon: 'log-in' });
      router.push('/auth/login' as any);
      return;
    }
    if (!profileId || authUser.id === profileId || messagingBusy) return;

    setMessagingBusy(true);
    try {
      const conv = await getOrCreateConversation({
        buyerId: authUser.id,
        sellerId: profileId,
      });
      if (conv?.id) {
        router.push(`/conversation/${conv.id}` as any);
      } else {
        toast.show('Could not open conversation', { variant: 'default', icon: 'alert-triangle' });
      }
    } catch (err: any) {
      toast.show(err?.message ?? 'Could not open conversation', { variant: 'default', icon: 'alert-triangle' });
    } finally {
      setMessagingBusy(false);
    }
  };

  const refetchAll = async () => {
    if (!userId) return;
    await Promise.all([
      profileQ.refetch(),
      listingsQ.refetch(),
      likedQ.refetch(),
      ...(isCollectionsPublic ? [savedQ.refetch(), saveListsQ.refetch()] : []),
      ...(authUser?.id ? [followQ.refetch()] : []),
    ]);
  };
  const { refreshing, onRefresh } = usePullRefresh(refetchAll);

  const visibleListings = useMemo(
    () =>
      shopFilter === 'available'
        ? listings.filter((l) => !l.is_sold)
        : shopFilter === 'sold'
          ? listings.filter((l) => l.is_sold)
          : listings,
    [listings, shopFilter],
  );

  const likedAvailableCount = useMemo(() => likedListings.filter((l) => !l.is_sold).length, [likedListings]);
  const likedSoldCount = useMemo(() => likedListings.length - likedAvailableCount, [likedListings, likedAvailableCount]);
  const visibleLikedListings = useMemo(
    () =>
      likedFilter === 'available'
        ? likedListings.filter((l) => !l.is_sold)
        : likedFilter === 'sold'
          ? likedListings.filter((l) => l.is_sold)
          : likedListings,
    [likedListings, likedFilter],
  );

  const savedAvailableCount = useMemo(
    () => visibleSavedListings.filter((l) => !l.is_sold).length,
    [visibleSavedListings],
  );
  const savedSoldCount = useMemo(
    () => visibleSavedListings.length - savedAvailableCount,
    [visibleSavedListings, savedAvailableCount],
  );
  const visibleFilteredSavedListings = useMemo(
    () =>
      savedFilter === 'available'
        ? visibleSavedListings.filter((l) => !l.is_sold)
        : savedFilter === 'sold'
          ? visibleSavedListings.filter((l) => l.is_sold)
          : visibleSavedListings,
    [visibleSavedListings, savedFilter],
  );

  const gridRows = useMemo(() => {
    let list: Listing[] = [];
    if (activeTab === 'shop') list = visibleListings;
    else if (activeTab === 'liked') list = visibleLikedListings;
    else if (activeTab === 'collections') {
      list = isCollectionsPublic ? visibleFilteredSavedListings : [];
    }
    if (list.length === 0) return [] as Listing[][];
    const out: Listing[][] = [];
    for (let i = 0; i < list.length; i += columns) {
      out.push(list.slice(i, i + columns));
    }
    return out;
  }, [activeTab, visibleListings, visibleLikedListings, isCollectionsPublic, visibleFilteredSavedListings, columns]);

  const renderRow = useCallback(
    ({ item }: { item: Listing[] }) => <GridRow row={item} columns={columns} cardW={cardW} />,
    [columns, cardW],
  );

  const rowKey = useCallback((row: Listing[]) => row[0]?.id ?? 'empty', []);

  const availableCount = listings.filter((l) => !l.is_sold).length;
  const soldCount = listings.length - availableCount;

  if (loading) {
    return (
      <SafeContainer
        edges={['top', 'left', 'right']}
        backgroundColor={colors.background}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      >
        <ActivityIndicator color={colors.purple} />
      </SafeContainer>
    );
  }

  if (!profile) {
    return (
      <SafeContainer edges={['top', 'left', 'right']} backgroundColor={colors.background} style={{ flex: 1 }}>
        <View style={{ padding: 14, flexDirection: 'row', alignItems: 'center' }}>
          <Pressable onPress={() => safeBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="chevron-left" size={26} color={colors.ink} />
          </Pressable>
        </View>
        <EmptyState icon="user-x" title="User not found" description="This profile may have been removed." />
      </SafeContainer>
    );
  }

  const displayName = profile.full_name || profile.username;
  const initial = (displayName || 'U').trim().charAt(0).toUpperCase();
  const isSelf = authUser?.id === profile.id;
  const totalLikes = listings.reduce((sum, l) => sum + (l.likes ?? 0), 0);


  return (
    <SafeContainer edges={['top', 'left', 'right']} backgroundColor={colors.background} style={{ flex: 1 }}>
      <FlashList
        ref={listRef}
        data={gridRows}
        renderItem={renderRow}
        keyExtractor={rowKey}
        drawDistance={GRID_DRAW_DISTANCE}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.purple} />}
        contentContainerStyle={{
          paddingBottom: Math.max(insets.bottom, 12) + 60,
        }}
        ListHeaderComponent={
          <>
            <Animated.View style={fade}>
              <ProfileBanner
                avatarUrl={profile.avatar_url}
                initial={initial}
                verified={profile.is_verified}
                label={`${displayName}'s profile photo`}
                onBack={() => safeBack()}
                actions={[
                  {
                    icon: 'more-horizontal',
                    family: 'feather',
                    label: 'More options',
                    onPress: handleMore,
                  },
                ]}
              />

              {/* Name & Handle */}
              <View style={{ alignItems: 'center', marginTop: 10 }}>
                <Text
                  style={{
                    fontSize: 21,
                    fontWeight: '800',
                    color: colors.ink,
                    letterSpacing: -0.3,
                  }}
                >
                  {displayName}
                </Text>

                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    marginTop: 3,
                  }}
                >
                  <Text style={{ fontSize: 13.5, color: colors.mute, fontWeight: '500' }}>
                    @{profile.username}
                  </Text>
                  {profile.is_verified && (
                    <ShieldCheckIcon size={15} />
                  )}
                </View>

              </View>

              {/* Stats Row (TikTok Style: Following, Followers, Likes) */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 20,
                  marginTop: 16,
                  paddingHorizontal: 20,
                }}
              >
                <Pressable
                  onPress={() =>
                    router.push(
                      `/profile/following?user=${profileId}&username=${encodeURIComponent(profile?.username ?? '')}` as any,
                    )
                  }
                  style={({ pressed }) => ({ alignItems: 'center', opacity: pressed ? 0.6 : 1 })}
                >
                  <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink }}>
                    {formatCount(followingCount)}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.mute, marginTop: 1 }}>
                    Following
                  </Text>
                </Pressable>

                <View style={{ width: 1, height: 16, backgroundColor: colors.hairline }} />

                <Pressable
                  onPress={() =>
                    router.push(
                      `/profile/followers?user=${profileId}&username=${encodeURIComponent(profile?.username ?? '')}` as any,
                    )
                  }
                  style={({ pressed }) => ({ alignItems: 'center', opacity: pressed ? 0.6 : 1 })}
                >
                  <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink }}>
                    {formatCount(followersCount)}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.mute, marginTop: 1 }}>
                    Followers
                  </Text>
                </Pressable>

                <View style={{ width: 1, height: 16, backgroundColor: colors.hairline }} />

                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink }}>
                    {formatCount(totalLikes)}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.mute, marginTop: 1 }}>Likes</Text>
                </View>
              </View>

              {/* Action Buttons Row (TikTok Style: Follow/Message/More) */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  marginTop: 15,
                  paddingHorizontal: 20,
                  alignSelf: 'center',
                }}
              >
                {!isSelf ? (
                  <>
                    <Pressable
                      onPress={handleFollowToggle}
                      disabled={followBusy}
                      accessibilityRole="button"
                      accessibilityLabel={followed ? 'Unfollow' : 'Follow'}
                      style={({ pressed }) => ({
                        height: 36,
                        paddingHorizontal: 26,
                        borderRadius: 20,
                        backgroundColor: followed ? colors.surface : colors.purple,
                        borderWidth: followed ? 1 : 0,
                        borderColor: colors.border,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: pressed || followBusy ? 0.75 : 1,
                        transform: [{ scale: pressed ? 0.97 : 1 }],
                      })}
                    >
                      <Text
                        style={{
                          fontSize: 14.5,
                          fontWeight: '600',
                          color: followed ? colors.ink : '#FFFFFF',
                        }}
                      >
                        {followed ? 'Following' : 'Follow'}
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={handleDirectMessage}
                      disabled={messagingBusy}
                      accessibilityRole="button"
                      accessibilityLabel="Message seller"
                      style={({ pressed }) => ({
                        height: 36,
                        paddingHorizontal: 22,
                        borderRadius: 20,
                        backgroundColor: colors.surface,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: pressed || messagingBusy ? 0.75 : 1,
                        transform: [{ scale: pressed ? 0.97 : 1 }],
                      })}
                    >
                      {messagingBusy ? (
                        <ActivityIndicator size="small" color={colors.ink} />
                      ) : (
                        <Text style={{ fontSize: 14.5, fontWeight: '600', color: colors.ink }}>
                          Message
                        </Text>
                      )}
                    </Pressable>

                    <Pressable
                      onPress={handleShare}
                      accessibilityRole="button"
                      accessibilityLabel="Share profile"
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      style={({ pressed }) => ({
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: colors.surface,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: pressed ? 0.75 : 1,
                        transform: [{ scale: pressed ? 0.96 : 1 }],
                      })}
                    >
                      <Feather name="share-2" size={15} color={colors.ink} />
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Pressable
                      onPress={() => router.push('/profile/edit')}
                      accessibilityRole="button"
                      accessibilityLabel="Edit profile"
                      style={({ pressed }) => ({
                        height: 36,
                        paddingHorizontal: 20,
                        borderRadius: 20,
                        backgroundColor: colors.surface,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: pressed ? 0.75 : 1,
                        transform: [{ scale: pressed ? 0.97 : 1 }],
                      })}
                    >
                      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.ink }}>
                        Edit profile
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={handleShare}
                      accessibilityRole="button"
                      accessibilityLabel="Share profile"
                      style={({ pressed }) => ({
                        height: 36,
                        paddingHorizontal: 20,
                        borderRadius: 20,
                        backgroundColor: colors.surface,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: pressed ? 0.75 : 1,
                        transform: [{ scale: pressed ? 0.97 : 1 }],
                      })}
                    >
                      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.ink }}>
                        Share profile
                      </Text>
                    </Pressable>
                  </>
                )}
              </View>

              {/* Bio & Location Section */}
              <View style={{ alignItems: 'center', marginTop: 14, paddingHorizontal: 24 }}>
                {profile.bio?.trim() ? (
                  <Text
                    style={{
                      fontSize: 14,
                      lineHeight: 20,
                      color: colors.ink,
                      textAlign: 'center',
                    }}
                    numberOfLines={3}
                  >
                    {profile.bio}
                  </Text>
                ) : isSelf ? (
                  <Pressable
                    onPress={() => router.push('/profile/edit')}
                    accessibilityRole="button"
                    accessibilityLabel="Add bio"
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: colors.surface,
                      paddingHorizontal: 14,
                      paddingVertical: 7,
                      borderRadius: 9999,
                      gap: 6,
                      opacity: pressed ? 0.75 : 1,
                      transform: [{ scale: pressed ? 0.98 : 1 }],
                    })}
                  >
                    <Feather name="plus" size={13} color={colors.ink} />
                    <Text style={{ fontSize: 13.5, fontWeight: '700', color: colors.ink }}>
                      Add bio
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.mute }}>·</Text>
                    <Ionicons name="heart-outline" size={14} color="#FE2C55" />
                    <Text style={{ fontSize: 13, color: '#73747B', fontWeight: '400' }}>
                      My hobbies are...
                    </Text>
                  </Pressable>
                ) : null}

                {profile.location ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
                    <Ionicons name="location-outline" size={13} color={colors.mute} />
                    <Text style={{ fontSize: 13, color: colors.mute, fontWeight: '500' }}>
                      {profile.location}
                    </Text>
                  </View>
                ) : null}
              </View>
            </Animated.View>

            {/* ── 3-Segment Icon Tab Bar (Icon Only, Matching My Profile) ── */}
            <View
              style={{
                flexDirection: 'row',
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                marginTop: 18,
                backgroundColor: colors.background,
              }}
            >
              {/* Tab 1: Selling / Shop */}
              <Pressable
                onPress={() => setActiveTab('shop')}
                accessibilityRole="tab"
                accessibilityLabel="Shop"
                accessibilityState={{ selected: activeTab === 'shop' }}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  paddingVertical: 12,
                  position: 'relative',
                }}
              >
                <Ionicons
                  name={activeTab === 'shop' ? 'grid' : 'grid-outline'}
                  size={20}
                  color={activeTab === 'shop' ? colors.ink : colors.mute}
                />
                {activeTab === 'shop' && (
                  <View
                    style={{
                      position: 'absolute',
                      bottom: -1,
                      height: 2.5,
                      width: 44,
                      backgroundColor: colors.ink,
                      borderRadius: 2,
                    }}
                  />
                )}
              </Pressable>

              {/* Tab 2: Liked */}
              <Pressable
                onPress={() => setActiveTab('liked')}
                accessibilityRole="tab"
                accessibilityLabel="Liked"
                accessibilityState={{ selected: activeTab === 'liked' }}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  paddingVertical: 12,
                  position: 'relative',
                }}
              >
                <Ionicons
                  name={activeTab === 'liked' ? 'heart' : 'heart-outline'}
                  size={21}
                  color={activeTab === 'liked' ? colors.ink : colors.mute}
                />
                {activeTab === 'liked' && (
                  <View
                    style={{
                      position: 'absolute',
                      bottom: -1,
                      height: 2.5,
                      width: 44,
                      backgroundColor: colors.ink,
                      borderRadius: 2,
                    }}
                  />
                )}
              </Pressable>

              {/* Tab 3: Saved / Collections */}
              <Pressable
                onPress={() => setActiveTab('collections')}
                accessibilityRole="tab"
                accessibilityLabel="Collections"
                accessibilityState={{ selected: activeTab === 'collections' }}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  paddingVertical: 12,
                  position: 'relative',
                }}
              >
                <Ionicons
                  name={activeTab === 'collections' ? 'bookmark' : 'bookmark-outline'}
                  size={20}
                  color={activeTab === 'collections' ? colors.ink : colors.mute}
                />
                {activeTab === 'collections' && (
                  <View
                    style={{
                      position: 'absolute',
                      bottom: -1,
                      height: 2.5,
                      width: 44,
                      backgroundColor: colors.ink,
                      borderRadius: 2,
                    }}
                  />
                )}
              </Pressable>
            </View>

            {/* ── Playlist Strip (Collections Tab when public) ── */}
            {activeTab === 'collections' && isCollectionsPublic && saveLists.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{
                  paddingHorizontal: 12,
                  paddingTop: 10,
                  paddingBottom: 4,
                  gap: 8,
                }}
              >
                <Pressable
                  onPress={() => setActiveListId(null)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: activeListId === null }}
                  style={({ pressed }) => {
                    const active = activeListId === null;
                    return {
                      height: 30,
                      paddingHorizontal: 14,
                      borderRadius: 15,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: active
                        ? isDark ? theme.panel : '#111111'
                        : isDark ? theme.surface : theme.panel,
                      borderWidth: 1,
                      borderColor: active
                        ? isDark ? theme.border : '#111111'
                        : theme.border,
                      opacity: pressed ? 0.7 : 1,
                    };
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '700',
                      color: activeListId === null ? '#FFFFFF' : theme.ink,
                    }}
                  >
                    All ({savedListings.length})
                  </Text>
                </Pressable>

                {saveLists.map((list) => {
                  const isListActive = activeListId === list.id;
                  return (
                    <Pressable
                      key={list.id}
                      onPress={() => setActiveListId(list.id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isListActive }}
                      style={({ pressed }) => ({
                        height: 30,
                        paddingHorizontal: 14,
                        borderRadius: 15,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: isListActive
                          ? isDark ? theme.panel : '#111111'
                          : isDark ? theme.surface : theme.panel,
                        borderWidth: 1,
                        borderColor: isListActive
                          ? isDark ? theme.border : '#111111'
                          : theme.border,
                        opacity: pressed ? 0.7 : 1,
                      })}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '700',
                          color: isListActive ? '#FFFFFF' : theme.ink,
                        }}
                      >
                        {list.name} ({list.item_count ?? 0})
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            {/* Collection + Liked keep All/Available/Sold, even at zero counts */}
            {activeTab === 'shop' ? (
              <StatusFilterChips
                value={shopFilter}
                onChange={setShopFilter}
                total={listings.length}
                available={availableCount}
                sold={soldCount}
              />
            ) : activeTab === 'liked' ? (
              <StatusFilterChips
                value={likedFilter}
                onChange={setLikedFilter}
                total={likedListings.length}
                available={likedAvailableCount}
                sold={likedSoldCount}
              />
            ) : !isCollectionsPublic ? (
              <View style={{ height: 12 }} />
            ) : null}

            {/* Empty States */}
            {activeTab === 'shop' && gridRows.length === 0 && (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <EmptyState
                  icon="shopping-bag"
                  title={
                    shopFilter === 'sold' && listings.length > 0
                      ? 'Nothing sold yet'
                      : shopFilter === 'available' && listings.length > 0
                        ? 'No available items'
                        : 'No items right now'
                  }
                  description={
                    shopFilter === 'sold' && listings.length > 0
                      ? 'Sold items will show up here.'
                      : shopFilter === 'available' && listings.length > 0
                        ? `${displayName} has no available items right now.`
                        : `${displayName} has no active items right now.`
                  }
                />
              </View>
            )}

            {activeTab === 'liked' && gridRows.length === 0 && (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <EmptyState
                  icon="heart"
                  title={
                    likedFilter === 'sold' && likedListings.length > 0
                      ? 'Nothing sold yet'
                      : likedFilter === 'available' && likedListings.length > 0
                        ? 'No available items'
                        : 'No liked items'
                  }
                  description={
                    likedFilter === 'sold' && likedListings.length > 0
                      ? 'Sold items will show up here.'
                      : likedFilter === 'available' && likedListings.length > 0
                        ? 'All liked items have been sold.'
                        : `${displayName} hasn't liked any items yet.`
                  }
                />
              </View>
            )}

            {activeTab === 'collections' && !isCollectionsPublic && (
              <View style={{ paddingVertical: 48, alignItems: 'center', paddingHorizontal: 24 }}>
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 28,
                    backgroundColor: colors.panel,
                    borderWidth: 1,
                    borderColor: colors.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 14,
                  }}
                >
                  <Feather name="lock" size={24} color={colors.ink} />
                </View>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.ink }}>
                  This collection is private
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: colors.mute,
                    marginTop: 4,
                    textAlign: 'center',
                    maxWidth: 280,
                  }}
                >
                  @{profile.username} has set their saved collection to private.
                </Text>
              </View>
            )}

            {activeTab === 'collections' && isCollectionsPublic && gridRows.length === 0 && (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <EmptyState
                  icon="bookmark"
                  title={
                    savedFilter === 'sold'
                      ? 'Nothing sold yet'
                      : savedFilter === 'available' && visibleSavedListings.length > 0
                        ? 'No available items'
                        : 'No saved items yet'
                  }
                  description={
                    savedFilter === 'sold'
                      ? 'Sold items will show up here.'
                      : savedFilter === 'available' && visibleSavedListings.length > 0
                        ? 'All saved items have been sold.'
                        : `${displayName} hasn't added any items to their collection yet.`
                  }
                />
              </View>
            )}
          </>
        }
      />

      <ProfileQrSheet
        visible={showQrSheet}
        onClose={() => setShowQrSheet(false)}
        username={profile.username}
        fullName={displayName}
      />

      <BottomSheetModal
        visible={moreOptionsOpen}
        onClose={() => setMoreOptionsOpen(false)}
        title={`@${profile.username}`}
        subtitle={displayName !== `@${profile.username}` ? displayName : 'Profile options'}
        autoHeight
      >
        <View style={{ paddingBottom: 16, gap: 8 }}>
          {/* Share Profile */}
          <Pressable
            onPress={() => {
              setMoreOptionsOpen(false);
              // Let the options sheet finish closing; stacked modals drop the second one.
              setTimeout(handleShare, 320);
            }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 14,
              paddingHorizontal: 16,
              borderRadius: radii.xl,
              backgroundColor: pressed ? colors.surface : colors.panel,
              borderWidth: 1,
              borderColor: colors.border,
              gap: 14,
            })}
          >
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                backgroundColor: colors.surface,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Feather name="share-2" size={18} color={colors.ink} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink }}>
                Share profile
              </Text>
              <Text style={{ fontSize: 12.5, color: colors.mute }}>
                Copy link or share to other apps
              </Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.mute} />
          </Pressable>

          {!isSelf ? (
            <>
              {/* Follow / Unfollow */}
              <Pressable
                onPress={() => {
                  setMoreOptionsOpen(false);
                  handleFollowToggle();
                }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 14,
                  paddingHorizontal: 16,
                  borderRadius: radii.xl,
                  backgroundColor: pressed ? colors.surface : colors.panel,
                  borderWidth: 1,
                  borderColor: colors.border,
                  gap: 14,
                })}
              >
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    backgroundColor: colors.surface,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Feather name={followed ? 'user-minus' : 'user-plus'} size={18} color={colors.ink} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink }}>
                    {followed ? 'Unfollow' : 'Follow'}
                  </Text>
                  <Text style={{ fontSize: 12.5, color: colors.mute }}>
                    {followed ? 'Stop receiving updates in feed' : 'See new listings in your Following feed'}
                  </Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.mute} />
              </Pressable>

              {/* Message */}
              <Pressable
                onPress={() => {
                  setMoreOptionsOpen(false);
                  handleDirectMessage();
                }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 14,
                  paddingHorizontal: 16,
                  borderRadius: radii.xl,
                  backgroundColor: pressed ? colors.surface : colors.panel,
                  borderWidth: 1,
                  borderColor: colors.border,
                  gap: 14,
                })}
              >
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    backgroundColor: colors.surface,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Feather name="message-circle" size={18} color={colors.ink} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink }}>
                    Send message
                  </Text>
                  <Text style={{ fontSize: 12.5, color: colors.mute }}>
                    Chat directly with this creator
                  </Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.mute} />
              </Pressable>

              {/* Report User */}
              <Pressable
                onPress={() => {
                  setMoreOptionsOpen(false);
                  safety.reportUser(profile.id, profile.username);
                }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 14,
                  paddingHorizontal: 16,
                  borderRadius: radii.xl,
                  backgroundColor: pressed ? colors.surface : colors.panel,
                  borderWidth: 1,
                  borderColor: colors.border,
                  gap: 14,
                })}
              >
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    backgroundColor: 'rgba(239, 68, 68, 0.08)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Feather name="flag" size={18} color="#EF4444" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#EF4444' }}>
                    Report user
                  </Text>
                  <Text style={{ fontSize: 12.5, color: colors.mute }}>
                    Flag policy violations or suspicious behavior
                  </Text>
                </View>
                <Feather name="chevron-right" size={16} color="#EF4444" />
              </Pressable>

              {/* Block User */}
              <Pressable
                onPress={() => {
                  setMoreOptionsOpen(false);
                  safety.blockUser(profile.id, profile.username);
                }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 14,
                  paddingHorizontal: 16,
                  borderRadius: radii.xl,
                  backgroundColor: pressed ? colors.surface : colors.panel,
                  borderWidth: 1,
                  borderColor: colors.border,
                  gap: 14,
                })}
              >
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    backgroundColor: 'rgba(239, 68, 68, 0.08)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Feather name="slash" size={18} color="#EF4444" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#EF4444' }}>
                    Block user
                  </Text>
                  <Text style={{ fontSize: 12.5, color: colors.mute }}>
                    Hide all items and prevent future messages
                  </Text>
                </View>
                <Feather name="chevron-right" size={16} color="#EF4444" />
              </Pressable>
            </>
          ) : (
            <>
              {/* Edit Profile */}
              <Pressable
                onPress={() => {
                  setMoreOptionsOpen(false);
                  router.push('/profile/edit' as any);
                }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 14,
                  paddingHorizontal: 16,
                  borderRadius: radii.xl,
                  backgroundColor: pressed ? colors.surface : colors.panel,
                  borderWidth: 1,
                  borderColor: colors.border,
                  gap: 14,
                })}
              >
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    backgroundColor: colors.surface,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Feather name="edit-2" size={18} color={colors.ink} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink }}>
                    Edit profile
                  </Text>
                  <Text style={{ fontSize: 12.5, color: colors.mute }}>
                    Update your photo, bio, or handle
                  </Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.mute} />
              </Pressable>

              {/* Settings */}
              <Pressable
                onPress={() => {
                  setMoreOptionsOpen(false);
                  router.push('/settings' as any);
                }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 14,
                  paddingHorizontal: 16,
                  borderRadius: radii.xl,
                  backgroundColor: pressed ? colors.surface : colors.panel,
                  borderWidth: 1,
                  borderColor: colors.border,
                  gap: 14,
                })}
              >
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    backgroundColor: colors.surface,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Feather name="settings" size={18} color={colors.ink} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink }}>
                    Settings
                  </Text>
                  <Text style={{ fontSize: 12.5, color: colors.mute }}>
                    Privacy, account, and preferences
                  </Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.mute} />
              </Pressable>
            </>
          )}
        </View>
      </BottomSheetModal>
    </SafeContainer>
  );
}

const GridRow = memo(function GridRow({
  row,
  columns,
  cardW,
}: {
  row: Listing[];
  columns: number;
  cardW: number;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: GRID_GAP,
        paddingHorizontal: HORIZONTAL_PAD,
        marginBottom: GRID_GAP,
      }}
    >
      {row.map((listing) => (
        <View key={listing.id} style={{ width: cardW }}>
          <ListingCard listing={listing} width={cardW} />
        </View>
      ))}
      {row.length < columns &&
        Array.from({ length: columns - row.length }).map((_, i) => (
          <View key={`pad-${i}`} style={{ width: cardW }} />
        ))}
    </View>
  );
});

