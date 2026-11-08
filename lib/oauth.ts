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
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { capture } from '@/lib/analytics';

// Dismisses any lingering auth popup (web) and completes the session handshake.
WebBrowser.maybeCompleteAuthSession();

export type OAuthResult = { ok: true } | { ok: false; error?: string; cancelled?: boolean };

const GOOGLE_WEB_CLIENT_ID = (process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '').trim();
const GOOGLE_IOS_CLIENT_ID = (process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '').trim();

// null = native sign-in unavailable (Expo Go / missing config) → caller uses the browser flow.
async function nativeGoogle(): Promise<OAuthResult | null> {
  if (!GOOGLE_WEB_CLIENT_ID || (Platform.OS === 'ios' && !GOOGLE_IOS_CLIENT_ID)) return null;
  let mod: typeof import('@react-native-google-signin/google-signin');
  try {
    mod = require('@react-native-google-signin/google-signin');
  } catch {
    return null;
  }
  const { GoogleSignin, isErrorWithCode, statusCodes } = mod;
  try {
    // idToken audience = web client, which is what Supabase's Google provider trusts.
    GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID, iosClientId: GOOGLE_IOS_CLIENT_ID || undefined });
    if (Platform.OS === 'android') await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const res = await GoogleSignin.signIn();
    if (res.type === 'cancelled') return { ok: false, cancelled: true };
    const token = res.data.idToken;
    if (!token) return { ok: false, error: 'Google did not return an ID token' };
    const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token });
    if (error) return { ok: false, error: error.message };
    capture('signed_in', { method: 'google' });
    return { ok: true };
  } catch (e: any) {
    if (isErrorWithCode(e) && e.code === statusCodes.IN_PROGRESS) return { ok: false, cancelled: true };
    if (isErrorWithCode(e) && e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) return null;
    return { ok: false, error: e?.message ?? 'Google sign-in failed' };
  }
}

/** Best-effort; never throws. No-op on web / Expo Go. */
export function signOutGoogle(): void {
  if (Platform.OS === 'web') return;
  try {
    const { GoogleSignin } = require('@react-native-google-signin/google-signin');
    GoogleSignin.signOut().catch(() => {});
  } catch {
    // native module not in this build
  }
}

/** iOS only. Apple requires it alongside Google sign-in (App Review 4.8). */
export async function signInWithApple(): Promise<OAuthResult> {
  try {
    const Apple = require('expo-apple-authentication') as typeof import('expo-apple-authentication');
    const Crypto = require('expo-crypto') as typeof import('expo-crypto');
    // Apple gets the hash; Supabase gets the raw nonce and checks they match.
    const rawNonce = Crypto.randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
    const cred = await Apple.signInAsync({
      requestedScopes: [Apple.AppleAuthenticationScope.FULL_NAME, Apple.AppleAuthenticationScope.EMAIL],
      nonce: hashedNonce,
    });
    if (!cred.identityToken) return { ok: false, error: 'Apple did not return an identity token' };
    const { error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: cred.identityToken, nonce: rawNonce });
    if (error) return { ok: false, error: error.message };
    // Apple shares the name only on the very first sign-in; keep it.
    const name = [cred.fullName?.givenName, cred.fullName?.familyName].filter(Boolean).join(' ');
    if (name) await supabase.auth.updateUser({ data: { full_name: name } });
    capture('signed_in', { method: 'apple' });
    return { ok: true };
  } catch (e: any) {
    if (e?.code === 'ERR_REQUEST_CANCELED') return { ok: false, cancelled: true };
    return { ok: false, error: e?.message ?? 'Apple sign-in failed' };
  }
}

export async function signInWithGoogle(): Promise<OAuthResult> {
  try {
    // Web: full-page redirect, finished by app/auth-callback.tsx. The popup flow
    // stranded users on a 404 inside the popup — the code that posts the result
    // back to the opener only loads with the login screen, and Google's
    // cross-origin-opener policy can sever window.opener anyway.
    if (Platform.OS === 'web') {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth-callback` },
      });
      if (error) return { ok: false, error: error.message };
      return { ok: false, cancelled: true }; // the page is navigating to Google
    }


    // Native Google sheet (shows "Grabsty", not the Supabase domain). Needs the
    // native module, so Expo Go falls through to the browser flow below.
    const native = await nativeGoogle();
    if (native) return native;

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

    // PKCE (only if the client is switched to flowType 'pkce'): exchange ?code.
    const code = Linking.parse(res.url).queryParams?.code;
    if (typeof code === 'string' && code) {
      const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
      if (exErr) return { ok: false, error: exErr.message };
      capture('signed_in', { method: 'google' });
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
        capture('signed_in', { method: 'google' });
        return { ok: true };
      }
    }
    return { ok: false, error: 'No session returned from Google' };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Google sign-in failed' };
  }
}
