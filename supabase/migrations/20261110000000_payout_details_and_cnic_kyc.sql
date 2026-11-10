-- Settings: payouts we can actually pay, and Certified Seller = CNIC only.
--
-- 1. payout_methods only held a label + last 4 digits, so admins had nothing
--    to send money to. Add account title, provider and the full account
--    number (IBAN / account no. for banks, 03XXXXXXXXX for wallets). Readable
--    by the owner (existing RLS) and admins (admin_get_payout_method). The
--    last 4 are derived server-side. Legacy rows stay valid; the new fields
--    are required on every save from now on.
-- 2. Certified Seller verification accepts only a Pakistani CNIC: 13-digit
--    number plus front and back photos (private verification-docs bucket).
--    Enforced by trigger for user writes; admin review is unaffected.

-- ── 1. Payout details ───────────────────────────────────────────────────────
alter table public.payout_methods
  add column if not exists account_title text,
  add column if not exists provider text,
  add column if not exists account_number text;

alter table public.payout_methods
  drop constraint if exists payout_methods_details_check;
alter table public.payout_methods
  add constraint payout_methods_details_check check (
    account_number is null
    or (kind = 'bank'   and account_number ~ '^(PK[0-9]{2}[A-Z]{4}[0-9]{16}|[0-9]{8,20})$')
    or (kind = 'wallet' and account_number ~ '^03[0-9]{9}$')
  ) not valid;

create or replace function public.set_default_payout(p_payload jsonb)
returns public.payout_methods
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_payout public.payout_methods;
  v_user_id uuid := auth.uid();
  v_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_kind text := p_payload->>'kind';
  v_title text := btrim(coalesce(p_payload->>'account_title', ''));
  v_provider text := btrim(coalesce(p_payload->>'provider', ''));
  v_number text := upper(regexp_replace(coalesce(p_payload->>'account_number', ''), '[\s-]', '', 'g'));
begin
  -- +92 300… / 92300… -> 0300… (how most people write wallet numbers)
  v_number := regexp_replace(v_number, '^\+?92(3[0-9]{9})$', '0\1');
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if v_kind is null or v_kind not in ('bank', 'wallet') then
    raise exception 'Invalid payout kind' using errcode = '22000';
  end if;
  if length(v_title) < 3 or length(v_title) > 80 then
    raise exception 'Enter the account holder name as it appears on the account' using errcode = '22000';
  end if;
  if length(v_provider) < 2 or length(v_provider) > 60 then
    raise exception 'Choose your bank or wallet' using errcode = '22000';
  end if;
  if v_kind = 'bank' and v_number !~ '^(PK[0-9]{2}[A-Z]{4}[0-9]{16}|[0-9]{8,20})$' then
    raise exception 'Enter a valid IBAN (PK + 22 characters) or account number' using errcode = '22000';
  end if;
  if v_kind = 'wallet' and v_number !~ '^03[0-9]{9}$' then
    raise exception 'Enter the wallet mobile number as 03XXXXXXXXX' using errcode = '22000';
  end if;

  update public.payout_methods
     set is_default = false
   where user_id = v_user_id and is_default = true and (v_id is null or id <> v_id);

  if v_id is not null then
    update public.payout_methods
       set kind = v_kind,
           label = v_provider,
           provider = v_provider,
           account_title = v_title,
           account_number = v_number,
           account_last4 = right(v_number, 4),
           is_default = true
     where id = v_id and user_id = v_user_id
    returning * into v_payout;
    if v_payout.id is null then
      raise exception 'Payout method not found or not owned by caller' using errcode = 'P0002';
    end if;
  else
    insert into public.payout_methods
      (user_id, kind, label, provider, account_title, account_number, account_last4, is_default)
    values
      (v_user_id, v_kind, v_provider, v_provider, v_title, v_number, right(v_number, 4), true)
    returning * into v_payout;
  end if;

  return v_payout;
end;
$function$;

-- Direct table writes would skip the RPC's validation; saves go through it.
revoke insert, update on public.payout_methods from anon, authenticated;

