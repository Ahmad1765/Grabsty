-- Deals: an accepted offer expires the moment the item is bought through it.
--
-- process_checkout prices the order from the buyer's accepted offer but left
-- that offer 'accepted'. It kept showing as a live deal ("Offer accepted · buy
-- it now" in notifications, a pay button in chat), and if the order was later
-- cancelled and the item relisted, the same offer could be used again.
--
-- Now placing the order (COD: status 'pending'; card: 'paid') marks the offer
-- 'expired' and flags its chat message as purchased, so the app shows it as
-- used. Additive: old app builds are unaffected.

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

  if v_message_ids is not null then
    -- Offer messages are locked against edits; this is the server's own bypass.
    perform set_config('ceranix.in_accept_offer', 'on', true);
    update public.messages
       set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('purchased', true, 'order_id', new.id)
     where id = any(v_message_ids);
    perform set_config('ceranix.in_accept_offer', 'off', true);
  end if;
  return new;
end;
$function$;
revoke execute on function public.expire_offer_on_purchase() from public, anon, authenticated;

drop trigger if exists orders_expire_used_offer on public.orders;
create trigger orders_expire_used_offer
  after insert or update of status on public.orders
  for each row execute function public.expire_offer_on_purchase();

-- Backfill: accepted offers that already have a live order from that buyer.
do $do$
declare
  v_message_ids uuid[];
begin
  with used as (
    update public.offers f
       set status = 'expired', updated_at = now()
     where f.status = 'accepted'
       and exists (
         select 1 from public.orders o
          where o.listing_id = f.listing_id and o.buyer_id = f.buyer_id
            and o.status not in ('awaiting_payment', 'canceled', 'failed', 'refunded'))
    returning f.message_id
  )
  select array_agg(message_id) into v_message_ids from used where message_id is not null;
  if v_message_ids is not null then
    perform set_config('ceranix.in_accept_offer', 'on', true);
    update public.messages
       set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('purchased', true)
     where id = any(v_message_ids);
    perform set_config('ceranix.in_accept_offer', 'off', true);
  end if;
end
$do$;
