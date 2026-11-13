-- Audit 2026-11-12, batch 4: ADM-001, ADM-002, DB-003, WEB-008 (rider rules).

-- ADM-002: only real people can be riders. Removing a rider hands back the
-- orders they haven't picked up yet; parcels they already carry stay theirs
-- (an admin finishes or reassigns those knowingly).
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
    if p_user_id in ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002')
       or not exists (select 1 from public.profiles where id = p_user_id) then
      raise exception 'Only a real Grabsty account can be a rider' using errcode = '22000';
    end if;
    insert into public.riders (user_id, added_by) values (p_user_id, auth.uid())
    on conflict (user_id) do nothing;
  else
    delete from public.riders where user_id = p_user_id;
    update public.orders
       set rider_id = null
     where rider_id = p_user_id
       and fulfillment_status in ('pending', 'awaiting_payment', 'packing', 'picked');
  end if;
  return p_is_rider;
end;
$function$;

-- ADM-002: no rider on an order that is already closed, and a parcel in
-- transit stays with the rider who is carrying it.
create or replace function public.admin_assign_rider(p_order_id uuid, p_rider_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_order public.orders;
begin
  if not public.is_admin() then
    raise exception 'Forbidden: caller is not an administrator' using errcode = '42501';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if v_order.fulfillment_status = 'shifting' and v_order.rider_id is not null
     and p_rider_id is distinct from v_order.rider_id then
    raise exception 'This order is in transit with its rider. Finish or cancel the delivery first.' using errcode = '22000';
  end if;
  if p_rider_id is not null then
    if v_order.status in ('canceled', 'refunded', 'refund_due', 'failed', 'completed')
       or v_order.fulfillment_status in ('delivered', 'completed', 'canceled') then
      raise exception 'This order is closed, so it can''t get a rider' using errcode = '22000';
    end if;
    if not exists (select 1 from public.riders where user_id = p_rider_id) then
      raise exception 'That account is not a delivery rider' using errcode = '22000';
    end if;
    if p_rider_id in (v_order.buyer_id, v_order.seller_id) then
      raise exception 'A rider cannot deliver an order they bought or sold' using errcode = '22000';
    end if;
  end if;
  update public.orders set rider_id = p_rider_id where id = p_order_id;
  return p_rider_id;
end;
$function$;

-- DB-003: when the pickup locks, remember when.
alter table public.order_seller_pickups add column if not exists pickup_code_locked_at timestamptz;

-- ADM-001: once an order has a rider, other riders can't see its pickup or use its code.
-- DB-003: the 5th wrong code locks the pickup for 30 minutes and gives the seller
--   a new code (so the lock ends, but guessing can't go on for ever).
-- WEB-008: an assigned order not picked up yet is 'to_pick_up', and stays listed.
-- Patched in place; a missing phrase aborts the migration.
do $do$
declare
  v_patch record;
  v_def text;
begin
  for v_patch in
    select * from (values
      ('public.courier_confirm_pickup(uuid,text)',
       '  select * into v_pickup from public.order_seller_pickups where order_id = p_order_id for update;
  if v_pickup.pickup_code is null then
    return jsonb_build_object(''ok'', false, ''state'', ''not_ready'');
  end if;
  if v_pickup.pickup_code_attempts >= 5 then',
       '  if not v_staff and v_order.rider_id is not null and v_order.rider_id <> v_uid then
    return jsonb_build_object(''ok'', false, ''state'', ''other_rider'');
  end if;

  select * into v_pickup from public.order_seller_pickups where order_id = p_order_id for update;
  if v_pickup.pickup_code is null then
    return jsonb_build_object(''ok'', false, ''state'', ''not_ready'');
  end if;
  if v_pickup.pickup_code_attempts >= 5
     and coalesce(v_pickup.pickup_code_locked_at, ''-infinity'') < v_now - interval ''30 minutes'' then
    update public.order_seller_pickups
       set pickup_code_attempts = 0, pickup_code_locked_at = null
     where order_id = p_order_id;
    v_pickup.pickup_code_attempts := 0;
  end if;
  if v_pickup.pickup_code_attempts >= 5 then'),
      ('public.courier_confirm_pickup(uuid,text)',
       '       set pickup_code_attempts = pickup_code_attempts + 1, updated_at = v_now',
       '       set pickup_code_attempts = pickup_code_attempts + 1, updated_at = v_now,
           pickup_code_locked_at = case when pickup_code_attempts + 1 >= 5 then v_now else pickup_code_locked_at end,
           pickup_code = case when pickup_code_attempts + 1 >= 5 then public.new_pickup_code() else pickup_code end'),
      ('public.courier_pickup_info(uuid)',
       '    when v_order.fulfillment_status in (''packing'', ''picked'') and v_pickup.pickup_code is not null then
      case when v_pickup.pickup_code_attempts >= 5 then ''locked'' else ''ready'' end',
       '    when v_order.fulfillment_status in (''packing'', ''picked'') and v_order.rider_id is not null and not v_mine then ''other_rider''
    when v_order.fulfillment_status in (''packing'', ''picked'') and v_pickup.pickup_code is not null then
      case when v_pickup.pickup_code_attempts >= 5
                and coalesce(v_pickup.pickup_code_locked_at, ''-infinity'') > now() - interval ''30 minutes''
           then ''locked'' else ''ready'' end'),
      ('public.courier_pickup_info(uuid)',
       '''attempts_left'', greatest(0, 5 - coalesce(v_pickup.pickup_code_attempts, 0)),',
       '''attempts_left'', case when v_pickup.pickup_code_attempts >= 5
                                  and coalesce(v_pickup.pickup_code_locked_at, ''-infinity'') <= now() - interval ''30 minutes'' then 5
                             else greatest(0, 5 - coalesce(v_pickup.pickup_code_attempts, 0)) end,'),
      ('public.rider_deliveries()',
       '                      when o.fulfillment_status = ''shifting'' then ''in_transit''',
       '                      when o.fulfillment_status in (''pending'', ''awaiting_payment'', ''packing'', ''picked'') then ''to_pick_up''
                      when o.fulfillment_status = ''shifting'' then ''in_transit'''),
      ('public.rider_deliveries()',
       '             and coalesce(o.delivered_at, o.shipped_at, o.created_at) > now() - interval ''30 days''',
       '             and (coalesce(o.delivered_at, o.shipped_at, o.created_at) > now() - interval ''30 days''
                  or o.fulfillment_status in (''pending'', ''awaiting_payment'', ''packing'', ''picked'', ''shifting''))')
    ) as p(fn, old_text, new_text)
  loop
    v_def := pg_get_functiondef(v_patch.fn::regprocedure);
    if position(v_patch.old_text in v_def) = 0 then
      raise exception '%: text to replace not found', v_patch.fn;
    end if;
    execute replace(v_def, v_patch.old_text, v_patch.new_text);
  end loop;
end
$do$;
