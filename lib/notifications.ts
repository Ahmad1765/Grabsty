// Push notification wiring. Every entry point here is safe to call
// unconditionally: on web, on a simulator, before `eas init`, and while signed
// out. Callers should never have to guard.
//
// Two things this module deliberately does NOT do:
//   • Never prompts on cold launch. The OS permission dialog is one-shot — a
//     user who declines it can only be recovered via system settings — so the
//     ask is deferred to a moment where the value is obvious (opening a
//     conversation) or explicit (the settings toggle).
//   • Never trusts the client to notify anyone. Registration only records THIS
//     device's token; sends are triggered by committed row changes and fanned
//     out by the `send-push` edge function under the service role.
//
// Expo Go caveat: remote push does not work in Expo Go on Android from SDK 53
// onward — `getExpoPushTokenAsync` fails there by design. Everything below
// degrades to a warning, so Expo Go stays usable; a development build is
// required to actually receive a push. See PUSH_NOTIFICATIONS.md.

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { routeForNotificationData } from '@/lib/notificationRouting';
import {
  browserLabel,
  currentSubscription,
  subscribe as subscribeWeb,
  subscriptionKeys,
  webPermission,
  webPushSupported,
} from '@/lib/webPush';

const PROMPTED_KEY = 'push_prompted';

/** Expo push (iOS/Android). Browsers go through lib/webPush.ts instead. */
const SUPPORTED = Platform.OS === 'ios' || Platform.OS === 'android';
const IS_WEB = Platform.OS === 'web';

/** Can this device receive push at all? Drives whether Settings shows the toggle. */
export function pushSupported(): boolean {
  return SUPPORTED || (IS_WEB && webPushSupported());
}

/** Browser: subscribe (permission already granted) and store the subscription. */
async function registerWeb(userId: string): Promise<boolean> {
  if (!userId || webPermission() !== 'granted') return false;
  try {
    const sub = await subscribeWeb();
    const keys = sub ? subscriptionKeys(sub) : null;
    if (!sub || !keys) return false;
    const { error } = await supabase.rpc('register_web_push', {
      p_endpoint: sub.endpoint,
      p_p256dh: keys.p256dh,
      p_auth: keys.auth,
      p_device_name: browserLabel(),
    });
    if (error) {
      console.warn('[push] register_web_push failed', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[push] web registration failed', e);
    return false;
  }
}

/**
 * getExpoPushTokenAsync needs the EAS project id to address the device. It is
 * resolved from the same `extra` block the rest of the app reads, so this stays
 * a no-op (with a warning) rather than a crash on a project that has not run
 * `eas init`.
 */
function projectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? null;
}

/**
 * Foreground presentation + the Android notification channel. Android will not
 * show a heads-up banner without a channel of high importance, so this is not
 * optional decoration. Call once at startup.
 */
export function configureNotifications(): void {
  if (!SUPPORTED) return;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === 'android') {
    // `channelId: 'default'` in the edge function's Expo payload refers to this.
    Notifications.setNotificationChannelAsync('default', {
      name: 'Messages & sales',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    }).catch((e) => console.warn('[push] channel setup failed', e));
  }
}

/** Current OS permission status, without ever prompting. */
export async function getPermissionStatus(): Promise<Notifications.PermissionStatus | null> {
  if (!SUPPORTED) return null;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status;
  } catch (e) {
    console.warn('[push] getPermissions failed', e);
    return null;
  }
}

/**
 * Register this device's token against the signed-in user. Assumes permission
 * is already granted — it never prompts. Safe to call on every sign-in.
 */
