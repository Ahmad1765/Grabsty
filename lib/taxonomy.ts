// Grabsty Category & Brand Taxonomy (v3 Launch)
// Single source of truth derived from Icons/grabsty_taxonomy_v3.xlsx
import Feather from '@expo/vector-icons/Feather';
import type { Category, Gender } from '@/types';

export const TAXONOMY_VERSION = 3;

export type BrandTier =
  | 'Local Premium'
  | 'Local Mass'
  | 'Local Luxury / Couture'
  | 'Local Contemporary'
  | 'Local Modern Menswear'
  | 'Gen Z / Streetwear'
  | 'Premium / Luxury'
  | 'Moderate / Mass'
  | 'Footwear'
  | 'Kids & Girls'
  | 'Eyewear'
  | 'System';

export interface TaxonomyBrand {
  name: string;
  tier: BrandTier;
  categoryRelevance: string;
  /** Normalized category codes (CAT-01, CAT-02, etc.) this brand operates in */
  categoryCodes: string[];
}

export interface TaxonomySubcategory {
  id: string;
  label: string;
  aliases?: string[];
  kw?: string[];
}

export interface TaxonomyCategory {
  code: string; // CAT-01, CAT-02, etc.
  name: string;
  icon: keyof typeof Feather.glyphMap;
  rootCategory: Category; // Maps to database check constraint
  defaultGender?: Gender;
  subcategories: TaxonomySubcategory[];
}

// ── Categories & Subcategories (from sheet: Categories) ───────────────────
export const TAXONOMY_CATEGORIES: TaxonomyCategory[] = [
  {
    code: 'CAT-01',
    name: "Women's Clothing",
    icon: 'shopping-bag',
    rootCategory: 'clothing',
    defaultGender: 'women',
    subcategories: [
      { id: 'lawn_unstitched', label: 'Lawn / Unstitched Suits', kw: ['lawn', 'unstitched', '3 piece', '3piece', '2 piece', '2piece', 'suit fabric'] },
      { id: 'stitched_2_3_piece', label: 'Stitched 2-Piece / 3-Piece', kw: ['stitched', '2 piece', '3 piece', 'pret', 'ready to wear', 'kameez shalwar', 'shalwar kameez'] },
      { id: 'eastern_formal_bridal', label: 'Eastern Formal & Bridal Wear', kw: ['bridal', 'formal', 'lehenga', 'sharara', 'gharara', 'angrakha', 'maxi', 'choli', 'anarkali'] },
      { id: 'western_wear', label: 'Western Wear (Tops, Dresses, Jeans, Skirts)', kw: ['top', 'tops', 'dress', 'dresses', 'jeans', 'skirt', 'denim', 'blouse', 't shirt'] },
      { id: 'abayas_modest', label: 'Abayas & Modest Wear', kw: ['abaya', 'abayas', 'hijab', 'chador', 'burqa', 'modest', 'jilbab', 'niqab'] },
      { id: 'activewear', label: 'Activewear / Sportswear', kw: ['gym', 'yoga', 'sport', 'tights', 'activewear', 'legging'] },
      { id: 'winter_wear', label: 'Winter Wear (Shawls, Sweaters, Jackets, Coats)', kw: ['shawl', 'pashmina', 'sweater', 'jacket', 'coat', 'cardigan', 'hoodie', 'velvet'] },
      { id: 'nightwear', label: 'Nightwear / Loungewear', kw: ['nightwear', 'loungewear', 'pajama', 'pyjama', 'sleepwear', 'robe'] },
    ],
  },
  {
    code: 'CAT-02',
    name: "Men's Clothing",
    icon: 'user',
    rootCategory: 'clothing',
    defaultGender: 'men',
    subcategories: [
      { id: 'kurta_shalwar_kameez', label: 'Kurta Shalwar Kameez', kw: ['kurta', 'shalwar', 'kameez', 'salwar', 'qameez', 'kamiz', 'boski', 'karandi', 'latha'] },
      { id: 'western_casual', label: 'Western Casual (Shirts, Tees, Jeans, Shorts)', kw: ['shirt', 'tee', 't-shirt', 'polo', 'jeans', 'chino', 'shorts', 'pants'] },
      { id: 'formalwear', label: 'Formalwear (Blazers, Suits, Waistcoats)', kw: ['blazer', 'suit', 'waistcoat', 'tuxedo', 'sherwani', 'prince coat', 'tie'] },
      { id: 'activewear_men', label: 'Activewear / Sportswear', kw: ['tracksuit', 'jogger', 'gym', 'activewear', 'shorts', 'jersey'] },
      { id: 'winter_wear_men', label: 'Winter Wear (Sweaters, Jackets)', kw: ['jacket', 'sweater', 'hoodie', 'coat', 'cardigan', 'shawl', 'chaddar'] },
    ],
  },
  {
    code: 'CAT-03',
    name: 'Kids & Baby',
    icon: 'smile',
    rootCategory: 'clothing',
    defaultGender: 'unisex',
    subcategories: [
      { id: 'girls_clothing', label: "Girls' Clothing", kw: ['girl', 'frock', 'ghagra', 'girls'] },
      { id: 'boys_clothing', label: "Boys' Clothing", kw: ['boy', 'boys', 'kurta boy'] },
      { id: 'infant_newborn', label: 'Infant / Newborn Wear', kw: ['baby', 'infant', 'newborn', 'romper', 'onesie'] },
      { id: 'school_uniforms', label: 'School Uniforms', kw: ['uniform', 'school'] },
      { id: 'kids_footwear', label: "Kids' Footwear", kw: ['kids shoe', 'kids shoes', 'booties'] },
    ],
  },
  {
    code: 'CAT-04',
    name: 'Footwear',
    icon: 'package',
    rootCategory: 'shoes',
    subcategories: [
      { id: 'sneakers', label: 'Sneakers', kw: ['sneaker', 'sneakers', 'trainer', 'dunk', 'jordan', 'air max', 'kicks', 'runner', 'jogger'] },
      { id: 'formal_shoes', label: 'Formal Shoes', kw: ['oxford', 'derby', 'brogue', 'loafer', 'monk', 'formal shoe', 'dress shoe'] },
      { id: 'khussas_chappals', label: 'Khussas / Chappals', kw: ['khussa', 'khussas', 'khosa', 'chappal', 'chappals', 'peshawari', 'chapal', 'kolhapuri', 'norzi'] },
      { id: 'heels_sandals', label: 'Heels & Sandals', kw: ['heel', 'heels', 'stiletto', 'sandal', 'sandals', 'pump', 'platform', 'wedge'] },
      { id: 'sports_shoes', label: 'Sports Shoes', kw: ['cleats', 'running shoe', 'tennis shoe', 'athletic', 'sport shoe'] },
      { id: 'boots', label: 'Boots', kw: ['boot', 'boots', 'chelsea', 'ankle boot'] },
      { id: 'flats', label: 'Flats', kw: ['flat', 'flats', 'ballet', 'slip on'] },
    ],
  },
  {
    code: 'CAT-05',
    name: 'Bags & Accessories',
    icon: 'briefcase',
    rootCategory: 'bags',
    subcategories: [
      { id: 'handbags_totes', label: 'Handbags & Totes', kw: ['handbag', 'tote', 'shoulder bag', 'crossbody', 'purse'] },
      { id: 'backpacks', label: 'Backpacks', kw: ['backpack', 'rucksack', 'bagpack'] },
      { id: 'wallets_clutches', label: 'Wallets & Clutches', kw: ['wallet', 'clutch', 'card holder', 'coin pouch'] },
      { id: 'belts', label: 'Belts', kw: ['belt', 'buckle', 'leather belt'] },
      { id: 'scarves_dupattas', label: 'Scarves & Dupattas', kw: ['scarf', 'dupatta', 'dupata', 'stole', 'shawl', 'chaddar'] },
      { id: 'sunglasses', label: 'Sunglasses', kw: ['sunglass', 'sunglasses', 'shades', 'aviator', 'wayfarer'] },
      { id: 'eyeglasses', label: 'Eyeglasses / Optical Frames', kw: ['eyeglass', 'glasses', 'optical', 'frames', 'spectacles'] },
      { id: 'caps_hats', label: 'Caps & Hats', kw: ['cap', 'hat', 'beanie', 'beret'] },
    ],
  },
  {
    code: 'CAT-06',
    name: 'Jewelry & Watches',
    icon: 'watch',
    rootCategory: 'accessories',
    subcategories: [
      { id: 'fashion_jewelry', label: 'Fashion Jewelry', kw: ['necklace', 'earring', 'earrings', 'bracelet', 'ring', 'bangles', 'pendant'] },
      { id: 'ethnic_traditional_jewelry', label: 'Ethnic / Traditional Jewelry', kw: ['jhumka', 'jhumkas', 'tikka', 'matha patti', 'kundan', 'polki', 'choker'] },
      { id: 'watches', label: 'Watches', kw: ['watch', 'chronograph', 'timepiece', 'wristwatch'] },
    ],
  },
  {
    code: 'CAT-07',
    name: 'Beauty & Grooming',
    icon: 'droplet',
    rootCategory: 'beauty',
    subcategories: [
      { id: 'skincare', label: 'Skincare', kw: ['serum', 'moisturizer', 'sunscreen', 'cleanser', 'cream', 'skincare'] },
      { id: 'makeup', label: 'Makeup', kw: ['lipstick', 'foundation', 'mascara', 'eyeliner', 'palette', 'blush', 'makeup'] },
      { id: 'fragrances', label: 'Fragrances', kw: ['perfume', 'fragrance', 'cologne', 'attar', 'ittar', 'eau de parfum', 'body mist'] },
    ],
  },
];

