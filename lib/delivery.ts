// Grabsty only delivers inside Pakistan. Must match the server trigger
// public.pakistan_only_orders (migration 20261108010000), which is the real gate.
export const NOT_DELIVERABLE_MESSAGE =
  "Grabsty isn't available in your country yet. We only deliver within Pakistan.";

/** Blank counts as Pakistan: the address form defaults to it. */
export function isDeliverableCountry(country: string | null | undefined): boolean {
  const c = (country ?? '').trim().toLowerCase();
  return c === '' || c === 'pakistan' || c === 'pk' || c === 'pak';
}
