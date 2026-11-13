-- Audit 2026-11-12, batch 3: ADM-004, WF-009, WF-010, WF-012 (WEB-009 is client-side).
--
-- Orders reach delivered / completed through several functions (rider, admin
-- escrow + fulfillment RPCs, the auto-complete cron). The rules below sit on
-- the orders table so every path follows them:
--   * COD cash is recorded when the order is delivered (or completed);
--   * every fulfillment / status change is written to transaction_event_logs,
--     with who did it;
--   * a completed order writes what the seller is owed to seller_payouts;
--   * a seller can't book pickup without a payout method.

-- WF-010: one payout row per completed order.
create table if not exists public.seller_payouts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete restrict,
  seller_id uuid references public.profiles(id) on delete set null,
  amount_cents integer not null check (amount_cents >= 0),
  status text not null default 'owed' check (status in ('owed', 'paid')),
  reference text check (char_length(reference) <= 200),
  paid_at timestamptz,
  paid_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists seller_payouts_seller_idx on public.seller_payouts (seller_id, status);

alter table public.seller_payouts enable row level security;
drop policy if exists "Seller payouts: own or admin" on public.seller_payouts;
create policy "Seller payouts: own or admin" on public.seller_payouts
  for select to authenticated
  using (seller_id = (select auth.uid()) or (select public.is_admin()));
revoke all on public.seller_payouts from anon, authenticated;
grant select on public.seller_payouts to authenticated;

-- Admin records that a payout was sent (bank / wallet reference required).
create or replace function public.admin_mark_payout_paid(p_order_id uuid, p_reference text)
 returns public.seller_payouts
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_row public.seller_payouts;
begin
  if not public.is_admin() then
    raise exception 'Only admins can record payouts' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reference), '') = '' or char_length(p_reference) > 200 then
    raise exception 'Enter the bank or wallet transfer reference (up to 200 characters)' using errcode = '22000';
  end if;
  update public.seller_payouts
     set status = 'paid', reference = btrim(p_reference), paid_at = now(), paid_by = auth.uid()
   where order_id = p_order_id and status = 'owed'
  returning * into v_row;
  if v_row.id is null then
    raise exception 'No unpaid payout for this order' using errcode = 'P0002';
  end if;
  return v_row;
end;
$function$;
revoke execute on function public.admin_mark_payout_paid(uuid, text) from public, anon;
grant execute on function public.admin_mark_payout_paid(uuid, text) to authenticated;

-- ADM-004 + WF-010: before an order row changes.
create or replace function public.orders_money_rules()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  -- A seller books pickup by moving the order to 'packing'.
  if new.fulfillment_status = 'packing' and old.fulfillment_status is distinct from 'packing'
     and auth.uid() = new.seller_id
     and not exists (select 1 from public.payout_methods where user_id = new.seller_id) then
    raise exception 'Add a payout method in Settings before booking pickup, so we know where to send your money'
      using errcode = '22000';
  end if;
  -- The rider collects the cash at the door.
  if new.payment_method = 'cod' and new.cod_paid_at is null
     and (new.fulfillment_status in ('delivered', 'completed') or new.status = 'completed') then
    new.payment_status := 'paid';
    new.cod_paid_at := clock_timestamp();
  end if;
  return new;
end;
$function$;
revoke execute on function public.orders_money_rules() from public, anon, authenticated;

drop trigger if exists orders_money_rules on public.orders;
create trigger orders_money_rules
  before update of fulfillment_status, status on public.orders
  for each row execute function public.orders_money_rules();

-- ADM-004 + WF-010: after an order row changed.
create or replace function public.orders_money_trail()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if new.fulfillment_status is distinct from old.fulfillment_status then
    insert into public.transaction_event_logs (
      transaction_id, order_id, from_status, to_status, actor_id, action, metadata
    )
    select t.id, new.id, old.fulfillment_status, coalesce(new.fulfillment_status, new.status), auth.uid(),
           'FULFILLMENT_CHANGE',
           jsonb_build_object(
             'status', new.status,
             'cod_collected', new.cod_paid_at is not null and old.cod_paid_at is null,
             'rider_id', new.rider_id)
      from public.transactions t
     where t.order_id = new.id
     limit 1;
  end if;
  -- Owed = the escrow ledger's seller share (falls back to the item price).
  if new.status = 'completed' and old.status is distinct from 'completed' then
    insert into public.seller_payouts (order_id, seller_id, amount_cents)
    values (new.id, new.seller_id,
            coalesce((select t.payout_amount_cents from public.transactions t where t.order_id = new.id limit 1),
                     new.amount_cents))
    on conflict (order_id) do nothing;
  end if;
  return new;
end;
$function$;
revoke execute on function public.orders_money_trail() from public, anon, authenticated;

drop trigger if exists orders_money_trail on public.orders;
create trigger orders_money_trail
  after update of fulfillment_status, status on public.orders
  for each row execute function public.orders_money_trail();

-- The ledger starts now: orders completed earlier were settled (or not) outside
-- it, and an 'owed' row for them would invite paying twice. A completed COD
-- order was paid in cash, as the auto-complete cron already records.
update public.orders
   set payment_status = 'paid', cod_paid_at = coalesce(completed_at, delivered_at, now())
 where status = 'completed' and payment_method = 'cod' and cod_paid_at is null;

-- WF-010 / WF-012: completion messages say what actually happened. Each live
-- definition is patched in place; a missing phrase aborts the migration.
do $do$
declare
  v_patch record;
  v_def text;
begin
  for v_patch in
    select * from (values
      ('public.advance_escrow_status(uuid,text,text,text,text,text,text)',
       'Escrow Released! 💰 Buyer confirmed receipt. Payout dispatched to seller.',
       'Order completed. The seller''''s payout is now due.'),
      ('public.advance_order_fulfillment(uuid,text,text,text,text,text,jsonb)',
       'Order completed. Buyer confirmed receipt and condition.',
       'Order completed.'),
      ('public.auto_complete_delivered_orders()',
       'so payment has been released to the seller.',
       'so the seller''''s payout is now due.'),
      -- WF-009: tell the rider how much cash to collect (buyer total, whole rupees).
      ('public.courier_pickup_info(uuid)',
       '''cod'', v_order.payment_method = ''cod'',',
       '''cod'', v_order.payment_method = ''cod'',
    ''collect'', case when v_order.payment_method = ''cod''
      then round((v_order.amount_cents + v_order.fee_cents + coalesce(v_order.shipping_fee_cents, 0)) / 100.0)::int end,'),
      ('public.rider_deliveries()',
       'o.shipping_address->>''city'' as city,',
       'o.shipping_address->>''city'' as city,
                 case when o.payment_method = ''cod''
                   then round((o.amount_cents + o.fee_cents + coalesce(o.shipping_fee_cents, 0)) / 100.0)::int end as collect,')
    ) as p(fn, old_text, new_text)
  loop
    v_def := pg_get_functiondef(v_patch.fn::regprocedure);
    if position(v_patch.old_text in v_def) = 0 then
      raise exception '%: text to replace not found', v_patch.fn;
    end if;
    execute replace(v_def, v_patch.old_text, v_patch.new_text);
  end loop;
end
$do$;
