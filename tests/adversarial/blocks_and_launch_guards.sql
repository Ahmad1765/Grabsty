-- Regression check for blocks, COD auto-cancel, reserved names, welcome-email
-- queueing and account deletion. Run on a project with the migrations applied.
-- Everything rolls back; any failed expectation raises and aborts.
begin;

do $$
declare
  a uuid := gen_random_uuid(); -- blocker / seller
  b uuid := gen_random_uuid(); -- blocked / buyer
  c uuid := gen_random_uuid(); -- bystander
  l1 uuid; l2 uuid; l3 uuid;
  conv uuid; offer_msg uuid;
  o public.orders;
  addr jsonb := '{"recipientName":"T","line1":"1 St","city":"Lahore","country":"PK","phone":"03001234567"}';
  n int;
  failed boolean;
begin
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', a || '@t.test', now(), now()),
         (b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', b || '@t.test', now(), now()),
         (c, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', c || '@t.test', now(), now());

  -- Welcome email: unconfirmed queues nothing; confirming queues exactly once.
  assert not exists (select 1 from public.welcome_emails where user_id = a), 'queued before confirm';
  update auth.users set email_confirmed_at = now() where id = a;
  assert (select count(*) from public.welcome_emails where user_id = a) = 1, 'not queued on confirm';
  update auth.users set email_confirmed_at = null where id = a;
  update auth.users set email_confirmed_at = now() where id = a;
  assert (select count(*) from public.welcome_emails where user_id = a) = 1, 'queued twice';

  insert into public.listings (seller_id, title, price, images, category, gender, condition) values (a, 'T1', 1000, '{}', 'clothing', 'men', 'good') returning id into l1;
  insert into public.listings (seller_id, title, price, images, category, gender, condition) values (a, 'T2', 1000, '{}', 'clothing', 'men', 'good') returning id into l2;
  insert into public.listings (seller_id, title, price, images, category, gender, condition) values (a, 'T3', 1000, '{}', 'clothing', 'men', 'good') returning id into l3;
  insert into public.conversations (buyer_id, seller_id, listing_id) values (b, a, l1) returning id into conv;
  insert into public.messages (conversation_id, sender_id, content, kind, metadata, offer_status)
  values (conv, b, 'Offer', 'offer', '{"amount": 800}', 'pending') returning id into offer_msg;
  insert into public.user_follows (follower_id, followee_id) values (b, a);

  -- b buys l2 while nothing is blocked: this order must survive the block.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  o := public.process_checkout(l2, b, 'cod', addr, null, null, 'managed', null, null);

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.user_blocks (blocker_id, blocked_id) values (a, b);

  -- RLS: can't forge a block for someone else; can't block support or yourself.
  failed := false;
  begin insert into public.user_blocks (blocker_id, blocked_id) values (c, a); exception when others then failed := true; end;
  assert failed, 'forged block allowed';
  failed := false;
  begin insert into public.user_blocks (blocker_id, blocked_id) values (a, '00000000-0000-0000-0000-000000000001'); exception when others then failed := true; end;
  assert failed, 'blocked support';
  failed := false;
  begin insert into public.user_blocks (blocker_id, blocked_id) values (a, a); exception when others then failed := true; end;
  assert failed, 'blocked self';

  -- Block side effects.
  execute 'reset role';
  assert (select offer_status from public.messages where id = offer_msg) = 'declined', 'pending offer not declined';
  assert not exists (select 1 from public.user_follows where follower_id = b and followee_id = a), 'follow not removed';

  -- The blocked user (b) is stopped, in every direction.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  failed := false;
  begin insert into public.messages (conversation_id, sender_id, content, kind) values (conv, b, 'hi', 'text'); exception when others then failed := true; end;
  assert failed, 'blocked user could message';
  failed := false;
  begin insert into public.messages (conversation_id, sender_id, content, kind, metadata, offer_status)
        values (conv, b, 'x', 'offer', '{"amount": 500}', 'pending'); exception when others then failed := true; end;
  assert failed, 'blocked user could offer';
  failed := false;
  begin insert into public.conversations (buyer_id, seller_id, listing_id) values (b, a, l3); exception when others then failed := true; end;
  assert failed, 'blocked user could open chat';
  failed := false;
  begin insert into public.user_follows (follower_id, followee_id) values (b, a); exception when others then failed := true; end;
  assert failed, 'blocked user could follow';
  failed := false;
  begin perform public.process_checkout(l3, b, 'cod', addr, null, null, 'managed', null, null); exception when others then failed := true; end;
  assert failed, 'blocked user could buy';

  -- Listings: hidden from the blocked user, except those on their own order.
  assert not exists (select 1 from public.listings where id = l3), 'blocked user sees listing';
  assert exists (select 1 from public.listings where id = l2), 'order listing hidden from buyer';
  execute 'reset role';

  -- ...and the blocker sees the same separation; a bystander is unaffected.
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  assert exists (select 1 from public.listings where id = l3), 'bystander lost listing';
  execute 'reset role';

  -- System messages (order updates) still flow on a blocked pair.
  insert into public.messages (conversation_id, sender_id, content, kind) values (conv, a, 'Order update', 'system');

  -- Unblock restores buying.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  delete from public.user_blocks where blocker_id = a and blocked_id = b;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  o := public.process_checkout(l3, b, 'cod', addr, null, null, 'managed', null, null);
  assert o.status = 'pending', 'unblocked buy failed';

  -- Vacation: a direct link can't buy from an away seller.
  update public.profiles set vacation_mode = true where id = c;
  insert into public.listings (seller_id, title, price, images, category, gender, condition) values (c, 'T4', 1000, '{}', 'clothing', 'men', 'good') returning id into l1;
  failed := false;
  begin perform public.process_checkout(l1, b, 'cod', addr, null, null, 'managed', null, null); exception when others then failed := true; end;
  assert failed, 'bought from seller on vacation';

  -- Auto-cancel: a 6-day-old unshipped COD order cancels and relists; shipped doesn't.
  update public.orders set created_at = now() - interval '6 days' where id = o.id;
  perform set_config('request.jwt.claims', '', true);
  perform public.auto_cancel_unshipped_orders();
  assert (select status from public.orders where id = o.id) = 'canceled', 'not auto-cancelled';
  assert (select is_sold from public.listings where id = l3) = false, 'not relisted';

  -- Reserved names: an ordinary user can't take one, either spelling.
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  failed := false;
  begin update public.profiles set username = 'gr4bsty_official' where id = c; exception when others then failed := true; end;
  assert failed, 'took reserved username';
  failed := false;
  begin update public.profiles set full_name = 'GRAB STY' where id = c; exception when others then failed := true; end;
  assert failed, 'took reserved full name';
  update public.profiles set full_name = 'Normal Name' where id = c;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  -- Deletion: refused while an order runs...
  failed := false;
  begin perform public.prepare_account_deletion(b); exception when others then failed := sqlerrm = 'active_orders'; end;
  assert failed, 'deleted with a running order';

  -- ...allowed once finished, keeping the order under "Deleted user".
  update public.orders set status = 'canceled', fulfillment_status = 'canceled', escrow_status = 'CANCELLED' where id <> o.id and b in (buyer_id, seller_id);
  perform public.prepare_account_deletion(b);
  delete from auth.users where id = b;
  assert exists (select 1 from public.orders where id = o.id and buyer_id = '00000000-0000-0000-0000-000000000002' and shipping_address is null), 'order not kept';
  perform public.prepare_account_deletion(a);
  delete from auth.users where id = a;
  assert exists (select 1 from public.orders where id = o.id and seller_id = '00000000-0000-0000-0000-000000000002'), 'seller order not kept';
end $$;

rollback;
