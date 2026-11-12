-- Follow-ups to today's order workflow / notifications / collections work.
--
-- 1. Admins can assign (or change) the rider on an order, so an order the team
--    marked picked up, or one in transit before riders existed, can be handed
--    to a rider to deliver.
-- 2. Order numbers are 12 characters (were 8): a clash is no longer realistic.
--    Old 8-character numbers and tracking IDs still resolve.
-- 3. track_order is rate limited: 30 lookups a minute per account / IP.
-- 4. Notifications: archived rows are filtered in SQL (get_my_notifications_v2)
--    so they no longer use up the feed's 200 slots.
-- 5. save_lists.is_starter marks the seeded collections, replacing the
--    name match in the app.
-- 6. Each order's issue report gets its own support case (several can be open
--    per user); a second report on the same order joins that order's case.

-- ── 1. Rider assignment ────────────────────────────────────────────────────
create or replace function public.admin_rider_assignment(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if not public.is_admin() then
    raise exception 'Forbidden: caller is not an administrator' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'rider_id', (select o.rider_id from public.orders o where o.id = p_order_id),
    'riders', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'full_name', p.full_name) order by p.username)
        from public.riders r join public.profiles p on p.id = r.user_id
    ), '[]'::jsonb)
  );
end;
$function$;

create or replace function public.admin_assign_rider(p_order_id uuid, p_rider_id uuid)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_order public.orders;
begin
  if not public.is_admin() then
    raise exception 'Forbidden: caller is not an administrator' using errcode = '42501';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if p_rider_id is not null then
    if not exists (select 1 from public.riders where user_id = p_rider_id) then
      raise exception 'That account is not a delivery rider' using errcode = '22000';
    end if;
    if p_rider_id in (v_order.buyer_id, v_order.seller_id) then
      raise exception 'A rider cannot deliver an order they bought or sold' using errcode = '22000';
    end if;
  end if;
  update public.orders set rider_id = p_rider_id where id = p_order_id;
  return p_rider_id;
end;
$function$;

-- ── 2. 12-character order numbers ──────────────────────────────────────────
drop index if exists public.orders_reference_idx;
create or replace function public.order_reference(p_id uuid)
returns text
language sql
immutable
set search_path to ''
as $$ select upper(left(replace(p_id::text, '-', ''), 12)) $$;
create index orders_reference_idx on public.orders (public.order_reference(id));

-- ── 3. Tracking lookup: rate limited, accepts old and new numbers ──────────
create table if not exists public.track_lookups (
  who text not null,
  at timestamptz not null default now()
);
create index if not exists track_lookups_who_at_idx on public.track_lookups (who, at);
create index if not exists track_lookups_at_idx on public.track_lookups (at);
alter table public.track_lookups enable row level security;
revoke all on public.track_lookups from anon, authenticated;
grant all on public.track_lookups to service_role;

