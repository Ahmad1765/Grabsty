// supabase/functions/stripe-webhook/index.ts
// Deploy: supabase functions deploy stripe-webhook --no-verify-jwt
// Required secrets:
//   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
//   STRIPE_SECRET_KEY — already set for create-checkout-session; secrets are
//   project-wide, so no new value is needed. Used only to refund a duplicate
//   payer (see refundIfOwed).
// Inherits: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (already set by Supabase)
//
// Stripe dashboard → Developers → Webhooks → Add endpoint:
//   https://<project-ref>.supabase.co/functions/v1/stripe-webhook
//   Events: checkout.session.completed
//
// Auth model: verify_jwt is OFF because Stripe cannot send a Supabase JWT.
// Instead every request is authenticated by verifying Stripe's HMAC-SHA256
// signature (Stripe-Signature header) against STRIPE_WEBHOOK_SECRET. Requests
// with a missing/invalid/stale signature are rejected before any DB access.
//
// On checkout.session.completed:
//   1. Insert a row into public.orders (idempotent via unique stripe_session_id).
//   2. Mark the listing sold.
// Writes use the service role key — clients have no write path to orders.
//
// Two buyers can both clear the pre-flight sold check and both pay. The partial
// unique index orders_one_paid_per_listing_idx lets only the first become
// 'paid'; the loser is recorded 'refund_due' and refunded through Stripe here,
// and the function answers 500 until that refund lands so Stripe keeps retrying
// rather than leaving a real charge stranded.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { buildOrder, classifyInsertError } from './order.ts';

const SIGNATURE_TOLERANCE_SECONDS = 300; // 5 min, same default as Stripe SDKs

