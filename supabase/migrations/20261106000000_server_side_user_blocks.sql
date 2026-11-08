-- Blocks lived only in the blocker's AsyncStorage: nothing stopped a blocked user
-- from messaging, offering or buying, and the block vanished on reinstall. They
-- are now rows, enforced here so every client version is covered.
--
-- Product rule: an order already running continues (status updates still post as
-- 'system' messages, and both sides keep seeing its listing). Free-text chat, new
-- offers, new purchases and follows stop, in both directions.

create table public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  reason text check (char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_id),
  -- Blocking Grabsty Support would strand someone without help on a dispute.
  constraint user_blocks_not_support check (blocked_id <> '00000000-0000-0000-0000-000000000001')
);
create index user_blocks_blocked_id_idx on public.user_blocks (blocked_id);

alter table public.user_blocks enable row level security;
create policy user_blocks_select_own on public.user_blocks
  for select to authenticated using ((select auth.uid()) = blocker_id);
create policy user_blocks_insert_own on public.user_blocks
  for insert to authenticated with check ((select auth.uid()) = blocker_id);
create policy user_blocks_delete_own on public.user_blocks
  for delete to authenticated using ((select auth.uid()) = blocker_id);

revoke all on public.user_blocks from anon, authenticated;
grant select, insert, delete on public.user_blocks to authenticated;

-- Everyone the caller is separated from, in either direction. Lets a client tell
-- "they blocked me" for the composer banner, and is what the listings policy reads.
create function public.my_block_peers() returns uuid[]
language sql stable security definer set search_path to '' as $$
  select coalesce(array_agg(peer), '{}'::uuid[]) from (
    select blocked_id as peer from public.user_blocks where blocker_id = auth.uid()
    union
    select blocker_id from public.user_blocks where blocked_id = auth.uid()
  ) s;
$$;
revoke all on function public.my_block_peers() from public;
grant execute on function public.my_block_peers() to anon, authenticated, service_role;

create function public.users_blocked(p_a uuid, p_b uuid) returns boolean
language sql stable security definer set search_path to '' as $$
  select exists (
    select 1 from public.user_blocks
     where (blocker_id = p_a and blocked_id = p_b)
        or (blocker_id = p_b and blocked_id = p_a)
  );
$$;
revoke all on function public.users_blocked(uuid, uuid) from public;

-- Messages: 'system' rows are order updates and must keep flowing.
create function public.guard_blocked_message() returns trigger
language plpgsql security definer set search_path to '' as $$
declare
  v_other uuid;
begin
  if new.kind = 'system' then
    return new;
  end if;
  select case when c.buyer_id = new.sender_id then c.seller_id else c.buyer_id end
    into v_other
    from public.conversations c
   where c.id = new.conversation_id;
  if v_other is not null and public.users_blocked(new.sender_id, v_other) then
    raise exception 'You can''t message this user' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger guard_blocked_message before insert on public.messages
  for each row execute function public.guard_blocked_message();

create function public.guard_blocked_conversation() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if public.users_blocked(new.buyer_id, new.seller_id) then
    raise exception 'You can''t message this user' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger guard_blocked_conversation before insert on public.conversations
  for each row execute function public.guard_blocked_conversation();

create function public.guard_blocked_follow() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if public.users_blocked(new.follower_id, new.followee_id) then
    raise exception 'You can''t follow this user' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger guard_blocked_follow before insert on public.user_follows
  for each row execute function public.guard_blocked_follow();

-- New orders. auth.uid() is null for service-role writers (the Stripe webhook),
-- which record money already taken and must never be refused here. The vacation
-- check lives here too: feeds hide those listings, but a direct link did not.
create function public.guard_new_order() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if public.users_blocked(new.buyer_id, new.seller_id) then
    raise exception 'This item is no longer available' using errcode = '42501';
  end if;
  if coalesce((select vacation_mode from public.profiles where id = new.seller_id), false) then
    raise exception 'This seller is away right now, so this item can''t be bought yet' using errcode = '22000';
  end if;
  return new;
end;
$$;
create trigger guard_new_order before insert on public.orders
  for each row execute function public.guard_new_order();

-- Blocking ends everything still open between the pair, so an unblock later can't
-- revive a stale accepted price. Offers on an item already sold are history (the
-- live order keeps its accepted offer) and are left alone.
create function public.on_user_blocked() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  delete from public.user_follows
   where (follower_id = new.blocker_id and followee_id = new.blocked_id)
      or (follower_id = new.blocked_id and followee_id = new.blocker_id);

  perform set_config('ceranix.in_accept_offer', 'on', true);
  update public.messages m
     set offer_status = 'declined'
    from public.conversations c
    left join public.listings l on l.id = c.listing_id
   where m.conversation_id = c.id
     and m.kind = 'offer'
     and m.offer_status in ('proposed', 'pending', 'accepted')
     and coalesce(l.is_sold, false) = false
     and ((c.buyer_id = new.blocker_id and c.seller_id = new.blocked_id)
       or (c.buyer_id = new.blocked_id and c.seller_id = new.blocker_id));
  perform set_config('ceranix.in_accept_offer', 'off', true);

  update public.offers o
     set status = 'declined', updated_at = now()
    from public.listings l
   where l.id = o.listing_id
     and not l.is_sold
     and o.status in ('proposed', 'pending', 'accepted')
     and ((o.buyer_id = new.blocker_id and o.seller_id = new.blocked_id)
       or (o.buyer_id = new.blocked_id and o.seller_id = new.blocker_id));
  return null;
end;
$$;
create trigger on_user_blocked after insert on public.user_blocks
  for each row execute function public.on_user_blocked();

revoke all on function public.guard_blocked_message() from public;
revoke all on function public.guard_blocked_conversation() from public;
revoke all on function public.guard_blocked_follow() from public;
revoke all on function public.guard_new_order() from public;
revoke all on function public.on_user_blocked() from public;

-- Listings disappear both ways, which also covers every feed, search and
-- invoker-rights RPC at once. The peers array is an initplan (evaluated once per
-- query), and an order's parties always keep seeing its listings or the order
-- screens would break.
alter policy "Listings viewable by everyone" on public.listings
  rename to "Listings viewable unless blocked";
alter policy "Listings viewable unless blocked" on public.listings
  using (
    not (seller_id = any ((select public.my_block_peers())::uuid[]))
    or exists (
      select 1 from public.orders o
       where (o.listing_id = listings.id or listings.id = any (coalesce(o.bundle_item_ids, '{}'::uuid[])))
         and ((select auth.uid()) in (o.buyer_id, o.seller_id))
    )
  );
