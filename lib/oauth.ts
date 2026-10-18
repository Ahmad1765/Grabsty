// Google sign-in for the managed (Expo Go / dev build) workflow via Supabase
// OAuth + an in-app auth browser session. No native module required, so this
// works in Expo Go. Apple native Sign In is deferred until a dev build exists.
//
// Setup required on the Supabase side (dashboard → Auth → Providers → Google):
//   1. Enable Google, paste the Google OAuth client id/secret.
//   2. Add this app's redirect URL (Linking.createURL('auth-callback'),
//      e.g. grabsty://auth-callback and the Expo Go proxy URL) to the
//      provider's allowed redirect URLs.
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';

// Dismisses any lingering auth popup (web) and completes the session handshake.
WebBrowser.maybeCompleteAuthSession();

export type OAuthResult = { ok: true } | { ok: false; error?: string; cancelled?: boolean };

export async function signInWithGoogle(): Promise<OAuthResult> {
  try {
    const redirectTo = Linking.createURL('auth-callback');
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) return { ok: false, error: error.message };
    if (!data?.url) return { ok: false, error: 'Could not start Google sign-in' };

    const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (res.type === 'cancel' || res.type === 'dismiss') return { ok: false, cancelled: true };
    if (res.type !== 'success' || !res.url) return { ok: false, error: 'Sign-in was not completed' };

    // PKCE (the client's default flow): exchange the returned ?code for a session.
    const code = Linking.parse(res.url).queryParams?.code;
    if (typeof code === 'string' && code) {
      const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
      if (exErr) return { ok: false, error: exErr.message };
      return { ok: true };
    }

    // Fallback: implicit-flow tokens in the URL fragment.
    const hash = res.url.split('#')[1];
    if (hash) {
      const params = new URLSearchParams(hash);
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');
      if (access_token && refresh_token) {
        const { error: sErr } = await supabase.auth.setSession({ access_token, refresh_token });
        if (sErr) return { ok: false, error: sErr.message };
        return { ok: true };
      }
    }
    return { ok: false, error: 'No session returned from Google' };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Google sign-in failed' };
  }
}
