-- Nothing ended an order whose seller never shipped: the item stayed "sold" and
-- the buyer waited forever. COD orders not dispatched within 5 days now cancel
-- themselves (the orders_relist_on_end trigger puts the item back), with a warning
-- a day before.
--
-- COD only: no money has moved. A paid card order would become refund_due, and
-- nothing issues those refunds yet, so card stays out until that path exists.

create or replace function public.auto_cancel_unshipped_orders()
returns integer
language plpgsql security definer set search_path to '' as $$
declare
  v_now timestamptz := clock_timestamp();
  v_reason constant text := 'Seller did not ship within 5 days';
  v_order record;
  v_count integer := 0;
begin
  -- sender = buyer so the push reaches the seller, who is the one who can act.
  insert into public.messages (conversation_id, sender_id, content, kind, metadata)
  select c.id, o.buyer_id,
    'This order hasn''t shipped yet. It will be cancelled automatically in about 24 hours if it isn''t dispatched.',
    'system',
    jsonb_build_object('order_id', o.id, 'event', 'auto_cancel_reminder')
  from public.orders o
  join lateral (
    select c.id from public.conversations c
     where c.listing_id = o.listing_id
       and c.buyer_id = o.buyer_id and c.seller_id = o.seller_id
     limit 1
  ) c on true
  where o.payment_method = 'cod'
    and o.status = 'pending'
    and o.fulfillment_status in ('pending', 'packing')
    and o.shipped_at is null
    and o.created_at <= v_now - interval '4 days'
    and o.created_at > v_now - interval '5 days'
    and not exists (
      select 1 from public.messages m
       where m.conversation_id = c.id
         and m.metadata->>'order_id' = o.id::text
         and m.metadata->>'event' = 'auto_cancel_reminder'
    );

  for v_order in
    select id, listing_id, buyer_id, seller_id
      from public.orders
     where payment_method = 'cod'
       and status = 'pending'
       and fulfillment_status in ('pending', 'packing')
       and shipped_at is null
       and created_at <= v_now - interval '5 days'
       for update skip locked
  loop
    update public.orders
       set status = 'canceled',
           fulfillment_status = 'canceled',
           escrow_status = 'CANCELLED',
           cancel_reason = v_reason
     where id = v_order.id;

    update public.transactions
       set status = 'CANCELLED',
           cancelled_at = coalesce(cancelled_at, v_now),
           cancel_reason = coalesce(cancel_reason, v_reason),
           updated_at = v_now
     where order_id = v_order.id
       and status not in ('COMPLETED_FUNDS_RELEASED', 'CANCELLED');

    -- sender = seller so the push reaches the buyer.
    insert into public.messages (conversation_id, sender_id, content, kind, metadata)
    select c.id, v_order.seller_id,
      'Order cancelled automatically because it wasn''t shipped within 5 days. You won''t be charged, and the item is available again.',
      'system',
      jsonb_build_object('order_id', v_order.id, 'status', 'canceled', 'event', 'auto_cancelled')
    from public.conversations c
    where c.listing_id = v_order.listing_id
      and c.buyer_id = v_order.buyer_id and c.seller_id = v_order.seller_id
    limit 1;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.auto_cancel_unshipped_orders() from public, anon, authenticated;

select cron.schedule('auto-cancel-unshipped-orders', '7 * * * *', 'select public.auto_cancel_unshipped_orders()');
