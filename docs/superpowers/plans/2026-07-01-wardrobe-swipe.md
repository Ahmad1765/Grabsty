# Wardrobe (Social Style Discovery) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Wardrobe" tab where users post outfit photos (optionally hiding face and/or background) and swipe through others' outfits, one-directionally liking the ones they love.

**Architecture:** New Supabase tables (`wardrobe_posts`, `wardrobe_swipes`) with a likes-count trigger and RLS, mirroring `supabase/follows.sql`. Data logic in `lib/wardrobe.ts` + pure helpers in `lib/wardrobe/deckState.ts`; TanStack Query hooks + `qk` keys added to `lib/queries.ts` (the app's established split). A custom reanimated/gesture-handler swipe deck. The "hide myself" toggles reuse an extended `lib/photoClean` (`cleanPhoto` gains an options arg). New tab registered in `app/(tabs)/_layout.tsx` + `components/AnimatedTabBar.tsx`.

**Tech Stack:** Expo 54 / React Native 0.79 / React 19, TypeScript, NativeWind 4, Supabase (`@/lib/supabase`), TanStack Query, react-native-reanimated + react-native-gesture-handler, vitest (unit), Playwright (e2e). Supabase project: `ttxestvncdynsssmjqhk`.

## Global Constraints

- **Reuse, don't rebuild `lib/photoClean`.** Extend `cleanPhoto` with an optional `options` arg; the existing Sell upload calls it with no options and MUST keep behaving exactly as today (`{ blurFace: true, removeBackground: true }`).
- **No `@imgly/background-removal`** anywhere (AGPL).
- **RLS on every new table**, mirroring `supabase/follows.sql`: public/any-authed `select` for posts; owner-only writes; swipes are owner-only for all ops. Wrap `auth.uid()` as `(select auth.uid())` in policies (advisor perf pattern).
- **Cleaning stays best-effort** — a failed clean never blocks posting (same fallback contract as the existing pipeline).
- **v1 scope (do NOT build):** mutual matching, chat unlock, shop-the-look/listing links, multiple photos per post, "who liked" lists, comments, moderation UI.
- **Follow existing patterns:** data fetchers live in `lib/wardrobe.ts` (like `lib/listings.ts`); TanStack hooks + `qk` keys go in `lib/queries.ts`; storage uses the `lib/upload.ts` compression pipeline; UI uses `components/ui/Tabs`, `lib/theme` colors, and the toast (`useToast`).
- **Test env:** vitest runs in Node (no DOM/WASM) — only pure modules are unit-tested; canvas/reanimated/Supabase pieces are verified by typecheck + Playwright + manual.
- **Web-first for the hide toggles:** on native, `cleanPhoto` is still the no-op stub, so posting works but the image is un-hidden until the separate native photoClean work lands. Do not block native posting.

---

## Task 1: Database — tables, RLS, trigger, storage bucket

**Files:**
- Create: `supabase/wardrobe.sql` (repo record, mirrors `supabase/follows.sql` style)
- Apply: via Supabase MCP `apply_migration` (name `wardrobe`) to project `ttxestvncdynsssmjqhk`

**Interfaces:**
- Consumes: existing `public.profiles(id)`.
- Produces: tables `public.wardrobe_posts`, `public.wardrobe_swipes`; column `wardrobe_posts.likes_count`; storage bucket `wardrobe-images`.

- [ ] **Step 1: Write `supabase/wardrobe.sql`**

```sql
-- Grabsty — wardrobe (social style discovery). Mirrors follows.sql patterns.
-- Idempotent: safe to re-run.

-- ── posts ────────────────────────────────────────────────────────────────
create table if not exists public.wardrobe_posts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.profiles(id) on delete cascade not null,
  image_url    text not null,
  caption      text,
  tags         text[] not null default '{}',
  face_hidden  boolean not null default false,
  bg_removed   boolean not null default false,
  likes_count  integer not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists wardrobe_posts_user_idx on public.wardrobe_posts (user_id);
create index if not exists wardrobe_posts_created_idx on public.wardrobe_posts (created_at desc);

alter table public.wardrobe_posts enable row level security;

drop policy if exists "Wardrobe posts are viewable by everyone" on public.wardrobe_posts;
create policy "Wardrobe posts are viewable by everyone"
  on public.wardrobe_posts for select using (true);

drop policy if exists "Users insert their own wardrobe posts" on public.wardrobe_posts;
create policy "Users insert their own wardrobe posts"
  on public.wardrobe_posts for insert with check ((select auth.uid()) = user_id);

drop policy if exists "Users update their own wardrobe posts" on public.wardrobe_posts;
create policy "Users update their own wardrobe posts"
  on public.wardrobe_posts for update using ((select auth.uid()) = user_id);

drop policy if exists "Users delete their own wardrobe posts" on public.wardrobe_posts;
create policy "Users delete their own wardrobe posts"
  on public.wardrobe_posts for delete using ((select auth.uid()) = user_id);

-- ── swipes ───────────────────────────────────────────────────────────────
create table if not exists public.wardrobe_swipes (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid references public.wardrobe_posts(id) on delete cascade not null,
  user_id    uuid references public.profiles(id) on delete cascade not null,
  direction  text not null check (direction in ('like','pass')),
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);
create index if not exists wardrobe_swipes_user_idx on public.wardrobe_swipes (user_id);
create index if not exists wardrobe_swipes_post_idx on public.wardrobe_swipes (post_id);

alter table public.wardrobe_swipes enable row level security;

drop policy if exists "Users read their own swipes" on public.wardrobe_swipes;
create policy "Users read their own swipes"
  on public.wardrobe_swipes for select using ((select auth.uid()) = user_id);

drop policy if exists "Users insert their own swipes" on public.wardrobe_swipes;
create policy "Users insert their own swipes"
  on public.wardrobe_swipes for insert with check ((select auth.uid()) = user_id);

drop policy if exists "Users update their own swipes" on public.wardrobe_swipes;
create policy "Users update their own swipes"
  on public.wardrobe_swipes for update using ((select auth.uid()) = user_id);

drop policy if exists "Users delete their own swipes" on public.wardrobe_swipes;
create policy "Users delete their own swipes"
  on public.wardrobe_swipes for delete using ((select auth.uid()) = user_id);

-- ── likes_count trigger ───────────────────────────────────────────────────
create or replace function public.handle_wardrobe_swipe_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (tg_op = 'INSERT') then
    if new.direction = 'like' then
      update public.wardrobe_posts set likes_count = likes_count + 1 where id = new.post_id;
    end if;
    return new;
  elsif (tg_op = 'UPDATE') then
    if old.direction = 'like' and new.direction <> 'like' then
      update public.wardrobe_posts set likes_count = greatest(likes_count - 1, 0) where id = new.post_id;
    elsif old.direction <> 'like' and new.direction = 'like' then
      update public.wardrobe_posts set likes_count = likes_count + 1 where id = new.post_id;
    end if;
    return new;
  elsif (tg_op = 'DELETE') then
    if old.direction = 'like' then
      update public.wardrobe_posts set likes_count = greatest(likes_count - 1, 0) where id = old.post_id;
    end if;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists on_wardrobe_swipe_change on public.wardrobe_swipes;
create trigger on_wardrobe_swipe_change
  after insert or update or delete on public.wardrobe_swipes
  for each row execute procedure public.handle_wardrobe_swipe_change();

revoke execute on function public.handle_wardrobe_swipe_change() from public, anon, authenticated;

-- ── storage bucket ─────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('wardrobe-images', 'wardrobe-images', true)
on conflict (id) do nothing;

drop policy if exists "Wardrobe images are publicly readable" on storage.objects;
create policy "Wardrobe images are publicly readable"
  on storage.objects for select using (bucket_id = 'wardrobe-images');

drop policy if exists "Users upload wardrobe images to their folder" on storage.objects;
create policy "Users upload wardrobe images to their folder"
  on storage.objects for insert
  with check (
    bucket_id = 'wardrobe-images'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users delete their own wardrobe images" on storage.objects;
create policy "Users delete their own wardrobe images"
  on storage.objects for delete
  using (
    bucket_id = 'wardrobe-images'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );
```

- [ ] **Step 2: Apply the migration**

Use the Supabase MCP tool `apply_migration` with `project_id: "ttxestvncdynsssmjqhk"`, `name: "wardrobe"`, and `query` = the full SQL above.
Expected: success, no error.

- [ ] **Step 3: Verify**

Use MCP `list_tables` (schema `public`) → confirm `wardrobe_posts` and `wardrobe_swipes` exist with the columns above.
Use MCP `get_advisors` (type `security`) → confirm no new RLS-disabled or policy warnings for the two tables.

- [ ] **Step 4: Commit**

```bash
git add supabase/wardrobe.sql
git commit -m "feat(wardrobe): add posts/swipes tables, likes trigger, RLS, storage bucket"
```

---

## Task 2: Pure deck helpers

**Files:**
- Create: `lib/wardrobe/deckState.ts`
- Test: `lib/wardrobe/deckState.test.ts`

**Interfaces:**
- Consumes: `WardrobePost` (declared here as a local structural type to avoid a cycle; Task 3 re-exports the canonical one — keep the fields identical).
- Produces:
  - `type DeckCard = { id: string }` (structural minimum the helpers need)
  - `filterUnseen<T extends { id: string }>(posts: T[], seenIds: Set<string>): T[]`
  - `dedupeById<T extends { id: string }>(posts: T[]): T[]`
  - `needsMore(remaining: number, threshold?: number): boolean` (default threshold 3)

- [ ] **Step 1: Write the failing test**

```ts
// lib/wardrobe/deckState.test.ts
import { describe, it, expect } from 'vitest';
import { filterUnseen, dedupeById, needsMore } from '@/lib/wardrobe/deckState';

describe('filterUnseen', () => {
  it('removes posts whose id is in the seen set', () => {
    const posts = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(filterUnseen(posts, new Set(['b']))).toEqual([{ id: 'a' }, { id: 'c' }]);
  });
  it('returns all posts when nothing is seen', () => {
    const posts = [{ id: 'a' }];
    expect(filterUnseen(posts, new Set())).toEqual([{ id: 'a' }]);
  });
});

describe('dedupeById', () => {
  it('keeps the first occurrence of each id, preserving order', () => {
    const posts = [{ id: 'a' }, { id: 'b' }, { id: 'a' }, { id: 'c' }];
    expect(dedupeById(posts)).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  });
});

describe('needsMore', () => {
  it('is true at or below the threshold, false above', () => {
    expect(needsMore(3)).toBe(true);
    expect(needsMore(4)).toBe(false);
    expect(needsMore(0)).toBe(true);
    expect(needsMore(2, 1)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/wardrobe/deckState.test.ts`
Expected: FAIL — cannot resolve `@/lib/wardrobe/deckState`.

- [ ] **Step 3: Implement**

```ts
// lib/wardrobe/deckState.ts
// Pure helpers for the swipe deck — no React, no Supabase, unit-tested.

export function filterUnseen<T extends { id: string }>(posts: T[], seenIds: Set<string>): T[] {
  return posts.filter((p) => !seenIds.has(p.id));
}

export function dedupeById<T extends { id: string }>(posts: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const p of posts) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

// When the remaining card count drops to/below the threshold, the deck should
// prefetch the next page.
export function needsMore(remaining: number, threshold = 3): boolean {
  return remaining <= threshold;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/wardrobe/deckState.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/wardrobe/deckState.ts lib/wardrobe/deckState.test.ts
git commit -m "feat(wardrobe): add pure deck helpers (filterUnseen, dedupeById, needsMore)"
```

---

## Task 3: Data layer — `lib/wardrobe.ts`

**Files:**
- Create: `lib/wardrobe.ts`
- Reference (read, do not modify): `lib/upload.ts` (compression + `uploadOne` pattern), `lib/listings.ts` (supabase fetch style)

**Interfaces:**
- Consumes: `supabase` from `@/lib/supabase`; `LocalImage`, and the private compression from `lib/upload.ts` — since `uploadOne`/`compressImage` are not exported, this task adds an exported `uploadWardrobeImage` to `lib/upload.ts` reusing its internals (see Step 1). `filterUnseen`/`dedupeById` from `./wardrobe/deckState`.
- Produces:
  - `type SwipeDirection = 'like' | 'pass'`
  - `interface WardrobePost { id: string; user_id: string; image_url: string; caption: string | null; tags: string[]; face_hidden: boolean; bg_removed: boolean; likes_count: number; created_at: string; author?: { username: string; avatar_url: string | null } }`
  - `uploadWardrobeImage(image: LocalImage, userId: string): Promise<string>` (exported from `lib/upload.ts`)
  - `createWardrobePost(args: { userId: string; imageUrl: string; caption: string | null; tags: string[]; faceHidden: boolean; bgRemoved: boolean }): Promise<WardrobePost>`
  - `deleteWardrobePost(id: string): Promise<void>`
  - `fetchDeck(userId: string, limit?: number): Promise<WardrobePost[]>`
  - `recordSwipe(postId: string, userId: string, direction: SwipeDirection): Promise<void>`
  - `fetchMyWardrobe(userId: string): Promise<WardrobePost[]>`
  - `fetchLikedWardrobe(userId: string): Promise<WardrobePost[]>`

- [ ] **Step 1: Add `uploadWardrobeImage` to `lib/upload.ts`**

At the end of `lib/upload.ts`, add (reusing the existing private `compressImage`/`uploadOne` and the `LISTING_MAX_EDGE`/`LISTING_QUALITY` constants already in the file):

```ts
export async function uploadWardrobeImage(image: LocalImage, userId: string): Promise<string> {
  const compressed = await compressImage(image, LISTING_MAX_EDGE, LISTING_QUALITY);
  return uploadOne('wardrobe-images', compressed, userId, 0);
}
```

- [ ] **Step 2: Write `lib/wardrobe.ts`**

```ts
// lib/wardrobe.ts — data logic for the wardrobe feature (Supabase reads/writes).
// Mirrors lib/listings.ts style. TanStack hooks that wrap these live in
// lib/queries.ts.
import { supabase } from '@/lib/supabase';
import { filterUnseen, dedupeById } from '@/lib/wardrobe/deckState';

export type SwipeDirection = 'like' | 'pass';

export interface WardrobePost {
  id: string;
  user_id: string;
  image_url: string;
  caption: string | null;
  tags: string[];
  face_hidden: boolean;
  bg_removed: boolean;
  likes_count: number;
  created_at: string;
  author?: { username: string; avatar_url: string | null };
}

const POST_SELECT =
  'id, user_id, image_url, caption, tags, face_hidden, bg_removed, likes_count, created_at, author:profiles!wardrobe_posts_user_id_fkey(username, avatar_url)';

// Normalize the joined author (supabase returns it as an array for !fk embeds
// in some shapes) to a single object | undefined.
function normalize(row: any): WardrobePost {
  const a = Array.isArray(row.author) ? row.author[0] : row.author;
  return { ...row, author: a ?? undefined } as WardrobePost;
}

export async function createWardrobePost(args: {
  userId: string;
  imageUrl: string;
  caption: string | null;
  tags: string[];
  faceHidden: boolean;
  bgRemoved: boolean;
}): Promise<WardrobePost> {
  const { data, error } = await supabase
    .from('wardrobe_posts')
    .insert({
      user_id: args.userId,
      image_url: args.imageUrl,
      caption: args.caption,
      tags: args.tags,
      face_hidden: args.faceHidden,
      bg_removed: args.bgRemoved,
    })
    .select(POST_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return normalize(data);
}

export async function deleteWardrobePost(id: string): Promise<void> {
  const { error } = await supabase.from('wardrobe_posts').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// Deck: newest posts that are not mine and I have not swiped yet. We fetch a
// window of recent posts (excluding my own via SQL) plus my swiped ids, then
// filter unseen in JS (small v1 volume; keeps a pure, testable boundary).
export async function fetchDeck(userId: string, limit = 20): Promise<WardrobePost[]> {
  const [postsRes, swipesRes] = await Promise.all([
    supabase
      .from('wardrobe_posts')
      .select(POST_SELECT)
      .neq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit * 3),
    supabase.from('wardrobe_swipes').select('post_id').eq('user_id', userId),
  ]);
  if (postsRes.error) throw new Error(postsRes.error.message);
  if (swipesRes.error) throw new Error(swipesRes.error.message);
  const seen = new Set((swipesRes.data ?? []).map((r: any) => r.post_id as string));
  const posts = dedupeById((postsRes.data ?? []).map(normalize));
  return filterUnseen(posts, seen).slice(0, limit);
}

export async function recordSwipe(
  postId: string,
  userId: string,
  direction: SwipeDirection,
): Promise<void> {
  // upsert so a re-swipe on the same post updates direction (and the trigger
  // reconciles likes_count) instead of erroring on the unique(post_id,user_id).
  const { error } = await supabase
    .from('wardrobe_swipes')
    .upsert(
      { post_id: postId, user_id: userId, direction },
      { onConflict: 'post_id,user_id' },
    );
  if (error) throw new Error(error.message);
}

export async function fetchMyWardrobe(userId: string): Promise<WardrobePost[]> {
  const { data, error } = await supabase
    .from('wardrobe_posts')
    .select(POST_SELECT)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(normalize);
}

export async function fetchLikedWardrobe(userId: string): Promise<WardrobePost[]> {
  const { data, error } = await supabase
    .from('wardrobe_swipes')
    .select(`post:wardrobe_posts(${POST_SELECT})`)
    .eq('user_id', userId)
    .eq('direction', 'like')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((r: any) => (Array.isArray(r.post) ? r.post[0] : r.post))
    .filter(Boolean)
    .map(normalize);
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add lib/wardrobe.ts lib/upload.ts
git commit -m "feat(wardrobe): add data layer (deck, swipe, create/delete, my/liked) + wardrobe upload"
```

---

## Task 4: TanStack Query hooks

**Files:**
- Modify: `lib/queries.ts` (add `qk` keys + hooks at the end)

**Interfaces:**
- Consumes: `fetchDeck`, `recordSwipe`, `createWardrobePost`, `deleteWardrobePost`, `fetchMyWardrobe`, `fetchLikedWardrobe`, `WardrobePost`, `SwipeDirection` from `@/lib/wardrobe`.
- Produces (added to `qk` and exported hooks):
  - `qk.wardrobeDeck(userId)`, `qk.myWardrobe(userId)`, `qk.likedWardrobe(userId)`
  - `useWardrobeDeckQuery(userId: string | null)`
  - `useMyWardrobeQuery(userId: string | null)`
  - `useLikedWardrobeQuery(userId: string | null)`
  - `useRecordSwipe(userId: string | null)` → mutation with vars `{ postId: string; direction: SwipeDirection }`
  - `useCreateWardrobePost(userId: string | null)`
  - `useDeleteWardrobePost(userId: string | null)`

- [ ] **Step 1: Add imports + `qk` keys**

At the top of `lib/queries.ts`, add to the imports:
```ts
import {
  fetchDeck,
  recordSwipe,
  createWardrobePost,
  deleteWardrobePost,
  fetchMyWardrobe,
  fetchLikedWardrobe,
  type WardrobePost,
  type SwipeDirection,
} from '@/lib/wardrobe';
```
Add to the `qk` object:
```ts
  wardrobeDeck: (userId: string | null) => ['wardrobeDeck', userId] as const,
  myWardrobe: (userId: string | null) => ['myWardrobe', userId] as const,
  likedWardrobe: (userId: string | null) => ['likedWardrobe', userId] as const,
```

- [ ] **Step 2: Add the hooks at the end of `lib/queries.ts`**

```ts
// ── Wardrobe ────────────────────────────────────────────────────────────────
export function useWardrobeDeckQuery(userId: string | null) {
  return useQuery({
    queryKey: qk.wardrobeDeck(userId),
    enabled: !!userId,
    queryFn: (): Promise<WardrobePost[]> => fetchDeck(userId as string),
  });
}

export function useMyWardrobeQuery(userId: string | null) {
  return useQuery({
    queryKey: qk.myWardrobe(userId),
    enabled: !!userId,
    queryFn: (): Promise<WardrobePost[]> => fetchMyWardrobe(userId as string),
  });
}

export function useLikedWardrobeQuery(userId: string | null) {
  return useQuery({
    queryKey: qk.likedWardrobe(userId),
    enabled: !!userId,
    queryFn: (): Promise<WardrobePost[]> => fetchLikedWardrobe(userId as string),
  });
}

// Record a swipe. The deck screen removes the card optimistically on its own;
// this mutation just persists and, on success, refreshes the Liked list.
export function useRecordSwipe(userId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, direction }: { postId: string; direction: SwipeDirection }) =>
      recordSwipe(postId, userId as string, direction),
    onSuccess: (_r, { direction }) => {
      if (direction === 'like') qc.invalidateQueries({ queryKey: qk.likedWardrobe(userId) });
    },
  });
}

export function useCreateWardrobePost(userId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      imageUrl: string;
      caption: string | null;
      tags: string[];
      faceHidden: boolean;
      bgRemoved: boolean;
    }) => createWardrobePost({ userId: userId as string, ...args }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.myWardrobe(userId) }),
  });
}

export function useDeleteWardrobePost(userId: string | null) {
  const qc = useQueryClient();
  const key = qk.myWardrobe(userId);
  return useMutation({
    mutationFn: (id: string) => deleteWardrobePost(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<WardrobePost[]>(key);
      qc.setQueryData<WardrobePost[]>(key, (old) => (old ?? []).filter((p) => p.id !== id));
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
  });
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add lib/queries.ts
git commit -m "feat(wardrobe): add TanStack Query hooks + query keys"
```

---

## Task 5: Extend `lib/photoClean` with hide options

**Files:**
- Create: `lib/photoClean/options.ts`
- Test: `lib/photoClean/options.test.ts`
- Modify: `lib/photoClean/types.ts`, `lib/photoClean/index.ts`, `lib/photoClean/index.native.ts`, `lib/photoClean/index.web.ts`

**Interfaces:**
- Consumes: existing `CleanInput`, `CleanResult`.
- Produces:
  - `type CleanOptions = { blurFace?: boolean; removeBackground?: boolean }` (in `types.ts`)
  - `resolveCleanOptions(o?: CleanOptions): { blurFace: boolean; removeBackground: boolean }` (in `options.ts`; defaults both `true`)
  - `cleanPhoto(input: CleanInput, options?: CleanOptions): Promise<CleanResult>` (all three index files)

- [ ] **Step 1: Write the failing test**

```ts
// lib/photoClean/options.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCleanOptions } from '@/lib/photoClean/options';

describe('resolveCleanOptions', () => {
  it('defaults both to true (preserves existing listing behavior)', () => {
    expect(resolveCleanOptions()).toEqual({ blurFace: true, removeBackground: true });
    expect(resolveCleanOptions({})).toEqual({ blurFace: true, removeBackground: true });
  });
  it('respects explicit falses independently', () => {
    expect(resolveCleanOptions({ removeBackground: false })).toEqual({ blurFace: true, removeBackground: false });
    expect(resolveCleanOptions({ blurFace: false })).toEqual({ blurFace: false, removeBackground: true });
    expect(resolveCleanOptions({ blurFace: false, removeBackground: false })).toEqual({ blurFace: false, removeBackground: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/photoClean/options.test.ts`
Expected: FAIL — cannot resolve `@/lib/photoClean/options`.

- [ ] **Step 3: Add the type + implement `options.ts`**

In `lib/photoClean/types.ts`, add:
```ts
export type CleanOptions = { blurFace?: boolean; removeBackground?: boolean };
```

Create `lib/photoClean/options.ts`:
```ts
import type { CleanOptions } from './types';

// Defaults keep the original behavior (remove background + blur face) so the
// existing Sell upload, which passes no options, is unchanged.
export function resolveCleanOptions(o?: CleanOptions): { blurFace: boolean; removeBackground: boolean } {
  return { blurFace: o?.blurFace ?? true, removeBackground: o?.removeBackground ?? true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/photoClean/options.test.ts`
Expected: PASS.

- [ ] **Step 5: Thread `options` through the entry points**

`lib/photoClean/index.ts` (default stub):
```ts
import type { CleanInput, CleanResult, CleanOptions } from './types';

export async function cleanPhoto(input: CleanInput, _options?: CleanOptions): Promise<CleanResult> {
  return { uri: input.uri, base64: input.base64 ?? null, faceCount: 0, ok: false };
}
```

`lib/photoClean/index.native.ts` (native no-op — keep inlined per prior fix):
```ts
import type { CleanInput, CleanResult, CleanOptions } from './types';

// Native no-op fallback until the native pipeline lands. Inlined (not re-exported
// from './index') because Metro resolves './index' platform-first back to this
// file. Returns ok:false so callers fall back to the original image.
export async function cleanPhoto(input: CleanInput, _options?: CleanOptions): Promise<CleanResult> {
  return { uri: input.uri, base64: input.base64 ?? null, faceCount: 0, ok: false };
}
```

`lib/photoClean/index.web.ts` — update the signature + gate the two stages. Change the `run` signature and `cleanPhoto` signature to take options, and use `resolveCleanOptions`:

At the top, add the import:
```ts
import { resolveCleanOptions } from './options';
import type { CleanOptions } from './types';
```
Change `run` to accept resolved flags and gate compositing. Replace the background-composite block so that when `removeBackground` is false it draws the original image instead of the white/masked composite, and skip segmentation entirely in that case:
```ts
async function run(
  input: CleanInput,
  flags: { blurFace: boolean; removeBackground: boolean },
): Promise<CleanResult> {
  const src = input.base64 ? `data:image/jpeg;base64,${input.base64}` : input.uri;
  const img = await loadImage(src);

  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  const scale = longest > MAX_EDGE ? MAX_EDGE / longest : 1;
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);

  const base = document.createElement('canvas');
  base.width = w;
  base.height = h;
  const bctx = base.getContext('2d')!;
  bctx.drawImage(img, 0, 0, w, h);

  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const octx = out.getContext('2d')!;

  if (flags.removeBackground) {
    const segmenter = await getSegmenter();
    const segImg = bctx.getImageData(0, 0, w, h);
    const seg = segmenter.segment(base);
    const conf = seg.confidenceMasks?.[0]?.getAsFloat32Array();
    seg.close();
    if (conf) {
      for (let i = 0; i < conf.length; i++) {
        if (conf[i] < FG_THRESHOLD) segImg.data[i * 4 + 3] = 0;
      }
    }
    octx.fillStyle = '#FFFFFF';
    octx.fillRect(0, 0, w, h);
    const scratch = document.createElement('canvas');
    scratch.width = w;
    scratch.height = h;
    scratch.getContext('2d')!.putImageData(segImg, 0, 0);
    octx.drawImage(scratch, 0, 0);
  } else {
    // Keep the real photo untouched underneath any face blur.
    octx.drawImage(base, 0, 0);
  }

  let faceCount = 0;
  if (flags.blurFace) {
    const faceDetector = await getFaceDetector();
    const faces = faceDetector.detect(base);
    const boxes: FaceBox[] = (faces.detections ?? []).map((d) => ({
      x: d.boundingBox!.originX,
      y: d.boundingBox!.originY,
      width: d.boundingBox!.width,
      height: d.boundingBox!.height,
    }));
    faceCount = boxes.length;
    for (const raw of boxes) {
      const b = expandFaceBox(raw, w, h);
      if (b.width <= 0 || b.height <= 0) continue;
      octx.save();
      octx.filter = `blur(${BLUR_PX}px)`;
      octx.beginPath();
      octx.rect(b.x, b.y, b.width, b.height);
      octx.clip();
      octx.drawImage(out, 0, 0);
      octx.restore();
    }
  }

  const dataUrl = out.toDataURL('image/jpeg', 0.85);
  const comma = dataUrl.indexOf(',');
  return {
    uri: dataUrl,
    base64: comma >= 0 ? dataUrl.slice(comma + 1) : null,
    faceCount,
    ok: true,
  };
}

export async function cleanPhoto(input: CleanInput, options?: CleanOptions): Promise<CleanResult> {
  const flags = resolveCleanOptions(options);
  try {
    return await withTimeout(run(input, flags), TIMEOUT_MS);
  } catch (e) {
    console.warn('[photoClean] web clean failed; using original', e);
    return { uri: input.uri, base64: input.base64 ?? null, faceCount: 0, ok: false };
  }
}
```

- [ ] **Step 6: Typecheck + unit tests**

Run: `npm run typecheck && npm test`
Expected: zero type errors; all unit tests pass (existing 90+ including the new options test). The Sell upload still calls `cleanPhoto(input)` with no options, so its behavior is unchanged.

- [ ] **Step 7: Commit**

```bash
git add lib/photoClean/options.ts lib/photoClean/options.test.ts lib/photoClean/types.ts lib/photoClean/index.ts lib/photoClean/index.native.ts lib/photoClean/index.web.ts
git commit -m "feat(photoClean): add independent blurFace/removeBackground options"
```

---

## Task 6: Wardrobe upload screen

**Files:**
- Create: `app/wardrobe/new.tsx`
- Reference: `app/(tabs)/upload.tsx` (picker + slot/preview patterns), `lib/toast`

**Interfaces:**
- Consumes: `cleanPhoto` from `@/lib/photoClean`; `uploadWardrobeImage` from `@/lib/upload`; `useCreateWardrobePost` from `@/lib/queries`; `useAuth` from `@/lib/auth`; `useToast`.
- Produces: a route screen (default export) at `/wardrobe/new`.

- [ ] **Step 1: Implement the screen**

```tsx
// app/wardrobe/new.tsx — post an outfit to your wardrobe, optionally hiding
// your face and/or the background (web: real processing; native: no-op today).
import { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { RequireAuth } from '@/components/RequireAuth';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { cleanPhoto } from '@/lib/photoClean';
import { uploadWardrobeImage, type LocalImage } from '@/lib/upload';
import { useCreateWardrobePost } from '@/lib/queries';

function NewWardrobeInner() {
  const { user } = useAuth();
  const toast = useToast();
  const createPost = useCreateWardrobePost(user?.id ?? null);

  const [original, setOriginal] = useState<LocalImage | null>(null);
  const [preview, setPreview] = useState<LocalImage | null>(null); // processed (or original)
  const [blurFace, setBlurFace] = useState(false);
  const [removeBg, setRemoveBg] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [caption, setCaption] = useState('');
  const [posting, setPosting] = useState(false);

  const pick = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      base64: true,
    });
    if (res.canceled) return;
    const img = { uri: res.assets[0].uri, base64: res.assets[0].base64 ?? null };
    setOriginal(img);
    setBlurFace(false);
    setRemoveBg(false);
    setPreview(img);
  };

  // Re-run cleaning whenever a toggle changes. If both are off, show the original.
  const reprocess = async (nextBlur: boolean, nextBg: boolean) => {
    if (!original) return;
    if (!nextBlur && !nextBg) {
      setPreview(original);
      return;
    }
    setProcessing(true);
    try {
      const r = await cleanPhoto(original, { blurFace: nextBlur, removeBackground: nextBg });
      setPreview(r.ok ? { uri: r.uri, base64: r.base64 } : original);
      if (!r.ok) toast.show('Could not hide on this device; posting original', { variant: 'info' });
    } finally {
      setProcessing(false);
    }
  };

  const toggleBlur = () => { const n = !blurFace; setBlurFace(n); reprocess(n, removeBg); };
  const toggleBg = () => { const n = !removeBg; setRemoveBg(n); reprocess(blurFace, n); };

  const post = async () => {
    if (!user || !original || !preview) return;
    setPosting(true);
    try {
      const url = await uploadWardrobeImage(preview, user.id);
      await createPost.mutateAsync({
        imageUrl: url,
        caption: caption.trim() || null,
        tags: [],
        faceHidden: blurFace,
        bgRemoved: removeBg,
      });
      toast.show('Posted to your wardrobe', { variant: 'success', icon: 'check' });
      router.back();
    } catch (e: any) {
      Alert.alert('Could not post', e?.message ?? 'Unknown error');
    } finally {
      setPosting(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-white">
      <View className="flex-row items-center justify-between px-4 pt-3 pb-3">
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Feather name="arrow-left" size={24} color="#0F0F0F" />
        </Pressable>
        <Text style={{ fontSize: 16, fontWeight: '800' }}>New outfit</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
        {!preview ? (
          <Pressable
            onPress={pick}
            style={{ height: 360, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#6C47FF', backgroundColor: 'rgba(108,71,255,0.06)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Feather name="plus" size={28} color="#6C47FF" />
            <Text style={{ marginTop: 8, color: '#6C47FF', fontWeight: '700' }}>Add an outfit photo</Text>
          </Pressable>
        ) : (
          <View style={{ position: 'relative' }}>
            <Image source={{ uri: preview.uri }} style={{ width: '100%', height: 360, borderRadius: 18 }} contentFit="cover" />
            {processing && (
              <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: 18 }}>
                <ActivityIndicator color="#6C47FF" />
              </View>
            )}
          </View>
        )}

        {preview && (
          <>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <ToggleChip label="Blur face" active={blurFace} onPress={toggleBlur} icon="eye-off" />
              <ToggleChip label="Remove background" active={removeBg} onPress={toggleBg} icon="image" />
            </View>
            <TextInput
              value={caption}
              onChangeText={setCaption}
              placeholder="Say something about this fit… (optional)"
              placeholderTextColor="rgba(15,15,15,0.35)"
              style={{ marginTop: 16, borderWidth: 1, borderColor: 'rgba(15,15,15,0.12)', borderRadius: 14, padding: 14, fontSize: 15, minHeight: 60 }}
              multiline
            />
          </>
        )}
      </ScrollView>

      <View className="bg-white border-t border-ink-hair" style={{ padding: 20 }}>
        <Pressable
          onPress={post}
          disabled={!preview || processing || posting}
          style={{ height: 54, borderRadius: 14, backgroundColor: !preview || processing || posting ? 'rgba(15,15,15,0.12)' : '#0F0F0F', alignItems: 'center', justifyContent: 'center' }}
        >
          {posting ? <ActivityIndicator color="#fff" /> : (
            <Text style={{ color: !preview || processing ? 'rgba(15,15,15,0.45)' : '#fff', fontWeight: '800', fontSize: 16 }}>Post outfit</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function ToggleChip({ label, active, onPress, icon }: { label: string; active: boolean; onPress: () => void; icon: keyof typeof Feather.glyphMap }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="switch"
      accessibilityState={{ checked: active }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: active ? '#6C47FF' : 'rgba(15,15,15,0.12)', backgroundColor: active ? 'rgba(108,71,255,0.08)' : '#fff' }}
    >
      <Feather name={icon} size={14} color={active ? '#6C47FF' : 'rgba(15,15,15,0.55)'} />
      <Text style={{ fontSize: 13, fontWeight: '700', color: active ? '#6C47FF' : 'rgba(15,15,15,0.62)' }}>{label}</Text>
    </Pressable>
  );
}

export default function NewWardrobeScreen() {
  return (
    <RequireAuth>
      <NewWardrobeInner />
    </RequireAuth>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: zero errors. (`View style={{ inset: 0 }}` is valid on react-native-web; if the native typecheck rejects `inset`, replace with `position:'absolute', top:0, right:0, bottom:0, left:0`.)

- [ ] **Step 3: Commit**

```bash
git add app/wardrobe/new.tsx
git commit -m "feat(wardrobe): add outfit upload screen with blur-face / remove-bg toggles"
```

---

## Task 7: WardrobeCard (presentational)

**Files:**
- Create: `components/wardrobe/WardrobeCard.tsx`

**Interfaces:**
- Consumes: `WardrobePost` from `@/lib/wardrobe`.
- Produces: `WardrobeCard({ post }: { post: WardrobePost })` — a full-bleed outfit card (image, author, caption, like count).

- [ ] **Step 1: Implement**

```tsx
// components/wardrobe/WardrobeCard.tsx
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import type { WardrobePost } from '@/lib/wardrobe';

export function WardrobeCard({ post }: { post: WardrobePost }) {
  return (
    <View style={{ flex: 1, borderRadius: 24, overflow: 'hidden', backgroundColor: '#F2F2F4' }}>
      <Image source={{ uri: post.image_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 18, backgroundColor: 'rgba(0,0,0,0.28)' }}>
        {!!post.author?.username && (
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>@{post.author.username}</Text>
        )}
        {!!post.caption && (
          <Text numberOfLines={2} style={{ color: 'rgba(255,255,255,0.92)', marginTop: 3, fontSize: 14 }}>{post.caption}</Text>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 }}>
          <Feather name="heart" size={14} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{post.likes_count}</Text>
        </View>
      </View>
    </View>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add components/wardrobe/WardrobeCard.tsx
git commit -m "feat(wardrobe): add WardrobeCard presentational component"
```

---

## Task 8: SwipeDeck (reanimated gesture deck)

**Files:**
- Create: `components/wardrobe/SwipeDeck.tsx`
- Reference: `components/AnimatedTabBar.tsx` (reanimated + gesture-handler usage in this repo)

**Interfaces:**
- Consumes: `WardrobePost`, `SwipeDirection` from `@/lib/wardrobe`; `WardrobeCard`; `needsMore` from `@/lib/wardrobe/deckState`.
- Produces: `SwipeDeck({ posts, onSwipe, onNeedMore }: { posts: WardrobePost[]; onSwipe: (post: WardrobePost, dir: SwipeDirection) => void; onNeedMore: () => void })`.

- [ ] **Step 1: Implement**

```tsx
// components/wardrobe/SwipeDeck.tsx
// Custom Tinder-style deck. The top card follows a horizontal pan; releasing
// past a threshold (or with enough velocity) flings it off and reports a swipe.
// Renders up to 3 stacked cards for depth. Works on web + native (RNGH+reanimated).
import { useEffect } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming, runOnJS, interpolate, Extrapolation,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import type { WardrobePost, SwipeDirection } from '@/lib/wardrobe';
import { needsMore } from '@/lib/wardrobe/deckState';
import { WardrobeCard } from './WardrobeCard';

const SWIPE_OUT = 480;

export function SwipeDeck({
  posts,
  onSwipe,
  onNeedMore,
}: {
  posts: WardrobePost[];
  onSwipe: (post: WardrobePost, dir: SwipeDirection) => void;
  onNeedMore: () => void;
}) {
  const { width } = useWindowDimensions();
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);

  const top = posts[0];
  const under = posts.slice(1, 3);

  useEffect(() => {
    if (needsMore(posts.length)) onNeedMore();
  }, [posts.length, onNeedMore]);

  const commit = (dir: SwipeDirection) => {
    const post = top;
    tx.value = 0; ty.value = 0; // reset for the next card
    if (post) onSwipe(post, dir);
  };

  const pan = Gesture.Pan()
    .onUpdate((e) => { tx.value = e.translationX; ty.value = e.translationY; })
    .onEnd((e) => {
      const past = Math.abs(tx.value) > width * 0.28 || Math.abs(e.velocityX) > 800;
      if (past) {
        const dir: SwipeDirection = tx.value > 0 ? 'like' : 'pass';
        tx.value = withTiming(Math.sign(tx.value) * SWIPE_OUT, { duration: 180 }, (done) => {
          if (done) runOnJS(commit)(dir);
        });
      } else {
        tx.value = withSpring(0); ty.value = withSpring(0);
      }
    });

  const topStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { rotate: `${interpolate(tx.value, [-width, width], [-12, 12], Extrapolation.CLAMP)}deg` },
    ],
  }));
  const likeStyle = useAnimatedStyle(() => ({ opacity: interpolate(tx.value, [0, width * 0.25], [0, 1], Extrapolation.CLAMP) }));
  const passStyle = useAnimatedStyle(() => ({ opacity: interpolate(tx.value, [0, -width * 0.25], [0, 1], Extrapolation.CLAMP) }));

  if (!top) return null;

  return (
    <View style={{ flex: 1 }}>
      {under.reverse().map((p, i) => (
        <Animated.View
          key={p.id}
          style={{ position: 'absolute', inset: 0, transform: [{ scale: 0.94 + i * 0.03 }, { translateY: -(i + 1) * 8 }] }}
        >
          <WardrobeCard post={p} />
        </Animated.View>
      ))}
      <GestureDetector gesture={pan}>
        <Animated.View style={[{ position: 'absolute', inset: 0 }, topStyle]}>
          <WardrobeCard post={top} />
          <Animated.View style={[{ position: 'absolute', top: 24, left: 20, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 10, borderWidth: 3, borderColor: '#22C55E', transform: [{ rotate: '-14deg' }] }, likeStyle]}>
            <Animated.Text style={{ color: '#22C55E', fontWeight: '900', fontSize: 22 }}>LIKE</Animated.Text>
          </Animated.View>
          <Animated.View style={[{ position: 'absolute', top: 24, right: 20, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 10, borderWidth: 3, borderColor: '#EF4444', transform: [{ rotate: '14deg' }] }, passStyle]}>
            <Animated.Text style={{ color: '#EF4444', fontWeight: '900', fontSize: 22 }}>PASS</Animated.Text>
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: zero errors. (If `inset: 0` is rejected by the native types, use explicit `top/right/bottom/left: 0`.)

- [ ] **Step 3: Commit**

```bash
git add components/wardrobe/SwipeDeck.tsx
git commit -m "feat(wardrobe): add reanimated swipe deck"
```

---

## Task 9: WardrobeGrid (My Wardrobe + Liked)

**Files:**
- Create: `components/wardrobe/WardrobeGrid.tsx`

**Interfaces:**
- Consumes: `WardrobePost` from `@/lib/wardrobe`.
- Produces: `WardrobeGrid({ posts, onDelete }: { posts: WardrobePost[]; onDelete?: (id: string) => void })` — a 2-column grid; shows a delete button per tile when `onDelete` is provided.

- [ ] **Step 1: Implement**

```tsx
// components/wardrobe/WardrobeGrid.tsx
import { View, Text, Pressable, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import type { WardrobePost } from '@/lib/wardrobe';

export function WardrobeGrid({ posts, onDelete }: { posts: WardrobePost[]; onDelete?: (id: string) => void }) {
  const { width } = useWindowDimensions();
  const tile = (Math.min(width, 560) - 20 * 2 - 10) / 2;

  if (posts.length === 0) {
    return (
      <View style={{ alignItems: 'center', paddingVertical: 60 }}>
        <Feather name="image" size={28} color="rgba(15,15,15,0.3)" />
        <Text style={{ marginTop: 10, color: 'rgba(15,15,15,0.5)' }}>Nothing here yet</Text>
      </View>
    );
  }

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 20 }}>
      {posts.map((p) => (
        <View key={p.id} style={{ width: tile, height: tile * 1.3, borderRadius: 14, overflow: 'hidden', backgroundColor: '#F2F2F4' }}>
          <Image source={{ uri: p.image_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          <View style={{ position: 'absolute', bottom: 6, left: 6, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Feather name="heart" size={11} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{p.likes_count}</Text>
          </View>
          {onDelete && (
            <Pressable onPress={() => onDelete(p.id)} hitSlop={8} style={{ position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: 999, backgroundColor: 'rgba(15,15,15,0.72)', alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="trash-2" size={13} color="#fff" />
            </Pressable>
          )}
        </View>
      ))}
    </View>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add components/wardrobe/WardrobeGrid.tsx
git commit -m "feat(wardrobe): add WardrobeGrid for My Wardrobe and Liked"
```

---

## Task 10: Wardrobe tab screen + navigation registration

**Files:**
- Create: `app/(tabs)/wardrobe.tsx`
- Modify: `app/(tabs)/_layout.tsx`, `components/AnimatedTabBar.tsx`

**Interfaces:**
- Consumes: `useAuth`; `useWardrobeDeckQuery`, `useMyWardrobeQuery`, `useLikedWardrobeQuery`, `useRecordSwipe`, `useDeleteWardrobePost` from `@/lib/queries`; `SwipeDeck`, `WardrobeGrid`; `Tabs` from `@/components/ui/Tabs`; `filterUnseen` from `@/lib/wardrobe/deckState`.
- Produces: a tab screen (default export). Registers route `wardrobe` in the tab bar.

- [ ] **Step 1: Register the tab in `_layout.tsx`**

In `app/(tabs)/_layout.tsx`, add a screen between `discover` and `upload`:
```tsx
      <Tabs.Screen name="wardrobe" options={{ title: 'Wardrobe' }} />
```

- [ ] **Step 2: Add the icon to `AnimatedTabBar.tsx`**

In the `ICONS` map in `components/AnimatedTabBar.tsx`, add:
```ts
  wardrobe: { outline: 'shirt-outline', filled: 'shirt', ghost: 'WARDROBE' },
```

- [ ] **Step 3: Implement the tab screen**

```tsx
// app/(tabs)/wardrobe.tsx — Swipe / My Wardrobe / Liked.
import { useMemo, useState, useCallback } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { RequireAuth } from '@/components/RequireAuth';
import { useAuth } from '@/lib/auth';
import { Tabs } from '@/components/ui/Tabs';
import { SwipeDeck } from '@/components/wardrobe/SwipeDeck';
import { WardrobeGrid } from '@/components/wardrobe/WardrobeGrid';
import { filterUnseen } from '@/lib/wardrobe/deckState';
import type { WardrobePost, SwipeDirection } from '@/lib/wardrobe';
import {
  useWardrobeDeckQuery, useMyWardrobeQuery, useLikedWardrobeQuery,
  useRecordSwipe, useDeleteWardrobePost,
} from '@/lib/queries';

type Section = 'swipe' | 'mine' | 'liked';

function WardrobeInner() {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const [section, setSection] = useState<Section>('swipe');
  const [swiped, setSwiped] = useState<Set<string>>(new Set());

  const deck = useWardrobeDeckQuery(uid);
  const mine = useMyWardrobeQuery(uid);
  const liked = useLikedWardrobeQuery(uid);
  const recordSwipe = useRecordSwipe(uid);
  const deletePost = useDeleteWardrobePost(uid);

  // Cards not yet swiped in this session (deck refetch may lag the optimistic pop).
  const cards = useMemo(
    () => filterUnseen(deck.data ?? [], swiped),
    [deck.data, swiped],
  );

  const onSwipe = useCallback((post: WardrobePost, dir: SwipeDirection) => {
    setSwiped((prev) => new Set(prev).add(post.id));
    recordSwipe.mutate({ postId: post.id, direction: dir });
  }, [recordSwipe]);

  const onNeedMore = useCallback(() => { deck.refetch(); }, [deck]);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-white">
      <View className="flex-row items-center justify-between px-5 pt-2 pb-3">
        <Text style={{ fontSize: 26, fontWeight: '800', letterSpacing: -0.5 }}>Wardrobe</Text>
        <Pressable onPress={() => router.push('/wardrobe/new')} hitSlop={10} style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: '#6C47FF', alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="plus" size={20} color="#fff" />
        </Pressable>
      </View>

      <Tabs
        variant="underline"
        value={section}
        onChange={(v) => setSection(v as Section)}
        tabs={[
          { value: 'swipe', label: 'Swipe' },
          { value: 'mine', label: 'My Wardrobe' },
          { value: 'liked', label: 'Liked' },
        ]}
      />

      {section === 'swipe' && (
        <View style={{ flex: 1, padding: 20 }}>
          {cards.length > 0 ? (
            <SwipeDeck posts={cards} onSwipe={onSwipe} onNeedMore={onNeedMore} />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="check-circle" size={30} color="rgba(15,15,15,0.3)" />
              <Text style={{ marginTop: 10, color: 'rgba(15,15,15,0.5)' }}>
                {deck.isLoading ? 'Loading outfits…' : "You're all caught up"}
              </Text>
            </View>
          )}
        </View>
      )}

      {section === 'mine' && (
        <ScrollView contentContainerStyle={{ paddingVertical: 16 }}>
          <WardrobeGrid posts={mine.data ?? []} onDelete={(id) => deletePost.mutate(id)} />
        </ScrollView>
      )}

      {section === 'liked' && (
        <ScrollView contentContainerStyle={{ paddingVertical: 16 }}>
          <WardrobeGrid posts={liked.data ?? []} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

export default function WardrobeScreen() {
  return (
    <RequireAuth>
      <WardrobeInner />
    </RequireAuth>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add "app/(tabs)/wardrobe.tsx" "app/(tabs)/_layout.tsx" components/AnimatedTabBar.tsx
git commit -m "feat(wardrobe): add Wardrobe tab (Swipe/My/Liked) and register navigation"
```

---

## Task 11: Playwright e2e — wardrobe tab renders

**Files:**
- Create: `tests/e2e/signed-in/wardrobe.spec.ts`
- Reference: `tests/e2e/signed-in/upload-listing.spec.ts` (auth fixture + nav pattern)

**Interfaces:**
- Consumes: the running web app + existing signed-in Playwright setup.
- Produces: no exports.

- [ ] **Step 1: Read the reference spec**

Open `tests/e2e/signed-in/upload-listing.spec.ts` and copy its exact imports (`@playwright/test`, `../helpers/page` `waitForAppReady`) and navigation approach.

- [ ] **Step 2: Write the test**

```ts
// tests/e2e/signed-in/wardrobe.spec.ts
import { test, expect } from '@playwright/test';
import { waitForAppReady } from '../helpers/page';

test.describe('Wardrobe (signed in)', () => {
  test('tab shows the three sections and a post entry point', async ({ page }) => {
    await page.goto('/wardrobe');
    await waitForAppReady(page);
    await expect(page.getByText('Wardrobe')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Swipe')).toBeVisible();
    await expect(page.getByText('My Wardrobe')).toBeVisible();
    await expect(page.getByText('Liked')).toBeVisible();
  });
});
```

- [ ] **Step 3: Run the test**

Run: `npm run test:e2e -- wardrobe`
Expected: PASS when signed-in credentials are available. (In a bare environment without `.env.test`, this behaves like the other `signed-in/` specs — auth setup is skipped; that is the known environment limitation, not a test defect.)

- [ ] **Step 4: Full regression + commit**

Run: `npm test && npm run typecheck`
Expected: all unit tests pass, no type errors.

```bash
git add tests/e2e/signed-in/wardrobe.spec.ts
git commit -m "test(e2e): cover wardrobe tab sections"
```

---

## Self-review notes (for the implementer)

- Spec coverage: data model → T1; deck helpers → T2; data layer + upload helper → T3; hooks → T4; photoClean options → T5; upload screen → T6; card → T7; swipe deck → T8; grids → T9; tab + nav → T10; e2e → T11.
- `cleanPhoto`'s new optional `options` arg is backward compatible: `app/(tabs)/upload.tsx` calls `cleanPhoto(input)` unchanged (T5 defaults both flags true).
- Type names are consistent across tasks: `WardrobePost`, `SwipeDirection`, `CleanOptions`, `resolveCleanOptions`, `filterUnseen`/`dedupeById`/`needsMore`, and the hook names in T4 are exactly what T10 imports.
- RLS + trigger + storage policies (T1) mirror `supabase/follows.sql`; `auth.uid()` is wrapped as `(select auth.uid())` per the advisor perf pattern.
- Never introduces `@imgly/background-removal`.
- v1 scope respected: no matching, no shop links, single photo, counts-only.
