// ─────────────────────────────────────────────────────────────────────────────
// PROFILE HEADER (PRESENTATIONAL)
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Visual Identity & Editorial Branding
// Encapsulates the user's avatar hero banner, quick header actions (share, edit,
// settings), verification status, bio text, and external store links.
// ─────────────────────────────────────────────────────────────────────────────

import { memo, useState } from 'react';
import { View, Pressable, Linking } from 'react-native';
import { Text } from '@/lib/rnText';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ShieldCheckIcon } from '@/components/ui/ShieldCheckIcon';
import { tap } from '@/lib/haptics';
import { ProfileBanner } from './ProfileBanner';
import { ProfileQrSheet } from './ProfileQrSheet';
import type { User as Profile } from '@/types';

import { useTheme } from '@/context/ThemeContext';
type ProfileHeaderProps = {
  profile: Profile;
  onShare?: () => void;
};

export const ProfileHeader = memo(function ProfileHeader({
  profile,
  onShare,
}: ProfileHeaderProps) {
  const { theme: colors } = useTheme();
  const [showQrSheet, setShowQrSheet] = useState(false);
  const displayName = profile.full_name || profile.username;
  const initial = (displayName || 'U').trim().charAt(0).toUpperCase();
  const websiteLink = profile.website?.trim() || null;

  return (
    <>
      {/* Avatar Banner with Floating Actions */}
      <ProfileBanner
        avatarUrl={profile.avatar_url}
        initial={initial}
        verified={profile.is_verified}
        label="Your profile photo"
        onPress={() => router.push('/profile/edit')}
        actions={[
          {
            icon: 'share-2',
            family: 'feather',
            label: 'Share profile',
            onPress: () => {
              tap('light');
              setShowQrSheet(true);
            },
          },
          {
            icon: 'edit-2',
            family: 'feather',
            label: 'Edit profile',
            onPress: () => router.push('/profile/edit'),
          },
          {
            icon: 'settings',
            family: 'feather',
            label: 'Settings',
            onPress: () => router.push('/settings'),
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

      {/* Bio & Link Section */}
      <View style={{ alignItems: 'center', marginTop: 14, paddingHorizontal: 24 }}>
        {profile.bio?.trim() ? (
          <Pressable
            onPress={() => router.push('/profile/edit')}
            style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
          >
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
          </Pressable>
        ) : (
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
            <Text style={{ fontSize: 13, color: colors.mute, fontWeight: '400' }}>
              My hobbies are...
            </Text>
          </Pressable>
        )}

        {websiteLink && (
          <Pressable
            onPress={() => {
              const url = websiteLink.startsWith('http')
                ? websiteLink
                : `https://${websiteLink}`;
              Linking.openURL(url).catch(() => {});
            }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              marginTop: 6,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Feather name="link" size={13} color={colors.ink} />
            <Text
              style={{
                fontSize: 13.5,
                fontWeight: '700',
                color: colors.ink,
              }}
              numberOfLines={1}
            >
              {websiteLink}
            </Text>
          </Pressable>
        )}
      </View>

      <ProfileQrSheet
        visible={showQrSheet}
        onClose={() => setShowQrSheet(false)}
        username={profile.username}
        fullName={displayName}
      />
    </>
  );
});
