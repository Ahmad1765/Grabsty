-- Audit 2026-11-12 batch 8, product decisions 2026-11-14:
-- WF-005: once the seller books the courier pickup (Ready to deliver), neither
--   side can cancel. If the courier never comes, auto_cancel_unshipped_orders
--   still cancels packing orders after 5 days, and admins can cancel any time.
-- DEV-010: a buyer's offer or counter is at least half the asking price
--   (bundle: half the bundle total), rounded up to a whole rupee. Seller
--   counters only have to beat the buyer's offer, so a seller can still
--   counter an older offer made before this rule.

create function pg_temp.swap_text(p_def text, p_old text, p_new text)
returns text language plpgsql as $$
begin
  if position(p_old in p_def) = 0 then
    raise exception 'swap: [%] not found', left(p_old, 80);
  end if;
  return replace(p_def, p_old, p_new);
end $$;

do $do$
declare d text := pg_get_functiondef('public.cancel_order(uuid,text)'::regprocedure);
begin
  d := pg_temp.swap_text(d, $s$  if v_caller_id = v_order.seller_id and v_order.buyer_id <> v_caller_id
     and v_order.fulfillment_status = 'packing' then
    raise exception 'You confirmed Ready to deliver, so you can no longer cancel this order. Contact support if something is wrong.'
      using errcode = '22000';
  end if;$s$, $s$  if v_order.fulfillment_status = 'packing' then
    if v_caller_id = v_order.seller_id and v_order.buyer_id <> v_caller_id then
      raise exception 'You confirmed Ready to deliver, so you can no longer cancel this order. Contact support if something is wrong.'
        using errcode = '22000';
    end if;
    raise exception 'The seller has booked the courier pickup, so this order can no longer be cancelled. Contact support if something is wrong.'
      using errcode = '22000';
  end if;$s$);
  execute d;
end $do$;

do $do$
declare d text := pg_get_functiondef('public.trg_fn_sync_offer_on_message_insert()'::regprocedure);
begin
  d := pg_temp.swap_text(d, $s$      v_ceiling := public.offer_price_ceiling(v_conv.listing_id, new.metadata);
$s$, $s$      v_ceiling := public.offer_price_ceiling(v_conv.listing_id, new.metadata);
      if v_amount is not null and v_ceiling > 0 and new.sender_id = v_conv.buyer_id
         and v_amount < ceil(v_ceiling * 0.5) then
        raise exception 'Offers start at Rs % (half the asking price)',
          to_char(ceil(v_ceiling * 0.5), 'FM999,999,999') using errcode = '22000';
      end if;
$s$);
  execute d;
end $do$;
