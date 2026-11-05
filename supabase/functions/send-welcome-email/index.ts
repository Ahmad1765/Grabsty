// supabase/functions/send-welcome-email/index.ts
// Deploy with verify_jwt off: a database trigger cannot mint a user JWT.
// Required secret: RESEND_API_KEY (starts with re_). Until it is set this answers
// 503 and public.retry_welcome_emails() keeps the row queued for 7 days.
// Optional: WELCOME_FROM (default "Grabsty <hello@grabsty.com>").
//
// Caller: public.dispatch_welcome_email(), authenticated with the same Vault secret
// as send-push. Only a user id is accepted: the address always comes from auth, so
// nothing that reaches this endpoint can pick who gets mailed.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { buildWelcomeEmail } from './welcomeEmail.ts';

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

  const userId = (await req.json().catch(() => null))?.user_id;
  if (typeof userId !== 'string') return json({ error: 'user_id required' }, 400);

  const { data: row, error: rowErr } = await admin
    .from('welcome_emails')
    .select('sent_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (rowErr) return json({ error: 'lookup failed' }, 500);
  // Only ever mail someone the database queued, and only once.
  if (!row || row.sent_at) return json({ sent: false, reason: row ? 'already sent' : 'not queued' });

  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) {
    console.warn('[send-welcome-email] RESEND_API_KEY not set, leaving queued');
    return json({ sent: false, reason: 'not configured' }, 503);
  }

  const { data: authUser, error: userErr } = await admin.auth.admin.getUserById(userId);
  const email = authUser?.user?.email;
  if (userErr || !email) return json({ sent: false, reason: 'no address' }, 404);

  const { data: profile } = await admin.from('profiles').select('full_name').eq('id', userId).maybeSingle();
  const { subject, html, text } = buildWelcomeEmail(profile?.full_name);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      // A retry after a lost response returns the original send instead of a second email.
      'Idempotency-Key': `welcome/${userId}`,
    },
    body: JSON.stringify({
      from: Deno.env.get('WELCOME_FROM') ?? 'Grabsty <hello@grabsty.com>',
      to: [email],
      reply_to: 'support@grabsty.com',
      subject,
      html,
      text,
    }),
  });
  if (!res.ok) {
    console.error('[send-welcome-email] resend rejected', res.status, (await res.text()).slice(0, 300));
    return json({ sent: false, reason: 'provider error' }, 502);
  }

  const { error: markErr } = await admin
    .from('welcome_emails')
    .update({ sent_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (markErr) console.error('[send-welcome-email] sent but not marked', markErr.message);
  return json({ sent: true });
});
