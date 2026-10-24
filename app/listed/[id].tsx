// "Item listed" celebration shown right after a seller publishes, instead of
// dropping them straight onto the product page. Card springs in tilted with
// purple swooshes around it; one primary CTA (List another), Later goes back,
// tapping the card opens the listing.
import { useEffect } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { Text } from '@/lib/rnText';
import { SafeContainer } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import { type as typography } from '@/lib/theme';
import { useListingQuery } from '@/lib/queries';
import { cardImageUrl, getOptimizedImageUrl } from '@/lib/images';
import { formatPrice } from '@/lib/currency';
import { conditionLabel } from '@/components/product/shared';
import { useSellSheet } from '@/components/sell/SellSheet';
import { safeBack } from '@/lib/nav';

const CARD_W = 220;

function Swoosh({ d, delay, style }: { d: string; delay: number; style: object }) {
  const { theme } = useTheme();
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withSpring(1, { damping: 12, stiffness: 140 }));
  }, [delay, p]);
  const anim = useAnimatedStyle(() => ({
    opacity: Math.min(p.value, 1),
    transform: [{ scale: 0.5 + 0.5 * p.value }],
  }));
  return (
    <Animated.View style={[{ position: 'absolute' }, style, anim]} pointerEvents="none">
      <Svg width={90} height={90} viewBox="0 0 90 90">
        <Path d={d} stroke={theme.purple} strokeOpacity={0.55} strokeWidth={9} strokeLinecap="round" fill="none" />
      </Svg>
    </Animated.View>
  );
}

export default function ListedScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const listingId = typeof id === 'string' ? id : '';
  const { theme } = useTheme();
  const { open: openSellSheet } = useSellSheet();
  const { data: listing } = useListingQuery(listingId);

  const enter = useSharedValue(0);
  const copy = useSharedValue(0);
  useEffect(() => {
    enter.value = withSpring(1, { damping: 13, stiffness: 120 });
    copy.value = withDelay(220, withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }));
  }, [enter, copy]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: Math.min(enter.value * 1.5, 1),
    transform: [
      { translateY: (1 - enter.value) * 60 },
      { rotate: `${-12 + 8 * enter.value}deg` },
      { scale: 0.85 + 0.15 * enter.value },
    ],
  }));
  const copyStyle = useAnimatedStyle(() => ({
    opacity: copy.value,
    transform: [{ translateY: (1 - copy.value) * 16 }],
  }));

  const imageUrl = listing ? getOptimizedImageUrl(cardImageUrl(listing, 0), { width: CARD_W * 2 }) : null;
  const subtitle = listing ? [listing.brand, conditionLabel(listing.condition)].filter(Boolean) : [];

  const later = () => safeBack();
  const listAnother = () => {
    safeBack();
    openSellSheet();
  };
  const viewListing = () => {
    if (listingId) router.replace(`/product/${listingId}` as any);
  };

  return (
    <SafeContainer edges={['top', 'bottom', 'left', 'right']} backgroundColor={theme.background} style={{ flex: 1 }}>
      <View style={styles.stage}>
        <View style={{ width: CARD_W + 160, height: CARD_W * 1.75, alignItems: 'center', justifyContent: 'center' }}>
          {/* Decorative swooshes, echoing a party burst around the card */}
          <Swoosh d="M70 20 C30 5 5 40 25 70" delay={260} style={{ top: 0, left: 0 }} />
          <Swoosh d="M20 45 L45 30 M30 65 L55 50" delay={340} style={{ top: 10, right: 0 }} />
          <Swoosh d="M15 30 L40 20 M25 55 L50 45" delay={420} style={{ bottom: 30, left: 6 }} />
          <Swoosh d="M70 20 C80 60 45 85 15 65" delay={300} style={{ bottom: 0, right: 4 }} />

          <Animated.View style={cardStyle}>
            <Pressable
              onPress={viewListing}
              accessibilityRole="button"
              accessibilityLabel="View listing"
              testID="listed-card"
              style={({ pressed }) => [
                styles.card,
                { backgroundColor: theme.panel, borderColor: theme.border, opacity: pressed ? 0.9 : 1 },
              ]}
            >
              <View style={[styles.image, { backgroundColor: theme.purpleSoft }]}>
                {imageUrl ? (
                  <Image source={{ uri: imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
                ) : null}
              </View>
              <Text numberOfLines={1} style={{ marginTop: 10, fontSize: 14, fontFamily: typography.family.sansMedium, color: theme.ink }}>
                {listing?.title ?? ' '}
              </Text>
              {subtitle.length > 0 ? (
                <Text numberOfLines={1} style={{ marginTop: 2, fontSize: 13, fontFamily: typography.family.sans, color: theme.mute }}>
                  {subtitle.join(' · ')}
                </Text>
              ) : null}
              <Text style={{ marginTop: 8, fontSize: 16, fontFamily: typography.family.sansBold, color: theme.ink }}>
                {listing?.price != null ? formatPrice(listing.price) : ' '}
              </Text>
            </Pressable>
          </Animated.View>
        </View>
      </View>

      <Animated.View style={[styles.footer, copyStyle]}>
        <Text style={{ fontSize: 28, fontFamily: typography.family.sansBold, color: theme.ink }}>Item listed</Text>
        <Text style={{ marginTop: 8, fontSize: 16, lineHeight: 23, fontFamily: typography.family.sans, color: theme.mute }}>
          Did you know that you&apos;ll sell faster with more items in your closet?
        </Text>

        <Pressable
          onPress={listAnother}
          testID="listed-list-another"
          accessibilityRole="button"
          style={({ pressed }) => [styles.primary, { backgroundColor: theme.purple, opacity: pressed ? 0.88 : 1 }]}
        >
          <Text style={{ fontSize: 16, fontFamily: typography.family.sansBold, color: '#FFFFFF' }}>List another</Text>
        </Pressable>
        <Pressable onPress={later} testID="listed-later" accessibilityRole="button" style={styles.secondary} hitSlop={8}>
          <Text style={{ fontSize: 16, fontFamily: typography.family.sansSemibold, color: theme.purple }}>Later</Text>
        </Pressable>
      </Animated.View>
    </SafeContainer>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    width: CARD_W,
    padding: 12,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  image: { width: '100%', aspectRatio: 4 / 5, borderRadius: 12, overflow: 'hidden' },
  footer: { paddingHorizontal: 24, paddingBottom: 16 },
  primary: { marginTop: 28, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  secondary: { marginTop: 12, height: 44, alignItems: 'center', justifyContent: 'center' },
});
