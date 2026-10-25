-- Audit 2026-10-24, reliability. Triggers deliver push notifications
-- (push.notify_send_push) and order analytics (analytics.capture_order_event)
-- through pg_net, which has no retries and keeps responses for ~6 hours. When
-- send-push started 401-ing on 2026-10-14, nothing noticed for days.
-- Every 15 minutes this job reports new failed responses (non-2xx, timeout or
-- network error) to Sentry as one event, so they land where errors already go.
-- Setup: the app's public Sentry DSN in Vault as 'sentry_dsn'. Without it the
-- job does nothing.

create schema if not exists ops;
revoke all on schema ops from public, anon, authenticated;

create table if not exists ops.outbound_health_state (
  id boolean primary key default true check (id),
  last_response_id bigint not null default 0
);
insert into ops.outbound_health_state default values on conflict do nothing;

create or replace function ops.report_outbound_failures()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dsn     text;
  v_parts   text[];
  v_last    bigint;
  v_max     bigint;
  v_summary jsonb;
  v_count   int;
begin
  select last_response_id into v_last from ops.outbound_health_state for update;
  select max(id) into v_max from net._http_response;
  if v_max is null or v_max <= v_last then
    return;
  end if;

  select count(*),
         jsonb_object_agg(k, n)
    into v_count, v_summary
    from (
      select coalesce(status_code::text, case when timed_out then 'timeout' else 'error' end) k, count(*) n
        from net._http_response
       where id > v_last and id <= v_max
         and (status_code is null or status_code not between 200 and 299)
       group by 1
    ) s;

  update ops.outbound_health_state set last_response_id = v_max;
  if coalesce(v_count, 0) = 0 then
    return;
  end if;

  select decrypted_secret into v_dsn from vault.decrypted_secrets where name = 'sentry_dsn';
  -- https://<key>@<host>/<project>
  v_parts := regexp_match(v_dsn, '^https://([0-9a-f]+)@([^/]+)/(\d+)$');
  if v_parts is null then
    raise warning '[ops] % outbound request(s) failed; sentry_dsn not configured', v_count;
    return;
  end if;

  perform net.http_post(
    url     := format('https://%s/api/%s/store/?sentry_version=7&sentry_key=%s', v_parts[2], v_parts[3], v_parts[1]),
    body    := jsonb_build_object(
                 'message',     format('%s outbound request(s) from the database failed', v_count),
                 'level',       'error',
                 'platform',    'other',
                 'logger',      'pg_net',
                 'environment', 'production',
                 'fingerprint', jsonb_build_array('pg-net-outbound-failures'),
                 'extra',       jsonb_build_object(
                                  'by_status', v_summary,
                                  'response_ids', format('%s..%s', v_last + 1, v_max),
                                  'sample', (select left(coalesce(content, error_msg, ''), 300)
                                               from net._http_response
                                              where id > v_last and id <= v_max
                                                and (status_code is null or status_code not between 200 and 299)
                                              order by id desc limit 1),
                                  'hint', 'Callers: push.notify_send_push (send-push edge function), analytics.capture_order_event (PostHog)'
                                )
               ),
    headers := jsonb_build_object('Content-Type', 'application/json')
  );
end;
$$;

select cron.schedule('report-outbound-failures', '*/15 * * * *', 'select ops.report_outbound_failures()');
