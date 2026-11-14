import { RequireSignIn } from '@/components/RequireSignIn';
import { useCallback } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { SellForm } from '@/components/sell/SellSheet';
import { useTheme } from '@/context/ThemeContext';
import { useListingQuery } from '@/lib/queries/useListingsQueries';

// Guests go to sign-in and come back here (RequireSignIn keeps ?id=).
export default function SellScreenGate() {
  return (
    <RequireSignIn>
      <SellScreen />
    </RequireSignIn>
  );
}

function SellScreen() {
  const { theme } = useTheme();
  const params = useLocalSearchParams<{ id?: string }>();
  const listingId = typeof params.id === 'string' ? params.id : undefined;

  const { data: listing } = useListingQuery(listingId);

  const handleClose = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <SellForm
        editingListing={listing ?? null}
        onClose={handleClose}
      />
    </View>
  );
}
