// Saved searches CRUD. Mirrors the discover screen state (query + category +
// gender). The table lives at public.saved_searches; see supabase/saved_searches.sql.
//
// Every helper here is defensive — if the table doesn't exist yet (eg. the
// migration hasn't been applied) we log and return a benign value so the
// surrounding UI degrades to the empty state instead of throwing.

import { supabase } from '@/lib/supabase';
import type { Category, Gender } from '@/types';

export type SavedSearch = {
  id: string;
  user_id: string;
  query: string | null;
  category: Category | null;
  gender: Gender | null;
  label: string | null;
  last_seen_at: string | null;
  notify: boolean;
  created_at: string;
  updated_at: string;
};

// Trim + lowercase + collapse whitespace so the unique constraint dedupes
// "  Nike " against "nike" against "Nike". Null when the trimmed string is
// empty — that lets the unique index treat "no query, only category" as one
// distinct row instead of duplicating per filter combo.
function normaliseQuery(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/\s+/g, ' ').toLowerCase();
  return trimmed.length === 0 ? null : trimmed;
}

export function defaultLabelFor(params: {
  query: string | null;
  category: Category | null;
  gender: Gender | null;
}): string {
  const parts: string[] = [];
  if (params.query && params.query.length > 0) parts.push(params.query);
  if (params.category) parts.push(params.category);
  if (params.gender && params.gender !== 'all') parts.push(params.gender);
  return parts.length === 0 ? 'Saved search' : parts.join(' · ');
}

export async function listSavedSearches(userId: string): Promise<SavedSearch[]> {
  const { data, error } = await supabase
    .from('saved_searches')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) {
    // Surface the table-missing case but keep the UI walking. Every other
    // error is also non-fatal here; the worst that happens is the Saved tab
    // renders empty.
    console.warn('[saved-searches] list', error.message);
    return [];
  }
  return (data ?? []) as SavedSearch[];
}

export async function createSavedSearch(args: {
  userId: string;
  query: string | null;
  category: Category | null;
  gender: Gender | null;
  label?: string | null;
  notify?: boolean;
}): Promise<SavedSearch | null> {
  const normalisedQuery = normaliseQuery(args.query);
  const payload = {
    user_id: args.userId,
    query: normalisedQuery,
    category: args.category,
    gender: args.gender && args.gender !== 'all' ? args.gender : null,
    label:
      args.label ??
      defaultLabelFor({
        query: normalisedQuery,
        category: args.category,
        gender: args.gender && args.gender !== 'all' ? args.gender : null,
      }),
    // DB default is true; pass through only when caller is explicit so the
    // chip's "Notify me" toggle round-trips end-to-end.
    ...(args.notify === undefined ? {} : { notify: args.notify }),
  };
  // Insert; on unique violation we resolve the existing row so the caller
  // can show "already saved" instead of an error.
  const { data, error } = await supabase
    .from('saved_searches')
    .insert(payload)
    .select('*')
    .single();
  if (!error) return data as SavedSearch;
  if (error.code === '23505') {
    // Already exists — fetch it.
    let q = supabase
      .from('saved_searches')
      .select('*')
      .eq('user_id', args.userId);

    q = payload.query === null ? q.is('query', null) : q.eq('query', payload.query as any);
    q = payload.category === null ? q.is('category', null) : q.eq('category', payload.category as any);
    q = payload.gender === null ? q.is('gender', null) : q.eq('gender', payload.gender as any);

    const { data: existing } = await q.maybeSingle();
    return (existing as SavedSearch | null) ?? null;
  }
  console.warn('[saved-searches] create', error.message);
  return null;
}

export async function deleteSavedSearch(id: string): Promise<boolean> {
  const { error } = await supabase.from('saved_searches').delete().eq('id', id);
  if (error) {
    console.warn('[saved-searches] delete', error.message);
    return false;
  }
  return true;
}
// Counts how many listings have landed since the user last opened this
// saved search. Used to render the "N new" badge on the Saved tab. Returns
// 0 on any failure — the badge is supplementary UX.
export async function fetchNewMatchesCount(id: string): Promise<number> {
  const { data, error } = await supabase.rpc('saved_search_new_matches', {
    p_search_id: id,
  });
  if (error) {
    console.warn('[saved-searches] new matches', error.message);
    return 0;
  }
  return Number(data ?? 0);
}
