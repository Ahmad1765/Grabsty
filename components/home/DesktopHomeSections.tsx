import { View, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Text } from '@/lib/rnText';
import { useTheme } from '@/context/ThemeContext';
import { useSellSheet } from '@/components/sell/SellSheet';
import { useDiscoverSheet } from '@/components/discover/DiscoverSheet';
import { GrabstyLogo } from '@/components/ui/GrabstyLogo';
import { ShieldCheckIcon } from '@/components/ui/ShieldCheckIcon';
import { CATEGORIES } from '@/lib/categories';
import { BRAND } from '@/lib/brand';

// Desktop-only home furniture (see app/(tabs)/index.tsx): the feed's section
// heading and the site footer. On a phone the feed is the whole screen; on a
// wide monitor it sits in a page.

type HoverState = { pressed: boolean; hovered?: boolean };

const PAD = 12; // matches the feed grid's row padding so edges line up

const openCategory = (id: string) => router.navigate(`/?searchOpen=1&searchCategory=${id}` as any);

export function DesktopSectionTitle({ title, meta }: { title: string; meta?: string }) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 10,
        paddingHorizontal: PAD,
        paddingTop: 24,
        paddingBottom: 4,
      }}
    >
      <Text style={{ fontSize: 24, lineHeight: 30, fontWeight: '700', letterSpacing: -0.4, color: theme.ink }}>
        {title}
      </Text>
      {meta ? <Text style={{ fontSize: 14, color: theme.textMuted }}>{meta}</Text> : null}
    </View>
  );
}

export function DesktopFooter() {
  const { theme } = useTheme();
  const sell = useSellSheet();
  const discover = useDiscoverSheet();
  const columns: { title: string; links: { label: string; onPress: () => void }[] }[] = [
    {
      title: 'Shop',
      links: [
        ...CATEGORIES.slice(0, 4).map((c) => ({ label: c.label, onPress: () => openCategory(c.id) })),
        { label: 'All categories', onPress: () => discover.open() },
      ],
    },
    {
      title: 'Sell',
      links: [
        { label: 'List an item', onPress: () => void sell.open() },
        { label: 'Your shop', onPress: () => router.navigate('/profile' as any) },
        { label: 'Orders & sales', onPress: () => router.navigate('/chat?tab=orders' as any) },
      ],
    },
    {
      title: 'Help',
      links: [
        { label: 'Support', onPress: () => router.navigate('/chat?tab=support' as any) },
        { label: 'Settings', onPress: () => router.push('/settings' as any) },
        { label: 'Terms', onPress: () => router.push('/legal/terms' as any) },
        { label: 'Privacy', onPress: () => router.push('/legal/privacy' as any) },
      ],
    },
  ];

  return (
    <View
      style={{
        marginTop: 56,
        marginHorizontal: PAD,
        paddingTop: 40,
        borderTopWidth: 1,
        borderTopColor: theme.border,
      }}
    >
      <View style={{ flexDirection: 'row', gap: 32 }}>
        <View style={{ flex: 1.4, gap: 12 }}>
          <GrabstyLogo size={26} variant="full" />
          <Text style={{ fontSize: 14, lineHeight: 21, color: theme.textMuted, maxWidth: 300 }}>
            Buy and sell preloved fashion. Locally, beautifully, in a minute.
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <ShieldCheckIcon size={18} />
            <Text style={{ fontSize: 13, color: theme.textMuted }}>Buyer protection on every order</Text>
          </View>
        </View>
        {columns.map((col) => (
          <View key={col.title} style={{ flex: 1, gap: 10 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: theme.ink, marginBottom: 4 }}>{col.title}</Text>
            {col.links.map((l) => (
              <Pressable key={l.label} accessibilityRole="link" onPress={l.onPress}>
                {(s: HoverState) => (
                  <Text
                    style={{
                      fontSize: 14,
                      color: s.hovered ? theme.ink : theme.textMuted,
                      textDecorationLine: s.hovered ? 'underline' : 'none',
                    }}
                  >
                    {l.label}
                  </Text>
                )}
              </Pressable>
            ))}
          </View>
        ))}
      </View>
      <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 40 }}>
        © {new Date().getFullYear()} {BRAND}
      </Text>
    </View>
  );
}
