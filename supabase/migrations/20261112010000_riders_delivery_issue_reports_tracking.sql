-- Order workflow: riders, team-controlled delivery, issue reports, tracking.
--
-- 1. Riders. public.riders lists the accounts that deliver for Grabsty
--    (added by an admin). The courier page (/courier, /courier/<order id>)
--    now needs a signed-in rider: buyers, sellers and anonymous visitors get
--    nothing from it, and a rider can't handle an order they bought or sold.
-- 2. The rider who confirms the pickup is assigned to the order
--    (orders.rider_id) and is the one who confirms delivery, which marks the
--    order Delivered. Admins can do both as well.
-- 3. Buyers no longer complete orders ("Order received" is gone): an order
--    completes when the team completes it, or automatically 24h after delivery
--    (auto_complete_delivered_orders, unchanged) unless an issue was reported.
-- 4. report_order_issue: the buyer or seller describes a problem with an order
--    and attaches photos. It lands in the support team's cases (GS-<n>) with
--    the order attached; a buyer's report on an order in transit / delivered
--    also puts the payment on hold (the existing dispute).
-- 5. track_order: look an order up by its tracking ID (GRB-<ref>) or order
--    number. Returns status and timestamps only, no personal details.

-- ── 1. Riders ──────────────────────────────────────────────────────────────
create table if not exists public.riders (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  added_by uuid,
  created_at timestamptz not null default now()
);
alter table public.riders enable row level security;
drop policy if exists "Riders: own row or admin" on public.riders;
create policy "Riders: own row or admin" on public.riders
  for select to authenticated using ((select auth.uid()) = user_id or public.is_admin());
revoke all on public.riders from anon, authenticated;
grant select on public.riders to authenticated;
grant all on public.riders to service_role;

create or replace function public.is_rider()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (select 1 from public.riders where user_id = auth.uid())
$$;

create or replace function public.admin_set_rider(p_user_id uuid, p_is_rider boolean)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not public.is_admin() then
    raise exception 'Forbidden: caller is not an administrator' using errcode = '42501';
  end if;
  if p_is_rider then
    insert into public.riders (user_id, added_by) values (p_user_id, auth.uid())
    on conflict (user_id) do nothing;
  else
    delete from public.riders where user_id = p_user_id;
  end if;
  return p_is_rider;
end;
$function$;

alter table public.orders
  add column if not exists rider_id uuid references public.profiles(id) on delete set null;
create index if not exists orders_rider_idx on public.orders (rider_id) where rider_id is not null;

-- ── 5 (used below). Order number / tracking ID ─────────────────────────────
create or replace function public.order_reference(p_id uuid)
returns text
language sql
immutable
set search_path to ''
as $$ select upper(left(replace(p_id::text, '-', ''), 8)) $$;
create index if not exists orders_reference_idx on public.orders (public.order_reference(id));

-- ── 3. Only the team (or the rider flow) moves an order forward ────────────
create or replace function public.guard_platform_shipping()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  -- Server jobs (no user), the verified rider flow, and admins pass.
  if auth.uid() is null
     or coalesce(current_setting('app.courier_pickup', true), '') = 'verified'
     or coalesce((auth.jwt()->'app_metadata'->>'is_admin')::boolean, false)
     or coalesce((auth.jwt()->'app_metadata'->>'role') = 'admin', false)
     or coalesce((select is_admin from public.profiles where id = auth.uid()), false)
  then
    return new;
  end if;
  if new.fulfillment_status is distinct from old.fulfillment_status
     and new.fulfillment_status in ('picked', 'shifting', 'delivered') then
    raise exception 'Only the Grabsty logistics team can mark an order picked up, in transit or delivered'
      using errcode = '42501';
  end if;
  if new.status = 'completed' and old.status is distinct from 'completed' then
    raise exception 'Orders are completed by the Grabsty team after delivery. If something is wrong, report an issue.'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_guard_platform_shipping on public.orders;
