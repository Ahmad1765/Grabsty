-- Audit 2026-11-12, batch 2 (part 1): DB-006 (offer status in one place, one expiry).

-- DB-006: messages.offer_status is what the app updates (decline, withdraw,
-- counter fallback, expiry sweep); mirror it into offers so accept_chat_offer
-- and checkout see the same state. 'accepted' only comes from accept_chat_offer,
-- which updates both itself.
create or replace function public.sync_offer_status_from_message()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_status text := case new.offer_status
    when 'declined'  then 'declined'
    when 'withdrawn' then 'canceled'
    when 'canceled'  then 'canceled'
    when 'countered' then 'countered'
    when 'expired'   then 'expired'
  end;
begin
  if new.kind = 'offer' and v_status is not null then
    update public.offers
       set status = v_status, updated_at = now()
     where message_id = new.id
       and status = 'pending';
  end if;
  return new;
end;
$function$;
revoke execute on function public.sync_offer_status_from_message() from public, anon, authenticated;

drop trigger if exists messages_sync_offer_status on public.messages;
create trigger messages_sync_offer_status
  after update of offer_status on public.messages
  for each row
  when (old.offer_status is distinct from new.offer_status)
  execute function public.sync_offer_status_from_message();

-- DB-006: accepting goes through accept_chat_offer only (it checks the listing,
-- the price ceiling and expiry); a direct 'accepted' update skipped all of that.
create or replace function public.validate_offer_status_update()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  caller uuid := auth.uid();
  buyer  uuid;
  seller uuid;
  counterparty uuid;
begin
  if old.kind <> 'offer' then
    return new;
  end if;

  -- Transaction-local bypass for atomic offer acceptance and counter-offer routines
  if current_setting('ceranix.in_accept_offer', true) = 'on'
     or current_setting('ceranix.in_counter_offer', true) = 'on' then
    return new;
  end if;

  -- Block mutation of any column other than offer_status / updated_at / parent_offer_id
  if new.conversation_id is distinct from old.conversation_id
     or new.sender_id      is distinct from old.sender_id
     or new.content        is distinct from old.content
     or new.kind           is distinct from old.kind
     or new.metadata       is distinct from old.metadata
     or new.created_at     is distinct from old.created_at then
    raise exception 'offer messages: only offer_status may be updated';
  end if;

  -- Short-circuit on metadata-only no-op
  if new.offer_status is not distinct from old.offer_status then
    if old.offer_status not in ('proposed', 'pending') then
      raise exception 'offer is no longer active (current status: %)', old.offer_status;
    end if;
    return new;
  end if;

  -- Only proposed or pending offers may transition
  if old.offer_status not in ('proposed', 'pending') then
    raise exception 'offer is no longer active (current: %)', old.offer_status;
  end if;

  -- Valid target states
  if new.offer_status not in ('accepted', 'declined', 'countered', 'expired', 'withdrawn') then
    raise exception 'invalid offer_status transition: % -> %',
      old.offer_status, new.offer_status;
  end if;

  if new.offer_status = 'accepted' then
    raise exception 'Offers are accepted with accept_chat_offer' using errcode = '42501';
  end if;

  select c.buyer_id, c.seller_id
    into buyer, seller
    from public.conversations c
   where c.id = old.conversation_id;

  if buyer is null then
    raise exception 'conversation not found for message';
  end if;

  -- Counterparty = participant who did NOT send the offer
  counterparty := case when old.sender_id = buyer then seller else buyer end;

  if new.offer_status = 'withdrawn' then
    if caller is distinct from old.sender_id then
      raise exception 'only the offer sender may withdraw';
    end if;
  elsif new.offer_status in ('declined', 'countered') then
    if caller is not null and caller is distinct from counterparty then
      raise exception 'only the counterparty may accept, decline, or counter this offer';
    end if;
  elsif new.offer_status = 'expired' then
    if caller is not null then
      raise exception 'only service role may mark offers expired';
    end if;
  end if;

  return new;
end;
$function$;

-- DB-006: one expiry interval (24h, as offers.expires_at), and offers rows are swept too.
create or replace function public.sweep_expired_offers_and_reservations()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_unlocked_orders record;
begin
  -- 1. Offers unanswered for 24 hours -> 'expired' (the message update syncs offers).
  update public.messages
     set offer_status = 'expired',
         updated_at = now()
   where kind = 'offer'
     and offer_status in ('proposed', 'pending')
     and created_at < now() - interval '24 hours';
  update public.offers
     set status = 'expired', updated_at = now()
   where status = 'pending'
     and expires_at < now();

  -- 2. Sweep orders in awaiting_payment older than 15 minutes -> mark 'failed', unlock listing
  for v_unlocked_orders in
    select id, listing_id
      from public.orders
     where fulfillment_status = 'awaiting_payment'
       and created_at < now() - interval '15 minutes'
       for update
  loop
    update public.orders
       set fulfillment_status = 'canceled',
           status = 'failed',
           cancel_reason = 'Payment authorization TTL expired (15m)'
     where id = v_unlocked_orders.id;

    if v_unlocked_orders.listing_id is not null then
      if not exists (
        select 1
          from public.orders
         where listing_id = v_unlocked_orders.listing_id
           and id <> v_unlocked_orders.id
           and status not in ('canceled', 'refunded', 'failed')
           and coalesce(fulfillment_status, '') not in ('canceled', 'failed')
      ) then
        update public.listings
           set is_sold = false
         where id = v_unlocked_orders.listing_id;
      end if;
    end if;
  end loop;
