-- Chat: once an item is bought, every offer about it is settled in the chat.
--
-- Buying an item left the offer messages in its chats as they were: a pending
-- offer still read "You made an offer" / showed Accept and Counter, and a
-- counter-offer still waited for an answer, although the item was gone.
-- (20261112020000 only handled the accepted offer the order was priced from.)
--
-- When an order is placed (COD 'pending', card 'paid'):
--   * the buyer's accepted offer -> expired, its message flagged purchased
--     (unchanged from 20261112020000);
--   * every other open offer message in chats about that item -> 'canceled'
--     ("Offer is no longer available"), and open offers rows -> 'canceled'.
-- 'canceled' sends no push (send-push only notifies accepted / declined).
-- Chats already subscribe to message updates, so open threads refresh live.

create or replace function public.expire_offer_on_purchase()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_message_ids uuid[];
begin
  if new.status not in ('pending', 'paid') then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  with used as (
    update public.offers
       set status = 'expired', updated_at = now()
     where listing_id = new.listing_id
       and buyer_id = new.buyer_id
       and seller_id = new.seller_id
       and status = 'accepted'
    returning message_id
  )
  select array_agg(message_id) into v_message_ids from used where message_id is not null;

  -- Offer messages are locked against edits; this is the server's own bypass.
  perform set_config('ceranix.in_accept_offer', 'on', true);
  if v_message_ids is not null then
    update public.messages
       set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('purchased', true, 'order_id', new.id)
     where id = any(v_message_ids);
  end if;
  update public.messages m
     set offer_status = 'canceled'
    from public.conversations c
   where c.id = m.conversation_id
     and c.listing_id = new.listing_id
     and m.kind = 'offer'
     and m.offer_status in ('pending', 'proposed', 'accepted')
     and not (m.id = any(coalesce(v_message_ids, '{}'::uuid[])));
  perform set_config('ceranix.in_accept_offer', 'off', true);

  update public.offers
     set status = 'canceled', updated_at = now()
   where listing_id = new.listing_id
     and status = 'pending';
  return new;
end;
$function$;
revoke execute on function public.expire_offer_on_purchase() from public, anon, authenticated;

-- Backfill: chats about items that already have a live order.
do $do$
begin
  perform set_config('ceranix.in_accept_offer', 'on', true);
  update public.messages m
     set offer_status = 'canceled'
    from public.conversations c
   where c.id = m.conversation_id
     and m.kind = 'offer'
     and m.offer_status in ('pending', 'proposed', 'accepted')
     and coalesce(m.metadata->>'purchased', '') <> 'true'
     and exists (
       select 1 from public.orders o
        where o.listing_id = c.listing_id
          and o.status not in ('awaiting_payment', 'canceled', 'failed', 'refunded'));
  perform set_config('ceranix.in_accept_offer', 'off', true);

  update public.offers f
     set status = 'canceled', updated_at = now()
   where f.status = 'pending'
     and exists (
       select 1 from public.orders o
        where o.listing_id = f.listing_id
          and o.status not in ('awaiting_payment', 'canceled', 'failed', 'refunded'));
end
$do$;
