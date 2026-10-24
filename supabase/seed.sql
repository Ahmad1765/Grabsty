-- =============================================================================
-- Grabsty Local Seed Data: Test Actors, Listings & Orders
-- =============================================================================
-- This seed file provisions canonical test actors, listings, and order fixtures
-- required by:
-- 1. Adversarial SQL Fuzzing (tests/adversarial/checkout_race_fuzz.sql)
-- 2. Webhook Chaos Suite (tests/adversarial/webhook_chaos.ts)
-- 3. Playwright E2E Stealth Kinetics (tests/e2e/stealth_checkout.spec.ts)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $$
DECLARE
  v_seller_id uuid := '11111111-1111-4111-8111-111111111111';
  v_buyer_id uuid := '22222222-2222-4222-8222-222222222222';
  v_attacker_id uuid := '33333333-3333-4333-8333-333333333333';
  v_support_id uuid := '00000000-0000-0000-0000-000000000001';
  v_listing_id uuid := '11111111-1111-4111-8111-111111111111';
  v_order_id uuid := '12345678-1234-1234-1234-123456789012';
  v_password_hash text;
BEGIN
  -- Generate bcrypt hash for 'password123'
  v_password_hash := extensions.crypt('password123', extensions.gen_salt('bf', 10));

  -- 1. Insert Test Users into auth.users
  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change_token_current,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  ) VALUES 
    (
      v_seller_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'test_seller@grabsty.internal',
      v_password_hash,
      now(),
      '',
      '',
      '',
      '',
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      '{"full_name": "Test Seller"}'::jsonb,
      now(),
      now()
    ),
    (
      v_buyer_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'test_buyer@grabsty.internal',
      v_password_hash,
      now(),
      '',
      '',
      '',
      '',
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      '{"full_name": "Test Buyer"}'::jsonb,
      now(),
      now()
    ),
    (
      v_attacker_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'test_attacker@grabsty.internal',
      v_password_hash,
      now(),
      '',
      '',
      '',
      '',
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      '{"full_name": "Test Attacker"}'::jsonb,
      now(),
      now()
    ),
    (
      v_support_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'support@grabsty.internal',
      v_password_hash,
      now(),
      '',
      '',
      '',
      '',
      '{"provider": "system", "providers": ["system"]}'::jsonb,
      '{"full_name": "Grabsty Support"}'::jsonb,
      now(),
      now()
    )
  ON CONFLICT (id) DO UPDATE SET
    encrypted_password = excluded.encrypted_password,
    email_confirmed_at = coalesce(auth.users.email_confirmed_at, now()),
    confirmation_token = '',
    recovery_token = '',
    email_change_token_new = '',
    email_change_token_current = '',
    updated_at = now();

  -- 2. Insert into auth.identities if the table exists (required by Supabase GoTrue email auth)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'identities') THEN
    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES
      (
        v_seller_id,
        v_seller_id,
        jsonb_build_object('sub', v_seller_id::text, 'email', 'test_seller@grabsty.internal'),
        'email',
        v_seller_id::text,
        now(),
        now(),
        now()
      ),
      (
        v_buyer_id,
        v_buyer_id,
        jsonb_build_object('sub', v_buyer_id::text, 'email', 'test_buyer@grabsty.internal'),
        'email',
        v_buyer_id::text,
        now(),
        now(),
        now()
      ),
      (
        v_attacker_id,
        v_attacker_id,
        jsonb_build_object('sub', v_attacker_id::text, 'email', 'test_attacker@grabsty.internal'),
        'email',
        v_attacker_id::text,
        now(),
        now(),
        now()
      )
    ON CONFLICT (provider, provider_id) DO NOTHING;
  END IF;

  -- 3. Insert Profiles in public.profiles
  INSERT INTO public.profiles (id, username, full_name, avatar_url, bio, rating, total_sales)
  VALUES 
    (v_seller_id, 'test_seller', 'Test Seller', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb', 'Verified Power Seller', 5.0, 42),
    (v_buyer_id, 'test_buyer', 'Test Buyer', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d', 'Collector & Buyer', 5.0, 0),
    (v_attacker_id, 'test_attacker', 'Test Attacker', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e', 'Security Researcher', 4.8, 5),
    (v_support_id, 'grabsty_support', 'Grabsty Support', 'https://images.unsplash.com/photo-1544005313-94ddf0286df2', 'Official Automated Concierge', 5.0, 0)
  ON CONFLICT (id) DO UPDATE SET
    username = excluded.username,
    full_name = excluded.full_name;

  -- 4. Target E2E Listing (http://localhost:8081/product/11111111-1111-4111-8111-111111111111)
  INSERT INTO public.listings (
    id,
    seller_id,
    title,
    description,
    price,
    category,
    gender,
    condition,
    images,
    is_sold,
    views,
    likes
  ) VALUES (
    v_listing_id,
    v_seller_id,
    'Vintage Leather Jacket',
    'Pristine 1990s distressed lambskin bomber jacket. Zero flaws, original hardware.',
    10000,
    'clothing',
    'unisex',
    'good',
    ARRAY['https://images.unsplash.com/photo-1551028719-00167b16eac5?w=1200&q=80'],
    false,
    128,
    34
  ) ON CONFLICT (id) DO UPDATE SET
    price = 10000,
    is_sold = false;

  -- 5. Separate Order Listing Fixture for Delivery Tracking E2E
  INSERT INTO public.listings (
    id,
    seller_id,
    title,
    description,
    price,
    category,
    gender,
    condition,
    images,
    is_sold
  ) VALUES (
    '99999999-9999-4999-8999-999999999999',
    v_seller_id,
    'Purchased Vintage Denim',
    'Order delivery test item',
    10000,
    'clothing',
    'unisex',
    'good',
    ARRAY['https://images.unsplash.com/photo-1551028719-00167b16eac5?w=1200&q=80'],
    true
  ) ON CONFLICT (id) DO NOTHING;

  -- 6. Target E2E Order (http://localhost:8081/activity/orders/12345678-1234-1234-1234-123456789012)
  INSERT INTO public.orders (
    id,
    listing_id,
    buyer_id,
    seller_id,
    amount_cents,
    fee_cents,
    status,
    fulfillment_status,
    payment_method,
    shipping_method,
    shipping_fee_cents,
    shipping_address,
    delivery_notes,
    stripe_session_id
  ) VALUES (
    v_order_id,
    '99999999-9999-4999-8999-999999999999',
    v_buyer_id,
    v_seller_id,
    1000000,
    0,
    'pending',
    'shifting',
    'cod',
    'managed',
    25000,
    '{"line1": "42 Orchard Road", "city": "Lahore", "recipientName": "Test Buyer", "phone": "+923001234567"}'::jsonb,
    'Leave with concierge if unavailable',
    'seed_order_12345678'
  ) ON CONFLICT (id) DO UPDATE SET
    listing_id = '99999999-9999-4999-8999-999999999999',
    status = 'pending',
    fulfillment_status = 'shifting';

  RAISE NOTICE 'SUCCESS: Seed data injected for actors, listing, and order fixtures.';
END $$;
