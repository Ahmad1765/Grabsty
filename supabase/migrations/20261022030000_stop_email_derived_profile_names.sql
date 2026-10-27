-- QA pass 2026-10-22. handle_new_user() built the public @username and the
-- displayed full_name from the email's local part, so profiles leaked users'
-- email addresses (32 of 38 display names, 10 handles at the time). New
-- profiles derive both from the OAuth name if there is one, else a neutral
-- "user" + random suffix; existing untouched auto-generated values are cleared
-- (the UI already falls back full_name -> username; routes are id-based).

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path to 'public', 'extensions', 'pg_temp' as $$
declare
  v_name text := nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name')), '');
  base_username text;
  candidate text;
  attempts int := 0;
begin
  base_username := left(lower(regexp_replace(coalesce(v_name, ''), '[^a-zA-Z0-9_]', '', 'g')), 20);
  if length(base_username) = 0 then
    base_username := 'user';
  end if;

  loop
    candidate := base_username || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
    begin
      insert into public.profiles (id, username, full_name)
      values (new.id, candidate, v_name)
      on conflict (id) do nothing;
      return new;
    exception when unique_violation then
      attempts := attempts + 1;
      if attempts >= 5 then
        insert into public.profiles (id, username, full_name)
        values (new.id, 'user_' || replace(new.id::text, '-', ''), v_name)
        on conflict (id) do nothing;
        return new;
      end if;
    end;
  end loop;
end;
$$;

-- Backfill: only values that still equal what the old trigger generated.
update public.profiles p
   set full_name = null
  from auth.users u
 where u.id = p.id
   and p.full_name = lower(regexp_replace(split_part(u.email, '@', 1), '[^a-z0-9_]', '', 'g'));

update public.profiles p
   set username = 'user' || right(p.username, 12)
  from auth.users u
 where u.id = p.id
   and p.username ~ '[0-9a-f]{12}$'
   and p.username = lower(regexp_replace(split_part(u.email, '@', 1), '[^a-z0-9_]', '', 'g')) || right(p.username, 12)
   and p.username <> 'user' || right(p.username, 12)
   and not exists (select 1 from public.profiles q where q.username = 'user' || right(p.username, 12));

-- Leftover world-readable push-token column (archived migration 20260611222823
-- dropped it, but it survived on live). Tokens live in user_devices; nothing
-- reads this one and every value is null.
alter table public.profiles drop column if exists expo_push_token;
