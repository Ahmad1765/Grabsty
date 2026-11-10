-- Chat: order updates (system messages: order placed, payment received,
-- packing, in transit, delivered, cancelled, completed...) are for the buyer
-- only. Sellers follow their orders in Activity -> Orders, not in chat.
--
-- 1. RLS: in a listing chat the seller can't read kind = 'system' messages.
--    Realtime uses the same policy, so they don't stream to the seller either.
-- 2. The shared inbox preview (last_message / last_sender_id / updated_at) is
--    bumped by every message, so a seller would still see "Order cancelled..."
--    and an unread dot. Conversations get a seller-side preview that skips
--    system messages; the app reads it when the viewer is the seller.
-- Offers and normal messages are unchanged for both sides.

-- ── 1. Read access ─────────────────────────────────────────────────────────
drop policy if exists "Participants can view messages" on public.messages;
create policy "Participants can view messages" on public.messages
  for select
  using (
    exists (
      select 1 from public.conversations c
       where c.id = messages.conversation_id
         and (
           (select auth.uid()) = c.buyer_id
           or ((select auth.uid()) = c.seller_id
               and not (messages.kind = 'system' and c.listing_id is not null))
         )
    )
  );

-- ── 2. Seller-side inbox preview ───────────────────────────────────────────
alter table public.conversations
  add column if not exists seller_last_message text,
  add column if not exists seller_last_sender_id uuid,
  add column if not exists seller_activity_at timestamptz;

create or replace function public.message_preview(p_kind text, p_content text, p_metadata jsonb)
returns text
language sql
immutable
set search_path to ''
as $$
  select case when p_kind = 'offer' then 'Offer: Rs ' || coalesce(p_metadata->>'amount', '?')
              else left(p_content, 140) end
$$;

create or replace function public.bump_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_preview text := public.message_preview(new.kind, new.content, new.metadata);
begin
  update public.conversations c
     set last_message = v_preview,
         last_sender_id = new.sender_id,
         updated_at = now(),
         seller_last_message = case when new.kind = 'system' and c.listing_id is not null
                                    then c.seller_last_message else v_preview end,
         seller_last_sender_id = case when new.kind = 'system' and c.listing_id is not null
                                      then c.seller_last_sender_id else new.sender_id end,
         seller_activity_at = case when new.kind = 'system' and c.listing_id is not null
                                   then c.seller_activity_at else now() end
   where c.id = new.conversation_id;
  return new;
end;
$function$;

create or replace function public.handle_message_delete()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_last record;
  v_seller_last record;
  v_is_listing boolean;
begin
  select listing_id is not null into v_is_listing from public.conversations where id = old.conversation_id;

  select id, content, kind, metadata, sender_id, created_at into v_last
    from public.messages
   where conversation_id = old.conversation_id
   order by created_at desc
   limit 1;

  select id, content, kind, metadata, sender_id, created_at into v_seller_last
    from public.messages
   where conversation_id = old.conversation_id
     and not (kind = 'system' and coalesce(v_is_listing, false))
   order by created_at desc
   limit 1;

  update public.conversations
     set last_message = case when v_last.id is null then null
                             else public.message_preview(v_last.kind, v_last.content, v_last.metadata) end,
         last_sender_id = v_last.sender_id,
         updated_at = coalesce(v_last.created_at, updated_at),
         seller_last_message = case when v_seller_last.id is null then null
                                    else public.message_preview(v_seller_last.kind, v_seller_last.content, v_seller_last.metadata) end,
         seller_last_sender_id = v_seller_last.sender_id,
         seller_activity_at = v_seller_last.created_at
   where id = old.conversation_id;
  return old;
end;
$function$;

-- Backfill from each conversation's latest non-system message.
update public.conversations c
   set seller_last_message = public.message_preview(m.kind, m.content, m.metadata),
       seller_last_sender_id = m.sender_id,
       seller_activity_at = m.created_at
  from (
    select distinct on (m.conversation_id) m.conversation_id, m.kind, m.content, m.metadata, m.sender_id, m.created_at
      from public.messages m
      join public.conversations c2 on c2.id = m.conversation_id
     where not (m.kind = 'system' and c2.listing_id is not null)
     order by m.conversation_id, m.created_at desc
  ) m
 where m.conversation_id = c.id;

revoke execute on function public.message_preview(text, text, jsonb) from public, anon;
grant execute on function public.message_preview(text, text, jsonb) to authenticated, service_role;
revoke execute on function public.bump_conversation_on_message() from public, anon, authenticated;
revoke execute on function public.handle_message_delete() from public, anon, authenticated;
