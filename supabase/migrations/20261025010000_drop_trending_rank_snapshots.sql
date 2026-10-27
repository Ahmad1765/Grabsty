-- The Discover browse view was reverted to the pre-2026-10-22 design (pill
-- chips + topic tiles), which has no ranked Trending list. Its hourly
-- snapshot job and baseline RPC (20261022110000) have no reader left.
select cron.unschedule('snapshot-trending-ranks')
 where exists (select 1 from cron.job where jobname = 'snapshot-trending-ranks');
drop function if exists public.trending_rank_baseline();
drop function if exists public.snapshot_trending_ranks();
drop table if exists public.trending_rank_snapshots;
