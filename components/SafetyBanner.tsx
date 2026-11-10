// Reusable "Shop and sell safely" trust banner. One surface, used on the
// product page, checkout, offer sheet, sell flow, and chat so buyer/seller
// protection reads consistently everywhere. Palette-compliant: neutral panel
// with a single purple accent (icon + link), no off-brand colours.
//
// Copy is context-aware (buyer vs seller vs checkout) but the mark, link, and
// coverage explainer stay identical across surfaces.
import { View, Alert, StyleSheet, Platform, type ViewStyle, type StyleProp } from 'react-native';
import { Text } from '@/lib/rnText';
import * as Haptics from 'expo-haptics';
import { ShieldCheckIcon } from '@/components/ui/ShieldCheckIcon';
import { radii, type as typography } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';

// Per-surface copy. Same trust mark and link everywhere; only the framing
// changes so a seller listing an item never reads buyer-only wording.
const PRESETS = {
  shop: {
    title: 'Shop and sell safely',
    body: 'Every purchase is covered by our refund policy, secure payments, and support.',
  },
  checkout: {
    title: 'Protected checkout',
    body: 'Your payment is encrypted, and your order is covered if it doesn’t arrive or isn’t as described.',
  },
  offer: {
    title: 'Offers are protected',
    body: 'Once your offer’s accepted, pay securely in the app — covered by our refund policy if something goes wrong.',
  },
  sell: {
    title: 'Sell with confidence',
    body: 'List for free and get paid securely once your buyer receives the item. We handle payments and support.',
  },
  chat: {
    title: 'Keep it safe, keep it in the app',
    body: 'In-app payments are secure and every order is covered by our refund policy.',
  },
} as const;

type Props = {
  /** Selects the per-surface copy. Defaults to the buyer-facing "shop" copy. */
  context?: keyof typeof PRESETS;
  /** Override the preset title. */
  title?: string;
  /** Override the preset body. */
  body?: string;
  /** Override the wrapper style (e.g. add margins on a specific page). */
  style?: StyleProp<ViewStyle>;
  /** Custom link handler. Defaults to an in-app coverage explainer. */
  onLinkPress?: () => void;
  /** Drop the soft panel background and render the row bare (tight/overlay surfaces). */
  bare?: boolean;
};

// Exported so surfaces that show the trust copy in a different shape (the
// chat thread prints it as a single muted line) still open the same explainer.
export function explainCoverage() {
  Alert.alert(
    "How you're covered",
    'Refund policy — Buyers get a full refund if an item never arrives or isn’t as described.\n\n' +
      'Secure payments — Card details are handled by our payment provider and are never stored on your device.\n\n' +
      'Getting paid — Sellers are paid out securely once the buyer receives the item.\n\n' +
      'Support — Our team steps in to help resolve any issue between buyer and seller.',
  );
}

export function SafetyBanner({ context = 'shop', title, body, style, onLinkPress, bare = false }: Props) {
  const { theme, isDark } = useTheme();
  const preset = PRESETS[context];
  const onLink = () => {
    if (Platform.OS === 'ios') Haptics.selectionAsync();
    (onLinkPress ?? explainCoverage)();
  };

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          padding: bare ? 0 : 14,
          borderRadius: radii.xl,
          backgroundColor: bare ? 'transparent' : theme.panel,
          borderWidth: bare ? 0 : StyleSheet.hairlineWidth,
          borderColor: theme.border,
        },
        style,
      ]}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          backgroundColor: isDark ? 'rgba(83, 86, 238, 0.16)' : '#F2F3FE',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ShieldCheckIcon size={22} bgColor="transparent" />
      </View>

      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontFamily: typography.family.sansSemibold,
            fontSize: typography.size.md,
            color: theme.ink,
            marginBottom: 2,
          }}
        >
          {title ?? preset.title}
        </Text>
        <Text
          style={{
            fontFamily: typography.family.sans,
            fontSize: 13,
            lineHeight: 18,
            color: theme.mute,
          }}
        >
          {body ?? preset.body}{' '}
          <Text
            onPress={onLink}
            accessibilityRole="link"
            accessibilityLabel="How you're covered"
            style={{ color: theme.purple, fontFamily: typography.family.sansSemibold }}
          >
            How you&apos;re covered
          </Text>
        </Text>
      </View>
    </View>
  );
}
