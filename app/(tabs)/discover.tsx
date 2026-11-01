import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FeedSearch } from '@/components/home/HomeHeader';
import { SearchLanding } from '@/components/discover/SearchLanding';
import { useActivityUnreadCount } from '@/lib/queries';
import { useTabBarClearance } from '@/lib/responsive';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/context/ThemeContext';

/**
 * Browse tab: the Home search bar (tapping it opens search on Home) and
 * "Top sellers this week".
 *
 * Old /discover deep links carry their intent as query params (category,
 * sort, q…); those still forward to Home, which owns search and filters.
 */
export default function DiscoverScreen() {
  const params = useLocalSearchParams();
  const { theme } = useTheme();
  const { user } = useAuth();
  const unread = useActivityUnreadCount(user?.id ?? null);
  const tabBarClearance = useTabBarClearance();

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && value.length > 0) searchParams.set(key, value);
  }
  const qs = searchParams.toString();
  if (qs) return <Redirect href={`/?${qs}` as any} />;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.background }}>
      <FeedSearch
        value=""
        onChangeText={() => {}}
        focused={false}
        onFocus={() => {}}
        onBlur={() => {}}
        onPressSearch={() => router.push('/?searchOpen=1' as any)}
        resultCount={null}
        unreadNotificationsCount={unread}
        onPressNotifications={() => router.push('/news' as any)}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: tabBarClearance }}
      >
        <SearchLanding
          onTab={() => router.push('/?searchOpen=1&searchTab=seller' as any)}
          onSelectSeller={(seller) => router.push(`/user/${seller}` as any)}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
