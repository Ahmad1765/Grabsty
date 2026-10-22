// supabase/functions/create-checkout-session/index.ts
// Deploy: supabase functions deploy create-checkout-session
// Required secrets:
//   supabase secrets set STRIPE_SECRET_KEY=sk_test_...
//   supabase secrets set ALLOWED_ORIGINS=https://yourapp.com,http://localhost:8081
// Inherits: SUPABASE_URL, SUPABASE_ANON_KEY (already set by Supabase)
//
// Client invokes via:
//   supabase.functions.invoke('create-checkout-session', {
//     body: { listing_id, return_url, offer_amount? },
//   })
//
// Returns:
//   { url: string, sessionId: string }
//
// Security model:
//   - Caller must be an authenticated user (JWT forwarded by supabase-js).
//   - Buying your own listing or a sold listing is rejected.
//   - offer_amount is only a HINT: when present, the server looks up the
//     latest ACCEPTED offer for (listing, caller-as-buyer) via RLS-scoped
//     queries and charges that amount. The client value is cross-checked but
//     never trusted as the price.
//   - The session carries listing/buyer metadata; the stripe-webhook function
//     records the order and marks the listing sold after payment completes.

// @ts-ignore
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
// @ts-ignore
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { resolveOfferCharge } from './pricing.ts';

