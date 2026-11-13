-- Audit 2026-11-12, batch 1: DB-001, DB-002, DB-004, DB-012 / WF-001.

-- DB-004: a format string plus a MESSAGE option is invalid PL/pgSQL (42601).
create or replace function public.enforce_rate_limit(p_action text, p_limit integer, p_window interval)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid   uuid := auth.uid();
  v_count int;
begin
  if v_uid is null then
    return;
  end if;

  -- Serialize rate-limit check per user and action to prevent race conditions
  perform pg_advisory_xact_lock(hashtext(v_uid::text), hashtext(p_action));

  select count(*) into v_count
  from public.rate_limit_events
  where user_id = v_uid
    and action = p_action
    and created_at > now() - p_window;

  if v_count >= p_limit then
    raise exception using
      errcode = 'P0001',
      message = format('Rate limit reached for %s (max %s per %s).', p_action, p_limit, p_window),
      hint    = 'Please slow down and try again shortly.';
  end if;

  insert into public.rate_limit_events (user_id, action) values (v_uid, p_action);
end;
$function$;

create or replace function public.enforce_user_rate_limit(p_user_id uuid, p_action text, p_limit integer, p_window interval)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_count int;
begin
  if p_user_id is null then
    return true;
  end if;

  -- Serialize rate-limit check per user and action to prevent concurrency bypass
  perform pg_advisory_xact_lock(hashtext(p_user_id::text), hashtext(p_action));

  select count(*) into v_count
  from public.rate_limit_events
  where user_id = p_user_id
    and action = p_action
    and created_at > now() - p_window;

  if v_count >= p_limit then
    raise exception using
      errcode = 'P0001',
      message = format('Rate limit reached for %s (max %s per %s).', p_action, p_limit, p_window),
      hint    = 'Please slow down and try again shortly.';
  end if;

  insert into public.rate_limit_events (user_id, action) values (p_user_id, p_action);
  return true;
end;
$function$;

-- DB-001: at most 3 open COD orders per buyer, at most 10 COD checkouts per hour.
-- DB-002: self_ship is dropped; every order is platform-delivered.
-- Body is the live alpha definition; only the marked blocks changed.
create or replace function public.process_checkout(p_listing_id uuid, p_buyer_id uuid default null::uuid, p_payment_method text default 'cod'::text, p_shipping_address jsonb default null::jsonb, p_offer_amount numeric default null::numeric, p_delivery_notes text default null::text, p_shipping_method text default 'managed'::text, p_bundle_item_ids uuid[] default null::uuid[], p_expected_total numeric default null::numeric)
 returns orders
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_is_service_role boolean := (coalesce(auth.role(), '') = 'service_role' or coalesce(auth.jwt()->>'role', '') = 'service_role');
  v_caller_id uuid := case
    when (coalesce(auth.role(), '') = 'service_role' or coalesce(auth.jwt()->>'role', '') = 'service_role')
      then coalesce(p_buyer_id, auth.uid())
    else auth.uid()
  end;
  v_listing public.listings;
  v_seller_id uuid;
  v_order public.orders;
  v_existing_order public.orders;
  v_accepted_offer public.offers;
  v_item_price_cents integer;
  v_shipping_fee_cents integer;
  v_fee_cents integer;
  v_total_cents integer;
  v_order_status text;
  v_session_id text;
  v_ordered_listing_ids uuid[];
  v_addon_ids uuid[];
  v_addon_ids_text text[];
  v_bundle_count integer;
  v_is_seller_mismatch boolean;
  v_bundle_subtotal_cents integer;
  v_bundle_discount_pct integer := 0;
  v_shipping_method text;
  v_now timestamptz := clock_timestamp();
