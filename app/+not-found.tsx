import { View } from 'react-native';
import { Stack, router } from 'expo-router';
import { SafeContainer } from '@/components/ui/SafeContainer';
import { EmptyState } from '@/components/ui/EmptyState';

export default function NotFoundScreen() {
  return (
    <SafeContainer noScroll>
      <Stack.Screen options={{ headerShown: false, title: 'Page not found' }} />
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <EmptyState
          icon="compass"
          title="This page wandered off"
          description="The link may be broken, or the listing was removed. Let's get you back to browsing."
          cta={{ label: 'Back to Home', icon: 'home', onPress: () => router.replace('/') }}
        />
      </View>
    </SafeContainer>
  );
}
