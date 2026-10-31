-- Waitlist position + referral tracking for waitlist-landing.
-- The table stays unreadable to anon; these two security-definer RPCs expose
-- only a person's own code, position and referral count.
--
-- waitlist_join: one signup per phone (last 10 digits) or email. A repeat
--   signup gets the original code back instead of a duplicate row, so the
--   same person can't farm referrals or lose their link on a new device.
--   referred_by is kept only when it is a real code (fake ?ref= never counts).
-- waitlist_status: position = people ahead of you, where more referrals rank
--   higher and ties go to whoever joined first.

create or replace function public.waitlist_join(
  p_name text, p_phone text, p_email text, p_role text, p_referred_by text
)
returns table (code text, is_new boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_digits text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
  v_email  text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_code   text;
begin
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Name is required' using errcode = '22023';
  end if;
  if length(v_digits) < 7 then
    raise exception 'Phone number is invalid' using errcode = '22023';
  end if;

  select w.referral_code into v_code
    from public.waitlist w
   where right(regexp_replace(w.phone, '\D', '', 'g'), 10) = v_digits
      or (v_email is not null and lower(w.email) = v_email)
   order by w.created_at
   limit 1;

  if v_code is not null then
    return query select v_code, false;
    return;
  end if;

  -- ponytail: random 6-char code, no retry; 32^6 ≈ 1e9 codes, add a unique index + retry past ~100k signups
  v_code := 'GRB-' || (
    select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
      from generate_series(1, 6)
  );

  insert into public.waitlist (name, phone, email, role, city, interest, referral_code, referred_by)
  values (
    trim(p_name), trim(p_phone), v_email,
    case when p_role in ('buyer', 'seller', 'both') then p_role else 'buyer' end,
    'Lahore', 'both', v_code,
    (select w.referral_code from public.waitlist w
      where w.referral_code = upper(ltrim(coalesce(p_referred_by, ''), '#')) limit 1)
  );

  return query select v_code, true;
end;
$$;

create or replace function public.waitlist_status(p_code text)
returns table (queue_position int, total int, referrals int)
language sql
stable
security definer
set search_path = ''
as $$
  with r as (
    select w.referral_code, w.created_at,
           (select count(*) from public.waitlist x
             where x.referred_by in (w.referral_code, '#' || w.referral_code))::int as refs
      from public.waitlist w
  ), me as (
    select * from r where r.referral_code = upper(ltrim(p_code, '#')) limit 1
  )
  select (select count(*) from r
           where r.refs > me.refs or (r.refs = me.refs and r.created_at < me.created_at))::int + 1,
         (select count(*) from r)::int,
         me.refs
    from me;
$$;

revoke all on function public.waitlist_join(text, text, text, text, text) from public;
revoke all on function public.waitlist_status(text) from public;
grant execute on function public.waitlist_join(text, text, text, text, text) to anon, authenticated;
grant execute on function public.waitlist_status(text) to anon, authenticated;
