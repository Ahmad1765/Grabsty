// One conversation in the inbox.
//
// Three columns, left to right: who you're talking to, what was last said, and
// what it's about. The listing thumbnail carries its own status badge so a
// thread about something already sold reads that way without being opened —
// the single biggest scanning win in a resale inbox.

import { memo } from 'react';
import { View, Pressable } from 'react-native';
import { Text } from '@/lib/rnText';
import { Image } from 'expo-image';
import { getOptimizedImageUrl, cardImageUrl, IMAGE_TRANSITION } from '@/lib/images';
import { radii, type as typography } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';
import { isConversationUnread, otherParticipant, type ConversationRow } from '@/lib/chat';
import { ListingThumb, listingStatus } from './ListingThumb';
import { relativeTime } from './format';
import { ShieldCheckIcon } from '@/components/ui/ShieldCheckIcon';

function InboxRowImpl({
  conv,
  userId,
  onPress,
}: {
  conv: ConversationRow;
  userId: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const other = otherParticipant(conv, userId);
  const avatar = other?.avatar_url ? getOptimizedImageUrl(other.avatar_url, { width: 140 }) : null;
  const thumbUrl = conv.listing ? cardImageUrl(conv.listing, 0) : null;
  const thumb = thumbUrl ? getOptimizedImageUrl(thumbUrl, { width: 160 }) : null;

  const unread = isConversationUnread(conv, userId);
  const fromMe = !!conv.last_sender_id && conv.last_sender_id === userId;
  const displayName = other?.full_name || other?.username || 'Unknown';
  const initial = displayName.trim().charAt(0).toUpperCase();
  const isImage = Boolean(
    conv.last_message && (
      conv.last_message.startsWith('http') &&
      (conv.last_message.includes('listing-images') || conv.last_message.match(/\.(jpg|jpeg|png|webp|gif)/i))
    )
  );
  const previewText = isImage ? '📷 Photo' : conv.last_message;
  const preview = conv.last_message
    ? `${fromMe ? 'You: ' : ''}${previewText}`
    : 'Tap to start the conversation';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Conversation with ${displayName}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 13,
        minHeight: 92,
        backgroundColor: pressed ? theme.panel : 'transparent',
      })}
    >
      <View
        style={{
          width: 54,
          height: 54,
          borderRadius: 27,
          backgroundColor: theme.surface,
          borderWidth: 1,
          borderColor: theme.border,
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
            transition={IMAGE_TRANSITION}
          />
        ) : (
          <Text
            style={{
              fontFamily: typography.family.sansBold,
              fontSize: 19,
              color: theme.purple,
            }}
          >
            {initial}
          </Text>
        )}
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text
            numberOfLines={1}
            style={{
              flexShrink: 1,
              fontFamily: typography.family.sansBold,
              fontSize: 15,
              letterSpacing: -0.2,
              color: theme.ink,
            }}
          >
            {displayName}
          </Text>
          {other?.is_verified && <ShieldCheckIcon size={15} />}
        </View>
        <Text
          numberOfLines={1}
          style={{
            fontFamily: unread ? typography.family.sansSemibold : typography.family.sans,
            fontSize: 13.5,
            lineHeight: 19,
            color: unread ? theme.ink : theme.mute,
            marginTop: 1,
          }}
        >
          {preview}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
          {unread && (
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: theme.primary,
              }}
            />
          )}
          <Text
            style={{
              fontFamily: typography.family.sans,
              fontSize: 11.5,
              color: theme.muteSoft,
            }}
          >
            {relativeTime(conv.updated_at)}
          </Text>
        </View>
      </View>

      {/* No listing_id means this thread isn't about an item at all — that's a
          missing column, not a removed listing, so nothing renders. */}
      {conv.listing_id && (
        <ListingThumb
          uri={thumb}
          width={52}
          height={66}
          status={listingStatus(conv.listing)}
          radius={radii.sm}
        />
      )}
    </Pressable>
  );
}

export const InboxRow = memo(InboxRowImpl);

/** Placeholder rows for the first load. A skeleton that matches the real row's
 *  geometry beats a centred spinner: the list doesn't jump when data lands. */
export function InboxSkeleton({ rows = 6 }: { rows?: number }) {
  const { theme } = useTheme();
  return (
    <View>
      {Array.from({ length: rows }).map((_, i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingHorizontal: 16,
            paddingVertical: 13,
          }}
        >
          <View
            style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: theme.panel }}
          />
          <View style={{ flex: 1, gap: 7 }}>
            <View
              style={{ height: 12, width: '38%', borderRadius: 6, backgroundColor: theme.panel }}
            />
            <View
              style={{ height: 11, width: '72%', borderRadius: 6, backgroundColor: theme.panel }}
            />
            <View
              style={{ height: 9, width: '24%', borderRadius: 5, backgroundColor: theme.panel }}
            />
          </View>
          <View
            style={{ width: 52, height: 66, borderRadius: radii.sm, backgroundColor: theme.panel }}
          />
        </View>
      ))}
    </View>
  );
}
