-- Audit 2026-11-12, batch 7: ADM-003, ADM-005, ADM-006, DB-011, DB-013, DB-016
-- (admin and privacy hardening).

-- ADM-006: an append-only log of admin actions (who, what, on what, when).
create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  target text,
  details jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
alter table public.admin_audit_log enable row level security;
drop policy if exists "Admins read the audit log" on public.admin_audit_log;
create policy "Admins read the audit log" on public.admin_audit_log
  for select to authenticated using ((select public.is_admin()));
revoke all on public.admin_audit_log from anon, authenticated;
grant select on public.admin_audit_log to authenticated;

-- Writes a row only for an admin caller (a refused non-admin call is not an admin action).
create or replace function public.log_admin_action(p_action text, p_target text, p_details jsonb default null)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if public.is_admin() then
    insert into public.admin_audit_log (actor_id, action, target, details)
    values (auth.uid(), p_action, left(p_target, 200), p_details);
  end if;
end;
$function$;
revoke execute on function public.log_admin_action(text, text, jsonb) from public, anon, authenticated;

-- ADM-005: the reviewer's note and identity get their own columns; notes keeps
-- the seller's CNIC front photo path.
alter table public.verifications add column if not exists review_notes text;
alter table public.verifications add column if not exists reviewed_by uuid references auth.users(id) on delete set null;

create or replace function public.admin_review_kyc(p_user_id uuid, p_decision text, p_rejection_reason text default null::text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_status text;
begin
  if not public.is_admin() then
    raise exception 'Forbidden: caller is not an administrator' using errcode = '42501';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'Invalid decision: must be approved or rejected' using errcode = '22000';
  end if;

  select status into v_status from public.verifications where user_id = p_user_id;
  if not found then
    raise exception 'No verification submitted for this user' using errcode = 'P0002';
  end if;
  -- Approving needs a current submission (a rejected one needs a new upload first).
  -- Rejecting also works on an approved one, so a verification can be revoked.
  if p_decision = 'approved' and v_status <> 'submitted' then
    raise exception 'This verification was already reviewed (%). The seller has to resubmit first.', v_status
      using errcode = '22000';
  end if;

  perform set_config('app.auth_override_verification_status', 'authorized', true);
  update public.verifications
     set status = p_decision,
         review_notes = left(nullif(btrim(coalesce(p_rejection_reason, '')), ''), 1000),
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where user_id = p_user_id;
  perform set_config('app.auth_override_verification_status', 'off', true);

  perform set_config('app.auth_override_is_verified', 'authorized', true);
  update public.profiles set is_verified = (p_decision = 'approved') where id = p_user_id;
  perform set_config('app.auth_override_is_verified', 'off', true);
end;
$function$;

-- ADM-005: the reviewer fields are written by admin_review_kyc only, never by
-- the seller's own upsert of their verification.
create or replace function public.guard_verification_review_fields()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.review_notes := null;
      new.reviewed_by := null;
    else
      new.review_notes := old.review_notes;
      new.reviewed_by := old.reviewed_by;
    end if;
  end if;
  return new;
end;
$function$;
drop trigger if exists guard_verification_review_fields on public.verifications;
create trigger guard_verification_review_fields before insert or update on public.verifications
  for each row execute function public.guard_verification_review_fields();

-- ADM-005: the admin list shows only the CNIC's last 4 digits (same columns as before).
do $do$
declare
  v_def text := pg_get_functiondef('public.admin_get_verifications(text)'::regprocedure);
  v_old text := '         v.cnic_number, v.id_back_photo_path';
begin
  if position('cnic_masked' in v_def) > 0 then
    return;
  end if;
  if position(v_old in v_def) = 0 then
    raise exception 'admin_get_verifications: text to replace not found';
  end if;
  execute overlay(v_def placing
    '         case when v.cnic_number is null then null /* cnic_masked */
              else ''•••••-••••'' || substr(v.cnic_number, 10, 3) || ''-'' || right(v.cnic_number, 1) end,
         v.id_back_photo_path'
    from position(v_old in v_def) for char_length(v_old));
end
$do$;

-- ADM-003: the support reader returns support threads, or a buyer-seller chat
-- only while that pair has a disputed or reported order (and every read is logged).
do $do$
declare
  v_def text := pg_get_functiondef('public.admin_get_support_messages(uuid)'::regprocedure);
  v_at int := position('return query' in v_def);
begin
  if position('Not a support conversation' in v_def) > 0 then
    return;
  end if;
  if v_at = 0 then
    raise exception 'admin_get_support_messages: return query not found';
  end if;
  execute overlay(v_def placing
'if not exists (select 1 from public.conversations c
                  where c.id = p_conversation_id and v_bot_id in (c.buyer_id, c.seller_id))
     and not exists (
       select 1 from public.conversations c
         join public.orders o
           on o.listing_id = c.listing_id
          and ((o.buyer_id = c.buyer_id and o.seller_id = c.seller_id)
            or (o.buyer_id = c.seller_id and o.seller_id = c.buyer_id))
        where c.id = p_conversation_id
          and (o.status = ''disputed'' or o.disputed_at is not null
               or exists (select 1 from public.support_cases sc where sc.order_id = o.id))) then
    raise exception ''Not a support conversation'' using errcode = ''42501'';
  end if;

  return query'
    from v_at for char_length('return query'));
