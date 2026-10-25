// supabase/functions/remove-background/index.ts
// Deploy: supabase functions deploy remove-background
// Requires env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (auto),
//               REPLICATE_API_TOKEN (user-set secret; returns 503 until set so
//               the client silently falls back to on-device matting).
//
// Client invokes via:
//   await supabase.functions.invoke('remove-background', { body: { image } })
// where `image` is the base64 of a JPEG (no data: prefix). Returns
// { image: <base64 png>, contentType: 'image/png' } — a BiRefNet segmentation
// mask (white = foreground) the client applies as an alpha matte.
//
// Flow: verify JWT → stash the image at an unguessable tmp path in the public
// wardrobe-images bucket (Replicate ingests by URL; data-URI inputs are capped
// at ~256KB) → run BiRefNet on Replicate (sync-wait + short poll) → fetch the
// mask → delete the tmp object → return the mask.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { decodeBase64, encodeBase64 } from 'jsr:@std/encoding/base64';

// men1scus/birefnet — full BiRefNet (MIT weights). Input: { image: uri },
// output: single mask URI. Version pinned so a wrapper update can't silently
// change the I/O contract.
const REPLICATE_VERSION = 'f74986db0355b58403ed20963af156525e2891ea3c2d499bfbfb2a28cd87c5d7';
const TMP_BUCKET = 'wardrobe-images';
const MAX_IMAGE_BYTES = 8_000_000;

// CORS: permissive-by-origin-echo. Safe here because auth is a bearer JWT
// (no cookies → no CSRF surface) and the function only processes the caller's
// own image. Avoids the dev-origin allow-list footgun.
function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin');
  if (!origin) return {}; // native callers send no Origin
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);

  function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const auth = req.headers.get('Authorization');
    if (!auth) return json({ error: 'Missing authorization' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ error: 'Server misconfigured' }, 500);
    }

    const replicateToken = Deno.env.get('REPLICATE_API_TOKEN');
    if (!replicateToken) return json({ error: 'not_configured' }, 503);

    // Verify the caller via their JWT — this endpoint spends money per call.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: 'Invalid session' }, 401);

    let imageB64: string | undefined;
    try {
      const body = await req.json();
      if (typeof body?.image === 'string') imageB64 = body.image;
    } catch {
      // fall through to the guard below
    }
    if (!imageB64) return json({ error: 'Missing image' }, 400);

    let bytes: Uint8Array;
    try {
      bytes = decodeBase64(imageB64);
    } catch {
      return json({ error: 'Invalid base64' }, 400);
    }
    if (bytes.length > MAX_IMAGE_BYTES) return json({ error: 'Image too large' }, 413);

    // Validate magic bytes to ensure file is actually an image (JPEG, PNG, WEBP)
    const isJpeg = bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF;
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
    const isWebp = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
    if (!isJpeg && !isPng && !isWebp) {
      return json({ error: 'Invalid image format. Supported formats: JPEG, PNG, WEBP' }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Abuse control: Enforce per-user sliding window limit (max 15/hr)
    const { error: rlErr } = await admin.rpc('enforce_user_rate_limit', {
      p_user_id: userData.user.id,
      p_action: 'remove_background_hourly',
      p_limit: 15,
      p_window: '1 hour',
    });
    if (rlErr) {
      return json(
        { error: 'Rate limit reached: Maximum 15 AI background removals per hour. Please try again later.' },
        429
      );
    }

    const tmpPath = `tmp/${crypto.randomUUID()}.jpg`;
    const { error: upErr } = await admin.storage
      .from(TMP_BUCKET)
      .upload(tmpPath, bytes, { contentType: 'image/jpeg', upsert: false });
    if (upErr) {
      console.error('[remove-background] staging upload failed', upErr.message);
      return json({ error: 'staging_failed' }, 500);
    }

    try {
      const { data: pub } = admin.storage.from(TMP_BUCKET).getPublicUrl(tmpPath);

      const start = await fetch('https://api.replicate.com/v1/predictions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${replicateToken}`,
          'Content-Type': 'application/json',
          Prefer: 'wait=55',
        },
        body: JSON.stringify({
          version: REPLICATE_VERSION,
          input: { image: pub.publicUrl },
        }),
      });
      let pred = await start.json();
      if (!start.ok) {
        return json({ error: 'inference_failed', detail: pred?.detail ?? pred?.title ?? start.status }, 502);
      }

      // Prefer:wait covers most runs; poll briefly for stragglers/cold starts.
      let tries = 0;
      while (
        pred &&
        (pred.status === 'starting' || pred.status === 'processing') &&
        pred.urls?.get &&
        tries < 20
      ) {
        await new Promise((r) => setTimeout(r, 2000));
        tries++;
        const poll = await fetch(pred.urls.get, {
          headers: { Authorization: `Bearer ${replicateToken}` },
        });
        pred = await poll.json();
      }

      if (pred?.status !== 'succeeded' || typeof pred.output !== 'string') {
        return json({ error: 'inference_failed', detail: pred?.error ?? pred?.status }, 502);
      }

      const maskRes = await fetch(pred.output);
      if (!maskRes.ok) return json({ error: 'mask_fetch_failed' }, 502);
      const mask = new Uint8Array(await maskRes.arrayBuffer());

      return json({ image: encodeBase64(mask), contentType: 'image/png' });
    } finally {
      // Best-effort cleanup of the staged input.
      try {
        await admin.storage.from(TMP_BUCKET).remove([tmpPath]);
      } catch {
        // ignore — tmp objects are unguessable and harmless if orphaned
      }
    }
  } catch (e) {
    console.error('[remove-background] exception', e instanceof Error ? e.message : String(e));
    return json({ error: 'internal_error' }, 500);
  }
});