export async function registerForPush(userId: string): Promise<boolean> {
  if (IS_WEB) return registerWeb(userId);
  if (!SUPPORTED || !userId) return false;
  // A simulator/emulator cannot receive a remote push and returns no token.
  if (!Device.isDevice) return false;

  const id = projectId();
  if (!id) {
    console.warn('[push] no EAS projectId in expoConfig.extra — skipping registration');
    return false;
  }

  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return false;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    if (!token) return false;

    const { error } = await supabase.rpc('register_device', {
      p_token: token,
      p_platform: Platform.OS,
      p_device_name: Device.deviceName ?? null,
    });
    if (error) {
      console.warn('[push] register_device failed', error.message);
      return false;
    }
    lastToken = token;
    return true;
  } catch (e) {
    // Expo Go on Android lands here from SDK 53 onward, as do transient
    // FCM/APNs registration failures. Neither is worth interrupting the user.
    console.warn('[push] registration failed', e);
    return false;
  }
}

/**
 * Ask for permission (if not already decided), then register. Returns the
 * resulting status so callers can distinguish "denied" — which needs a trip to
 * system settings — from a plain failure.
 */
export async function ensurePermissionAndRegister(
  userId: string,
): Promise<{ granted: boolean; blocked: boolean }> {
  if (IS_WEB) {
    if (!webPushSupported()) return { granted: false, blocked: false };
    try {
      // Browsers only show the prompt from a user gesture (the Settings toggle),
      // and once denied only the site settings can undo it.
      let permission = Notification.permission;
      if (permission === 'default') permission = await Notification.requestPermission();
      if (permission !== 'granted') return { granted: false, blocked: permission === 'denied' };
      return { granted: await registerWeb(userId), blocked: false };
    } catch (e) {
      console.warn('[push] web permission request failed', e);
      return { granted: false, blocked: false };
    }
  }
  if (!SUPPORTED) return { granted: false, blocked: false };
  try {
    const current = await Notifications.getPermissionsAsync();
    let status = current.status;
    // Only prompt when the user has not answered yet. Once denied, iOS will
    // not show the dialog again — `canAskAgain` tells us to deep-link instead.
    if (status !== 'granted' && current.canAskAgain) {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') {
      return { granted: false, blocked: !current.canAskAgain };
    }
    await registerForPush(userId);
    return { granted: true, blocked: false };
  } catch (e) {
    console.warn('[push] permission request failed', e);
    return { granted: false, blocked: false };
  }
}

// Remembered so unregisterThisDevice() can delete the right row without a
// second round-trip to the OS. Falls back to asking Expo when unset.
let lastToken: string | null = null;

/**
 * Remove THIS device's token. Must run while the user is still signed in — the
 * owner-only DELETE policy is evaluated against auth.uid(), so calling it after
 * signOut() silently deletes nothing.
 */
export async function unregisterThisDevice(): Promise<void> {
  if (IS_WEB) {
    try {
      const sub = await currentSubscription();
      if (!sub) return;
      const { error } = await supabase.from('user_devices').delete().eq('expo_push_token', sub.endpoint);
      if (error) console.warn('[push] unregister failed', error.message);
      await sub.unsubscribe();
    } catch (e) {
      console.warn('[push] web unregister failed', e);
    }
    return;
  }
  if (!SUPPORTED) return;
  try {
    let token = lastToken;
    if (!token) {
      const id = projectId();
      if (!id || !Device.isDevice) return;
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') return;
      token = (await Notifications.getExpoPushTokenAsync({ projectId: id })).data;
    }
    if (!token) return;
    const { error } = await supabase
      .from('user_devices')
      .delete()
      .eq('expo_push_token', token);
    if (error) console.warn('[push] unregister failed', error.message);
    lastToken = null;
  } catch (e) {
    console.warn('[push] unregister failed', e);
  }
}

/**
 * Is this device currently set up to receive pushes? Both halves have to be
 * true: the OS permission AND a row in user_devices. Checking only the
 * permission would show the Settings toggle as ON after the user turned it off,
 * because revoking our registration does not revoke the OS grant.
 */
