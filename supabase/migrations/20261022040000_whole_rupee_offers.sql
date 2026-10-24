-- QA pass 2026-10-22. Offers accepted fractional rupees (e.g. Rs 12.50) while
-- every price in the app is whole rupees. The client now only accepts digits;
-- this stops API callers too. Every offer path (chat trigger, accept, counter)
-- writes through public.offers, so the failing insert rejects the offer.
alter table public.offers drop constraint if exists offers_amount_whole;
alter table public.offers add constraint offers_amount_whole check (amount = trunc(amount));
