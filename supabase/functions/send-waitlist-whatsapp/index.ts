// supabase/functions/send-waitlist-whatsapp/index.ts
// Deploy with verify_jwt off: a database trigger cannot mint a user JWT.
// Required secrets: WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID. Until they are set this
// answers 503 and public.retry_waitlist_whatsapp() keeps the row queued for 7 days.
// Optional: WHATSAPP_TEMPLATE (default waitlist_welcome), WHATSAPP_TEMPLATE_LANGUAGE (default en).
//
// Caller: public.dispatch_waitlist_whatsapp(), authenticated with the same Vault secret
// as send-push. Only a waitlist id is accepted, and only a number the database queued
// gets messaged, so nothing that reaches this endpoint can pick the recipient.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { buildWhatsappMessage, GRAPH_URL } from './waitlistWhatsapp.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const provided = req.headers.get('x-webhook-secret');
  const { data: trusted } = provided
    ? await admin.rpc('push_webhook_secret_matches', { p_secret: provided })
    : { data: false };
  if (trusted !== true) return json({ error: 'unauthorized' }, 401);

  const waitlistId = (await req.json().catch(() => null))?.waitlist_id;
  if (typeof waitlistId !== 'string') return json({ error: 'waitlist_id required' }, 400);

  const { data: queued, error: queueErr } = await admin
    .from('waitlist_whatsapp')
    .select('phone, sent_at')
    .eq('waitlist_id', waitlistId)
    .maybeSingle();
  if (queueErr) return json({ error: 'lookup failed' }, 500);
  // Only ever message someone the database queued, and only once.
  if (!queued || queued.sent_at) return json({ sent: false, reason: queued ? 'already sent' : 'not queued' });

  const token = Deno.env.get('WHATSAPP_TOKEN');
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
  if (!token || !phoneNumberId) {
    console.warn('[send-waitlist-whatsapp] secrets not set, leaving queued');
    return json({ sent: false, reason: 'not configured' }, 503);
  }

  const { data: signup, error: signupErr } = await admin
    .from('waitlist')
    .select('name, referral_code')
    .eq('id', waitlistId)
    .maybeSingle();
  if (signupErr || !signup?.referral_code) return json({ sent: false, reason: 'signup not found' }, 404);

  // The template needs a position, so a failed lookup waits for the next retry.
  const { data: status } = await admin.rpc('waitlist_status', { p_code: signup.referral_code });
  const position = status?.[0]?.queue_position;
  if (!position) return json({ sent: false, reason: 'position unavailable' }, 500);

  const res = await fetch(`${GRAPH_URL}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(
      buildWhatsappMessage({
        to: queued.phone,
        template: Deno.env.get('WHATSAPP_TEMPLATE') ?? 'waitlist_welcome',
        language: Deno.env.get('WHATSAPP_TEMPLATE_LANGUAGE') ?? 'en',
        name: signup.name,
        position,
        code: signup.referral_code,
      }),
    ),
  });
  if (!res.ok) {
    console.error('[send-waitlist-whatsapp] meta rejected', res.status, (await res.text()).slice(0, 300));
    return json({ sent: false, reason: 'provider error' }, 502);
  }

  const { error: markErr } = await admin
    .from('waitlist_whatsapp')
    .update({ sent_at: new Date().toISOString() })
    .eq('waitlist_id', waitlistId);
  if (markErr) console.error('[send-waitlist-whatsapp] sent but not marked', markErr.message);
  return json({ sent: true });
});
