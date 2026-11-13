-- Regression check for audit batch 6: DB-005 (input limits, own-storage photos),
-- DB-007 (server-only message metadata), DB-008 (listing content, immutable
-- created_at), DB-010 (waitlist only through waitlist_join, per-visitor limit).
-- Everything rolls back; a failed expectation raises.
begin;

do $$
declare
  s uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  iss text := 'https://' || split_part(coalesce(
    (select split_part(images[1], '/', 3) from public.listings where images[1] like 'https://%/storage/v1/object/public/listing-images/%' limit 1),
    'project.supabase.co'), '/', 1) || '/auth/v1';
  img text;
  l uuid; l2 uuid; o public.orders; conv uuid; m uuid; msg text; created timestamptz; n int;
  addr jsonb := '{"line1":"1 St","city":"Lahore","phone":"03001234567"}';
begin
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u || '@t.test', now(), now()
  from unnest(array[s, b]) u;
  -- a photo this project stored
  insert into storage.objects (bucket_id, name, owner) values ('listing-images', s || '/regression.jpg', s),
                                                         ('listing-images', b || '/regression.jpg', b);
  img := 'https://' || split_part(iss, '/', 3) || '/storage/v1/object/public/listing-images/' || s || '/regression.jpg';

  -- DB-008: listing content (as the seller, directly).
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated', 'iss', iss)::text, true);
  execute 'set local role authenticated';
  msg := null;
  begin insert into public.listings (seller_id, title, price, images, category, gender, condition)
        values (s, '  ', 1500, array[img], 'clothing', 'men', 'good');
  exception when others then msg := sqlerrm; end;
  assert msg = 'Add a title', 'empty title accepted: ' || coalesce(msg, 'no error');
  msg := null;
  begin insert into public.listings (seller_id, title, price, images, category, gender, condition)
        values (s, 'T', 1500, array['https://evil.example/storage/v1/object/public/listing-images/' || s || '/regression.jpg'], 'clothing', 'men', 'good');
  exception when others then msg := sqlerrm; end;
  assert msg = 'Photos must be uploaded through Grabsty', 'foreign image accepted: ' || coalesce(msg, 'no error');
  insert into public.listings (seller_id, title, price, images, category, gender, condition)
  values (s, 'Hoodie', 1500, array[img], 'clothing', 'men', 'good') returning id, created_at into l, created;
  -- a photo in someone else's folder is not this seller's upload
  msg := null;
  begin insert into public.listings (seller_id, title, price, images, category, gender, condition)
        values (s, 'T', 1500, array[replace(img, s::text, b::text)], 'clothing', 'men', 'good');
  exception when others then msg := sqlerrm; end;
  assert msg = 'Photos must be uploaded through Grabsty', 'another user''s photo accepted: ' || coalesce(msg, 'no error');
  -- created_at / reserved_until are the server's, on insert too
  insert into public.listings (seller_id, title, price, images, category, gender, condition, created_at, reserved_until)
  values (s, 'Jacket', 1500, array[img], 'clothing', 'men', 'good', now() + interval '10 years', now() + interval '10 years')
  returning id into l2;
  assert (select created_at < now() + interval '1 day' and reserved_until is null from public.listings where id = l2),
    'created_at / reserved_until set by client on insert';
  update public.listings set created_at = now() + interval '10 years', price = 1400 where id = l2;
  assert (select created_at < now() + interval '1 day' and price = 1400 from public.listings where id = l2), 'created_at rewritten';
  execute 'reset role';

  -- DB-005: oversized input through an RPC and directly.
  insert into public.conversations (buyer_id, seller_id, listing_id) values (b, s, l) returning id into conv;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated', 'iss', iss)::text, true);
  execute 'set local role authenticated';
  msg := null;
  begin perform public.process_checkout(l, null, 'cod', addr, null, repeat('N', 100000)); exception when others then msg := sqlerrm; end;
  assert msg like 'Too long: delivery notes%', 'huge delivery notes accepted: ' || coalesce(msg, 'no error');
  msg := null;
  begin insert into public.reports (reporter_id, listing_id, reason, details) values (b, l, 'spam', repeat('D', 100000));
  exception when others then msg := sqlerrm; end;
  assert msg like 'Too long: details%', 'huge report accepted: ' || coalesce(msg, 'no error');
  o := public.process_checkout(l, null, 'cod', addr);

  -- DB-007: server-only metadata is dropped from client messages; size is capped.
  insert into public.messages (conversation_id, sender_id, content, kind, metadata)
  values (conv, b, 'hi', 'text', jsonb_build_object('order_id', o.id, 'event', 'auto_complete_reminder', 'image_url', img))
  returning id into m;
  execute 'reset role';
  assert (select metadata ? 'event' or metadata ? 'order_id' from public.messages where id = m) = false, 'server metadata kept';
  assert (select metadata->>'image_url' from public.messages where id = m) = img, 'normal metadata dropped';
  execute 'set local role authenticated';
  msg := null;
  begin insert into public.messages (conversation_id, sender_id, content, kind, metadata)
        values (conv, b, 'hi', 'text', jsonb_build_object('pad', repeat('x', 10000)));
  exception when others then msg := sqlerrm; end;
  assert msg like 'Too long: metadata%', 'huge metadata accepted: ' || coalesce(msg, 'no error');
  execute 'reset role';

  -- DB-007: the delivery reminder still goes out (21h after delivery).
  perform set_config('request.jwt.claims', '', true);
  update public.orders set fulfillment_status = 'delivered', delivered_at = now() - interval '21 hours' where id = o.id;
  perform public.auto_complete_delivered_orders();
  assert exists (select 1 from public.messages where conversation_id = conv and kind = 'system'
                  and metadata->>'event' = 'auto_complete_reminder' and metadata->>'order_id' = o.id::text),
    'reminder not sent';

  -- DB-010: no direct waitlist inserts; waitlist_join limits a visitor to 20 tries / 10 min,
  -- keyed on the last x-forwarded-for hop (a fake first hop doesn't make a new visitor).
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('request.headers', '{"x-forwarded-for": "203.0.113.77"}', true);
  execute 'set local role anon';
  msg := null;
  begin insert into public.waitlist (name, phone, role, city, interest, referral_code, referred_by)
        values ('x', '03001112223', 'buyer', 'Lahore', 'both', 'GRB-FORGE1', 'GRB-ZZZZZZ');
  exception when others then msg := sqlerrm; end;
  assert msg is not null, 'anon inserted into waitlist directly';
  for i in 1..20 loop
    perform set_config('request.headers', json_build_object('x-forwarded-for', '198.51.100.' || i || ', 203.0.113.77')::text, true);
    perform public.waitlist_join('Test ' || i, '0300' || lpad(i::text, 7, '9'), null, 'buyer', null);
  end loop;
  msg := null;
  begin perform public.waitlist_join('Test 21', '03009999921', null, 'buyer', null); exception when others then msg := sqlerrm; end;
  assert msg like 'Too many attempts%', 'visitor not throttled: ' || coalesce(msg, 'no error');
  execute 'reset role';
end $$;

rollback;
