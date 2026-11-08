// Google One Tap (web): signed-out visitors who are signed into Google get a
// "Continue as …" prompt; returning users are signed in automatically
// (auto_select). The Google ID token is exchanged for a Supabase session via
// signInWithIdToken, so this uses the same Google provider as lib/oauth.ts.
//
// Needs EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID (the Web client's ID — public, not the
// secret) and the site's origin under that client's Authorized JavaScript
// origins. No ID → renders nothing. Phones would need a native Credential
// Manager module, so they keep the regular Google button.
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { usePathname } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { capture } from '@/lib/analytics';

const CLIENT_ID = (process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '').trim();

declare const google: any;

let gsi: Promise<void> | null = null;
function loadGsi(): Promise<void> {
  gsi ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gsi = null;
      reject(new Error('Google sign-in script failed to load'));
    };
    document.head.appendChild(s);
  });
  return gsi;
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Web: draws Google's own button into `el` (the login screen lays it invisibly
 * over its styled button). Google's popup then names Grabsty instead of the
 * Supabase domain the redirect flow shows. Resolves false when unavailable,
 * so the caller keeps the redirect flow.
 */
export async function renderGoogleWebButton(
  el: HTMLElement,
  onResult: (r: { ok: true } | { ok: false; error: string }) => void,
): Promise<boolean> {
  if (Platform.OS !== 'web' || !CLIENT_ID) return false;
  await loadGsi();
  const nonce = crypto.randomUUID();
  google.accounts.id.initialize({
    client_id: CLIENT_ID,
    nonce: await sha256Hex(nonce),
    itp_support: true,
    callback: async ({ credential }: { credential: string }) => {
      const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: credential, nonce });
      if (error) return onResult({ ok: false, error: error.message });
      capture('signed_in', { method: 'google' });
      onResult({ ok: true });
    },
  });
  google.accounts.id.renderButton(el, {
    theme: 'outline',
    size: 'large',
    text: 'continue_with',
    width: Math.min(400, Math.max(200, Math.round(el.clientWidth))),
  });
  return true;
}

export function GoogleOneTap() {
  const { session, loading } = useAuth();
  const pathname = usePathname();
  // Not over the sign-in callback / password reset screens.
  const skip = Platform.OS !== 'web' || !CLIENT_ID || loading || !!session || pathname.startsWith('/auth');

  useEffect(() => {
    if (skip) return;
    let cancelled = false;
    (async () => {
      await loadGsi();
      if (cancelled) return;
      // Google signs the hash into the ID token; Supabase checks the raw value
      // against it, so a token captured elsewhere can't be replayed here.
      const nonce = crypto.randomUUID();
      google.accounts.id.initialize({
        client_id: CLIENT_ID,
        nonce: await sha256Hex(nonce),
        auto_select: true,
        use_fedcm_for_prompt: true,
        itp_support: true,
        callback: async ({ credential }: { credential: string }) => {
          const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: credential, nonce });
          if (error) console.warn('[one-tap] sign-in failed', error.message);
          else capture('signed_in', { method: 'google_one_tap' });
        },
      });
      if (!cancelled) google.accounts.id.prompt();
    })().catch((e) => console.warn('[one-tap]', e?.message ?? e));
    return () => {
      cancelled = true;
      if (typeof google !== 'undefined') google.accounts.id.cancel();
    };
  }, [skip]);

  return null;
}
