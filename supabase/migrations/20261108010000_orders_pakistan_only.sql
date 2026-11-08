-- Grabsty only delivers inside Pakistan (cash on delivery). Any new order with a
-- delivery address in another country is refused, whichever path created it.
-- Blank country is allowed: in-person handovers carry no address, and the
-- address form defaults the country to Pakistan.

create function public.pakistan_only_orders() returns trigger
language plpgsql set search_path to '' as $$
declare
  v_country text := lower(trim(coalesce(new.shipping_address->>'country', '')));
begin
  if v_country not in ('', 'pakistan', 'pk', 'pak') then
    raise exception 'Grabsty isn''t available in your country yet. We only deliver within Pakistan.'
      using errcode = '22000';
  end if;
  return new;
end;
$$;
revoke all on function public.pakistan_only_orders() from public, anon, authenticated;

create trigger pakistan_only_orders before insert on public.orders
  for each row execute function public.pakistan_only_orders();
