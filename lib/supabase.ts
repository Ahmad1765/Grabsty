import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { secureSessionStorage } from "@/lib/secureSessionStorage";

// Resolve env in this order:
//   1) expoConfig.extra (embedded at config-load time via app.config.js)
//   2) process.env.EXPO_PUBLIC_* (inlined at bundle time — can be stale)
// The extra-first order means a fresh `expo start` always picks up the
// real .env.local values, even if Metro has a cached bundle from before.
const extra = (Constants.expoConfig?.extra ?? {}) as {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

const supabaseUrl = (
  extra.supabaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? ""
).trim();
const supabaseAnonKey = (
  extra.supabaseAnonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ""
).trim();

if (!supabaseUrl || !supabaseAnonKey) {
  const msg =
    "[Supabase] Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. " +
    "Add them to .env.local at the project root, then restart Metro with " +
    "`npx expo start --clear` so the values are re-embedded into the bundle.";
  // Hard-fail in dev so a misconfigured environment can't silently ship a
  // bundle pointed at placeholder.supabase.co.
  if (__DEV__) {
    throw new Error(msg);
  } else {
    console.warn(msg);
  }
}

// Hard request timeout for every Supabase HTTP call. On web (especially
// Chrome with extensions / service workers / flaky CORS preflights) the
// underlying fetch can wedge indefinitely — the JS client just sits on an
// unresolved promise and the UI hangs. By installing a custom `fetch` here
// we get an AbortController-backed ceiling on EVERY request the SDK makes
// (REST, RPC, storage, auth). When the ceiling fires the promise rejects
// with AbortError, callers see an error instead of an eternal pending state,
// and the toast/timeout paths can run.
const REQUEST_TIMEOUT_MS = 12_000;

function timeoutFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const externalSignal = init?.signal;
  let onExternalAbort: (() => void) | undefined;
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      onExternalAbort = () => controller.abort();
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as any).url || '';
  const isStorageUpload = urlStr.includes('/storage/v1/object');

  const timeoutMs = isStorageUpload ? 600000 : REQUEST_TIMEOUT_MS; // 10 minutes for storage uploads
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(input as any, { ...init, signal: controller.signal }).finally(() => {
    clearTimeout(timer);
    if (externalSignal && onExternalAbort) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  });
}

// Web lock with bounded acquire + graceful fallback.
//
// supabase-js's auth client serializes getSession / setSession / token
// refresh through a global lock — on web that's `navigator.locks.request`
// keyed by storage. The lock CAN wedge:
//   - another tab of the same app crashed mid-refresh,
//   - a service worker still holding it after page navigation,
//   - a browser extension that hooked storage,
//   - or a previous in-page refresh that aborted without releasing.
// When that happens, every subsequent supabase.from()/.rpc()/.auth call
// queues behind the lock and never executes — the "skeleton until I refresh
// the browser" bug.
//
// The previous implementation (passthroughLock) sidestepped the queue
// entirely by NEVER holding the lock. That fixed the wedge but reintroduced
// the underlying race the lock exists to prevent — two concurrent token
// refreshes across tabs can hit `refresh_token_already_used` and force one
// tab to sign out.
//
// This implementation does both things:
//   1. Tries to acquire the real `navigator.locks` lock with a hard ceiling
//      (LOCK_ACQUIRE_CEILING_MS, capped well below any UX timeout).
//   2. If the ceiling fires, aborts the wait and runs the function
//      unguarded. The caller still completes — at worst we burn one extra
//      token refresh.
//
// On native or in environments without `navigator.locks` (legacy browsers,
// SSR), we fall through to bare execution since there's no cross-tab race
// to worry about there.
const LOCK_ACQUIRE_CEILING_MS = 10_000;

async function boundedLock<R>(
  name: string,
  acquireTimeout: number,
  fn: () => Promise<R>,
): Promise<R> {
  if (
    typeof navigator === 'undefined' ||
    typeof navigator.locks?.request !== 'function'
  ) {
    return fn();
  }

  // If acquireTimeout is not positive (e.g. -1 sentinel from @supabase/auth-js for indefinite wait),
  // use the bounded ceiling so navigator.locks has time to acquire normally.
  const ceiling =
    typeof acquireTimeout === 'number' && acquireTimeout > 0
      ? Math.min(acquireTimeout, LOCK_ACQUIRE_CEILING_MS)
      : LOCK_ACQUIRE_CEILING_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ceiling);

  try {
    // navigator.locks.request honours AbortSignal — when the timer fires it
    // cancels the wait WITHOUT killing the lock holder, so the original
    // process is free to finish whenever it does, and we just sidestep it.
    return await navigator.locks.request(
      name,
      { signal: controller.signal },
      async () => fn(),
    );
  } catch (err: any) {
    const isAbort =
      err?.name === 'AbortError' ||
      err?.code === 20 /* DOMException.ABORT_ERR */ ||
      String(err?.message ?? '').toLowerCase().includes('aborted');
    if (!isAbort) throw err;
    // Lock wedged on another tab/extension/service worker. Run unguarded
    // — duplicate token refresh is worth it to keep the UI responsive.
    return fn();
  } finally {
    clearTimeout(timer);
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Keychain/Keystore on phones; localStorage on web (lib/secureSessionStorage).
    storage: Platform.OS === 'web' ? AsyncStorage : secureSessionStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    lock: boundedLock,
  },
  global: {
    fetch: timeoutFetch,
  },
});
