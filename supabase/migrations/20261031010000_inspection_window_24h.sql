-- Buyer inspection window: 48h -> 24h (product decision 2026-10-31).
-- Rewrites the live definitions in place (text replace on pg_get_functiondef)
-- so grants, SECURITY DEFINER and any drift from the repo are preserved.
-- Enforcement: auto_complete_delivered_orders (payout release) and
-- open_order_dispute (dispute cutoff). The other two only carry message text.
-- Offer expiry (sweep_expired_offers_and_reservations) stays 48h on purpose.

do $$
declare
  f text;
  def text;
begin
  foreach f in array array[
    'auto_complete_delivered_orders',
    'open_order_dispute',
    'advance_escrow_status',
    'advance_order_fulfillment'
  ] loop
    for def in
      select pg_get_functiondef(p.oid)
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = f
    loop
      execute replace(replace(def, '48 hours', '24 hours'), '48-hour', '24-hour');
    end loop;
  end loop;
end $$;

update public.support_bot_replies
   set content = replace(replace(replace(content,
         '48-Hour Inspection Window**: You have 2 days', '24-Hour Inspection Window**: You have 24 hours'),
         '48h after courier delivery', '24h after courier delivery'),
         '48-Hour', '24-Hour')
 where content ~ '48-Hour|48h after courier delivery';
