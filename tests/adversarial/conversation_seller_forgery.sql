-- =============================================================================
-- Regression: forged conversation seller -> Rs 1 checkout (audit 2026-10-24, C1)
-- =============================================================================
-- Runs inside one transaction and ROLLS BACK. Attacks must print BLOCKED, the
-- legit paths ALLOWED. Actors: A = a non-admin who doesn't own listing L,
-- B = a second non-admin who isn't L's seller (A's "accomplice").

create or replace function pg_temp.try(sql text, uid uuid) returns text language plpgsql as $$
declare n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute sql;
    get diagnostics n = row_count;
    execute 'reset role';
    return case when sql ilike 'update%' and n = 0 then 'BLOCKED: 0 rows' else 'ALLOWED' end;
  exception when others then
    execute 'reset role';
    return 'BLOCKED: ' || sqlerrm;
  end;
end $$;

begin;
create temp table results (t text, r text) on commit drop;
create temp table actors on commit drop as
select l.id as listing_id, l.seller_id as real_seller, a.id as a, b.id as b
  from public.listings l
  cross join lateral (select id from public.profiles where id <> l.seller_id and not coalesce(is_admin, false) order by id limit 1) a
  cross join lateral (select id from public.profiles where id not in (l.seller_id, a.id) and not coalesce(is_admin, false) order by id limit 1) b
 where not l.is_sold
   and not exists (select 1 from public.conversations c where c.listing_id = l.id and c.buyer_id = a.id)
 limit 1;

insert into results select 'expect BLOCKED  thread naming accomplice as seller' t,
       pg_temp.try(format('insert into public.conversations(buyer_id, seller_id, listing_id) values (%L, %L, %L)', a, b, listing_id), a)
  from actors;
insert into results select 'expect ALLOWED  thread with the real seller' t,
       pg_temp.try(format('insert into public.conversations(buyer_id, seller_id, listing_id) values (%L, %L, %L)', a, real_seller, listing_id), a)
  from actors;
insert into results select 'expect ALLOWED  direct thread, no listing' t,
       pg_temp.try(format('insert into public.conversations(buyer_id, seller_id, listing_id) values (%L, %L, null)', a, b), a)
  from actors;
insert into results select 'expect BLOCKED  repoint thread seller to accomplice' t,
       pg_temp.try(format('update public.conversations set seller_id = %L where buyer_id = %L and listing_id = %L', b, a, listing_id), a)
  from actors;
insert into results select 'expect ALLOWED  mark thread read' t,
       pg_temp.try(format('update public.conversations set buyer_last_read_at = now() where buyer_id = %L and listing_id = %L', a, listing_id), a)
  from actors;

-- Plant a forged pending offer as if a pre-fix thread existed, then walk the chain.
insert into public.offers (listing_id, buyer_id, seller_id, amount, status, expires_at, created_at, updated_at)
select listing_id, a, b, 1, 'pending', now() + interval '1 day', now(), now() from actors;
insert into results select 'expect BLOCKED  accomplice accepts Rs 1 offer' t,
       pg_temp.try(format('select public.accept_chat_offer(%L)', o.id), b)
  from actors, public.offers o where o.listing_id = actors.listing_id and o.buyer_id = a and o.seller_id = b;
update public.offers set status = 'accepted', accepted_at = now()
 where (listing_id, buyer_id, seller_id) in (select listing_id, a, b from actors);
insert into results select 'expect ALLOWED  checkout charges listing price' t,
       pg_temp.try(format($q$do $x$ declare o public.orders; begin
         o := public.process_checkout(%L, null, 'cod', '{"line1":"x"}'::jsonb);
         if o.amount_cents <> (select round(price * 100) from public.listings where id = o.listing_id) then
           raise exception 'priced at forged offer: %%', o.amount_cents;
         end if;
       end $x$$q$, listing_id), a)
  from actors;
select * from results;
rollback;
