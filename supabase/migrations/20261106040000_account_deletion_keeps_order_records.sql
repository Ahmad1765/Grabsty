-- orders/transactions reference profiles and listings ON DELETE RESTRICT, so
-- deleting anyone who had ever had an order failed. Order records must outlive
-- the account, so finished ones move to the "Deleted user" system account and lose
-- the address. Accounts with an order still running are refused: the other party
-- is relying on it.

create or replace function public.prepare_account_deletion(p_user_id uuid) returns void
language plpgsql security definer set search_path to '' as $$
declare
  c_deleted constant uuid := '00000000-0000-0000-0000-000000000002';
begin
  if p_user_id in ('00000000-0000-0000-0000-000000000001', c_deleted) then
    raise exception 'System accounts cannot be deleted' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.orders
     where p_user_id in (buyer_id, seller_id)
       and status not in ('completed', 'canceled', 'refunded', 'failed', 'refund_due')
  ) then
    raise exception 'active_orders' using errcode = 'P0001';
  end if;

  -- Listings first, so an order's listing doesn't cascade away with the seller.
  update public.listings l
     set seller_id = c_deleted, is_sold = true
   where l.seller_id = p_user_id
     and exists (
       select 1 from public.orders o
        where o.listing_id = l.id or l.id = any (coalesce(o.bundle_item_ids, '{}'::uuid[]))
     );

  update public.orders set buyer_id = c_deleted, shipping_address = null, delivery_notes = null
   where buyer_id = p_user_id;
  update public.orders set seller_id = c_deleted where seller_id = p_user_id;
  update public.orders set cancelled_by = c_deleted where cancelled_by = p_user_id;

  update public.transactions set buyer_id = c_deleted where buyer_id = p_user_id;
  update public.transactions set seller_id = c_deleted where seller_id = p_user_id;
  update public.transactions set cancelled_by = c_deleted where cancelled_by = p_user_id;
  update public.transactions set logistics_agent_id = c_deleted where logistics_agent_id = p_user_id;
  update public.transaction_event_logs set actor_id = c_deleted where actor_id = p_user_id;
end;
$$;
revoke all on function public.prepare_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.prepare_account_deletion(uuid) to service_role;

-- Their leftover sold listings shouldn't surface in feeds under "Deleted user".
alter policy "Listings viewable unless blocked" on public.listings
  using (
    (seller_id <> '00000000-0000-0000-0000-000000000002'
      and not (seller_id = any ((select public.my_block_peers())::uuid[])))
    or exists (
      select 1 from public.orders o
       where (o.listing_id = listings.id or listings.id = any (coalesce(o.bundle_item_ids, '{}'::uuid[])))
         and ((select auth.uid()) in (o.buyer_id, o.seller_id))
    )
  );
