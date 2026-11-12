-- Offers settled on purchase: edge cases.
--
-- expire_offer_on_purchase (20261112020000 / 030000) now also handles:
--   1. Order cancelled / refunded / failed: the offer it was bought through
--      stops reading "Purchased" (-> "Offer is no longer available"). Closed
--      offers are not revived when the item is relisted; the buyer offers again.
--   2. Only the accepted offer the order was actually priced from counts as
--      used (same amount as the order). A stale accepted offer on an item
--      bought at full price is closed, not shown as "Purchased · <offer>".
--   3. Bundles: offers on every item in the order close, and bundle offers
--      that include a sold item close too.
--   4. Offers rows: only the buyer's own leftovers are cancelled here. Other
--      buyers' offers are left for process_checkout to mark 'declined', which
--      is what tells them (notifications feed) the item went to someone else.
--   5. Offer messages in a chat not tied to the listing are found through the
--      offers row as well.

create index if not exists messages_open_offers_idx
  on public.messages (conversation_id)
  where kind = 'offer' and offer_status in ('pending', 'proposed', 'accepted');

create or replace function public.expire_offer_on_purchase()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_listing_ids uuid[] := array[new.listing_id] || coalesce(new.bundle_item_ids, '{}'::uuid[]);
  v_listing_txt text[];
  v_used public.offers;
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  -- 1. The order ended without a sale: its offer is no longer "Purchased".
  if tg_op = 'UPDATE' and new.status in ('canceled', 'refunded', 'refund_due', 'failed') then
    perform set_config('ceranix.in_accept_offer', 'on', true);
    update public.messages
       set offer_status = 'canceled',
           metadata = metadata - 'purchased'
     where kind = 'offer'
       and metadata->>'order_id' = new.id::text
       and metadata->>'purchased' = 'true';
    perform set_config('ceranix.in_accept_offer', 'off', true);
    return new;
  end if;

  if new.status not in ('pending', 'paid') then
    return new;
  end if;
  v_listing_txt := array(select x::text from unnest(v_listing_ids) x);

  -- 2. The offer this order was priced from, if any.
  select * into v_used
    from public.offers
   where listing_id = new.listing_id
     and buyer_id = new.buyer_id
     and seller_id = new.seller_id
     and status = 'accepted'
     and round(amount * 100)::integer = new.amount_cents
   order by accepted_at desc nulls last, created_at desc
   limit 1;

  if v_used.id is not null then
    update public.offers set status = 'expired', updated_at = now() where id = v_used.id;
  end if;

  -- Offer messages are locked against edits; this is the server's own bypass.
  perform set_config('ceranix.in_accept_offer', 'on', true);
  if v_used.message_id is not null then
    update public.messages
       set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('purchased', true, 'order_id', new.id)
     where id = v_used.message_id;
  end if;
  -- 3 + 5. Every other open offer about any item in this order.
  update public.messages m
     set offer_status = 'canceled'
   where m.kind = 'offer'
     and m.offer_status in ('pending', 'proposed', 'accepted')
     and m.id is distinct from v_used.message_id
     and (
       exists (select 1 from public.conversations c
                where c.id = m.conversation_id and c.listing_id = any(v_listing_ids))
       or exists (select 1 from public.offers f
                   where f.message_id = m.id and f.listing_id = any(v_listing_ids))
       or m.metadata->>'base_listing_id' = any(v_listing_txt)
       or (jsonb_typeof(m.metadata->'bundle_item_ids') = 'array' and m.metadata->'bundle_item_ids' ?| v_listing_txt)
     );
  perform set_config('ceranix.in_accept_offer', 'off', true);

  -- 4. The buyer's own leftover offers on these items.
  update public.offers
     set status = 'canceled', updated_at = now()
   where listing_id = any(v_listing_ids)
     and buyer_id = new.buyer_id
     and status in ('pending', 'accepted')
     and id is distinct from v_used.id;
  return new;
end;
$function$;
revoke execute on function public.expire_offer_on_purchase() from public, anon, authenticated;

-- Backfill for (1): "Purchased" offers whose order has since ended.
do $do$
begin
  perform set_config('ceranix.in_accept_offer', 'on', true);
  update public.messages m
     set offer_status = 'canceled', metadata = m.metadata - 'purchased'
   where m.kind = 'offer'
     and m.metadata->>'purchased' = 'true'
     and exists (select 1 from public.orders o
                  where o.id::text = m.metadata->>'order_id'
                    and o.status in ('canceled', 'refunded', 'refund_due', 'failed'));
  perform set_config('ceranix.in_accept_offer', 'off', true);
end
$do$;
