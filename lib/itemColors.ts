// Single source of truth for the listing colour attribute. Stored on
// listings.color as the slug id; validated in-app (no DB enum) so the palette
// can evolve without a migration. Replaces the old hard-coded "Grabsty purple"
// placeholder that showed on every product regardless of the real item.

export interface ItemColor {
  id: string;
  label: string;
  /** Swatch fill. null = multicolour (rendered as a quadrant swatch). */
  hex: string | null;
}

export const ITEM_COLORS: ItemColor[] = [
  { id: 'black', label: 'Black', hex: '#141414' },
  { id: 'white', label: 'White', hex: '#FFFFFF' },
  { id: 'grey', label: 'Grey', hex: '#9AA0A6' },
  { id: 'beige', label: 'Beige', hex: '#E4D5B7' },
  { id: 'brown', label: 'Brown', hex: '#7B4B27' },
  { id: 'red', label: 'Red', hex: '#D7373F' },
  { id: 'pink', label: 'Pink', hex: '#F28DB2' },
  { id: 'orange', label: 'Orange', hex: '#E8772E' },
  { id: 'yellow', label: 'Yellow', hex: '#F2C230' },
  { id: 'green', label: 'Green', hex: '#3FA463' },
  { id: 'blue', label: 'Blue', hex: '#3A6FE0' },
  { id: 'purple', label: 'Purple', hex: '#6C47FF' },
  { id: 'gold', label: 'Gold', hex: '#C9A24B' },
  { id: 'silver', label: 'Silver', hex: '#C4C8CC' },
  { id: 'multi', label: 'Multicolour', hex: null },
];

const BY_ID = new Map(ITEM_COLORS.map((c) => [c.id, c]));

export function getItemColor(id: string | null | undefined): ItemColor | undefined {
  if (!id) return undefined;
  return BY_ID.get(id);
}

export function itemColorLabel(id: string | null | undefined): string {
  return getItemColor(id)?.label ?? '';
}
