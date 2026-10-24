// supabase/functions/send-push/index.ts
// Deploy: supabase functions deploy send-push --no-verify-jwt
// Inherits: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (already set by Supabase)
//
// Wiring: push.notify_send_push() triggers on
//   messages AFTER INSERT
//   messages AFTER UPDATE OF offer_status
//   orders   AFTER INSERT
//   → POST https://<project-ref>.supabase.co/functions/v1/send-push
//     header x-webhook-secret: <shared secret>
//
// Auth model: verify_jwt is OFF because a database trigger cannot mint a
// Supabase user JWT. Instead every request must carry the shared secret, which
// is checked before any other database access — same shape as stripe-webhook's
// signature check.
//
// The shared secret lives in Supabase Vault (`push_webhook_secret`), read by
// push.notify_send_push() at trigger time. This side verifies it through
// public.push_webhook_secret_matches(), which only answers yes/no and is
// executable by the service role alone — the secret itself never leaves the
// database. The optional `PUSH_WEBHOOK_SECRET` env var still works as a fast
// path, but a stale copy no longer breaks delivery.
//
// Why the trigger is a committed row change and not a client call: the client
// is never trusted to send a notification to another user. Only rows that
// actually landed in the database can produce a push.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  buildPushNotifications,
  type ConversationLookup,
  type Lookups,
  type PushNotification,
  type WebhookPayload,
} from './mapper.ts';
import {
  buildWebPushPayload,
  isAllowedWebPushEndpoint,
  isExpiredSubscriptionStatus,
} from './webPush.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
// Expo accepts up to 100 messages per request.
const EXPO_BATCH_SIZE = 100;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

// Constant-time comparison so a wrong secret cannot be discovered byte by byte
// from response timing.
function timingSafeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

type Admin = ReturnType<typeof createClient>;

/**
 * The trigger sends the Vault secret. Vault is the source of truth: the DB
 * answers whether the header matches it (yes/no only, service-role only), so
 * a stale or missing PUSH_WEBHOOK_SECRET env var can no longer silently 401
 * every push, as it did from 2026-10-14. The env var, when set and equal, is
 * accepted without the round trip.
 */
async function isTrustedCaller(admin: Admin, provided: string): Promise<boolean> {
  const envSecret = Deno.env.get('PUSH_WEBHOOK_SECRET');
  if (envSecret && timingSafeEqual(provided, envSecret)) return true;
  const { data, error } = await admin.rpc('push_webhook_secret_matches', { p_secret: provided });
  if (error) {
    console.error('[send-push] secret check failed', error.message);
    return false;
  }
  return data === true;
}

/**
 * Fetch everything the mapper needs for this payload. Kept here (impure) so
 * mapper.ts stays unit-testable.
 */
