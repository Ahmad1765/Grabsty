// Centralized Sentry wiring. Keep ALL Sentry surface area in this one module so
// the rest of the app imports thin helpers (captureError / logBreadcrumb /
// setSentryUser) and never talks to the SDK directly. That makes it trivial to
// swap providers later and guarantees we never crash when no DSN is configured.
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// DSN is resolved expoConfig.extra-first (embedded at config-load time via
// app.config.js), falling back to the bundle-inlined env — same precedence the
// supabase client uses, so a fresh `expo start` always picks up .env.local.
const extra = (Constants.expoConfig?.extra ?? {}) as {
  sentryDsn?: string;
  sentryDebug?: string;
};
const dsn = (extra.sentryDsn ?? process.env.EXPO_PUBLIC_SENTRY_DSN ?? '').trim();

// Opt-in switch to send events from a DEV build (expo start). Set
// EXPO_PUBLIC_SENTRY_DEBUG=1 in .env.local + restart with `--clear` to verify
// the Sentry connection locally. Leave it unset normally so dev noise never
// reaches the dashboard.
const debugEnabled =
  (extra.sentryDebug ?? process.env.EXPO_PUBLIC_SENTRY_DEBUG ?? '').trim() === '1';

// A DSN is the only thing that turns reporting on. No DSN → every helper below
// becomes a no-op, so local dev and PR previews stay silent unless you opt in.
export const sentryEnabled = !!dsn;

/**
 * Initialize Sentry. Safe to call unconditionally and exactly once, as early in
 * app startup as possible (before the first render). No-ops without a DSN.
 */
export function initSentry(): void {
  if (!dsn) {
    if (__DEV__) {
      console.warn(
        '[sentry] EXPO_PUBLIC_SENTRY_DSN not set — error reporting disabled. ' +
          'Add it to .env.local to enable crash + error capture.',
      );
    }
    return;
  }

  // Session Replay records a video-like reproduction of the session that led to
  // an error. Mobile replay is native-only — including it on web throws — so we
  // guard by platform. Feedback works everywhere.
  const integrations = [
    Sentry.feedbackIntegration(),
    // Mobile replay is native-only — including it on web throws.
    ...(Platform.OS !== 'web' ? [Sentry.mobileReplayIntegration()] : []),
  ];

  Sentry.init({
    dsn,
    environment: __DEV__ ? 'development' : 'production',
    // Don't ship dev noise to the dashboard — UNLESS EXPO_PUBLIC_SENTRY_DEBUG=1
    // is set so you can verify the connection from a local dev build.
    enabled: !__DEV__ || debugEnabled,
    // SDK-level console logging of what it's sending — only when debugging.
    debug: debugEnabled,
    // Performance tracing: full in dev, sampled in prod to control volume/cost.
    tracesSampleRate: __DEV__ ? 1.0 : 0.2,
    // We attach the user id explicitly via setSentryUser; keep PII off so the
    // SDK never hoovers up IPs / cookies / device identifiers on its own.
    // (The wizard defaults this to true — flip if you want richer context and
    // have the privacy policy to back it.)
    sendDefaultPii: false,
    // Structured logs → Sentry Logs.
    enableLogs: true,
    // Session Replay sampling: 10% of all sessions, 100% of errored ones.
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1,
    integrations,
    // Surface the app version so dashboard issues are grouped by release.
    release: Constants.expoConfig?.version
      ? `grabsty@${Constants.expoConfig.version}`
      : undefined,
  });
}

/** Wrap the root component for native crash + touch-event instrumentation. */
export const wrapWithSentry: typeof Sentry.wrap = (component) =>
  sentryEnabled ? Sentry.wrap(component) : component;

/**
 * Report a caught error. Use this instead of a bare `console.error` in catch
 * blocks so production failures actually reach the dashboard. `context` is
 * attached as extra data to aid triage.
 */
export function captureError(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  if (__DEV__) console.error('[captureError]', error, context ?? '');
  if (!sentryEnabled) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

/** Drop a breadcrumb — the trail of actions leading up to an eventual error. */
export function logBreadcrumb(
  message: string,
  data?: Record<string, unknown>,
): void {
  if (!sentryEnabled) return;
  Sentry.addBreadcrumb({ message, data, level: 'info' });
}

/** Tie subsequent events to the signed-in user. Pass null on sign-out. */
export function setSentryUser(userId: string | null): void {
  if (!sentryEnabled) return;
  Sentry.setUser(userId ? { id: userId } : null);
}

/**
 * Fire a test event to verify the Sentry connection. Returns the event id (or
 * null if Sentry isn't enabled). Wire this to a button while testing, then
 * remove it. RN equivalent of Sentry's web "Break the world" button.
 */
export function sendTestEvent(): string | null {
  if (!sentryEnabled) {
    console.warn('[sentry] sendTestEvent: no DSN configured — nothing sent.');
    return null;
  }
  const id = Sentry.captureException(
    new Error('Sentry test event — connection verified 🎉'),
  );
  // Flush so the event leaves before the JS context can be torn down.
  Sentry.flush().catch(() => {});
  return id;
}