// Special cross-cutting tag (from sheet: Implementation Notes #5)
export const UNBRANDED_LOCAL_TAILOR = 'Unbranded / Local Tailor';
export const NO_BRAND = 'No brand';

// ── Complete Seed Brand List (from sheet: Brands & Global Marketplace) ─────
export const TAXONOMY_BRANDS: TaxonomyBrand[] = [
  // Premium / Luxury
  { name: 'Gucci', tier: 'Premium / Luxury', categoryRelevance: 'Bags, Footwear, Eyewear, Clothing', categoryCodes: ['CAT-01', 'CAT-02', 'CAT-04', 'CAT-05'] },
  { name: 'Louis Vuitton', tier: 'Premium / Luxury', categoryRelevance: 'Bags, Accessories', categoryCodes: ['CAT-05'] },
  { name: 'Chanel', tier: 'Premium / Luxury', categoryRelevance: 'Bags, Eyewear, Accessories', categoryCodes: ['CAT-05'] },
  { name: 'Prada', tier: 'Premium / Luxury', categoryRelevance: 'Bags, Eyewear, Footwear', categoryCodes: ['CAT-04', 'CAT-05'] },
  { name: 'Dior', tier: 'Premium / Luxury', categoryRelevance: 'Bags, Eyewear, Accessories', categoryCodes: ['CAT-05'] },
  { name: 'Versace', tier: 'Premium / Luxury', categoryRelevance: 'Clothing, Eyewear, Accessories', categoryCodes: ['CAT-01', 'CAT-02', 'CAT-05'] },
  { name: 'Michael Kors', tier: 'Premium / Luxury', categoryRelevance: 'Bags, Watches', categoryCodes: ['CAT-05', 'CAT-06'] },
  { name: 'Coach', tier: 'Premium / Luxury', categoryRelevance: 'Bags, Wallets', categoryCodes: ['CAT-05'] },
  { name: 'Cartier', tier: 'Premium / Luxury', categoryRelevance: 'Watches, Jewelry', categoryCodes: ['CAT-06'] },
  { name: 'Tom Ford', tier: 'Premium / Luxury', categoryRelevance: 'Eyewear', categoryCodes: ['CAT-05'] },
  { name: 'Burberry', tier: 'Premium / Luxury', categoryRelevance: 'Clothing, Eyewear, Accessories', categoryCodes: ['CAT-01', 'CAT-02', 'CAT-05'] },
  { name: 'Rolex', tier: 'Premium / Luxury', categoryRelevance: 'Watches', categoryCodes: ['CAT-06'] },
  { name: 'Ralph Lauren', tier: 'Premium / Luxury', categoryRelevance: "Men's & Women's Clothing, Accessories", categoryCodes: ['CAT-01', 'CAT-02', 'CAT-03', 'CAT-05'] },

  // Moderate / Mass / High-Street Fashion (Vinted Core Brands)
  { name: "Levi's", tier: 'Moderate / Mass', categoryRelevance: "Men's & Women's Clothing", categoryCodes: ['CAT-01', 'CAT-02'] },
  { name: 'Zara', tier: 'Moderate / Mass', categoryRelevance: "Men's & Women's Clothing", categoryCodes: ['CAT-01', 'CAT-02'] },
  { name: 'H&M', tier: 'Moderate / Mass', categoryRelevance: "Men's & Women's Clothing", categoryCodes: ['CAT-01', 'CAT-02'] },
  { name: 'The North Face', tier: 'Moderate / Mass', categoryRelevance: 'Outerwear, Footwear, Bags, Activewear', categoryCodes: ['CAT-01', 'CAT-02', 'CAT-04', 'CAT-05'] },
  { name: 'French Connection', tier: 'Moderate / Mass', categoryRelevance: "Men's & Women's Clothing, Accessories", categoryCodes: ['CAT-01', 'CAT-02'] },
  { name: 'FatFace', tier: 'Moderate / Mass', categoryRelevance: "Men's & Women's Clothing", categoryCodes: ['CAT-01', 'CAT-02'] },
  { name: 'FCUK', tier: 'Moderate / Mass', categoryRelevance: "Men's & Women's Clothing", categoryCodes: ['CAT-01', 'CAT-02'] },
  { name: 'Card Factory', tier: 'Moderate / Mass', categoryRelevance: 'Accessories & Gifts', categoryCodes: ['CAT-05'] },
  { name: 'Liverpool Football Club', tier: 'Moderate / Mass', categoryRelevance: "Sportswear, Men's Clothing", categoryCodes: ['CAT-01', 'CAT-02', 'CAT-03'] },
  { name: 'FC Barcelona', tier: 'Moderate / Mass', categoryRelevance: "Sportswear, Men's Clothing", categoryCodes: ['CAT-01', 'CAT-02', 'CAT-03'] },
  { name: 'Face', tier: 'Moderate / Mass', categoryRelevance: "Clothing & Beauty", categoryCodes: ['CAT-01', 'CAT-07'] },
  { name: "Angel's Face", tier: 'Kids & Girls', categoryRelevance: "Girls' Clothing & Accessories", categoryCodes: ['CAT-01', 'CAT-03'] },
  { name: 'Max Factor', tier: 'Moderate / Mass', categoryRelevance: 'Beauty, Makeup, Cosmetics', categoryCodes: ['CAT-07'] },
  { name: 'Marco Tozzi', tier: 'Footwear', categoryRelevance: 'Footwear & Bags', categoryCodes: ['CAT-04', 'CAT-05'] },
  { name: 'Anna Field', tier: 'Moderate / Mass', categoryRelevance: "Women's Clothing, Shoes, Bags", categoryCodes: ['CAT-01', 'CAT-04', 'CAT-05'] },
  { name: 'Pull & Bear', tier: 'Moderate / Mass', categoryRelevance: "Men's & Women's Clothing, Shoes", categoryCodes: ['CAT-01', 'CAT-02', 'CAT-04'] },
  { name: 'Gémo', tier: 'Moderate / Mass', categoryRelevance: "Clothing & Shoes", categoryCodes: ['CAT-01', 'CAT-02', 'CAT-03', 'CAT-04'] },
  { name: 'Rylko', tier: 'Footwear', categoryRelevance: 'Footwear & Bags', categoryCodes: ['CAT-04', 'CAT-05'] },
  { name: 'Sebago', tier: 'Footwear', categoryRelevance: 'Footwear & Casualwear', categoryCodes: ['CAT-04'] },
  { name: 'TU', tier: 'Moderate / Mass', categoryRelevance: "Men's, Women's & Kids Clothing", categoryCodes: ['CAT-01', 'CAT-02', 'CAT-03', 'CAT-04'] },
  { name: 'Nike', tier: 'Moderate / Mass', categoryRelevance: 'Footwear, Activewear', categoryCodes: ['CAT-01', 'CAT-02', 'CAT-04'] },
  { name: 'Adidas', tier: 'Moderate / Mass', categoryRelevance: 'Footwear, Activewear', categoryCodes: ['CAT-01', 'CAT-02', 'CAT-04'] },
  { name: 'Puma', tier: 'Moderate / Mass', categoryRelevance: 'Footwear, Activewear', categoryCodes: ['CAT-01', 'CAT-02', 'CAT-04'] },
  { name: 'Bershka', tier: 'Moderate / Mass', categoryRelevance: "Women's Clothing", categoryCodes: ['CAT-01'] },
  { name: 'Mango', tier: 'Moderate / Mass', categoryRelevance: "Women's Clothing", categoryCodes: ['CAT-01'] },
  { name: 'Stradivarius', tier: 'Moderate / Mass', categoryRelevance: "Women's Clothing, Shoes, Accessories", categoryCodes: ['CAT-01', 'CAT-04', 'CAT-05'] },
  { name: 'ASOS', tier: 'Moderate / Mass', categoryRelevance: "Men's & Women's Clothing", categoryCodes: ['CAT-01', 'CAT-02'] },
  { name: 'Topshop', tier: 'Moderate / Mass', categoryRelevance: "Women's Clothing", categoryCodes: ['CAT-01'] },
  { name: 'New Look', tier: 'Moderate / Mass', categoryRelevance: "Women's Clothing & Footwear", categoryCodes: ['CAT-01', 'CAT-04'] },
  { name: 'River Island', tier: 'Moderate / Mass', categoryRelevance: "Men's & Women's Clothing", categoryCodes: ['CAT-01', 'CAT-02'] },
  { name: 'Primark', tier: 'Moderate / Mass', categoryRelevance: "Men's, Women's & Kids Clothing", categoryCodes: ['CAT-01', 'CAT-02', 'CAT-03'] },
  { name: 'Urban Outfitters', tier: 'Moderate / Mass', categoryRelevance: "Men's & Women's Clothing", categoryCodes: ['CAT-01', 'CAT-02'] },
  { name: 'Brandy Melville', tier: 'Moderate / Mass', categoryRelevance: "Women's Clothing", categoryCodes: ['CAT-01'] },
  { name: 'Tommy Hilfiger', tier: 'Moderate / Mass', categoryRelevance: "Men's & Women's Clothing, Bags", categoryCodes: ['CAT-01', 'CAT-02', 'CAT-05'] },
  { name: 'Calvin Klein', tier: 'Moderate / Mass', categoryRelevance: "Men's & Women's Clothing, Bags", categoryCodes: ['CAT-01', 'CAT-02', 'CAT-05'] },
  { name: 'Gap', tier: 'Moderate / Mass', categoryRelevance: "Men's, Women's & Kids Clothing", categoryCodes: ['CAT-01', 'CAT-02', 'CAT-03'] },
  { name: 'Uniqlo', tier: 'Moderate / Mass', categoryRelevance: "Men's & Women's Clothing", categoryCodes: ['CAT-01', 'CAT-02'] },
  { name: 'Cotton On', tier: 'Moderate / Mass', categoryRelevance: "Men's & Women's Clothing", categoryCodes: ['CAT-01', 'CAT-02'] },
  { name: "Victoria's Secret", tier: 'Moderate / Mass', categoryRelevance: "Women's Clothing", categoryCodes: ['CAT-01'] },
  { name: 'Shein', tier: 'Moderate / Mass', categoryRelevance: "Women's Clothing", categoryCodes: ['CAT-01'] },
  { name: 'Fossil', tier: 'Moderate / Mass', categoryRelevance: 'Watches, Bags', categoryCodes: ['CAT-05', 'CAT-06'] },
  { name: 'Reebok', tier: 'Moderate / Mass', categoryRelevance: 'Footwear, Activewear', categoryCodes: ['CAT-01', 'CAT-02', 'CAT-04'] },

  // Local Premium (Pakistan)
  { name: 'Khaadi', tier: 'Local Premium', categoryRelevance: "Women's Clothing", categoryCodes: ['CAT-01', 'CAT-03'] },
  { name: 'Sana Safinaz', tier: 'Local Premium', categoryRelevance: "Women's Clothing", categoryCodes: ['CAT-01', 'CAT-03'] },
  { name: 'Maria B', tier: 'Local Premium', categoryRelevance: "Women's Clothing", categoryCodes: ['CAT-01'] },
  { name: 'Sapphire', tier: 'Local Premium', categoryRelevance: "Women's Clothing", categoryCodes: ['CAT-01', 'CAT-02', 'CAT-03'] },
  { name: 'Nishat Linen', tier: 'Local Premium', categoryRelevance: "Women's Clothing", categoryCodes: ['CAT-01'] },
  { name: 'Al-Karam', tier: 'Local Premium', categoryRelevance: "Women's Clothing", categoryCodes: ['CAT-01'] },
  { name: 'Alkaram Studio', tier: 'Local Premium', categoryRelevance: "Women's Clothing", categoryCodes: ['CAT-01', 'CAT-02'] },
  { name: 'J. (Junaid Jamshed)', tier: 'Local Premium', categoryRelevance: "Men's & Women's Clothing", categoryCodes: ['CAT-01', 'CAT-02', 'CAT-03', 'CAT-07'] },
  { name: 'Asim Jofa', tier: 'Local Premium', categoryRelevance: "Women's & Kids Clothing", categoryCodes: ['CAT-01', 'CAT-03'] },

  // Local Mass (Pakistan)
  { name: 'Bonanza Satrangi', tier: 'Local Mass', categoryRelevance: "Men's & Women's Clothing", categoryCodes: ['CAT-01', 'CAT-02'] },
  { name: 'Edenrobe', tier: 'Local Mass', categoryRelevance: "Men's & Women's Clothing", categoryCodes: ['CAT-01', 'CAT-02', 'CAT-03'] },
  { name: 'Chase Value', tier: 'Local Mass', categoryRelevance: "Men's & Women's Clothing", categoryCodes: ['CAT-01', 'CAT-02'] },
  { name: 'Limelight', tier: 'Local Mass', categoryRelevance: "Women's Clothing", categoryCodes: ['CAT-01'] },
  { name: 'Cross Stitch', tier: 'Local Mass', categoryRelevance: "Women's Clothing", categoryCodes: ['CAT-01'] },
  { name: 'Outfitters', tier: 'Local Mass', categoryRelevance: "Men's & Women's Clothing", categoryCodes: ['CAT-01', 'CAT-02', 'CAT-03'] },
  { name: 'Zellbury', tier: 'Local Mass', categoryRelevance: "Men's & Women's Clothing", categoryCodes: ['CAT-01', 'CAT-02'] },
  { name: 'Ideas by Gul Ahmed', tier: 'Local Mass', categoryRelevance: "Women's Clothing", categoryCodes: ['CAT-01'] },
  { name: 'Gul Ahmed', tier: 'Local Mass', categoryRelevance: "Women's Clothing", categoryCodes: ['CAT-01', 'CAT-02'] },
  { name: 'Ethnic', tier: 'Local Mass', categoryRelevance: "Men's & Women's Clothing", categoryCodes: ['CAT-01', 'CAT-02'] },

  // Footwear
  { name: 'Stoneage', tier: 'Footwear', categoryRelevance: 'Footwear', categoryCodes: ['CAT-04'] },
  { name: 'Borjan', tier: 'Footwear', categoryRelevance: 'Footwear', categoryCodes: ['CAT-04'] },
  { name: 'Metro', tier: 'Footwear', categoryRelevance: 'Footwear', categoryCodes: ['CAT-04'] },
  { name: 'Servis', tier: 'Footwear', categoryRelevance: 'Footwear', categoryCodes: ['CAT-04'] },
  { name: 'Bata', tier: 'Footwear', categoryRelevance: 'Footwear', categoryCodes: ['CAT-04'] },
  { name: 'Jordans', tier: 'Footwear', categoryRelevance: 'Footwear', categoryCodes: ['CAT-04'] },
  { name: 'Stylo', tier: 'Footwear', categoryRelevance: 'Footwear, Heels, Sandals', categoryCodes: ['CAT-04'] },
  { name: 'ECS', tier: 'Footwear', categoryRelevance: 'Footwear, Heels, Sandals', categoryCodes: ['CAT-04'] },
  { name: 'Insignia', tier: 'Footwear', categoryRelevance: 'Footwear, Luxury Footwear', categoryCodes: ['CAT-04'] },
  { name: 'Hush Puppies', tier: 'Footwear', categoryRelevance: 'Footwear, Casual & Formal', categoryCodes: ['CAT-04'] },
  { name: 'Mochari', tier: 'Footwear', categoryRelevance: 'Footwear, Handcrafted Khussas', categoryCodes: ['CAT-04'] },
  { name: 'New Balance', tier: 'Footwear', categoryRelevance: 'Footwear, Sneakers', categoryCodes: ['CAT-04'] },
  { name: 'Converse', tier: 'Footwear', categoryRelevance: 'Footwear, Sneakers', categoryCodes: ['CAT-04'] },
  { name: 'Vans', tier: 'Footwear', categoryRelevance: 'Footwear, Sneakers', categoryCodes: ['CAT-04'] },
  { name: 'Skechers', tier: 'Footwear', categoryRelevance: 'Footwear, Walking & Athletic', categoryCodes: ['CAT-04'] },
  { name: 'Aldo', tier: 'Footwear', categoryRelevance: 'Footwear, Shoes, Bags', categoryCodes: ['CAT-04', 'CAT-05'] },
  { name: 'Clarks', tier: 'Footwear', categoryRelevance: 'Footwear, Casual & Formal Shoes', categoryCodes: ['CAT-04'] },
  { name: 'Crocs', tier: 'Footwear', categoryRelevance: 'Footwear, Clogs & Sandals', categoryCodes: ['CAT-04'] },
  { name: 'Under Armour', tier: 'Moderate / Mass', categoryRelevance: 'Footwear, Activewear', categoryCodes: ['CAT-01', 'CAT-02', 'CAT-04'] },
  { name: 'ASICS', tier: 'Footwear', categoryRelevance: 'Footwear, Running & Athletic Shoes', categoryCodes: ['CAT-04'] },
  { name: 'Christian Louboutin', tier: 'Premium / Luxury', categoryRelevance: 'Footwear, Luxury Heels & Shoes', categoryCodes: ['CAT-04'] },
  { name: 'Jimmy Choo', tier: 'Premium / Luxury', categoryRelevance: 'Footwear, Luxury Shoes & Bags', categoryCodes: ['CAT-04', 'CAT-05'] },

  // Local Luxury / Couture
  { name: 'Elan', tier: 'Local Luxury / Couture', categoryRelevance: "Women's Clothing", categoryCodes: ['CAT-01'] },
  { name: 'HSY', tier: 'Local Luxury / Couture', categoryRelevance: "Women's Clothing", categoryCodes: ['CAT-01', 'CAT-02'] },
  { name: 'Faraz Manan', tier: 'Local Luxury / Couture', categoryRelevance: "Women's Clothing", categoryCodes: ['CAT-01'] },
  { name: 'Nomi Ansari', tier: 'Local Luxury / Couture', categoryRelevance: "Women's Clothing", categoryCodes: ['CAT-01'] },
  { name: 'Misha Lakhani', tier: 'Local Luxury / Couture', categoryRelevance: "Women's Clothing", categoryCodes: ['CAT-01'] },
  { name: 'Ali Xeeshan', tier: 'Local Luxury / Couture', categoryRelevance: "Women's Clothing", categoryCodes: ['CAT-01'] },
  { name: 'Deepak Perwani', tier: 'Local Luxury / Couture', categoryRelevance: "Men's & Women's Clothing", categoryCodes: ['CAT-01', 'CAT-02'] },

  // Local Contemporary
  { name: 'Sobia Nazir', tier: 'Local Contemporary', categoryRelevance: "Women's Clothing", categoryCodes: ['CAT-01'] },
  { name: 'Ammara Khan', tier: 'Local Contemporary', categoryRelevance: "Women's Clothing", categoryCodes: ['CAT-01'] },
  { name: 'Republic Womenswear', tier: 'Local Contemporary', categoryRelevance: "Women's Clothing", categoryCodes: ['CAT-01'] },
  { name: 'Farah Talib Aziz', tier: 'Local Contemporary', categoryRelevance: "Women's Clothing", categoryCodes: ['CAT-01'] },
  { name: 'Tena Durrani', tier: 'Local Contemporary', categoryRelevance: "Women's Clothing", categoryCodes: ['CAT-01'] },
  { name: 'Zainab Chottani', tier: 'Local Contemporary', categoryRelevance: "Women's Clothing", categoryCodes: ['CAT-01'] },
  { name: 'Qalamkar', tier: 'Local Contemporary', categoryRelevance: "Women's Clothing", categoryCodes: ['CAT-01'] },
  { name: 'Mushq', tier: 'Local Contemporary', categoryRelevance: "Women's Clothing", categoryCodes: ['CAT-01'] },
  { name: 'Afrozeh', tier: 'Local Contemporary', categoryRelevance: "Women's Clothing", categoryCodes: ['CAT-01'] },
  { name: 'Hussain Rehar', tier: 'Local Contemporary', categoryRelevance: "Women's Clothing", categoryCodes: ['CAT-01'] },
  { name: 'Agha Noor', tier: 'Local Contemporary', categoryRelevance: "Women's Clothing", categoryCodes: ['CAT-01'] },
  { name: 'Baroque', tier: 'Local Contemporary', categoryRelevance: "Women's Clothing", categoryCodes: ['CAT-01'] },
  { name: 'Kayseria', tier: 'Local Contemporary', categoryRelevance: "Women's Clothing", categoryCodes: ['CAT-01'] },
  { name: 'Charizma', tier: 'Local Contemporary', categoryRelevance: "Women's Clothing", categoryCodes: ['CAT-01'] },

  // Local Modern Menswear
  { name: 'Charcoal', tier: 'Local Modern Menswear', categoryRelevance: "Men's Clothing", categoryCodes: ['CAT-02'] },
  { name: 'Ivar Clothing', tier: 'Local Modern Menswear', categoryRelevance: "Men's Clothing", categoryCodes: ['CAT-02'] },
  { name: 'Uniworth', tier: 'Local Modern Menswear', categoryRelevance: "Men's Clothing", categoryCodes: ['CAT-02'] },
  { name: 'Amir Adnan', tier: 'Local Modern Menswear', categoryRelevance: "Men's Clothing", categoryCodes: ['CAT-02'] },
  { name: 'Royal Tag', tier: 'Local Modern Menswear', categoryRelevance: "Men's Clothing", categoryCodes: ['CAT-02'] },
  { name: 'Cambridge', tier: 'Local Modern Menswear', categoryRelevance: "Men's Clothing", categoryCodes: ['CAT-02'] },
  { name: 'Diners', tier: 'Local Modern Menswear', categoryRelevance: "Men's Clothing", categoryCodes: ['CAT-02'] },

  // Gen Z / Streetwear
  { name: 'Rastah', tier: 'Gen Z / Streetwear', categoryRelevance: "Men's & Women's Clothing, Footwear", categoryCodes: ['CAT-01', 'CAT-02', 'CAT-04'] },
  { name: 'Mint Macro', tier: 'Gen Z / Streetwear', categoryRelevance: "Men's Clothing", categoryCodes: ['CAT-02'] },
  { name: 'Movement (The Movement Store)', tier: 'Gen Z / Streetwear', categoryRelevance: "Men's & Women's Clothing", categoryCodes: ['CAT-01', 'CAT-02'] },
  { name: 'Cougar', tier: 'Gen Z / Streetwear', categoryRelevance: "Men's & Women's Clothing", categoryCodes: ['CAT-01', 'CAT-02'] },
  { name: 'Hangar', tier: 'Gen Z / Streetwear', categoryRelevance: "Men's & Women's Clothing", categoryCodes: ['CAT-01', 'CAT-02'] },
  { name: 'ELO', tier: 'Gen Z / Streetwear', categoryRelevance: "Men's & Women's Clothing", categoryCodes: ['CAT-01', 'CAT-02'] },
  { name: 'Red Store', tier: 'Gen Z / Streetwear', categoryRelevance: "Men's & Women's Clothing", categoryCodes: ['CAT-01', 'CAT-02'] },
  { name: 'Neo Step', tier: 'Gen Z / Streetwear', categoryRelevance: 'Footwear', categoryCodes: ['CAT-04'] },
  { name: 'FOUND', tier: 'Gen Z / Streetwear', categoryRelevance: "Men's & Women's Clothing", categoryCodes: ['CAT-01', 'CAT-02'] },
  { name: 'AOMI', tier: 'Gen Z / Streetwear', categoryRelevance: "Men's & Women's Clothing", categoryCodes: ['CAT-01', 'CAT-02'] },
  { name: 'MXJ', tier: 'Gen Z / Streetwear', categoryRelevance: "Men's & Women's Clothing", categoryCodes: ['CAT-01', 'CAT-02'] },
  { name: 'Collected', tier: 'Gen Z / Streetwear', categoryRelevance: "Women's Clothing", categoryCodes: ['CAT-01'] },
  { name: 'Manto', tier: 'Gen Z / Streetwear', categoryRelevance: "Men's & Women's Clothing", categoryCodes: ['CAT-01', 'CAT-02'] },
  { name: 'Zayfied', tier: 'Gen Z / Streetwear', categoryRelevance: "Women's Clothing", categoryCodes: ['CAT-01'] },
  { name: 'Salt by Ideas', tier: 'Gen Z / Streetwear', categoryRelevance: "Women's Clothing", categoryCodes: ['CAT-01'] },
  { name: 'Kayal', tier: 'Gen Z / Streetwear', categoryRelevance: "Women's Clothing", categoryCodes: ['CAT-01'] },

  // Kids & Girls
  { name: 'Hopscotch', tier: 'Kids & Girls', categoryRelevance: 'Kids & Baby', categoryCodes: ['CAT-03'] },
  { name: 'Minnie Minors', tier: 'Kids & Girls', categoryRelevance: 'Kids & Baby', categoryCodes: ['CAT-03'] },
  { name: 'Zero & Beyond', tier: 'Kids & Girls', categoryRelevance: 'Kids & Baby', categoryCodes: ['CAT-03'] },
  { name: 'Outfitters Junior', tier: 'Kids & Girls', categoryRelevance: 'Kids & Baby', categoryCodes: ['CAT-03'] },
  { name: 'J. Kids', tier: 'Kids & Girls', categoryRelevance: 'Kids & Baby', categoryCodes: ['CAT-03'] },
  { name: 'Leisure Club Junior', tier: 'Kids & Girls', categoryRelevance: 'Kids & Baby', categoryCodes: ['CAT-03'] },
  { name: 'Bachaa Party', tier: 'Kids & Girls', categoryRelevance: 'Kids & Baby', categoryCodes: ['CAT-03'] },
  { name: 'Pepperland (Beechtree)', tier: 'Kids & Girls', categoryRelevance: 'Kids & Baby', categoryCodes: ['CAT-03'] },
  { name: 'Cocobee Kidswear', tier: 'Kids & Girls', categoryRelevance: 'Kids & Baby', categoryCodes: ['CAT-03'] },
  { name: 'Khaadi Kids', tier: 'Kids & Girls', categoryRelevance: 'Kids & Baby', categoryCodes: ['CAT-03'] },
  { name: 'Sapphire Kidswear', tier: 'Kids & Girls', categoryRelevance: 'Kids & Baby', categoryCodes: ['CAT-03'] },
  { name: 'Sana Safinaz Kidswear', tier: 'Kids & Girls', categoryRelevance: 'Kids & Baby', categoryCodes: ['CAT-03'] },

  // Eyewear
  { name: 'Ray-Ban', tier: 'Eyewear', categoryRelevance: 'Sunglasses, Eyeglasses', categoryCodes: ['CAT-05'] },
  { name: 'Oakley', tier: 'Eyewear', categoryRelevance: 'Sunglasses', categoryCodes: ['CAT-05'] },
  { name: 'DITA', tier: 'Eyewear', categoryRelevance: 'Sunglasses, Eyeglasses', categoryCodes: ['CAT-05'] },
  { name: 'Persol', tier: 'Eyewear', categoryRelevance: 'Sunglasses, Eyeglasses', categoryCodes: ['CAT-05'] },
  { name: 'Police', tier: 'Eyewear', categoryRelevance: 'Sunglasses', categoryCodes: ['CAT-05'] },

  // Bags & Leather
  { name: 'Tory Burch', tier: 'Premium / Luxury', categoryRelevance: 'Bags, Shoes, Accessories', categoryCodes: ['CAT-04', 'CAT-05'] },
  { name: 'Kate Spade', tier: 'Premium / Luxury', categoryRelevance: 'Bags, Accessories', categoryCodes: ['CAT-05'] },
  { name: 'Charles & Keith', tier: 'Moderate / Mass', categoryRelevance: 'Bags, Footwear', categoryCodes: ['CAT-04', 'CAT-05'] },

  // Watches & Jewelry
  { name: 'Casio', tier: 'Moderate / Mass', categoryRelevance: 'Watches', categoryCodes: ['CAT-06'] },
  { name: 'Seiko', tier: 'Moderate / Mass', categoryRelevance: 'Watches', categoryCodes: ['CAT-06'] },
  { name: 'Pandora', tier: 'Moderate / Mass', categoryRelevance: 'Jewelry', categoryCodes: ['CAT-06'] },
  { name: 'Swarovski', tier: 'Premium / Luxury', categoryRelevance: 'Jewelry, Accessories', categoryCodes: ['CAT-06'] },

  // Beauty & Grooming
  { name: 'Huda Beauty', tier: 'Moderate / Mass', categoryRelevance: 'Beauty, Makeup, Cosmetics', categoryCodes: ['CAT-07'] },
  { name: 'MAC Cosmetics', tier: 'Moderate / Mass', categoryRelevance: 'Beauty, Makeup, Cosmetics', categoryCodes: ['CAT-07'] },
  { name: 'Sephora', tier: 'Moderate / Mass', categoryRelevance: 'Beauty, Skincare, Makeup', categoryCodes: ['CAT-07'] },
  { name: 'Fenty Beauty', tier: 'Moderate / Mass', categoryRelevance: 'Beauty, Makeup, Skincare', categoryCodes: ['CAT-07'] },
  { name: 'Charlotte Tilbury', tier: 'Premium / Luxury', categoryRelevance: 'Beauty, Luxury Makeup & Skincare', categoryCodes: ['CAT-07'] },
  { name: 'The Ordinary', tier: 'Moderate / Mass', categoryRelevance: 'Beauty, Skincare', categoryCodes: ['CAT-07'] },
  { name: 'NARS', tier: 'Moderate / Mass', categoryRelevance: 'Beauty, Makeup', categoryCodes: ['CAT-07'] },
  { name: 'Maybelline', tier: 'Moderate / Mass', categoryRelevance: 'Beauty, Makeup, Cosmetics', categoryCodes: ['CAT-07'] },
  { name: "L'Oreal", tier: 'Moderate / Mass', categoryRelevance: 'Beauty, Skincare, Haircare, Makeup', categoryCodes: ['CAT-07'] },
  { name: 'Clinique', tier: 'Moderate / Mass', categoryRelevance: 'Beauty, Skincare', categoryCodes: ['CAT-07'] },
  { name: 'Rare Beauty', tier: 'Moderate / Mass', categoryRelevance: 'Beauty, Makeup', categoryCodes: ['CAT-07'] },
  { name: 'Saeed Ghani', tier: 'Local Mass', categoryRelevance: 'Beauty, Fragrances, Skincare, Haircare', categoryCodes: ['CAT-07'] },
  { name: 'Hemani', tier: 'Local Mass', categoryRelevance: 'Beauty, Fragrances, Skincare', categoryCodes: ['CAT-07'] },
];