begin
  if v_caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_payment_method not in ('card', 'cod') then
    raise exception 'Invalid payment method: %', p_payment_method using errcode = '22000';
  end if;
  if p_shipping_address is null then
    raise exception 'Shipping address is required' using errcode = '22000';
  end if;
  -- A card order is only real once Stripe has taken the money; the webhook creates those rows itself.
  if p_payment_method = 'card' and not v_is_service_role then
    raise exception 'Card payments must be completed through secure checkout' using errcode = '42501';
  end if;
  v_shipping_method := coalesce(p_shipping_method, 'managed');
  -- DB-002: only platform delivery is offered.
  if v_shipping_method <> 'managed' then
    raise exception 'Invalid shipping method: %', v_shipping_method using errcode = '22000';
  end if;
  -- DB-001: throttle COD checkouts. Taken first so its per-user lock also serialises the cap check below.
  if p_payment_method = 'cod' and not v_is_service_role then
    -- Same rule as the checkout screen: once spaces, dashes and brackets go, 10-15 digits with an optional leading +.
    if regexp_replace(coalesce(p_shipping_address->>'phone', ''), '[\s()-]', '', 'g') !~ '^\+?[0-9]{10,15}$' then
      raise exception 'Please enter a valid contact phone number (10 to 15 digits)' using errcode = '22000';
    end if;
    perform public.enforce_rate_limit('order_create', 10, interval '1 hour');
  end if;
  v_addon_ids := array(
    select distinct x from unnest(coalesce(p_bundle_item_ids, '{}'::uuid[])) as x
     where x is not null and x <> p_listing_id
  );
  v_addon_ids_text := array(select x::text from unnest(v_addon_ids) as x order by 1);
  v_ordered_listing_ids := array(
    select x from unnest(array_append(v_addon_ids, p_listing_id)) as x order by x
  );
  v_bundle_count := cardinality(v_ordered_listing_ids);
  perform 1 from public.listings where id = any(v_ordered_listing_ids) order by id for update;
  if (select count(*) from public.listings where id = any(v_ordered_listing_ids)) <> v_bundle_count then
    raise exception 'One or more items in the order were not found' using errcode = 'P0002';
  end if;
  select count(distinct seller_id) > 1, max(seller_id::text)::uuid
    into v_is_seller_mismatch, v_seller_id
    from public.listings
   where id = any(v_ordered_listing_ids);
  if v_is_seller_mismatch then
    raise exception 'All bundled items must be from the same seller' using errcode = '22000';
  end if;
  if v_seller_id = v_caller_id then
    raise exception 'You cannot buy your own listings' using errcode = '22000';
  end if;
  if exists (select 1 from public.listings where id = any(v_ordered_listing_ids) and is_sold) then
    raise exception '%', case when v_bundle_count = 1 then 'Listing is already sold'
                              else 'One or more items in the bundle are already sold' end
      using errcode = '22000';
  end if;
  select * into v_listing from public.listings where id = p_listing_id;
  select o.* into v_accepted_offer
    from public.offers o
    left join public.messages m on m.id = o.message_id
   where o.listing_id = p_listing_id
     and o.buyer_id = v_caller_id
     and o.seller_id = v_seller_id
     and o.status = 'accepted'
     and (o.expires_at > v_now or o.accepted_at > (v_now - interval '24 hours'))
     and array(
           select distinct x
             from jsonb_array_elements_text(
                    case when jsonb_typeof(m.metadata->'bundle_item_ids') = 'array'
                         then m.metadata->'bundle_item_ids' else '[]'::jsonb end) as x
            where x <> p_listing_id::text
            order by x
         ) = v_addon_ids_text
   order by o.accepted_at desc nulls last, o.created_at desc
   limit 1;
  select sum(round(price * 100))::integer
    into v_bundle_subtotal_cents
    from public.listings
   where id = any(v_ordered_listing_ids);
  if v_accepted_offer.id is not null then
    v_item_price_cents := round(v_accepted_offer.amount * 100)::integer;
  elsif v_bundle_count > 1 then
    select least(30, greatest(0, coalesce(bundle_discount_pct, 0)))
      into v_bundle_discount_pct
      from public.profiles
     where id = v_seller_id;
    v_item_price_cents := v_bundle_subtotal_cents
      - round(v_bundle_subtotal_cents * coalesce(v_bundle_discount_pct, 0) / 100.0)::integer;
  else
    v_item_price_cents := v_bundle_subtotal_cents;
  end if;
  -- Must match lib/fees.ts (6% Buyer Protection; Rs 130 / Rs 180 large parcel)
  v_fee_cents := (round(v_item_price_cents * 6 / 10000.0) * 100)::integer;
  v_shipping_fee_cents := case
    when v_listing.parcel_size = 'large' then 18000
    else 13000
  end;
  v_total_cents := v_item_price_cents + v_fee_cents + v_shipping_fee_cents;
  if p_expected_total is not null and abs(round(p_expected_total * 100) - v_total_cents) > 5 then
    raise exception 'Price has changed: expected total % PKR but calculated % PKR. Please review before proceeding.',
      p_expected_total, (v_total_cents / 100.0)
      using errcode = '22000';
  end if;
  if p_payment_method = 'cod' then
    v_order_status := 'pending';
    v_session_id := 'cod_' || gen_random_uuid()::text;
  else
    v_order_status := 'paid';
    v_session_id := 'pay_' || gen_random_uuid()::text;
  end if;
  select * into v_existing_order
    from public.orders
   where listing_id = p_listing_id
     and buyer_id = v_caller_id
     and status in ('awaiting_payment', 'pending')
   order by created_at desc
   limit 1
   for update;
  -- DB-001: cap open (not yet delivered) COD orders. Re-checking out the same order doesn't add one.
  -- A COD order stays status 'pending' until completed; delivery progress is fulfillment_status.
  if p_payment_method = 'cod' and not v_is_service_role
     and (select count(*) from public.orders
           where buyer_id = v_caller_id
             and payment_method = 'cod'
             and status = 'pending'
             and fulfillment_status in ('pending', 'packing', 'picked', 'shifting')
             and id is distinct from v_existing_order.id) >= 3 then
    raise exception 'You already have 3 cash on delivery orders on the way. Wait for one to arrive or cancel one before ordering more.'
      using errcode = '22000';
  end if;
  if v_existing_order.id is not null then
    update public.orders
       set amount_cents = v_item_price_cents,
           fee_cents = v_fee_cents,
           payment_method = p_payment_method,
           payment_status = case when p_payment_method = 'cod' then 'pending' else 'paid' end,
           status = v_order_status,
           fulfillment_status = 'pending',
           shipping_method = v_shipping_method,
           shipping_fee_cents = v_shipping_fee_cents,
           shipping_address = p_shipping_address,
           delivery_notes = coalesce(p_delivery_notes, delivery_notes),
           stripe_session_id = v_session_id,
           bundle_item_ids = case when v_bundle_count > 1 then v_addon_ids else null end,
           bundle_count = v_bundle_count
     where id = v_existing_order.id
    returning * into v_order;
  else
    insert into public.orders (
      listing_id, buyer_id, seller_id, amount_cents, fee_cents,
      status, fulfillment_status, payment_method, payment_status,
      shipping_method, shipping_fee_cents,
      shipping_address, delivery_notes, stripe_session_id,
      bundle_item_ids, bundle_count
    ) values (
      p_listing_id, v_caller_id, v_seller_id,
      v_item_price_cents, v_fee_cents,
      v_order_status, 'pending', p_payment_method,
      case when p_payment_method = 'cod' then 'pending' else 'paid' end,
      v_shipping_method, v_shipping_fee_cents,
      p_shipping_address, p_delivery_notes, v_session_id,
      case when v_bundle_count > 1 then v_addon_ids else null end,
      v_bundle_count
    ) returning * into v_order;
  end if;
  update public.listings
     set is_sold = true,
         reserved_until = null
   where id = any(v_ordered_listing_ids);
  update public.offers
     set status = 'declined',
         updated_at = v_now
   where listing_id = any(v_ordered_listing_ids)
     and id is distinct from v_accepted_offer.id
     and status in ('pending', 'accepted');
  -- cancelled_by is a uuid; a system cancellation leaves it null.
  update public.orders
     set status = 'canceled',
         fulfillment_status = 'canceled',
         cancel_reason = 'Item sold to another buyer',
         cancelled_by = null
   where listing_id = any(v_ordered_listing_ids)
     and id <> v_order.id
     and status = 'awaiting_payment';
  return v_order;
