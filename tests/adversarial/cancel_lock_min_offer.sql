-- Regression check for 2026-11-14 decisions: WF-005 (no cancelling once the
-- seller booked pickup, either side) and DEV-010 (offers start at half the
-- asking price; seller counters exempt). Collects failures; rolls back.
begin;

do $$
declare
  s uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  addr jsonb := '{"recipientName":"T","line1":"1 St","city":"Lahore","country":"PK","phone":"03001234567"}';
  l1 uuid; l2 uuid; conv uuid; o1 public.orders; o2 public.orders; m uuid;
  failed text[] := '{}'; msg text;
begin
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u || '@t.test', now(), now()
  from unnest(array[s, b]) u;
  insert into public.listings (seller_id, title, price, images, category, gender, condition)
  values (s, 'C1', 1500, '{}', 'clothing', 'men', 'good') returning id into l1;
  insert into public.listings (seller_id, title, price, images, category, gender, condition)
  values (s, 'C2', 1499, '{}', 'clothing', 'men', 'good') returning id into l2;
  insert into public.conversations (buyer_id, seller_id, listing_id) values (b, s, l2) returning id into conv;

  -- DEV-010: buyer offers below half are refused (1499 -> floor 750); 750 works.
  msg := null;
  begin
    insert into public.messages (conversation_id, sender_id, content, kind, metadata)
    values (conv, b, 'Offer', 'offer', '{"amount": 749}');
  exception when others then msg := sqlerrm; end;
  if msg is distinct from 'Offers start at Rs 750 (half the asking price)' then
    failed := array_append(failed, 'DEV-010 749 on 1499 not refused: ' || coalesce(msg, 'accepted')); end if;
  insert into public.messages (conversation_id, sender_id, content, kind, metadata)
  values (conv, b, 'Offer', 'offer', '{"amount": 750}');
  if not exists (select 1 from public.offers where listing_id = l2 and amount = 750) then
    failed := array_append(failed, 'DEV-010 750 offer not recorded'); end if;
  -- A seller's own offer message isn't held to the buyer floor.
  insert into public.messages (conversation_id, sender_id, content, kind, metadata)
  values (conv, s, 'Offer', 'offer', '{"amount": 700}') returning id into m;

  -- WF-005: either side can cancel before pickup is booked; neither after.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  o1 := public.process_checkout(l1, null, 'cod', addr);
  perform set_config('request.jwt.claims', '', true);
  update public.orders set fulfillment_status = 'packing' where id = o1.id;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  msg := null;
  begin perform public.cancel_order(o1.id, 'changed my mind'); exception when others then msg := sqlerrm; end;
  if msg is null or msg not like 'The seller has booked the courier pickup%' then
    failed := array_append(failed, 'WF-005 buyer cancelled after pickup booked: ' || coalesce(msg, 'allowed')); end if;
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  msg := null;
  begin perform public.cancel_order(o1.id, 'x'); exception when others then msg := sqlerrm; end;
  if msg is null or msg not like 'You confirmed Ready to deliver%' then
    failed := array_append(failed, 'WF-005 seller cancelled after pickup booked'); end if;
  -- still pending: the buyer can cancel.
  perform set_config('request.jwt.claims', '', true);
  update public.orders set fulfillment_status = 'pending' where id = o1.id;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  o2 := public.cancel_order(o1.id, 'changed my mind');
  if o2.status <> 'canceled' then failed := array_append(failed, 'WF-005 buyer could not cancel before pickup'); end if;

  if cardinality(failed) > 0 then
    raise exception 'FAILED: %', array_to_string(failed, ' | ');
  end if;
end $$;

rollback;
