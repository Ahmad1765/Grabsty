-- Audit 2026-10-24, finding L8. Anyone can insert into the waitlist
-- (WITH CHECK (true)) and every text column was unbounded, so a script could
-- store megabyte rows or fake referral codes. Shapes match what
-- waitlist-landing/script.js sends: GRB-XXXXXX codes, ?ref= upper-cased to
-- [A-Z0-9-]{,32}, and the three interest options.

alter table public.waitlist
  add constraint waitlist_name_len     check (char_length(name)  <= 100),
  add constraint waitlist_email_len    check (char_length(email) <= 254),
  add constraint waitlist_phone_len    check (char_length(phone) <= 20),
  add constraint waitlist_city_len     check (char_length(city)  <= 80),
  add constraint waitlist_interest     check (interest is null or interest in ('clothing', 'sneakers_bags', 'both')),
  add constraint waitlist_referral_code_shape check (referral_code is null or referral_code ~ '^GRB-[A-Z0-9]{4,8}$'),
  add constraint waitlist_referred_by_shape   check (referred_by is null or referred_by ~ '^#?[A-Z0-9-]{1,32}$');

-- Flood guard: anon inserts carry no user id, so per-user limits don't apply.
-- Cap the whole table at 120 signups per 10 minutes; a real launch spike sits
-- well under that, a script hammering the endpoint does not.
create or replace function public.guard_waitlist_flood()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.waitlist where created_at > now() - interval '10 minutes') >= 120 then
    raise exception 'Too many signups right now, please try again in a few minutes' using errcode = '54000';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_waitlist_flood() from public, anon, authenticated;

drop trigger if exists waitlist_flood_guard on public.waitlist;
create trigger waitlist_flood_guard
  before insert on public.waitlist
  for each row execute function public.guard_waitlist_flood();