// CORS allowlist for WEB callers. Native apps send no Origin header and are
// unaffected. If unset, browser calls get no CORS headers (and fail preflight)
// but the function still boots — a missing secret shouldn't crash-loop it.
const envOrigins = Deno.env.get('ALLOWED_ORIGINS') ?? '';
if (!envOrigins) {
  console.warn('ALLOWED_ORIGINS not set — web (browser) checkout will fail CORS until you run: supabase secrets set ALLOWED_ORIGINS=...');
}
// Trailing slashes stripped so an entry written as "https://app.com/" still
// matches both an Origin header and a URL.origin, neither of which ever has one.
const ALLOWED_ORIGINS = envOrigins
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
    return {};
  }
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function json(body: unknown, status = 200, origin: string | null = null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(origin) });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, origin);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY');
    if (!supabaseUrl || !anonKey) return json({ error: 'Server misconfigured' }, 500, origin);
    if (!stripeSecret) return json({ error: 'STRIPE_SECRET_KEY not set' }, 500, origin);

    const auth = req.headers.get('Authorization');
    if (!auth) return json({ error: 'Authentication required' }, 401, origin);

    const body = await req.json().catch(() => ({}));
    const listingId = String(body?.listing_id ?? '').trim();
    const returnUrl = String(body?.return_url ?? '').trim();
    const offerAmountHint = Number(body?.offer_amount);
    const wantsOfferPrice =
      Number.isFinite(offerAmountHint) && offerAmountHint > 0;
    if (!listingId) return json({ error: 'listing_id required' }, 400, origin);
    if (!returnUrl) return json({ error: 'return_url required' }, 400, origin);

    // User-scoped client: every query below runs under the caller's RLS.
    const sb = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: uErr } = await sb.auth.getUser();
    if (uErr || !userData?.user) {
      return json({ error: 'Authentication required' }, 401, origin);
    }
    const buyerId = userData.user.id;

    const { data: listing, error: lErr } = await sb
      .from('listings')
      .select('id, title, price, images, seller_id, is_sold')
      .eq('id', listingId)
      .maybeSingle();
    if (lErr) return json({ error: lErr.message }, 500, origin);
    if (!listing) return json({ error: 'Listing not found' }, 404, origin);
    if (listing.seller_id === buyerId) {
      return json({ error: 'You cannot buy your own listing' }, 400, origin);
    }
    // Seller's own "Mark as sold" toggle — an intent signal, not a money gate.
    if (listing.is_sold) return json({ error: 'Listing already sold' }, 409, origin);

    // The money gate: a paid order. listings.is_sold cannot serve this role —
    // the seller can flip it back to false at will (app/product/[id].tsx), and
    // the old code let that re-open checkout on an already-paid listing and
    // charge the buyer a second time.
    //
    // Read with the service role: RLS hides OTHER buyers' orders from this
    // caller, and "someone else already paid" is exactly what must be caught.
    // Used for this one narrow read and nothing else. The partial unique index
    // on orders(listing_id) where status='paid' is the real race backstop; this
    // check just turns the common case into a clean 409 instead of a refund.
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!serviceKey) return json({ error: 'Server misconfigured' }, 500, origin);
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Rate limit checkout session creation to prevent abuse/bot session flooding (max 15 per 10 minutes)
    const { error: rlErr } = await admin.rpc('enforce_user_rate_limit', {
      p_user_id: buyerId,
      p_action: 'create_checkout_session',
      p_limit: 15,
      p_window: '10 minutes',
    });
    if (rlErr) {
      return json({ error: 'Too many checkout attempts. Please wait a few minutes before trying again.' }, 429, origin);
    }

    const { data: paidOrders, error: poErr } = await admin
      .from('orders')
      .select('id')
      .eq('listing_id', listingId)
      .eq('status', 'paid')
      .limit(1);
    if (poErr) return json({ error: poErr.message }, 500, origin);
    if (paidOrders?.length) {
      return json({ error: 'Listing already sold' }, 409, origin);
    }

    // Resolve the charge amount server-side. Default: listing price.
    // With offer_amount: require a matching ACCEPTED offer in a conversation
    // where the caller is the buyer. RLS already restricts the query to
    // conversations the caller participates in.
    let chargeDollars = Number(listing.price);
    let offerMessageId: string | null = null;
    if (wantsOfferPrice) {
      const { data: offers, error: oErr } = await sb
        .from('messages')
        // updated_at is when the offer was ACCEPTED (offer_status only moves via
        // UPDATE, and trg_messages_touch stamps updated_at on each one) —
        // resolveOfferCharge needs it to enforce the acceptance TTL.
        .select('id, metadata, updated_at, conversations!inner(listing_id, buyer_id)')
        .eq('kind', 'offer')
        .eq('offer_status', 'accepted')
        .eq('conversations.listing_id', listingId)
        .eq('conversations.buyer_id', buyerId)
        .order('updated_at', { ascending: false })
        .limit(1);
      if (oErr) return json({ error: oErr.message }, 500, origin);
      // All the money rules live in ./pricing.ts so they are unit-testable:
      // hint must match the real offer, acceptance must be recent, and the
      // charge never exceeds the current sticker price.
      const resolved = resolveOfferCharge({
        listingPrice: listing.price,
        offer: offers?.[0],
        clientHint: offerAmountHint,
      });
      if ('error' in resolved) {
        return json({ error: resolved.error }, resolved.status, origin);
      }
      chargeDollars = resolved.amount;
      offerMessageId = resolved.offerMessageId;
    }

    const priceCents = Math.round(chargeDollars * 100);
    if (!Number.isFinite(priceCents) || priceCents < 50) {
      return json({ error: 'Invalid listing price' }, 400, origin);
    }

    // Buyer Protection fee, added as its own line item so the buyer is charged
    // the same total shown in the app. Keep this in sync with BUYER_PROTECTION_MODE
    // and BUYER_PROTECTION_PERCENTAGE in lib/fees.ts.
    const BUYER_PROTECTION_MODE: 'flat' | 'percentage' = 'percentage';
    const BUYER_PROTECTION_PERCENTAGE = 6;
    const BUYER_PROTECTION_FEE = 6;

    const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
    const feeDollars =
      BUYER_PROTECTION_MODE === 'percentage'
        ? Math.round(round2(chargeDollars) * (BUYER_PROTECTION_PERCENTAGE / 100))
        : BUYER_PROTECTION_FEE;
    const feeCents = Math.round(feeDollars * 100);

    let successUrlObj: URL;
    let cancelUrlObj: URL;
    try {
      successUrlObj = new URL(returnUrl);
      // Validate protocol: http/https for web, grabsty:// or carrinex:// for app deep links
      const isWeb = successUrlObj.protocol === 'http:' || successUrlObj.protocol === 'https:';
      const isApp = successUrlObj.protocol === 'grabsty:' || successUrlObj.protocol === 'carrinex:';
      if (!isWeb && !isApp) {
        throw new Error('Invalid protocol');
      }
      // Exact origin match against the allow-list. The previous version built a
      // `urlOrigin` it never used, then substring-matched the caller's hostname
      // INTO each allow-list entry — which passes for any hostname that happens
      // to be a substring of an allowed origin, i.e. an open redirect.
      if (
        isWeb &&
        ALLOWED_ORIGINS.length > 0 &&
        !ALLOWED_ORIGINS.includes(successUrlObj.origin)
      ) {
        throw new Error('Redirect origin not allowed');
      }
      cancelUrlObj = new URL(returnUrl);
    } catch {
      return json({ error: 'Invalid return_url' }, 400, origin);
    }

    successUrlObj.searchParams.set('paid', '1');
    cancelUrlObj.searchParams.set('paid', '0');

    // Build Stripe Checkout Session via the REST API (no SDK needed in Deno).
    const params = new URLSearchParams();
    params.append('mode', 'payment');
    params.append('success_url', successUrlObj.toString());
    params.append('cancel_url', cancelUrlObj.toString());
    params.append('client_reference_id', buyerId);
    params.append('line_items[0][quantity]', '1');
    params.append('line_items[0][price_data][currency]', 'pkr');
    params.append('line_items[0][price_data][unit_amount]', String(priceCents));
    params.append('line_items[0][price_data][product_data][name]', listing.title ?? 'Item');
    // Stripe fetches this URL server-side, so only ever hand it our own storage
    // host. Derived from SUPABASE_URL so it cannot drift from the real project:
    // the old hardcoded 'supabaseusercontent.com'/'your-cdn.com' pair never
    // matched the actual '<ref>.supabase.co' storage host, so every checkout
    // page silently shipped with no product image.
    const storageHost = new URL(supabaseUrl).hostname;
    if (Array.isArray(listing.images) && listing.images[0]) {
      const imageUrl = String(listing.images[0]).trim();
      try {
        const imgObj = new URL(imageUrl);
        if (imgObj.protocol === 'https:' && imgObj.hostname === storageHost) {
          params.append('line_items[0][price_data][product_data][images][0]', imageUrl);
        }
      } catch {
        // Silently skip invalid image URL — don't break the checkout
      }
    }
    // Buyer Protection as a separate, clearly-labelled line item so it shows on
    // the Stripe checkout page and the receipt. amount_total (item + fee) is
    // what stripe-webhook records as the order amount.
    if (feeCents > 0) {
      params.append('line_items[1][quantity]', '1');
      params.append('line_items[1][price_data][currency]', 'pkr');
      params.append('line_items[1][price_data][unit_amount]', String(feeCents));
      params.append('line_items[1][price_data][product_data][name]', 'Buyer Protection');
    }

    // stripe-webhook reads these to record the order after payment.
    params.append('metadata[listing_id]', listing.id);
    params.append('metadata[buyer_id]', buyerId);
    params.append('metadata[seller_id]', listing.seller_id);
    // The fee is charged as line_items[1], so amount_total arrives at the
    // webhook already including it. Pass the split here rather than
    // re-declaring BUYER_PROTECTION_FEE in a third place — the webhook records
    // item and fee separately and never has to know the formula.
    params.append('metadata[fee_cents]', String(feeCents));
    if (offerMessageId) params.append('metadata[offer_message_id]', offerMessageId);
    params.append('payment_method_types[0]', 'card');

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecret}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    const stripeBody = await res.json();
    if (!res.ok) {
      // Don't leak Stripe error details to client — log server-side, return generic message
      console.error('[create-checkout] stripe error', stripeBody?.error);
      return json({ error: 'Payment setup failed. Please try again.' }, 500, origin);
    }

    if (!stripeBody?.url || !stripeBody?.id) {
      console.error('[create-checkout] missing session data', stripeBody);
      return json({ error: 'Payment setup failed. Please try again.' }, 500, origin);
    }

    return json({ url: stripeBody.url, sessionId: stripeBody.id }, 200, origin);
  } catch (e) {
    // Don't leak error details — log server-side for debugging
    console.error('[create-checkout] exception', e instanceof Error ? e.message : String(e));
    return json({ error: 'Payment setup failed. Please try again.' }, 500, origin);
  }
});
