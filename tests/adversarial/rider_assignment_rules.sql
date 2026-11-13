-- Regression check for audit batch 4: ADM-001 (assigned rider only), ADM-002
-- (no system-account riders, no rider on a closed order, removal releases
-- orders), DB-003 (pickup-code lock expires), WEB-008 (to-pick-up state).
-- Needs one admin profile. Everything rolls back; a failed expectation raises.
begin;

do $$
declare
  s uuid := gen_random_uuid(); b uuid := gen_random_uuid(); r1 uuid := gen_random_uuid(); r2 uuid := gen_random_uuid();
  adm uuid := (select id from public.profiles where is_admin limit 1);
  l uuid; l2 uuid; o public.orders; o2 public.orders; j jsonb; msg text; code text;
  addr jsonb := '{"line1":"1 St","city":"Lahore","phone":"03001234567"}';
  pick jsonb := '{"recipientName":"S","phone":"03001234567","line1":"2 St","city":"Lahore"}';
begin
  assert adm is not null, 'needs an admin profile';
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u || '@t.test', now(), now()
  from unnest(array[s, b, r1, r2]) u;
  insert into public.riders (user_id) values (r1), (r2);
  insert into public.payout_methods (user_id, kind, label, provider, account_title, account_number, account_last4, is_default)
  values (s, 'wallet', 'JazzCash', 'JazzCash', 'S', '03001234567', '4567', true);
  insert into public.listings (seller_id, title, price, images, category, gender, condition)
  values (s, 'A', 1500, '{}', 'clothing', 'men', 'good') returning id into l;
  insert into public.listings (seller_id, title, price, images, category, gender, condition)
  values (s, 'B', 1500, '{}', 'clothing', 'men', 'good') returning id into l2;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  o := public.process_checkout(l, null, 'cod', addr);
  o2 := public.process_checkout(l2, null, 'cod', addr);
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  perform public.advance_order_fulfillment(o.id, 'packing', null, null, null, null, pick);
  perform public.advance_order_fulfillment(o2.id, 'packing', null, null, null, null, pick);
  code := (select pickup_code from public.order_seller_pickups where order_id = o.id);
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  perform public.admin_assign_rider(o.id, r2);

  -- ADM-002: system accounts can't be riders; closed orders can't get one.
  msg := null;
  begin perform public.admin_set_rider('00000000-0000-0000-0000-000000000001', true); exception when others then msg := sqlerrm; end;
  assert msg = 'Only a real Grabsty account can be a rider', 'support bot made a rider: ' || coalesce(msg, 'no error');
  update public.orders set status = 'canceled', fulfillment_status = 'canceled' where id = o2.id;
  msg := null;
  begin perform public.admin_assign_rider(o2.id, r1); exception when others then msg := sqlerrm; end;
  assert msg like 'This order is closed%', 'rider assigned to a cancelled order: ' || coalesce(msg, 'no error');

  -- WEB-008: the assigned rider sees the order as waiting for pickup.
  perform set_config('request.jwt.claims', json_build_object('sub', r2, 'role', 'authenticated')::text, true);
  j := public.rider_deliveries();
  assert j->'items'->0->>'state' = 'to_pick_up', 'assigned order not to_pick_up: ' || coalesce(j->'items'->0->>'state', 'none');

  -- ADM-001: another rider can't see the pickup or use the code.
  perform set_config('request.jwt.claims', json_build_object('sub', r1, 'role', 'authenticated')::text, true);
  assert public.courier_pickup_info(o.id)->>'state' = 'other_rider', 'other rider sees pickup';
  assert public.courier_confirm_pickup(o.id, code)->>'state' = 'other_rider', 'other rider took the order';
  assert (select rider_id from public.orders where id = o.id) = r2, 'rider_id overwritten';
  assert (select pickup_code_attempts from public.order_seller_pickups where order_id = o.id) = 0, 'other rider used up attempts';

  -- DB-003: the 5th wrong code locks the pickup and gives the seller a new code;
  -- a seller re-save doesn't extend the lock; 30 minutes later the new code works.
  perform set_config('request.jwt.claims', json_build_object('sub', r2, 'role', 'authenticated')::text, true);
  for i in 1..5 loop perform public.courier_confirm_pickup(o.id, case when code = '000000' then '111111' else '000000' end); end loop;
  assert (select pickup_code from public.order_seller_pickups where order_id = o.id) <> code, 'code not rotated on lock';
  assert public.courier_confirm_pickup(o.id, code)->>'state' = 'locked', 'not locked after 5 wrong codes';
  update public.order_seller_pickups
     set pickup_code_locked_at = now() - interval '31 minutes', updated_at = now()
   where order_id = o.id;
  assert public.courier_pickup_info(o.id)->>'state' = 'ready', 'lock did not expire in pickup info';
  assert public.courier_confirm_pickup(o.id, code)->>'state' = 'wrong_code', 'old code still works after rotation';
  code := (select pickup_code from public.order_seller_pickups where order_id = o.id);
  assert public.courier_confirm_pickup(o.id, code)->>'state' = 'in_transit', 'new code refused after the lock expired';

  -- ADM-002: an order in transit stays with its rider (no reassigning, removal keeps it).
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  msg := null;
  begin perform public.admin_assign_rider(o.id, r1); exception when others then msg := sqlerrm; end;
  assert msg like 'This order is in transit with its rider%', 'in-transit order reassigned: ' || coalesce(msg, 'no error');
  perform public.admin_set_rider(r2, false);
  assert (select rider_id from public.orders where id = o.id) = r2, 'removing the rider dropped a parcel in transit';

  -- ...but an order not picked up yet is handed back, and a pending one shows as to_pick_up.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  o2 := public.process_checkout(l2, null, 'cod', addr); -- the cancelled order relisted l2
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  insert into public.riders (user_id) values (r2);
  perform public.admin_assign_rider(o2.id, r2);
  perform set_config('request.jwt.claims', json_build_object('sub', r2, 'role', 'authenticated')::text, true);
  assert exists (select 1 from jsonb_array_elements(public.rider_deliveries()->'items') x
                  where x->>'id' = o2.id::text and x->>'state' = 'to_pick_up'), 'pending assigned order not to_pick_up';
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  perform public.admin_set_rider(r2, false);
  assert (select rider_id from public.orders where id = o2.id) is null, 'removed rider still holds an order not picked up';
end $$;

rollback;
