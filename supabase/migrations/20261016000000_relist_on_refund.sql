-- Put an item back on sale whenever its order is refunded or cancelled.
--
-- cancel_order() already relists, but the other ways an order ends did not:
-- an admin refunding a dispute (advance_escrow_status -> CANCELLED) and the
-- Stripe webhook marking an order 'refunded' left the listing stuck as sold.
-- One trigger on orders covers every path, current and future.
--
-- Guard: never relist an item that another live order still holds (e.g. it was
-- relisted earlier and bought again by someone else).

create or replace function public.relist_on_order_end()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.status in ('refunded', 'canceled', 'refund_due', 'failed')
        and old.status is distinct from new.status)
     or (new.escrow_status = 'CANCELLED'
        and old.escrow_status is distinct from 'CANCELLED') then
    update public.listings l
       set is_sold = false,
           reserved_until = null
     where (l.id = new.listing_id
            or l.id = any(coalesce(new.bundle_item_ids, '{}'::uuid[])))
       and l.is_sold
       and not exists (
         select 1
           from public.orders o
          where o.id <> new.id
            and (o.listing_id = l.id
                 or l.id = any(coalesce(o.bundle_item_ids, '{}'::uuid[])))
            and o.status not in ('refunded', 'canceled', 'refund_due', 'failed')
            and coalesce(o.escrow_status, '') <> 'CANCELLED'
       );
  end if;
  return new;
end;
$$;

revoke all on function public.relist_on_order_end() from public, anon, authenticated;

drop trigger if exists orders_relist_on_end on public.orders;
create trigger orders_relist_on_end
  after update of status, escrow_status on public.orders
  for each row
  execute function public.relist_on_order_end();
