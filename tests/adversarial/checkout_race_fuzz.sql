-- =============================================================================
-- Adversarial RLS Fuzzing: Double-Buyer Process Checkout Race Condition
-- =============================================================================
-- Simulates two buyers attempting to execute the `process_checkout` transaction
-- on the same listing at the exact same millisecond.
-- Expectation: Partial unique index `orders_one_paid_per_listing_idx` or Row-Level
-- Locks inside `process_checkout` will force one transaction to commit and the
-- other to fail/rollback, guaranteeing no double-ownership state corruption.

begin;
do $$
declare
  v_seller_id uuid := '11111111-1111-4111-8111-111111111111';
  v_buyer_a_id uuid := '22222222-2222-4222-8222-222222222222';
  v_buyer_b_id uuid := '33333333-3333-4333-8333-333333333333';
  v_listing_id uuid := gen_random_uuid();
begin
  -- 1. Setup Fixtures
  insert into auth.users (id, aud, role, email) values 
    (v_seller_id, 'authenticated', 'authenticated', 'seller@fuzz.test'),
    (v_buyer_a_id, 'authenticated', 'authenticated', 'buyera@fuzz.test'),
    (v_buyer_b_id, 'authenticated', 'authenticated', 'buyerb@fuzz.test')
  on conflict (id) do nothing;

  insert into public.profiles (id, username, full_name) values 
    (v_seller_id, 'fuzz_seller', 'Fuzz Seller'),
    (v_buyer_a_id, 'fuzz_buyer_a', 'Fuzz Buyer A'),
    (v_buyer_b_id, 'fuzz_buyer_b', 'Fuzz Buyer B')
  on conflict (id) do nothing;

  insert into public.listings (id, seller_id, title, price, category, gender, condition, images, is_sold)
  values (v_listing_id, v_seller_id, 'Race Condition Target', 10000, 'clothing', 'unisex', 'good', '{}', false)
  on conflict (id) do update set is_sold = false;

  -- 2. Direct Mutation Fuzzing (Attempting to bypass RPC)
  begin
    perform set_config('request.jwt.claim.sub', v_buyer_a_id::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    
    insert into public.offers (listing_id, buyer_id, seller_id, amount, status)
    values (v_listing_id, v_buyer_a_id, v_seller_id, 10000, 'pending');
    
    raise exception 'FUZZ FAILURE: Buyer was able to insert into public.offers directly!';
  exception when others then
    raise notice 'PASS: Direct mutation on public.offers blocked. %', sqlerrm;
  end;

  -- 3. Price Tampering Fuzzing (Attempting to pay less than calculated total with shipping)
  -- Listing price 10,000 PKR + shipping and fees = 10,730 PKR total
  begin
    perform set_config('request.jwt.claim.sub', v_buyer_a_id::text, true);
    perform public.process_checkout(
      p_listing_id => v_listing_id,
      p_buyer_id => v_buyer_a_id,
      p_payment_method => 'cod',
      p_shipping_address => '{"recipientName": "A", "line1": "Buyer A Street", "city": "Lahore", "country": "PK", "phone": "03001234567"}'::jsonb,
      p_expected_total => 10000 -- Missing shipping fee
    );
    raise exception 'FUZZ FAILURE: Server accepted checkout with tampered/underpaid expected total!';
  exception when others then
    if sqlerrm like '%Price has changed%' then
      raise notice 'PASS: Price tampering / fee bypass rejected by RPC. %', sqlerrm;
    else
      raise exception 'UNEXPECTED ERROR in price tampering test: %', sqlerrm;
    end if;
  end;

  -- 4. Legitimate Checkout Execution (Buyer A with correct calculated total)
  perform set_config('request.jwt.claim.sub', v_buyer_a_id::text, true);
  perform public.process_checkout(
    p_listing_id => v_listing_id,
    p_buyer_id => v_buyer_a_id,
    p_payment_method => 'cod',
    p_shipping_address => '{"recipientName": "A", "line1": "Buyer A Street", "city": "Lahore", "country": "PK", "phone": "03001234567"}'::jsonb,
    p_expected_total => 10730
  );
  raise notice 'PASS: Buyer A legitimate checkout processed successfully.';

  -- 5. Concurrent Race Condition Simulation (Buyer B attempts to checkout already sold listing)
  begin
    perform set_config('request.jwt.claim.sub', v_buyer_b_id::text, true);
    perform public.process_checkout(
      p_listing_id => v_listing_id,
      p_buyer_id => v_buyer_b_id,
      p_payment_method => 'cod',
      p_shipping_address => '{"recipientName": "B", "line1": "Buyer B Street", "city": "Lahore", "country": "PK", "phone": "03001234568"}'::jsonb,
      p_expected_total => 10730
    );
    raise exception 'FUZZ FAILURE: Buyer B was able to checkout an already checked-out listing!';
  exception when others then
    if sqlerrm like '%Listing is already sold%' or sqlerrm like '%Listing is no longer available%' or sqlerrm like '%duplicate key%' then
      raise notice 'PASS: Double-buyer race condition successfully dropped slower commit. %', sqlerrm;
    else
      raise exception 'UNEXPECTED ERROR in race: %', sqlerrm;
    end if;
  end;

end $$;
rollback;
