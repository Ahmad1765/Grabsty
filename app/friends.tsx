import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
  RefreshControl,
  Alert,
  Linking,
} from 'react-native';
import { Text, TextInput } from '@/lib/rnText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SafeContainer } from '@/components/ui/SafeContainer';
import { BRAND } from '@/lib/brand';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/context/ThemeContext';
import { useToast } from '@/lib/toast';
import { tap } from '@/lib/haptics';
import { safeBack } from '@/lib/nav';
import { radii, type as typography, shadow } from '@/lib/theme';
import { CONTENT_MAX_WIDTH, HIT_SLOP_8 } from '@/lib/responsive';
import { PressableScale } from '@/components/PressableScale';
import { ShieldCheckIcon } from '@/components/ui/ShieldCheckIcon';
import { getOptimizedImageUrl, IMAGE_TRANSITION } from '@/lib/images';
import { searchUsers, fetchSuggestedFollows, toggleFollow, type FollowListRow } from '@/lib/follows';
import {
  isContactsSyncSupported,
  syncContacts,
  presentAccessPicker,
  type MatchedFriend,
  type UnmatchedContact,
  type SyncProgress,
} from '@/lib/contacts';
import {
  shareInviteLink,
  shareViaWhatsApp,
  shareViaSMS,
  copyInviteLink,
} from '@/lib/friends';
import { ProfileQrSheet } from '@/components/profile/ProfileQrSheet';
import { useFollowingMaskQuery } from '@/lib/queries/useProfileQueries';
import { useQueryClient } from '@tanstack/react-query';
import { qk } from '@/lib/queries/keys';

