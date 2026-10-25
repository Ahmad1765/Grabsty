// supabase/functions/delete-account/index.ts
// Deploy: supabase functions deploy delete-account
// Requires env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//
// Client invokes via:
//   await supabase.functions.invoke('delete-account', { body: { reason } })
//
// This deletes the auth user using the service-role key.
// FK cascades (profiles, listings, listing_likes, conversations, messages)
// remove all owned rows.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const envOrigins = Deno.env.get('ALLOWED_ORIGINS');
const ALLOWED_ORIGINS = envOrigins ? envOrigins.split(',').map((o) => o.trim()).filter(Boolean) : [];

// CORS is a browser concern: native apps (iOS/Android) send no Origin header
// and must NOT be rejected — the JWT check below is the real auth gate.
// Browser callers with an Origin outside the allow-list are refused.
function getCorsHeaders(req: Request): Record<string, string> | null {
  const origin = req.headers.get('Origin');
  if (!origin) return {}; // non-browser caller: no CORS headers needed
  // Only echo back the caller's Origin if it's explicitly on the allow-list.
  // Falling back to ALLOWED_ORIGINS[0] would leak a valid CORS response to
  // disallowed origins (the browser still blocks the actual cross-origin
  // request, but exposing the allowed origin in error logs is unnecessary).
  if (!ALLOWED_ORIGINS.includes(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

// Usage analytics are keyed by the user id, so deleting the account must
// delete that PostHog person (and its events/recordings) too. Best effort and
// skipped until POSTHOG_PERSONAL_API_KEY (scope person:write) and
// POSTHOG_PROJECT_ID are set; the account deletion never waits on PostHog.
async function deletePostHogPerson(distinctId: string): Promise<void> {
  const key = Deno.env.get('POSTHOG_PERSONAL_API_KEY');
  const project = Deno.env.get('POSTHOG_PROJECT_ID');
  if (!key || !project) return;
  const host = Deno.env.get('POSTHOG_APP_HOST') ?? 'https://us.posthog.com';
  try {
    const res = await fetch(`${host}/api/projects/${project}/persons/bulk_delete/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ distinct_ids: [distinctId], delete_events: true, delete_recordings: true }),
    });
    if (!res.ok) {
      console.error('[delete-account] posthog delete failed', res.status, (await res.text()).slice(0, 200));
    }
  } catch (e) {
    console.error('[delete-account] posthog delete failed', e instanceof Error ? e.message : String(e));
  }
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (corsHeaders === null) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }

  function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const auth = req.headers.get('Authorization');
    if (!auth) return json({ error: 'Missing authorization' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ error: 'Server misconfigured' }, 500);
    }

    // Verify the caller via their JWT
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return json({ error: 'Invalid session' }, 401);
    }
    const user = userData.user;

    // Parse optional reason
    let reason: string | null = null;
    try {
      const body = await req.json();
      if (typeof body?.reason === 'string') reason = body.reason.slice(0, 500);
    } catch {
      // ignore — empty body is fine
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Rate limit: max 2 account deletion attempts per hour per user to prevent abuse
    const { error: rlErr } = await admin.rpc('enforce_user_rate_limit', {
      p_user_id: user.id,
      p_action: 'account_deletion',
      p_limit: 2,
      p_window: '1 hour',
    });
    if (rlErr) {
      return json({ error: 'Too many requests. Please try again later.' }, 429);
    }

    // Log the deletion request (required success). user_id is a plain uuid
    // column (no FK), so the audit row survives the auth user deletion below.
    const { error: insertErr } = await admin.from('account_deletion_requests').insert({
      user_id: user.id,
      email: user.email ?? null,
      reason,
    });
    if (insertErr) {
      console.warn('[delete-account] Failed to log deletion request:', insertErr);
      return json({ error: 'Failed to process deletion request audit log' }, 500);
    }

    // Perform deletion
    const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
    if (delErr) {
      console.error('[delete-account] deleteUser failed', delErr.message);
      return json({ error: 'Could not delete the account. Please try again.' }, 500);
    }

    await deletePostHogPerson(user.id);
    return json({ ok: true });
  } catch (e) {
    // Log the detail; the caller only learns that it failed.
    console.error('[delete-account] exception', e instanceof Error ? e.message : String(e));
    return json({ error: 'Could not delete the account. Please try again.' }, 500);
  }
});
