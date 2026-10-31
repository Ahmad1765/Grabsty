-- Admin → Sellers & Users table: one page of users with email, join date,
-- last active, and per-user listing / purchase / sale / offer counts.
-- Server-side search, filter, sort and paging. Admin-only (is_admin()).
-- "Last active" = latest of last sign-in, message sent, listing viewed,
-- listing created. Purchases / sales use the same "real order" rule as
-- admin_analytics (paid/completed/disputed card, or placed COD).
-- ponytail: stats are computed for every matching user before paging; fine to
-- tens of thousands of users. Past that, keep a per-user stats table updated by
-- triggers and sort on it.

create or replace function public.admin_users_page(
  p_search text default null,
  p_filter text default 'all',      -- all | sellers | buyers | verified | admins
  p_sort text default 'newest',     -- newest | oldest | active | listings | sales | purchases | offers
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_q text := nullif(trim(coalesce(p_search, '')), '');
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Forbidden: caller is not an administrator' using errcode = '42501';
  end if;

  with base as (
    select p.id, p.username, p.full_name, p.avatar_url, p.created_at,
           p.is_verified, p.is_admin, u.email::text email,
           (select count(*) from listings l where l.seller_id = p.id) listings,
           (select count(*) from listings l where l.seller_id = p.id and not coalesce(l.is_sold, false)) live_listings,
           (select count(*) from orders o where o.buyer_id = p.id
              and (o.status in ('paid', 'completed', 'disputed')
                   or (o.status = 'pending' and o.payment_method = 'cod'))) purchases,
           (select count(*) from orders o where o.seller_id = p.id
              and (o.status in ('paid', 'completed', 'disputed')
                   or (o.status = 'pending' and o.payment_method = 'cod'))) sales,
           (select count(*) from offers f where f.buyer_id = p.id) offers,
           greatest(
             u.last_sign_in_at,
             (select max(m.created_at) from messages m where m.sender_id = p.id),
             (select max(lv.last_viewed_at) from listing_views lv where lv.user_id = p.id),
             (select max(l.created_at) from listings l where l.seller_id = p.id)
           ) last_active
    from profiles p
    left join auth.users u on u.id = p.id
    where (v_q is null
           or p.username ilike '%' || v_q || '%'
           or p.full_name ilike '%' || v_q || '%'
           or u.email ilike '%' || v_q || '%'
           or p.id::text = v_q)
      and (case coalesce(p_filter, 'all')
             when 'verified' then coalesce(p.is_verified, false)
             when 'admins' then coalesce(p.is_admin, false)
             else true
           end)
  ),
  filtered as (
    select * from base
    where case coalesce(p_filter, 'all')
            when 'sellers' then listings > 0
            when 'buyers' then purchases > 0
            else true
          end
  ),
  ranked as (
    select f.*, row_number() over (order by
      case when p_sort = 'oldest' then f.created_at end asc,
      case when p_sort = 'active' then f.last_active end desc nulls last,
      case when p_sort = 'listings' then f.listings end desc,
      case when p_sort = 'sales' then f.sales end desc,
      case when p_sort = 'purchases' then f.purchases end desc,
      case when p_sort = 'offers' then f.offers end desc,
      f.created_at desc, f.id) rn
    from filtered f
  ),
  page as (
    select * from ranked
    where rn > greatest(coalesce(p_offset, 0), 0)
      and rn <= greatest(coalesce(p_offset, 0), 0) + least(greatest(coalesce(p_limit, 50), 1), 200)
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'rows', coalesce((select jsonb_agg(to_jsonb(page) - 'rn' order by rn) from page), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

alter function public.admin_users_page(text, text, text, integer, integer) owner to postgres;
revoke execute on function public.admin_users_page(text, text, text, integer, integer) from public, anon;
grant execute on function public.admin_users_page(text, text, text, integer, integer) to authenticated;
