-- Regression check for audit batch 2: DB-006 (offer status in one place, one
-- expiry), DB-023 (whole rupees), WEB-002 (counter between the two sides),
-- WEB-001 (readable "Price has changed" total). Everything rolls back; a failed
-- expectation raises and aborts.
begin;

do $$
declare
  s uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  l uuid; conv uuid; m1 uuid; m2 uuid; ctr public.messages;
  addr jsonb := '{"line1":"1 St","city":"Lahore","phone":"03001234567"}';
  msg text;
begin
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u || '@t.test', now(), now()
  from unnest(array[s, b]) u;
  insert into public.listings (seller_id, title, price, images, category, gender, condition)
  values (s, 'R', 1500, '{}', 'clothing', 'men', 'good') returning id into l;
  insert into public.conversations (buyer_id, seller_id, listing_id) values (b, s, l) returning id into conv;

  -- DB-006: a withdrawn offer is withdrawn in offers too, and can't be accepted.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  insert into public.messages (conversation_id, sender_id, content, kind, metadata, offer_status)
  values (conv, b, 'Offer', 'offer', '{"amount": 900}', 'pending') returning id into m1;
  update public.messages set offer_status = 'withdrawn' where id = m1;
  assert (select status from public.offers where message_id = m1) = 'canceled', 'withdraw not mirrored';
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  msg := null;
  begin perform public.accept_chat_offer(m1); exception when others then msg := sqlerrm; end;
  assert msg like 'Offer is no longer active%', 'accepted a withdrawn offer: ' || coalesce(msg, 'no error');

  -- DB-006: declined is final, and a direct 'accepted' update is refused.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  insert into public.messages (conversation_id, sender_id, content, kind, metadata, offer_status)
  values (conv, b, 'Offer', 'offer', '{"amount": 950}', 'pending') returning id into m2;
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  msg := null;
  begin update public.messages set offer_status = 'accepted' where id = m2; exception when others then msg := sqlerrm; end;
  assert msg = 'Offers are accepted with accept_chat_offer', 'direct accept allowed: ' || coalesce(msg, 'no error');
  update public.messages set offer_status = 'declined' where id = m2;
  assert (select status from public.offers where message_id = m2) = 'declined', 'decline not mirrored';
  msg := null;
  begin perform public.accept_chat_offer(m2); exception when others then msg := sqlerrm; end;
  assert msg like 'Offer is no longer active%', 'accepted a declined offer: ' || coalesce(msg, 'no error');

  -- DB-006: one 24h expiry, swept in both tables.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  insert into public.messages (conversation_id, sender_id, content, kind, metadata, offer_status, created_at)
  values (conv, b, 'Offer', 'offer', '{"amount": 1000}', 'pending', now() - interval '25 hours') returning id into m2;
  update public.offers set expires_at = now() - interval '1 hour' where message_id = m2;
  perform set_config('request.jwt.claims', '', true);
  perform public.sweep_expired_offers_and_reservations();
  assert (select offer_status from public.messages where id = m2) = 'expired', 'message not expired at 24h';
  assert (select status from public.offers where message_id = m2) = 'expired', 'offer row not expired';

  -- DB-023: fractional amounts get a readable error.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  msg := null;
  begin insert into public.messages (conversation_id, sender_id, content, kind, metadata, offer_status)
        values (conv, b, 'Offer', 'offer', '{"amount": 500.5}', 'pending'); exception when others then msg := sqlerrm; end;
  assert msg = 'Offers must be in whole rupees', 'fractional offer: ' || coalesce(msg, 'no error');
  insert into public.messages (conversation_id, sender_id, content, kind, metadata, offer_status)
  values (conv, b, 'Offer', 'offer', '{"amount": 1300}', 'pending') returning id into m1;
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  msg := null;
  begin perform public.counter_chat_offer(m1, 1350.5); exception when others then msg := sqlerrm; end;
  assert msg = 'Offers must be in whole rupees', 'fractional counter: ' || coalesce(msg, 'no error');

  -- WEB-002: seller counters above the buyer's 1300 and at most the 1500 asking price.
  msg := null;
  begin perform public.counter_chat_offer(m1, 1200); exception when others then msg := sqlerrm; end;
  assert msg like 'Your counter must be more than the buyer''s offer (Rs 1,300)%', 'low counter: ' || coalesce(msg, 'no error');
  msg := null;
  begin perform public.counter_chat_offer(m1, 1600); exception when others then msg := sqlerrm; end;
  assert msg like 'Your counter can''t be more than the asking price (Rs 1,500)%', 'high counter: ' || coalesce(msg, 'no error');
  ctr := public.counter_chat_offer(m1, 1400);
  -- ...and the buyer counters below the seller's 1400.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  msg := null;
  begin perform public.counter_chat_offer(ctr.id, 1400); exception when others then msg := sqlerrm; end;
  assert msg like 'Your counter must be less than the seller''s offer (Rs 1,400)%', 'buyer counter up: ' || coalesce(msg, 'no error');

  -- WEB-001: after accepting 1400, a full-price total (1720) is refused with a readable total.
  perform public.accept_chat_offer(ctr.id);
  msg := null;
  begin perform public.process_checkout(l, null, 'cod', addr, null, null, 'managed', null, 1720); exception when others then msg := sqlerrm; end;
  assert msg like 'Price has changed: expected total 1720 PKR but calculated 1614 PKR.%', 'price error: ' || coalesce(msg, 'no error');
  -- the agreed total goes through: 1400 + 84 protection + 130 delivery.
  assert (public.process_checkout(l, null, 'cod', addr, null, null, 'managed', null, 1614)).amount_cents = 140000, 'agreed price not charged';
end $$;

rollback;