end;
$function$;

-- DB-006: bring existing rows into line once.
update public.offers o
   set status = case m.offer_status
                  when 'withdrawn' then 'canceled'
                  else m.offer_status
                end,
       updated_at = now()
  from public.messages m
 where m.id = o.message_id
   and o.status = 'pending'
   and m.offer_status in ('declined', 'withdrawn', 'canceled', 'countered', 'expired');
select public.sweep_expired_offers_and_reservations();

-- DB-006: a declined, withdrawn or expired offer can't be revived through accept_chat_offer,
-- even where an offers row is out of date.
-- Body is the live alpha definition; only the marked block changed.
create or replace function public.accept_chat_offer(p_offer_message_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_caller_id uuid := auth.uid();
  v_offer public.offers;
  v_message public.messages;
  v_conversation public.conversations;
  v_listing public.listings;
  v_amount numeric;
  v_is_admin boolean := false;
  v_now timestamptz := clock_timestamp();
begin
  perform set_config('ceranix.in_accept_offer', 'on', true);
  if v_caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  v_is_admin := coalesce((auth.jwt()->'app_metadata'->>'is_admin')::boolean, false)
    or coalesce((auth.jwt()->'app_metadata'->>'role') = 'admin', false)
    or coalesce((select is_admin from public.profiles where id = v_caller_id), false);
  select * into v_offer
    from public.offers
   where id = p_offer_message_id or message_id = p_offer_message_id
     for update;
  if v_offer.id is null then
    select * into v_message from public.messages where id = p_offer_message_id for update;
    if not found then
      raise exception 'Offer not found' using errcode = 'P0002';
    end if;
    if v_message.kind <> 'offer' then
      raise exception 'Message is not an offer' using errcode = '22000';
    end if;
    select * into v_conversation from public.conversations where id = v_message.conversation_id;
    if not found or v_conversation.listing_id is null then
      raise exception 'Conversation or listing not found' using errcode = 'P0002';
    end if;
    if (v_message.metadata->>'amount') ~ '^\s*[0-9]+(\.[0-9]+)?\s*$' then
      v_amount := (v_message.metadata->>'amount')::numeric;
    end if;
    if v_amount is null or v_amount <= 0 then
      raise exception 'Offer has no valid amount' using errcode = '22000';
    end if;
    insert into public.offers (
      id, listing_id, buyer_id, seller_id, amount, status, expires_at,
      conversation_id, message_id, created_at, updated_at
    ) values (
      gen_random_uuid(), v_conversation.listing_id, v_conversation.buyer_id, v_conversation.seller_id,
      v_amount, coalesce(v_message.offer_status, 'pending'),
      coalesce(v_message.created_at, v_now) + interval '24 hours',
      v_conversation.id, v_message.id, coalesce(v_message.created_at, v_now), v_now
    ) returning * into v_offer;
  elsif v_offer.message_id is not null then
    select * into v_message from public.messages where id = v_offer.message_id;
  end if;
  if v_offer.status not in ('pending', 'proposed') then
    raise exception 'Offer is no longer active (current status: %)', v_offer.status using errcode = '22000';
  end if;
  -- DB-006: the chat message is the status the people in the chat acted on.
  if v_message.id is not null and coalesce(v_message.offer_status, 'pending') not in ('pending', 'proposed') then
    raise exception 'Offer is no longer active (current status: %)', v_message.offer_status using errcode = '22000';
  end if;
  if v_offer.expires_at < v_now then
    update public.offers set status = 'expired', updated_at = v_now where id = v_offer.id;
    raise exception 'Offer has expired' using errcode = '22000';
  end if;
  select * into v_listing from public.listings where id = v_offer.listing_id for update;
  if not found then
    raise exception 'Listing not found' using errcode = 'P0002';
  end if;
  if v_offer.seller_id is distinct from v_listing.seller_id then
    raise exception 'Offer does not belong to this listing''s seller' using errcode = '42501';
  end if;
  if v_caller_id <> v_offer.buyer_id and v_caller_id <> v_offer.seller_id and not v_is_admin then
    raise exception 'Not authorized to accept an offer in this conversation' using errcode = '42501';
  end if;
  if v_message.id is not null and v_message.sender_id is not null and v_caller_id = v_message.sender_id and not v_is_admin then
    raise exception 'Cannot accept your own offer' using errcode = '22000';
  end if;
  if v_listing.is_sold or exists (
       select 1 from public.listings l
        where l.is_sold
          and l.id::text in (
                select x from jsonb_array_elements_text(
                  case when jsonb_typeof(v_message.metadata->'bundle_item_ids') = 'array'
                       then v_message.metadata->'bundle_item_ids' else '[]'::jsonb end) as x)
     ) then
    raise exception 'Listing has already been sold' using errcode = '23505';
  end if;
  if v_offer.amount > coalesce(public.offer_price_ceiling(v_listing.id, v_message.metadata), v_listing.price)
     and not v_is_admin then
    raise exception 'Offer amount cannot exceed listing price' using errcode = '22000';
  end if;
  update public.offers set status = 'accepted', accepted_at = v_now, updated_at = v_now where id = v_offer.id;
  if v_offer.message_id is not null then
    update public.messages set offer_status = 'accepted', updated_at = v_now where id = v_offer.message_id;
  end if;
  return jsonb_build_object(
    'success', true, 'offer_id', v_offer.id, 'listing_id', v_listing.id,
    'buyer_id', v_offer.buyer_id, 'amount', v_offer.amount, 'status', 'accepted'
  );
end;
$function$;