end;
$function$;

-- DB-012 / WF-001: a listing with order history can't be hard-deleted (orders and
-- transactions keep it for history), so a seller's delete hides it instead.
alter table public.listings add column if not exists deleted_at timestamptz;

create or replace function public.soft_delete_listing_with_history()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  -- Only client deletes; server paths (account deletion etc.) keep their behaviour.
  if current_setting('role') in ('anon', 'authenticated')
     and (exists (select 1 from public.orders
                   where listing_id = old.id or old.id = any(coalesce(bundle_item_ids, '{}'::uuid[])))
          or exists (select 1 from public.transactions where listing_id = old.id)) then
    update public.listings set deleted_at = now(), is_sold = true where id = old.id;
    -- A hard delete took its offers with it; close them instead, as a purchase does.
    update public.offers set status = 'canceled', updated_at = now()
     where listing_id = old.id and status in ('pending', 'accepted');
    perform set_config('ceranix.in_accept_offer', 'on', true);
    update public.messages m
       set offer_status = 'canceled'
     where m.kind = 'offer'
       and m.offer_status in ('pending', 'proposed', 'accepted')
       and (exists (select 1 from public.conversations c where c.id = m.conversation_id and c.listing_id = old.id)
            or exists (select 1 from public.offers f where f.message_id = m.id and f.listing_id = old.id)
            or m.metadata->>'base_listing_id' = old.id::text
            or (jsonb_typeof(m.metadata->'bundle_item_ids') = 'array' and m.metadata->'bundle_item_ids' ? old.id::text));
    perform set_config('ceranix.in_accept_offer', 'off', true);
    return null;
  end if;
  return old;
