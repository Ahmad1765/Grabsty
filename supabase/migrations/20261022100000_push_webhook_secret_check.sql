-- QA pass 2026-10-22. Push notifications stopped on 2026-10-14: every call
-- from push.notify_send_push() to the send-push function got 401 because the
-- function's PUSH_WEBHOOK_SECRET env var no longer matched the Vault copy
-- (`push_webhook_secret`, unchanged since July) the trigger sends.
--
-- Make Vault the single source of truth: send-push asks this function whether
-- the header it received is the Vault secret. It answers yes/no only — the
-- secret never leaves the database — and only the service role (which the
-- edge function runs as) may call it.
create or replace function public.push_webhook_secret_matches(p_secret text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(p_secret, '') <> ''
     and exists (
       select 1 from vault.decrypted_secrets
        where name = 'push_webhook_secret' and decrypted_secret = p_secret
     );
$$;

revoke all on function public.push_webhook_secret_matches(text) from public, anon, authenticated;
grant execute on function public.push_webhook_secret_matches(text) to service_role;