// Best-effort PostHog capture from the edge function. Never throws — analytics
// must not break the webhook. distinct_id is the buyer so the event ties to the
// same person as the client-side funnel.
async function capturePurchase(distinctId: string, props: Record<string, unknown>) {
  const key = Deno.env.get('POSTHOG_KEY');
  // US region: the project lives there, and the EU host silently drops events.
  const host = Deno.env.get('POSTHOG_HOST') ?? 'https://us.i.posthog.com';
  if (!key) return;
  try {
    await fetch(`${host}/i/v0/e/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        event: 'purchase_completed',
        distinct_id: distinctId,
        properties: props,
      }),
    });
  } catch (e) {
    console.error('[stripe-webhook] posthog capture failed', e);
  }
}

// Give a duplicate payer their money back, then mark the row settled.
//
// Returns false while the money is still owed so the caller can answer 500 and
// let Stripe retry: acknowledging a charge we failed to refund would strand a
// real payment with no further attempt, since the retry's insert conflicts on
// stripe_session_id and would otherwise look like a plain duplicate event.
//
// The Idempotency-Key makes the retry safe — Stripe returns the original refund
// instead of issuing a second one.
async function refundIfOwed(
  db: ReturnType<typeof createClient>,
  sessionId: string,
  paymentIntent: string | null,
): Promise<boolean> {
  const { data: owed, error: lookupErr } = await db
    .from('orders')
    .select('id')
    .eq('stripe_session_id', sessionId)
    .eq('status', 'refund_due')
    .limit(1);
  if (lookupErr) {
    console.error('[stripe-webhook] refund lookup failed', lookupErr);
    return false;
  }
  if (!owed?.length) return true; // nothing owed — an ordinary webhook retry

  const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeSecret || !paymentIntent) {
    console.error('[stripe-webhook] cannot refund', {
      sessionId,
      hasSecret: !!stripeSecret,
      hasPaymentIntent: !!paymentIntent,
    });
    return false;
  }

  const res = await fetch('https://api.stripe.com/v1/refunds', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeSecret}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Idempotency-Key': `refund_${sessionId}`,
    },
    body: new URLSearchParams({ payment_intent: paymentIntent }).toString(),
  });
  if (!res.ok) {
    console.error('[stripe-webhook] refund rejected', res.status, await res.text());
    return false;
  }

  const { error: markErr } = await db
    .from('orders')
    .update({ status: 'refunded' })
    .eq('id', owed[0].id);
  if (markErr) {
    // The money is back with the buyer but the row still reads refund_due.
    // 500 so a retry re-runs this: the Stripe call is idempotent, the update
    // is not destructive, and a stuck refund_due row would otherwise be read
    // as an outstanding debt forever.
    console.error('[stripe-webhook] refunded but failed to mark row', markErr);
    return false;
  }
  return true;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// Constant-time comparison to avoid leaking signature bytes via timing.
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
): Promise<boolean> {
  if (!header) return false;

  const parts = new Map<string, string[]>();
  for (const kv of header.split(',')) {
    const [k, v] = kv.split('=', 2);
    if (!k || !v) continue;
    const list = parts.get(k.trim()) ?? [];
    list.push(v.trim());
    parts.set(k.trim(), list);
  }

  const timestamp = Number(parts.get('t')?.[0]);
  const signatures = parts.get('v1') ?? [];
  if (!Number.isFinite(timestamp) || signatures.length === 0) return false;

  // Ensure timestamp is in the past (prevent future-dated forged signatures)
  const nowSeconds = Date.now() / 1000;
  if (timestamp > nowSeconds) return false;

  const ageSeconds = Math.abs(nowSeconds - timestamp);
  if (ageSeconds > SIGNATURE_TOLERANCE_SECONDS) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(`${timestamp}.${payload}`),
    ),
  );

  return signatures.some((sig) => {
    try {
      return timingSafeEqual(mac, hexToBytes(sig));
    } catch {
      return false;
    }
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!webhookSecret || !supabaseUrl || !serviceKey) {
    console.error('stripe-webhook misconfigured: missing secrets');
    return new Response('Server misconfigured', { status: 500 });
  }

  // Raw body is required for signature verification — do not parse first.
  const payload = await req.text();
  const valid = await verifyStripeSignature(
    payload,
    req.headers.get('Stripe-Signature'),
    webhookSecret,
  );
  if (!valid) {
    return new Response('Invalid signature', { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(payload);
  } catch {
    return new Response('Invalid payload', { status: 400 });
  }

  if (event?.type !== 'checkout.session.completed') {
    // Acknowledge everything else so Stripe stops retrying.
    return new Response(JSON.stringify({ received: true }), { status: 200 });
  }

  const session = event.data?.object ?? {};
  const built = buildOrder(session);
  if ('error' in built) {
    // Malformed metadata is OUR bug, not a transient failure — log loudly and
    // return 200 so Stripe doesn't retry a permanently broken event. An
    // unpaid payment_status lands here too: nothing to record yet.
    console.error('checkout.session.completed not recordable', {
      id: session.id,
      reason: built.error,
    });
    return new Response(
      JSON.stringify({ received: true, skipped: built.error }),
      { status: 200 },
    );
  }
  const order = built.order;

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) Record the order. Two unique constraints shape what can go wrong here:
  //    stripe_session_id (webhook retries) and the partial index that permits
  //    only one paid order per listing (a second buyer winning the race).
  const { error: orderErr } = await db.from('orders').insert(order);
  const verdict = classifyInsertError(orderErr);

  if (verdict === 'fatal') {
    console.error('order insert failed', orderErr);
    // 500 → Stripe retries with backoff; the unique constraints keep it safe.
    return new Response('Order insert failed', { status: 500 });
  }

  // Another buyer's payment got there first. This buyer's charge is real, so
  // record what is owed BEFORE attempting the refund — if the Stripe call or
  // this whole function dies mid-flight, the debt is still on the books and the
  // retry picks it up.
  if (verdict === 'listing_taken') {
    console.error('duplicate purchase, refunding', {
      id: session.id,
      listing_id: order.listing_id,
      buyer_id: order.buyer_id,
    });
    const { error: dueErr } = await db
      .from('orders')
      .insert({ ...order, status: 'refund_due' });
    if (dueErr && classifyInsertError(dueErr) !== 'duplicate_event') {
      console.error('refund_due insert failed', dueErr);
      return new Response('Order insert failed', { status: 500 });
    }

    const settled = await refundIfOwed(db, order.stripe_session_id, order.stripe_payment_intent);
    if (!settled) return new Response('Refund pending', { status: 500 });
    // Do not touch the listing: the winning order already marked it sold, and
    // this buyer never owned it.
    return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200 });
  }

  // A repeat of an event we already recorded. Two things can be behind it:
  // a retry of a duplicate payment whose refund failed last time, or a retry of
  // an ordinary order whose mark-sold step failed. Settle the first here, then
  // fall through so the second still gets its listing flipped — returning early
  // would leave that listing unsold forever, since no later event ever revisits
  // it.
  if (verdict === 'duplicate_event') {
    const settled = await refundIfOwed(db, order.stripe_session_id, order.stripe_payment_intent);
    if (!settled) return new Response('Refund pending', { status: 500 });
  }

  // Emit the analytics event ONLY for a genuinely new paid order — a retry
  // would double-count revenue in PostHog, the exact metric this funnel
  // measures. amount_cents is now the item alone, so the fee is reported
  // separately rather than inflating every purchase.
  if (verdict === 'ok') {
    await capturePurchase(order.buyer_id, {
      order_id: order.stripe_session_id,
      listing_id: order.listing_id,
      amount_cents: order.amount_cents,
      fee_cents: order.fee_cents,
    });
  }

  // 2) Mark the listing sold. Idempotent, and reached on retries too so a
  //    failure here is always recoverable.
  const { error: soldErr } = await db
    .from('listings')
    .update({ is_sold: true })
    .eq('id', order.listing_id);
  if (soldErr) {
    console.error('mark sold failed', soldErr);
    return new Response('Mark sold failed', { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
});
