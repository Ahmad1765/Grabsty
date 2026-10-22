-- Trending rank history for Discover's Trending arrows (components/discover/SearchLanding.tsx).
--
-- An hourly pg_cron job snapshots the top 100 of the "popular" order — the same
-- ordering lib/listings.ts uses (likes, views, newest). The app compares live
-- ranks against trending_rank_baseline(): the latest snapshot at least 24h old,
-- or the oldest one we have while history is still shorter than that.

create table if not exists public.trending_rank_snapshots (
  taken_at   timestamptz not null,
  listing_id uuid not null references public.listings(id) on delete cascade,
  rank       smallint not null,
  primary key (taken_at, listing_id)
);

-- No direct client access; reads go through the definer function below.
alter table public.trending_rank_snapshots enable row level security;

create or replace function public.snapshot_trending_ranks()
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.trending_rank_snapshots (taken_at, listing_id, rank)
  select date_trunc('minute', now()), id,
         row_number() over (order by likes desc nulls last, views desc nulls last, created_at desc)
  from public.listings
  where is_sold = false
  order by likes desc nulls last, views desc nulls last, created_at desc
  limit 100
  on conflict do nothing;

  delete from public.trending_rank_snapshots where taken_at < now() - interval '3 days';
$$;

create or replace function public.trending_rank_baseline()
returns table (listing_id uuid, rank smallint)
language sql
stable
security definer
set search_path = public
as $$
  select s.listing_id, s.rank
  from public.trending_rank_snapshots s
  where s.taken_at = coalesce(
    (select max(taken_at) from public.trending_rank_snapshots where taken_at <= now() - interval '24 hours'),
    (select min(taken_at) from public.trending_rank_snapshots)
  );
$$;

revoke all on function public.snapshot_trending_ranks() from public, anon, authenticated;
grant execute on function public.trending_rank_baseline() to anon, authenticated;

select cron.schedule('snapshot-trending-ranks', '0 * * * *', $$ select public.snapshot_trending_ranks() $$);

-- Seed one snapshot so the baseline exists before the first cron tick.
select public.snapshot_trending_ranks();
