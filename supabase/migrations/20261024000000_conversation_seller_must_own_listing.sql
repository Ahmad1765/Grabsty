-- Audit 2026-10-24, finding C1. conversations.seller_id was client-written and
-- never tied to the listing: a buyer could open (or PATCH) a thread on someone
-- else's listing naming their own second account as "seller". The offer sync
-- trigger copies seller_id from the conversation, so that account could
-- accept_chat_offer a Rs 1 offer, and process_checkout honoured any accepted
-- offer for (listing, buyer) -> COD order at Rs 1 against the real seller,
-- listing marked sold, competing offers/orders cancelled.
-- Fixed at all three links: who can create a listing thread, which columns a
-- participant can change, and both RPCs re-check the listing's real seller.

-- 1. A listing thread's seller must be the listing owner. Threads without a
--    listing (direct messages, support) may name any other user.
drop policy if exists "Buyers can create conversations" on public.conversations;
create policy "Buyers can create conversations" on public.conversations
  for insert to authenticated
  with check (
    (select auth.uid()) = buyer_id
    and buyer_id <> seller_id
    and (
      listing_id is null
      or seller_id = (select l.seller_id from public.listings l where l.id = listing_id)
    )
  );

-- 2. Participants only mark threads read (lib/chat.ts). Every other column is
--    written by SECURITY DEFINER functions, which these grants don't affect.
revoke update on public.conversations from anon, authenticated;
grant update (buyer_last_read_at, seller_last_read_at) on public.conversations to authenticated;

-- 3. accept_chat_offer: the offer's seller must own the listing.
do $$
declare
  v_def text := replace(pg_get_functiondef('public.accept_chat_offer(uuid)'::regprocedure), E'\r', '');
  v_anchor text := E'  if v_caller_id <> v_offer.buyer_id and v_caller_id <> v_offer.seller_id and not v_is_admin then';
begin
  if position(v_anchor in v_def) = 0 then
    raise exception 'accept_chat_offer changed shape; patch it by hand';
  end if;
  execute replace(v_def, v_anchor,
    E'  if v_offer.seller_id is distinct from v_listing.seller_id then\n'
    || E'    raise exception ''Offer does not belong to this listing''''s seller'' using errcode = ''42501'';\n'
    || E'  end if;\n' || v_anchor);
end $$;

-- 4. process_checkout: only an offer made with the listing's real seller sets the price.
do $$
declare
  v_def text := replace(pg_get_functiondef('public.process_checkout(uuid,uuid,text,jsonb,numeric,text,text,uuid[],numeric)'::regprocedure), E'\r', '');
  v_anchor text := E'     and o.status = ''accepted''\n';
begin
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 'process_checkout changed shape; patch it by hand';
  end if;
  execute replace(v_def, v_anchor, E'     and o.seller_id = v_seller_id\n' || v_anchor);
end $$;
