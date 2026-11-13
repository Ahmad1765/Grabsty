-- Audit 2026-11-12, batch 5: WEB-003. When a buyer's issue report puts the
-- payment on hold, the seller is told in their Support thread (a support-bot
-- message, which sellers see and get a push for; system messages in a listing
-- chat are hidden from sellers since 20261111010000). A failure to post the
-- notice never blocks the report. Patched in place, once; a missing phrase
-- aborts the migration.
do $do$
declare
  v_def text := pg_get_functiondef('public.report_order_issue(uuid,text,text,text[])'::regprocedure);
  v_old text := '  -- One case per order: a second report on the same order joins its open case.';
begin
  if position('issue_on_hold_notice' in v_def) > 0 then
    return; -- already patched
  end if;
  if position(v_old in v_def) = 0 then
    raise exception 'report_order_issue: text to replace not found';
  end if;
  execute replace(v_def, v_old,
'  if v_hold then
    begin
      insert into public.messages (conversation_id, sender_id, content, kind, metadata)
      values (public.ensure_support_conversation(v_order.seller_id), v_bot,
              ''Order #'' || public.order_reference(p_order_id) || '': the buyer reported a problem ('' || v_label
                || ''). Your payment for this order is on hold while we review it. We''''ll reply here.'',
              ''text'',
              jsonb_build_object(''issue_order_id'', p_order_id, ''event'', ''issue_on_hold_notice''));
    exception when others then
      null; -- the report itself must still go through
    end;
  end if;

' || v_old);
end
$do$;
