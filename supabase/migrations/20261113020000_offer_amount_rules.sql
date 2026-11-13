-- Audit 2026-11-12, batch 2 (part 2): DB-023, WEB-002, WEB-001 (offer amounts).

-- DB-023: whole rupees only, with a readable error instead of the offers_amount_whole CHECK.
create or replace function public.trg_fn_sync_offer_on_message_insert()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_conv record;
  v_amount numeric;
  v_ceiling numeric;
begin
  if new.kind = 'offer' and coalesce(new.offer_status, 'pending') = 'pending' then
    select * into v_conv from public.conversations where id = new.conversation_id;
    if v_conv.id is not null and v_conv.listing_id is not null then
      if (new.metadata->>'amount') ~ '^\s*[0-9]+(\.[0-9]+)?\s*$' then
        v_amount := (new.metadata->>'amount')::numeric;
      else
        v_amount := null;
      end if;
      if v_amount is not null and v_amount <> trunc(v_amount) then
        raise exception 'Offers must be in whole rupees' using errcode = '22000';
      end if;
      v_ceiling := public.offer_price_ceiling(v_conv.listing_id, new.metadata);
      if v_amount is not null and v_amount > 0 and (v_ceiling is null or v_amount <= v_ceiling) then
        insert into public.offers (
          listing_id, buyer_id, seller_id, amount, status,
          expires_at, conversation_id, message_id, created_at, updated_at
        ) values (
          v_conv.listing_id, v_conv.buyer_id, v_conv.seller_id, v_amount, 'pending',
          clock_timestamp() + interval '24 hours', v_conv.id, new.id,
          coalesce(new.created_at, clock_timestamp()), clock_timestamp()
        )
        on conflict do nothing;
      end if;
    end if;
  end if;
  return new;
end;
$function$;

-- DB-023 + WEB-002: whole rupees; a seller counters above the buyer's offer (up to
-- the asking price), a buyer counters below the seller's offer.
-- Body is the live alpha definition; only the marked block changed.
create or replace function public.counter_chat_offer(p_parent_offer_id uuid, p_amount numeric, p_note text default null::text, p_content text default null::text, p_conversation_id uuid default null::uuid, p_sender_id uuid default null::uuid)
 returns messages
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_sender_id uuid := auth.uid();
  v_parent public.messages;
  v_conversation public.conversations;
  v_child_msg public.messages;
  v_content text;
  v_amount_val numeric;
  v_parent_amount numeric;
  v_ceiling numeric;
  v_now timestamptz := clock_timestamp();
