-- QA pass 2026-10-22. Any chat participant could insert kind='system' messages
-- with metadata {paid: true}, which SystemNotice renders as the platform's
-- "Done! ... we have received your payment" card — a forged payment notice to
-- trick a seller into shipping. System messages now only come from definer
-- functions; the checkout screen's "order placed" notice moves server-side and
-- is derived from the real order row.

drop policy if exists "Participants can send messages" on public.messages;
create policy "Participants can send messages" on public.messages for insert to public
  with check (
    (select auth.uid()) = sender_id
    and kind <> 'system'
    and exists (
      select 1 from public.conversations c
       where c.id = messages.conversation_id
         and ((select auth.uid()) = c.buyer_id or (select auth.uid()) = c.seller_id)
    )
    and case when kind = 'offer' then coalesce(offer_status, 'pending') = 'pending'
             else offer_status is null end
  );

create or replace function public.post_order_placed_message(p_order_id uuid, p_conversation_id uuid)
returns public.messages
language plpgsql security definer set search_path to '' as $$
declare
  v_caller uuid := auth.uid();
  v_order public.orders;
  v_conv public.conversations;
  v_msg public.messages;
  v_paid boolean;
  v_titles text[];
  v_content text;
begin
  if v_caller is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select * into v_order from public.orders where id = p_order_id;
  if not found or v_order.buyer_id <> v_caller then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  select * into v_conv from public.conversations where id = p_conversation_id;
  if not found or v_conv.buyer_id <> v_order.buyer_id or v_conv.seller_id <> v_order.seller_id then
    raise exception 'Conversation does not belong to this order' using errcode = '42501';
  end if;

  -- Idempotent: one notice per order.
  select * into v_msg from public.messages
   where conversation_id = p_conversation_id and kind = 'system'
     and metadata->>'order_id' = p_order_id::text
   limit 1;
  if found then
    return v_msg;
  end if;

  v_paid := v_order.status = 'paid';
  select array_agg(l.title order by l.id <> v_order.listing_id, l.id) into v_titles
    from public.listings l
   where l.id = v_order.listing_id or l.id = any(coalesce(v_order.bundle_item_ids, '{}'));
  v_content := case
    when coalesce(array_length(v_titles, 1), 0) > 1 then
      format('Thank you, your order for a %s-item bundle (%s) has been received.',
             array_length(v_titles, 1), array_to_string(v_titles, ', '))
    when v_paid then 'Thank you, we have received your payment. It''s being processed.'
    else 'Your order has been placed. It''s being processed.'
  end;

  insert into public.messages (conversation_id, sender_id, content, kind, metadata)
  values (p_conversation_id, v_caller, v_content, 'system', jsonb_build_object(
    'order_id', v_order.id,
    'paid', v_paid,
    'payment_status', case when v_paid then 'paid' else v_order.status end,
    'order_status', v_order.status,
    'amount', (v_order.amount_cents + v_order.fee_cents + v_order.shipping_fee_cents) / 100.0,
    'is_bundle', coalesce(array_length(v_titles, 1), 0) > 1,
    'bundle_item_ids', to_jsonb(v_order.bundle_item_ids)
  ))
  returning * into v_msg;
  return v_msg;
end;
$$;

revoke all on function public.post_order_placed_message(uuid, uuid) from public, anon;
grant execute on function public.post_order_placed_message(uuid, uuid) to authenticated;
