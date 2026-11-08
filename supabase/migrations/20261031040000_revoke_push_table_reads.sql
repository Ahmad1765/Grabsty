-- Push bookkeeping is server-side only. Cerranix had these SELECT grants
-- revoked by hand; this records it so a fresh project matches.
revoke select on table public.push_deliveries from anon, authenticated;
revoke select on table public.user_devices from anon;
