// Landing page for the password-reset email (resetPasswordForEmail's
// redirectTo → grabsty://auth/reset on native, <origin>/auth/reset on web).
// Supabase appends either #access_token=…&refresh_token=…&type=recovery
// (implicit flow) or ?code=… (PKCE). detectSessionInUrl is off app-wide, so
// this screen turns the link into a session itself, then sets the password.
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import * as Linking from 'expo-linking';
import { router, Stack } from 'expo-router';
import { SafeContainer } from '@/components/ui/SafeContainer';
import { Button } from '@/components/ui/Button';
import { Text, TextInput } from '@/lib/rnText';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/context/ThemeContext';

type Phase = 'verifying' | 'ready' | 'invalid' | 'done';

function linkParams(url: string): URLSearchParams {
  const params = new URLSearchParams(url.split('#')[1] ?? '');
  new URLSearchParams(url.split('?')[1]?.split('#')[0] ?? '').forEach((v, k) => params.set(k, v));
  return params;
}

// Read at module load: on web the router can rewrite the address (dropping the
// #access_token fragment) before this screen's effect runs.
const initialWebHref =
  Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.href : null;

// The tokens must not linger in the address bar or browser history.
function stripUrl() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.history.replaceState(null, '', window.location.pathname);
  }
}

export default function ResetPasswordScreen() {
  const { theme } = useTheme();
  const url = Linking.useURL();
  const [phase, setPhase] = useState<Phase>('verifying');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Shown so a link that signs into someone else's account is obvious.
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const href = Platform.OS === 'web' ? initialWebHref : url;
    if (!href) return;
    const p = linkParams(href);
    stripUrl();
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
      } else {
        throw new Error('This reset link is incomplete.');
      }
      if (res.error) throw res.error;
      setEmail(res.data.session?.user?.email ?? null);
      setPhase('ready');
    })().catch((e) => {
      setError(e?.message ?? 'This reset link is invalid or has expired.');
      setPhase('invalid');
    });
  }, [url]);

  const save = async () => {
    if (password.length < 8) return setError('Password must be at least 8 characters');
    if (password !== confirm) return setError('Passwords do not match');
    setError(null);
    setSaving(true);
    const { error: e } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (e) return setError(e.message);
    setPhase('done');
  };

  const inputStyle = {
    height: 48,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 16,
    color: theme.ink,
    backgroundColor: theme.panel,
    marginTop: 12,
  };

  return (
    <SafeContainer mode="keyboard-avoiding">
      <Stack.Screen options={{ headerShown: false, title: 'Reset password' }} />
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24, maxWidth: 440, width: '100%', alignSelf: 'center' }}>
        <Text style={{ fontSize: 24, fontWeight: '800', color: theme.ink }}>
          {phase === 'done' ? 'Password updated' : 'Set a new password'}
        </Text>

        {phase === 'verifying' && (
          <Text style={{ marginTop: 8, color: theme.textMuted }}>Checking your reset link…</Text>
        )}

        {phase === 'ready' && (
          <>
            {email && (
              <Text testID="reset-account-email" style={{ marginTop: 8, color: theme.textMuted }}>
                For {email}
              </Text>
            )}
            <TextInput
              testID="new-password-input"
              placeholder="New password (8+ characters)"
              placeholderTextColor={theme.textMuted}
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              value={password}
              onChangeText={setPassword}
              style={inputStyle}
            />
            <TextInput
              testID="confirm-password-input"
              placeholder="Confirm new password"
              placeholderTextColor={theme.textMuted}
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              value={confirm}
              onChangeText={setConfirm}
              onSubmitEditing={save}
              style={inputStyle}
            />
          </>
        )}

        {phase === 'invalid' && (
          <Text style={{ marginTop: 8, color: theme.textMuted }}>
            Request a new link from the sign-in screen.
          </Text>
        )}

        {phase === 'done' && (
          <Text style={{ marginTop: 8, color: theme.textMuted }}>You&apos;re signed in with your new password.</Text>
        )}

        {error && <Text style={{ marginTop: 12, color: theme.danger }}>{error}</Text>}

        <View style={{ marginTop: 20 }}>
          {phase === 'ready' && <Button label="Save password" onPress={save} loading={saving} full />}
          {phase === 'invalid' && (
            <Button label="Back to sign in" onPress={() => router.replace('/auth/login')} full />
          )}
          {phase === 'done' && <Button label="Continue" onPress={() => router.replace('/')} full />}
        </View>
      </View>
    </SafeContainer>
  );
}
