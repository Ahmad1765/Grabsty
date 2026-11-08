-- Every new account gets a personal hello in a DM from the official @grabsty
-- account. Looked up by username (reserved by guard_reserved_names, so nobody
-- else can hold it) because its id differs per project. No @grabsty account on
-- a project → no message, signup unaffected.

create function public.send_welcome_dm() returns trigger
language plpgsql security definer set search_path to '' as $$
declare
  v_from uuid;
  v_name text := nullif(split_part(trim(coalesce(new.full_name, '')), ' ', 1), '');
  v_conv uuid;
begin
  if new.id in ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002') then
    return new;
  end if;

  select id into v_from from public.profiles where username = 'grabsty' and is_verified;
  if v_from is null or v_from = new.id then
    return new;
  end if;

  -- A welcome message must never be able to fail a signup.
  begin
    insert into public.conversations (buyer_id, seller_id, listing_id)
    values (new.id, v_from, null)
    returning id into v_conv;

    insert into public.messages (conversation_id, sender_id, content, kind)
    values (
      v_conv, v_from,
      'Hi ' || coalesce(v_name, 'there') || E', welcome to Grabsty! 🛍️\n\n'
        || E'We''re really glad you''re here. Find something you love, or list what you don''t wear anymore and make some space (and money).\n\n'
        || E'If you ever get stuck, just reply here and we''ll help.\n\nHappy shopping!\nThe Grabsty team',
      'text'
    );
  exception when others then
    raise warning '[welcome-dm] failed for %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;
revoke all on function public.send_welcome_dm() from public, anon, authenticated;

create trigger send_welcome_dm after insert on public.profiles
  for each row execute function public.send_welcome_dm();
