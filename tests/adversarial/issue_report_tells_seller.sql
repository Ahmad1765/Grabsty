-- Regression check for audit batch 5, WEB-003: a buyer's issue report that puts
-- the payment on hold also tells the seller, in a message the seller can read
-- (checked through RLS as the seller). Rolls back.
begin;

do $$
declare
  s uuid := gen_random_uuid(); b uuid := gen_random_uuid(); l uuid; o public.orders; r jsonb;
begin
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u || '@t.test', now(), now()
  from unnest(array[s, b]) u;
  insert into public.listings (seller_id, title, price, images, category, gender, condition)
  values (s, 'R', 1500, '{}', 'clothing', 'men', 'good') returning id into l;
  insert into public.conversations (buyer_id, seller_id, listing_id) values (b, s, l);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  o := public.process_checkout(l, null, 'cod', '{"line1":"1 St","city":"Lahore","phone":"03001234567"}');
  perform set_config('request.jwt.claims', '', true); -- the team marks it delivered
  update public.orders set fulfillment_status = 'delivered', delivered_at = now() where id = o.id;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  r := public.report_order_issue(o.id, 'damaged', 'The zip is broken on arrival');
  assert (r->>'payment_on_hold')::boolean, 'payment not on hold';

  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  assert exists (select 1 from public.messages
                  where metadata->>'event' = 'issue_on_hold_notice'
                    and metadata->>'issue_order_id' = o.id::text
                    and content like '%the buyer reported a problem (Item arrived damaged)%'),
    'seller cannot see the on-hold notice';
  execute 'reset role';
end $$;

rollback;
