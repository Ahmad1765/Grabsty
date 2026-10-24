-- Audit 2026-10-24, findings M3, M7, L1.

-- M3. Public buckets accepted any file type and size: multi-GB uploads, or
-- HTML/SVG served from the storage origin. The app only ever uploads
-- compressed JPEG/PNG/WebP/HEIC (lib/upload.ts inferContentType), and
-- remove-background writes PNG to wardrobe-images. Largest live object: 6.2 MB.
update storage.buckets
   set file_size_limit = 10485760,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
 where id in ('listing-images', 'avatars', 'wardrobe-images');

-- M7. A participant could PATCH an accepted offer message with its current
-- status: validate_offer_status_update let the no-op through, and
-- trg_messages_touch re-stamped updated_at, which card checkout reads as the
-- acceptance time (create-checkout-session, 7-day TTL) -> the offer price never
-- expired. It also re-fired the "offer accepted" push each time.
-- Server flows set ceranix.in_accept_offer / in_counter_offer and skip this.
do $$
declare
  v_def text := replace(pg_get_functiondef('public.validate_offer_status_update()'::regprocedure), E'\r', '');
  v_anchor text := E'  if new.offer_status is not distinct from old.offer_status then\n    return new;\n  end if;';
begin
  if position(v_anchor in v_def) = 0 then
    raise exception 'validate_offer_status_update changed shape; patch it by hand';
  end if;
  execute replace(v_def, v_anchor,
    E'  if new.offer_status is not distinct from old.offer_status then\n'
    || E'    if old.offer_status not in (''proposed'', ''pending'') then\n'
    || E'      raise exception ''offer is no longer active (current status: %)'', old.offer_status;\n'
    || E'    end if;\n'
    || E'    return new;\n'
    || E'  end if;');
end $$;

-- L1. The listings UPDATE policy only froze listings with an order in flight,
-- so a seller could set is_sold=false on an item already sold and completed
-- and sell it again. No client flow un-sells a listing; relisting after a
-- cancel/refund runs inside SECURITY DEFINER functions (cancel_order,
-- orders_relist_on_end), whose current_user is the owner, not a client role.
create or replace function public.guard_listing_unsell()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') and old.is_sold and not new.is_sold then
    raise exception 'A sold listing can only be relisted by Grabsty' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists listings_guard_unsell on public.listings;
create trigger listings_guard_unsell
  before update of is_sold on public.listings
  for each row execute function public.guard_listing_unsell();