end
$do$;

-- ADM-006: every admin RPC records the call. Read-only ones become VOLATILE so
-- they can write the log row.
do $do$
declare
  v_fn record;
  v_def text;
  v_args text;
  v_at int;
begin
  for v_fn in
    select p.oid, p.proname, p.oid::regprocedure::text as sig, p.proargnames, p.pronargs
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.prokind = 'f'
       and (p.proname like 'admin\_%' or p.proname in ('set_admin_user', 'advance_escrow_status'))
  loop
    v_def := pg_get_functiondef(v_fn.oid);
    if position('log_admin_action' in v_def) > 0 then
      continue;
    end if;
    select string_agg(format('%L, %I', n, n), ', ')
      into v_args
      from unnest(v_fn.proargnames[1:v_fn.pronargs]) as n;
    v_at := position(E'\nbegin' in v_def);
    if v_at = 0 then
      raise exception '%: body start not found', v_fn.sig;
    end if;
    v_def := overlay(v_def placing
      E'\nbegin\n  perform public.log_admin_action(' || quote_literal(v_fn.proname) || ', '
        || coalesce(quote_ident(v_fn.proargnames[1]) || '::text', 'null') || ', '
        || coalesce('jsonb_build_object(' || v_args || ')', 'null') || ');'
      from v_at for char_length(E'\nbegin'));
    v_def := replace(v_def, E'\n STABLE SECURITY DEFINER', E'\n VOLATILE SECURITY DEFINER');
    execute v_def;
  end loop;
end
$do$;

-- DB-011: each side moves only its own read marker, through mark_conversation_read.
revoke update (buyer_last_read_at, seller_last_read_at) on public.conversations from authenticated;

-- DB-013: push tokens have to look like push tokens; at most 10 devices per account
-- (the oldest go). A token still moves to whoever registers it (shared phones).
do $do$
declare
  v_def text := pg_get_functiondef('public.register_device(text,text,text)'::regprocedure);
  v_old text := '  insert into public.user_devices (user_id, expo_push_token, platform, device_name)';
  v_old_end text := '        updated_at  = now();';
  v_at_end int;
begin
  if position('Not a push token' in v_def) > 0 then
    return;
  end if;
  if position(v_old in v_def) = 0 or position(v_old_end in v_def) = 0 then
    raise exception 'register_device: text to replace not found';
  end if;
  v_def := overlay(v_def placing
'  if char_length(trim(p_token)) > 200 or trim(p_token) !~ ''^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$'' then
    raise exception ''Not a push token'' using errcode = ''22023'';
  end if;
' || v_old
    from position(v_old in v_def) for char_length(v_old));
  v_at_end := position(v_old_end in v_def);
  v_def := overlay(v_def placing v_old_end || '
  delete from public.user_devices d
   where d.user_id = v_uid
     and d.id in (select d2.id from public.user_devices d2
                   where d2.user_id = v_uid
                   order by d2.updated_at desc nulls last, d2.created_at desc
                  offset 10);'
    from v_at_end for char_length(v_old_end));
  execute v_def;
end
$do$;

-- DB-016: lookalike names (Cyrillic / Greek letters, digits for letters, and
-- near-spellings like "grabsly") read as Grabsty. Each word is checked on its
-- own (punctuation inside a word dropped), so "Ahmed Grabs Yousaf" is fine.
create or replace function public.reads_as_grabsty(p_name text)
 returns boolean
 language sql
 immutable
 set search_path to ''
as $function$
  select coalesce(
    exists (
      select 1
        from regexp_split_to_table(
               translate(lower(p_name),
                 'аеорсухкмтвіјѕԁɡαεορτυνκμ4@0135$7',
                 'aeopcyxkmtbijsdgaeoptuvkmaaoiesst'),
               '\s+') as w
       where regexp_replace(w, '[^a-z]', '', 'g') ~ 'grabs[tl]?[yv]'
    ),
    false);
$function$;

-- DB-016: nobody can block Grabsty's official (admin) accounts. The support
-- bot is already covered by the user_blocks_not_support constraint.
create or replace function public.guard_block_official()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if exists (select 1 from public.profiles p where p.id = new.blocked_id and p.is_admin) then
    raise exception 'Grabsty official accounts can''t be blocked' using errcode = '22000';
  end if;
  return new;
end;
$function$;
drop trigger if exists guard_block_official on public.user_blocks;
create trigger guard_block_official before insert on public.user_blocks
  for each row execute function public.guard_block_official();
