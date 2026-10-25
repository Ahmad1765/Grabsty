// app/legal/[doc].tsx — Privacy Policy and Terms of Service, in-app.
// Settings linked to grabsty.com/privacy and /terms, which do not exist, so both
// links dead-ended in a browser error. The text describes what the app actually
// does today; have it reviewed before public launch.
import { View, Pressable, ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { Text } from '@/lib/rnText';
import { useTheme } from '@/context/ThemeContext';
import { safeBack } from '@/lib/nav';
import { BRAND } from '@/lib/brand';
import { SUPPORT_EMAIL } from '@/components/settings/useSettingsManager';

type Doc = { title: string; updated: string; sections: { h: string; p: string[] }[] };

const PRIVACY: Doc = {
  title: 'Privacy Policy',
  updated: 'October 2026',
  sections: [
    {
      h: 'What we collect',
      p: [
        'Account details you give us: email address, username, name, profile photo, bio and phone number.',
        'Listings you post, including photos, descriptions and prices, and the messages, offers and orders you exchange with other members.',
        'Delivery details you enter at checkout or in Settings: recipient name, address and phone number.',
        'Your approximate location, only if you allow it, to fill in your address.',
        'A push-notification token for this device, only if you turn notifications on.',
        'Crash and error reports, so we can fix problems.',
        'Usage data: which screens you open, searches (their length, not what you typed), and actions like listing, liking, offering and ordering, linked to your account ID.',
        'Occasional screen recordings of app sessions, with all text, photos and inputs hidden, to find confusing or broken screens.',
        'If you verify your identity, the ID document photo you upload. It is stored privately and only our staff can view it.',
      ],
    },
    {
      h: 'How we use it',
      p: [
        'To run the marketplace: showing your listings, connecting buyers and sellers, processing orders and arranging delivery.',
        'To send you notifications you asked for, such as new messages, offers and order updates.',
        'To keep members safe: reviewing reports, resolving disputes and preventing fraud.',
        'We do not sell your personal information.',
      ],
    },
    {
      h: 'Who can see it',
      p: [
        'Other members see your public profile, your listings and the messages you send them.',
        'Your delivery address and phone number are shared only with the courier and the other party to an order, so it can be delivered.',
        `${BRAND} staff can access account and order data to provide support and resolve disputes.`,
        'We use trusted service providers who process data only on our behalf: Supabase (database and file storage), PostHog (usage analytics, United States), Sentry (crash reports, Germany), Expo and Google Firebase (push notifications) and Vercel (website hosting).',
      ],
    },
    {
      h: 'Your choices',
      p: [
        'You can edit your profile and delivery details in Settings at any time.',
        'You can turn notifications off in Settings or in your phone settings.',
        'You can stop sharing usage data and screen recordings in Settings → General → Share usage data.',
        `You can delete your account in Settings → Security → Delete account. This removes your personal data and listings, and your usage-analytics profile. You can also ask us at ${SUPPORT_EMAIL}.`,
      ],
    },
    {
      h: 'Contact',
      p: [`Questions about privacy: ${SUPPORT_EMAIL}.`],
    },
  ],
};

const TERMS: Doc = {
  title: 'Terms of Service',
  updated: 'October 2026',
  sections: [
    {
      h: 'Using Grabsty',
      p: [
        `${BRAND} is a marketplace where members buy and sell pre-owned fashion. By creating an account you agree to these terms.`,
        'Keep your login details private. You are responsible for activity on your account.',
      ],
    },
    {
      h: 'Selling',
      p: [
        'List only items you own and are allowed to sell. Describe them honestly, including their condition and any flaws.',
        'Counterfeit items, stolen goods and anything illegal are not allowed and will be removed.',
        'When an item sells, prepare it for collection or dispatch promptly.',
      ],
    },
    {
      h: 'Buying and payment',
      p: [
        'Prices are set by sellers. The Buyer Protection fee shown at checkout is added to your order.',
        'With Cash on Delivery you pay the courier when your order arrives.',
        'Offers you make are binding if the seller accepts them.',
      ],
    },
    {
      h: 'Buyer Protection and disputes',
      p: [
        'If an item does not arrive or is significantly not as described, report it from your order before confirming delivery.',
        `${BRAND} reviews disputes and decides whether to refund the buyer or release payment to the seller.`,
      ],
    },
    {
      h: 'Conduct',
      p: [
        'Be respectful. Harassment, scams and attempts to move payment outside the app are not allowed.',
        'We may remove content or suspend accounts that break these terms.',
      ],
    },
    {
      h: 'Contact',
      p: [`Questions about these terms: ${SUPPORT_EMAIL}.`],
    },
  ],
};

export default function LegalScreen() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const d = doc === 'terms' ? TERMS : PRIVACY;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, height: 52 }}>
        <Pressable
          onPress={() => safeBack()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
        >
          <Feather name="arrow-left" size={22} color={theme.ink} />
        </Pressable>
        <Text style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: theme.ink, marginRight: 40 }}>
          {d.title}
        </Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 32 }}>
        <Text style={{ fontSize: 13, color: theme.mute, marginTop: 4, marginBottom: 8 }}>Last updated {d.updated}</Text>
        {d.sections.map((s) => (
          <View key={s.h} style={{ marginTop: 18 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: theme.ink, marginBottom: 8 }}>{s.h}</Text>
            {s.p.map((line) => (
              <Text key={line} style={{ fontSize: 14.5, lineHeight: 22, color: theme.ink, marginBottom: 8 }}>
                {line}
              </Text>
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
