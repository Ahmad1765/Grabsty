-- Official accounts carry the verified mark, and nobody else can take a name that
-- reads as Grabsty. Without this, anyone could rename to "grabsty_official".

-- System accounts. Fresh projects (the grabsty prod project) never ran seed.sql,
-- so support had no account there and every support chat would fail its foreign
-- key. They have no password and cannot sign in.
-- ...0002 owns the records of deleted users (see 20261106040000).
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'support@grabsty.internal', null, now(), '', '', '', '',
   '{"provider": "system", "providers": ["system"]}'::jsonb, '{"full_name": "Grabsty Support"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'deleted@grabsty.internal', null, now(), '', '', '', '',
   '{"provider": "system", "providers": ["system"]}'::jsonb, '{"full_name": "Deleted user"}'::jsonb, now(), now())
on conflict (id) do nothing;

update public.profiles set username = 'grabsty_support', full_name = 'Grabsty Support'
 where id = '00000000-0000-0000-0000-000000000001';
update public.profiles set username = 'deleted_user', full_name = 'Deleted user'
 where id = '00000000-0000-0000-0000-000000000002';

update public.profiles set is_verified = true
 where username in ('grabsty', 'grabsty_support') and is_verified is distinct from true;

create function public.reads_as_grabsty(p_name text) returns boolean
language sql immutable set search_path to '' as $$
  -- Normalised so "Gr4bsty", "grab.sty" and "GRAB STY" don't slip through.
  select coalesce(regexp_replace(translate(lower(p_name), '4@0', 'aao'), '[^a-z0-9]', '', 'g') ~ 'grabst[yv]', false);
$$;
revoke all on function public.reads_as_grabsty(text) from public;

create function public.guard_reserved_names() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if coalesce(auth.role(), '') in ('service_role', 'supabase_admin')
     or new.is_admin is true
     or new.id in ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Signup must never fail over a Google display name, so swap instead of raising.
    if public.reads_as_grabsty(new.username) then
      new.username := 'user' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
    end if;
    if public.reads_as_grabsty(new.full_name) then
      new.full_name := null;
    end if;
    return new;
  end if;

  if (new.username is distinct from old.username and public.reads_as_grabsty(new.username))
     or (new.full_name is distinct from old.full_name and public.reads_as_grabsty(new.full_name)) then
    raise exception 'That name is reserved. Please choose another.' using errcode = '22000';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_reserved_names() from public;

create trigger guard_reserved_names before insert or update of username, full_name on public.profiles
  for each row execute function public.guard_reserved_names();