// ── Policy Guardrails: Derived Directly from Brand Tiers ───────────────────
/**
 * Checks if a brand represents a registered international luxury trademark.
 * Under Apple App Store Guideline 5.2.3 and Google Play Counterfeit Policy,
 * listing replicas/inspired goods under protected designer names triggers takedowns.
 */
export const isStrictTrademarkBrand = (brandName: string | null | undefined): boolean => {
  if (!brandName) return false;
  const lower = brandName.toLowerCase().trim();
  const brand = TAXONOMY_BRANDS.find((b) => b.name.toLowerCase() === lower);
  return brand?.tier === 'Premium / Luxury';
};

/**
 * Checks if a brand is high-value couture (global luxury or local couture).
 * Triggers elevated proof recommendations in the listing flow.
 */
export const isHighValueDesigner = (brandName: string | null | undefined): boolean => {
  if (!brandName) return false;
  const lower = brandName.toLowerCase().trim();
  const brand = TAXONOMY_BRANDS.find((b) => b.name.toLowerCase() === lower);
  return brand?.tier === 'Premium / Luxury' || brand?.tier === 'Local Luxury / Couture';
};

// ── Pre-Compiled Search Indexes (Module-Load Zero-Lag Optimization) ────────
const BRAND_BY_LOWER = new Map<string, TaxonomyBrand>(
  TAXONOMY_BRANDS.map((b) => [b.name.toLowerCase(), b]),
);