async function loadLookups(admin: Admin, payload: WebhookPayload): Promise<Lookups> {
  const record = payload.record ?? {};

  if (payload.table === 'messages') {
    const conversationId = record.conversation_id as string | undefined;
    const senderId = record.sender_id as string | undefined;
    if (!conversationId) return {};

    const [{ data: conv }, { data: sender }] = await Promise.all([
      admin
        .from('conversations')
        .select('id, buyer_id, seller_id')
        .eq('id', conversationId)
        .maybeSingle(),
      senderId
        ? admin
            .from('profiles')
            .select('username, full_name')
            .eq('id', senderId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const p = sender as { username?: string | null; full_name?: string | null } | null;
    return {
      conversation: (conv as ConversationLookup | null) ?? null,
      senderName: p?.username ?? p?.full_name ?? null,
    };
  }

  if (payload.table === 'orders') {
    const listingId = record.listing_id as string | undefined;
    if (!listingId) return {};
    const { data: listing } = await admin
      .from('listings')
      .select('title')
      .eq('id', listingId)
      .maybeSingle();
    return { listingTitle: (listing as { title?: string | null } | null)?.title ?? null };
  }

  return {};
}

/**
 * Claim the idempotency keys for this batch. Returns only the notifications
 * whose key was newly inserted — a webhook redelivery loses the race against
 * the unique constraint and is dropped here rather than pushed twice.
 */
async function claimUnsent(
  admin: Admin,
  notifications: PushNotification[],
): Promise<PushNotification[]> {
  if (notifications.length === 0) return [];
  const { data, error } = await admin
    .from('push_deliveries')
    .upsert(
      notifications.map((n) => ({
        idempotency_key: n.idempotencyKey,
        recipient_user_id: n.userId,
      })),
      { onConflict: 'idempotency_key', ignoreDuplicates: true },
    )
    .select('idempotency_key');

  if (error) {
    // Throw rather than return [] — sending nothing AND reporting success would
    // drop the notification permanently. Bubbling up gives a 500, which asks
    // Supabase to redeliver; the claim is idempotent so a retry is safe.
    throw new Error(`idempotency claim: ${error.message}`);
  }
  const claimed = new Set(
    (data ?? []).map((r) => (r as { idempotency_key: string }).idempotency_key),
  );
  return notifications.filter((n) => claimed.has(n.idempotencyKey));
}

type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  data: Record<string, string>;
  sound: 'default';
  channelId: 'default';
};

type Device = {
  user_id: string;
  expo_push_token: string;
  platform: string | null;
  web_push_keys: { p256dh?: string; auth?: string } | null;
};

// Web push signing. The public half is also in lib/webPush.ts (it is public by
// design); the private half is a function secret. Unset keys disable web push
// only — native delivery is unaffected.
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');
const webPushReady = !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);

// Loaded on first use, so a problem with the library can only ever affect web
// delivery: Expo (native) sends never wait on it.
type WebPushLib = {
  setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
  sendNotification(sub: unknown, payload: string, options: Record<string, unknown>): Promise<unknown>;
};
let webpushLib: Promise<WebPushLib> | null = null;
function loadWebPush(): Promise<WebPushLib> {
  webpushLib ??= import('npm:web-push@3.6.7').then((m) => {
    const lib = (m.default ?? m) as WebPushLib;
    lib.setVapidDetails(
      Deno.env.get('VAPID_SUBJECT') ?? 'mailto:support@grabsty.com',
      VAPID_PUBLIC_KEY!,
      VAPID_PRIVATE_KEY!,
    );
    return lib;
  });
  return webpushLib;
}

/**
 * Send to one browser. Returns true when the subscription is gone for good
 * (404/410) so the caller prunes it, like Expo's DeviceNotRegistered.
 */
async function sendWeb(device: Device, n: PushNotification): Promise<boolean> {
  const keys = device.web_push_keys;
  if (!webPushReady || !keys?.p256dh || !keys?.auth) return false;
  if (!isAllowedWebPushEndpoint(device.expo_push_token)) return true;
  try {
    const webpush = await loadWebPush();
    await webpush.sendNotification(
      { endpoint: device.expo_push_token, keys: { p256dh: keys.p256dh, auth: keys.auth } },
      JSON.stringify(buildWebPushPayload(n)),
      { TTL: 60 * 60 * 24, urgency: 'high' },
    );
    return false;
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    if (isExpiredSubscriptionStatus(status)) return true;
    // Anything else (rate limit, push service hiccup) is transient. Not thrown:
    // one browser failing must not cost the user's other devices their push.
    console.warn('[send-push] web push failed', status ?? e);
    return false;
  }
}

/** Token groups from Expo's PUSH_TOO_MANY_EXPERIENCE_IDS error, else null. */
function mixedProjectGroups(errorBody: string): string[][] | null {
  try {
    const err = (JSON.parse(errorBody) as {
      errors?: { code?: string; details?: Record<string, string[]> }[];
    }).errors?.find((e) => e.code === 'PUSH_TOO_MANY_EXPERIENCE_IDS');
    return err?.details ? Object.values(err.details).filter((g) => g.length > 0) : null;
  } catch {
    return null;
  }
}

/** POST one batch and return the tokens Expo reported as unregistered. */
async function sendBatch(batch: ExpoMessage[]): Promise<string[]> {
  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
    },
    body: JSON.stringify(batch),
  });

  if (!res.ok) {
    const text = await res.text();
    // Expo refuses a request whose tokens belong to different Expo projects
    // (e.g. a token left over from before the Carrinex -> Grabsty rename), and
    // the whole batch fails with it. Its error lists the tokens per project:
    // resend each group on its own so one stale install can't block the rest.
    const groups = mixedProjectGroups(text);
    if (groups && groups.length > 1) {
      const dead: string[] = [];
      for (const tokens of groups) {
        dead.push(...(await sendBatch(batch.filter((m) => tokens.includes(m.to)))));
      }
      return dead;
    }
    throw new Error(`Expo push API ${res.status}: ${text}`);
  }

  const body = (await res.json()) as {
    data?: { status: string; details?: { error?: string } }[];
  };
  const dead: string[] = [];
  (body.data ?? []).forEach((ticket, i) => {
    if (ticket.status !== 'error') return;
    const reason = ticket.details?.error;
    console.warn('[send-push] ticket error', reason ?? 'unknown');
    // The device uninstalled the app or the token rotated. Anything else
    // (rate limit, message too big) is not the token's fault — leave it.
    if (reason === 'DeviceNotRegistered') dead.push(batch[i].to);
  });
  return dead;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const provided = req.headers.get('x-webhook-secret');
  if (!provided || !(await isTrustedCaller(admin, provided))) {
    return json({ error: 'unauthorized' }, 401);
  }

  let payload: WebhookPayload;
  try {
    payload = (await req.json()) as WebhookPayload;
  } catch {
    // Malformed body — a retry cannot help, so don't ask for one.
    return json({ error: 'invalid json' }, 200);
  }

  try {
    const lookups = await loadLookups(admin, payload);
    const notifications = buildPushNotifications(payload, lookups);
    if (notifications.length === 0) return json({ sent: 0, reason: 'not in scope' });

    const unsent = await claimUnsent(admin, notifications);
    if (unsent.length === 0) return json({ sent: 0, reason: 'already delivered' });

    // One token lookup covering every recipient in this payload (at most two).
    const recipientIds = [...new Set(unsent.map((n) => n.userId))];
    const { data: devices, error: devErr } = await admin
      .from('user_devices')
      .select('user_id, expo_push_token, platform, web_push_keys')
      .in('user_id', recipientIds);
    if (devErr) throw new Error(`token lookup: ${devErr.message}`);

    const tokensByUser = new Map<string, string[]>();
    const webByUser = new Map<string, Device[]>();
    for (const row of (devices ?? []) as Device[]) {
      if (row.platform === 'web') {
        webByUser.set(row.user_id, [...(webByUser.get(row.user_id) ?? []), row]);
        continue;
      }
      const list = tokensByUser.get(row.user_id) ?? [];
      list.push(row.expo_push_token);
      tokensByUser.set(row.user_id, list);
    }

    // Browsers: one encrypted request per subscription.
    const webSends = unsent.flatMap((n) =>
      (webByUser.get(n.userId) ?? []).map(async (d) => ((await sendWeb(d, n)) ? d.expo_push_token : null)),
    );
    const deadWeb = (await Promise.all(webSends)).filter((t): t is string => !!t);

    const messages: ExpoMessage[] = unsent.flatMap((n) =>
      (tokensByUser.get(n.userId) ?? []).map((to) => ({
        to,
        title: n.title,
        body: n.body,
        data: n.data,
        sound: 'default' as const,
        channelId: 'default' as const,
      })),
    );
    if (messages.length === 0 && webSends.length === 0) {
      // Recipient has no registered device — nothing to do, and a retry would
      // not change that.
      return json({ sent: 0, reason: 'no devices' });
    }

    const dead: string[] = [...deadWeb];
    for (let i = 0; i < messages.length; i += EXPO_BATCH_SIZE) {
      dead.push(...(await sendBatch(messages.slice(i, i + EXPO_BATCH_SIZE))));
    }

    if (dead.length > 0) {
      const { error } = await admin
        .from('user_devices')
        .delete()
        .in('expo_push_token', dead);
      if (error) console.error('[send-push] prune failed', error.message);
    }

    return json({ sent: messages.length + webSends.length, pruned: dead.length });
  } catch (e) {
    // 500 asks Supabase to retry, which is right for a transient Expo/network
    // failure. The idempotency claim above means a retry that arrives after a
    // partial success will not re-push the same notification.
    console.error('[send-push] failed', e);
    return json({ error: 'send failed' }, 500);
  }
});
