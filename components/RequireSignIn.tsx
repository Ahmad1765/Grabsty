import { useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { Redirect, useGlobalSearchParams, usePathname } from 'expo-router';
import { useAuth } from '@/lib/auth';

/** Where a guest was going; auth-callback reads it after a Google redirect sign-in. */
export const RETURN_TO_KEY = 'grabsty.returnTo';

// Signed-in screens: a guest goes to sign-in and comes back here after (same
// path and query, e.g. /sell?id=...). Someone who signs out on the screen is
// not sent to sign-in: the screen's own sign-out navigation wins.
export function RequireSignIn({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const [wasSignedIn, setWasSignedIn] = useState(false);
  if (user && !wasSignedIn) setWasSignedIn(true);

  if (loading) return null;
  if (!user) {
    if (wasSignedIn) return null;
    const qs = new URLSearchParams(
      Object.entries(params).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v]] : [])),
    ).toString();
    const next = qs ? `${pathname}?${qs}` : pathname;
    if (Platform.OS === 'web') {
      try {
        sessionStorage.setItem(RETURN_TO_KEY, next);
      } catch {
        // storage blocked: the password path still has ?next
      }
    }
    return <Redirect href={{ pathname: '/auth/login', params: { next } }} />;
  }
  return <>{children}</>;
}

/** Called once a sign-in has used the return path, so a later sign-in doesn't reuse it. */
export function forgetReturnTo() {
  if (Platform.OS !== 'web') return;
  try {
    sessionStorage.removeItem(RETURN_TO_KEY);
  } catch {
    // nothing stored
  }
}
