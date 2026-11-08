-- Function EXECUTE allowlist.
--
-- Postgres grants EXECUTE on every new function to PUBLIC, so a project built
-- from these migrations let anon call set_admin_user (make anyone admin),
-- verify_payment_webhook / confirm_order_payment_authorization (mark an order
-- paid without paying), the cron sweepers and every trigger function.
-- Cerranix had these revoked by hand, never in a migration. This makes it
-- reproducible: deny everything, then grant back exactly what the app calls.
-- Trigger functions need no grant (EXECUTE isn't checked when a trigger fires);
-- cron runs as postgres.
--
-- Adding a client-callable function later? Grant it explicitly in its migration.

do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'analytics', 'ops', 'push') and p.prokind = 'f'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- Internal helpers only ever called by other functions (owner rights).
revoke execute on function push.notify_send_push() from service_role;
revoke execute on function analytics.send_event(text, uuid, jsonb) from service_role;

-- Signed-out visitors and signed-in users.
do $$
declare
  fn text;
  f regprocedure;
begin
  foreach fn in array array[
    'public.find_seller_other_listings', 'public.find_similar_listings', 'public.get_brand_index',
    'public.get_recommendations', 'public.get_tag_index', 'public.get_tag_listings', 'public.is_admin',
    'public.match_contacts', 'public.register_my_contact_hashes',
    'public.waitlist_join', 'public.waitlist_referral_count', 'public.waitlist_status',
    -- trigger functions Cerranix also left open (harmless; kept for parity)
    'analytics.actor_role', 'analytics.capture_listing_event', 'analytics.capture_offer_event',
    'analytics.capture_order_event', 'public.guard_listing_counters', 'public.guard_listing_unsell',
    'public.set_message_reaction_conversation', 'public.set_updated_at', 'public.touch_updated_at'
  ] loop
    for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname || '.' || p.proname = fn loop
      execute format('grant execute on function %s to anon, authenticated', f);
    end loop;
  end loop;

  -- Signed-in users only. Each function checks auth.uid() / is_admin() itself.
  foreach fn in array array[
    'public.accept_chat_offer', 'public.admin_analytics', 'public.admin_get_support_conversations',
    'public.admin_get_support_messages', 'public.admin_get_users', 'public.admin_get_verifications',
    'public.admin_review_kyc', 'public.admin_send_support_message', 'public.admin_users_page',
    'public.advance_escrow_status', 'public.advance_order_fulfillment',
    'public.cancel_bundle_offers_for_sold_item', 'public.cancel_order', 'public.complete_cod_order',
    'public.confirm_order_received', 'public.counter_chat_offer', 'public.create_cod_order',
    'public.delete_chat_message', 'public.dispatch_support_bot_reply', 'public.ensure_save_lists',
    'public.get_follow_state', 'public.get_order_seller_pickup', 'public.is_allowed_web_push_endpoint',
    'public.log_listing_view', 'public.mark_conversation_read', 'public.mark_order_shipped',
    'public.offer_price_ceiling', 'public.open_order_dispute', 'public.post_dispute_support_notice',
    'public.post_order_placed_message', 'public.process_checkout', 'public.register_device',
    'public.register_web_push', 'public.saved_search_new_matches', 'public.set_default_payout',
    'public.toggle_follow', 'public.upsert_shipping_address_with_default'
  ] loop
    for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname || '.' || p.proname = fn loop
      execute format('grant execute on function %s to authenticated', f);
    end loop;
  end loop;
end $$;
