-- Welcome email, sent once by the send-welcome-email edge function.
--
-- Queued when the address is confirmed rather than at signup: an unconfirmed
-- address may belong to someone else, and we'd be mailing a stranger. Users who
-- confirmed before this shipped are never queued.
--
-- A row with sent_at null is retried hourly for 7 days, which also covers the
-- window where RESEND_API_KEY isn't set yet.

create table public.welcome_emails (
  user_id uuid primary key references auth.users(id) on delete cascade,
  queued_at timestamptz not null default now(),
  sent_at timestamptz
);
alter table public.welcome_emails enable row level security;
revoke all on public.welcome_emails from anon, authenticated;

create function public.dispatch_welcome_email(p_user_id uuid) returns void
language plpgsql security definer set search_path to '' as $$
declare
  v_url text;
  v_secret text;
begin
  select replace(decrypted_secret, '/send-push', '/send-welcome-email') into v_url
    from vault.decrypted_secrets where name = 'push_function_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'push_webhook_secret';
  if v_url is null or v_secret is null then
    raise warning '[welcome-email] vault secrets not configured';
    return;
  end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('user_id', p_user_id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
    timeout_milliseconds := 5000
  );
end;
$$;
revoke all on function public.dispatch_welcome_email(uuid) from public, anon, authenticated;

create function public.queue_welcome_email() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if new.email like '%@grabsty.internal' then
    return new;
  end if;
  -- A welcome email must never be able to fail a signup or confirmation.
  begin
    insert into public.welcome_emails (user_id) values (new.id)
    on conflict (user_id) do nothing;
    if found then
      perform public.dispatch_welcome_email(new.id);
    end if;
  exception when others then
    raise warning '[welcome-email] queue failed: %', sqlerrm;
  end;
  return new;
end;
$$;
revoke all on function public.queue_welcome_email() from public, anon, authenticated;

create trigger queue_welcome_email_on_insert after insert on auth.users
  for each row when (new.email is not null and new.email_confirmed_at is not null)
  execute function public.queue_welcome_email();
create trigger queue_welcome_email_on_confirm after update of email_confirmed_at on auth.users
  for each row when (new.email is not null and old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.queue_welcome_email();

create function public.retry_welcome_emails() returns void
language plpgsql security definer set search_path to '' as $$
declare
  v_id uuid;
begin
  for v_id in
    select user_id from public.welcome_emails
     where sent_at is null
       and queued_at > now() - interval '7 days'
       and queued_at < now() - interval '10 minutes'
     order by queued_at
     limit 50
  loop
    perform public.dispatch_welcome_email(v_id);
  end loop;
end;
$$;
revoke all on function public.retry_welcome_emails() from public, anon, authenticated;

select cron.schedule('retry-welcome-emails', '23 * * * *', 'select public.retry_welcome_emails()');
