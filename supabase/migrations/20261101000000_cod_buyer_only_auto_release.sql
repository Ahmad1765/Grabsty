-- COD: only the buyer confirms; silence for 24h after delivery auto-releases.
-- (product decision 2026-11-01)
--
-- 1. complete_cod_order: the seller can no longer confirm. The buyer's
--    confirmation alone completes the order and releases funds. Admins/service
--    role can still force-complete.
-- 2. auto_complete_delivered_orders: also marks COD orders paid, and sends the
--    buyer a reminder ~4h before the 24h window closes (sender = seller so the
--    push goes to the buyer). Built from the live definition.
-- 3. That function was never scheduled, so nothing ever auto-completed.
--    Schedule it every 15 minutes.
-- The 24h clock starts at delivered_at; a dispute (disputed_at / status
-- 'disputed') stops it. open_order_dispute already enforces the same window.

create or replace function public.complete_cod_order(p_order_id uuid, p_role text default null::text)
 returns public.orders
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_caller_id uuid := auth.uid();
  v_is_service_role boolean := (coalesce(auth.role(), '') = 'service_role' or coalesce(auth.jwt()->>'role', '') = 'service_role');
  v_order public.orders;
  v_is_admin boolean := false;
  v_conv_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if v_caller_id is null and not v_is_service_role then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  v_is_admin := v_is_service_role
    or coalesce((auth.jwt()->'app_metadata'->>'is_admin')::boolean, false)
    or coalesce((auth.jwt()->'app_metadata'->>'role') = 'admin', false)
    or coalesce((select is_admin from public.profiles where id = v_caller_id), false);
  if v_order.payment_method <> 'cod' then
    raise exception 'Order is not Cash on Delivery' using errcode = '22000';
  end if;
  if v_order.status = 'completed' and v_order.fulfillment_status = 'completed' then
    return v_order;
  end if;
  if v_order.status in ('canceled', 'refunded', 'refund_due', 'failed', 'disputed')
     or v_order.fulfillment_status in ('canceled', 'disputed') then
    raise exception 'Order is % and cannot be completed', v_order.status using errcode = '22000';
  end if;
  -- Applies to admins too: an admin selling their own item must not self-confirm.
  if v_caller_id = v_order.seller_id and not v_is_service_role then
    raise exception 'Only the buyer can confirm Cash on Delivery' using errcode = '42501';
  end if;
  if not v_is_admin then
    if v_caller_id is distinct from v_order.buyer_id then
      raise exception 'Unauthorized to confirm COD payment for this order' using errcode = '42501';
    end if;
    if v_order.fulfillment_status not in ('shifting', 'delivered') then
      raise exception 'COD payment can only be confirmed once the order has been dispatched' using errcode = '22000';
    end if;
  end if;

  update public.orders
     set cod_buyer_confirmed_at = coalesce(cod_buyer_confirmed_at, v_now),
         status = 'completed',
         fulfillment_status = 'completed',
         payment_status = 'paid',
         cod_paid_at = coalesce(cod_paid_at, v_now),
         delivered_at = coalesce(delivered_at, v_now),
         completed_at = coalesce(completed_at, v_now),
         escrow_status = 'COMPLETED_FUNDS_RELEASED'
   where id = p_order_id
  returning * into v_order;

  update public.transactions
     set status = 'COMPLETED_FUNDS_RELEASED',
         delivered_at = coalesce(delivered_at, v_now),
         funds_released_at = coalesce(funds_released_at, v_now),
         updated_at = v_now
   where order_id = p_order_id;

  select id into v_conv_id
    from public.conversations
   where listing_id = v_order.listing_id
     and ((buyer_id = v_order.buyer_id and seller_id = v_order.seller_id) or (buyer_id = v_order.seller_id and seller_id = v_order.buyer_id))
   limit 1;
  if v_conv_id is not null then
    insert into public.messages (conversation_id, sender_id, content, kind, metadata)
    values (
      v_conv_id, v_order.buyer_id,
      'Buyer confirmed delivery and Cash on Delivery payment. Order completed.', 'system',
      jsonb_build_object('order_id', p_order_id, 'fulfillment_status', 'completed', 'status', 'completed',
                         'cod_paid_at', v_now, 'updated_at', v_now)
    );
  end if;
  return v_order;
end;
$function$;

create or replace function public.auto_complete_delivered_orders()
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_count integer := 0;
  v_order record;
  v_now timestamptz := clock_timestamp();
begin
  -- Reminder ~4h before the window closes, once per order.
  insert into public.messages (conversation_id, sender_id, content, kind, metadata)
  select c.id, o.seller_id,
    'Did your order arrive OK? Confirm it or report a problem. It completes automatically in about 4 hours and payment is released to the seller.',
    'system',
    jsonb_build_object('order_id', o.id, 'event', 'auto_complete_reminder')
  from public.orders o
  join lateral (
    select c.id from public.conversations c
     where c.listing_id = o.listing_id
       and ((c.buyer_id = o.buyer_id and c.seller_id = o.seller_id) or (c.buyer_id = o.seller_id and c.seller_id = o.buyer_id))
     limit 1
  ) c on true
  where o.fulfillment_status = 'delivered'
    and o.status not in ('completed', 'canceled', 'refunded', 'disputed')
    and o.disputed_at is null
    and o.delivered_at <= (v_now - interval '20 hours')
    and o.delivered_at > (v_now - interval '24 hours')
    and not exists (
      select 1 from public.messages m
       where m.conversation_id = c.id
         and m.metadata->>'order_id' = o.id::text
         and m.metadata->>'event' = 'auto_complete_reminder'
    );

  for v_order in
    select id, listing_id, buyer_id, seller_id, payment_method
      from public.orders
     where fulfillment_status = 'delivered'
       and status not in ('completed', 'canceled', 'refunded', 'disputed')
       and delivered_at is not null
       and delivered_at <= (v_now - interval '24 hours')
       and disputed_at is null
     for update skip locked
  loop
    update public.orders
       set status = 'completed',
           fulfillment_status = 'completed',
           escrow_status = 'COMPLETED_FUNDS_RELEASED',
           completed_at = v_now,
           payment_status = case when payment_method = 'cod' then 'paid' else payment_status end,
           cod_paid_at = case when payment_method = 'cod' then coalesce(cod_paid_at, v_now) else cod_paid_at end
     where id = v_order.id;

    update public.transactions
       set status = 'COMPLETED_FUNDS_RELEASED',
           funds_released_at = v_now,
           updated_at = v_now
     where order_id = v_order.id;

    insert into public.messages (
      conversation_id, sender_id, content, kind, metadata
    )
    select c.id, v_order.buyer_id,
      'Order auto-completed. The 24-hour inspection period ended with no dispute, so payment has been released to the seller.',
      'system',
      jsonb_build_object(
        'order_id', v_order.id,
        'status', 'completed',
        'fulfillment_status', 'completed',
        'auto_completed', true,
        'completed_at', v_now
      )
    from public.conversations c
    where c.listing_id = v_order.listing_id
      and ((c.buyer_id = v_order.buyer_id and c.seller_id = v_order.seller_id) or (c.buyer_id = v_order.seller_id and c.seller_id = v_order.buyer_id))
    limit 1;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;

select cron.schedule('auto-complete-delivered-orders', '*/15 * * * *',
  $$ select public.auto_complete_delivered_orders() $$);
