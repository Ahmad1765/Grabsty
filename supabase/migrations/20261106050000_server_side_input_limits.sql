-- The app's form limits were client-only: a direct API call could store a
-- 10MB bio or a price big enough to overflow process_checkout's integer maths
-- (which failed every buyer of that listing). Same numbers as lib/schemas/sell.ts
-- and app/profile/edit.tsx, except username (generated handles run up to 37).

alter table public.listings
  add constraint listings_title_length check (char_length(title) <= 80),
  add constraint listings_description_length check (char_length(description) <= 1000),
  add constraint listings_brand_length check (char_length(brand) <= 60),
  add constraint listings_size_length check (char_length(size) <= 30),
  add constraint listings_price_max check (price <= 100000),
  add constraint listings_tags_max check (cardinality(tags) <= 10),
  add constraint listings_images_max check (cardinality(images) <= 20);

alter table public.profiles
  add constraint profiles_username_format check (username ~ '^[A-Za-z0-9_.]{3,40}$'),
  add constraint profiles_full_name_length check (char_length(full_name) <= 100),
  add constraint profiles_bio_length check (char_length(bio) <= 200),
  add constraint profiles_location_length check (char_length(location) <= 60);

-- Signup must never fail over a long Google display name, so it's trimmed before
-- the constraint sees it.
create or replace function public.guard_reserved_names() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if tg_op = 'INSERT' then
    new.full_name := left(new.full_name, 100);
  end if;

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

-- A courier order with no address can't be delivered. The client validates this,
-- but process_checkout only checked for non-null, so {} got through a direct call.
create or replace function public.guard_new_order() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if public.users_blocked(new.buyer_id, new.seller_id) then
    raise exception 'This item is no longer available' using errcode = '42501';
  end if;
  if coalesce((select vacation_mode from public.profiles where id = new.seller_id), false) then
    raise exception 'This seller is away right now, so this item can''t be bought yet' using errcode = '22000';
  end if;
  if new.shipping_method = 'managed' and (
       coalesce(btrim(new.shipping_address->>'line1'), '') = ''
    or coalesce(btrim(new.shipping_address->>'city'), '') = ''
    or coalesce(btrim(new.shipping_address->>'phone'), '') = ''
  ) then
    raise exception 'Please provide a complete delivery address with phone number' using errcode = '22000';
  end if;
  return new;
end;
$$;