create or replace function public.track_order(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path to ''
as $function$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_ref text;
  v_who text;
  v_order public.orders;
  v_title text;
  v_image text;
begin
  if char_length(v_code) < 8 or char_length(v_code) > 40 then
    return jsonb_build_object('found', false);
  end if;

  -- 30 lookups a minute per signed-in account, otherwise per client address.
  v_who := coalesce(
    auth.uid()::text,
    nullif(btrim(split_part(coalesce(nullif(current_setting('request.headers', true), '')::json->>'x-forwarded-for', ''), ',', 1)), ''),
    'unknown');
  if (select count(*) from public.track_lookups t where t.who = v_who and t.at > now() - interval '1 minute') >= 30 then
    return jsonb_build_object('found', false, 'throttled', true);
  end if;
  insert into public.track_lookups (who) values (v_who);
  if random() < 0.02 then
    delete from public.track_lookups where at < now() - interval '1 hour';
  end if;

  v_ref := regexp_replace(regexp_replace(v_code, '^(ORDER)?\s*#?\s*', ''), '^GRB-?', '');
  if v_ref ~ '^[0-9A-F]{12}$' then
    select * into v_order from public.orders o
     where public.order_reference(o.id) = v_ref and o.status <> 'awaiting_payment'
     order by o.created_at desc limit 1;
  elsif v_ref ~ '^[0-9A-F]{8}$' then
    -- Numbers issued before they were 12 characters: prefix match.
    select * into v_order from public.orders o
     where public.order_reference(o.id) >= v_ref and public.order_reference(o.id) < v_ref || 'Z'
       and left(public.order_reference(o.id), 8) = v_ref
       and o.status <> 'awaiting_payment'
     order by o.created_at desc limit 1;
  end if;
  if v_order.id is null then
    -- ponytail: unindexed scan on a courier's own number; add an index on
    -- upper(tracking_number) if orders grows large.
    select * into v_order from public.orders o
     where upper(btrim(o.tracking_number)) = v_code and o.status <> 'awaiting_payment'
     order by o.created_at desc limit 1;
  end if;
  if v_order.id is null then
    return jsonb_build_object('found', false);
  end if;
  select l.title, l.images[1] into v_title, v_image from public.listings l where l.id = v_order.listing_id;
  return jsonb_build_object(
    'found', true,
    'reference', public.order_reference(v_order.id),
    'tracking_id', 'GRB-' || public.order_reference(v_order.id),
    'courier_tracking_number', nullif(btrim(v_order.tracking_number), ''),
    'courier', v_order.courier_name,
    'state', case
      when v_order.status in ('canceled', 'refunded', 'refund_due', 'failed') or v_order.fulfillment_status = 'canceled' then 'cancelled'
      when v_order.status = 'disputed' or v_order.fulfillment_status = 'disputed' then 'under_review'
      when v_order.status = 'completed' or v_order.fulfillment_status = 'completed' then 'completed'
      when v_order.fulfillment_status = 'delivered' then 'delivered'
      when v_order.fulfillment_status = 'shifting' then 'in_transit'
      when v_order.fulfillment_status in ('packing', 'picked') then 'ready'
      else 'placed' end,
    'title', v_title,
    'image', v_image,
    'city', v_order.shipping_address->>'city',
    'placed_at', v_order.created_at,
    'ready_at', v_order.packed_at,
    'picked_up_at', coalesce(v_order.shipped_at, v_order.shifted_at),
    'delivered_at', v_order.delivered_at,
    'completed_at', v_order.completed_at
  );
end;
$function$;

-- ── 4. Notifications: archive filter in SQL ────────────────────────────────
-- Let the assembler return more than 200 so the filter below has room.
do $do$
declare
  v_def text;
begin
  select pg_get_functiondef('public.get_my_notifications(integer)'::regprocedure) into v_def;
  v_def := replace(v_def, 'least(coalesce(p_limit, 80), 200)', 'least(coalesce(p_limit, 80), 1000)');
  if position('least(coalesce(p_limit, 80), 1000)' in v_def) = 0 then
    raise exception 'get_my_notifications: limit clause not found';
  end if;
  execute v_def;
end
$do$;

create or replace function public.get_my_notifications_v2(p_limit integer default 200, p_archived boolean default false)
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
  select n.id, n.category, n.kind, n.created_at, n.title, n.body, n.route,
         n.actor_id, n.actor_username, n.actor_avatar_url, n.listing_id, n.listing_image
    from public.get_my_notifications(1000) n
   where exists (select 1 from public.notification_archives a
                  where a.user_id = auth.uid() and a.notification_id = n.id) = coalesce(p_archived, false)
   order by n.created_at desc
   limit greatest(1, least(coalesce(p_limit, 200), 200))
$$;

-- ── 5. Seeded collections are flagged ──────────────────────────────────────
alter table public.save_lists add column if not exists is_starter boolean not null default false;

-- The seeded three: the earliest list of each name per user.
update public.save_lists s
   set is_starter = true
 where not s.is_default
   and lower(s.name) in ('wishlist', 'gift ideas', 'saved for later')
   and not exists (
     select 1 from public.save_lists e
      where e.user_id = s.user_id and lower(e.name) = lower(s.name) and not e.is_default
        and (e.created_at, e.id) < (s.created_at, s.id));

do $do$
declare
  v_def text;
begin
  select pg_get_functiondef('public.ensure_save_lists(uuid)'::regprocedure) into v_def;
  v_def := regexp_replace(
    v_def,
    'insert into public\.save_lists \(user_id, name, emoji\)\s+values\s+\(p_user_id, ''Wishlist'', ''([^'']+)''\),\s+\(p_user_id, ''Gift ideas'', ''([^'']+)''\),\s+\(p_user_id, ''Saved for later'', ''([^'']+)''\);',
    'insert into public.save_lists (user_id, name, emoji, is_starter) values (p_user_id, ''Wishlist'', ''\1'', true), (p_user_id, ''Gift ideas'', ''\2'', true), (p_user_id, ''Saved for later'', ''\3'', true);');
  if position('is_starter' in v_def) = 0 then
    raise exception 'ensure_save_lists: seed insert not found';
  end if;
  execute v_def;
end
$do$;

-- ── 6. One support case per reported order ─────────────────────────────────
drop index if exists public.support_cases_one_open_per_user;
create index if not exists support_cases_open_user_idx on public.support_cases (user_id) where status = 'open';

create or replace function public.report_order_issue(
  p_order_id uuid,
  p_category text,
  p_description text,
  p_image_urls text[] default '{}'::text[]
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_bot uuid := '00000000-0000-0000-0000-000000000001';
  v_order public.orders;
  v_case public.support_cases;
  v_conv uuid;
  v_desc text := btrim(coalesce(p_description, ''));
  v_urls text[] := coalesce(p_image_urls, '{}'::text[]);
  v_label text;
  v_full text;
  v_url text;
  v_hold boolean := false;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select * into v_order from public.orders where id = p_order_id;
  if not found or v_uid not in (v_order.buyer_id, v_order.seller_id) then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  v_label := case p_category
    when 'damaged' then 'Item arrived damaged'
    when 'not_as_described' then 'Item not as described'
    when 'wrong_item' then 'Wrong item received'
    when 'missing' then 'Item or parts missing'
    when 'not_delivered' then 'Order not delivered'
    when 'pickup' then 'Problem with courier pickup'
    when 'payment' then 'Payment or payout problem'
    when 'other' then 'Something else'
  end;
  if v_label is null then
    raise exception 'Choose what went wrong' using errcode = '22000';
  end if;
  if char_length(v_desc) < 10 then
    raise exception 'Describe the issue in a few words (at least 10 characters)' using errcode = '22000';
  end if;
  if coalesce(array_length(v_urls, 1), 0) > 6 then
    raise exception 'Attach up to 6 photos' using errcode = '22000';
  end if;
  foreach v_url in array v_urls loop
    if v_url !~ '^https://[a-z0-9.-]+/storage/v1/object/public/listing-images/' or char_length(v_url) > 500 then
      raise exception 'One of the photos could not be attached. Remove it and try again.' using errcode = '22000';
    end if;
  end loop;
  v_desc := left(v_desc, 1500);
  v_full := 'Order #' || public.order_reference(p_order_id) || ' · ' || v_label
            || ' (' || case when v_uid = v_order.buyer_id then 'buyer' else 'seller' end || E')\n' || v_desc;

  -- A buyer's report while the parcel is in transit / inside the 24h check
  -- window also holds the payment. Outside it the case is still filed.
  if v_uid = v_order.buyer_id
     and v_order.fulfillment_status in ('shifting', 'delivered')
     and v_order.status not in ('completed', 'canceled', 'refunded', 'refund_due', 'failed', 'disputed') then
    begin
      perform public.open_order_dispute(p_order_id, v_label || ': ' || left(v_desc, 300), v_urls);
      v_hold := true;
    exception when others then
      v_hold := false;
    end;
  end if;

  -- One case per order: a second report on the same order joins its open case.
  select * into v_case from public.support_cases
   where user_id = v_uid and status = 'open' and order_id = p_order_id
   order by created_at desc limit 1;
  if found then
    insert into public.messages (conversation_id, sender_id, content, kind, metadata)
    values (v_case.conversation_id, v_uid, v_full, 'text',
            jsonb_build_object('support_case_id', v_case.id, 'issue_order_id', p_order_id, 'issue_category', p_category));
  else
    v_conv := public.ensure_support_conversation(v_uid);
    insert into public.support_cases (user_id, conversation_id, topic, description, order_id)
    values (v_uid, v_conv, 'order_issue', left(v_full, 2000), p_order_id)
    returning * into v_case;
    insert into public.messages (conversation_id, sender_id, content, kind, metadata)
    values (v_conv, v_bot,
            'Case ' || public.support_case_label(v_case.case_number) || ' opened for order #' || public.order_reference(p_order_id)
              || '. Our support team will reply here, usually within a day.',
            'system',
            jsonb_build_object('support_case_id', v_case.id, 'case_number', v_case.case_number, 'case_event', 'opened'));
    insert into public.messages (conversation_id, sender_id, content, kind, metadata)
    values (v_conv, v_uid, v_full, 'text',
            jsonb_build_object('support_case_id', v_case.id, 'issue_order_id', p_order_id, 'issue_category', p_category));
  end if;
  foreach v_url in array v_urls loop
    insert into public.messages (conversation_id, sender_id, content, kind, metadata)
    values (v_case.conversation_id, v_uid, v_url, 'text',
            jsonb_build_object('image_url', v_url, 'support_case_id', v_case.id, 'issue_order_id', p_order_id));
  end loop;

  return jsonb_build_object(
    'case_number', v_case.case_number,
    'case_label', public.support_case_label(v_case.case_number),
    'payment_on_hold', v_hold
  );
end;
$function$;

-- ── Grants ─────────────────────────────────────────────────────────────────
revoke execute on function public.admin_rider_assignment(uuid) from public, anon;
revoke execute on function public.admin_assign_rider(uuid, uuid) from public, anon;
revoke execute on function public.get_my_notifications_v2(integer, boolean) from public, anon;
grant execute on function public.admin_rider_assignment(uuid) to authenticated, service_role;
grant execute on function public.admin_assign_rider(uuid, uuid) to authenticated, service_role;
grant execute on function public.get_my_notifications_v2(integer, boolean) to authenticated, service_role;
revoke execute on function public.track_order(text) from public;
grant execute on function public.track_order(text) to anon, authenticated, service_role;
revoke execute on function public.report_order_issue(uuid, text, text, text[]) from public, anon;
grant execute on function public.report_order_issue(uuid, text, text, text[]) to authenticated, service_role;
