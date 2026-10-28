import { Tabs } from 'expo-router';
import { AnimatedTabBar } from '../../components/AnimatedTabBar';
import { useSellSheet } from '@/components/sell/SellSheet';
import { useDiscoverSheet } from '@/components/discover/DiscoverSheet';
import { useIsDesktop } from '@/lib/responsive';

export default function TabsLayout() {
  const { open: openSellSheet } = useSellSheet();
  const { open: openDiscoverSheet } = useDiscoverSheet();
  // Desktop web navigates from DesktopTopNav (mounted in app/_layout.tsx).
  const isDesktop = useIsDesktop();

  return (
    <Tabs
      tabBar={(props) => (isDesktop ? null : <AnimatedTabBar {...props} />)}
      screenOptions={{
        headerShown: false,
        freezeOnBlur: true,
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen
        name="discover"
        options={{ title: 'Browse' }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            (e as any)?.stopPropagation?.();
            openDiscoverSheet();
          },
        }}
      />
      {/* Wardrobe tab hidden 2026-07-04. Route file app/(tabs)/wardrobe.tsx is untouched.
          To restore: swap options back to { title: 'Wardrobe' }. */}
      <Tabs.Screen name="wardrobe" options={{ href: null }} />
      {/* The Sell tab stays a real Tabs.Screen so it keeps its slot/icon in
          AnimatedTabBar, but tapping it never switches to the flat tab
          content — it opens the sell form as a Modal on top of whatever
          screen is active (components/sell/SellSheet.tsx), the same way the
          product page's "Offer" button opens OfferSheet. The tab's own
          content (app/(tabs)/upload.tsx) is just a fallback for paths that
          bypass this listener (deep link, back/forward). */}
      <Tabs.Screen
        name="upload"
        options={{ title: 'Sell' }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            (e as any)?.stopPropagation?.();
            openSellSheet();
          },
        }}
      />
      <Tabs.Screen name="chat" options={{ title: 'Activity' }} />
      <Tabs.Screen name="profile" options={{ title: 'Account' }} />
    </Tabs>
  );
}
