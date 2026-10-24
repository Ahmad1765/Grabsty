-- QA pass 2026-10-22. cancel_bundle_offers_for_sold_item() could never succeed
-- once it had something to cancel: 'canceled' wasn't an allowed
-- messages.offer_status, and validate_offer_status_update() rejects
-- pending -> canceled for every caller. The client swallows the error, so
-- bundle offers containing a sold item stayed "pending" (and acceptable, since
-- the offers row was never touched either). The chat UI already renders
-- 'canceled'; offers.status already allows it.

alter table public.messages drop constraint messages_offer_status_check;
alter table public.messages add constraint messages_offer_status_check check (
  offer_status = any (array['proposed', 'pending', 'accepted', 'declined', 'countered', 'expired', 'withdrawn', 'canceled'])
);

create or replace function public.cancel_bundle_offers_for_sold_item(p_sold_listing_id text)
returns text[]
language plpgsql security definer set search_path to '' as $$
declare
  v_caller uuid := auth.uid();
  v_seller_id uuid;
  v_is_sold boolean;
  v_canceled_ids text[];
begin
  if v_caller is null then
    raise exception 'authenticated caller required';
  end if;

  if p_sold_listing_id is null or p_sold_listing_id = '' then
    return array[]::text[];
  end if;

  select l.seller_id, l.is_sold
    into v_seller_id, v_is_sold
    from public.listings l
   where l.id::text = p_sold_listing_id;

  if not found or v_is_sold is not true then
    return array[]::text[];
  end if;

  if v_caller <> v_seller_id and not exists (
    select 1 from public.orders o
     where o.listing_id::text = p_sold_listing_id and o.buyer_id = v_caller
  ) then
    raise exception 'caller is not related to listing';
  end if;

  select coalesce(array_agg(id::text), array[]::text[])
    into v_canceled_ids
    from public.messages
   where kind = 'offer'
     and offer_status in ('pending', 'proposed')
     and (metadata->>'base_listing_id' = p_sold_listing_id
          or metadata->'bundle_item_ids' ? p_sold_listing_id);

  if array_length(v_canceled_ids, 1) > 0 then
    -- Same transaction-local bypass accept/counter use; this function has
    -- already authorised the caller against the sold listing above.
    perform set_config('ceranix.in_accept_offer', 'on', true);
    update public.messages
       set offer_status = 'canceled', updated_at = now()
     where id::text = any(v_canceled_ids);
    update public.offers
       set status = 'canceled', updated_at = now()
     where message_id::text = any(v_canceled_ids) and status = 'pending';
  end if;

  return v_canceled_ids;
end;
$$;
