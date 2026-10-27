import { useCallback, useMemo, useRef, useState } from 'react';
import { View, Modal, Pressable, useWindowDimensions } from 'react-native';
import { Text } from '@/lib/rnText';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { radii } from '@/lib/theme';
import { CONTENT_MAX_WIDTH, HIT_SLOP_8 } from '@/lib/responsive';
import { Button } from '@/components/ui';
import type { CropRect } from '@/lib/upload';
import { BANNER_ASPECT } from './ProfileBanner';
import { coverScaleFor, computeCropRect } from './bannerCrop';

import { useTheme } from '@/context/ThemeContext';
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;

export type CropSource = {
  uri: string;
  /** Natural pixel size of the picked image, from the picker's metadata. */
  width: number;
  height: number;
};

type Props = {
  visible: boolean;
  source: CropSource | null;
  onCancel: () => void;
  onConfirm: (rect: CropRect) => void;
};


/**
 * Pick which part of a photo the banner shows. Used on EVERY platform.
 *
 * Neither OS crop UI can do this job: expo-image-picker's web build ignores
 * `allowsEditing`/`aspect` outright, and on iOS `aspect` is Android-only, so its
 * editor returns a square crop — the wrong shape for a banner.
 *
 * The frame is locked to BANNER_ASPECT, the same ratio <ProfileBanner> renders
 * at, so what the seller frames here is exactly what appears on the profile.
 */
export function BannerCropper({ visible, source, onCancel, onConfirm }: Props) {
  const { theme: colors } = useTheme();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const [zoom, setZoom] = useState(MIN_ZOOM);

  // Frame geometry — the visible window, locked to the banner's ratio.
  const frame = useMemo(() => {
    const maxW = Math.min(viewportWidth - 32, CONTENT_MAX_WIDTH);
    // Leave room for the header, hint, zoom row and actions on short viewports.
    const maxH = Math.max(140, viewportHeight - 320);
    const width = Math.min(maxW, Math.round(maxH * BANNER_ASPECT));
    return { width, height: Math.round(width / BANNER_ASPECT) };
  }, [viewportWidth, viewportHeight]);

  // Scale that makes the photo exactly cover the frame at zoom 1 — the same
  // thing `contentFit="cover"` does, made explicit so the crop maths can invert it.
  const coverScale = useMemo(
    () => (source ? coverScaleFor(source, frame) : 1),
    [source, frame],
  );

  const displayed = useMemo(
    () => ({
      width: (source?.width ?? 0) * coverScale * zoom,
      height: (source?.height ?? 0) * coverScale * zoom,
    }),
    [source, coverScale, zoom],
  );

  // How far the photo may slide before an edge would enter the frame.
  const bounds = useMemo(
    () => ({
      x: Math.max(0, (displayed.width - frame.width) / 2),
      y: Math.max(0, (displayed.height - frame.height) / 2),
    }),
    [displayed, frame],
  );

  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const dragStart = useRef({ tx: 0, ty: 0, x: 0, y: 0 });

  const clamp = (v: number, limit: number) => Math.max(-limit, Math.min(limit, v));

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }],
  }));

  const applyZoom = useCallback(
    (next: number) => {
      const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next));
      if (!source) return;
      // Re-clamp the offset against the new bounds, or zooming out would leave
      // the photo parked off-centre with a gap at one edge.
      const w = source.width * coverScale * clamped;
      const h = source.height * coverScale * clamped;
      const bx = Math.max(0, (w - frame.width) / 2);
      const by = Math.max(0, (h - frame.height) / 2);
      tx.value = clamp(tx.value, bx);
      ty.value = clamp(ty.value, by);
      setZoom(clamped);
    },
    [source, coverScale, frame.width, frame.height, tx, ty],
  );

  const handleConfirm = useCallback(() => {
    if (!source) return;
    onConfirm(
      computeCropRect({
        source,
        frame,
        coverScale,
        zoom,
        tx: tx.value,
        ty: ty.value,
      }),
    );
  }, [source, coverScale, zoom, frame, tx, ty, onConfirm]);

  const reset = useCallback(() => {
    tx.value = 0;
    ty.value = 0;
    setZoom(MIN_ZOOM);
  }, [tx, ty]);

  return (
    <Modal
      visible={visible && !!source}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View
        style={{
          flex: 1,
          backgroundColor: colors.overlay,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
        }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: CONTENT_MAX_WIDTH,
            backgroundColor: colors.paper,
            borderRadius: radii['2xl'],
            padding: 16,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 14,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink, letterSpacing: -0.2 }}>
              Position your banner
            </Text>
            <Pressable
              onPress={onCancel}
              hitSlop={HIT_SLOP_8}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Feather name="x" size={20} color={colors.ink} />
            </Pressable>
          </View>

          {/* The frame. Everything outside it is cropped away. */}
          <View
            accessibilityLabel="Drag the photo to choose the visible area"
            style={{
              width: frame.width,
              height: frame.height,
              alignSelf: 'center',
              borderRadius: radii.md,
              overflow: 'hidden',
              backgroundColor: colors.panel,
            }}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderGrant={(e) => {
              dragStart.current = {
                tx: tx.value,
                ty: ty.value,
                x: e.nativeEvent.pageX,
                y: e.nativeEvent.pageY,
              };
            }}
            onResponderMove={(e) => {
              tx.value = clamp(
                dragStart.current.tx + (e.nativeEvent.pageX - dragStart.current.x),
                bounds.x,
              );
              ty.value = clamp(
                dragStart.current.ty + (e.nativeEvent.pageY - dragStart.current.y),
                bounds.y,
              );
            }}
          >
            {source ? (
              <Animated.View
                style={[
                  {
                    position: 'absolute',
                    left: (frame.width - displayed.width) / 2,
                    top: (frame.height - displayed.height) / 2,
                    width: displayed.width,
                    height: displayed.height,
                  },
                  imageStyle,
                ]}
              >
                <Image
                  source={{ uri: source.uri }}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="fill"
                  accessible={false}
                />
              </Animated.View>
            ) : null}
          </View>

          <Text
            style={{
              fontSize: 12.5,
              color: colors.mute,
              textAlign: 'center',
              marginTop: 10,
            }}
          >
            Drag to reposition
          </Text>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 14,
              marginTop: 12,
            }}
          >
            <ZoomButton
              icon="minus"
              label="Zoom out"
              disabled={zoom <= MIN_ZOOM}
              onPress={() => applyZoom(zoom - ZOOM_STEP)}
            />
            <View style={{ minWidth: 56, alignItems: 'center' }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink }}>
                {zoom.toFixed(2)}x
              </Text>
            </View>
            <ZoomButton
              icon="plus"
              label="Zoom in"
              disabled={zoom >= MAX_ZOOM}
              onPress={() => applyZoom(zoom + ZOOM_STEP)}
            />
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 18 }}>
            <View style={{ flex: 1 }}>
              <Button label="Reset" variant="ghost" full onPress={reset} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Use photo" variant="primary" full onPress={handleConfirm} />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ZoomButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const { theme: colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      hitSlop={HIT_SLOP_8}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: colors.hairline,
        backgroundColor: colors.paper,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
      })}
    >
      <Feather name={icon} size={17} color={colors.ink} />
    </Pressable>
  );
}
