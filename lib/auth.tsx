import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User as AuthUser } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { queryClient } from '@/lib/queryClient';
import { setSentryUser } from '@/lib/sentry';
import { identify, resetIdentity } from '@/lib/analytics';
import { registerForPush, unregisterThisDevice } from '@/lib/notifications';
import type { User as Profile } from '@/types';

type AuthState = {
  session: Session | null;
  user: AuthUser | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    console.warn('[auth] loadProfile error', error.message);
    return null;
  }
  return (data as Profile | null) ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Tie Sentry and analytics events to the current user (id only, plus non-PII
  // profile fields for analytics). Cleared automatically on sign-out.
  useEffect(() => {
    const uid = session?.user?.id ?? null;
    setSentryUser(uid);
    if (uid) {
      identify(uid, {
        username: profile?.username,
        is_verified: profile?.is_verified ?? false,
      });
    } else {
      resetIdentity();
    }
  }, [session?.user?.id, profile?.username, profile?.is_verified]);

  // getSession() and the INITIAL_SESSION event both load the profile at startup;
  // concurrent loads for the same user share one request instead of two.
  const profileInFlight = useRef<{ userId: string; promise: Promise<void> } | null>(null);
  const fetchProfileWithRetry = (userId: string): Promise<void> => {
    if (profileInFlight.current?.userId === userId) return profileInFlight.current.promise;
    const promise = (async () => {
      let p = await loadProfile(userId);
      if (!p) {
        // The handle_new_user trigger occasionally lags right after signup.
        await new Promise((r) => setTimeout(r, 600));
        p = await loadProfile(userId);
      }
      if (mounted.current) setProfile(p);
    })().finally(() => {
      if (profileInFlight.current?.promise === promise) profileInFlight.current = null;
    });
    profileInFlight.current = { userId, promise };
    return promise;
  };

  useEffect(() => {
    let active = true;

    supabase.auth.getSession()
      .then(async ({ data }) => {
        if (!active) return;
        setSession(data.session ?? null);
        if (data.session?.user?.id) {
          await fetchProfileWithRetry(data.session.user.id);
        }
      })
      .catch((err) => {
        console.warn('[auth] getSession failed', err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (!mounted.current) return;
      setSession(next ?? null);
      if (next?.user?.id) {
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
          // Defer to avoid deadlocking on Supabase's internal auth lock.
          const uid = next.user.id;
          setTimeout(() => {
            if (mounted.current) fetchProfileWithRetry(uid).catch(() => {});
            // Silent re-registration: only ever writes a token when the user has
            // ALREADY granted permission, so this never surfaces a prompt. It
            // has to run on every sign-in because Expo push tokens rotate and a
            // device can change hands between accounts.
            registerForPush(uid).catch(() => {});
          }, 0);
        }
      } else {
        setProfile(null);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Stable identity across profile refetches — refreshProfile only needs the
  // user id, not the current profile/session objects. Previously this was
  // defined inline inside the `value` useMemo below, so calling it (which
  // sets a new `profile` object) changed one of that memo's own deps, which
  // gave refreshProfile a new identity, which re-triggered any effect keyed
  // on it (e.g. profile.tsx's useFocusEffect) — an infinite refetch loop.
  //
  // The id is narrowed to a local before the callback rather than read as
  // `session.user.id` inside a body whose dep list says `session?.user?.id`.
  // That mismatch made React Compiler infer the whole `session` object as the
  // real dependency ("Inferred less specific property than source") and bail out
  // of AuthProvider — which wraps the entire app. Depending on a plain string
  // keeps exactly the stability guarantee described above: the identity changes
  // only when the signed-in user changes, never on a profile refetch.
  const sessionUserId = session?.user?.id ?? null;
  const refreshProfile = useCallback(async () => {
    if (sessionUserId) await fetchProfileWithRetry(sessionUserId);
  }, [sessionUserId]);

  const signOut = useCallback(async () => {
    // Drop this device's push token FIRST, while the session still exists: the
    // user_devices DELETE policy is evaluated against auth.uid(), so doing this
    // after signOut() would silently delete nothing and the next owner of the
    // phone would keep receiving this account's notifications. Failure is
    // logged, not fatal — an orphaned token is pruned on the next
    // DeviceNotRegistered ticket from Expo.
    await unregisterThisDevice().catch((e) =>
      console.warn('[auth] push unregister failed', e),
    );
    // Clear local state first so the UI updates immediately. On web,
    // supabase.auth.signOut()'s default global scope calls the server's
    // /logout endpoint, which can hang under Chrome (extensions/SW/CORS)
    // and leave the spinner stuck even though the session is gone.
    if (mounted.current) {
      setSession(null);
      setProfile(null);
    }
    // scope: 'local' wipes the AsyncStorage/localStorage session without
    // a network round-trip. Race with a short timeout as a final safety
    // net so the caller's await never blocks the UI.
    try {
      await Promise.race([
        supabase.auth.signOut({ scope: 'local' }),
        new Promise<void>((resolve) => setTimeout(resolve, 1500)),
      ]);
    } catch (e) {
      console.warn('[auth] signOut error', e);
    }
    // Drop every cached query, and with it the persisted AsyncStorage copy that
    // would otherwise rehydrate one account's data into the next session.
    //
    // Deliberately AFTER the auth call, not before: clearing wakes mounted
    // observers, and doing that while the old token is still valid just refetches
    // the departing user's rows straight back into the cache. By this point
    // `session` is already null, so every user-scoped query is disabled and only
    // the public ones refetch — which is correct, since a signed-out feed is a
    // different feed.
    queryClient.clear();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      refreshProfile,
      signOut,
    }),
    [session, profile, loading, refreshProfile, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
