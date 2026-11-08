-- Auth audit 2026-10-28. "Users can update own profile" plus a table-wide
-- UPDATE grant let any signed-in user PATCH every column of their own row.
-- guard_profile_trust_fields() protects is_admin / is_verified / is_pro /
-- rating / total_sales, but followers_count, following_count and created_at
-- were open: `PATCH /rest/v1/profiles?id=eq.<me> {"followers_count":100000}`
-- returned 200 (fake social proof, fake "member since").
--
-- Replace the table grant with a column allow-list of what the app edits
-- (app/profile/edit.tsx, app/onboarding.tsx, settings). Counters stay correct:
-- handle_follow_change() is SECURITY DEFINER, so it writes as the owner and is
-- unaffected. anon never had a policy that could match (auth.uid() is null).

revoke update on public.profiles from anon, authenticated;

grant update (
  username, full_name, bio, location, avatar_url, banner_url, interests,
  vacation_mode, bundle_discount_pct, saved_collection_privacy
) on public.profiles to authenticated;
