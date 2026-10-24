-- QA pass 2026-10-22. advance_escrow_status had no caller check for the
-- PAYMENT_SECURED_ESCROW target: ANY signed-in user could move another
-- user's PENDING_PAYMENT ledger (e.g. a failed card checkout) to "escrow
-- secured" and post "Escrow Secured! Payment held safely" into that buyer
-- and seller's chat, inviting the seller to ship an unpaid item. Buyers could
-- also release COD "funds" (IN_TRANSIT -> COMPLETED_FUNDS_RELEASED) without
-- the seller confirming the cash, and sellers could self-certify DELIVERED.
-- Only the admin console (app/admin) calls this; participants have their own
-- RPCs (advance_order_fulfillment, confirm_order_received, complete_cod_order,
-- cancel_order, open_order_dispute). Gate it on admin; the body is unchanged
-- and only runs for admins now.
do $$
declare
  v_def text := pg_get_functiondef('public.advance_escrow_status(uuid,text,text,text,text,text,text)'::regprocedure);
  v_anchor text := E'  select * into v_tx from public.transactions where order_id = p_order_id for update;';
begin
  if position(v_anchor in replace(v_def, E'\r', '')) = 0 then
    raise exception 'advance_escrow_status changed shape; patch it by hand';
  end if;
  v_def := replace(v_def, E'\r', '');
  v_def := replace(v_def, v_anchor,
    -- coalesce: a caller with no profile row leaves v_is_admin null.
    E'  if not coalesce(v_is_admin, false) then\n'
    || E'    raise exception ''Only platform admins can change escrow status'' using errcode = ''42501'';\n'
    || E'  end if;\n\n' || v_anchor);
  execute v_def;
end $$;
