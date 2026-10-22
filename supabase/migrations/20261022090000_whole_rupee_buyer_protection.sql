-- QA pass 2026-10-22. The 6% Buyer Protection fee was kept to the paisa
-- (Rs 2,999 -> Rs 179.94), so checkout totals like Rs 3,308.94 showed up in
-- an app that is whole rupees everywhere else, and a COD courier can't
-- collect 94 paisa. Round the fee to whole rupees, exactly like lib/fees.ts
-- (Math.round; Postgres round() on numeric is also half-up for positives).
do $$
declare
  v_def text := replace(pg_get_functiondef('public.process_checkout(uuid,uuid,text,jsonb,numeric,text,text,uuid[],numeric)'::regprocedure), E'\r', '');
  v_old text := 'v_fee_cents := round(v_item_price_cents * 6 / 100.0)::integer;';
  v_new text := 'v_fee_cents := (round(v_item_price_cents * 6 / 10000.0) * 100)::integer;';
begin
  if position(v_old in v_def) = 0 then
    raise exception 'process_checkout changed shape; patch the fee line by hand';
  end if;
  execute replace(v_def, v_old, v_new);
end $$;