export async function isThisDeviceRegistered(): Promise<boolean> {
  if (IS_WEB) {
    if (webPermission() !== 'granted') return false;
    const sub = await currentSubscription();
    if (!sub) return false;
    const { data, error } = await supabase
      .from('user_devices')
      .select('id')
      .eq('expo_push_token', sub.endpoint)
      .maybeSingle();
    return !error && !!data;
  }
  if (!SUPPORTED || !Device.isDevice) return false;
  const id = projectId();
  if (!id) return false;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return false;
    const token = lastToken ?? (await Notifications.getExpoPushTokenAsync({ projectId: id })).data;
    if (!token) return false;
    lastToken = token;
    // RLS scopes this to the caller's own rows, so a hit means THIS user has
    // THIS device registered.
    const { data, error } = await supabase
      .from('user_devices')
      .select('id')
      .eq('expo_push_token', token)
      .maybeSingle();
    if (error) return false;
    return !!data;
  } catch {
    return false;
  }
}

/** Has the contextual soft-ask already been shown once? */
export async function hasPromptedForPush(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(PROMPTED_KEY)) === '1';
  } catch {
    // Storage unavailable — treat as "already asked" so a broken read can never
    // turn into a repeated permission prompt.
    return true;
  }
}

/** Browser has notifications blocked for this site: only its site settings can undo that. */
export function webPushBlocked(): boolean {
  return IS_WEB && webPermission() === 'denied';
}

const BANNER_DISMISSED_KEY = 'push_banner_dismissed';

/** The Activity "Turn on notifications" card, once closed, stays closed on this device. */
export async function isPushBannerDismissed(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(BANNER_DISMISSED_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function dismissPushBanner(): Promise<void> {
  try {
    await AsyncStorage.setItem(BANNER_DISMISSED_KEY, '1');
  } catch {
    // Non-fatal: the card shows again next visit.
  }
}

export async function markPromptedForPush(): Promise<void> {
  try {
    await AsyncStorage.setItem(PROMPTED_KEY, '1');
  } catch {
    // Non-fatal: worst case the soft-ask appears once more.
  }
}

/**
 * The contextual soft-ask. Prompts at most once ever, and only when the user
 * has not already answered the OS dialog.
 */
export async function maybeSoftAskForPush(userId: string): Promise<void> {
  if (!SUPPORTED || !userId) return;
  const status = await getPermissionStatus();
  if (status !== 'undetermined') return;
  if (await hasPromptedForPush()) return;
  await markPromptedForPush();
  await ensurePermissionAndRegister(userId);
}

// ── Taps ────────────────────────────────────────────────────────────────────

function navigateTo(data: unknown): void {
  const target = routeForNotificationData(data);
  if (!target) return;
  // push, not replace: the user came from outside the app, so leaving a back
  // step to the tab they were last on is the expected behaviour.
  router.push({ pathname: target.pathname as never, params: target.params as never });
}

let listenerAttached = false;
let handledColdStart = false;

/**
 * Route notification taps. Handles both cases:
 *   • App running (foreground or background) → the response listener fires.
 *   • App terminated → the tap launches the process, and the response is only
 *     available from getLastNotificationResponseAsync(). That value persists
 *     across mounts, so it is consumed exactly once (`handledColdStart`) or a
 *     remount would re-navigate to a stale notification.
 *
 * Returns a cleanup function. Idempotent — calling twice attaches one listener.
 */
export function attachResponseListener(): () => void {
  if (!SUPPORTED || listenerAttached) return () => {};
  listenerAttached = true;

  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    navigateTo(response.notification.request.content.data);
  });

  if (!handledColdStart) {
    handledColdStart = true;
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!response) return;
        // The router needs a mounted navigator before it can accept a push.
        setTimeout(() => navigateTo(response.notification.request.content.data), 0);
      })
      .catch((e) => console.warn('[push] cold-start response failed', e));
  }

  return () => {
    sub.remove();
    listenerAttached = false;
  };
}
