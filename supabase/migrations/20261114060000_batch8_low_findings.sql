-- Audit 2026-11-12 batch 8, database lows: DB-009, DB-017, DB-018, DB-019,
-- DB-020, DB-022, ADM-007, ADM-008, ADM-009, WEB-007 (cancel reason).
-- Long functions are edited in place: each swap fails loudly if its anchor
-- text isn't found, so a drifted function rolls the whole migration back.

create function pg_temp.swap(p_def text, p_old text, p_new text, p_count int default 1)
returns text language plpgsql as $$
declare
  n int := (char_length(p_def) - char_length(replace(p_def, p_old, ''))) / char_length(p_old);
begin
  if n <> p_count then
    raise exception 'swap: expected % of [%], found %', p_count, left(p_old, 80), n;
  end if;
  return replace(p_def, p_old, p_new);
end $$;

-- DB-009: only admins set courier / tracking; the platform holds the parcel.
do $do$
declare d text := pg_get_functiondef('public.advance_order_fulfillment(uuid,text,text,text,text,text,jsonb)'::regprocedure);
begin
  d := pg_temp.swap(d, 'coalesce(p_courier, courier_name)',
    'case when v_is_admin then left(coalesce(p_courier, courier_name), 100) else courier_name end', 2);
  d := pg_temp.swap(d, 'coalesce(p_tracking_number, tracking_number)',
    'case when v_is_admin then left(coalesce(p_tracking_number, tracking_number), 100) else tracking_number end', 2);
  execute d;
end $do$;

-- DB-017: a contact-match budget per 2 hours (rate_limit_events keeps 2 hours),
-- on top of the per-minute limit. 20 x 500 hashes covers any real phone book.
do $do$
declare d text := pg_get_functiondef('public.match_contacts(text[])'::regprocedure);
begin
  d := pg_temp.swap(d, $s$perform public.enforce_rate_limit('match_contacts', 30, interval '1 minute');$s$,
    $s$perform public.enforce_rate_limit('match_contacts', 30, interval '1 minute');
  perform public.enforce_rate_limit('match_contacts_2h', 20, interval '2 hours');$s$);
  execute d;
end $do$;

-- DB-018: 12-character references only (every reference has been 12 since
-- 2026-11-12); throttle on the gateway's client IP, as waitlist_join does —
-- the leftmost x-forwarded-for value is whatever the client sent.
do $do$
declare d text := pg_get_functiondef('public.track_order(text)'::regprocedure);
begin
  d := pg_temp.swap(d,
    $s$nullif(btrim(split_part(coalesce(nullif(current_setting('request.headers', true), '')::json->>'x-forwarded-for', ''), ',', 1)), ''),$s$,
    $s$nullif(btrim(coalesce(nullif(current_setting('request.headers', true), '')::json->>'cf-connecting-ip', '')), ''),
    nullif(btrim(regexp_replace(coalesce(nullif(current_setting('request.headers', true), '')::json->>'x-forwarded-for', ''), '^.*,', '')), ''),$s$);
  d := pg_temp.swap(d, $s$  elsif v_ref ~ '^[0-9A-F]{8}$' then
    -- Numbers issued before they were 12 characters: prefix match.
    select * into v_order from public.orders o
     where public.order_reference(o.id) >= v_ref and public.order_reference(o.id) < v_ref || 'Z'
       and left(public.order_reference(o.id), 8) = v_ref
       and o.status <> 'awaiting_payment'
     order by o.created_at desc limit 1;
$s$, '');
  execute d;
end $do$;

