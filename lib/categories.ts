// Single source of truth for the category taxonomy.
//
// Historically the categories were duplicated across types/index.ts,
// components/product/shared.ts, app/(tabs)/upload.tsx and app/(tabs)/discover.tsx
// and had drifted (Discover only listed 4 of 7; icons disagreed). Everything now
// imports from here so the taxonomy, labels and icons stay in lockstep.
//
// Model: one flat top-level category + one optional subcategory level (the
// modern eBay / Vinted pattern). Deep multi-level trees are intentionally
// avoided. Subcategories are stored on `listings.subcategory` as the slug id.
import Feather from '@expo/vector-icons/Feather';
import type { Category } from '@/types';

export type CategoryId = Category;

export interface Subcategory {
  id: string;
  label: string;
  /** Lowercase keywords that hint this sub from a listing title (upload suggestion). */
  kw?: string[];
}

export interface CategoryDef {
  id: CategoryId;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  subs: Subcategory[];
}

export const CATEGORIES: CategoryDef[] = [
  {
    id: 'clothing',
    label: 'Clothing',
    icon: 'shopping-bag',
    subs: [
      { id: 'kurta_shalwar_kameez', label: 'Kurta Shalwar Kameez', kw: ['kurta', 'shalwar', 'kameez', 'salwar', 'qameez', 'kamiz', 'boski', 'karandi'] },
      { id: 'lawn_unstitched', label: 'Lawn / Unstitched Suits', kw: ['lawn', 'unstitched', '3 piece', '3piece', '2 piece', '2piece'] },
      { id: 'stitched_2_3_piece', label: 'Stitched 2-Piece / 3-Piece', kw: ['stitched', 'pret', 'ready to wear'] },
      { id: 'eastern_formal_bridal', label: 'Eastern Formal & Bridal Wear', kw: ['bridal', 'lehenga', 'sharara', 'gharara', 'maxi', 'anarkali'] },
      { id: 'abayas_modest', label: 'Abayas & Modest Wear', kw: ['abaya', 'abayas', 'hijab', 'chador', 'burqa', 'modest'] },
      { id: 'tops', label: 'Tops', kw: ['top', 'blouse', 'cami', 'tank'] },
      { id: 't_shirts', label: 'T-shirts', kw: ['tee', 't-shirt', 'tshirt', 't shirt'] },
      { id: 'shirts', label: 'Shirts', kw: ['shirt', 'button up', 'button-up', 'flannel'] },
      { id: 'hoodies', label: 'Hoodies & Sweats', kw: ['hoodie', 'sweatshirt', 'sweater hood', 'crewneck', 'pullover'] },
      { id: 'knitwear', label: 'Knitwear', kw: ['knit', 'sweater', 'jumper', 'cardigan'] },
      { id: 'dresses', label: 'Dresses', kw: ['dress', 'gown', 'frock'] },
      { id: 'skirts', label: 'Skirts', kw: ['skirt'] },
      { id: 'trousers', label: 'Trousers', kw: ['trouser', 'pants', 'chino', 'slacks'] },
      { id: 'jeans', label: 'Jeans', kw: ['jean', 'denim'] },
      { id: 'shorts', label: 'Shorts', kw: ['short'] },
      { id: 'outerwear', label: 'Outerwear', kw: ['jacket', 'coat', 'parka', 'puffer', 'trench'] },
      { id: 'activewear', label: 'Activewear', kw: ['legging', 'gym', 'sport', 'activewear', 'yoga'] },
      { id: 'suits', label: 'Suits & Blazers', kw: ['suit', 'blazer', 'tuxedo', 'waistcoat', 'sherwani'] },
      { id: 'winter_wear', label: 'Winter Wear (Shawls, Sweaters, Coats)', kw: ['shawl', 'pashmina', 'velvet'] },
      { id: 'nightwear', label: 'Nightwear / Loungewear', kw: ['nightwear', 'loungewear', 'pajama', 'pyjama', 'sleepwear'] },
    ],
  },
  {
    id: 'shoes',
    label: 'Shoes',
    icon: 'package',
    subs: [
      { id: 'khussas_chappals', label: 'Khussas / Chappals', kw: ['khussa', 'khussas', 'khosa', 'chappal', 'chappals', 'peshawari', 'chapal', 'kolhapuri'] },
      { id: 'sneakers', label: 'Sneakers', kw: ['sneaker', 'trainer', 'air max', 'jordan', 'dunk', 'runner'] },
      { id: 'boots', label: 'Boots', kw: ['boot', 'chelsea'] },
      { id: 'heels_sandals', label: 'Heels & Sandals', kw: ['heel', 'stiletto', 'pump', 'sandal', 'sandals'] },
      { id: 'formal_shoes', label: 'Formal Shoes', kw: ['oxford', 'brogue', 'derby', 'dress shoe', 'loafer', 'moccasin'] },
      { id: 'sports_shoes', label: 'Sports Shoes', kw: ['cleats', 'running shoe', 'tennis shoe'] },
      { id: 'flats', label: 'Flats', kw: ['flat', 'ballet'] },
    ],
  },
  {
    id: 'bags',
    label: 'Bags',
    icon: 'briefcase',
    subs: [
      { id: 'handbags_totes', label: 'Handbags & Totes', kw: ['handbag', 'hand bag', 'tote', 'shoulder bag', 'crossbody'] },
      { id: 'backpacks', label: 'Backpacks', kw: ['backpack', 'rucksack'] },
      { id: 'wallets_clutches', label: 'Wallets & Clutches', kw: ['wallet', 'purse', 'cardholder', 'clutch'] },
    ],
  },
  {
    id: 'accessories',
    label: 'Accessories',
    icon: 'watch',
    subs: [
      { id: 'sunglasses', label: 'Sunglasses', kw: ['sunglass', 'shades', 'eyewear'] },
      { id: 'eyeglasses', label: 'Eyeglasses / Optical Frames', kw: ['eyeglass', 'glasses', 'optical', 'frames', 'spectacles'] },
      { id: 'watches', label: 'Watches', kw: ['watch'] },
      { id: 'fashion_jewelry', label: 'Fashion Jewelry', kw: ['ring', 'necklace', 'bracelet', 'earring', 'jewel', 'pendant'] },
      { id: 'ethnic_traditional_jewelry', label: 'Ethnic / Traditional Jewelry', kw: ['jhumka', 'tikka', 'matha patti', 'kundan', 'polki'] },
      { id: 'belts', label: 'Belts', kw: ['belt'] },
      { id: 'scarves_dupattas', label: 'Scarves & Dupattas', kw: ['scarf', 'scarves', 'dupatta', 'dupata', 'shawl', 'chaddar'] },
      { id: 'hats', label: 'Hats & Caps', kw: ['hat', 'cap', 'beanie'] },
      { id: 'gloves', label: 'Gloves', kw: ['glove'] },
      { id: 'hair', label: 'Hair', kw: ['hair clip', 'scrunchie', 'headband'] },
    ],
  },
  {
    id: 'beauty',
    label: 'Beauty',
    icon: 'droplet',
    subs: [
      { id: 'makeup', label: 'Makeup', kw: ['makeup', 'lipstick', 'foundation', 'mascara', 'palette'] },
      { id: 'skincare', label: 'Skincare', kw: ['skincare', 'serum', 'moisturizer', 'cleanser', 'cream'] },
      { id: 'fragrance', label: 'Fragrance', kw: ['perfume', 'fragrance', 'cologne', 'eau de'] },
      { id: 'haircare', label: 'Haircare', kw: ['shampoo', 'conditioner', 'haircare', 'hair oil'] },
      { id: 'tools', label: 'Tools & Brushes', kw: ['brush', 'straightener', 'curler', 'dryer'] },
      { id: 'nails', label: 'Nails', kw: ['nail', 'polish', 'manicure'] },
    ],
  },
  {
    id: 'other',
    label: 'Other',
    icon: 'box',
    subs: [],
  },
];
const CATEGORY_BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

export function getCategory(id: string | null | undefined): CategoryDef | undefined {
  if (!id) return undefined;
  return CATEGORY_BY_ID.get(id as CategoryId);
}

export function getSubcategory(
  catId: string | null | undefined,
  subId: string | null | undefined,
): Subcategory | undefined {
  if (!subId) return undefined;
  return getCategory(catId)?.subs.find((s) => s.id === subId);
}

export function categoryLabel(id: string | null | undefined): string {
  return getCategory(id)?.label ?? (id ?? '');
}

export function subcategoryLabel(
  catId: string | null | undefined,
  subId: string | null | undefined,
): string {
  return getSubcategory(catId, subId)?.label ?? (subId ?? '');
}

/** True when a category defines subcategories (so upload should require one). */
export function hasSubcategories(id: string | null | undefined): boolean {
  return (getCategory(id)?.subs.length ?? 0) > 0;
}
