// Conversation header: back chevron in a circle, identity pill with avatar +
// online dot + name. Matches the rounded, modern chat-header reference.

import { View, Pressable, Platform, StyleSheet } from 'react-native';
import { Text } from '@/lib/rnText';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import { type as typography } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';
import { HIT_SLOP_8 } from '@/lib/responsive';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';

export function ThreadHeader({
  name,
  verified,
  subtitle,
  avatar,
  online,
  onBack,
  onPressIdentity,
  onOverflow,
}: {
  name: string;
  verified?: boolean;
  subtitle?: string | null;
  avatar: string | null;
  online?: boolean;
  onBack: () => void;
  onPressIdentity?: () => void;
  onOverflow: () => void;
}) {
  const { theme } = useTheme();
  const initial = name.trim().charAt(0).toUpperCase() || 'U';

  const btnShadow = styles.shadow;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingTop: 6,
        paddingBottom: 10,
        gap: 10,
      }}
    >
      {/* ── Back button: chevron inside a circular container ──────────── */}
      <Pressable
        onPress={onBack}
        hitSlop={HIT_SLOP_8}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={({ pressed }) => ({
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: theme.panel,
          borderWidth: 1,
          borderColor: theme.hairline,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.55 : 1,
          ...btnShadow,
        })}
      >
        <Feather name="chevron-left" size={22} color={theme.ink} />
      </Pressable>

      {/* ── Identity pill: avatar + online dot + name ─────────────────── */}
      <Pressable
        onPress={onPressIdentity}
        disabled={!onPressIdentity}
        accessibilityRole="button"
        accessibilityLabel={`View ${name}'s profile, ${online ? 'online' : 'offline'}`}
        style={({ pressed }) => ({
          flexShrink: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          backgroundColor: theme.panel,
          borderWidth: 1,
          borderColor: theme.hairline,
          borderRadius: 24,
          paddingVertical: 6,
          paddingLeft: 6,
          paddingRight: 16,
          opacity: pressed ? 0.6 : 1,
          ...btnShadow,
        })}
      >
        {/* Avatar with online dot */}
        <View style={{ position: 'relative' }}>
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: theme.ink,
              overflow: 'hidden',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {avatar ? (
              <Image
                source={{ uri: avatar }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            ) : (
              <Text
                style={{
                  fontFamily: typography.family.sansBold,
                  fontSize: 14,
                  color: theme.panel,
                }}
              >
                {initial}
              </Text>
            )}
          </View>

          {/* Green online dot — only when participant is online */}
          {online && (
            <View
              style={{
                position: 'absolute',
                bottom: -2,
                right: -2,
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: '#00C853',
                borderWidth: 2,
                borderColor: theme.panel,
              }}
            />
          )}
        </View>

        {/* Name & Subtitle */}
        <View style={{ flexShrink: 1, justifyContent: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text
              numberOfLines={1}
              style={{
                flexShrink: 1,
                fontFamily: typography.family.sansBold,
                fontSize: subtitle ? 14.5 : 16,
                letterSpacing: -0.2,
                color: theme.ink,
              }}
            >
              {name}
            </Text>
            {verified && <VerifiedBadge size={15} />}
          </View>
          {subtitle ? (
            <Text
              numberOfLines={1}
              style={{
                fontFamily: typography.family.sans,
                fontSize: 11.5,
                color: theme.mute,
                marginTop: 1,
              }}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      </Pressable>

      {/* Spacer pushes overflow to the right edge */}
      <View style={{ flex: 1 }} />

      {/* ── Overflow menu (three dots) ───────────────────────────────── */}
      <Pressable
        onPress={onOverflow}
        hitSlop={HIT_SLOP_8}
        accessibilityRole="button"
        accessibilityLabel="Conversation options"
        style={({ pressed }) => ({
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: theme.panel,
          borderWidth: 1,
          borderColor: theme.hairline,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.55 : 1,
          ...btnShadow,
        })}
      >
        <Feather name="more-horizontal" size={22} color={theme.ink} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 5,
    elevation: 2,
    ...Platform.select({
      web: {
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',
      } as any,
    }),
  },
});
