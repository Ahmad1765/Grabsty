-- Regression check for audit batch 3: WF-010 (payout ledger, payout method
-- before pickup), WF-009 (rider sees the cash to collect), ADM-004 (COD cash
-- recorded at delivery, every step logged), WF-012 (completion message).
-- Needs one admin profile. Everything rolls back; a failed expectation raises.
begin;

do $$
declare
  s uuid := gen_random_uuid(); b uuid := gen_random_uuid(); r uuid := gen_random_uuid();
  adm uuid := (select id from public.profiles where is_admin limit 1);
  l uuid; o public.orders; conv uuid; j jsonb; msg text; p public.seller_payouts;
  addr jsonb := '{"line1":"1 St","city":"Lahore","phone":"03001234567"}';
  pick jsonb := '{"recipientName":"S","phone":"03001234567","line1":"2 St","city":"Lahore"}';
begin
  assert adm is not null, 'needs an admin profile';
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u || '@t.test', now(), now()
  from unnest(array[s, b, r]) u;
  insert into public.riders (user_id) values (r);
  insert into public.listings (seller_id, title, price, images, category, gender, condition)
  values (s, 'R', 1500, '{}', 'clothing', 'men', 'good') returning id into l;
  insert into public.conversations (buyer_id, seller_id, listing_id) values (b, s, l) returning id into conv;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  o := public.process_checkout(l, null, 'cod', addr);

  -- WF-010: no payout method, no pickup.
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  msg := null;
  begin perform public.advance_order_fulfillment(o.id, 'packing', null, null, null, null, pick);
  exception when others then msg := sqlerrm; end;
  assert msg like 'Add a payout method in Settings before booking pickup%', 'booked pickup without payout method: ' || coalesce(msg, 'no error');
  insert into public.payout_methods (user_id, kind, label, provider, account_title, account_number, account_last4, is_default)
  values (s, 'wallet', 'JazzCash', 'JazzCash', 'S', '03001234567', '4567', true);
  perform public.advance_order_fulfillment(o.id, 'packing', null, null, null, null, pick);

  -- WF-009: the rider is told how much cash to collect: 1500 + 90 protection + 130 delivery.
  perform set_config('request.jwt.claims', json_build_object('sub', r, 'role', 'authenticated')::text, true);
  perform public.courier_confirm_pickup(o.id, (select pickup_code from public.order_seller_pickups where order_id = o.id));
  j := public.courier_pickup_info(o.id);
  assert (j->>'collect')::int = 1720, 'rider collect amount: ' || coalesce(j->>'collect', 'missing');
  assert ((public.rider_deliveries())->'items'->0->>'collect')::int = 1720, 'rider list collect amount';

  -- ADM-004: delivery records the cash, and each step is logged with who did it.
  perform public.courier_confirm_delivery(o.id);
  select * into o from public.orders where id = o.id;
  assert o.payment_status = 'paid' and o.cod_paid_at is not null, 'COD cash not recorded at delivery';
  assert exists (select 1 from public.transaction_event_logs
                  where order_id = o.id and action = 'FULFILLMENT_CHANGE' and to_status = 'delivered' and actor_id = r),
    'delivery not logged against the rider';
  assert (select count(*) from public.transaction_event_logs where order_id = o.id and action = 'FULFILLMENT_CHANGE') >= 3,
    'packing / pickup / delivery not all logged';

  -- WF-010 + WF-012: admin release writes what the seller is owed, and says so.
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  perform public.advance_escrow_status(o.id, 'COMPLETED_FUNDS_RELEASED');
  select * into p from public.seller_payouts where order_id = o.id;
  assert p.status = 'owed' and p.amount_cents = 150000 and p.seller_id = s, 'payout row wrong or missing';
  assert (select content from public.messages where conversation_id = conv and kind = 'system'
           order by created_at desc limit 1) = 'Order completed. The seller''s payout is now due.', 'completion message';

  -- The seller sees their own payout; another user doesn't.
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  assert exists (select 1 from public.seller_payouts where order_id = o.id), 'seller cannot see own payout';
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  assert not exists (select 1 from public.seller_payouts where order_id = o.id), 'buyer sees seller payout';
  msg := null;
  begin perform public.admin_mark_payout_paid(o.id, 'x'); exception when others then msg := sqlerrm; end;
  assert msg = 'Only admins can record payouts', 'non-admin marked payout paid';
  execute 'reset role';

  -- Admin records the transfer.
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  p := public.admin_mark_payout_paid(o.id, 'JC-123456');
  assert p.status = 'paid' and p.reference = 'JC-123456' and p.paid_by = adm, 'payout not marked paid';
end $$;

rollback;