// High-frequency Eastern wear brands prioritizing Shalwar Kameez / Kurtas
const EASTERN_WEAR_PREFERRED_BRANDS = [
  'Khaadi',
  'J. (Junaid Jamshed)',
  'Sapphire',
  'Bonanza Satrangi',
  'Gul Ahmed',
  'Alkaram Studio',
  'Edenrobe',
  'Limelight',
  'Zellbury',
  'Ethnic',
  'Maria B',
  'Sana Safinaz',
  'Charcoal',
  'Amir Adnan',
  'Royal Tag',
  'Diners',
  UNBRANDED_LOCAL_TAILOR,
];

// Phonetic stem variants / aliases for Pakistani transliterations
export const PHONETIC_ALIASES: Record<string, string[]> = {
  kameez: ['qameez', 'kameez', 'kamiz', 'qamiz', 'suit'],
  kurta: ['kurti', 'kurtas', 'kurtis', 'kurta'],
  shalwar: ['salwar', 'shalwar'],
  khussa: ['khussas', 'khussa', 'khosa'],
  chappal: ['chappals', 'chapal', 'chappal', 'peshawari', 'norzi'],
  dupatta: ['dupatta', 'dupata', 'chaddar', 'chadar', 'shawl'],
  unstitched: ['unstitched', 'lawn', 'fabric'],
  stitched: ['stitched', 'pret', 'ready to wear'],
  abaya: ['abaya', 'abayas', 'hijab', 'burqa', 'modest'],
  sneakers: ['sneaker', 'sneakers', 'trainer', 'trainers', 'kicks', 'joggers'],
};

