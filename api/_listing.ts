// Shared by the link-preview functions (files starting with _ aren't routes).
// api/ is an ES module package (api/package.json): relative imports need ".js".
// Reads one public listing via Supabase REST with the anon key — same access
// a signed-out browser has, so RLS decides what's visible.

export type PreviewListing = {
  id: string;
  title: string;
  price: number;
  brand: string | null;
  size: string | null;
  condition: string | null;
  images: string[] | null;
  is_sold: boolean;
  seller: { username: string | null } | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getListing(id: string | null): Promise<PreviewListing | null> {
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!id || !UUID.test(id) || !base || !key) return null;
  const select = 'id,title,price,brand,size,condition,images,is_sold,seller:profiles!listings_seller_id_fkey(username)';
  try {
    const res = await fetch(`${base}/rest/v1/listings?id=eq.${id}&select=${select}&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as PreviewListing[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export { listingMeta as meta } from './_listingMeta.js';
// Same output as formatPrice(n, { whole: true }) in lib/currency.ts. Restated so
// this ES module package imports nothing from the CommonJS app tree.
export const price = (n: number) => `Rs ${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
