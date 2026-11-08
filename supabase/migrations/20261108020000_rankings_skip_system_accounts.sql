-- System accounts (…0001 Grabsty Support, …0002 Deleted user) showed up in Top
-- sellers: one search for @deleted_user put it at #1, and account deletion moves
-- orders onto …0002, so it would also climb the sales ranking. Keep them out of
-- both rankings and stop logging searches for them.

create or replace function public.log_seller_search(p_seller_id uuid)
 returns void
 language sql
 security definer
 set search_path to ''
as $function$
  insert into public.seller_search_hits (seller_id, searcher_id)
  select p_seller_id, auth.uid()
   where auth.uid() is not null
     and p_seller_id is not null
     and p_seller_id <> auth.uid()
     and p_seller_id not in ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002')
     and exists (select 1 from public.profiles where id = p_seller_id)
  on conflict do nothing;
$function$;

create or replace function public.most_searched_sellers(p_limit integer default 30, p_days integer default 7)
 returns table(id uuid, username text, full_name text, avatar_url text, searches integer, sold_week integer, sold_total integer)
 language sql
 stable security definer
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
     and p.id not in ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002')
   order by coalesce(h.searches, 0) desc, coalesce(s.sold_week, 0) desc,
            coalesce(s.sold_total, 0) desc, p.username
   limit least(greatest(coalesce(p_limit, 30), 1), 50);
$function$;

create or replace function public.top_sellers_week(p_limit integer default 12)
 returns table(id uuid, username text, full_name text, avatar_url text, sold_week integer, sold_total integer)
 language sql
 stable security definer
 set search_path to ''
as $function$
  with sales as (
    select o.seller_id,
           count(*) filter (where o.created_at > now() - interval '7 days')::int as sold_week,
           count(*)::int as sold_total
      from public.orders o
     where o.status in ('paid', 'completed')
        or (o.payment_method = 'cod' and o.status = 'pending')
     group by o.seller_id
  )
  select p.id, p.username, p.full_name, p.avatar_url, s.sold_week, s.sold_total
    from sales s
    join public.profiles p on p.id = s.seller_id
   where p.username is not null
     and p.id not in ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002')
   order by s.sold_week desc, s.sold_total desc, p.username
   limit least(greatest(coalesce(p_limit, 12), 1), 30);
$function$;

delete from public.seller_search_hits
 where seller_id in ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002');
