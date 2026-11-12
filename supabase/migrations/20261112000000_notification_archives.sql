-- Notifications: Archive.
--
-- The feed is assembled on read by get_my_notifications() (no rows of its
-- own), so an archive is just the notification's id remembered per user. The
-- app reads this list and hides those rows from the feed (they show under the
-- Archived filter). Additive: nothing existing changes, old app builds are
-- unaffected.

create table if not exists public.notification_archives (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  notification_id text not null check (char_length(notification_id) between 1 and 120),
  archived_at timestamptz not null default now(),
  primary key (user_id, notification_id)
);
alter table public.notification_archives enable row level security;

drop policy if exists "Own notification archives: read" on public.notification_archives;
create policy "Own notification archives: read" on public.notification_archives
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Own notification archives: add" on public.notification_archives;
create policy "Own notification archives: add" on public.notification_archives
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Own notification archives: remove" on public.notification_archives;
create policy "Own notification archives: remove" on public.notification_archives
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.notification_archives from anon, authenticated;
grant select, insert, delete on public.notification_archives to authenticated;
grant all on public.notification_archives to service_role;