// ── Normalization Helper ──────────────────────────────────────────────────
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[-_&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Classification Output Shape ───────────────────────────────────────────
export interface CategorySuggestion {
  code: string;
  rootCategory: Category;
  subcategoryId: string;
  categoryLabel: string;
  subcategoryLabel: string;
  gender: Gender;
  label: string; // e.g. "Men's: Kurta Shalwar Kameez"
}

export interface SmartClassificationResult {
  suggestedCategories: CategorySuggestion[];
  suggestedBrands: string[];
  detectedBrand?: string;
}

// ── Smart Classification Engine ───────────────────────────────────────────
/**
 * Scans title text using pre-compiled tokens and phonetic aliasing.
 * Returns non-destructive category candidates (dual-gender when ambiguous)
 * and relevant brand recommendations.
 */
export function smartClassify(
  rawTitle: string,
  currentGender?: Gender | null,
): SmartClassificationResult {
  const norm = normalizeText(rawTitle);
  if (norm.length < 2) {
    return { suggestedCategories: [], suggestedBrands: [] };
  }

  // 1. Detect if a known brand is present in the title
  let detectedBrand: string | undefined;
  for (const brand of TAXONOMY_BRANDS) {
    const bNorm = normalizeText(brand.name);
    if (!bNorm) continue;
    // Word boundary check
    const regex = new RegExp(`(^|\\s)${bNorm.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}(\\s|$)`, 'i');
    if (regex.test(norm)) {
      detectedBrand = brand.name;
      break;
    }
  }

  const tokens = norm.split(' ');

  // 2. Gender intent markers
  const hasWomenMarker = tokens.some((t) => ['women', 'womens', "women's", 'female', 'ladies', 'lady', 'girl', 'girls'].includes(t));
  const hasMenMarker = tokens.some((t) => ['men', 'mens', "men's", 'male', 'gents', 'gent', 'boy', 'boys'].includes(t));

  // 3. Keyword / Concept detection
  const isShalwarKameez =
    norm.includes('shalwar') ||
    norm.includes('salwar') ||
    norm.includes('kameez') ||
    norm.includes('qameez') ||
    norm.includes('kamiz') ||
    norm.includes('qamiz') ||
    norm.includes('kurta') ||
    norm.includes('kurti');

  const isLawnUnstitched =
    norm.includes('lawn') ||
    norm.includes('unstitched') ||
    norm.includes('3 piece') ||
    norm.includes('2 piece') ||
    norm.includes('suit fabric');

  const isBridalFormal =
    norm.includes('bridal') ||
    norm.includes('lehenga') ||
    norm.includes('sharara') ||
    norm.includes('gharara') ||
    norm.includes('maxi') ||
    norm.includes('anarkali');

  const isFootwear =
    norm.includes('sneaker') ||
    norm.includes('sneakers') ||
    norm.includes('shoes') ||
    norm.includes('shoe') ||
    norm.includes('khussa') ||
    norm.includes('chappal') ||
    norm.includes('peshawari') ||
    norm.includes('heels') ||
    norm.includes('sandals') ||
    norm.includes('boots') ||
    norm.includes('loafers');

  const isEyewear =
    norm.includes('sunglass') ||
    norm.includes('sunglasses') ||
    norm.includes('shades') ||
    norm.includes('frames') ||
    norm.includes('optical') ||
    norm.includes('glasses');

  const isBags =
    norm.includes('handbag') ||
    norm.includes('tote') ||
    norm.includes('shoulder bag') ||
    norm.includes('crossbody') ||
    norm.includes('backpack') ||
    norm.includes('clutch') ||
    norm.includes('wallet');

  const isWatchesJewelry =
    norm.includes('watch') ||
    norm.includes('necklace') ||
    norm.includes('ring') ||
    norm.includes('earring') ||
    norm.includes('jhumka') ||
    norm.includes('bracelet');

  const candidates: CategorySuggestion[] = [];

  // Ambiguous Eastern Wear dual-candidate generation
  if (isShalwarKameez || isLawnUnstitched || isBridalFormal) {
    const menCandidate: CategorySuggestion = {
      code: 'CAT-02',
      rootCategory: 'clothing',
      subcategoryId: 'kurta_shalwar_kameez',
      categoryLabel: "Men's Clothing",
      subcategoryLabel: 'Kurta Shalwar Kameez',
      gender: 'men',
      label: "Men's: Kurta Shalwar Kameez",
    };

    const womenCandidate: CategorySuggestion = isLawnUnstitched
      ? {
          code: 'CAT-01',
          rootCategory: 'clothing',
          subcategoryId: 'lawn_unstitched',
          categoryLabel: "Women's Clothing",
          subcategoryLabel: 'Lawn / Unstitched Suits',
          gender: 'women',
          label: "Women's: Lawn / Unstitched Suits",
        }
      : {
          code: 'CAT-01',
          rootCategory: 'clothing',
          subcategoryId: 'stitched_2_3_piece',
          categoryLabel: "Women's Clothing",
          subcategoryLabel: 'Stitched 2-Piece / 3-Piece',
          gender: 'women',
          label: "Women's: Stitched 2-Piece / 3-Piece",
        };

    const bridalCandidate: CategorySuggestion = {
      code: 'CAT-01',
      rootCategory: 'clothing',
      subcategoryId: 'eastern_formal_bridal',
      categoryLabel: "Women's Clothing",
      subcategoryLabel: 'Eastern Formal & Bridal Wear',
      gender: 'women',
      label: "Women's: Eastern Formal & Bridal",
    };

    if (isBridalFormal) {
      candidates.push(bridalCandidate);
    } else if (hasMenMarker && !hasWomenMarker) {
      candidates.push(menCandidate);
    } else if (hasWomenMarker && !hasMenMarker) {
      candidates.push(womenCandidate);
      if (isLawnUnstitched) {
        candidates.push({
          code: 'CAT-01',
          rootCategory: 'clothing',
          subcategoryId: 'stitched_2_3_piece',
          categoryLabel: "Women's Clothing",
          subcategoryLabel: 'Stitched 2-Piece / 3-Piece',
          gender: 'women',
          label: "Women's: Stitched 2/3-Piece",
        });
      }
    } else {
      // Dual-gender ambiguity: prioritize based on currentGender if set
      if (currentGender === 'men') {
        candidates.push(menCandidate, womenCandidate);
      } else {
        candidates.push(womenCandidate, menCandidate);
      }
    }
  } else if (isFootwear) {
    if (norm.includes('khussa') || norm.includes('chappal') || norm.includes('peshawari')) {
      candidates.push({
        code: 'CAT-04',
        rootCategory: 'shoes',
        subcategoryId: 'khussas_chappals',
        categoryLabel: 'Footwear',
        subcategoryLabel: 'Khussas / Chappals',
        gender: currentGender || 'unisex',
        label: 'Footwear: Khussas / Chappals',
      });
    } else if (norm.includes('sneaker') || norm.includes('runner') || norm.includes('jogger')) {
      candidates.push({
        code: 'CAT-04',
        rootCategory: 'shoes',
        subcategoryId: 'sneakers',
        categoryLabel: 'Footwear',
        subcategoryLabel: 'Sneakers',
        gender: currentGender || 'unisex',
        label: 'Footwear: Sneakers',
      });
    } else if (norm.includes('heel') || norm.includes('sandal')) {
      candidates.push({
        code: 'CAT-04',
        rootCategory: 'shoes',
        subcategoryId: 'heels_sandals',
        categoryLabel: 'Footwear',
        subcategoryLabel: 'Heels & Sandals',
        gender: 'women',
        label: 'Footwear: Heels & Sandals',
      });
    } else {
      candidates.push({
        code: 'CAT-04',
        rootCategory: 'shoes',
        subcategoryId: 'formal_shoes',
        categoryLabel: 'Footwear',
        subcategoryLabel: 'Formal Shoes',
        gender: currentGender || 'men',
        label: 'Footwear: Formal Shoes',
      });
    }
  } else if (isEyewear) {
    const subcat = norm.includes('frame') || norm.includes('optical') ? 'eyeglasses' : 'sunglasses';
    candidates.push({
      code: 'CAT-05',
      rootCategory: 'accessories',
      subcategoryId: subcat,
      categoryLabel: 'Bags & Accessories',
      subcategoryLabel: norm.includes('frame') || norm.includes('optical') ? 'Eyeglasses / Optical Frames' : 'Sunglasses',
      gender: 'unisex',
      label: norm.includes('frame') || norm.includes('optical') ? 'Eyewear: Optical Frames' : 'Eyewear: Sunglasses',
    });
  } else if (isBags) {
    candidates.push({
      code: 'CAT-05',
      rootCategory: 'bags',
      subcategoryId: norm.includes('backpack') ? 'backpacks' : norm.includes('wallet') ? 'wallets_clutches' : 'handbags_totes',
      categoryLabel: 'Bags & Accessories',
      subcategoryLabel: norm.includes('backpack') ? 'Backpacks' : norm.includes('wallet') ? 'Wallets & Clutches' : 'Handbags & Totes',
      gender: 'unisex',
      label: norm.includes('backpack') ? 'Bags: Backpacks' : norm.includes('wallet') ? 'Bags: Wallets' : 'Bags: Handbags & Totes',
    });
  } else if (isWatchesJewelry) {
    candidates.push({
      code: 'CAT-06',
      rootCategory: 'accessories',
      subcategoryId: norm.includes('watch') ? 'watches' : norm.includes('jhumka') ? 'ethnic_traditional_jewelry' : 'fashion_jewelry',
      categoryLabel: 'Jewelry & Watches',
      subcategoryLabel: norm.includes('watch') ? 'Watches' : norm.includes('jhumka') ? 'Ethnic / Traditional Jewelry' : 'Fashion Jewelry',
      gender: 'unisex',
      label: norm.includes('watch') ? 'Watches' : 'Jewelry',
    });
  }

  // 4. Determine Recommended Brands for this item
  let suggestedBrands: string[] = [];
  if (isShalwarKameez || isLawnUnstitched || isBridalFormal) {
    suggestedBrands = EASTERN_WEAR_PREFERRED_BRANDS;
  } else if (isFootwear) {
    suggestedBrands = ['Nike', 'Adidas', 'Puma', 'Borjan', 'Servis', 'Bata', 'Stoneage', 'Jordans', NO_BRAND];
  } else if (isEyewear) {
    suggestedBrands = ['Ray-Ban', 'Oakley', 'DITA', 'Persol', 'Police', 'Tom Ford', 'Gucci'];
  } else if (isBags) {
    suggestedBrands = ['Gucci', 'Louis Vuitton', 'Coach', 'Michael Kors', 'Chanel', 'Prada', 'Fossil', NO_BRAND];
  } else if (isWatchesJewelry) {
    suggestedBrands = ['Rolex', 'Cartier', 'Fossil', 'Michael Kors', NO_BRAND];
  } else if (detectedBrand) {
    suggestedBrands = [detectedBrand, NO_BRAND];
  }

  return {
    suggestedCategories: candidates,
    suggestedBrands,
    detectedBrand,
  };
}

// ── Two-Way Graph Helpers ─────────────────────────────────────────────────

/** Returns normalized category codes ('CAT-01', 'CAT-04', etc.) matching category/subcategory */
export function getCategoryCodesForSelection(
  categoryCodeOrRoot?: string | null,
  subcategoryId?: string | null,
): string[] {
  if (subcategoryId) {
    const cat = TAXONOMY_CATEGORIES.find((c) => c.subcategories.some((s) => s.id === subcategoryId));
    if (cat) return [cat.code];
  }
  if (!categoryCodeOrRoot) return [];
  const normalized = categoryCodeOrRoot.toLowerCase().trim();
  if (normalized.startsWith('cat-')) return [categoryCodeOrRoot.toUpperCase()];
  if (normalized === 'shoes' || normalized === 'footwear') return ['CAT-04'];
  if (normalized === 'bags') return ['CAT-05'];
  if (normalized === 'accessories') return ['CAT-06', 'CAT-05'];
  if (normalized === 'beauty') return ['CAT-07'];
  if (normalized === 'clothing') return ['CAT-01', 'CAT-02', 'CAT-03'];
  return [];
}

/** Returns brands belonging to or relevant to a given category code or subcategory */
export function getBrandsForCategory(
  categoryCodeOrRoot: string,
  subcategoryId?: string | null,
): TaxonomyBrand[] {
  const norm = (categoryCodeOrRoot || '').toLowerCase().trim();
  const sub = (subcategoryId || '').toLowerCase().trim();

  // If Men's Eastern
  if (sub === 'kurta_shalwar_kameez') {
    return TAXONOMY_BRANDS.filter(
      (b) =>
        b.categoryCodes.includes('CAT-02') &&
        (b.tier === 'Local Modern Menswear' ||
          b.tier === 'Local Premium' ||
          b.tier === 'Local Mass' ||
          b.tier === 'Local Luxury / Couture'),
    );
  }
  // If Footwear / Shoes
  if (
    norm === 'cat-04' ||
    norm === 'shoes' ||
    norm === 'footwear' ||
    ['sneakers', 'formal_shoes', 'khussas_chappals', 'heels_sandals', 'sports_shoes', 'boots', 'flats'].includes(sub)
  ) {
    return TAXONOMY_BRANDS.filter((b) => b.categoryCodes.includes('CAT-04'));
  }
  // If Eyewear
  if (sub === 'sunglasses' || sub === 'eyeglasses') {
    return TAXONOMY_BRANDS.filter((b) => b.tier === 'Eyewear' || b.categoryRelevance.includes('Eyewear') || b.categoryRelevance.includes('Sunglasses'));
  }
  // If Beauty
  if (norm === 'cat-07' || norm === 'beauty') {
    return TAXONOMY_BRANDS.filter((b) => b.categoryCodes.includes('CAT-07'));
  }
  // If Bags
  if (norm === 'cat-05' || norm === 'bags' || ['handbags_totes', 'backpacks', 'wallets_clutches'].includes(sub)) {
    return TAXONOMY_BRANDS.filter((b) => b.categoryCodes.includes('CAT-05') && (b.categoryRelevance.toLowerCase().includes('bag') || b.categoryRelevance.toLowerCase().includes('wallet') || b.categoryRelevance.toLowerCase().includes('clutch')));
  }

  const codes = getCategoryCodesForSelection(categoryCodeOrRoot, subcategoryId);
  if (codes.length === 0) return TAXONOMY_BRANDS;

  return TAXONOMY_BRANDS.filter((b) => b.categoryCodes.some((code) => codes.includes(code)));
}

const RECOMMENDED_BY_CATEGORY: Record<string, string[]> = {
  shoes: [
    'Nike',
    'Adidas',
    'Jordans',
    'New Balance',
    'Converse',
    'Vans',
    'Puma',
    'Bata',
    'Servis',
    'Borjan',
    'Stylo',
    'Hush Puppies',
    'Skechers',
    'Reebok',
    'Aldo',
    'Clarks',
  ],
  clothing: [
    'Khaadi',
    'Sapphire',
    'Sana Safinaz',
    'Maria B',
    'Zara',
    'H&M',
    'Gul Ahmed',
    'Limelight',
    'Alkaram Studio',
    'Bonanza Satrangi',
    'Asim Jofa',
    'Elan',
    'Baroque',
    'Agha Noor',
    'J. (Junaid Jamshed)',
    'Outfitters',
    "Levi's",
  ],
  bags: [
    'Louis Vuitton',
    'Gucci',
    'Coach',
    'Michael Kors',
    'Chanel',
    'Prada',
    'Dior',
    'Fossil',
    'Tory Burch',
    'Kate Spade',
    'Charles & Keith',
  ],
  accessories: [
    'Rolex',
    'Cartier',
    'Ray-Ban',
    'Oakley',
    'Fossil',
    'Casio',
    'Seiko',
    'Michael Kors',
    'DITA',
    'Persol',
    'Pandora',
    'Swarovski',
  ],
  beauty: [
    'Huda Beauty',
    'MAC Cosmetics',
    'Sephora',
    'Fenty Beauty',
    'Charlotte Tilbury',
    'The Ordinary',
    'NARS',
    'Maybelline',
    "L'Oreal",
    'Clinique',
    'Rare Beauty',
    'Saeed Ghani',
    'Hemani',
  ],
};

/**
 * Returns strictly curated, high-relevance recommended brands for a given category/subcategory.
 * Guarantees that selecting Shoes only recommends Footwear brands, Beauty only recommends Beauty brands, etc.
 */
export function getRecommendedBrandsForCategory(
  categoryCodeOrRoot?: string | null,
  subcategoryId?: string | null,
): TaxonomyBrand[] {
  const norm = (categoryCodeOrRoot || '').toLowerCase().trim();
  const sub = (subcategoryId || '').toLowerCase().trim();

  let key = 'clothing';
  if (
    norm === 'shoes' ||
    norm === 'cat-04' ||
    norm === 'footwear' ||
    ['sneakers', 'formal_shoes', 'khussas_chappals', 'heels_sandals', 'sports_shoes', 'boots', 'flats'].includes(sub)
  ) {
    key = 'shoes';
  } else if (norm === 'beauty' || norm === 'cat-07') {
    key = 'beauty';
  } else if (norm === 'bags' || ['handbags_totes', 'backpacks', 'wallets_clutches'].includes(sub)) {
    key = 'bags';
  } else if (norm === 'accessories' || norm === 'cat-06' || ['sunglasses', 'eyeglasses', 'watches', 'fashion_jewelry', 'ethnic_traditional_jewelry'].includes(sub)) {
    key = 'accessories';
  } else if (norm === 'clothing' || norm.startsWith('cat-01') || norm.startsWith('cat-02') || norm.startsWith('cat-03')) {
    key = 'clothing';
  } else {
    // If no category selected
    return TAXONOMY_BRANDS.slice(0, 12);
  }

  const names = RECOMMENDED_BY_CATEGORY[key] || [];
  const results: TaxonomyBrand[] = [];

  for (const name of names) {
    const brand = BRAND_BY_LOWER.get(name.toLowerCase());
    if (brand && !results.some((r) => r.name.toLowerCase() === brand.name.toLowerCase())) {
      results.push(brand);
    }
  }

  return results;
}

/** Returns categories relevant to a selected brand */
export function getCategoriesForBrand(brandName: string): TaxonomyCategory[] {
  const brand = BRAND_BY_LOWER.get(brandName.toLowerCase().trim());
  if (!brand) return TAXONOMY_CATEGORIES;
  return TAXONOMY_CATEGORIES.filter((c) => brand.categoryCodes.includes(c.code));
}

/** Checks for cross-field conflict (e.g. Ray-Ban selected with Men's Kurta Shalwar) */
export function checkBrandCategoryCompatibility(
  brandName: string | null | undefined,
  subcategoryId?: string | null,
): { compatible: boolean; advisory?: string } {
  if (
    !brandName ||
    brandName.toLowerCase() === 'no brand' ||
    brandName === UNBRANDED_LOCAL_TAILOR
  ) {
    return { compatible: true };
  }

  const brand = BRAND_BY_LOWER.get(brandName.toLowerCase().trim());
  if (!brand) return { compatible: true };

  // Example: Eyewear brand with clothing subcategory
  if (brand.tier === 'Eyewear') {
    const isEyewearSub = subcategoryId === 'sunglasses' || subcategoryId === 'eyeglasses';
    if (!isEyewearSub && subcategoryId) {
      return {
        compatible: false,
        advisory: `${brand.name} typically makes Eyewear (Sunglasses & Frames). Keep ${brand.name} or switch to No brand?`,
      };
    }
  }

  // Example: Footwear-only brand with clothing subcategory
  if (brand.tier === 'Footwear' && subcategoryId) {
    const isFootwearSub = [
      'sneakers',
      'formal_shoes',
      'flats',
      'khussas_chappals',
      'heels_sandals',
      'sports_shoes',
      'boots',
    ].includes(subcategoryId);
    if (!isFootwearSub) {
      return {
        compatible: false,
        advisory: `${brand.name} specializes in Footwear. Keep ${brand.name} or switch to Unbranded / Local Tailor?`,
      };
    }
  }

  return { compatible: true };
}

