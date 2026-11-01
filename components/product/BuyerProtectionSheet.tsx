import { View, Pressable, Modal, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { priceBreakdown, formatPrice } from '@/lib/fees';
import { useTheme } from '@/context/ThemeContext';
import { ShieldCheckIcon } from '@/components/ui/ShieldCheckIcon';
import { IS_IOS, tap } from './shared';

// Thin 1.5px line icons (Feather geometry) so the rows read light, like a
// printed guarantee card, instead of the heavier icon-font glyphs.
function LineIcon({ kind, color }: { kind: 'package' | 'lock' | 'support'; color: string }) {
  const common = { stroke: color, strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={30} height={30} viewBox="0 0 24 24">
      {kind === 'package' && (
        <>
          <Path {...common} d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <Path {...common} d="M3.27 6.96 12 12.01l8.73-5.05M12 22.08V12" />
        </>
      )}
      {kind === 'lock' && (
        <>
          <Rect {...common} x={4} y={11} width={16} height={10} rx={2} />
          <Path {...common} d="M8 11V7a4 4 0 0 1 8 0v4" />
          <Circle {...common} cx={12} cy={16} r={1.25} />
        </>
      )}
      {kind === 'support' && (
        <Path
          {...common}
          d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
        />
      )}
    </Svg>
  );
}

// Claims mirror the Terms ("Buyer Protection and disputes"); keep them in sync.
const COVERAGE = [
  {
    icon: 'package' as const,
    title: 'Worry-free shopping',
    text: 'Get what you ordered, or a refund if it never arrives or isn’t as described.',
  },
  {
    icon: 'lock' as const,
    title: 'Secure payments',
    text: 'Your payment is held until you confirm your order arrived.',
  },
  {
    icon: 'support' as const,
    title: 'Help when you need it',
    text: 'Report a problem from your order and our team steps in.',
  },
];

// The three coverage rows. Claims mirror the Terms.
function BuyerProtectionPoints({ style }: { style?: StyleProp<ViewStyle> }) {
  const { theme } = useTheme();
  return (
    <View style={[{ gap: 24 }, style]}>
      {COVERAGE.map((c) => (
        <View key={c.icon} style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <View style={{ width: 32, alignItems: 'center' }}>
            <LineIcon kind={c.icon} color={theme.ink} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontFamily: 'Inter_600SemiBold', color: theme.ink }}>{c.title}</Text>
            <Text
              style={{
                fontSize: 15,
                fontFamily: 'Inter_400Regular',
                color: theme.mute,
                lineHeight: 21,
                marginTop: 2,
              }}
            >
              {c.text}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function openTerms() {
  tap('selection');
  router.push('/legal/terms' as any);
}

export function BuyerProtectionSheet({
  visible,
  itemPrice,
  onClose,
}: {
  visible: boolean;
  /** Omit outside a listing (e.g. Support): the per-order fee line is hidden. */
  itemPrice?: number;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const { protection, total } = priceBreakdown(itemPrice ?? 0);

  const learnMore = () => {
    onClose();
    openTerms();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <Pressable onPress={onClose} style={{ flex: 1, justifyContent: 'flex-end' }}>
        {IS_IOS ? (
          <BlurView intensity={22} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]} />
        )}

        {/* Inner Pressable swallows taps so a press inside doesn't close. */}
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: theme.panel,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingHorizontal: 24,
            paddingTop: 8,
            paddingBottom: (insets.bottom || 16) + 8,
          }}
        >
          {/* Grab handle */}
          <View
            style={{
              alignSelf: 'center',
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: theme.border,
            }}
          />

          {/* Close */}
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={8}
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              width: 40,
              height: 40,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Feather name="x" size={24} color={theme.ink} />
          </Pressable>

          <ShieldCheckIcon size={80} style={{ alignSelf: 'center', marginTop: 32 }} />

          <Text
            accessibilityRole="header"
            style={{
              fontSize: 22,
              fontFamily: 'Inter_600SemiBold',
              color: theme.ink,
              textAlign: 'center',
              marginTop: 16,
            }}
          >
            Buyer protection
          </Text>
          {itemPrice != null && protection > 0 && (
            <Text
              style={{
                fontSize: 13,
                fontFamily: 'Inter_400Regular',
                color: theme.mute,
                textAlign: 'center',
                marginTop: 4,
                fontVariant: ['tabular-nums'],
              }}
            >
              {`${formatPrice(protection)} on this order · ${formatPrice(total)} total`}
            </Text>
          )}

          <BuyerProtectionPoints style={{ marginTop: 28 }} />

          <Pressable
            onPress={() => {
              tap('selection');
              onClose();
            }}
            accessibilityRole="button"
            accessibilityLabel="Got it"
            testID="buyer-protection-got-it"
            style={({ pressed }) => ({
              height: 48,
              marginTop: 32,
              borderRadius: 10,
              backgroundColor: theme.purple,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.9 : 1,
            })}
          >
            <Text style={{ fontSize: 16, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF' }}>Got it</Text>
          </Pressable>

          <Pressable
            onPress={learnMore}
            accessibilityRole="link"
            accessibilityLabel="Learn more about buyer protection"
            testID="buyer-protection-learn-more"
            style={{ alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 16, marginTop: 8 }}
          >
            <Text style={{ fontSize: 15, fontFamily: 'Inter_600SemiBold', color: theme.purple }}>Learn more</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