begin
  perform set_config('ceranix.in_counter_offer', 'on', true);
  -- p_sender_id is ignored: the sender is always the authenticated caller.
  if v_sender_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Invalid offer amount' using errcode = '22000';
  end if;
  if p_amount <> trunc(p_amount) then
    raise exception 'Offers must be in whole rupees' using errcode = '22000';
  end if;
  v_amount_val := p_amount;
  select * into v_parent from public.messages where id = p_parent_offer_id for update;
  if not found then
    raise exception 'Parent offer message not found' using errcode = 'P0002';
  end if;
  if v_parent.kind <> 'offer' then
    raise exception 'Target message is not an offer' using errcode = '22000';
  end if;
  if v_parent.offer_status not in ('proposed', 'pending') then
    raise exception 'Offer is no longer active (current status: %)', v_parent.offer_status using errcode = '22000';
  end if;
  select * into v_conversation from public.conversations where id = v_parent.conversation_id;
  if not found then
    raise exception 'Conversation not found' using errcode = 'P0002';
  end if;
  if p_conversation_id is not null and p_conversation_id <> v_parent.conversation_id then
    raise exception 'Conversation mismatch' using errcode = '22000';
  end if;
  if v_sender_id <> v_conversation.buyer_id and v_sender_id <> v_conversation.seller_id then
    raise exception 'Not authorized to make an offer in this conversation' using errcode = '42501';
  end if;
  if v_sender_id = v_parent.sender_id then
    raise exception 'Cannot counter your own offer' using errcode = '22000';
  end if;
  -- WEB-002: the counter has to move towards the other side's amount.
  if (v_parent.metadata->>'amount') ~ '^\s*[0-9]+(\.[0-9]+)?\s*$' then
    v_parent_amount := (v_parent.metadata->>'amount')::numeric;
  end if;
  if v_parent_amount is not null then
    if v_sender_id = v_conversation.seller_id then
      if v_amount_val <= v_parent_amount then
        raise exception 'Your counter must be more than the buyer''s offer (Rs %)',
          to_char(v_parent_amount, 'FM999,999,999') using errcode = '22000';
      end if;
      v_ceiling := public.offer_price_ceiling(v_conversation.listing_id, v_parent.metadata);
      if v_ceiling is not null and v_amount_val > v_ceiling then
        raise exception 'Your counter can''t be more than the asking price (Rs %)',
          to_char(v_ceiling, 'FM999,999,999') using errcode = '22000';
      end if;
    elsif v_amount_val >= v_parent_amount then
      raise exception 'Your counter must be less than the seller''s offer (Rs %)',
        to_char(v_parent_amount, 'FM999,999,999') using errcode = '22000';
    end if;
  end if;
  update public.messages set offer_status = 'countered', updated_at = v_now where id = p_parent_offer_id;
  update public.offers set status = 'countered', updated_at = v_now
   where message_id = p_parent_offer_id or id = p_parent_offer_id;
  v_content := coalesce(
    nullif(trim(p_content), ''),
    nullif(trim(p_note), ''),
    'Counter-Offer: PKR ' || to_char(v_amount_val, 'FM999,999,999.00')
  );
  insert into public.messages (
    conversation_id, sender_id, content, kind, offer_status, parent_offer_id, metadata, created_at, updated_at
  ) values (
    v_conversation.id, v_sender_id, v_content, 'offer', 'pending', p_parent_offer_id,
    jsonb_strip_nulls(jsonb_build_object(
      'amount', v_amount_val,
      'offer_amount', v_amount_val,
      'currency', 'PKR',
      'note', nullif(trim(p_note), ''),
      'parent_offer_id', p_parent_offer_id,
      'counter_to', p_parent_offer_id,
      'is_bundle', v_parent.metadata->'is_bundle',
      'base_listing_id', v_parent.metadata->'base_listing_id',
      'bundle_item_ids', v_parent.metadata->'bundle_item_ids',
      'bundle_count', v_parent.metadata->'bundle_count'
    )),
    v_now, v_now
  ) returning * into v_child_msg;
  update public.conversations set updated_at = v_now where id = v_conversation.id;
  return v_child_msg;
end;
$function$;

-- WEB-001: a readable total in the "Price has changed" error (was 1402.0000000000000000).
-- Body is the batch-1 definition (20261113000000); only that message changed.
create or replace function public.process_checkout(p_listing_id uuid, p_buyer_id uuid default null::uuid, p_payment_method text default 'cod'::text, p_shipping_address jsonb default null::jsonb, p_offer_amount numeric default null::numeric, p_delivery_notes text default null::text, p_shipping_method text default 'managed'::text, p_bundle_item_ids uuid[] default null::uuid[], p_expected_total numeric default null::numeric)
 returns orders
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_is_service_role boolean := (coalesce(auth.role(), '') = 'service_role' or coalesce(auth.jwt()->>'role', '') = 'service_role');
  v_caller_id uuid := case
    when (coalesce(auth.role(), '') = 'service_role' or coalesce(auth.jwt()->>'role', '') = 'service_role')
      then coalesce(p_buyer_id, auth.uid())
    else auth.uid()
  end;
  v_listing public.listings;
  v_seller_id uuid;
  v_order public.orders;
  v_existing_order public.orders;
  v_accepted_offer public.offers;
  v_item_price_cents integer;
  v_shipping_fee_cents integer;
  v_fee_cents integer;
  v_total_cents integer;
  v_order_status text;
  v_session_id text;
  v_ordered_listing_ids uuid[];
  v_addon_ids uuid[];
  v_addon_ids_text text[];
  v_bundle_count integer;
  v_is_seller_mismatch boolean;
  v_bundle_subtotal_cents integer;
  v_bundle_discount_pct integer := 0;
  v_shipping_method text;
  v_now timestamptz := clock_timestamp();
