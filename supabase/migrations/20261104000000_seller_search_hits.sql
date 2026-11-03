-- "Most searched" sellers (Browse → Top sellers → Most searched, Admin → Analytics).
--
-- A search hit = a signed-in user opening a seller from search results.
-- One row per (seller, searcher, day), so repeat taps don't inflate the count;
-- ranking counts distinct searchers. Anonymous and self hits are ignored.
-- The table is closed (RLS on, no policies); writes go through the RPC.

create table if not exists public.seller_search_hits (
  seller_id   uuid not null references public.profiles(id) on delete cascade,
  searcher_id uuid not null references public.profiles(id) on delete cascade,
  day         date not null default (now() at time zone 'utc')::date,
  created_at  timestamptz not null default now(),
  primary key (seller_id, searcher_id, day)
);
create index if not exists seller_search_hits_day_idx on public.seller_search_hits (day);

alter table public.seller_search_hits enable row level security;
revoke all on table public.seller_search_hits from public, anon, authenticated;

create or replace function public.log_seller_search(p_seller_id uuid)
 returns void
 language sql
 volatile
 security definer
 set search_path to ''
as $function$
  insert into public.seller_search_hits (seller_id, searcher_id)
  select p_seller_id, auth.uid()
   where auth.uid() is not null
     and p_seller_id is not null
     and p_seller_id <> auth.uid()
     and exists (select 1 from public.profiles where id = p_seller_id)
  on conflict do nothing;
$function$;

-- Ranked by distinct searchers in the window, then sales (7-day, all-time), so
-- the list still has content before search data builds up.
create or replace function public.most_searched_sellers(p_limit integer default 30, p_days integer default 7)
 returns table (
   id uuid,
   username text,
   full_name text,
   avatar_url text,
   searches integer,
   sold_week integer,
   sold_total integer
 )
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  with win as (
    select least(greatest(coalesce(p_days, 7), 1), 365) as d
  ),
  hits as (
    select h.seller_id, count(distinct h.searcher_id)::int as searches
      from public.seller_search_hits h, win
     where h.day > (now() at time zone 'utc')::date - win.d
     group by h.seller_id
  ),
  sales as (
    select o.seller_id,
           count(*) filter (where o.created_at > now() - interval '7 days')::int as sold_week,
           count(*)::int as sold_total
      from public.orders o
     where o.status in ('paid', 'completed')
        or (o.payment_method = 'cod' and o.status = 'pending')
     group by o.seller_id
  ),
  ids as (
    select seller_id from hits union select seller_id from sales
  )
  select p.id, p.username, p.full_name, p.avatar_url,
         coalesce(h.searches, 0), coalesce(s.sold_week, 0), coalesce(s.sold_total, 0)
    from ids
    join public.profiles p on p.id = ids.seller_id
    left join hits h on h.seller_id = ids.seller_id
    left join sales s on s.seller_id = ids.seller_id
   where p.username is not null
   order by coalesce(h.searches, 0) desc, coalesce(s.sold_week, 0) desc,
            coalesce(s.sold_total, 0) desc, p.username
   limit least(greatest(coalesce(p_limit, 30), 1), 50);
$function$;

revoke all on function public.log_seller_search(uuid) from public, anon;
grant execute on function public.log_seller_search(uuid) to authenticated, service_role;
revoke all on function public.most_searched_sellers(integer, integer) from public;
grant execute on function public.most_searched_sellers(integer, integer) to anon, authenticated, service_role;
