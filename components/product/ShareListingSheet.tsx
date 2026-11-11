// Share a listing: a portrait card (captured as a PNG for Instagram Stories /
// WhatsApp status via "Image"), plus one-tap link targets for the channels
// thrift buyers actually use. Image sharing is native-only.
// Monochrome targets (no brand-coloured logos) per UI_GUARDRAILS three-hue rule.

import { useRef, useState } from 'react';
import { View, Pressable, Share, Linking, Platform, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Text } from '@/lib/rnText';
import { Image } from 'expo-image';
import * as Clipboard from 'expo-clipboard';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BottomSheetModal } from '@/components/ui/BottomSheetModal';
import { useTheme } from '@/context/ThemeContext';
import { useToast } from '@/lib/toast';
import { BRAND, APP_URL } from '@/lib/brand';
import { formatPrice } from '@/lib/fees';
import { cardImageUrl, IMAGE_TRANSITION } from '@/lib/images';
import { HAIRLINE, tap } from '@/components/product/shared';
import { listingMeta } from '@/lib/listingMeta';
import type { Listing } from '@/types';

type Props = { visible: boolean; onClose: () => void; listing: Listing };

export function ShareListingSheet({ visible, onClose, listing }: Props) {
  const { theme } = useTheme();
  const toast = useToast();
  // The sheet is capped at 88% of the window and doesn't scroll, so on short
  // viewports (phone browsers with their toolbars) shrink the card instead of
  // letting the share targets fall off the bottom. 320 = header + text + targets.
  const { height: windowHeight } = useWindowDimensions();
  const cardWidth = Math.round(Math.max(170, Math.min(280, (windowHeight * 0.88 - 320) / 1.25 + 24)));

  const url = `${APP_URL}/product/${listing.id}`;
  const price = formatPrice(listing.price);
  const meta = listingMeta(listing);
  const text = `Found this on ${BRAND}: ${listing.title} for ${price}${meta ? ` (${meta})` : ''}`;
  const image = cardImageUrl(listing, 0);

  const copy = async () => {
    await Clipboard.setStringAsync(url);
    toast.done('Link copied', 'link');
    onClose();
  };

  const open = (href: string) => {
    onClose();
    Linking.openURL(href).catch(() => copy());
  };

  const more = async () => {
    onClose();
    try {
      if (Platform.OS === 'web') {
        if (typeof navigator !== 'undefined' && navigator.share) {
          await navigator.share({ title: listing.title, text, url });
        } else {
          await copy();
        }
      } else {
        await Share.share({ message: `${text}\n${url}`, url });
      }
    } catch {
      // dismissed
    }
  };

  const cardRef = useRef<View>(null);
  const [capturing, setCapturing] = useState(false);
  const shareImage = async () => {
    if (capturing) return;
    setCapturing(true);
    try {
      // Lazy: these native modules throw at import on builds made before they
      // were added (older dev clients), which would take down the product page.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { captureRef } = require('react-native-view-shot') as typeof import('react-native-view-shot');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Sharing = require('expo-sharing') as typeof import('expo-sharing');
      // 3x the on-screen card -> ~840px wide, sharp enough for Stories.
      const uri = await captureRef(cardRef, { format: 'png', quality: 1, width: 840 });
      // Link goes on the clipboard so it can be pasted as a Stories link sticker.
      await Clipboard.setStringAsync(url);
      await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Share listing' });
      onClose();
    } catch {
      toast.show("Couldn't create the image", { variant: 'default', icon: 'alert-triangle' });
    } finally {
      setCapturing(false);
    }
  };

  const q = encodeURIComponent;
  const targets: { key: string; label: string; icon: React.ReactNode; onPress: () => void }[] = [
    ...(Platform.OS === 'web'
      ? []
      : [
          {
            key: 'image',
            label: 'Image',
            icon: capturing ? <ActivityIndicator color={theme.ink} /> : <Feather name="image" size={20} color={theme.ink} />,
            onPress: shareImage,
          },
        ]),
    { key: 'whatsapp', label: 'WhatsApp', icon: <Ionicons name="logo-whatsapp" size={22} color={theme.ink} />, onPress: () => open(`https://wa.me/?text=${q(`${text}\n${url}`)}`) },
    { key: 'facebook', label: 'Facebook', icon: <Ionicons name="logo-facebook" size={22} color={theme.ink} />, onPress: () => open(`https://www.facebook.com/sharer/sharer.php?u=${q(url)}`) },
    { key: 'x', label: 'X', icon: <Ionicons name="logo-x" size={20} color={theme.ink} />, onPress: () => open(`https://x.com/intent/post?text=${q(text)}&url=${q(url)}`) },
    { key: 'copy', label: 'Copy link', icon: <Feather name="link" size={20} color={theme.ink} />, onPress: copy },
    { key: 'more', label: 'More', icon: <Feather name="more-horizontal" size={22} color={theme.ink} />, onPress: more },
  ];

  return (
    <BottomSheetModal visible={visible} onClose={onClose} title="Share listing" autoHeight>
      <View style={{ paddingBottom: 16 }}>
        {/* Preview card, also the captured image. collapsable={false} keeps the
            native view so captureRef can find it on Android. */}
        <View
          ref={cardRef}
          collapsable={false}
          style={{
            alignSelf: 'center',
            width: cardWidth,
            padding: 12,
            borderRadius: 18,
            borderWidth: HAIRLINE,
            borderColor: theme.border,
            backgroundColor: theme.paper,
          }}
        >
          <View style={{ width: '100%', aspectRatio: 4 / 5, borderRadius: 10, overflow: 'hidden', backgroundColor: theme.surface }}>
            {image ? (
              <Image source={{ uri: image }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={IMAGE_TRANSITION} />
            ) : null}
          </View>
          <Text numberOfLines={2} style={{ fontSize: 15, fontFamily: 'Inter_600SemiBold', color: theme.ink, marginTop: 12 }}>
            {listing.title}
          </Text>
          {meta ? (
            <Text numberOfLines={1} style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: theme.mute, marginTop: 4 }}>
              {meta}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
            <Text numberOfLines={1} style={{ fontSize: 18, fontFamily: 'Inter_700Bold', color: theme.ink, flexShrink: 0 }}>{price}</Text>
            <Text numberOfLines={1} style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: theme.purple, flexShrink: 1, marginLeft: 8 }}>
              {BRAND} · {APP_URL.replace(/^https?:\/\//, '')}
            </Text>
          </View>
        </View>

        {/* Targets */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 }}>
          {targets.map((t) => (
            <Pressable
              key={t.key}
              testID={`share-${t.key}`}
              onPress={() => {
                tap('selection');
                t.onPress();
              }}
              accessibilityRole="button"
              accessibilityLabel={t.key === 'more' ? 'More sharing options' : `Share via ${t.label}`}
              style={({ pressed }) => ({ flex: 1, alignItems: 'center', opacity: pressed ? 0.6 : 1 })}
            >
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.surface,
                }}
              >
                {t.icon}
              </View>
              <Text numberOfLines={1} style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: theme.ink, marginTop: 6 }}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </BottomSheetModal>
  );
}
