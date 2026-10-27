-- QA pass 2026-10-22. "Senders can delete own messages" let a participant
-- delete any row they are the sender of, including server-written system
-- notices (cancel_order / confirm_order_received / post_order_placed_message
-- record the caller as sender) and offers. A seller could erase "Order
-- cancelled by Seller", a buyer an accepted offer (orders.offer_message_id
-- then goes null, the offers row is orphaned). Only plain text/photo
-- messages are the sender's to delete; offers are withdrawn, never deleted.
drop policy if exists "Senders can delete own messages" on public.messages;
create policy "Senders can delete own messages" on public.messages
  for delete to authenticated
  using ((select auth.uid()) = sender_id and kind = 'text');

create or replace function public.delete_chat_message(p_message_id uuid, p_conversation_id uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_sender_id uuid;
  v_kind text;
begin
  select sender_id, kind into v_sender_id, v_kind
  from public.messages
  where id = p_message_id and conversation_id = p_conversation_id;

  if v_sender_id is null then
    return false;
  end if;

  if v_sender_id <> auth.uid() or v_kind <> 'text' then
    raise exception 'Unauthorized to delete message';
  end if;

  delete from public.messages
  where id = p_message_id and conversation_id = p_conversation_id;

  return true;
end;
$function$;