create trigger trg_guard_platform_shipping
  before update of fulfillment_status, status on public.orders
  for each row execute function public.guard_platform_shipping();

-- The 20h reminder no longer tells the buyer to confirm.
do $do$
declare
  v_def text;
begin
  select pg_get_functiondef('public.auto_complete_delivered_orders()'::regprocedure) into v_def;
  execute replace(v_def,
    'Did your order arrive OK? Confirm it or report a problem.',
    'Did your order arrive OK? If something is wrong, report an issue now.');
end
$do$;

-- ── 2. Rider pickup + delivery ─────────────────────────────────────────────
-- What the rider page shows. Nothing for anyone who isn't a rider or admin.
-- The buyer's delivery details are returned only to the assigned rider (or an
-- admin) while the order is in transit.
create or replace function public.courier_pickup_info(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_staff boolean := public.is_admin();
  v_order public.orders;
  v_pickup public.order_seller_pickups;
  v_contact public.order_delivery_contacts;
  v_title text;
  v_image text;
  v_state text;
  v_mine boolean;
begin
  if v_uid is null then
    return jsonb_build_object('state', 'signin');
  end if;
  if not (v_staff or public.is_rider()) then
    return jsonb_build_object('state', 'forbidden');
  end if;
  select * into v_order from public.orders where id = p_order_id;
  if not found then
    return jsonb_build_object('state', 'not_found');
  end if;
  if v_uid in (v_order.buyer_id, v_order.seller_id) then
    return jsonb_build_object('state', 'forbidden');
  end if;
  select * into v_pickup from public.order_seller_pickups where order_id = p_order_id;
  select l.title, l.images[1] into v_title, v_image from public.listings l where l.id = v_order.listing_id;
  v_mine := v_staff or v_order.rider_id = v_uid;
  v_state := case
    when v_order.status in ('canceled', 'refunded', 'refund_due', 'failed') or v_order.fulfillment_status = 'canceled' then 'closed'
    when v_order.status = 'disputed' or v_order.fulfillment_status = 'disputed' then 'on_hold'
    when v_order.fulfillment_status in ('delivered', 'completed') then 'delivered'
    when v_order.fulfillment_status = 'shifting' then case when v_mine then 'in_transit' else 'other_rider' end
    when v_order.fulfillment_status in ('packing', 'picked') and v_pickup.pickup_code is not null then
      case when v_pickup.pickup_code_attempts >= 5 then 'locked' else 'ready' end
    else 'not_ready'
  end;
  if v_state = 'in_transit' then
    select * into v_contact from public.order_delivery_contacts where order_id = p_order_id;
  end if;
  return jsonb_build_object(
    'state', v_state,
    'reference', public.order_reference(v_order.id),
    'title', v_title,
    'image', v_image,
    'city', v_pickup.pickup_address->>'city',
    'attempts_left', greatest(0, 5 - coalesce(v_pickup.pickup_code_attempts, 0)),
    'picked_up_at', v_pickup.pickup_verified_at,
    'delivered_at', v_order.delivered_at,
    'cod', v_order.payment_method = 'cod',
    'delivery', case when v_state = 'in_transit' then jsonb_build_object(
      'name', coalesce(v_contact.address->>'recipientName', v_contact.address->>'recipient_name', v_contact.address->>'full_name'),
      'line1', v_contact.address->>'line1',
      'line2', v_contact.address->>'line2',
      'city', coalesce(v_contact.address->>'city', v_order.shipping_address->>'city'),
      'postal_code', coalesce(v_contact.address->>'postalCode', v_contact.address->>'postal_code'),
      'phone', v_contact.address->>'phone',
      'notes', coalesce(v_contact.delivery_notes, v_contact.address->>'deliveryInstructions', v_contact.address->>'delivery_notes')
    ) else null end
  );
end;
$function$;

create or replace function public.courier_confirm_pickup(p_order_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_staff boolean := public.is_admin();
  v_order public.orders;
  v_pickup public.order_seller_pickups;
  v_conv_id uuid;
  v_now timestamptz := clock_timestamp();
  v_code text := regexp_replace(coalesce(p_code, ''), '[^0-9]', '', 'g');
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'state', 'signin');
  end if;
  if not (v_staff or public.is_rider()) then
    return jsonb_build_object('ok', false, 'state', 'forbidden');
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'state', 'not_found');
  end if;
  if v_uid in (v_order.buyer_id, v_order.seller_id) then
    return jsonb_build_object('ok', false, 'state', 'forbidden');
  end if;
  if v_order.fulfillment_status in ('delivered', 'completed') then
    return jsonb_build_object('ok', true, 'state', 'delivered', 'already', true);
  end if;
  if v_order.fulfillment_status = 'shifting' then
    return jsonb_build_object('ok', true, 'already', true,
      'state', case when v_staff or v_order.rider_id = v_uid then 'in_transit' else 'other_rider' end);
  end if;
  if v_order.status in ('canceled', 'refunded', 'refund_due', 'failed', 'completed', 'disputed')
     or v_order.fulfillment_status not in ('packing', 'picked') then
    return jsonb_build_object('ok', false, 'state', 'not_ready');
  end if;

  select * into v_pickup from public.order_seller_pickups where order_id = p_order_id for update;
  if v_pickup.pickup_code is null then
    return jsonb_build_object('ok', false, 'state', 'not_ready');
  end if;
  if v_pickup.pickup_code_attempts >= 5 then
    return jsonb_build_object('ok', false, 'state', 'locked', 'attempts_left', 0);
  end if;
  if v_code <> v_pickup.pickup_code then
    update public.order_seller_pickups
       set pickup_code_attempts = pickup_code_attempts + 1, updated_at = v_now
     where order_id = p_order_id;
    return jsonb_build_object(
      'ok', false,
      'state', case when v_pickup.pickup_code_attempts + 1 >= 5 then 'locked' else 'wrong_code' end,
      'attempts_left', greatest(0, 4 - v_pickup.pickup_code_attempts)
    );
  end if;

  perform set_config('app.courier_pickup', 'verified', true);
  update public.orders
     set fulfillment_status = 'shifting',
         escrow_status = 'IN_TRANSIT',
         rider_id = v_uid,
         shifted_at = coalesce(shifted_at, v_now),
         shipped_at = coalesce(shipped_at, v_now)
   where id = p_order_id;
  perform set_config('app.courier_pickup', 'off', true);

  update public.order_seller_pickups
     set pickup_verified_at = v_now, updated_at = v_now
   where order_id = p_order_id;

  update public.transactions
     set status = 'IN_TRANSIT',
         picked_up_at = coalesce(picked_up_at, v_now),
         updated_at = v_now
   where order_id = p_order_id
     and status not in ('COMPLETED_FUNDS_RELEASED', 'CANCELLED');

  select id into v_conv_id
    from public.conversations
   where listing_id = v_order.listing_id
     and ((buyer_id = v_order.buyer_id and seller_id = v_order.seller_id) or (buyer_id = v_order.seller_id and seller_id = v_order.buyer_id))
   limit 1;
  if v_conv_id is not null then
    insert into public.messages (conversation_id, sender_id, content, kind, metadata)
    values (v_conv_id, v_order.seller_id,
            'Courier picked up the package. It is now in transit.' || E'\nTracking ID: GRB-' || public.order_reference(p_order_id),
            'system',
            jsonb_build_object('order_id', p_order_id, 'fulfillment_status', 'shifting',
                               'verified_by', 'pickup_code', 'updated_at', v_now));
  end if;

  return jsonb_build_object('ok', true, 'state', 'in_transit');
