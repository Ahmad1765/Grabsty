-- Customer support: cases instead of the automated bot.
--
-- * A user starts a support chat by describing the issue. That creates a case
--   with an automatic number (GS-1001, GS-1002, ...) inside their support
--   thread (one support conversation per user, already enforced by
--   direct_conversations_participants_idx).
-- * One open case at a time. While it's open the user and the support team
--   chat in the thread; the team works it from the admin support dashboard.
-- * The team closes the case: a "case closed" notice is posted and the user
--   can't write in the thread again until they create a new case.
-- * Disputes open a case automatically.
-- * The keyword bot is gone: dispatch_support_bot_reply can no longer be
--   called by the app.

create table if not exists public.support_cases (
  id uuid primary key default gen_random_uuid(),
  case_number bigint generated always as identity (start with 1001) unique,
  user_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  topic text,
  description text not null check (char_length(description) between 10 and 2000),
  order_id uuid references public.orders(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid
);
create unique index if not exists support_cases_one_open_per_user
  on public.support_cases (user_id) where status = 'open';
create index if not exists support_cases_conversation_idx on public.support_cases (conversation_id, created_at desc);

alter table public.support_cases enable row level security;
drop policy if exists "Own or admin support cases" on public.support_cases;
create policy "Own or admin support cases" on public.support_cases
  for select to authenticated using ((select auth.uid()) = user_id or public.is_admin());
revoke all on public.support_cases from anon, authenticated;
grant select on public.support_cases to authenticated;
grant all on public.support_cases to service_role;

create or replace function public.support_case_label(p_number bigint)
returns text language sql immutable set search_path to '' as $$ select 'GS-' || p_number::text $$;

-- The caller's support thread, created on first use.
create or replace function public.ensure_support_conversation(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_bot uuid := '00000000-0000-0000-0000-000000000001';
  v_conv uuid;
begin
  select id into v_conv from public.conversations
   where listing_id is null
     and ((buyer_id = p_user_id and seller_id = v_bot) or (buyer_id = v_bot and seller_id = p_user_id))
   limit 1;
  if v_conv is null then
    insert into public.conversations (listing_id, buyer_id, seller_id)
    values (null, p_user_id, v_bot)
    returning id into v_conv;
  end if;
  return v_conv;
end;
$function$;
revoke execute on function public.ensure_support_conversation(uuid) from public, anon, authenticated;

-- Internal: open a case + post the user's description and the case notice.
create or replace function public.open_support_case(p_user_id uuid, p_description text, p_topic text, p_order_id uuid)
returns public.support_cases
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_bot uuid := '00000000-0000-0000-0000-000000000001';
  v_case public.support_cases;
  v_conv uuid;
  v_desc text := btrim(coalesce(p_description, ''));
begin
  select * into v_case from public.support_cases where user_id = p_user_id and status = 'open';
  if found then
    return v_case;
  end if;
  if char_length(v_desc) < 10 then
    raise exception 'Describe the issue in a few words (at least 10 characters)' using errcode = '22000';
  end if;
  v_conv := public.ensure_support_conversation(p_user_id);
  insert into public.support_cases (user_id, conversation_id, topic, description, order_id)
  values (p_user_id, v_conv, nullif(btrim(coalesce(p_topic, '')), ''), left(v_desc, 2000), p_order_id)
  returning * into v_case;

  insert into public.messages (conversation_id, sender_id, content, kind, metadata)
  values (v_conv, v_bot,
          'Case ' || public.support_case_label(v_case.case_number) || ' opened. Our support team will reply here, usually within a day.',
          'system',
          jsonb_build_object('support_case_id', v_case.id, 'case_number', v_case.case_number, 'case_event', 'opened'));
  insert into public.messages (conversation_id, sender_id, content, kind, metadata)
  values (v_conv, p_user_id, left(v_desc, 2000), 'text',
          jsonb_build_object('support_case_id', v_case.id));
  return v_case;
end;
$function$;
revoke execute on function public.open_support_case(uuid, text, text, uuid) from public, anon, authenticated;

create or replace function public.create_support_case(p_description text, p_topic text default null)
returns public.support_cases
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  return public.open_support_case(v_uid, p_description, p_topic, null);
end;
$function$;

-- Latest case for the caller (open one first).
create or replace function public.get_my_support_case()
returns public.support_cases
language sql
stable
security definer
set search_path to ''
as $$
  select * from public.support_cases
   where user_id = auth.uid()
   order by (status = 'open') desc, created_at desc
   limit 1
$$;

create or replace function public.admin_close_support_case(p_case_id uuid)
returns public.support_cases
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_bot uuid := '00000000-0000-0000-0000-000000000001';
  v_case public.support_cases;
begin
  if not public.is_admin() then
    raise exception 'Forbidden: caller is not an administrator' using errcode = '42501';
  end if;
  update public.support_cases
     set status = 'closed', closed_at = now(), closed_by = auth.uid()
   where id = p_case_id and status = 'open'
  returning * into v_case;
  if v_case.id is null then
    select * into v_case from public.support_cases where id = p_case_id;
    if v_case.id is null then
      raise exception 'Case not found' using errcode = 'P0002';
    end if;
    return v_case;
  end if;
  insert into public.messages (conversation_id, sender_id, content, kind, metadata)
  values (v_case.conversation_id, v_bot,
          'Case ' || public.support_case_label(v_case.case_number) || ' is resolved and closed. If you need anything else, create a new support chat.',
          'system',
          jsonb_build_object('support_case_id', v_case.id, 'case_number', v_case.case_number, 'case_event', 'closed'));
  return v_case;
end;
$function$;

create or replace function public.admin_get_support_cases(p_status text default 'open')
returns table (
  case_id uuid, case_number bigint, status text, topic text, description text, order_id uuid,
  created_at timestamptz, closed_at timestamptz, conversation_id uuid, user_id uuid,
  username text, full_name text, avatar_url text, last_message text, updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if not public.is_admin() then
    raise exception 'Forbidden: caller is not an administrator' using errcode = '42501';
  end if;
  return query
  select sc.id, sc.case_number, sc.status, sc.topic, sc.description, sc.order_id,
         sc.created_at, sc.closed_at, sc.conversation_id, sc.user_id,
         p.username, p.full_name, p.avatar_url, c.last_message, c.updated_at
    from public.support_cases sc
    join public.conversations c on c.id = sc.conversation_id
    left join public.profiles p on p.id = sc.user_id
   where p_status = 'all' or sc.status = p_status
   order by (sc.status = 'open') desc, c.updated_at desc;
end;
$function$;

-- The user can only write in their support thread while a case is open.
create or replace function public.guard_support_thread_message()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_bot uuid := '00000000-0000-0000-0000-000000000001';
  v_user uuid;
begin
  if new.sender_id = v_bot then
    return new;
  end if;
  select case when c.buyer_id = v_bot then c.seller_id when c.seller_id = v_bot then c.buyer_id end
    into v_user
    from public.conversations c
   where c.id = new.conversation_id and c.listing_id is null;
  if v_user is null or new.sender_id <> v_user then
    return new;
  end if;
  if not exists (select 1 from public.support_cases where user_id = v_user and status = 'open') then
    raise exception 'This support case is closed. Create a new support chat to contact us.' using errcode = '22000';
  end if;
  return new;
end;
$function$;
drop trigger if exists guard_support_thread_message on public.messages;
create trigger guard_support_thread_message
  before insert on public.messages
  for each row execute function public.guard_support_thread_message();

-- Disputes open (or reuse) a case automatically.
create or replace function public.post_dispute_support_notice(p_order_id uuid)
returns public.messages
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_caller_id uuid := auth.uid();
  v_order public.orders;
  v_case public.support_cases;
  v_msg public.messages;
  v_bot uuid := '00000000-0000-0000-0000-000000000001';
  v_ref text;
  v_reason text;
begin
  if v_caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select * into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if v_order.buyer_id <> v_caller_id then
    raise exception 'Only the buyer can open a support ticket for this order' using errcode = '42501';
  end if;
  if v_order.status <> 'disputed' and v_order.fulfillment_status <> 'disputed' then
    raise exception 'This order is not under dispute' using errcode = '22000';
  end if;
  v_ref := upper(left(replace(p_order_id::text, '-', ''), 8));
  v_reason := left(coalesce(nullif(btrim(v_order.dispute_reason), ''), 'Not specified'), 500);
  v_case := public.open_support_case(v_caller_id, 'Dispute on order #' || v_ref || ': ' || v_reason, 'dispute', p_order_id);

  select * into v_msg from public.messages
   where conversation_id = v_case.conversation_id and sender_id = v_bot
     and metadata->>'dispute_order_id' = p_order_id::text
   limit 1;
  if found then
    return v_msg;
  end if;
  insert into public.messages (conversation_id, sender_id, content, kind, metadata)
  values (v_case.conversation_id, v_bot,
          'Order #' || v_ref || ' is under dispute (case ' || public.support_case_label(v_case.case_number) || E'). Payment is on hold.\nReply here with photos, courier receipts or anything else that helps; our team will review it.',
          'system',
          jsonb_build_object('dispute_order_id', p_order_id, 'support_case_id', v_case.id))
  returning * into v_msg;
  return v_msg;
end;
$function$;

-- The keyword bot is retired.
revoke execute on function public.dispatch_support_bot_reply(uuid, text) from public, anon, authenticated;

revoke execute on function public.create_support_case(text, text) from public, anon;
revoke execute on function public.get_my_support_case() from public, anon;
revoke execute on function public.admin_close_support_case(uuid) from public, anon;
revoke execute on function public.admin_get_support_cases(text) from public, anon;
grant execute on function public.create_support_case(text, text) to authenticated, service_role;
grant execute on function public.get_my_support_case() to authenticated, service_role;
grant execute on function public.admin_close_support_case(uuid) to authenticated, service_role;
grant execute on function public.admin_get_support_cases(text) to authenticated, service_role;
grant execute on function public.post_dispute_support_notice(uuid) to authenticated, service_role;
revoke execute on function public.support_case_label(bigint) from public, anon;
grant execute on function public.support_case_label(bigint) to authenticated, service_role;
