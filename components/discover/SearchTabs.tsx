// Discover search hub: the segmented pill row plus the three non-item panels
// (Aesthetics / Brands / Users) it switches between. Speaks the app's own
// editorial language — bold Inter titles, uppercase Inter eyebrows, the
// promo card's tonal purple disc, hairline dividers, purple accents — strict
// purple/white/black throughout. Data is derived upstream in discover.tsx;
// only the Users panel owns state (its follow mask), because that state is
// meaningless to the rest of the screen.

import { useEffect, useMemo, useState } from 'react';
import { View, Pressable, } from 'react-native';
import { Text } from '@/lib/rnText';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { getOptimizedImageUrl, IMAGE_TRANSITION } from '@/lib/images';
import { fetchFollowingMask, toggleFollow } from '@/lib/follows';
import { useToast } from '@/lib/toast';
import { ShieldCheckIcon } from '@/components/ui/ShieldCheckIcon';
import { useTheme } from '@/context/ThemeContext';
import { radii, type } from '@/lib/theme';
import { HIT_SLOP_8 } from '@/lib/responsive';
import type { User } from '@/types';
const DISPLAY_BOLD = type.family.sansBold;

export type DiscoverTab = 'items' | 'aesthetics' | 'brands' | 'users';
// ── Users ───────────────────────────────────────────────────────────────────
export type PersonRow = Pick<
  User,
  'id' | 'username' | 'full_name' | 'avatar_url' | 'followers_count' | 'is_verified'
>;

// People list with inline follow. Owns the viewer→targets follow mask: fetched
// once per result set, then mutated optimistically on toggle (the RPC result
// reconciles it, a failure reverts it).
export function UsersPanel({ users, viewerId }: { users: PersonRow[]; viewerId: string | null }) {
  const toast = useToast();
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Set<string>>(new Set());

  // Keyed on the id SET rather than the `users` array identity — the parent
  // rebuilds that array on every render, and refetching the follow mask each
  // time would be pointless traffic.
  //
  // Deriving `ids` back out of the key (rather than listing `users` in the dep
  // array and suppressing the lint rule) makes the dependency list honest, so no
  // eslint-disable is needed. That matters: React Compiler refuses to optimize
  // any component where a React ESLint rule was disabled, so the suppression
  // that used to sit here cost UsersPanel its memoization.
  const idsKey = users.map((u) => u.id).join(',');
  const ids = useMemo(() => (idsKey ? idsKey.split(',') : []), [idsKey]);

  useEffect(() => {
    let on = true;
    if (!viewerId || ids.length === 0) {
      setFollowing(new Set());
      return;
    }
    fetchFollowingMask(viewerId, ids).then((mask) => {
      if (on) setFollowing(mask);
    });
    return () => {
      on = false;
    };
  }, [viewerId, ids]);

  const toggle = async (id: string) => {
    if (!viewerId) {
      toast.show('Sign in to follow sellers', { variant: 'info', icon: 'log-in' });
      router.push('/auth/login');
      return;
    }
    if (pending.has(id)) return;
    const wasFollowing = following.has(id);
    // Optimistic flip; reconciled from the RPC below.
    setFollowing((prev) => {
      const next = new Set(prev);
      if (wasFollowing) next.delete(id);
      else next.add(id);
      return next;
    });
    setPending((prev) => new Set(prev).add(id));

    // No `finally` — babel-plugin-react-compiler@1.0.0 can't lower one and bails
    // out of the whole component over it (see lib/errors.ts). Equivalent here:
    // neither branch returns or re-throws, so control always reaches the
    // un-pending call below.
    let isFollowing = wasFollowing;
    let failed = false;
    try {
      const state = await toggleFollow(viewerId, id, wasFollowing);
      isFollowing = state.isFollowing;
    } catch {
      failed = true;
    }

    if (failed) {
      toast.show("Couldn't update follow", { variant: 'default', icon: 'alert-triangle' });
    }
    // On success this reconciles to the server's answer; on failure `isFollowing`
    // is still `wasFollowing`, which reverts the optimistic flip above.
    setFollowing((prev) => {
      const next = new Set(prev);
      if (isFollowing) next.add(id);
      else next.delete(id);
      return next;
    });
    setPending((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  return (
    <View style={{ paddingHorizontal: 8 }}>
      {users.map((u) => (
        <UserRow
          key={u.id}
          user={u}
          isSelf={u.id === viewerId}
          isFollowing={following.has(u.id)}
          onToggle={() => toggle(u.id)}
        />
      ))}
    </View>
  );
}

function UserRow({
  user,
  isSelf,
  isFollowing,
  onToggle,
}: {
  user: PersonRow;
  isSelf: boolean;
  isFollowing: boolean;
  onToggle: () => void;
}) {
  const { theme: colors } = useTheme();
  const avatar = user.avatar_url ? getOptimizedImageUrl(user.avatar_url, { width: 120 }) : null;
  const initial = (user.full_name || user.username || 'U').trim().charAt(0).toUpperCase();
  const followers = Number(user.followers_count ?? 0);
  return (
    <Pressable
      onPress={() => router.push(`/user/${user.id}` as any)}
      accessibilityRole="button"
      accessibilityLabel={`View @${user.username}'s profile`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 10,
        borderRadius: radii.md,
        backgroundColor: pressed ? colors.panel : 'transparent',
      })}
    >
      <View
        style={{
          width: 50,
          height: 50,
          borderRadius: 25,
          overflow: 'hidden',
          backgroundColor: colors.purpleSoft,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 12,
        }}
      >
        {avatar ? (
          <Image
            source={{ uri: getOptimizedImageUrl(avatar, { width: 100 }) }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={IMAGE_TRANSITION}
          />
        ) : (
          <Text style={{ fontFamily: DISPLAY_BOLD, fontSize: 18, color: colors.purple }}>{initial}</Text>
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text
            style={{ fontSize: 14.5, fontFamily: type.family.sansBold, color: colors.ink }}
            numberOfLines={1}
          >
            {user.full_name || user.username}
          </Text>
          {user.is_verified && <ShieldCheckIcon size={14} />}
        </View>

        <Text style={{ fontSize: 12.5, color: colors.mute, marginTop: 1 }} numberOfLines={1}>
          @{user.username}
          {followers > 0 ? ` · ${followers} ${followers === 1 ? 'follower' : 'followers'}` : ''}
        </Text>
      </View>
      {!isSelf ? (
        <Pressable
          hitSlop={HIT_SLOP_8}
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityLabel={isFollowing ? `Unfollow @${user.username}` : `Follow @${user.username}`}
          style={({ pressed }) => ({
            paddingHorizontal: 18,
            paddingVertical: 8,
            borderRadius: 10,
            backgroundColor: isFollowing ? colors.panel : colors.purple,
            transform: [{ scale: pressed ? 0.96 : 1 }],
          })}
        >
          <Text
            style={{
              fontSize: 13,
              fontFamily: type.family.sansBold,
              color: isFollowing ? colors.ink : colors.white,
            }}
          >
            {isFollowing ? 'Following' : 'Follow'}
          </Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}