end;
$function$;

-- The assigned rider (or an admin) confirms the handover: order -> Delivered.
create or replace function public.courier_confirm_delivery(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_staff boolean := public.is_admin();
  v_order public.orders;
  v_conv_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'state', 'signin');
  end if;
  if not (v_staff or public.is_rider()) then
    return jsonb_build_object('ok', false, 'state', 'forbidden');
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'state', 'not_found');
  end if;
  if v_uid in (v_order.buyer_id, v_order.seller_id) then
    return jsonb_build_object('ok', false, 'state', 'forbidden');
  end if;
  if v_order.fulfillment_status in ('delivered', 'completed') then
    return jsonb_build_object('ok', true, 'state', 'delivered', 'already', true);
  end if;
  if v_order.status in ('canceled', 'refunded', 'refund_due', 'failed') or v_order.fulfillment_status = 'canceled' then
    return jsonb_build_object('ok', false, 'state', 'closed');
  end if;
  if v_order.status = 'disputed' or v_order.fulfillment_status = 'disputed' then
    return jsonb_build_object('ok', false, 'state', 'on_hold');
  end if;
  if v_order.fulfillment_status <> 'shifting' then
    return jsonb_build_object('ok', false, 'state', 'not_ready');
  end if;
  if not v_staff and v_order.rider_id is distinct from v_uid then
    return jsonb_build_object('ok', false, 'state', 'other_rider');
  end if;

  perform set_config('app.courier_pickup', 'verified', true);
  update public.orders
     set fulfillment_status = 'delivered',
         escrow_status = 'DELIVERED',
         delivered_at = coalesce(delivered_at, v_now)
   where id = p_order_id;
  perform set_config('app.courier_pickup', 'off', true);

  update public.transactions
     set status = 'DELIVERED',
         delivered_at = coalesce(delivered_at, v_now),
         updated_at = v_now
   where order_id = p_order_id
     and status not in ('COMPLETED_FUNDS_RELEASED', 'CANCELLED', 'DISPUTED');

  select id into v_conv_id
    from public.conversations
   where listing_id = v_order.listing_id
     and ((buyer_id = v_order.buyer_id and seller_id = v_order.seller_id) or (buyer_id = v_order.seller_id and seller_id = v_order.buyer_id))
   limit 1;
  if v_conv_id is not null then
    insert into public.messages (conversation_id, sender_id, content, kind, metadata)
    values (v_conv_id, v_order.seller_id,
            'Package delivered. Check your item: if something is wrong, report an issue within 24 hours.',
            'system',
            jsonb_build_object('order_id', p_order_id, 'fulfillment_status', 'delivered',
                               'verified_by', 'rider', 'updated_at', v_now));
  end if;

  return jsonb_build_object('ok', true, 'state', 'delivered');
