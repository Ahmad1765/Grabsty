import { type ReactNode } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@/lib/auth';

import { useTheme } from '@/context/ThemeContext';
export function RequireAuth({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator color="#6C47FF" accessibilityLabel="Loading, authenticating" accessibilityRole="progressbar" />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/auth/login" />;
  }

  return <>{children}</>;
}
