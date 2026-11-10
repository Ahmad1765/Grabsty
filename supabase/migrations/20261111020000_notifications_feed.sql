-- Notifications screen: one real feed instead of "new listings from people
-- you follow" with filters that could never match anything.
--
-- get_my_notifications() assembles the caller's feed from what's already
-- recorded (no new event pipeline):
--   orders   - order placed / ready to deliver / in transit / delivered /
--              completed / cancelled, worded for the caller's side
--   offers   - new offer (seller), accepted / declined (buyer)
--   activity - new followers, likes on your listings, price drops on items
--              you liked or saved, new listings from sellers you follow
-- Last 45 days, newest first. Never includes buyer delivery details.
-- user_notification_state keeps when the caller last looked, for unread dots
-- and the bell badge.

create table if not exists public.user_notification_state (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  seen_at timestamptz not null default now()
);
alter table public.user_notification_state enable row level security;
drop policy if exists "Own notification state" on public.user_notification_state;
create policy "Own notification state" on public.user_notification_state
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.user_notification_state from anon, authenticated;
grant select on public.user_notification_state to authenticated;
grant all on public.user_notification_state to service_role;

create or replace function public.get_my_notifications(p_limit integer default 80)
returns table (
  id text,
  category text,
  kind text,
  created_at timestamptz,
  title text,
  body text,
  route text,
  actor_id uuid,
  actor_username text,
  actor_avatar_url text,
  listing_id uuid,
  listing_image text
)
language sql
stable
security definer
set search_path to ''
as $$
  with me as (select auth.uid() as uid),
  since as (select now() - interval '45 days' as t),
  my_orders as (
    select o.*, (o.seller_id = (select uid from me)) as i_sell,
           l.title as l_title, l.images[1] as l_image,
           case when o.seller_id = (select uid from me) then o.buyer_id else o.seller_id end as other_id
      from public.orders o
      left join public.listings l on l.id = o.listing_id
     where ((select uid from me) in (o.buyer_id, o.seller_id))
       and o.status <> 'awaiting_payment'
       and o.created_at > (select t from since)
  ),
  order_events as (
    select 'order-placed-' || o.id, 'orders', 'order_placed', o.created_at,
           case when o.i_sell then 'New order' else 'Order placed' end,
           case when o.i_sell then 'You sold ' || coalesce(o.l_title, 'an item') || ' · Rs ' || to_char(round(o.amount_cents / 100.0), 'FM999,999,990')
                else coalesce(o.l_title, 'Your item') || ' · waiting for the seller' end,
           '/invoice/' || o.id, o.other_id, o.listing_id, o.l_image
      from my_orders o
    union all
    select 'order-ready-' || o.id, 'orders', 'order_ready', o.packed_at,
           'Ready to deliver', 'The seller booked a courier for ' || coalesce(o.l_title, 'your item'),
           '/invoice/' || o.id, o.other_id, o.listing_id, o.l_image
      from my_orders o where o.packed_at is not null and not o.i_sell
    union all
    select 'order-transit-' || o.id, 'orders', 'order_in_transit', o.shipped_at,
           case when o.i_sell then 'Picked up' else 'On the way' end,
           case when o.i_sell then 'The courier collected ' || coalesce(o.l_title, 'your item')
                else coalesce(o.l_title, 'Your item') || ' is in transit' end,
           '/invoice/' || o.id, o.other_id, o.listing_id, o.l_image
      from my_orders o where o.shipped_at is not null
    union all
    select 'order-delivered-' || o.id, 'orders', 'order_delivered', o.delivered_at,
           'Delivered',
           case when o.i_sell then coalesce(o.l_title, 'Your item') || ' was delivered'
                else 'Check ' || coalesce(o.l_title, 'your item') || ' and confirm you received it' end,
           '/invoice/' || o.id, o.other_id, o.listing_id, o.l_image
      from my_orders o where o.delivered_at is not null
    union all
    select 'order-completed-' || o.id, 'orders', 'order_completed', o.completed_at,
           'Order completed',
           case when o.i_sell then 'Payment for ' || coalesce(o.l_title, 'your item') || ' is on its way to you'
                else 'Thanks! ' || coalesce(o.l_title, 'Your order') || ' is complete' end,
           '/invoice/' || o.id, o.other_id, o.listing_id, o.l_image
      from my_orders o where o.completed_at is not null
    union all
    select 'order-cancelled-' || o.id, 'orders', 'order_cancelled', coalesce(t.cancelled_at, o.created_at),
           'Order cancelled',
           coalesce(o.l_title, 'An order') || case when o.cancelled_by = (select uid from me) then ' · you cancelled it'
                                                   else ' was cancelled' end,
           '/invoice/' || o.id, o.other_id, o.listing_id, o.l_image
      from my_orders o
      left join public.transactions t on t.order_id = o.id
     where o.status in ('canceled', 'refunded', 'refund_due') or o.fulfillment_status = 'canceled'
  ),
  offer_events as (
    select 'offer-new-' || f.id, 'offers', 'offer_received', f.created_at,
           'New offer', 'Rs ' || to_char(round(f.amount), 'FM999,999,990') || ' for ' || coalesce(l.title, 'your item'),
           case when f.conversation_id is not null then '/conversation/' || f.conversation_id else '/product/' || f.listing_id end,
           f.buyer_id, f.listing_id, l.images[1]
      from public.offers f
      left join public.listings l on l.id = f.listing_id
     where f.seller_id = (select uid from me) and f.created_at > (select t from since)
    union all
    select 'offer-' || f.status || '-' || f.id, 'offers', 'offer_' || f.status, coalesce(f.accepted_at, f.updated_at),
           case when f.status = 'accepted' then 'Offer accepted' else 'Offer declined' end,
           case when f.status = 'accepted'
                then 'Rs ' || to_char(round(f.amount), 'FM999,999,990') || ' for ' || coalesce(l.title, 'the item') || ' · buy it now'
                else 'Your Rs ' || to_char(round(f.amount), 'FM999,999,990') || ' offer for ' || coalesce(l.title, 'the item') || ' was declined' end,
           case when f.conversation_id is not null then '/conversation/' || f.conversation_id else '/product/' || f.listing_id end,
           f.seller_id, f.listing_id, l.images[1]
      from public.offers f
      left join public.listings l on l.id = f.listing_id
     where f.buyer_id = (select uid from me)
       and f.status in ('accepted', 'declined')
       and coalesce(f.accepted_at, f.updated_at) > (select t from since)
  ),
  activity_events as (
    select 'follow-' || uf.follower_id, 'activity', 'new_follower', uf.created_at,
           'New follower', 'started following you',
           '/user/' || uf.follower_id, uf.follower_id, null::uuid, null::text
      from public.user_follows uf
     where uf.followee_id = (select uid from me) and uf.created_at > (select t from since)
    union all
    select 'like-' || ll.listing_id || '-' || ll.user_id, 'activity', 'listing_liked', ll.created_at,
           'New like', 'liked ' || coalesce(l.title, 'your listing'),
           '/product/' || l.id, ll.user_id, l.id, l.images[1]
      from public.listing_likes ll
      join public.listings l on l.id = ll.listing_id
     where l.seller_id = (select uid from me) and ll.user_id <> (select uid from me)
       and ll.created_at > (select t from since)
    union all
    select 'drop-' || ph.id, 'activity', 'price_drop', ph.changed_at,
           'Price drop', coalesce(l.title, 'An item you like') || ' is now Rs ' || to_char(round(ph.new_price), 'FM999,999,990'),
           '/product/' || l.id, l.seller_id, l.id, l.images[1]
      from public.listing_price_history ph
      join public.listings l on l.id = ph.listing_id and not coalesce(l.is_sold, false)
     where ph.new_price < ph.old_price
       and ph.changed_at > (select t from since)
       and l.seller_id <> (select uid from me)
       and (exists (select 1 from public.listing_likes x where x.listing_id = l.id and x.user_id = (select uid from me))
            or exists (select 1 from public.save_list_items si join public.save_lists sl on sl.id = si.list_id
                        where si.listing_id = l.id and sl.user_id = (select uid from me)))
    union all
    select 'listing-' || l.id, 'activity', 'listing_created', l.created_at,
           'New listing', 'listed ' || coalesce(l.title, 'something new'),
           '/product/' || l.id, l.seller_id, l.id, l.images[1]
      from public.listings l
      join public.user_follows uf on uf.followee_id = l.seller_id and uf.follower_id = (select uid from me)
     where l.created_at > now() - interval '14 days' and not coalesce(l.is_sold, false)
  ),
  allev(id, category, kind, created_at, title, body, route, actor_id, listing_id, listing_image) as (
    select * from order_events
    union all select * from offer_events
    union all select * from activity_events
  )
  select a.id, a.category, a.kind, a.created_at, a.title, a.body, a.route,
         a.actor_id, p.username, p.avatar_url, a.listing_id, a.listing_image
    from allev a
    left join public.profiles p on p.id = a.actor_id
   where (select uid from me) is not null and a.created_at is not null
   order by a.created_at desc
   limit greatest(1, least(coalesce(p_limit, 80), 200))
$$;

create or replace function public.mark_notifications_seen()
returns timestamptz
language sql
security definer
set search_path to ''
as $$
  insert into public.user_notification_state (user_id, seen_at)
  values (auth.uid(), now())
  on conflict (user_id) do update set seen_at = excluded.seen_at
  returning seen_at
$$;

create or replace function public.unread_notification_count()
returns integer
language sql
stable
security definer
set search_path to ''
as $$
  select count(*)::int
    from public.get_my_notifications(200) n
   where n.created_at > coalesce(
     (select s.seen_at from public.user_notification_state s where s.user_id = auth.uid()),
     now() - interval '7 days')
$$;

revoke execute on function public.get_my_notifications(integer) from public, anon;
revoke execute on function public.mark_notifications_seen() from public, anon;
revoke execute on function public.unread_notification_count() from public, anon;
grant execute on function public.get_my_notifications(integer) to authenticated, service_role;
grant execute on function public.mark_notifications_seen() to authenticated, service_role;
grant execute on function public.unread_notification_count() to authenticated, service_role;