end;
$function$;

-- The rider's own list: what they are carrying and what they delivered lately.
create or replace function public.rider_deliveries()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('state', 'signin');
  end if;
  if not (public.is_admin() or public.is_rider()) then
    return jsonb_build_object('state', 'forbidden');
  end if;
  return jsonb_build_object(
    'state', 'ok',
    'items', coalesce((
      select jsonb_agg(x order by x.active desc, x.at desc)
        from (
          select o.id,
                 public.order_reference(o.id) as reference,
                 l.title,
                 l.images[1] as image,
                 o.shipping_address->>'city' as city,
                 (o.fulfillment_status = 'shifting' and o.status not in ('canceled', 'refunded', 'refund_due', 'failed', 'disputed')) as active,
                 case when o.status in ('canceled', 'refunded', 'refund_due', 'failed') or o.fulfillment_status = 'canceled' then 'closed'
                      when o.status = 'disputed' or o.fulfillment_status = 'disputed' then 'on_hold'
                      when o.fulfillment_status = 'shifting' then 'in_transit'
                      else 'delivered' end as state,
                 coalesce(o.delivered_at, o.shipped_at, o.created_at) as at
            from public.orders o
            left join public.listings l on l.id = o.listing_id
           where o.rider_id = v_uid
             and coalesce(o.delivered_at, o.shipped_at, o.created_at) > now() - interval '30 days'
           order by coalesce(o.delivered_at, o.shipped_at, o.created_at) desc
           limit 60
        ) x
    ), '[]'::jsonb)
  );
