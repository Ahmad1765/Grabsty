-- WhatsApp thank-you for new waitlist signups, sent once by send-waitlist-whatsapp.
-- People who joined before this is applied are never queued.
--
-- APPLY ONLY AFTER the WhatsApp consent line is live on grabsty.com and the Meta
-- secrets are set: anyone queued earlier would be messaged once setup finishes.
--
-- Numbers are unverified, and messaging strangers damages the WhatsApp account's
-- quality rating, so: one message per number ever, Pakistani mobiles only (launch is
-- Lahore), and form signups only (direct table inserts have no referral code).
--
-- ponytail: 200 a day sits under Meta's 250 starting limit for new business
-- portfolios. Raise both 200s below when Meta raises the limit. Signups over the cap
-- go out at up to 20 an hour once there's room: delayed, not lost, for 7 days.

create function public.whatsapp_pk_mobile(p_phone text) returns text
language sql immutable set search_path to '' as $$
  select '92' || (regexp_match(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '^(?:0092|92|0)?(3\d{9})$'))[1];
$$;

create table public.waitlist_whatsapp (
  phone text primary key,
  waitlist_id uuid not null unique references public.waitlist(id) on delete cascade,
  queued_at timestamptz not null default now(),
  sent_at timestamptz
);
alter table public.waitlist_whatsapp enable row level security;
revoke all on public.waitlist_whatsapp from anon, authenticated;

create function public.dispatch_waitlist_whatsapp(p_waitlist_id uuid) returns void
language plpgsql security definer set search_path to '' as $$
declare
  v_url text;
  v_secret text;
begin
  select replace(decrypted_secret, '/send-push', '/send-waitlist-whatsapp') into v_url
    from vault.decrypted_secrets where name = 'push_function_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'push_webhook_secret';
  if v_url is null or v_secret is null then
    raise warning '[waitlist-whatsapp] vault secrets not configured';
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
revoke all on function public.dispatch_waitlist_whatsapp(uuid) from public, anon, authenticated;

create function public.queue_waitlist_whatsapp() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  -- A message must never be able to fail a signup.
  begin
    insert into public.waitlist_whatsapp (phone, waitlist_id)
    values (public.whatsapp_pk_mobile(new.phone), new.id)
    on conflict do nothing;
    if found and (select count(*) from public.waitlist_whatsapp where queued_at > now() - interval '24 hours') <= 200 then
      perform public.dispatch_waitlist_whatsapp(new.id);
    end if;
  exception when others then
    raise warning '[waitlist-whatsapp] queue failed: %', sqlerrm;
  end;
  return new;
end;
$$;
revoke all on function public.queue_waitlist_whatsapp() from public, anon, authenticated;

create trigger queue_waitlist_whatsapp_on_insert after insert on public.waitlist
  for each row when (new.referral_code is not null and public.whatsapp_pk_mobile(new.phone) is not null)
  execute function public.queue_waitlist_whatsapp();

create function public.retry_waitlist_whatsapp() returns void
language plpgsql security definer set search_path to '' as $$
declare
  v_id uuid;
begin
  for v_id in
    select waitlist_id from public.waitlist_whatsapp
     where sent_at is null
       and queued_at > now() - interval '7 days'
       and queued_at < now() - interval '10 minutes'
     order by queued_at
     limit least(20, greatest(0, 200 - (select count(*) from public.waitlist_whatsapp where sent_at > now() - interval '24 hours')))
  loop
    perform public.dispatch_waitlist_whatsapp(v_id);
  end loop;
end;
$$;
revoke all on function public.retry_waitlist_whatsapp() from public, anon, authenticated;

select cron.schedule('retry-waitlist-whatsapp', '47 * * * *', 'select public.retry_waitlist_whatsapp()');
