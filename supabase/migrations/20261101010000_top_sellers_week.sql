-- Browse "Top sellers this week": public, read-only ranking of sellers by
-- items sold. Exposes only public profile fields plus counts.
-- A sale = paid/completed order, or a placed COD order still in progress
-- (card checkouts left 'pending' are abandoned and don't count).
-- Ranked by sales in the last 7 days, then all-time, so the section still has
-- content in a quiet week.

create or replace function public.top_sellers_week(p_limit integer default 12)
 returns table (
   id uuid,
   username text,
   full_name text,
   avatar_url text,
   sold_week integer,
   sold_total integer
 )
 language sql
 stable
 security definer
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
   order by s.sold_week desc, s.sold_total desc, p.username
   limit least(greatest(coalesce(p_limit, 12), 1), 30);
$function$;

revoke all on function public.top_sellers_week(integer) from public;
grant execute on function public.top_sellers_week(integer) to anon, authenticated, service_role;
