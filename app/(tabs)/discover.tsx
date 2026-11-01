import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * Discover tab has been simplified and removed in favor of the integrated
 * Home search and filter experience. Any incoming routes or deep links to
 * /discover are seamlessly redirected to Home (/) with query parameters preserved.
 */
export default function DiscoverScreen() {
  const params = useLocalSearchParams();
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && value.length > 0) {
      searchParams.set(key, value);
    }
  }

  const qs = searchParams.toString();
  const target = qs ? (`/?${qs}` as any) : ('/' as any);

  return <Redirect href={target} />;
}