end;
$function$;

-- ── 4. Report an issue ─────────────────────────────────────────────────────
create or replace function public.report_order_issue(
  p_order_id uuid,
  p_category text,
  p_description text,
  p_image_urls text[] default '{}'::text[]
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
  v_case public.support_cases;
  v_desc text := btrim(coalesce(p_description, ''));
  v_urls text[] := coalesce(p_image_urls, '{}'::text[]);
  v_label text;
  v_full text;
  v_url text;
  v_hold boolean := false;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select * into v_order from public.orders where id = p_order_id;
  if not found or v_uid not in (v_order.buyer_id, v_order.seller_id) then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  v_label := case p_category
    when 'damaged' then 'Item arrived damaged'
    when 'not_as_described' then 'Item not as described'
    when 'wrong_item' then 'Wrong item received'
    when 'missing' then 'Item or parts missing'
    when 'not_delivered' then 'Order not delivered'
    when 'pickup' then 'Problem with courier pickup'
    when 'payment' then 'Payment or payout problem'
    when 'other' then 'Something else'
  end;
  if v_label is null then
    raise exception 'Choose what went wrong' using errcode = '22000';
  end if;
  if char_length(v_desc) < 10 then
    raise exception 'Describe the issue in a few words (at least 10 characters)' using errcode = '22000';
  end if;
  if coalesce(array_length(v_urls, 1), 0) > 6 then
    raise exception 'Attach up to 6 photos' using errcode = '22000';
  end if;
  foreach v_url in array v_urls loop
    if v_url !~ '^https://[a-z0-9.-]+/storage/v1/object/public/listing-images/' or char_length(v_url) > 500 then
      raise exception 'One of the photos could not be attached. Remove it and try again.' using errcode = '22000';
    end if;
  end loop;
  v_desc := left(v_desc, 1500);
  v_full := 'Order #' || public.order_reference(p_order_id) || ' · ' || v_label
            || ' (' || case when v_uid = v_order.buyer_id then 'buyer' else 'seller' end || E')\n' || v_desc;

  -- A buyer's report while the parcel is in transit / inside the 24h check
  -- window also holds the payment. Outside it the case is still filed.
  if v_uid = v_order.buyer_id
     and v_order.fulfillment_status in ('shifting', 'delivered')
     and v_order.status not in ('completed', 'canceled', 'refunded', 'refund_due', 'failed', 'disputed') then
    begin
      perform public.open_order_dispute(p_order_id, v_label || ': ' || left(v_desc, 300), v_urls);
      v_hold := true;
    exception when others then
      v_hold := false;
    end;
  end if;

  select * into v_case from public.support_cases where user_id = v_uid and status = 'open';
  if found then
    insert into public.messages (conversation_id, sender_id, content, kind, metadata)
    values (v_case.conversation_id, v_uid, v_full, 'text',
            jsonb_build_object('support_case_id', v_case.id, 'issue_order_id', p_order_id, 'issue_category', p_category));
  else
    v_case := public.open_support_case(v_uid, v_full, 'order_issue', p_order_id);
  end if;
  foreach v_url in array v_urls loop
    insert into public.messages (conversation_id, sender_id, content, kind, metadata)
    values (v_case.conversation_id, v_uid, v_url, 'text',
            jsonb_build_object('image_url', v_url, 'support_case_id', v_case.id, 'issue_order_id', p_order_id));
  end loop;

  return jsonb_build_object(
    'case_number', v_case.case_number,
    'case_label', public.support_case_label(v_case.case_number),
    'payment_on_hold', v_hold
  );
end;
$function$;

-- ── 5. Tracking lookup ─────────────────────────────────────────────────────
-- By tracking ID (GRB-<ref>), order number (<ref>) or a courier's own tracking
-- number. Status only: no names, addresses or phone numbers.
create or replace function public.track_order(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_ref text;
  v_order public.orders;
  v_title text;
  v_image text;
begin
  if char_length(v_code) < 8 or char_length(v_code) > 40 then
    return jsonb_build_object('found', false);
  end if;
  v_ref := regexp_replace(regexp_replace(v_code, '^(ORDER)?\s*#?\s*', ''), '^GRB-?', '');
  if v_ref ~ '^[0-9A-F]{8}$' then
    select * into v_order from public.orders o
     where public.order_reference(o.id) = v_ref and o.status <> 'awaiting_payment'
     order by o.created_at desc limit 1;
  end if;
  if v_order.id is null then
    -- ponytail: unindexed scan on a courier's own number; add an index on
    -- upper(tracking_number) if orders grows large.
    select * into v_order from public.orders o
     where upper(btrim(o.tracking_number)) = v_code and o.status <> 'awaiting_payment'
     order by o.created_at desc limit 1;
  end if;
  if v_order.id is null then
    return jsonb_build_object('found', false);
  end if;
  select l.title, l.images[1] into v_title, v_image from public.listings l where l.id = v_order.listing_id;
  return jsonb_build_object(
    'found', true,
    'reference', public.order_reference(v_order.id),
    'tracking_id', 'GRB-' || public.order_reference(v_order.id),
    'courier_tracking_number', nullif(btrim(v_order.tracking_number), ''),
    'courier', v_order.courier_name,
    'state', case
      when v_order.status in ('canceled', 'refunded', 'refund_due', 'failed') or v_order.fulfillment_status = 'canceled' then 'cancelled'
      when v_order.status = 'disputed' or v_order.fulfillment_status = 'disputed' then 'under_review'
      when v_order.status = 'completed' or v_order.fulfillment_status = 'completed' then 'completed'
      when v_order.fulfillment_status = 'delivered' then 'delivered'
      when v_order.fulfillment_status = 'shifting' then 'in_transit'
      when v_order.fulfillment_status in ('packing', 'picked') then 'ready'
      else 'placed' end,
    'title', v_title,
    'image', v_image,
    'city', v_order.shipping_address->>'city',
    'placed_at', v_order.created_at,
    'ready_at', v_order.packed_at,
    'picked_up_at', coalesce(v_order.shipped_at, v_order.shifted_at),
    'delivered_at', v_order.delivered_at,
    'completed_at', v_order.completed_at
  );
end;
$function$;

-- ── Grants (new client-callable functions are granted explicitly) ──────────
revoke execute on function public.is_rider() from public, anon;
revoke execute on function public.admin_set_rider(uuid, boolean) from public, anon;
revoke execute on function public.courier_pickup_info(uuid) from public, anon;
revoke execute on function public.courier_confirm_pickup(uuid, text) from public, anon;
revoke execute on function public.courier_confirm_delivery(uuid) from public, anon;
revoke execute on function public.rider_deliveries() from public, anon;
revoke execute on function public.report_order_issue(uuid, text, text, text[]) from public, anon;
revoke execute on function public.track_order(text) from public;
revoke execute on function public.order_reference(uuid) from public, anon;
grant execute on function public.is_rider() to authenticated, service_role;
grant execute on function public.admin_set_rider(uuid, boolean) to authenticated, service_role;
grant execute on function public.courier_pickup_info(uuid) to authenticated, service_role;
grant execute on function public.courier_confirm_pickup(uuid, text) to authenticated, service_role;
grant execute on function public.courier_confirm_delivery(uuid) to authenticated, service_role;
grant execute on function public.rider_deliveries() to authenticated, service_role;
grant execute on function public.report_order_issue(uuid, text, text, text[]) to authenticated, service_role;
grant execute on function public.track_order(text) to anon, authenticated, service_role;
grant execute on function public.order_reference(uuid) to authenticated, service_role;
