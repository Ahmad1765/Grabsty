// supabase/functions/send-waitlist-email/index.ts
// Deploy with verify_jwt off: a database trigger cannot mint a user JWT.
// Required secret: RESEND_API_KEY. Optional: WELCOME_FROM (default "Grabsty <hello@grabsty.com>").
//
// Caller: public.dispatch_waitlist_email(), authenticated with the same Vault secret
// as send-push. Only a waitlist id is accepted, and only an address the database
// queued gets mailed, so nothing that reaches this endpoint can pick the recipient.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { buildWaitlistEmail } from './waitlistEmail.ts';

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
    .from('waitlist_emails')
    .select('email, sent_at')
    .eq('waitlist_id', waitlistId)
    .maybeSingle();
  if (queueErr) return json({ error: 'lookup failed' }, 500);
  // Only ever mail someone the database queued, and only once.
  if (!queued || queued.sent_at) return json({ sent: false, reason: queued ? 'already sent' : 'not queued' });

  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) {
    console.warn('[send-waitlist-email] RESEND_API_KEY not set, leaving queued');
    return json({ sent: false, reason: 'not configured' }, 503);
  }

  const { data: signup, error: signupErr } = await admin
    .from('waitlist')
    .select('name, role, referral_code, referred_by')
    .eq('id', waitlistId)
    .maybeSingle();
  if (signupErr || !signup) return json({ sent: false, reason: 'signup not found' }, 404);

  // The position is a nicety: the email still goes out without it.
  const { data: status } = signup.referral_code
    ? await admin.rpc('waitlist_status', { p_code: signup.referral_code })
    : { data: null };

  const { subject, html, text } = buildWaitlistEmail({
    name: signup.name,
    role: signup.role,
    code: signup.referral_code,
    position: status?.[0]?.queue_position,
    referred: Boolean(signup.referred_by),
  });

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      // A retry after a lost response returns the original send instead of a second email.
      'Idempotency-Key': `waitlist-welcome/${waitlistId}`,
    },
    body: JSON.stringify({
      from: Deno.env.get('WELCOME_FROM') ?? 'Grabsty <hello@grabsty.com>',
      to: [queued.email],
      reply_to: 'support@grabsty.com',
      subject,
      html,
      text,
    }),
  });
  if (!res.ok) {
    console.error('[send-waitlist-email] resend rejected', res.status, (await res.text()).slice(0, 300));
    return json({ sent: false, reason: 'provider error' }, 502);
  }

  const { error: markErr } = await admin
    .from('waitlist_emails')
    .update({ sent_at: new Date().toISOString() })
    .eq('waitlist_id', waitlistId);
  if (markErr) console.error('[send-waitlist-email] sent but not marked', markErr.message);
  return json({ sent: true });
});
