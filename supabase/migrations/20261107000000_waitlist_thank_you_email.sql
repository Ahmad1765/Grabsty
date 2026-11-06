-- Personal thank-you email for new grabsty.com waitlist signups, sent once by the
-- send-waitlist-email edge function. People who joined before this shipped are
-- never queued, because only the insert trigger adds rows.
--
-- The form is public and the address unverified, so someone can type a stranger's
-- email. Hence the guards: the primary key on the lowercased address means one
-- email per address ever (waitlist.email's unique index is case-sensitive), and at
-- most 60 are dispatched per hour straight from the trigger. Anything over that
-- waits for the retry job, which sends 50 an hour: delayed, not lost.
--
-- A row with sent_at null is retried hourly for 7 days.

create table public.waitlist_emails (
  email text primary key,
  waitlist_id uuid not null unique references public.waitlist(id) on delete cascade,
  queued_at timestamptz not null default now(),
  sent_at timestamptz
);
alter table public.waitlist_emails enable row level security;
revoke all on public.waitlist_emails from anon, authenticated;

create function public.dispatch_waitlist_email(p_waitlist_id uuid) returns void
language plpgsql security definer set search_path to '' as $$
declare
  v_url text;
  v_secret text;
begin
  select replace(decrypted_secret, '/send-push', '/send-waitlist-email') into v_url
    from vault.decrypted_secrets where name = 'push_function_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'push_webhook_secret';
  if v_url is null or v_secret is null then
    raise warning '[waitlist-email] vault secrets not configured';
    return;
  end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('waitlist_id', p_waitlist_id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
    timeout_milliseconds := 5000
  );
end;
$$;
revoke all on function public.dispatch_waitlist_email(uuid) from public, anon, authenticated;

create function public.queue_waitlist_email() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  -- An email must never be able to fail a signup.
  begin
    insert into public.waitlist_emails (email, waitlist_id)
    values (lower(trim(new.email)), new.id)
    on conflict do nothing;
    if found and (select count(*) from public.waitlist_emails where queued_at > now() - interval '1 hour') <= 60 then
      perform public.dispatch_waitlist_email(new.id);
    end if;
  exception when others then
    raise warning '[waitlist-email] queue failed: %', sqlerrm;
  end;
  return new;
end;
$$;
revoke all on function public.queue_waitlist_email() from public, anon, authenticated;

-- The regex matters because anon can insert into waitlist directly, skipping the form's validation.
create trigger queue_waitlist_email_on_insert after insert on public.waitlist
  for each row when (new.email ~ '^\s*[^@\s]+@[^@\s]+\.[^@\s]+\s*$')
  execute function public.queue_waitlist_email();

create function public.retry_waitlist_emails() returns void
language plpgsql security definer set search_path to '' as $$
declare
  v_id uuid;
begin
  for v_id in
    select waitlist_id from public.waitlist_emails
     where sent_at is null
       and queued_at > now() - interval '7 days'
       and queued_at < now() - interval '10 minutes'
     order by queued_at
     limit 50
  loop
    perform public.dispatch_waitlist_email(v_id);
  end loop;
end;
$$;
revoke all on function public.retry_waitlist_emails() from public, anon, authenticated;

select cron.schedule('retry-waitlist-emails', '37 * * * *', 'select public.retry_waitlist_emails()');
