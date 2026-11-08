-- users_blocked(a, b) is SECURITY DEFINER and answers for any pair of users, so
-- exposing it as an RPC let anyone (anon key included) learn who blocked whom.
-- The baseline's default privileges grant EXECUTE to anon/authenticated
-- directly, which `revoke ... from public` in 20261106000000 did not remove.
-- Only the SECURITY DEFINER block-guard triggers call it; they run as owner.
revoke execute on function public.users_blocked(uuid, uuid) from anon, authenticated;
