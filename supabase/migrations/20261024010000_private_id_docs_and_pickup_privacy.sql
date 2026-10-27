-- Audit 2026-10-24, findings H1 and M1.

-- H1. ID / CNIC photos were uploaded to the public `avatars` bucket, where the
-- /object/public/ URL skips storage RLS. They now go to a private bucket:
-- the owner reads and writes their own folder, admins read everything (for
-- KYC review through signed URLs). No documents existed in `avatars`.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('verification-docs', 'verification-docs', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Owner or admin read verification docs" on storage.objects;
create policy "Owner or admin read verification docs" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'verification-docs'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin())
  );

drop policy if exists "Owner upload verification docs" on storage.objects;
create policy "Owner upload verification docs" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'verification-docs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Owner delete verification docs" on storage.objects;
create policy "Owner delete verification docs" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'verification-docs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- M1. Buyers could read the seller's pickup (home) address through two
-- policies, while get_order_seller_pickup() deliberately refuses buyers.
-- The courier collects from the seller, so only the seller and admins need it.
-- No client role has write grants on this table; writes go through
-- advance_order_fulfillment (SECURITY DEFINER).
drop policy if exists "order_seller_pickups_party_access" on public.order_seller_pickups;
drop policy if exists "Participants and admins can view seller pickups" on public.order_seller_pickups;
create policy "Seller and admins can view seller pickups" on public.order_seller_pickups
  for select to authenticated
  using (
    (select auth.uid()) = seller_id
    or coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'is_admin')::boolean, false)
    or exists (select 1 from public.profiles where id = (select auth.uid()) and is_admin = true)
  );
