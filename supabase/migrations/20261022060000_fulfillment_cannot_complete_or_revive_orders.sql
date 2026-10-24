-- QA pass 2026-10-22. advance_order_fulfillment let a buyer call it with
-- 'completed' directly, skipping the real completion paths:
--   * COD: complete_cod_order needs BOTH buyer and seller to confirm the cash.
--     A buyer could mark a shipped COD order completed / funds released with
--     payment_status still 'pending'; the seller's COD confirm then no-ops.
--   * Card: confirm_order_received checks status = 'paid'.
-- It also never looked at orders.status, so a seller could keep "shipping" a
-- cancelled order, and 'shifting' flipped a non-COD pending order to 'paid'
-- with no payment behind it (card orders are only ever created paid by the
-- Stripe webhook). Completion now goes through the dedicated RPCs (admins
-- keep the override), terminal orders are frozen, and only real payment
-- flows set 'paid'. The client only ever calls this with packing/shifting.
create or replace function public.advance_order_fulfillment(p_order_id uuid, p_target_status text, p_courier text default null::text, p_tracking_number text default null::text, p_supplier_order_id text default null::text, p_supplier_name text default null::text, p_seller_pickup_address jsonb default null::jsonb)
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

  -- Validate state machine progression (permit idempotent calls & awaiting_payment)
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
      when p_target_status = 'packing' then 'Seller has begun packing! 📦 Pickup scheduled.'
      when p_target_status = 'picked' then 'Package Picked Up by Courier! 📦 In transit shortly.'
      when p_target_status = 'shifting' then 'Package Shifting / Dispatched! 🚚' ||
        case when v_order.courier_name is not null then E'\nCourier: ' || v_order.courier_name else '' end ||
        case when v_order.tracking_number is not null and length(trim(v_order.tracking_number)) > 0 then E'\nTracking #: ' || v_order.tracking_number else '' end
      when p_target_status = 'delivered' then 'Package Delivered! 📬 Please inspect your item within 48 hours.'
      when p_target_status = 'completed' then 'Order Completed! 🎉 Buyer confirmed receipt and condition.'
      else null
    end;

    if v_system_msg is not null then
      insert into public.messages (
        conversation_id, sender_id, content, kind, metadata
      ) values (
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
