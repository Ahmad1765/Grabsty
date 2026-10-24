-- Audit 2026-10-24, finding M8. Order analytics move from the app to the
-- database, the only place that sees every transition: checkout RPCs, admin
-- logistics, the Stripe webhook, cancellations and the pg_cron sweeps.
-- Client-side order events were attributed to whoever clicked (an admin
-- advancing logistics counted as the buyer's event), missed server-side
-- transitions, and could be blocked or forged.
--
-- Events (distinct_id = buyer, the same id the app passes to identify()):
--   order_created         on INSERT
--   order_status_changed  when status or fulfillment_status changes
-- Never sent: shipping address, delivery notes, cancel/dispute reason text,
-- tracking number, courier name.
-- stripe-webhook's purchase_completed (card payment captured) is separate and
-- stays; it marks money received, order_created marks the order existing.
--
-- Setup: store the PostHog project key (phc_..., public by design) in Vault:
--   select vault.create_secret('phc_...', 'posthog_project_key');
--   -- optional, defaults to the EU cloud:
--   select vault.create_secret('https://eu.i.posthog.com', 'posthog_host');
-- Without the secret the trigger does nothing.
-- Delivery is best effort: pg_net sends after commit with no retries. The
-- orders table stays the source of truth for revenue.

create schema if not exists analytics;
revoke all on schema analytics from public, anon, authenticated;

create or replace function analytics.capture_order_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key   text;
  v_host  text;
  v_event text;
  v_actor uuid := auth.uid();
  v_props jsonb;
begin
  if tg_op = 'UPDATE'
     and new.status is not distinct from old.status
     and new.fulfillment_status is not distinct from old.fulfillment_status then
    return null;
  end if;

  -- Analytics must never break an order write.
  begin
    select decrypted_secret into v_key from vault.decrypted_secrets where name = 'posthog_project_key';
    if v_key is null then
      return null;
    end if;
    select decrypted_secret into v_host from vault.decrypted_secrets where name = 'posthog_host';

    v_event := case when tg_op = 'INSERT' then 'order_created' else 'order_status_changed' end;
    v_props := jsonb_build_object(
      'order_id',           new.id,
      'listing_id',         new.listing_id,
      'seller_id',          new.seller_id,
      'amount_pkr',         new.amount_cents / 100.0,
      'fee_pkr',            coalesce(new.fee_cents, 0) / 100.0,
      'shipping_fee_pkr',   coalesce(new.shipping_fee_cents, 0) / 100.0,
      'payment_method',     new.payment_method,
      'shipping_method',    new.shipping_method,
      'is_bundle',          coalesce(new.bundle_count, 1) > 1,
      'is_offer',           new.offer_message_id is not null,
      'status',             new.status,
      'fulfillment_status', new.fulfillment_status,
      'actor_role', case
                      when v_actor is null then 'system'
                      when v_actor = new.buyer_id then 'buyer'
                      when v_actor = new.seller_id then 'seller'
                      else 'admin'
                    end,
      '$lib', 'postgres-trigger'
    );
    if tg_op = 'UPDATE' then
      v_props := v_props || jsonb_build_object(
        'from_status',             old.status,
        'from_fulfillment_status', old.fulfillment_status,
        'hours_since_created',     round(extract(epoch from (clock_timestamp() - new.created_at)) / 3600, 1)
      );
    end if;

    perform net.http_post(
      url     := coalesce(nullif(v_host, ''), 'https://eu.i.posthog.com') || '/i/v0/e/',
      body    := jsonb_build_object(
                   'api_key',     v_key,
                   'event',       v_event,
                   'distinct_id', new.buyer_id,
                   'timestamp',   clock_timestamp(),
                   'properties',  v_props
                 ),
      headers := jsonb_build_object('Content-Type', 'application/json'),
      timeout_milliseconds := 5000
    );
  exception when others then
    raise warning '[analytics] order event not queued: %', sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists orders_capture_analytics on public.orders;
create trigger orders_capture_analytics
  after insert or update of status, fulfillment_status on public.orders
  for each row execute function analytics.capture_order_event();
