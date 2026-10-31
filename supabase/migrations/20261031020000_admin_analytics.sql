-- Admin analytics (YouTube Studio-style dashboard in /admin → Analytics).
-- One read-only, admin-gated RPC returning everything the screen needs:
-- period KPIs vs the previous period, a daily series, 48h hourly activity,
-- and top listings. "Viewers" = new (user, listing) pairs from listing_views,
-- since raw per-view rows aren't stored. An "order" is a real placed order:
-- card orders once paid, COD orders once placed (pending), never failed /
-- canceled / refund_due.

create or replace function public.admin_analytics(p_days integer default 28)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_days int := least(greatest(coalesce(p_days, 28), 1), 365);
  v_end timestamptz := date_trunc('day', now()) + interval '1 day';
  v_start timestamptz := v_end - make_interval(days => v_days);
  v_prev timestamptz := v_start - make_interval(days => v_days);
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Forbidden: caller is not an administrator' using errcode = '42501';
  end if;

  with ev as (
    select 'users' k, created_at t, 1::bigint v from profiles where created_at >= v_prev
    union all select 'listings', created_at, 1 from listings where created_at >= v_prev
    union all select 'viewers', first_viewed_at, 1 from listing_views where first_viewed_at >= v_prev
    union all select 'offers', created_at, 1 from offers where created_at >= v_prev
    union all select 'messages', created_at, 1 from messages where created_at >= v_prev
    union all select 'orders', created_at, 1 from orders o
      where created_at >= v_prev
        and (o.status in ('paid', 'completed', 'disputed')
             or (o.status = 'pending' and o.payment_method = 'cod'))
    union all select 'gmv', created_at, amount_cents from orders o
      where created_at >= v_prev
        and (o.status in ('paid', 'completed', 'disputed')
             or (o.status = 'pending' and o.payment_method = 'cod'))
  ),
  kpis as (
    select jsonb_object_agg(k, jsonb_build_object('cur', cur, 'prev', prev)) j
    from (
      select k,
             coalesce(sum(v) filter (where t >= v_start), 0) cur,
             coalesce(sum(v) filter (where t < v_start), 0) prev
      from ev group by k
    ) s
  ),
  days as (
    select generate_series(v_start, v_end - interval '1 day', interval '1 day') d
  ),
  series as (
    select jsonb_agg(row_to_json(p) order by p.d) j
    from (
      select to_char(d.d, 'YYYY-MM-DD') d,
             coalesce(sum(ev.v) filter (where ev.k = 'users'), 0) users,
             coalesce(sum(ev.v) filter (where ev.k = 'listings'), 0) listings,
             coalesce(sum(ev.v) filter (where ev.k = 'viewers'), 0) viewers,
             coalesce(sum(ev.v) filter (where ev.k = 'offers'), 0) offers,
             coalesce(sum(ev.v) filter (where ev.k = 'messages'), 0) messages,
             coalesce(sum(ev.v) filter (where ev.k = 'orders'), 0) orders,
             coalesce(sum(ev.v) filter (where ev.k = 'gmv'), 0) gmv
      from days d
      left join ev on ev.t >= d.d and ev.t < d.d + interval '1 day'
      group by d.d
    ) p
  ),
  hours as (
    select generate_series(date_trunc('hour', now()) - interval '47 hours',
                           date_trunc('hour', now()), interval '1 hour') h
  ),
  rt as (
    select jsonb_build_object(
      'hourly', (
        select jsonb_agg(c order by h) from (
          select hours.h,
                 (select count(*) from messages m
                   where m.created_at >= hours.h and m.created_at < hours.h + interval '1 hour')
               + (select count(*) from listing_views lv
                   where lv.last_viewed_at >= hours.h and lv.last_viewed_at < hours.h + interval '1 hour') c
          from hours
        ) x
      ),
      'active_users', (
        select count(distinct u) from (
          select sender_id u from messages where created_at >= now() - interval '48 hours'
          union select user_id from listing_views where last_viewed_at >= now() - interval '48 hours'
        ) a
      )
    ) j
  ),
  top as (
    select coalesce(jsonb_agg(row_to_json(t) order by t.period_viewers desc, t.views desc), '[]'::jsonb) j
    from (
      select l.id, l.title, l.price, l.is_sold, l.views, l.likes,
             coalesce(l.thumbnails[1], l.images[1]) image,
             count(lv.user_id) period_viewers
      from listings l
      join listing_views lv on lv.listing_id = l.id and lv.first_viewed_at >= v_start
      group by l.id
      order by period_viewers desc, l.views desc
      limit 10
    ) t
  )
  select jsonb_build_object(
    'days', v_days,
    'kpis', coalesce((select j from kpis), '{}'::jsonb),
    'series', coalesce((select j from series), '[]'::jsonb),
    'realtime', (select j from rt),
    'top_listings', (select j from top),
    'totals', jsonb_build_object(
      'users', (select count(*) from profiles),
      'listings', (select count(*) from listings),
      'live_listings', (select count(*) from listings where not coalesce(is_sold, false))
    )
  ) into v_result;

  return v_result;
end;
$$;

alter function public.admin_analytics(integer) owner to postgres;
revoke execute on function public.admin_analytics(integer) from public, anon;
grant execute on function public.admin_analytics(integer) to authenticated;