-- DB-019: the buyer/seller completion and shipping RPCs can never succeed
-- (platform ships and completes orders); nothing in the app calls them.
revoke execute on function public.complete_cod_order(uuid, text) from public, anon, authenticated;
revoke execute on function public.confirm_order_received(uuid) from public, anon, authenticated;
revoke execute on function public.mark_order_shipped(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.create_cod_order(uuid, uuid, jsonb, numeric, text, text) from public, anon, authenticated;

-- DB-020: rankings count orders a courier actually picked up, not free
-- pending COD orders.
do $do$
declare f text; d text;
begin
  foreach f in array array['public.top_sellers_week(integer)', 'public.most_searched_sellers(integer,integer)'] loop
    d := pg_get_functiondef(f::regprocedure);
    d := pg_temp.swap(d, $s$     where o.status in ('paid', 'completed')
        or (o.payment_method = 'cod' and o.status = 'pending')$s$,
      $s$     where o.status = 'completed'
        or o.fulfillment_status in ('shifting', 'delivered')$s$);
    execute d;
  end loop;
end $do$;

-- DB-020: wardrobe like counts are server-owned, like listing counters.
create or replace function public.guard_wardrobe_counters()
 returns trigger language plpgsql set search_path to ''
as $function$
begin
  if current_user in ('anon', 'authenticated') then
    new.likes_count := case when tg_op = 'INSERT' then 0 else old.likes_count end;
  end if;
  return new;
end;
$function$;
drop trigger if exists guard_wardrobe_counters on public.wardrobe_posts;
create trigger guard_wardrobe_counters before insert or update on public.wardrobe_posts
  for each row execute function public.guard_wardrobe_counters();

-- DB-020 / ADM-008: a report starts open; a repeat of an open report from the
-- same person about the same target is dropped silently (the app still says
-- "reported"). Reports stay allowed between blocked users: the block check is
-- two-way and would also stop a victim reporting the person they blocked.
-- Runs as the caller (no security definer) so the role check sees them; the
-- duplicate lookup only needs the reporter's own rows, which RLS allows.
create or replace function public.guard_report_insert()
 returns trigger language plpgsql set search_path to ''
as $function$
begin
  if current_user in ('anon', 'authenticated') then
    new.status := 'open';
  end if;
  if exists (select 1 from public.reports r
              where r.reporter_id = new.reporter_id and r.status = 'open'
                and r.listing_id is not distinct from new.listing_id
                and r.reported_user_id is not distinct from new.reported_user_id) then
    return null;
  end if;
  return new;
end;
$function$;
drop trigger if exists guard_report_insert on public.reports;
create trigger guard_report_insert before insert on public.reports
  for each row execute function public.guard_report_insert();

-- ADM-008: a blocked user can't like the blocker's listings (either way).
create or replace function public.guard_blocked_like()
 returns trigger language plpgsql security definer set search_path to ''
as $function$
begin
  if public.users_blocked(new.user_id, (select l.seller_id from public.listings l where l.id = new.listing_id)) then
    raise exception 'You can''t like this item' using errcode = '42501';
  end if;
  return new;
end;
$function$;
drop trigger if exists guard_blocked_like on public.listing_likes;
create trigger guard_blocked_like before insert on public.listing_likes
  for each row execute function public.guard_blocked_like();

-- ADM-007: a second case while one is open adds its text to that case's chat
-- instead of dropping it; topic comes from the app's list.
create or replace function public.create_support_case(p_description text, p_topic text default null::text)
 returns support_cases
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_case public.support_cases;
  v_desc text := left(btrim(coalesce(p_description, '')), 2000);
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select * into v_case from public.support_cases
   where user_id = v_uid and status = 'open' order by created_at desc limit 1;
  if found then
    if char_length(v_desc) >= 10 then
      insert into public.messages (conversation_id, sender_id, content, kind, metadata)
      values (v_case.conversation_id, v_uid, v_desc, 'text', jsonb_build_object('support_case_id', v_case.id));
    end if;
    return v_case;
  end if;
  return public.open_support_case(v_uid, p_description,
    case when p_topic in ('orders', 'payments', 'selling', 'account', 'report', 'other') then p_topic else 'other' end,
    null);
end;
$function$;

-- ADM-007: no empty admin support messages.
do $do$
declare d text := pg_get_functiondef('public.admin_send_support_message(uuid,text)'::regprocedure);
begin
  d := pg_temp.swap(d, '  if v_conv.buyer_id <> v_bot_id and v_conv.seller_id <> v_bot_id then',
    $s$  if btrim(coalesce(p_content, '')) = '' then
    raise exception 'Write a message first' using errcode = '22000';
  end if;
  if v_conv.buyer_id <> v_bot_id and v_conv.seller_id <> v_bot_id then$s$);
  execute d;
end $do$;

-- ADM-009: % and _ in an admin search are literal characters.
do $do$
declare d text := pg_get_functiondef('public.admin_users_page(text,text,text,integer,integer)'::regprocedure);
begin
  d := pg_temp.swap(d, $s$'%' || v_q || '%'$s$,
    $s$'%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%'$s$, 3);
  execute d;
end $do$;

-- ADM-009 / WEB-007: cap admin notes and reasons, store the cancel reason on
-- the order, and only say "refunded" when the buyer had paid.
do $do$
declare d text := pg_get_functiondef('public.advance_escrow_status(uuid,text,text,text,text,text,text)'::regprocedure);
begin
  d := pg_temp.swap(d, $s$begin
  perform public.log_admin_action('advance_escrow_status'$s$, $s$begin
  p_notes := left(p_notes, 2000);
  p_dispute_reason := left(p_dispute_reason, 500);
  p_cancel_reason := left(p_cancel_reason, 500);
  perform public.log_admin_action('advance_escrow_status'$s$);
  d := pg_temp.swap(d, $s$         tracking_number = coalesce(p_tracking_number, tracking_number)
   where id = p_order_id;$s$, $s$         tracking_number = coalesce(p_tracking_number, tracking_number),
         cancel_reason = case when p_target_status = 'CANCELLED' then coalesce(p_cancel_reason, cancel_reason) else cancel_reason end
   where id = p_order_id;$s$);
  d := pg_temp.swap(d, $s$'Order Cancelled 🚫 Escrow payment refunded.'$s$,
    $s$case when v_order.payment_status = 'paid' then 'Order cancelled. The buyer''s payment will be refunded.' else 'Order cancelled. No payment was taken.' end$s$);
  execute d;
end $do$;

-- DB-022: trigger functions need no EXECUTE grant; anon never uses these
-- table grants (RLS needs a signed-in owner).
do $do$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p
            where p.pronamespace = 'public'::regnamespace and p.prorettype = 'trigger'::regtype loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $do$;
revoke all on public.payout_methods, public.shipping_addresses, public.user_contact_hashes from anon;
revoke insert, update, delete on public.wardrobe_posts, public.wardrobe_swipes from anon;
