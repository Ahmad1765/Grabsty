// ─────────────────────────────────────────────────────────────────────────────
// PROFILE STATS BAR (PRESENTATIONAL)
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Social Proof & Metrics Symmetry
// Displays follower, following, and accumulated shop likes formatted cleanly
// with quiet luxury typography.
// ─────────────────────────────────────────────────────────────────────────────

import { memo } from 'react';
import { View, Pressable } from 'react-native';
import { Text } from '@/lib/rnText';
import { router, type Href } from 'expo-router';
import { formatCount } from './format';

import { useTheme } from '@/context/ThemeContext';
type ProfileStatsProps = {
  followingCount: number;
  followersCount: number;
  shopLikes: number;
};

export const ProfileStats = memo(function ProfileStats({
  followingCount,
  followersCount,
  shopLikes,
}: ProfileStatsProps) {
  const { theme: colors } = useTheme();
  return (
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
      {/* Following Link */}
      <Pressable
        onPress={() => router.push('/profile/following' as Href)}
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

      {/* Followers Link */}
      <Pressable
        onPress={() => router.push('/profile/followers' as Href)}
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

      {/* Accumulated Shop Likes */}
      <View style={{ alignItems: 'center' }}>
        <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink }}>
          {formatCount(shopLikes)}
        </Text>
        <Text style={{ fontSize: 12, color: colors.mute, marginTop: 1 }}>Likes</Text>
      </View>
    </View>
  );
});
