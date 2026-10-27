-- Performance-only: same access rules, cheaper to evaluate. Fixes the Supabase
-- performance advisor's auth_rls_initplan, multiple_permissive_policies
-- (shipping_addresses) and unindexed_foreign_keys findings.
--
-- 1. auth.uid() / auth.jwt() wrapped in (select …) so Postgres evaluates them
--    once per query instead of once per row. Logic is unchanged.
alter policy "Buyers, sellers, and admins can view orders" on public.orders
  using (((select auth.uid()) = buyer_id) or ((select auth.uid()) = seller_id)
    or coalesce((((select auth.jwt()) -> 'app_metadata') ->> 'is_admin')::boolean, false)
    or exists (select 1 from public.profiles where profiles.id = (select auth.uid()) and profiles.is_admin = true));

alter policy "Buyers, sellers, and logistics admins can view transactions" on public.transactions
  using (((select auth.uid()) = buyer_id) or ((select auth.uid()) = seller_id)
    or coalesce((((select auth.jwt()) -> 'app_metadata') ->> 'is_admin')::boolean, false)
    or exists (select 1 from public.profiles where profiles.id = (select auth.uid()) and profiles.is_admin = true));

alter policy "Offer participants and admins can view offers" on public.offers
  using (((select auth.uid()) = buyer_id) or ((select auth.uid()) = seller_id)
    or coalesce((((select auth.jwt()) -> 'app_metadata') ->> 'is_admin')::boolean, false)
    or exists (select 1 from public.profiles where profiles.id = (select auth.uid()) and profiles.is_admin = true));

alter policy "Participants and admins can view seller pickups" on public.order_seller_pickups
  using (((select auth.uid()) = seller_id)
    or exists (select 1 from public.orders o where o.id = order_seller_pickups.order_id and o.buyer_id = (select auth.uid()))
    or coalesce((((select auth.jwt()) -> 'app_metadata') ->> 'is_admin')::boolean, false)
    or exists (select 1 from public.profiles where profiles.id = (select auth.uid()) and profiles.is_admin = true));

alter policy "order_seller_pickups_party_access" on public.order_seller_pickups
  using (((select auth.uid()) = seller_id)
    or exists (select 1 from public.orders o where o.id = order_seller_pickups.order_id
               and (o.buyer_id = (select auth.uid()) or o.seller_id = (select auth.uid())))
    or exists (select 1 from public.profiles where profiles.id = (select auth.uid()) and profiles.is_admin = true));

-- 2. shipping_addresses: this catch-all policy repeats exactly what
--    addresses_select/insert/update/delete_own already allow, so every query
--    evaluated the same check twice.
drop policy if exists "Users can manage own shipping addresses" on public.shipping_addresses;

-- 3. Foreign keys without a covering index (joins + cascades scan otherwise).
create index if not exists offers_buyer_id_idx on public.offers (buyer_id);
create index if not exists offers_conversation_id_idx on public.offers (conversation_id);
create index if not exists order_seller_pickups_seller_id_idx on public.order_seller_pickups (seller_id);
create index if not exists orders_cancelled_by_idx on public.orders (cancelled_by);
create index if not exists transaction_event_logs_actor_id_idx on public.transaction_event_logs (actor_id);
create index if not exists transactions_cancelled_by_idx on public.transactions (cancelled_by);
create index if not exists transactions_listing_id_idx on public.transactions (listing_id);
create index if not exists transactions_logistics_agent_id_idx on public.transactions (logistics_agent_id);