-- Admin: the seller's default payout method + identity, for releasing funds.
-- Phone lives in auth user metadata (Settings saves it there).
create or replace function public.admin_get_payout_method(p_user_id uuid)
returns table (
  kind text, provider text, account_title text, account_number text, account_last4 text,
  legal_name text, verification_status text, phone text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_admin() then
    raise exception 'Forbidden: caller is not an administrator' using errcode = '42501';
  end if;
  return query
  select pm.kind, coalesce(pm.provider, pm.label), pm.account_title, pm.account_number, pm.account_last4,
         v.legal_name, v.status, coalesce(u.phone, u.raw_user_meta_data->>'phone')
    from public.profiles p
    left join auth.users u on u.id = p.id
    left join lateral (
      select * from public.payout_methods m
       where m.user_id = p.id
       order by m.is_default desc, m.created_at desc
       limit 1
    ) pm on true
    left join public.verifications v on v.user_id = p.id
   where p.id = p_user_id;
end;
$function$;

revoke execute on function public.admin_get_payout_method(uuid) from public, anon;
grant execute on function public.admin_get_payout_method(uuid) to authenticated, service_role;

-- ── 2. CNIC-only Certified Seller verification ──────────────────────────────
alter table public.verifications
  add column if not exists cnic_number text,
  add column if not exists id_back_photo_path text;

create or replace function public.guard_verification_cnic()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  -- Reviewers (admin_review_kyc) and the service role change status only.
  if coalesce(auth.role(), '') = 'service_role'
     or coalesce(current_setting('app.auth_override_verification_status', true), '') = 'authorized' then
    return new;
  end if;
  new.cnic_number := regexp_replace(coalesce(new.cnic_number, ''), '[^0-9]', '', 'g');
  if new.document_kind is distinct from 'national_id' then
    raise exception 'Certified Seller verification requires a CNIC' using errcode = '22000';
  end if;
  if new.cnic_number !~ '^[0-9]{13}$' then
    raise exception 'Enter your 13-digit CNIC number' using errcode = '22000';
  end if;
  if coalesce(new.notes, '') = '' or coalesce(new.id_back_photo_path, '') = '' then
    raise exception 'Add photos of the front and back of your CNIC' using errcode = '22000';
  end if;
  if length(btrim(new.legal_name)) < 3 then
    raise exception 'Enter your full name as printed on your CNIC' using errcode = '22000';
  end if;
  new.document_number_last4 := right(new.cnic_number, 4);
  return new;
end;
$function$;

drop trigger if exists verifications_cnic_guard on public.verifications;
create trigger verifications_cnic_guard
  before insert or update on public.verifications
  for each row execute function public.guard_verification_cnic();

-- admin_get_verifications gains the CNIC number and back photo.
drop function if exists public.admin_get_verifications(text);
create function public.admin_get_verifications(p_status text default 'all')
returns table (
  user_id uuid, status text, legal_name text, document_kind text, document_number_last4 text,
  notes text, submitted_at timestamptz, reviewed_at timestamptz, username text, avatar_url text,
  cnic_number text, id_back_photo_path text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_admin() then
    raise exception 'Forbidden: caller is not an administrator' using errcode = '42501';
  end if;
  return query
  select v.user_id, v.status, v.legal_name, v.document_kind, v.document_number_last4,
         v.notes, v.submitted_at, v.reviewed_at, p.username, p.avatar_url,
         v.cnic_number, v.id_back_photo_path
    from public.verifications v
    left join public.profiles p on p.id = v.user_id
   where p_status = 'all' or v.status = p_status
   order by v.submitted_at desc;
end;
$function$;

revoke execute on function public.admin_get_verifications(text) from public, anon;
grant execute on function public.admin_get_verifications(text) to authenticated, service_role;

-- Status guard: a rejected seller may resubmit (rejected -> submitted; this
-- was impossible before, the upsert always failed), and approved details are
-- frozen so nobody keeps the badge after swapping in another CNIC.
create or replace function public.guard_verification_status()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if coalesce(auth.role(), '') = 'service_role'
     or coalesce(current_setting('app.auth_override_verification_status', true), '') = 'authorized' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status is distinct from 'submitted' then
      raise exception 'new verifications must start as submitted';
    end if;
  elsif tg_op = 'UPDATE' then
    if old.status = 'approved' then
      raise exception 'Verified details can''t be changed. Contact support to update them.';
    end if;
    if new.status is distinct from old.status
       and not (old.status = 'rejected' and new.status = 'submitted') then
      raise exception 'verification status may only be changed by reviewers';
    end if;
    new.reviewed_at := null;
  end if;
  return new;
end;
$function$;

-- One CNIC certifies one account: no two pending/approved submissions may
-- share a number (rejected ones don't count, so a typo can be corrected).
create unique index if not exists verifications_cnic_unique
  on public.verifications (cnic_number)
  where cnic_number is not null and status <> 'rejected';

create or replace function public.guard_verification_cnic_unique()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.cnic_number is not null and new.status <> 'rejected' and exists (
    select 1 from public.verifications v
     where v.cnic_number = new.cnic_number and v.user_id <> new.user_id and v.status <> 'rejected'
  ) then
    raise exception 'This CNIC is already linked to another Grabsty account. Contact support if this is you.'
      using errcode = '23505';
  end if;
  return new;
end;
$function$;

-- Named "zz_" so it runs after verifications_cnic_guard has normalised the number.
drop trigger if exists zz_verifications_cnic_unique on public.verifications;
create trigger zz_verifications_cnic_unique
  before insert or update on public.verifications
  for each row execute function public.guard_verification_cnic_unique();
