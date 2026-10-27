-- Audit 2026-10-24, finding L2. anon/authenticated held every table privilege
-- on almost every public table, so RLS was the only barrier. Two cleanups:
--
-- 1. TRUNCATE, TRIGGER, REFERENCES: never used by the app. TRUNCATE in
--    particular bypasses RLS entirely (not reachable through PostgREST today,
--    but one exposed function away).
-- 2. INSERT/UPDATE/DELETE that no RLS policy can ever permit for that role
--    (computed from pg_policies below, so it tracks the live schema). These
--    already fail under RLS; revoking turns a policy mistake into a no-op
--    instead of an open door. Server-only tables (processed_webhooks,
--    rate_limit_events, transaction_event_logs, trending_rank_snapshots,
--    listing_price_history, listing_views) end up read-only or invisible to
--    clients. All writers to them are SECURITY DEFINER functions or the
--    service role, neither of which these grants affect.
-- Column grants (conversations read receipts) are untouched.

revoke truncate, trigger, references on all tables in schema public from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke truncate, trigger, references on tables from anon, authenticated;

do $$
declare
  r record;
begin
  for r in
    with g as (
      select table_name t, grantee rl, privilege_type p
        from information_schema.role_table_grants
       where table_schema = 'public'
         and grantee in ('anon', 'authenticated')
         and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
    ), pol as (
      select tablename t,
             unnest(case when roles = '{public}' then array['anon', 'authenticated'] else roles::text[] end) rl,
             cmd
        from pg_policies
       where schemaname = 'public'
    )
    select g.t, g.rl, g.p
      from g
     where not exists (
       select 1 from pol where pol.t = g.t and pol.rl = g.rl and (pol.cmd = g.p or pol.cmd = 'ALL')
     )
  loop
    execute format('revoke %s on public.%I from %I', r.p, r.t, r.rl);
  end loop;
end $$;