begin
  if v_caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_payment_method not in ('card', 'cod') then
    raise exception 'Invalid payment method: %', p_payment_method using errcode = '22000';
  end if;
  if p_shipping_address is null then
    raise exception 'Shipping address is required' using errcode = '22000';
  end if;
  -- A card order is only real once Stripe has taken the money; the webhook creates those rows itself.
  if p_payment_method = 'card' and not v_is_service_role then
    raise exception 'Card payments must be completed through secure checkout' using errcode = '42501';
  end if;
  v_shipping_method := coalesce(p_shipping_method, 'managed');
  -- DB-002: only platform delivery is offered.
  if v_shipping_method <> 'managed' then
    raise exception 'Invalid shipping method: %', v_shipping_method using errcode = '22000';
  end if;
  -- DB-001: throttle COD checkouts. Taken first so its per-user lock also serialises the cap check below.
  if p_payment_method = 'cod' and not v_is_service_role then
    -- Same rule as the checkout screen: once spaces, dashes and brackets go, 10-15 digits with an optional leading +.
    if regexp_replace(coalesce(p_shipping_address->>'phone', ''), '[\s()-]', '', 'g') !~ '^\+?[0-9]{10,15}$' then
      raise exception 'Please enter a valid contact phone number (10 to 15 digits)' using errcode = '22000';
    end if;
    perform public.enforce_rate_limit('order_create', 10, interval '1 hour');
  end if;
  v_addon_ids := array(
    select distinct x from unnest(coalesce(p_bundle_item_ids, '{}'::uuid[])) as x
     where x is not null and x <> p_listing_id
  );
  v_addon_ids_text := array(select x::text from unnest(v_addon_ids) as x order by 1);
  v_ordered_listing_ids := array(
    select x from unnest(array_append(v_addon_ids, p_listing_id)) as x order by x
  );
  v_bundle_count := cardinality(v_ordered_listing_ids);
  perform 1 from public.listings where id = any(v_ordered_listing_ids) order by id for update;
  if (select count(*) from public.listings where id = any(v_ordered_listing_ids)) <> v_bundle_count then
    raise exception 'One or more items in the order were not found' using errcode = 'P0002';
  end if;
  select count(distinct seller_id) > 1, max(seller_id::text)::uuid
    into v_is_seller_mismatch, v_seller_id
    from public.listings
   where id = any(v_ordered_listing_ids);
  if v_is_seller_mismatch then
    raise exception 'All bundled items must be from the same seller' using errcode = '22000';
  end if;
  if v_seller_id = v_caller_id then
    raise exception 'You cannot buy your own listings' using errcode = '22000';
  end if;
  if exists (select 1 from public.listings where id = any(v_ordered_listing_ids) and is_sold) then
    raise exception '%', case when v_bundle_count = 1 then 'Listing is already sold'
                              else 'One or more items in the bundle are already sold' end
      using errcode = '22000';
  end if;
  select * into v_listing from public.listings where id = p_listing_id;
  select o.* into v_accepted_offer
    from public.offers o
    left join public.messages m on m.id = o.message_id
   where o.listing_id = p_listing_id
     and o.buyer_id = v_caller_id
     and o.seller_id = v_seller_id
     and o.status = 'accepted'
     and (o.expires_at > v_now or o.accepted_at > (v_now - interval '24 hours'))
     and array(
           select distinct x
             from jsonb_array_elements_text(
                    case when jsonb_typeof(m.metadata->'bundle_item_ids') = 'array'
                         then m.metadata->'bundle_item_ids' else '[]'::jsonb end) as x
            where x <> p_listing_id::text
            order by x
         ) = v_addon_ids_text
   order by o.accepted_at desc nulls last, o.created_at desc
   limit 1;
  select sum(round(price * 100))::integer
    into v_bundle_subtotal_cents
    from public.listings
   where id = any(v_ordered_listing_ids);
  if v_accepted_offer.id is not null then
    v_item_price_cents := round(v_accepted_offer.amount * 100)::integer;
  elsif v_bundle_count > 1 then
    select least(30, greatest(0, coalesce(bundle_discount_pct, 0)))
      into v_bundle_discount_pct
      from public.profiles
     where id = v_seller_id;
    v_item_price_cents := v_bundle_subtotal_cents
      - round(v_bundle_subtotal_cents * coalesce(v_bundle_discount_pct, 0) / 100.0)::integer;
  else
    v_item_price_cents := v_bundle_subtotal_cents;
  end if;
  -- Must match lib/fees.ts (6% Buyer Protection; Rs 130 / Rs 180 large parcel)
  v_fee_cents := (round(v_item_price_cents * 6 / 10000.0) * 100)::integer;
  v_shipping_fee_cents := case
    when v_listing.parcel_size = 'large' then 18000
    else 13000
  end;
  v_total_cents := v_item_price_cents + v_fee_cents + v_shipping_fee_cents;
  if p_expected_total is not null and abs(round(p_expected_total * 100) - v_total_cents) > 5 then
    raise exception 'Price has changed: expected total % PKR but calculated % PKR. Please review before proceeding.',
      p_expected_total, (v_total_cents / 100)
      using errcode = '22000';
  end if;
  if p_payment_method = 'cod' then
    v_order_status := 'pending';
    v_session_id := 'cod_' || gen_random_uuid()::text;
  else
    v_order_status := 'paid';
    v_session_id := 'pay_' || gen_random_uuid()::text;
  end if;
  select * into v_existing_order
    from public.orders
   where listing_id = p_listing_id
     and buyer_id = v_caller_id
     and status in ('awaiting_payment', 'pending')
   order by created_at desc
   limit 1
   for update;
  -- DB-001: cap open (not yet delivered) COD orders. Re-checking out the same order doesn't add one.
  -- A COD order stays status 'pending' until completed; delivery progress is fulfillment_status.
  if p_payment_method = 'cod' and not v_is_service_role
     and (select count(*) from public.orders
           where buyer_id = v_caller_id
             and payment_method = 'cod'
             and status = 'pending'
             and fulfillment_status in ('pending', 'packing', 'picked', 'shifting')
             and id is distinct from v_existing_order.id) >= 3 then
    raise exception 'You already have 3 cash on delivery orders on the way. Wait for one to arrive or cancel one before ordering more.'
      using errcode = '22000';
  end if;
  if v_existing_order.id is not null then
    update public.orders
       set amount_cents = v_item_price_cents,
           fee_cents = v_fee_cents,
           payment_method = p_payment_method,
           payment_status = case when p_payment_method = 'cod' then 'pending' else 'paid' end,
           status = v_order_status,
           fulfillment_status = 'pending',
           shipping_method = v_shipping_method,
           shipping_fee_cents = v_shipping_fee_cents,
           shipping_address = p_shipping_address,
           delivery_notes = coalesce(p_delivery_notes, delivery_notes),
           stripe_session_id = v_session_id,
           bundle_item_ids = case when v_bundle_count > 1 then v_addon_ids else null end,
           bundle_count = v_bundle_count
     where id = v_existing_order.id
    returning * into v_order;
  else
    insert into public.orders (
      listing_id, buyer_id, seller_id, amount_cents, fee_cents,
      status, fulfillment_status, payment_method, payment_status,
      shipping_method, shipping_fee_cents,
      shipping_address, delivery_notes, stripe_session_id,
      bundle_item_ids, bundle_count
    ) values (
      p_listing_id, v_caller_id, v_seller_id,
      v_item_price_cents, v_fee_cents,
      v_order_status, 'pending', p_payment_method,
      case when p_payment_method = 'cod' then 'pending' else 'paid' end,
      v_shipping_method, v_shipping_fee_cents,
      p_shipping_address, p_delivery_notes, v_session_id,
      case when v_bundle_count > 1 then v_addon_ids else null end,
      v_bundle_count
    ) returning * into v_order;
  end if;
  update public.listings
     set is_sold = true,
         reserved_until = null
   where id = any(v_ordered_listing_ids);
  update public.offers
     set status = 'declined',
         updated_at = v_now
   where listing_id = any(v_ordered_listing_ids)
     and id is distinct from v_accepted_offer.id
     and status in ('pending', 'accepted');
  -- cancelled_by is a uuid; a system cancellation leaves it null.
  update public.orders
     set status = 'canceled',
         fulfillment_status = 'canceled',
         cancel_reason = 'Item sold to another buyer',
         cancelled_by = null
   where listing_id = any(v_ordered_listing_ids)
     and id <> v_order.id
     and status = 'awaiting_payment';
  return v_order;
end;
$function$;
