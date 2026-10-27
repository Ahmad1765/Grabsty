-- QA pass 2026-10-22. Three confirmed defects, all additive fixes.

-- 1. Owners could not delete their own uploads. Storage DELETE (and list) only
--    sees rows the caller can SELECT, and no bucket had a SELECT policy, so
--    supabase.storage.remove() was a silent no-op: listing/chat image cleanup
--    never ran and "deleted" photos stayed public. Owner-folder read only;
--    the buckets stay public for viewing via public URLs as before.
drop policy if exists "Owner read listing-images" on storage.objects;
create policy "Owner read listing-images" on storage.objects for select to authenticated
  using (bucket_id = 'listing-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Owner read avatars" on storage.objects;
create policy "Owner read avatars" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Owner read wardrobe-images" on storage.objects;
create policy "Owner read wardrobe-images" on storage.objects for select to authenticated
  using (bucket_id = 'wardrobe-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 2. Listings accepted price <= 0 straight from the API, and process_checkout
--    prices orders from listings.price, so a negative/zero listing produced
--    negative/zero orders and payouts.
alter table public.listings drop constraint if exists listings_price_positive;
alter table public.listings add constraint listings_price_positive check (price > 0);

-- 3. likes/views were client-writable (a seller could insert likes=99999 to
--    top Trending). Only the definer functions (bump_listing_likes,
--    log_listing_view — owned by postgres) may move them; API roles get them
--    pinned. Column REVOKEs don't work under the existing table-level grant.
create or replace function public.guard_listing_counters() returns trigger
  language plpgsql set search_path to '' as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.likes := 0;
      new.views := 0;
    else
      new.likes := old.likes;
      new.views := old.views;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists listings_guard_counters on public.listings;
create trigger listings_guard_counters before insert or update on public.listings
  for each row execute function public.guard_listing_counters();