export default function FriendsScreen() {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const { user, profile } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FollowListRow[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef<any>(null);

  // Suggestions State
  const [suggestedUsers, setSuggestedUsers] = useState<FollowListRow[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  const [followingMap, setFollowingMap] = useState<Record<string, boolean>>({});

  // Helper to extract follow state directly from rows if present
  const updateFollowingFromRows = useCallback((rows: (FollowListRow | MatchedFriend | any)[]) => {
    const updates: Record<string, boolean> = {};
    for (const row of rows) {
      if (!row?.id) continue;
      if (typeof row.is_following === 'boolean') {
        updates[row.id] = row.is_following;
      } else if (typeof row.isFollowing === 'boolean') {
        updates[row.id] = row.isFollowing;
      }
    }
    if (Object.keys(updates).length > 0) {
      setFollowingMap((prev) => ({ ...prev, ...updates }));
    }
  }, []);

  // Contact Sync State
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [matchedFriends, setMatchedFriends] = useState<MatchedFriend[]>([]);
  const [unmatchedContacts, setUnmatchedContacts] = useState<UnmatchedContact[]>([]);
  const [hasSynced, setHasSynced] = useState(false);
  const [showUnmatched, setShowUnmatched] = useState(false);
  const [accessPrivileges, setAccessPrivileges] = useState<'all' | 'limited' | 'none' | undefined>(undefined);

  // QR Modal State
  const [showQrSheet, setShowQrSheet] = useState(false);

  // Compute all visible profile IDs across sections
  const listedUserIds = useMemo(() => {
    const ids = new Set<string>();
    suggestedUsers.forEach((u) => u?.id && ids.add(u.id));
    searchResults.forEach((u) => u?.id && ids.add(u.id));
    matchedFriends.forEach((u) => u?.id && ids.add(u.id));
    return Array.from(ids);
  }, [suggestedUsers, searchResults, matchedFriends]);

  // Mask query to establish follow status for all listed profiles
  const maskQuery = useFollowingMaskQuery(user?.id ?? null, 'friends', listedUserIds);

  useEffect(() => {
    if (!maskQuery.data) return;
    const maskSet = new Set(maskQuery.data);
    setFollowingMap((prev) => {
      const next = { ...prev };
      for (const id of listedUserIds) {
        next[id] = maskSet.has(id);
      }
      return next;
    });
  }, [maskQuery.data, listedUserIds]);

  // Load initial suggestions
  const loadSuggestions = useCallback(async () => {
    try {
      setLoadingSuggestions(true);
      const res = await fetchSuggestedFollows(user?.id ?? null, 12);
      setSuggestedUsers(res as FollowListRow[]);
      updateFollowingFromRows(res as any[]);
    } catch (e) {
      console.warn('[friends] loadSuggestions error:', e);
    } finally {
      setLoadingSuggestions(false);
    }
  }, [user?.id, updateFollowingFromRows]);

  useEffect(() => {
    loadSuggestions();
  }, [loadSuggestions]);

  // Debounced live user search
  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    const trimmed = text.trim();
    if (!trimmed) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const rows = await searchUsers(trimmed, 20);
        setSearchResults(rows);
        updateFollowingFromRows(rows as any[]);
      } catch (err) {
        console.warn('[friends] searchUsers error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 250);
  };

  // Follow toggle handler
  const handleToggleFollow = async (targetId: string, currentFollowingState = false) => {
    if (!user) {
      toast.show('Sign in to follow friends', { variant: 'info', icon: 'log-in' });
      router.push('/auth/login' as any);
      return;
    }

    tap('light');
    const isNowFollowing = !currentFollowingState;
    setFollowingMap((prev) => ({ ...prev, [targetId]: isNowFollowing }));

    try {
      const res = await toggleFollow(user.id, targetId, currentFollowingState);
      setFollowingMap((prev) => ({ ...prev, [targetId]: res.isFollowing }));
      queryClient.setQueriesData<string[]>(
        { queryKey: qk.followingMaskScope(user.id, 'friends') },
        (old) => {
          const list = old ?? [];
          return res.isFollowing
            ? (list.includes(targetId) ? list : [...list, targetId])
            : list.filter((id) => id !== targetId);
        },
      );
    } catch {
      // Rollback on failure
      setFollowingMap((prev) => ({ ...prev, [targetId]: currentFollowingState }));
      toast.show('Unable to update follow state', { variant: 'default', icon: 'alert-triangle' });
    }
  };

  // Native Address Book Sync
  const handleSyncContacts = async () => {
    if (!user) {
      toast.show('Sign in to sync your contacts', { variant: 'info', icon: 'log-in' });
      router.push('/auth/login' as any);
      return;
    }

    tap('medium');
    setIsSyncing(true);
    setSyncProgress({
      phase: 'reading',
      processedCount: 0,
      totalCount: 0,
      message: 'Accessing address book…',
    });

    try {
      const result = await syncContacts((p) => {
        setSyncProgress(p);
      });

      setMatchedFriends(result.matchedFriends);
      updateFollowingFromRows(result.matchedFriends as any[]);
      setUnmatchedContacts(result.unmatchedContacts);
      if (result.accessPrivileges) {
        setAccessPrivileges(result.accessPrivileges);
      }
      setHasSynced(true);

      if (result.matchedFriends.length > 0) {
        toast.show(`Found ${result.matchedFriends.length} friends on ${BRAND}!`, {
          variant: 'default',
          icon: 'check',
        });
      } else {
        toast.show(`No contacts registered on ${BRAND} yet. Invite them!`, {
          variant: 'default',
          icon: 'users',
        });
      }
    } catch (err: any) {
      if (err?.code === 'PERMISSION_PERMANENTLY_DENIED') {
        if (Platform.OS === 'ios' || Platform.OS === 'android') {
          Alert.alert(
            'Contacts Access Needed',
            `To discover friends from your address book, ${BRAND} needs Contacts access. Please enable Contacts in Settings.`,
            [
              { text: 'Not Now', style: 'cancel' },
              {
                text: 'Open Settings',
                onPress: () => {
                  Linking.openSettings().catch(() => {});
                },
              },
            ],
          );
        } else {
          toast.show(err.message || 'Contacts permission is disabled in Settings', {
            variant: 'default',
            icon: 'alert-triangle',
          });
        }
      } else {
        toast.show(err?.message || 'Failed to sync contacts', {
          variant: 'default',
          icon: 'alert-triangle',
        });
      }
    } finally {
      setIsSyncing(false);
    }
  };

  // Calculated progress percentage for the progress bar
  const progressPercent = useMemo(() => {
    if (!syncProgress || syncProgress.totalCount <= 0) return 0;
    return Math.min(100, Math.round((syncProgress.processedCount / syncProgress.totalCount) * 100));
  }, [syncProgress]);

  return (
    <SafeContainer
      mode="keyboard-avoiding"
      noScroll
      edges={['top']}
      backgroundColor={theme.background}
      style={{ flex: 1 }}
    >
      {/* Top Bar */}
      <View
        style={{
          borderBottomWidth: 1,
          borderBottomColor: theme.hairline,
          backgroundColor: theme.background,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: 12,
            width: '100%',
            maxWidth: CONTENT_MAX_WIDTH,
            alignSelf: 'center',
          }}
        >
          <Pressable
            onPress={() => safeBack()}
            hitSlop={HIT_SLOP_8}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={({ pressed }) => ({
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: theme.panel,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: theme.border,
              opacity: pressed ? 0.7 : 1,
              ...shadow.sm,
            })}
          >
            <Feather name="arrow-left" size={19} color={theme.ink} />
          </Pressable>

          <Text
            style={{
              fontFamily: typography.family.sansBold,
              fontSize: 17,
              fontWeight: '800',
              color: theme.ink,
              letterSpacing: -0.3,
            }}
          >
            Find Friends
          </Text>

          {/* QR Code Action Button */}
          <Pressable
            onPress={() => {
              tap('light');
              setShowQrSheet(true);
            }}
            hitSlop={HIT_SLOP_8}
            accessibilityRole="button"
            accessibilityLabel="Show QR Code"
            style={({ pressed }) => ({
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: theme.panel,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: theme.border,
              opacity: pressed ? 0.7 : 1,
              ...shadow.sm,
            })}
          >
            <Ionicons name="qr-code-outline" size={18} color={theme.ink} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: insets.bottom + 80,
          width: '100%',
          maxWidth: CONTENT_MAX_WIDTH,
          alignSelf: 'center',
        }}
        refreshControl={
          <RefreshControl
            refreshing={loadingSuggestions}
            onRefresh={loadSuggestions}
            tintColor={theme.primary}
          />
        }
      >
        {/* Search Input Bar */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            height: 44,
            borderRadius: radii.pill,
            backgroundColor: theme.panel,
            borderWidth: 1,
            borderColor: theme.border,
            paddingHorizontal: 14,
            marginBottom: 20,
            ...shadow.sm,
          }}
        >
          <Feather name="search" size={17} color={theme.mute} style={{ marginRight: 8 }} />
          <TextInput
            value={searchQuery}
            onChangeText={handleSearchChange}
            // Short on purpose: Android wraps long placeholders even in single-line inputs
            placeholder="Name or @username"
            placeholderTextColor={theme.muteSoft}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={{
              flex: 1,
              fontFamily: typography.family.sans,
              fontSize: 14.5,
              color: theme.ink,
              paddingVertical: 0,
            }}
          />
          {searchQuery.length > 0 && (
            <Pressable
              onPress={() => handleSearchChange('')}
              hitSlop={HIT_SLOP_8}
              style={{ padding: 4 }}
            >
              <Feather name="x" size={16} color={theme.mute} />
            </Pressable>
          )}
        </View>

        {/* ── SEARCH RESULTS (Active Search) ── */}
        {searchQuery.trim().length > 0 ? (
          <View>
            <Text
              style={{
                fontSize: 11,
                fontWeight: '700',
                letterSpacing: 1.0,
                textTransform: 'uppercase',
                color: theme.muteSoft,
                marginBottom: 12,
                paddingHorizontal: 2,
              }}
            >
              {isSearching ? 'Searching…' : `Results (${searchResults.length})`}
            </Text>

            {isSearching ? (
              <View style={{ paddingVertical: 32, alignItems: 'center' }}>
                <ActivityIndicator color={theme.primary} />
              </View>
            ) : searchResults.length === 0 ? (
              <View
                style={{
                  paddingVertical: 36,
                  alignItems: 'center',
                  backgroundColor: theme.panel,
                  borderRadius: radii['2xl'],
                  borderWidth: 1,
                  borderColor: theme.border,
                  paddingHorizontal: 20,
                  ...shadow.sm,
                }}
              >
                <Feather name="user-x" size={32} color={theme.muteSoft} style={{ marginBottom: 10 }} />
                <Text style={{ fontFamily: typography.family.sansBold, fontSize: 15, fontWeight: '700', color: theme.ink }}>
                  No member found
                </Text>
                <Text
                  style={{
                    fontFamily: typography.family.sans,
                    fontSize: 13,
                    color: theme.mute,
                    textAlign: 'center',
                    marginTop: 4,
                    marginBottom: 16,
                  }}
                >
                  We couldn&apos;t find anyone matching &quot;{searchQuery}&quot;. Try inviting them!
                </Text>
                <PressableScale
                  onPress={() => shareInviteLink(profile?.username, profile?.full_name)}
                  style={{
                    height: 38,
                    paddingHorizontal: 16,
                    borderRadius: radii.pill,
                    backgroundColor: theme.ink,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Feather name="send" size={14} color={theme.background} />
                  <Text style={{ fontFamily: typography.family.sansBold, fontSize: 13, fontWeight: '700', color: theme.background }}>
                    Invite to {BRAND}
                  </Text>
                </PressableScale>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                {searchResults.map((item) => (
                  <UserRow
                    key={item.id}
                    user={item}
                    isFollowing={followingMap[item.id] ?? false}
                    onToggleFollow={() => handleToggleFollow(item.id, followingMap[item.id] ?? false)}
                    theme={theme}
                  />
                ))}
              </View>
            )}
          </View>
        ) : (
          /* ── DEFAULT VIEW: Social Hub & Suggestions ── */
          <>
            {/* PLATFORM HERO CARD */}
            {isContactsSyncSupported ? (
              /* ── Native Address Book Hero Card ── */
              <View
                style={{
                  backgroundColor: theme.panel,
                  borderRadius: radii['2xl'],
                  borderWidth: 1,
                  borderColor: theme.border,
                  padding: 18,
                  marginBottom: 24,
                  ...shadow.sm,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      backgroundColor: isDark ? '#2C204D' : '#F2F3FE',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Feather name="users" size={20} color={theme.purple} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: typography.family.sansBold, fontSize: 16, fontWeight: '800', color: theme.ink, letterSpacing: -0.2 }}>
                      Find Phone Contacts
                    </Text>
                    <Text style={{ fontFamily: typography.family.sans, fontSize: 12.5, color: theme.mute, marginTop: 1 }}>
                      Discover people you know already on {BRAND}
                    </Text>
                  </View>
                </View>

                {/* Privacy Badge */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    backgroundColor: isDark ? theme.surface : '#F7F7F8',
                    borderRadius: radii.md,
                    paddingHorizontal: 10,
                    paddingVertical: 7,
                    marginBottom: 14,
                    borderWidth: 1,
                    borderColor: theme.hairline,
                  }}
                >
                  <Feather name="lock" size={13} color={theme.mute} />
                  <Text style={{ fontFamily: typography.family.sans, fontSize: 11.5, color: theme.mute, flex: 1 }}>
                    End-to-end device hashing. Raw numbers are never stored.
                  </Text>
                </View>

                {/* Active Sync Progress State */}
                {isSyncing && syncProgress && (
                  <View style={{ marginBottom: 14 }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 6,
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '600', color: theme.primary }}>
                        {syncProgress.message}
                      </Text>
                      {syncProgress.totalCount > 0 && (
                        <Text style={{ fontSize: 12, fontWeight: '700', color: theme.mute }}>
                          {progressPercent}%
                        </Text>
                      )}
                    </View>
                    <View
                      style={{
                        height: 6,
                        backgroundColor: theme.border,
                        borderRadius: 3,
                        overflow: 'hidden',
                      }}
                    >
                      <View
                        style={{
                          height: '100%',
                          width: `${progressPercent}%`,
                          backgroundColor: theme.primary,
                          borderRadius: 3,
                        }}
                      />
                    </View>
                  </View>
                )}

                {/* Primary Action Button (Single Primary Purple CTA) */}
                <PressableScale
                  disabled={isSyncing}
                  onPress={handleSyncContacts}
                  style={{
                    height: 44,
                    borderRadius: radii.pill,
                    backgroundColor: theme.purple,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    opacity: isSyncing ? 0.7 : 1,
                  }}
                >
                  {isSyncing ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Feather name="refresh-cw" size={15} color="#FFFFFF" />
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>
                        {hasSynced ? 'Re-sync Contacts' : 'Sync Contacts'}
                      </Text>
                    </>
                  )}
                </PressableScale>

                {/* iOS 18 Limited Contacts Picker */}
                {accessPrivileges === 'limited' && (
                  <PressableScale
                    onPress={async () => {
                      tap('light');
                      const selected = await presentAccessPicker();
                      if (selected && selected.length > 0) {
                        handleSyncContacts();
                      }
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      height: 36,
                      borderRadius: radii.pill,
                      backgroundColor: theme.panel,
                      borderWidth: 1,
                      borderColor: theme.border,
                      marginTop: 10,
                    }}
                  >
                    <Feather name="plus-circle" size={14} color={theme.ink} />
                    <Text style={{ fontSize: 12.5, fontWeight: '600', color: theme.ink }}>
                      Select More Contacts (iOS 18)
                    </Text>
                  </PressableScale>
                )}
              </View>
            ) : (
              /* ── Web-Friendly Social Hero Card ── */
              <View
                style={{
                  backgroundColor: theme.panel,
                  borderRadius: radii['2xl'],
                  borderWidth: 1,
                  borderColor: theme.border,
                  padding: 18,
                  marginBottom: 24,
                  ...shadow.sm,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      backgroundColor: isDark ? '#2C204D' : '#F2F3FE',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Feather name="send" size={19} color={theme.purple} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: typography.family.sansBold, fontSize: 16, fontWeight: '800', color: theme.ink, letterSpacing: -0.2 }}>
                      Invite Friends & Share Closet
                    </Text>
                    <Text style={{ fontFamily: typography.family.sans, fontSize: 12.5, color: theme.mute, marginTop: 2 }}>
                      Share your profile link across messaging apps
                    </Text>
                  </View>
                </View>

                {/* Web Action Strip */}
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                  <PressableScale
                    onPress={() => shareInviteLink(profile?.username, profile?.full_name)}
                    style={{
                      flex: 1,
                      height: 42,
                      borderRadius: radii.pill,
                      backgroundColor: theme.purple,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                  >
                    <Feather name="share-2" size={15} color="#FFFFFF" />
                    <Text style={{ fontFamily: typography.family.sansBold, fontSize: 13.5, fontWeight: '700', color: '#FFFFFF' }}>
                      Share Link
                    </Text>
                  </PressableScale>

                  <PressableScale
                    onPress={async () => {
                      tap('light');
                      const ok = await copyInviteLink(profile?.username);
                      if (ok) {
                        toast.show('Profile link copied!', { variant: 'default', icon: 'check' });
                      }
                    }}
                    style={{
                      height: 42,
                      paddingHorizontal: 16,
                      borderRadius: radii.pill,
                      backgroundColor: isDark ? theme.surface : theme.panel,
                      borderWidth: 1,
                      borderColor: theme.border,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      ...shadow.sm,
                    }}
                  >
                    <Feather name="copy" size={14} color={theme.ink} />
                    <Text style={{ fontFamily: typography.family.sansSemibold, fontSize: 13, fontWeight: '600', color: theme.ink }}>
                      Copy
                    </Text>
                  </PressableScale>
                </View>

                {/* Direct Channel Pills */}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <PressableScale
                    onPress={() => shareViaWhatsApp(profile?.username, profile?.full_name)}
                    style={{
                      flex: 1,
                      height: 36,
                      borderRadius: radii.pill,
                      backgroundColor: isDark ? theme.surface : theme.panel,
                      borderWidth: 1,
                      borderColor: theme.border,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      ...shadow.sm,
                    }}
                  >
                    <Ionicons name="logo-whatsapp" size={15} color={theme.ink} />
                    <Text style={{ fontFamily: typography.family.sansSemibold, fontSize: 12, fontWeight: '600', color: theme.ink }}>
                      WhatsApp
                    </Text>
                  </PressableScale>

                  <PressableScale
                    onPress={() => shareViaSMS(profile?.username, profile?.full_name)}
                    style={{
                      flex: 1,
                      height: 36,
                      borderRadius: radii.pill,
                      backgroundColor: isDark ? theme.surface : theme.panel,
                      borderWidth: 1,
                      borderColor: theme.border,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      ...shadow.sm,
                    }}
                  >
                    <Feather name="message-circle" size={14} color={theme.ink} />
                    <Text style={{ fontFamily: typography.family.sansSemibold, fontSize: 12, fontWeight: '600', color: theme.ink }}>
                      Messages
                    </Text>
                  </PressableScale>

                  <PressableScale
                    onPress={() => setShowQrSheet(true)}
                    style={{
                      flex: 1,
                      height: 36,
                      borderRadius: radii.pill,
                      backgroundColor: isDark ? theme.surface : theme.panel,
                      borderWidth: 1,
                      borderColor: theme.border,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      ...shadow.sm,
                    }}
                  >
                    <Ionicons name="qr-code-outline" size={14} color={theme.ink} />
                    <Text style={{ fontFamily: typography.family.sansSemibold, fontSize: 12, fontWeight: '600', color: theme.ink }}>
                      QR Code
                    </Text>
                  </PressableScale>
                </View>

                {/* Mobile App Sync Note */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    marginTop: 14,
                    paddingTop: 12,
                    borderTopWidth: 1,
                    borderTopColor: theme.hairline,
                  }}
                >
                  <Feather name="smartphone" size={13} color={theme.muteSoft} />
                  <Text style={{ fontFamily: typography.family.sans, fontSize: 11.5, color: theme.mute, flex: 1 }}>
                    Automatic contact sync is available in our iOS & Android mobile apps.
                  </Text>
                </View>
              </View>
            )}

            {/* ── MATCHED FRIENDS SECTION (After Native Sync) ── */}
            {hasSynced && matchedFriends.length > 0 && (
              <View style={{ marginBottom: 24 }}>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '700',
                    letterSpacing: 1.0,
                    textTransform: 'uppercase',
                    color: theme.muteSoft,
                    marginBottom: 10,
                    paddingHorizontal: 2,
                  }}
                >
                  Contacts on {BRAND} ({matchedFriends.length})
                </Text>
                <View style={{ gap: 8 }}>
                  {matchedFriends.map((f) => (
                    <UserRow
                      key={f.id}
                      user={f}
                      isFollowing={followingMap[f.id] ?? false}
                      onToggleFollow={() => handleToggleFollow(f.id, followingMap[f.id] ?? false)}
                      theme={theme}
                    />
                  ))}
                </View>
              </View>
            )}

            {/* ── UNMATCHED CONTACTS / SMS INVITATIONS ── */}
            {hasSynced && unmatchedContacts.length > 0 && (
              <View style={{ marginBottom: 24 }}>
                <Pressable
                  onPress={() => setShowUnmatched((v) => !v)}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: 10,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '700',
                      letterSpacing: 1.0,
                      textTransform: 'uppercase',
                      color: theme.muteSoft,
                    }}
                  >
                    Invite from Contacts ({unmatchedContacts.length})
                  </Text>
                  <Feather
                    name={showUnmatched ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={theme.muteSoft}
                  />
                </Pressable>

                {showUnmatched && (
                  <View style={{ gap: 8, marginTop: 6 }}>
                    {unmatchedContacts.slice(0, 30).map((c) => (
                      <View
                        key={c.id}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          backgroundColor: theme.panel,
                          borderRadius: radii.xl,
                          paddingHorizontal: 14,
                          paddingVertical: 10,
                          borderWidth: 1,
                          borderColor: theme.border,
                          ...shadow.sm,
                        }}
                      >
                        <View style={{ flex: 1, marginRight: 12 }}>
                          <Text
                            style={{ fontSize: 14, fontWeight: '700', color: theme.ink }}
                            numberOfLines={1}
                          >
                            {c.name}
                          </Text>
                          <Text style={{ fontSize: 12, color: theme.mute, marginTop: 1 }}>
                            {c.phoneNumber || c.email}
                          </Text>
                        </View>

                        <PressableScale
                          onPress={() =>
                            shareViaSMS(profile?.username, profile?.full_name, c.phoneNumber)
                          }
                          style={{
                            height: 30,
                            paddingHorizontal: 12,
                            borderRadius: radii.pill,
                            backgroundColor: theme.panel,
                            borderWidth: 1,
                            borderColor: theme.border,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text }}>
                            Invite
                          </Text>
                        </PressableScale>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* ── SUGGESTED COMMUNITY CREATORS ── */}
            <View>
              <Text
                style={{
                  fontFamily: typography.family.sansBold,
                  fontSize: 11,
                  fontWeight: '700',
                  letterSpacing: 1.0,
                  textTransform: 'uppercase',
                  color: theme.muteSoft,
                  marginBottom: 12,
                  paddingHorizontal: 2,
                }}
              >
                Suggested For You
              </Text>

              {loadingSuggestions ? (
                <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                  <ActivityIndicator color={theme.primary} />
                </View>
              ) : suggestedUsers.length === 0 ? (
                <View
                  style={{
                    paddingVertical: 28,
                    paddingHorizontal: 20,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.panel,
                    borderRadius: radii['2xl'],
                    borderWidth: 1,
                    borderColor: theme.border,
                    ...shadow.sm,
                  }}
                >
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      backgroundColor: isDark ? theme.surface : '#F7F7F8',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 10,
                    }}
                  >
                    <Feather name="users" size={20} color={theme.muteSoft} />
                  </View>
                  <Text
                    style={{
                      fontFamily: typography.family.sansSemibold,
                      fontSize: 14,
                      fontWeight: '600',
                      color: theme.ink,
                    }}
                  >
                    No suggestions yet
                  </Text>
                  <Text
                    style={{
                      fontFamily: typography.family.sans,
                      fontSize: 12,
                      color: theme.mute,
                      marginTop: 3,
                      textAlign: 'center',
                    }}
                  >
                    Search by name or username above to find your friends
                  </Text>
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  {suggestedUsers.map((item) => (
                    <UserRow
                      key={item.id}
                      user={item}
                      isFollowing={followingMap[item.id] ?? false}
                      onToggleFollow={() => handleToggleFollow(item.id, followingMap[item.id] ?? false)}
                      theme={theme}
                    />
                  ))}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* Profile QR Bottom Sheet */}
      <ProfileQrSheet
        visible={showQrSheet}
        onClose={() => setShowQrSheet(false)}
        username={profile?.username}
        fullName={profile?.full_name}
      />
    </SafeContainer>
  );
}

/**
 * Reusable User Row with quiet luxury styling and unified <ShieldCheckIcon>.
 */
function UserRow({
  user,
  isFollowing,
  onToggleFollow,
  theme,
}: {
  user: FollowListRow | MatchedFriend;
  isFollowing: boolean;
  onToggleFollow: () => void;
  theme: any;
}) {
  const displayName = user.full_name || user.username || 'Member';
  const handle = `@${(user.username || '').replace(/^@+/, '')}`;

  return (
    <Pressable
      onPress={() => router.push(`/user/${user.id}` as any)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.panel,
        borderRadius: radii.xl,
        borderWidth: 1,
        borderColor: theme.border,
        paddingHorizontal: 14,
        paddingVertical: 10,
        opacity: pressed ? 0.85 : 1,
        ...shadow.sm,
      })}
    >
      {/* Avatar */}
      <View style={{ position: 'relative', marginRight: 12 }}>
        {user.avatar_url ? (
          <Image
            source={{ uri: getOptimizedImageUrl(user.avatar_url, { width: 80, quality: 80 }) }}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: theme.panel }}
            transition={IMAGE_TRANSITION}
          />
        ) : (
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: theme.panel,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: theme.border,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: '800', color: theme.text }}>
              {displayName.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
      </View>

      {/* User Info */}
      <View style={{ flex: 1, marginRight: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text
            style={{ fontSize: 14, fontWeight: '700', color: theme.ink }}
            numberOfLines={1}
          >
            {displayName}
          </Text>
          {user.is_verified && <ShieldCheckIcon size={14} />}
        </View>
        <Text style={{ fontSize: 12, color: theme.mute, marginTop: 1 }} numberOfLines={1}>
          {handle}
        </Text>
      </View>

      {/* Follow Toggle Button (Universal 30px Chip Standard) */}
      <PressableScale
        onPress={(e) => {
          e.stopPropagation();
          onToggleFollow();
        }}
        style={{
          height: 30,
          paddingHorizontal: 14,
          borderRadius: radii.pill,
          backgroundColor: isFollowing ? theme.panel : theme.ink,
          borderWidth: isFollowing ? 1 : 0,
          borderColor: isFollowing ? theme.border : undefined,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text
          style={{
            fontSize: 12,
            fontWeight: '700',
            color: isFollowing ? theme.text : theme.background,
          }}
        >
          {isFollowing ? 'Following' : 'Follow'}
        </Text>
      </PressableScale>
    </Pressable>
  );
}
