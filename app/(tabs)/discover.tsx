import { Redirect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DiscoverSheetBody } from '@/components/discover/DiscoverSheet';
import { useTabBarClearance } from '@/lib/responsive';
import { useTheme } from '@/context/ThemeContext';

/**
 * Browse tab: its own page, with the same body as the Browse sheet
 * (search, categories, top sellers, brands, quick browse, you may like).
 *
 * Old /discover deep links carry their intent as query params (category,
 * sort, q…); those still forward to Home, which owns search and filters.
 */
export default function DiscoverScreen() {
  const params = useLocalSearchParams();
  const { theme } = useTheme();
  const tabBarClearance = useTabBarClearance();

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && value.length > 0) searchParams.set(key, value);
  }
  const qs = searchParams.toString();
  if (qs) return <Redirect href={`/?${qs}` as any} />;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, paddingTop: 8, backgroundColor: theme.background }}>
      <DiscoverSheetBody onClose={() => {}} contentBottom={tabBarClearance} />
    </SafeAreaView>
  );
}
