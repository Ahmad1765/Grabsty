-- Order workflow: courier pickup code, one-time Ready to deliver, seller
-- cancel lock, and buyer delivery details hidden from sellers.
--
-- 1. Buyer address / phone / delivery note leave public.orders. Sellers can
--    read their order rows (and receive realtime + RPC copies of them), so
--    the only way to never disclose these is to not keep them there. They
--    move to order_delivery_contacts (buyer + admins only). The order keeps
--    city + country, which is all the seller-side UI and analytics use.
--    Stripping happens in a BEFORE INSERT trigger so the full address never
--    reaches the WAL / realtime stream either.
-- 2. Ready to deliver (fulfillment -> packing) is one-time: re-booking is
--    rejected, and a random 6-digit pickup code is generated for it.
-- 3. The seller can no longer cancel once Ready to deliver is confirmed
--    (the buyer's rules are unchanged).
-- 4. Couriers scan the Pickup QR (opens /courier/<order id>) and enter the
--    code: courier_confirm_pickup locks the order as In Transit. Wrong codes
--    are counted; after 5 the code locks and logistics has to step in.

-- ── 1. Private delivery details ────────────────────────────────────────────
create table if not exists public.order_delivery_contacts (
  order_id uuid primary key
    references public.orders(id) on delete cascade deferrable initially deferred,
  buyer_id uuid not null,
  address jsonb not null default '{}'::jsonb,
  delivery_notes text,
  created_at timestamptz not null default now()
);

alter table public.order_delivery_contacts enable row level security;

drop policy if exists "Buyer and admins read delivery contacts" on public.order_delivery_contacts;
create policy "Buyer and admins read delivery contacts" on public.order_delivery_contacts
  for select to authenticated
  using ((select auth.uid()) = buyer_id or public.is_admin());

revoke all on public.order_delivery_contacts from anon, authenticated;
grant select on public.order_delivery_contacts to authenticated;
grant all on public.order_delivery_contacts to service_role;

-- Keys that are safe on the order row (seller-visible).
create or replace function public.public_order_address(p jsonb)
returns jsonb
language sql
immutable
set search_path to ''
as $$
  select case when p is null or jsonb_typeof(p) <> 'object' then p
              else jsonb_strip_nulls(jsonb_build_object('city', p->'city', 'country', p->'country'))
         end
$$;

create or replace function public.stash_order_delivery_contact()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.shipping_address is not null
     and jsonb_typeof(new.shipping_address) = 'object'
     and new.shipping_address <> public.public_order_address(new.shipping_address) then
    insert into public.order_delivery_contacts (order_id, buyer_id, address, delivery_notes)
    values (new.id, new.buyer_id, new.shipping_address, new.delivery_notes)
    on conflict (order_id) do update
      set address = excluded.address,
          delivery_notes = coalesce(excluded.delivery_notes, public.order_delivery_contacts.delivery_notes);
    new.shipping_address := public.public_order_address(new.shipping_address);
    new.delivery_notes := null;
  elsif new.delivery_notes is not null then
    insert into public.order_delivery_contacts (order_id, buyer_id, delivery_notes)
    values (new.id, new.buyer_id, new.delivery_notes)
    on conflict (order_id) do update set delivery_notes = excluded.delivery_notes;
    new.delivery_notes := null;
  end if;
  -- Account deletion nulls the address on the order: drop the private copy too.
  if tg_op = 'UPDATE' and new.shipping_address is null and old.shipping_address is not null then
    delete from public.order_delivery_contacts where order_id = new.id;
  end if;
  return new;
end;
$function$;

-- "zz_" so it runs after guard_new_order / pakistan_only_orders, which
-- validate the full address.
drop trigger if exists zz_stash_order_delivery_contact on public.orders;
create trigger zz_stash_order_delivery_contact
  before insert or update of shipping_address, delivery_notes on public.orders
  for each row execute function public.stash_order_delivery_contact();

-- Backfill existing orders (the trigger moves and strips them).
update public.orders
   set shipping_address = shipping_address
 where shipping_address is not null
   and jsonb_typeof(shipping_address) = 'object'
   and shipping_address <> public.public_order_address(shipping_address);
update public.orders set delivery_notes = delivery_notes where delivery_notes is not null;

-- ── 2. Pickup code ─────────────────────────────────────────────────────────
alter table public.order_seller_pickups
  add column if not exists pickup_code text,
  add column if not exists pickup_code_attempts integer not null default 0,
  add column if not exists pickup_verified_at timestamptz;

create or replace function public.new_pickup_code()
returns text
language sql
volatile
set search_path to ''
as $$
  select lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0')
$$;
revoke execute on function public.new_pickup_code() from public, anon, authenticated;

create or replace function public.advance_order_fulfillment(
  p_order_id uuid,
  p_target_status text,
  p_courier text default null,
  p_tracking_number text default null,
  p_supplier_order_id text default null,
  p_supplier_name text default null,
  p_seller_pickup_address jsonb default null
)
returns public.orders
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_caller_id uuid := auth.uid();
  v_order public.orders;
  v_is_admin boolean := false;
  v_conv_id uuid;
  v_system_msg text;
  v_now timestamptz := clock_timestamp();
begin
  if v_caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  v_is_admin := coalesce((select is_admin from public.profiles where id = v_caller_id), false);

  if p_target_status in ('packing', 'picked', 'shifting') then
    if v_caller_id <> v_order.seller_id and not v_is_admin then
      raise exception 'Only the verified seller or admin may advance fulfillment to %', p_target_status using errcode = '42501';
    end if;
  elsif p_target_status in ('delivered', 'completed') then
    if v_caller_id <> v_order.buyer_id and not v_is_admin then
      raise exception 'Only the verified buyer or admin may confirm delivery or completion' using errcode = '42501';
    end if;
    if p_target_status = 'completed' and not v_is_admin then
      raise exception 'Confirm receipt (or COD payment) to complete this order' using errcode = '42501';
    end if;
  else
    raise exception 'Invalid target fulfillment status: %', p_target_status using errcode = '22000';
  end if;

  if v_order.status in ('completed', 'canceled', 'refunded', 'refund_due', 'failed', 'disputed') then
    raise exception 'Order is % and can no longer be updated', v_order.status using errcode = '22000';
  end if;

  -- Ready to deliver is one-time: it can't be undone or booked again.
  if p_target_status = 'packing' and not v_is_admin then
    if v_order.fulfillment_status in ('packing', 'picked', 'shifting', 'delivered', 'completed') then
      raise exception 'Pickup is already booked for this order' using errcode = '22000';
    end if;
    if coalesce(v_order.shipping_method, 'managed') = 'managed' and (
         p_seller_pickup_address is null
      or coalesce(btrim(p_seller_pickup_address->>'line1'), '') = ''
      or coalesce(btrim(p_seller_pickup_address->>'city'), '') = ''
      or coalesce(btrim(p_seller_pickup_address->>'phone'), '') = ''
    ) then
      raise exception 'Add your pickup address and phone so the courier can collect the item' using errcode = '22000';
    end if;
  end if;

  if p_target_status in ('packing', 'picked') then
    if v_order.fulfillment_status not in ('pending', 'awaiting_payment', 'packing', 'picked') then
      raise exception 'Cannot advance to % from %', p_target_status, v_order.fulfillment_status using errcode = '22000';
    end if;
  elsif p_target_status = 'shifting' then
    if v_order.fulfillment_status not in ('pending', 'awaiting_payment', 'packing', 'picked', 'shifting') then
      raise exception 'Cannot advance to shifting from %', v_order.fulfillment_status using errcode = '22000';
    end if;
  elsif p_target_status = 'delivered' then
    if v_order.fulfillment_status not in ('packing', 'picked', 'shifting', 'delivered') then
      raise exception 'Cannot mark delivered from %', v_order.fulfillment_status using errcode = '22000';
    end if;
  elsif p_target_status = 'completed' then
    if v_order.fulfillment_status not in ('delivered', 'shifting', 'completed') then
      raise exception 'Cannot complete order from %', v_order.fulfillment_status using errcode = '22000';
    end if;
  end if;

  update public.orders
     set fulfillment_status = p_target_status,
         status = case when p_target_status = 'completed' then 'completed' else status end,
         escrow_status = case
           when p_target_status in ('packing', 'picked') then 'READY_FOR_PICKUP'
           when p_target_status = 'shifting' then 'IN_TRANSIT'
           when p_target_status = 'delivered' then 'DELIVERED'
           when p_target_status = 'completed' then 'COMPLETED_FUNDS_RELEASED'
           else escrow_status
         end,
         packed_at = case when p_target_status in ('packing', 'picked') then coalesce(packed_at, v_now) else packed_at end,
         shifted_at = case when p_target_status = 'shifting' then coalesce(shifted_at, v_now) else shifted_at end,
         shipped_at = case when p_target_status = 'shifting' then coalesce(shipped_at, v_now) else shipped_at end,
         delivered_at = case when p_target_status in ('delivered', 'completed') then coalesce(delivered_at, v_now) else delivered_at end,
         completed_at = case when p_target_status = 'completed' then coalesce(completed_at, v_now) else completed_at end,
         courier_name = coalesce(p_courier, courier_name),
         tracking_number = coalesce(p_tracking_number, tracking_number),
         supplier_order_id = coalesce(p_supplier_order_id, supplier_order_id),
         supplier_name = coalesce(p_supplier_name, supplier_name)
   where id = p_order_id
  returning * into v_order;

  if p_seller_pickup_address is not null then
    insert into public.order_seller_pickups (order_id, seller_id, pickup_address)
    values (p_order_id, v_order.seller_id, p_seller_pickup_address)
    on conflict (order_id) do update
      set pickup_address = excluded.pickup_address,
          updated_at = v_now;
  end if;

  -- One code per booking, generated server-side.
  if p_target_status = 'packing' then
    update public.order_seller_pickups
       set pickup_code = coalesce(pickup_code, public.new_pickup_code()),
           updated_at = v_now
     where order_id = p_order_id;
  end if;

  update public.transactions
     set status = case
           when p_target_status in ('packing', 'picked') then 'READY_FOR_PICKUP'
           when p_target_status = 'shifting' then 'IN_TRANSIT'
           when p_target_status = 'delivered' then 'DELIVERED'
           when p_target_status = 'completed' then 'COMPLETED_FUNDS_RELEASED'
           else status
         end,
         ready_for_pickup_at = case when p_target_status in ('packing', 'picked') then coalesce(ready_for_pickup_at, v_now) else ready_for_pickup_at end,
         picked_up_at = case when p_target_status in ('picked', 'shifting') then coalesce(picked_up_at, v_now) else picked_up_at end,
         delivered_at = case when p_target_status in ('delivered', 'completed') then coalesce(delivered_at, v_now) else delivered_at end,
         funds_released_at = case when p_target_status = 'completed' then coalesce(funds_released_at, v_now) else funds_released_at end,
         courier_name = coalesce(p_courier, courier_name),
         tracking_number = coalesce(p_tracking_number, tracking_number),
         updated_at = v_now
   where order_id = p_order_id;

  select id into v_conv_id
    from public.conversations
   where listing_id = v_order.listing_id
     and ((buyer_id = v_order.buyer_id and seller_id = v_order.seller_id) or (buyer_id = v_order.seller_id and seller_id = v_order.buyer_id))
   limit 1;

  if v_conv_id is not null then
    v_system_msg := case
      when p_target_status = 'packing' then 'Seller is ready to deliver. Courier pickup booked.'
      when p_target_status = 'picked' then 'Package picked up by the courier.'
      when p_target_status = 'shifting' then 'Package is in transit.' ||
        case when v_order.courier_name is not null then E'\nCourier: ' || v_order.courier_name else '' end ||
        case when v_order.tracking_number is not null and length(trim(v_order.tracking_number)) > 0 then E'\nTracking #: ' || v_order.tracking_number else '' end
      when p_target_status = 'delivered' then 'Package delivered. Please inspect your item within 24 hours.'
      when p_target_status = 'completed' then 'Order completed. Buyer confirmed receipt and condition.'
      else null
    end;

    if v_system_msg is not null then
      insert into public.messages (conversation_id, sender_id, content, kind, metadata)
      values (
        v_conv_id, v_caller_id, v_system_msg, 'system',
        jsonb_build_object(
          'order_id', p_order_id,
          'fulfillment_status', p_target_status,
          'courier', v_order.courier_name,
          'tracking_number', v_order.tracking_number,
          'updated_at', v_now
        )
      );
    end if;
  end if;

  return v_order;
end;
$function$;

-- ── 3. Seller can't cancel after Ready to deliver ──────────────────────────
create or replace function public.cancel_order(p_order_id uuid, p_reason text default 'Buyer requested cancellation')
returns public.orders
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_caller_id uuid := auth.uid();
  v_order public.orders;
  v_conv_id uuid;
  v_caller_role text;
  v_target_status text;
  v_now timestamptz := clock_timestamp();
begin
  if v_caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if v_order.buyer_id <> v_caller_id and v_order.seller_id <> v_caller_id then
    raise exception 'Only the buyer or seller can cancel this order' using errcode = '42501';
  end if;
  if v_order.status in ('completed', 'refunded', 'canceled', 'refund_due', 'failed') then
    raise exception 'Order is already %', v_order.status using errcode = '22000';
  end if;
  if v_order.status = 'disputed' or v_order.fulfillment_status = 'disputed' then
    raise exception 'This order is under dispute review and cannot be cancelled' using errcode = '22000';
  end if;
  if v_order.shipped_at is not null
     or v_order.fulfillment_status in ('picked', 'shifting', 'delivered', 'completed') then
    raise exception 'Cannot cancel an order that has already been picked up or shipped' using errcode = '22000';
  end if;
  if v_caller_id = v_order.seller_id and v_order.buyer_id <> v_caller_id
     and v_order.fulfillment_status = 'packing' then
    raise exception 'You confirmed Ready to deliver, so you can no longer cancel this order. Contact support if something is wrong.'
      using errcode = '22000';
  end if;
  v_caller_role := case when v_caller_id = v_order.buyer_id then 'Buyer' else 'Seller' end;
  v_target_status := case when v_order.status = 'paid' then 'refund_due' else 'canceled' end;
  update public.orders
     set status = v_target_status,
         fulfillment_status = 'canceled',
         escrow_status = 'CANCELLED',
         cancel_reason = p_reason,
         cancelled_by = v_caller_id
   where id = p_order_id
  returning * into v_order;
  update public.listings
     set is_sold = false,
         reserved_until = null
   where id = v_order.listing_id
      or id = any(coalesce(v_order.bundle_item_ids, '{}'::uuid[]));
  update public.transactions
     set status = 'CANCELLED',
         cancelled_at = coalesce(cancelled_at, v_now),
         cancel_reason = coalesce(p_reason, cancel_reason),
         cancelled_by = v_caller_id,
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
    values (
      v_conv_id, v_caller_id,
      'Order cancelled by ' || v_caller_role || E'\nReason: ' || coalesce(p_reason, 'No reason specified') ||
      case when v_target_status = 'canceled' then E'\nThe item is now available again.' else '' end,
      'system',
      jsonb_build_object('order_id', p_order_id, 'status', v_order.status,
                         'reason', p_reason, 'cancelled_by_role', v_caller_role)
    );
  end if;
  return v_order;
end;
$function$;

-- ── 4. Courier pickup ──────────────────────────────────────────────────────
-- The shipping guard lets a verified courier pickup through.
create or replace function public.guard_platform_shipping()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.fulfillment_status is distinct from old.fulfillment_status
     and new.fulfillment_status in ('picked', 'shifting', 'delivered')
     and auth.uid() is not null
     and coalesce(current_setting('app.courier_pickup', true), '') <> 'verified'
     and not coalesce((auth.jwt()->'app_metadata'->>'is_admin')::boolean, false)
     and not coalesce((auth.jwt()->'app_metadata'->>'role') = 'admin', false)
     and not coalesce((select is_admin from public.profiles where id = auth.uid()), false)
  then
    raise exception 'Only the Grabsty logistics team can mark an order picked up, in transit or delivered'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

-- What the courier page shows: no buyer or seller personal data.
create or replace function public.courier_pickup_info(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_order public.orders;
  v_pickup public.order_seller_pickups;
  v_title text;
  v_image text;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found then
    return jsonb_build_object('state', 'not_found');
  end if;
  select * into v_pickup from public.order_seller_pickups where order_id = p_order_id;
  select l.title, l.images[1] into v_title, v_image from public.listings l where l.id = v_order.listing_id;
  return jsonb_build_object(
    'state', case
      when v_order.status in ('canceled', 'refunded', 'refund_due', 'failed') or v_order.fulfillment_status = 'canceled' then 'closed'
      when v_order.fulfillment_status in ('shifting', 'delivered', 'completed') then 'in_transit'
      when v_order.fulfillment_status in ('packing', 'picked') and v_pickup.pickup_code is not null then
        case when v_pickup.pickup_code_attempts >= 5 then 'locked' else 'ready' end
      else 'not_ready'
    end,
    'reference', upper(left(replace(v_order.id::text, '-', ''), 8)),
    'title', v_title,
    'image', v_image,
    'city', v_pickup.pickup_address->>'city',
    'attempts_left', greatest(0, 5 - coalesce(v_pickup.pickup_code_attempts, 0)),
    'picked_up_at', v_pickup.pickup_verified_at
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
  v_order public.orders;
  v_pickup public.order_seller_pickups;
  v_conv_id uuid;
  v_now timestamptz := clock_timestamp();
  v_code text := regexp_replace(coalesce(p_code, ''), '[^0-9]', '', 'g');
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'state', 'not_found');
  end if;
  if v_order.fulfillment_status in ('shifting', 'delivered', 'completed') then
    return jsonb_build_object('ok', true, 'state', 'in_transit', 'already', true);
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
    values (v_conv_id, v_order.seller_id, 'Courier picked up the package. It is now in transit.', 'system',
            jsonb_build_object('order_id', p_order_id, 'fulfillment_status', 'shifting',
                               'verified_by', 'pickup_code', 'updated_at', v_now));
  end if;

  return jsonb_build_object('ok', true, 'state', 'in_transit');
end;
$function$;

revoke execute on function public.courier_pickup_info(uuid) from public;
revoke execute on function public.courier_confirm_pickup(uuid, text) from public;
grant execute on function public.courier_pickup_info(uuid) to anon, authenticated, service_role;
grant execute on function public.courier_confirm_pickup(uuid, text) to anon, authenticated, service_role;
revoke execute on function public.stash_order_delivery_contact() from public, anon, authenticated;
revoke execute on function public.public_order_address(jsonb) from public, anon;
grant execute on function public.public_order_address(jsonb) to authenticated, service_role;
