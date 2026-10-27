-- Listing and offer analytics move to the database, like order events
-- (20261024030000). The app sent listing_created and offer_made itself, so
-- they could be blocked, forged, or missed (offers made by counter-offer RPCs,
-- listings created by scripts).
--
-- Events (distinct_id matches the app's identify()):
--   listing_created   seller   on listings INSERT
--   offer_created     buyer    on offers INSERT
--   offer_responded   buyer    on offers status change (accepted/declined/countered/expired)
-- Never sent: titles, descriptions, message text, addresses.

-- One sender for every server-side event. Best effort: pg_net has no retries,
-- and analytics must never break the write that triggered it.
create or replace function analytics.send_event(p_event text, p_distinct_id uuid, p_props jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key  text;
  v_host text;
begin
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'posthog_project_key';
  if v_key is null or p_distinct_id is null then
    return;
  end if;
  select decrypted_secret into v_host from vault.decrypted_secrets where name = 'posthog_host';
  perform net.http_post(
    url     := coalesce(nullif(v_host, ''), 'https://us.i.posthog.com') || '/i/v0/e/',
    body    := jsonb_build_object(
                 'api_key',     v_key,
                 'event',       p_event,
                 'distinct_id', p_distinct_id,
                 'timestamp',   clock_timestamp(),
                 'properties',  p_props || jsonb_build_object('$lib', 'postgres-trigger')
               ),
    headers := jsonb_build_object('Content-Type', 'application/json'),
    timeout_milliseconds := 5000
  );
exception when others then
  raise warning '[analytics] % not queued: %', p_event, sqlerrm;
end;
$$;
revoke execute on function analytics.send_event(text, uuid, jsonb) from public, anon, authenticated;

-- Who made the change, from the caller's JWT (null under cron/service role).
create or replace function analytics.actor_role(p_buyer uuid, p_seller uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select case
           when auth.uid() is null then 'system'
           when auth.uid() = p_buyer then 'buyer'
           when auth.uid() = p_seller then 'seller'
           else 'admin'
         end;
$$;

-- Order events, now through the shared sender (payload unchanged).
create or replace function analytics.capture_order_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_props jsonb;
begin
  if tg_op = 'UPDATE'
     and new.status is not distinct from old.status
     and new.fulfillment_status is not distinct from old.fulfillment_status then
    return null;
  end if;
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
    -- COD checkout doesn't set offer_message_id; the accepted offer is the truth.
    'is_offer',           new.offer_message_id is not null or exists (
                            select 1 from public.offers o
                             where o.listing_id = new.listing_id and o.buyer_id = new.buyer_id
                               and o.status = 'accepted'),
    'status',             new.status,
    'fulfillment_status', new.fulfillment_status,
    'actor_role',         analytics.actor_role(new.buyer_id, new.seller_id)
  );
  if tg_op = 'UPDATE' then
    v_props := v_props || jsonb_build_object(
      'from_status',             old.status,
      'from_fulfillment_status', old.fulfillment_status,
      'hours_since_created',     round(extract(epoch from (clock_timestamp() - new.created_at)) / 3600, 1)
    );
  end if;
  perform analytics.send_event(
    case when tg_op = 'INSERT' then 'order_created' else 'order_status_changed' end,
    new.buyer_id, v_props);
  return null;
end;
$$;

create or replace function analytics.capture_listing_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform analytics.send_event('listing_created', new.seller_id, jsonb_build_object(
    'listing_id',       new.id,
    'category',         new.category,
    'subcategory',      new.subcategory,
    'condition',        new.condition,
    'price_pkr',        new.price,
    'photo_count',      coalesce(cardinality(new.images), 0),
    'has_brand',        nullif(trim(new.brand), '') is not null,
    'has_authenticity', new.authenticity is not null,
    'parcel_size',      new.parcel_size
  ));
  return null;
end;
$$;

drop trigger if exists listings_capture_analytics on public.listings;
create trigger listings_capture_analytics
  after insert on public.listings
  for each row execute function analytics.capture_listing_event();

create or replace function analytics.capture_offer_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list_price numeric;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return null;
  end if;
  select price into v_list_price from public.listings where id = new.listing_id;
  if tg_op = 'INSERT' then
    perform analytics.send_event('offer_created', new.buyer_id, jsonb_build_object(
      'offer_id',          new.id,
      'listing_id',        new.listing_id,
      'seller_id',         new.seller_id,
      'amount_pkr',        new.amount,
      'pct_of_list_price', case when v_list_price > 0 then round(new.amount * 100 / v_list_price) end,
      'actor_role',        analytics.actor_role(new.buyer_id, new.seller_id)
    ));
  else
    perform analytics.send_event('offer_responded', new.buyer_id, jsonb_build_object(
      'offer_id',          new.id,
      'listing_id',        new.listing_id,
      'seller_id',         new.seller_id,
      'amount_pkr',        new.amount,
      'from_status',       old.status,
      'outcome',           new.status,
      'actor_role',        analytics.actor_role(new.buyer_id, new.seller_id),
      'hours_to_respond',  round(extract(epoch from (clock_timestamp() - new.created_at)) / 3600, 1)
    ));
  end if;
  return null;
end;
$$;

drop trigger if exists offers_capture_analytics on public.offers;
create trigger offers_capture_analytics
  after insert or update of status on public.offers
  for each row execute function analytics.capture_offer_event();
