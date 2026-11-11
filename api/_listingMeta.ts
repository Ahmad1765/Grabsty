// Plain-TS listing labels shared by the app (via lib/listingMeta) and the link-preview
// functions in api/ (which can't import anything that pulls in react-native).

export const CONDITION_LABELS: Record<string, string> = {
  new_with_tags: 'New with tags',
  like_new: 'Like new',
  good: 'Good',
  fair: 'Fair',
};

type MetaFields = { brand?: string | null; size?: string | null; condition?: string | null };

/** "Adidas · Size US 10 · Good", skipping whatever is missing. */
export function listingMeta(l: MetaFields): string {
  return [
    l.brand?.trim(),
    l.size?.trim() && `Size ${l.size.trim()}`,
    l.condition && (CONDITION_LABELS[l.condition] ?? l.condition),
  ]
    .filter(Boolean)
    .join(' · ');
}
