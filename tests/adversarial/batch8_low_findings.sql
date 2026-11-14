-- Regression check for audit batch 8 (DB / ADM lows): DB-009 (seller can't
-- rewrite courier details), DB-017 (contact-match budget), DB-018 (12-character
-- tracker only, throttle on the real client IP), DB-019 (dead order RPCs not
-- callable), DB-020 (server-owned counters, report status, rankings),
-- DB-022 (unused anon grants), ADM-007 (support case text, topic, empty admin
-- message), ADM-008 (blocked user can't like), ADM-009 / WEB-007 (LIKE
-- wildcards, note cap, honest cancel message, cancel reason stored).
-- Collects every failed check and raises them together. Everything rolls back.
begin;

do $$
declare
  s uuid := gen_random_uuid(); s3 uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  adm uuid := (select id from public.profiles where is_admin limit 1);
  addr jsonb := '{"recipientName":"T","line1":"1 St","city":"Lahore","country":"PK","phone":"03001234567"}';
  ip text := '10.' || (random() * 200)::int || '.' || (random() * 200)::int || '.7';
  l1 uuid; l2 uuid; o1 public.orders; o2 public.orders; c public.support_cases; r jsonb;
  failed text[] := '{}'; msg text; n int; i int;
begin
  assert adm is not null, 'needs an admin profile';
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u || '@t.test', now(), now()
  from unnest(array[s, s3, b]) u;
  insert into public.listings (seller_id, title, price, images, category, gender, condition)
  values (s, 'B8a', 1500, '{}', 'clothing', 'men', 'good') returning id into l1;
  insert into public.listings (seller_id, title, price, images, category, gender, condition)
  values (s3, 'B8b', 1500, '{}', 'clothing', 'men', 'good') returning id into l2;
  insert into public.conversations (buyer_id, seller_id, listing_id) values (b, s3, l2);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  o1 := public.process_checkout(l1, null, 'cod', addr);
  o2 := public.process_checkout(l2, null, 'cod', addr);

  -- DB-020: a pending COD order (costs nothing) doesn't make a top seller.
  if exists (select 1 from public.top_sellers_week(30) t where t.id = s3) then
    failed := array_append(failed, 'DB-020 pending COD order ranks a top seller'); end if;

  -- DB-009: the seller can't rewrite courier / tracking once in transit.
  perform set_config('request.jwt.claims', '', true);
  update public.orders set fulfillment_status = 'shifting', escrow_status = 'IN_TRANSIT' where id = o1.id;
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  begin
    perform public.advance_order_fulfillment(o1.id, 'shifting', 'EvilCourier', 'GRB-123456781234');
  exception when others then null; end;
  if (select courier_name from public.orders where id = o1.id) is not distinct from 'EvilCourier' then
    failed := array_append(failed, 'DB-009 seller rewrote the courier in transit'); end if;

  -- DB-017: at most 20 contact-match calls per 2 hours.
  msg := null;
  begin
    for i in 1..21 loop perform count(*) from public.match_contacts(array['x' || i]); end loop;
  exception when others then msg := sqlerrm; end;
  if msg is null then failed := array_append(failed, 'DB-017 21 contact-match calls accepted'); end if;

  -- DB-018: 8-character lookups are gone; the throttle ignores a spoofed
  -- leftmost x-forwarded-for and keys on the gateway's client IP.
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.headers', json_build_object('cf-connecting-ip', ip)::text, true);
  if (public.track_order(left(public.order_reference(o1.id), 8)) ->> 'found')::boolean then
    failed := array_append(failed, 'DB-018 8-character lookup still works'); end if;
  for i in 1..31 loop
    perform set_config('request.headers',
      json_build_object('x-forwarded-for', '1.1.1.' || i || ', ' || ip, 'cf-connecting-ip', ip)::text, true);
    r := public.track_order('ZZZZZZZZZZZZ');
  end loop;
  if coalesce((r ->> 'throttled')::boolean, false) is false then
    failed := array_append(failed, 'DB-018 spoofed x-forwarded-for dodged the throttle'); end if;
  perform set_config('request.headers', '', true);

  -- DB-019: dead order RPCs can't be called by users.
  if has_function_privilege('authenticated', 'public.complete_cod_order(uuid,text)', 'execute')
     or has_function_privilege('authenticated', 'public.confirm_order_received(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.mark_order_shipped(uuid,text,text)', 'execute')
     or has_function_privilege('authenticated', 'public.create_cod_order(uuid,uuid,jsonb,numeric,text,text)', 'execute') then
    failed := array_append(failed, 'DB-019 dead order RPC still executable'); end if;

  -- DB-022: trigger functions and unused anon table grants are revoked.
  if has_function_privilege('anon', 'public.guard_reserved_names()', 'execute') then
    failed := array_append(failed, 'DB-022 anon can execute a trigger function'); end if;
  if has_table_privilege('anon', 'public.shipping_addresses', 'select')
     or has_table_privilege('anon', 'public.payout_methods', 'delete')
     or has_table_privilege('anon', 'public.wardrobe_posts', 'insert') then
    failed := array_append(failed, 'DB-022 anon keeps unused table grants'); end if;

  -- DB-020: counters and report status are server-owned; duplicate reports collapse.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.wardrobe_posts (user_id, image_url, likes_count) values (b, 'x.jpg', 999999);
  if (select likes_count from public.wardrobe_posts where user_id = b) <> 0 then
    failed := array_append(failed, 'DB-020 client set wardrobe likes_count'); end if;
  insert into public.reports (reporter_id, reported_user_id, reason, status) values (b, s, 'spam', 'resolved');
  insert into public.reports (reporter_id, reported_user_id, reason, status) values (b, s, 'spam', 'resolved');
  execute 'reset role';
  if exists (select 1 from public.reports where reporter_id = b and status <> 'open') then
    failed := array_append(failed, 'DB-020 reporter chose the report status'); end if;
  if (select count(*) from public.reports where reporter_id = b) <> 1 then
    failed := array_append(failed, 'DB-020 duplicate open report stored'); end if;

  -- ADM-007: a second case adds its text to the open one; topic from the list;
  -- an admin can't send an empty message.
  c := public.create_support_case('My parcel is late again', 'zz_unknown_topic<script>');
  if c.topic is distinct from 'other' then failed := array_append(failed, 'ADM-007 free-text topic stored'); end if;
  perform public.create_support_case('Second description here', 'orders');
  if not exists (select 1 from public.messages where conversation_id = c.conversation_id
                  and sender_id = b and content = 'Second description here') then
    failed := array_append(failed, 'ADM-007 second description dropped'); end if;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  msg := null;
  begin perform public.admin_send_support_message(c.conversation_id, '   '); exception when others then msg := sqlerrm; end;
  if msg is null then failed := array_append(failed, 'ADM-007 admin sent an empty message'); end if;

  -- ADM-009: % and _ are literal in the admin user search.
  if (public.admin_users_page('%') ->> 'total')::int > 0 then
    failed := array_append(failed, 'ADM-009 "%" search matched users'); end if;

  -- ADM-009 / WEB-007: cancelling a disputed unpaid order stores the reason,
  -- caps the note and doesn't claim a refund.
  perform set_config('request.jwt.claims', '', true);
  update public.transactions set status = 'DISPUTED' where order_id = o2.id;
  update public.orders set status = 'disputed', fulfillment_status = 'disputed' where id = o2.id;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  perform public.advance_escrow_status(o2.id, 'CANCELLED', repeat('x', 100000), null, null, null, 'Item never arrived');
  if (select cancel_reason from public.orders where id = o2.id) is distinct from 'Item never arrived' then
    failed := array_append(failed, 'WEB-007 cancel reason not stored on the order'); end if;
  if (select max(char_length(notes)) from public.transaction_event_logs where order_id = o2.id) > 2000 then
    failed := array_append(failed, 'ADM-009 100k-character note stored'); end if;
  if exists (select 1 from public.messages m join public.conversations cv on cv.id = m.conversation_id
              where cv.listing_id = l2 and m.content ilike '%refunded%') then
    failed := array_append(failed, 'ADM-009 unpaid order told "refunded"'); end if;

  -- ADM-008: a blocked user can't like the blocker's listing.
  perform set_config('request.jwt.claims', '', true);
  insert into public.user_blocks (blocker_id, blocked_id) values (s, b);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  msg := null;
  begin insert into public.listing_likes (user_id, listing_id) values (b, l1); exception when others then msg := sqlerrm; end;
  execute 'reset role';
  if msg is null then failed := array_append(failed, 'ADM-008 blocked user liked the blocker''s listing'); end if;

  if cardinality(failed) > 0 then
    raise exception 'FAILED: %', array_to_string(failed, ' | ');
  end if;
end $$;

rollback;
