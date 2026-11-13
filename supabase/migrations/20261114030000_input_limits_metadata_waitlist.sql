-- Audit 2026-11-12, batch 6: DB-005, DB-007, DB-008, DB-010 (input limits,
-- message metadata, listing content, waitlist).
--
-- current_setting('role') is the caller's role even inside SECURITY DEFINER
-- functions, so length limits also cover input that arrives through RPCs.
-- current_user is the function owner inside them, so rules about what a client
-- may write directly (immutable columns, server-only metadata) use current_user.

-- DB-005: one length rule for any column: args are (column, max) pairs.
create or replace function public.enforce_input_limits()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
declare
  i int := 0;
  v_col text;
  v_max int;
  v_val jsonb;
  v_len int;
  v_new jsonb := to_jsonb(new);
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
begin
  if coalesce(current_setting('role', true), '') not in ('anon', 'authenticated') then
    return new;
  end if;
  while i < tg_nargs loop
    v_col := tg_argv[i];
    v_max := tg_argv[i + 1]::int;
    i := i + 2;
    if not v_new ? v_col then
      raise exception 'enforce_input_limits on %: no column %', tg_table_name, v_col;
    end if;
    v_val := v_new -> v_col;
    if jsonb_typeof(v_val) = 'null' then
      continue;
    end if;
    -- Only what this write changes; an old oversized value doesn't block other updates.
    if tg_op = 'UPDATE' and (v_old -> v_col) is not distinct from v_val then
      continue;
    end if;
    v_len := case jsonb_typeof(v_val) when 'string' then char_length(v_val #>> '{}') else char_length(v_val::text) end;
    if v_len > v_max then
      raise exception 'Too long: % (up to % characters)', replace(v_col, '_', ' '), v_max using errcode = '22001';
    end if;
  end loop;
  return new;
end;
$function$;
revoke execute on function public.enforce_input_limits() from public, anon, authenticated;

drop trigger if exists zz_input_limits on public.orders;
create trigger zz_input_limits before insert or update on public.orders for each row
  execute function public.enforce_input_limits('shipping_address', '1500', 'delivery_notes', '500',
    'cancel_reason', '500', 'dispute_reason', '1000');
drop trigger if exists zz_input_limits on public.transactions;
create trigger zz_input_limits before insert or update on public.transactions for each row
  execute function public.enforce_input_limits('dispute_reason', '1000', 'cancel_reason', '500');
drop trigger if exists zz_input_limits on public.shipping_addresses;
create trigger zz_input_limits before insert or update on public.shipping_addresses for each row
  execute function public.enforce_input_limits('recipient_name', '100', 'line1', '200', 'line2', '200',
    'city', '80', 'state', '80', 'postal_code', '20', 'country', '60', 'phone', '30');
drop trigger if exists zz_input_limits on public.reports;
create trigger zz_input_limits before insert or update on public.reports for each row
  execute function public.enforce_input_limits('reason', '100', 'details', '2000');
drop trigger if exists zz_input_limits on public.account_deletion_requests;
create trigger zz_input_limits before insert or update on public.account_deletion_requests for each row
  execute function public.enforce_input_limits('email', '254', 'reason', '1000');
drop trigger if exists zz_input_limits on public.save_lists;
create trigger zz_input_limits before insert or update on public.save_lists for each row
  execute function public.enforce_input_limits('name', '60', 'emoji', '16');
drop trigger if exists zz_input_limits on public.saved_searches;
create trigger zz_input_limits before insert or update on public.saved_searches for each row
  execute function public.enforce_input_limits('query', '200', 'label', '80', 'category', '40', 'gender', '20');
drop trigger if exists zz_input_limits on public.wardrobe_posts;
create trigger zz_input_limits before insert or update on public.wardrobe_posts for each row
  execute function public.enforce_input_limits('caption', '1000', 'image_url', '500', 'tags', '1000');
drop trigger if exists zz_input_limits on public.verifications;
create trigger zz_input_limits before insert or update on public.verifications for each row
  execute function public.enforce_input_limits('legal_name', '100', 'notes', '1000', 'cnic_number', '20',
    'id_back_photo_path', '300');
drop trigger if exists zz_input_limits on public.user_devices;
create trigger zz_input_limits before insert or update on public.user_devices for each row
  execute function public.enforce_input_limits('device_name', '100');
drop trigger if exists zz_input_limits on public.messages;
create trigger zz_input_limits before insert or update on public.messages for each row
  execute function public.enforce_input_limits('metadata', '4000');

-- DB-005: an ID photo path has to be in the uploader's own folder.
create or replace function public.guard_verification_photo_path()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  -- The CNIC back photo path, and the front photo path the app keeps in notes.
  if current_user in ('anon', 'authenticated')
     and ((new.id_back_photo_path is not null and split_part(new.id_back_photo_path, '/', 1) <> auth.uid()::text)
       or (new.notes ~ '^[0-9a-fA-F-]{36}/' and split_part(new.notes, '/', 1) <> auth.uid()::text)) then
    raise exception 'That photo was not uploaded from your account' using errcode = '42501';
  end if;
  return new;
end;
$function$;
drop trigger if exists zz_verification_photo_path on public.verifications;
create trigger zz_verification_photo_path before insert or update of id_back_photo_path, notes on public.verifications
  for each row execute function public.guard_verification_photo_path();

-- DB-005 / DB-008: an image the caller uploaded (their own folder) to this
-- project's listing-images bucket, on this project's own host (taken from
-- the caller's token issuer).
create or replace function public.is_own_listing_image(p_url text)
 returns boolean
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select coalesce(
    char_length(p_url) <= 500
    and p_url ~ '^https?://[^/]+/storage/v1/object/public/listing-images/[^?#]+'
    and split_part(p_url, '/', 3) = split_part(coalesce(auth.jwt()->>'iss', ''), '/', 3)
    and exists (
      select 1 from storage.objects o
       where o.bucket_id = 'listing-images'
         and o.name = split_part(split_part(substring(p_url from '/object/public/listing-images/(.*)$'), '?', 1), '#', 1)
         and split_part(o.name, '/', 1) = auth.uid()::text
    ),
    false);
$function$;
revoke execute on function public.is_own_listing_image(text) from public, anon;
grant execute on function public.is_own_listing_image(text) to authenticated;

-- DB-005: dispute evidence is at most 6 of the buyer's own uploaded photos.
create or replace function public.guard_order_evidence()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
declare
  v_url text;
begin
  if coalesce(current_setting('role', true), '') not in ('anon', 'authenticated')
     or new.dispute_evidence_urls is not distinct from old.dispute_evidence_urls
     or new.dispute_evidence_urls is null then
    return new;
  end if;
  if cardinality(new.dispute_evidence_urls) > 6 then
    raise exception 'Attach up to 6 photos' using errcode = '22000';
  end if;
  foreach v_url in array new.dispute_evidence_urls loop
    if not public.is_own_listing_image(v_url) then
      raise exception 'One of the photos could not be attached. Remove it and try again.' using errcode = '22000';
    end if;
  end loop;
  return new;
end;
$function$;
drop trigger if exists zz_order_evidence on public.orders;
create trigger zz_order_evidence before update of dispute_evidence_urls on public.orders
  for each row execute function public.guard_order_evidence();

-- DB-008: listing content a client writes directly.
create or replace function public.guard_listing_content()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
declare
  v_url text;
  v_tag text;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if btrim(coalesce(new.title, '')) = '' then
    raise exception 'Add a title' using errcode = '22000';
  end if;
  if tg_op = 'INSERT' or new.images is distinct from old.images or new.thumbnails is distinct from old.thumbnails then
    foreach v_url in array coalesce(new.images, '{}') || coalesce(new.thumbnails, '{}') loop
      if not public.is_own_listing_image(v_url) then
        raise exception 'Photos must be uploaded through Grabsty' using errcode = '22000';
      end if;
    end loop;
  end if;
  foreach v_tag in array coalesce(new.tags, '{}') loop
    if char_length(v_tag) > 40 then
      raise exception 'Tags can be up to 40 characters' using errcode = '22001';
    end if;
  end loop;
  -- Set by the server only: listing age and buy reservations.
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.reserved_until := null;
  else
    new.created_at := old.created_at;
    new.reserved_until := old.reserved_until;
    new.seller_id := old.seller_id;
  end if;
  return new;
end;
$function$;
drop trigger if exists guard_listing_content on public.listings;
create trigger guard_listing_content before insert or update on public.listings
  for each row execute function public.guard_listing_content();

-- DB-007: metadata keys the server writes (order events, reminders, purchase
-- and support markers) can't come from a client.
create or replace function public.strip_server_message_metadata()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if current_user in ('anon', 'authenticated') and new.metadata is not null then
    new.metadata := new.metadata - array[
      'order_id', 'event', 'purchased', 'paid', 'payment_status', 'order_status',
      'support_case_id', 'case_number', 'case_event', 'issue_order_id', 'issue_category',
      'escrow_status', 'fulfillment_status', 'auto_completed', 'verified_by', 'completed_at',
      'bundle_invalid'];
  end if;
  return new;
end;
$function$;
drop trigger if exists aa_strip_server_metadata on public.messages;
create trigger aa_strip_server_metadata before insert on public.messages
  for each row execute function public.strip_server_message_metadata();

-- DB-010: waitlist rows only through waitlist_join, throttled per visitor.
drop policy if exists "Allow anonymous waitlist registration" on public.waitlist;
revoke insert on public.waitlist from anon, authenticated;

create table if not exists public.waitlist_attempts (
  visitor text not null,
  created_at timestamptz not null default now()
);
create index if not exists waitlist_attempts_visitor_idx on public.waitlist_attempts (visitor, created_at);
create index if not exists waitlist_created_at_idx on public.waitlist (created_at);
alter table public.waitlist_attempts enable row level security;
revoke all on public.waitlist_attempts from anon, authenticated;

-- The global cap was 120 signups / 10 minutes, so one script could block everyone.
-- Per-visitor limits in waitlist_join do the throttling; this is only a backstop.
create or replace function public.guard_waitlist_flood()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if (select count(*) from public.waitlist where created_at > now() - interval '10 minutes') >= 2000 then
    raise exception 'Too many signups right now, please try again in a few minutes' using errcode = '54000';
  end if;
  return new;
end;
$function$;

do $do$
declare
  v_patch record;
  v_def text;
begin
  for v_patch in
    select * from (values
      -- DB-010: 20 joins or lookups per visitor per 10 minutes. The visitor is
      -- Cloudflare's client IP, else the last x-forwarded-for hop (the one our
      -- proxy added); the first hop is whatever the caller sent.
      ('public.waitlist_join(text,text,text,text,text)',
       '  if length(v_digits) < 7 then
    raise exception ''Phone number is invalid'' using errcode = ''22023'';
  end if;',
       '  if length(v_digits) < 7 then
    raise exception ''Phone number is invalid'' using errcode = ''22023'';
  end if;
  if char_length(p_name) > 100 or char_length(coalesce(p_email, '''')) > 254 or char_length(p_phone) > 30 then
    raise exception ''Please check your details'' using errcode = ''22001'';
  end if;
  declare
    v_headers json := coalesce(nullif(current_setting(''request.headers'', true), ''''), ''{}'')::json;
    v_visitor text := md5(coalesce(
      nullif(btrim(v_headers->>''cf-connecting-ip''), ''''),
      nullif(btrim(regexp_replace(coalesce(v_headers->>''x-forwarded-for'', ''''), ''^.*,'', '''')), ''''),
      ''unknown''));
  begin
    if (select count(*) from public.waitlist_attempts
         where visitor = v_visitor and created_at > now() - interval ''10 minutes'') >= 20 then
      raise exception ''Too many attempts, please try again in a few minutes'' using errcode = ''54000'';
    end if;
    insert into public.waitlist_attempts (visitor) values (v_visitor);
    delete from public.waitlist_attempts where visitor = v_visitor and created_at < now() - interval ''1 hour'';
    if random() < 0.01 then
      delete from public.waitlist_attempts where created_at < now() - interval ''1 day'';
    end if;
  end;'),
      -- DB-005: issue photos must be this project's own uploads, not any host.
      ('public.report_order_issue(uuid,text,text,text[])',
       '    if v_url !~ ''^https://[a-z0-9.-]+/storage/v1/object/public/listing-images/'' or char_length(v_url) > 500 then',
       '    if not public.is_own_listing_image(v_url) then'),
      -- DB-007: only a real system reminder counts as "already reminded".
      ('public.auto_complete_delivered_orders()',
       'and m.metadata->>''event'' = ''auto_complete_reminder''',
       'and m.kind = ''system'' and m.metadata->>''event'' = ''auto_complete_reminder'''),
      ('public.auto_cancel_unshipped_orders()',
       'and m.metadata->>''event'' = ''auto_cancel_reminder''',
       'and m.kind = ''system'' and m.metadata->>''event'' = ''auto_cancel_reminder''')
    ) as p(fn, old_text, new_text)
  loop
    v_def := pg_get_functiondef(v_patch.fn::regprocedure);
    if position(v_patch.old_text in v_def) = 0 then
      raise exception '%: text to replace not found', v_patch.fn;
    end if;
    execute replace(v_def, v_patch.old_text, v_patch.new_text);
  end loop;
end
$do$;
