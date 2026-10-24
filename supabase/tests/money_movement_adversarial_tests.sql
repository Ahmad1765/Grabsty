-- =============================================================================
-- Adversarial Security Tests: Money Movement, RLS Write Denial, and State Machine
-- =============================================================================
-- This test script executes realistic attack vectors against the PostgreSQL schema,
-- verifying that malicious inputs, role privilege escalations, and PostgREST write
-- attempts are strictly blocked at the database engine level.
-- =============================================================================

do $$
declare
  v_seller_id uuid := '11111111-1111-4111-8111-111111111111';
  v_buyer_id  uuid := '22222222-2222-4222-8222-222222222222';
  v_attacker_id uuid := '33333333-3333-4333-8333-333333333333';
  v_listing_id uuid := gen_random_uuid();
  v_order_id uuid := gen_random_uuid();
  v_offer_id uuid := gen_random_uuid();
  v_order public.orders;
  v_passed_count integer := 0;
begin
  raise notice '=====================================================';
  raise notice 'STARTING ADVERSARIAL MONEY MOVEMENT SECURITY AUDIT...';
  raise notice '=====================================================';

  -- Setup test fixtures: create auth.users first to satisfy profiles_id_fkey constraint
  insert into auth.users (id, aud, role, email, created_at, updated_at)
  values 
    (v_seller_id, 'authenticated', 'authenticated', 'test_seller@grabsty.internal', clock_timestamp(), clock_timestamp()),
    (v_buyer_id, 'authenticated', 'authenticated', 'test_buyer@grabsty.internal', clock_timestamp(), clock_timestamp()),
    (v_attacker_id, 'authenticated', 'authenticated', 'test_attacker@grabsty.internal', clock_timestamp(), clock_timestamp())
  on conflict (id) do nothing;

  insert into public.profiles (id, username, full_name)
  values 
    (v_seller_id, 'seller_user', 'Seller Test'),
    (v_buyer_id, 'buyer_user', 'Buyer Test'),
    (v_attacker_id, 'attacker_user', 'Attacker Test')
  on conflict (id) do update set username = excluded.username, full_name = excluded.full_name;

  insert into public.listings (id, seller_id, title, price, category, gender, condition, images, is_sold)
  values (v_listing_id, v_seller_id, 'Vintage Leather Jacket', 5000, 'clothing', 'unisex', 'good', '{}', false)
  on conflict (id) do update set price = 5000, is_sold = false;

  -- ───────────────────────────────────────────────────────────────────────────
  -- TEST 1: Direct Table Write Lock-down on public.orders
  -- Verify that PostgREST write operations are revoked.
  -- ───────────────────────────────────────────────────────────────────────────
  insert into public.orders (
    id, listing_id, buyer_id, seller_id, amount_cents, status, fulfillment_status, payment_method, stripe_session_id
  ) values (
    v_order_id, v_listing_id, v_buyer_id, v_seller_id, 500000, 'pending', 'pending', 'cod', 'test_session_' || v_order_id::text
  ) on conflict (id) do nothing;

  -- Verify direct update policy is dropped (PostgREST RLS denial)
  if exists (
    select 1 from pg_policies 
     where tablename = 'orders' 
       and policyname = 'Buyers, sellers, and admins can update orders'
  ) then
    raise exception 'SECURITY FAILURE: Permissive UPDATE policy still exists on public.orders!';
  else
    raise notice 'PASS [1/9]: Permissive UPDATE policy on public.orders is successfully revoked.';
    v_passed_count := v_passed_count + 1;
  end if;

  -- ───────────────────────────────────────────────────────────────────────────
  -- TEST 2: Seller attempts to mark order DELIVERED (premature escrow release attack)
  -- ───────────────────────────────────────────────────────────────────────────
  begin
    -- Simulate seller calling advance_order_fulfillment to mark delivered
    perform set_config('request.jwt.claim.sub', v_seller_id::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);

    perform public.advance_order_fulfillment(p_order_id => v_order_id, p_target_status => 'delivered');
    raise exception 'SECURITY FAILURE: Seller was allowed to mark order delivered!';
  exception
    when others then
      if sqlerrm like '%Only the verified buyer or admin may confirm delivery or completion%' or sqlerrm like '%Cannot mark delivered%' then
        raise notice 'PASS [2/9]: Seller is strictly blocked from advancing order to delivered.';
        v_passed_count := v_passed_count + 1;
      else
        raise exception 'Unexpected error during delivered check: %', sqlerrm;
      end if;
  end;

  -- ───────────────────────────────────────────────────────────────────────────
  -- TEST 3: Seller attempts to mark order COMPLETED (funds release attack)
  -- ───────────────────────────────────────────────────────────────────────────
  begin
    perform set_config('request.jwt.claim.sub', v_seller_id::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);

    perform public.advance_order_fulfillment(p_order_id => v_order_id, p_target_status => 'completed');
    raise exception 'SECURITY FAILURE: Seller was allowed to complete order and release funds!';
  exception
    when others then
      if sqlerrm like '%Only the verified buyer or admin may confirm delivery or completion%' or sqlerrm like '%Cannot complete order%' then
        raise notice 'PASS [3/9]: Seller is strictly blocked from completing order.';
        v_passed_count := v_passed_count + 1;
      else
        raise exception 'Unexpected error during completed check: %', sqlerrm;
      end if;
  end;

  -- ───────────────────────────────────────────────────────────────────────────
  -- TEST 4: Anonymous caller attempts to invoke checkout
  -- ───────────────────────────────────────────────────────────────────────────
  begin
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claim.role', 'anon', true);

    perform public.process_checkout(
      p_listing_id => v_listing_id,
      p_buyer_id => null,
      p_payment_method => 'cod',
      p_shipping_address => '{"line1": "123 Test"}'::jsonb
    );
    raise exception 'SECURITY FAILURE: Anonymous caller was allowed to process checkout!';
  exception
    when others then
      if sqlerrm like '%Authentication required%' then
        raise notice 'PASS [4/9]: Anonymous caller is rejected with Authentication required.';
        v_passed_count := v_passed_count + 1;
      else
        raise exception 'Unexpected error during anon checkout check: %', sqlerrm;
      end if;
  end;

  -- ───────────────────────────────────────────────────────────────────────────
  -- TEST 5: Direct Write Denial on public.offers
  -- ───────────────────────────────────────────────────────────────────────────
  if exists (
    select 1 from pg_policies 
     where tablename = 'offers' 
       and cmd in ('INSERT', 'UPDATE', 'DELETE')
  ) then
    raise exception 'SECURITY FAILURE: Direct mutation policies exist on public.offers!';
  else
    raise notice 'PASS [5/9]: Direct mutations on public.offers are fully revoked.';
    v_passed_count := v_passed_count + 1;
  end if;

  -- ───────────────────────────────────────────────────────────────────────────
  -- TEST 6: Expired Offer Acceptance Rejection
  -- ───────────────────────────────────────────────────────────────────────────
  insert into public.offers (
    id, listing_id, buyer_id, seller_id, amount, status, expires_at
  ) values (
    v_offer_id, v_listing_id, v_buyer_id, v_seller_id, 3500, 'pending', clock_timestamp() - interval '2 hours'
  ) on conflict (id) do update set expires_at = clock_timestamp() - interval '2 hours', status = 'pending';

  begin
    perform set_config('request.jwt.claim.sub', v_seller_id::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);

    perform public.accept_chat_offer(v_offer_id);
    raise exception 'SECURITY FAILURE: Expired offer was accepted!';
  exception
    when others then
      if sqlerrm like '%Offer has expired%' then
        raise notice 'PASS [6/9]: Expired offer acceptance is strictly rejected.';
        v_passed_count := v_passed_count + 1;
      else
        raise exception 'Unexpected error during expired offer check: %', sqlerrm;
      end if;
  end;

  -- ───────────────────────────────────────────────────────────────────────────
  -- TEST 7: 48-Hour Dispute Inspection Window Expiry
  -- ───────────────────────────────────────────────────────────────────────────
  update public.orders
     set fulfillment_status = 'delivered',
         delivered_at = clock_timestamp() - interval '49 hours'
   where id = v_order_id;

  begin
    perform set_config('request.jwt.claim.sub', v_buyer_id::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);

    perform public.open_order_dispute(v_order_id, 'Item damaged');
    raise exception 'SECURITY FAILURE: Dispute was opened after 48-hour inspection window elapsed!';
  exception
    when others then
      if sqlerrm like '%The 48-hour buyer inspection dispute window for this order has expired%' then
        raise notice 'PASS [7/9]: Dispute window expiration (48h) is strictly enforced server-side.';
        v_passed_count := v_passed_count + 1;
      else
        raise exception 'Unexpected error during dispute window check: %', sqlerrm;
      end if;
  end;

  -- ───────────────────────────────────────────────────────────────────────────
  -- TEST 8: Price-Tampering Detection in process_checkout
  -- ───────────────────────────────────────────────────────────────────────────
  begin
    perform set_config('request.jwt.claim.sub', v_buyer_id::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);

    -- Listing price is 5000 + 250 shipping = 5250 total. Attacker passes expected 2000.
    perform public.process_checkout(
      p_listing_id => v_listing_id,
      p_buyer_id => v_buyer_id,
      p_payment_method => 'cod',
      p_shipping_address => '{"line1": "Street 10"}'::jsonb,
      p_expected_total => 2000
    );
    raise exception 'SECURITY FAILURE: Price tamper was not caught by process_checkout!';
  exception
    when others then
      if sqlerrm like '%Price has changed%' then
        raise notice 'PASS [8/9]: Price tampering is detected and rejected by process_checkout.';
        v_passed_count := v_passed_count + 1;
      else
        raise exception 'Unexpected error during price tamper check: %', sqlerrm;
      end if;
  end;

  -- ───────────────────────────────────────────────────────────────────────────
  -- TEST 9: Managed COD Completion Protection
  -- ───────────────────────────────────────────────────────────────────────────
  update public.orders
     set payment_method = 'cod',
         shipping_method = 'managed',
         status = 'pending',
         fulfillment_status = 'shifting'
   where id = v_order_id;

  begin
    perform set_config('request.jwt.claim.sub', v_seller_id::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);

    perform public.complete_cod_order(v_order_id);
    raise exception 'SECURITY FAILURE: Seller unilaterally completed a managed courier COD order!';
  exception
    when others then
      if sqlerrm like '%Only self_ship CoD orders can be completed directly by the seller%' then
        raise notice 'PASS [9/9]: Seller is blocked from unilaterally completing managed courier COD.';
        v_passed_count := v_passed_count + 1;
      else
        raise exception 'Unexpected error during managed COD check: %', sqlerrm;
      end if;
  end;

  -- Cleanup temporary test fixtures
  delete from public.orders where id = v_order_id;
  delete from public.listings where id = v_listing_id;
  delete from public.offers where listing_id = v_listing_id;
  delete from public.profiles where id in (v_seller_id, v_buyer_id, v_attacker_id);
  delete from auth.users where id in (v_seller_id, v_buyer_id, v_attacker_id);

  raise notice '=====================================================';
  raise notice 'ADVERSARIAL SECURITY AUDIT COMPLETE: % / 9 TESTS PASSED!', v_passed_count;
  raise notice '=====================================================';
end $$;
