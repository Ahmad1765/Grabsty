-- =============================================================================
-- Regression: order / escrow / chat authorization holes found in QA 2026-10-22
-- =============================================================================
-- Runs against existing rows inside one transaction and ROLLS BACK. Each
-- attack must print BLOCKED; each legit path must print ALLOWED. A missing
-- fixture row prints nothing for that line. Actors are non-admins: admins
-- legitimately override all of these.
--   1. stranger marks a failed card payment "escrow secured"   (20261022070000)
--   2. COD buyer forces 'completed' without seller cash confirm (20261022060000)
--   3. seller "ships" a cancelled order                          (20261022060000)
--   4. sender deletes a server-written system notice             (20261022050000)
--   5. message over 4000 characters                              (20261022080000)

create or replace function pg_temp.try(sql text, uid uuid) returns text language plpgsql as $$
declare n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute sql;
    get diagnostics n = row_count;
    execute 'reset role';
    return case when sql ilike 'delete%' and n = 0 then 'BLOCKED: 0 rows' else 'ALLOWED' end;
  exception when others then
    execute 'reset role';
    return 'BLOCKED: ' || sqlerrm;
  end;
end $$;

begin;
select 'expect BLOCKED  escrow by stranger' t,
       pg_temp.try(format('select public.advance_escrow_status(%L, %L)', o.id, 'PAYMENT_SECURED_ESCROW'),
                   (select id from public.profiles p where p.id not in (o.buyer_id, o.seller_id) and not coalesce(p.is_admin, false) limit 1))
  from public.orders o join public.transactions t on t.order_id = o.id
 where t.status = 'PENDING_PAYMENT' and o.status = 'failed' limit 1;
select 'expect BLOCKED  buyer completes COD' t,
       pg_temp.try(format('select public.advance_order_fulfillment(%L, %L)', id, 'completed'), buyer_id)
  from public.orders where payment_method = 'cod' and status = 'pending' and fulfillment_status in ('shifting', 'delivered') and not exists (select 1 from public.profiles a where a.id = buyer_id and a.is_admin) limit 1;
select 'expect BLOCKED  ship cancelled order' t,
       pg_temp.try(format('select public.advance_order_fulfillment(%L, %L)', id, 'shifting'), seller_id)
  from public.orders where status = 'canceled' and not exists (select 1 from public.profiles a where a.id = seller_id and a.is_admin) limit 1;
select 'expect ALLOWED  seller marks ready for pickup' t,
       pg_temp.try(format('select public.advance_order_fulfillment(%L, %L)', id, 'packing'), seller_id)
  from public.orders where status = 'pending' and fulfillment_status = 'pending' and not exists (select 1 from public.profiles a where a.id = seller_id and a.is_admin) limit 1;
select 'expect BLOCKED  delete system notice' t,
       pg_temp.try(format('delete from public.messages where id = %L', id), sender_id)
  from public.messages where kind = 'system' and sender_id is not null limit 1;
select 'expect ALLOWED  delete own text' t,
       pg_temp.try(format('delete from public.messages where id = %L', id), sender_id)
  from public.messages where kind = 'text' limit 1;
select 'expect BLOCKED  4001-char message' t,
       pg_temp.try(format('insert into public.messages (conversation_id, sender_id, content, kind) values (%L, %L, repeat(%L, 4001), %L)',
                          c.id, c.buyer_id, 'x', 'text'), c.buyer_id)
  from public.conversations c limit 1;
rollback;
