// Landing page for Google sign-in (signInWithOAuth's redirectTo →
// <origin>/auth-callback on web, grabsty://auth-callback on native). Supabase
// appends #access_token=…&refresh_token=… (implicit flow) or ?code=… (PKCE).
// On native, lib/oauth.ts already got the URL from openAuthSessionAsync; if the
// deep link is routed here too, setting the same session again is harmless.
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import * as Linking from 'expo-linking';
import { router, Stack } from 'expo-router';
import { SafeContainer } from '@/components/ui/SafeContainer';
import { Button } from '@/components/ui/Button';
import { Text } from '@/lib/rnText';
import { supabase } from '@/lib/supabase';
import { capture } from '@/lib/analytics';
import { useTheme } from '@/context/ThemeContext';

function linkParams(url: string): URLSearchParams {
  const params = new URLSearchParams(url.split('#')[1] ?? '');
  new URLSearchParams(url.split('?')[1]?.split('#')[0] ?? '').forEach((v, k) => params.set(k, v));
  return params;
}

// Read at module load: on web the router can rewrite the address (dropping the
// #access_token fragment) before this screen's effect runs.
const initialWebHref =
  Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.href : null;

export default function AuthCallbackScreen() {
  const { theme } = useTheme();
  const url = Linking.useURL();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const href = Platform.OS === 'web' ? initialWebHref : url;
    if (!href) return;
    const p = linkParams(href);
    // The tokens must not linger in the address bar or browser history.
    if (Platform.OS === 'web') window.history.replaceState(null, '', window.location.pathname);
    (async () => {
      if (p.get('error_description')) throw new Error(p.get('error_description')!);
      const code = p.get('code');
      const access_token = p.get('access_token');
      const refresh_token = p.get('refresh_token');
      let res;
      if (code) {
        res = await supabase.auth.exchangeCodeForSession(code);
      } else if (access_token && refresh_token) {
        res = await supabase.auth.setSession({ access_token, refresh_token });
      } else if ((await supabase.auth.getSession()).data.session) {
        // Native: lib/oauth.ts already finished and the link arrived bare.
        return router.replace('/(tabs)');
      } else {
        throw new Error('This sign-in link is incomplete.');
      }
      if (res.error) throw res.error;
      if (Platform.OS === 'web') capture('signed_in', { method: 'google' });
      router.replace('/(tabs)');
    })().catch((e) => setError(e?.message ?? 'Google sign-in failed'));
  }, [url]);

  return (
    <SafeContainer>
      <Stack.Screen options={{ headerShown: false, title: 'Signing in' }} />
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24, maxWidth: 440, width: '100%', alignSelf: 'center' }}>
        <Text style={{ fontSize: 24, fontWeight: '800', color: theme.ink }}>
          {error ? 'Sign-in failed' : 'Signing you in…'}
        </Text>
        {error && (
          <>
            <Text style={{ marginTop: 8, color: theme.textMuted }}>{error}</Text>
            <View style={{ marginTop: 20 }}>
              <Button label="Back to sign in" onPress={() => router.replace('/auth/login')} full />
            </View>
          </>
        )}
      </View>
    </SafeContainer>
  );
}