end;
$function$;

drop trigger if exists listings_soft_delete_with_history on public.listings;
create trigger listings_soft_delete_with_history
  before delete on public.listings
  for each row execute function public.soft_delete_listing_with_history();

-- Hidden from everyone except the buyer/seller on one of its orders.
alter policy "Listings viewable unless blocked" on public.listings
  using (
    ((deleted_at is null)
      and (seller_id <> '00000000-0000-0000-0000-000000000002'::uuid)
      and (not (seller_id = any ((select public.my_block_peers() as my_block_peers)::uuid[]))))
    or (exists (select 1
                  from public.orders o
                 where ((o.listing_id = listings.id) or (listings.id = any (coalesce(o.bundle_item_ids, '{}'::uuid[]))))
                   and (((select auth.uid() as uid) = o.buyer_id) or ((select auth.uid() as uid) = o.seller_id))))
  );

-- DB-012: a seller can undo their own manual "sold" while nothing but cancelled or
-- failed orders exist for it, and the listing isn't deleted.
create or replace function public.guard_listing_unsell()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if current_user in ('anon', 'authenticated') and old.is_sold and not new.is_sold
     and (new.deleted_at is not null
          or exists (select 1 from public.orders o
                      where (o.listing_id = old.id or old.id = any(coalesce(o.bundle_item_ids, '{}'::uuid[])))
                        and o.status not in ('canceled', 'failed'))) then
    raise exception 'A sold listing can only be relisted by Grabsty' using errcode = '42501';
  end if;
  return new;
end;
$function$;
