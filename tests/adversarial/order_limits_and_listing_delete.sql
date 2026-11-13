-- Regression check for audit batch 1: DB-001 (COD cap + order rate limit),
-- DB-002 (self_ship rejected), DB-004 (rate-limit error), DB-012/WF-001 (listing
-- soft-delete, undoing a manual "sold"). Everything rolls back; a failed
-- expectation raises and aborts.
begin;

do $$
declare
  s uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  l uuid; addon uuid; ids uuid[] := '{}'; o public.orders;
  addr jsonb := '{"line1":"1 St","city":"Lahore","phone":"03001234567"}';
  n int; msg text; state text;
begin
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u || '@t.test', now(), now()
  from unnest(array[s, b, c]) u;
  for i in 1..5 loop
    insert into public.listings (seller_id, title, price, images, category, gender, condition)
    values (s, 'T' || i, 1000, '{}', 'clothing', 'men', 'good') returning id into l;
    ids := ids || l;
  end loop;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);

  -- DB-001: junk phone refused, formatted phone accepted.
  msg := null;
  begin perform public.process_checkout(ids[1], null, 'cod', addr || '{"phone":"1"}'); exception when others then msg := sqlerrm; end;
  assert msg like 'Please enter a valid contact phone number%', 'junk phone accepted: ' || coalesce(msg, 'no error');
  o := public.process_checkout(ids[1], null, 'cod', addr || '{"phone":"+92 (300) 123-4567"}');
  perform public.cancel_order(o.id, 'probe');
  delete from public.rate_limit_events where user_id = b;

  -- DB-001: the 4th open COD order is refused; re-checking out an open one is not.
  for i in 1..3 loop perform public.process_checkout(ids[i], null, 'cod', addr); end loop;
  msg := null;
  begin perform public.process_checkout(ids[4], null, 'cod', addr); exception when others then msg := sqlerrm; end;
  assert msg like 'You already have 3 cash on delivery orders%', 'COD cap not enforced: ' || coalesce(msg, 'no error');
  assert not (select is_sold from public.listings where id = ids[4]), 'capped checkout locked the listing';
  -- ...a delivered (not yet completed) order no longer counts as open.
  perform set_config('request.jwt.claims', '', true); -- the logistics team marks it delivered
  update public.orders set fulfillment_status = 'delivered' where buyer_id = b and listing_id = ids[3] and status = 'pending';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform public.process_checkout(ids[4], null, 'cod', addr);

  -- DB-001: order/cancel cycling stops at 10 per hour.
  update public.orders set status = 'canceled', fulfillment_status = 'canceled' where buyer_id = b;
  update public.listings set is_sold = false where id = ids[5];
  delete from public.rate_limit_events where user_id = b;
  n := 0; msg := null;
  for i in 1..12 loop
    begin
      o := public.process_checkout(ids[5], null, 'cod', addr);
      perform public.cancel_order(o.id, 'probe');
      n := n + 1;
    exception when others then msg := sqlerrm; state := sqlstate; exit; end;
  end loop;
  -- DB-004: the limit reports as P0001 with a readable message.
  assert n = 10 and state = 'P0001' and msg like 'Rate limit reached for order_create%',
    format('rate limit: %s cycles, %s %s', n, state, msg);
  state := null;
  begin
    perform public.enforce_user_rate_limit(b, 'probe', 1, interval '1 minute');
    perform public.enforce_user_rate_limit(b, 'probe', 1, interval '1 minute');
  exception when others then state := sqlstate; msg := sqlerrm; end;
  assert state = 'P0001' and msg like 'Rate limit reached for probe%', format('user rate limit: %s %s', state, msg);
  delete from public.rate_limit_events where user_id = b;

  -- DB-002: self_ship is refused.
  insert into public.listings (seller_id, title, price, images, category, gender, condition)
  values (s, 'SS', 1000, '{}', 'clothing', 'men', 'good') returning id into l;
  msg := null;
  begin perform public.process_checkout(l, null, 'cod', '{}'::jsonb, null, null, 'self_ship'); exception when others then msg := sqlerrm; end;
  assert msg = 'Invalid shipping method: self_ship', 'self_ship accepted: ' || coalesce(msg, 'no error');

  -- DB-012: deleting a listing with only cancelled orders hides it and closes its open offers;
  -- a bundled add-on with order history is kept too.
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  insert into public.offers (listing_id, buyer_id, seller_id, amount) values (ids[5], c, s, 800);
  insert into public.listings (seller_id, title, price, images, category, gender, condition)
  values (s, 'Addon', 1000, '{}', 'clothing', 'men', 'good') returning id into addon;
  update public.orders set bundle_item_ids = array[addon] where id = o.id;
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  delete from public.listings where id = ids[5];
  delete from public.listings where id = addon;
  execute 'reset role';
  assert (select deleted_at is not null and is_sold from public.listings where id = ids[5]), 'not soft-deleted';
  assert (select deleted_at is not null from public.listings where id = addon), 'bundled add-on hard-deleted';
  assert not exists (select 1 from public.offers where listing_id = ids[5] and status in ('pending', 'accepted')), 'offer left open';
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  assert not exists (select 1 from public.listings where id = ids[5]), 'bystander still sees deleted listing';
  execute 'reset role';

  -- ...a listing with no history is still really deleted.
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  delete from public.listings where id = l;
  execute 'reset role';
  assert not exists (select 1 from public.listings where id = l), 'plain delete broke';

  -- DB-012: seller can undo a manual "sold", but not on a listing with a live order or a deleted one.
  execute 'set local role authenticated';
  update public.listings set is_sold = true where id = ids[4];
  update public.listings set is_sold = false where id = ids[4];
  assert not (select is_sold from public.listings where id = ids[4]), 'manual sold not undone';
  msg := null;
  begin update public.listings set is_sold = false where id = ids[5]; exception when others then msg := sqlerrm; end;
  assert msg = 'A sold listing can only be relisted by Grabsty', 'deleted listing relisted';
  execute 'reset role';
  update public.orders set status = 'pending', fulfillment_status = 'pending' where listing_id = ids[1];
  update public.listings set is_sold = true where id = ids[1]; -- cancelling earlier relisted it
  execute 'set local role authenticated';
  msg := null;
  begin update public.listings set is_sold = false where id = ids[1]; exception when others then msg := sqlerrm; end;
  -- The UPDATE policy already hides listings with a live order (0 rows), or the guard raises.
  assert (select is_sold from public.listings where id = ids[1]), 'relisted an item with a live order';
  execute 'reset role';
end $$;

rollback;
