// Pre-search suggestion generator and highlight utility.
//
// Matches input queries against:
// 1. Curated category-specific associations & natural marketplace searches
// 2. Curated brand-to-garment & garment-to-brand pairings
// 3. Curated aesthetic-to-item pairings
// 4. Taxonomy subcategories & keywords from CATEGORIES
// 5. User recent search history
// 6. Dynamic catalog tags and brand indexes

import { CATEGORIES } from '@/lib/categories';

export interface SuggestionHighlightPart {
  text: string;
  isMatch: boolean;
}

export interface SearchSuggestion {
  id: string;
  text: string;
  /** Substring parts to style typed query as normal and completed text as bold */
  parts: SuggestionHighlightPart[];
  category?: string;
  isRecent?: boolean;
}

export interface GetSearchSuggestionsOptions {
  recentSearches?: string[];
  customTags?: string[];
  customBrands?: string[];
  limit?: number;
}

const TOP_SUGGESTIONS = [
  'tops women',
  'tops y2k',
  'tops for women',
  'tops',
  'tops women y2k',
  'tops hollister',
  'tops with sleeves',
  'tops vintage',
  'tops zara',
  'tops corset',
  'tops long sleeve',
  'tops cropped',
  'tops short sleeve',
  'tops brandy melville',
  'tops halter',
  'tops knitted',
  'tops mesh',
];

const DRESS_SUGGESTIONS = [
  'dresses women',
  'dresses y2k',
  'dresses vintage',
  'dresses for women',
  'dresses maxi',
  'dresses zara',
  'dresses mini',
  'dresses summer',
  'dresses bodycon',
  'dresses long sleeve',
  'dresses slip',
  'dresses floral',
  'dresses satin',
  'dresses prom',
];

const JEAN_SUGGESTIONS = [
  'jeans baggy',
  'jeans women',
  'jeans low rise',
  'jeans wide leg',
  'jeans y2k',
  'jeans levi\'s',
  'jeans vintage',
  'jeans flare',
  'jeans cargo',
  'jeans straight leg',
  'jeans for women',
  'jeans men',
];

const HOODIE_SUGGESTIONS = [
  'hoodies oversized',
  'hoodies zip up',
  'hoodies vintage',
  'hoodies nike',
  'hoodies y2k',
  'hoodies streetwear',
  'hoodies graphic',
  'hoodies for men',
  'hoodies for women',
  'hoodies stussy',
  'hoodies carhartt',
  'hoodies gap',
];

const JACKET_SUGGESTIONS = [
  'jackets leather',
  'jackets vintage',
  'jackets racing',
  'jackets puffer',
  'jackets bomber',
  'jackets streetwear',
  'jackets denim',
  'jackets carhartt',
  'jackets north face',
  'jackets varsity',
  'jackets windbreaker',
  'jackets women',
];

const SNEAKER_SUGGESTIONS = [
  'sneakers nike',
  'sneakers adidas',
  'sneakers women',
  'sneakers vintage',
  'sneakers platform',
  'sneakers new balance',
  'sneakers y2k',
  'sneakers sambas',
  'sneakers asics',
  'sneakers dunk',
  'sneakers jordan',
];

const SHOE_SUGGESTIONS = [
  'shoes sneakers',
  'shoes platform',
  'shoes vintage',
  'shoes women',
  'shoes loafers',
  'shoes heels',
  'shoes doc martens',
];

const BOOT_SUGGESTIONS = [
  'boots chunky',
  'boots leather',
  'boots platform',
  'boots vintage',
  'boots cowboy',
  'boots knee high',
  'boots ankle',
  'boots doc martens',
];

const BAG_SUGGESTIONS = [
  'bags shoulder',
  'bags vintage',
  'bags crossbody',
  'bags y2k',
  'bags leather',
  'bags tote',
  'bags coach',
  'bags mini',
  'bags designer',
];

const SKIRT_SUGGESTIONS = [
  'skirts mini',
  'skirts pleated',
  'skirts maxi',
  'skirts denim',
  'skirts y2k',
  'skirts cargo',
  'skirts floral',
  'skirts midi',
  'skirts low rise',
];

const PANT_SUGGESTIONS = [
  'pants cargo',
  'pants wide leg',
  'pants parachute',
  'pants baggy',
  'pants linen',
  'pants vintage',
  'pants low rise',
  'pants leather',
];

const SHORT_SUGGESTIONS = [
  'shorts denim',
  'shorts jorts',
  'shorts cargo',
  'shorts vintage',
  'shorts baggy',
  'shorts sweat',
];

const SWEATER_SUGGESTIONS = [
  'sweaters vintage',
  'sweaters oversized',
  'sweaters knit',
  'sweaters cable knit',
  'sweaters y2k',
  'sweaters cardigan',
  'sweaters cropped',
];

// ── Category-Specific Suggestions Map ───────────────────────────────────────
// High-relevance, realistic marketplace search phrases organized by category root.
const CATEGORY_SUGGESTIONS_MAP: Record<string, string[]> = {
  top: TOP_SUGGESTIONS,
  tops: TOP_SUGGESTIONS,
  dress: DRESS_SUGGESTIONS,
  dresses: DRESS_SUGGESTIONS,
  jean: JEAN_SUGGESTIONS,
  jeans: JEAN_SUGGESTIONS,
  hoodie: HOODIE_SUGGESTIONS,
  hoodies: HOODIE_SUGGESTIONS,
  jacket: JACKET_SUGGESTIONS,
  jackets: JACKET_SUGGESTIONS,
  sneaker: SNEAKER_SUGGESTIONS,
  sneakers: SNEAKER_SUGGESTIONS,
  shoe: SHOE_SUGGESTIONS,
  shoes: SHOE_SUGGESTIONS,
  boot: BOOT_SUGGESTIONS,
  boots: BOOT_SUGGESTIONS,
  bag: BAG_SUGGESTIONS,
  bags: BAG_SUGGESTIONS,
  skirt: SKIRT_SUGGESTIONS,
  skirts: SKIRT_SUGGESTIONS,
  pant: PANT_SUGGESTIONS,
  pants: PANT_SUGGESTIONS,
  short: SHORT_SUGGESTIONS,
  shorts: SHORT_SUGGESTIONS,
  sweater: SWEATER_SUGGESTIONS,
  sweaters: SWEATER_SUGGESTIONS,
  knitwear: [
    'knitwear sweater',
    'knitwear cardigan',
    'knitwear vintage',
    'knitwear top',
    'knitwear vest',
    'knitwear chunky',
  ],
  tshirt: [
    't-shirts graphic',
    't-shirts vintage',
    't-shirts oversized',
    't-shirts baby tee',
    't-shirts streetwear',
    't-shirts y2k',
    't-shirts band tee',
  ],
  tee: [
    'baby tee',
    'baby tee y2k',
    'graphic tee',
    'vintage tee',
    'oversized tee',
    'band tee',
  ],
  jewelry: [
    'jewelry silver',
    'jewelry vintage',
    'jewelry gold',
    'jewelry y2k',
    'jewelry rings',
    'jewelry necklace',
    'jewelry stainless steel',
  ],
  belt: [
    'belts leather',
    'belts y2k',
    'belts diesel',
    'belts western',
    'belts studded',
    'belts grommet',
    'belts vintage',
  ],
  sunglasses: [
    'sunglasses y2k',
    'sunglasses vintage',
    'sunglasses oakley',
    'sunglasses rimless',
    'sunglasses wrap around',
    'sunglasses designer',
  ],
};

// ── Brand-Specific Suggestions Map ──────────────────────────────────────────
const BRAND_SUGGESTIONS_MAP: Record<string, string[]> = {
  nike: [
    'nike',
    'nike sneakers',
    'nike hoodie',
    'nike women',
    'nike vintage',
    'nike sweatpants',
    'nike tech',
    'nike jacket',
    'nike air max',
    'nike shoes',
    'nike windbreaker',
    'nike dunk',
    'nike shorts',
  ],
  zara: [
    'zara',
    'zara women',
    'zara dress',
    'zara top',
    'zara jacket',
    'zara leather jacket',
    'zara pants',
    'zara blazer',
    'zara knitwear',
    'zara skirt',
    'zara coat',
  ],
  hollister: [
    'hollister',
    'hollister top',
    'hollister hoodie',
    'hollister jeans',
    'hollister vintage',
    'hollister sweater',
    'hollister y2k',
    'hollister babydoll top',
    'hollister shorts',
  ],
  brandy: [
    'brandy melville',
    'brandy melville top',
    'brandy melville sweater',
    'brandy melville hoodie',
    'brandy melville skirt',
    'brandy melville tank',
    'brandy melville pants',
  ],
  'brandy melville': [
    'brandy melville',
    'brandy melville top',
    'brandy melville sweater',
    'brandy melville hoodie',
    'brandy melville skirt',
    'brandy melville tank',
    'brandy melville pants',
  ],
  stussy: [
    'stussy',
    'stussy hoodie',
    'stussy t-shirt',
    'stussy fleece',
    'stussy jacket',
    'stussy vintage',
    'stussy cap',
    'stussy 8 ball',
    'stussy knit',
  ],
  carhartt: [
    'carhartt',
    'carhartt jacket',
    'carhartt double knee',
    'carhartt hoodie',
    'carhartt pants',
    'carhartt vest',
    'carhartt vintage',
    'carhartt detroit jacket',
  ],
  "levi's": [
    "levi's",
    'levi\'s 501',
    'levi\'s vintage',
    'levi\'s denim jacket',
    'levi\'s jeans',
    'levi\'s 550',
    'levi\'s shorts',
    'levi\'s baggy',
  ],
  levis: [
    'levis',
    'levi\'s 501',
    'levi\'s vintage',
    'levi\'s denim jacket',
    'levi\'s jeans',
    'levi\'s 550',
    'levi\'s shorts',
    'levi\'s baggy',
  ],
  adidas: [
    'adidas',
    'adidas sneakers',
    'adidas track jacket',
    'adidas samba',
    'adidas gazelle',
    'adidas vintage',
    'adidas track pants',
    'adidas campus',
  ],
  diesel: [
    'diesel',
    'diesel belt',
    'diesel jeans',
    'diesel top',
    'diesel bag',
    'diesel y2k',
    'diesel vintage',
    'diesel jacket',
  ],
  'ralph lauren': [
    'ralph lauren polo',
    'ralph lauren sweater',
    'ralph lauren shirt',
    'ralph lauren vintage',
    'ralph lauren jacket',
    'ralph lauren cable knit',
  ],
  'north face': [
    'the north face puffer',
    'the north face jacket',
    'the north face fleece',
    'the north face nuptse',
    'the north face windbreaker',
  ],
  patagonia: [
    'patagonia fleece',
    'patagonia jacket',
    'patagonia vest',
    'patagonia synchilla',
    'patagonia t-shirt',
  ],
  'new balance': [
    'new balance 550',
    'new balance sneakers',
    'new balance 990',
    'new balance 1906',
    'new balance 2002r',
  ],
  'acne studios': [
    'acne studios scarf',
    'acne studios jeans',
    'acne studios sweater',
    'acne studios jacket',
    'acne studios t-shirt',
  ],
  'urban outfitters': [
    'urban outfitters top',
    'urban outfitters dress',
    'urban outfitters pants',
    'urban outfitters jacket',
    'urban outfitters corset',
  ],
  'ed hardy': [
    'ed hardy t-shirt',
    'ed hardy hoodie',
    'ed hardy jacket',
    'ed hardy cap',
    'ed hardy vintage',
  ],
  'harley davidson': [
    'harley davidson t-shirt',
    'harley davidson hoodie',
    'harley davidson leather jacket',
    'harley davidson vintage',
  ],
  gap: [
    'gap hoodie',
    'gap vintage hoodie',
    'gap jeans',
    'gap sweater',
    'gap leather jacket',
  ],
};

// ── Aesthetic / Style Suggestions Map ───────────────────────────────────────
const STYLE_SUGGESTIONS_MAP: Record<string, string[]> = {
  y2k: [
    'y2k top',
    'y2k jeans',
    'y2k dress',
    'y2k hoodie',
    'y2k baby tee',
    'y2k sunglasses',
    'y2k skirt',
    'y2k bag',
    'y2k cargo',
    'y2k track jacket',
  ],
  vintage: [
    'vintage jacket',
    'vintage t-shirt',
    'vintage hoodie',
    'vintage leather jacket',
    'vintage jeans',
    'vintage sweater',
    'vintage dress',
    'vintage carhartt',
    'vintage nike',
    'vintage racing jacket',
  ],
  streetwear: [
    'streetwear hoodie',
    'streetwear pants',
    'streetwear jacket',
    'streetwear t-shirt',
    'streetwear cargo',
    'streetwear vintage',
    'streetwear bag',
  ],
  coquette: [
    'coquette top',
    'coquette dress',
    'coquette skirt',
    'coquette cardigan',
    'coquette knitwear',
    'coquette babydoll',
    'coquette lace',
  ],
  grunge: [
    'grunge top',
    'grunge hoodie',
    'grunge pants',
    'grunge sweater',
    'grunge jacket',
    'grunge boots',
    'grunge fairy',
  ],
  cottagecore: [
    'cottagecore dress',
    'cottagecore top',
    'cottagecore skirt',
    'cottagecore cardigan',
    'cottagecore knitwear',
    'cottagecore blouse',
  ],
  goth: [
    'goth top',
    'goth dress',
    'goth skirt',
    'goth boots',
    'goth platform',
    'goth jewelry',
  ],
  preppy: [
    'preppy sweater',
    'preppy skirt',
    'preppy polo',
    'preppy blazer',
    'preppy vest',
    'preppy knit',
  ],
  retro: [
    'retro jacket',
    'retro sunglasses',
    'retro jersey',
    'retro sneakers',
    'retro tracksuit',
  ],
};

// ── Attribute / Cut Suggestions Map ─────────────────────────────────────────
const ATTRIBUTE_SUGGESTIONS_MAP: Record<string, string[]> = {
  leather: [
    'leather jacket',
    'leather pants',
    'leather bag',
    'leather boots',
    'leather skirt',
    'leather trench',
    'leather blazer',
    'leather bomber',
  ],
  oversized: [
    'oversized hoodie',
    'oversized t-shirt',
    'oversized sweater',
    'oversized jacket',
    'oversized blazer',
    'oversized leather jacket',
  ],
  cropped: [
    'cropped top',
    'cropped hoodie',
    'cropped jacket',
    'cropped sweater',
    'cropped puffer',
    'cropped cardigan',
    'cropped baby tee',
  ],
  baggy: [
    'baggy jeans',
    'baggy pants',
    'baggy jorts',
    'baggy cargo',
    'baggy shorts',
    'baggy sweatpants',
  ],
  cargo: [
    'cargo pants',
    'cargo skirt',
    'cargo shorts',
    'cargo jeans',
    'cargo hoodie',
    'cargo jacket',
  ],
  corset: [
    'corset top',
    'corset dress',
    'corset vintage',
    'corset lace',
    'corset mesh',
    'corset bustier',
  ],
  racing: [
    'racing jacket',
    'racing leather jacket',
    'racing vintage',
    'racing jersey',
    'racing tee',
  ],
  'low rise': [
    'low rise jeans',
    'low rise skirt',
    'low rise pants',
    'low rise cargo',
    'low rise shorts',
  ],
  puffer: [
    'puffer jacket',
    'puffer vest',
    'puffer north face',
    'puffer cropped',
    'puffer vintage',
  ],
};

// Flattened master list for keyword / fuzzy matching
const MASTER_RECOMMENDATIONS: string[] = Array.from(
  new Set([
    ...Object.values(CATEGORY_SUGGESTIONS_MAP).flat(),
    ...Object.values(BRAND_SUGGESTIONS_MAP).flat(),
    ...Object.values(STYLE_SUGGESTIONS_MAP).flat(),
    ...Object.values(ATTRIBUTE_SUGGESTIONS_MAP).flat(),
  ]),
);

/**
 * Splits a suggestion text into match parts:
 * The portion that matches the user's typed query (isMatch = true, standard weight)
 * and the remaining completion text (isMatch = false, bold weight).
 */
export function splitSuggestionHighlight(
  suggestion: string,
  query: string,
): SuggestionHighlightPart[] {
  const normSuggestion = suggestion.trim();
  const normQuery = query.trim().toLowerCase();

  if (!normQuery) {
    return [{ text: normSuggestion, isMatch: false }];
  }

  const lowerSuggestion = normSuggestion.toLowerCase();
  const matchIndex = lowerSuggestion.indexOf(normQuery);

  if (matchIndex === -1) {
    // If exact substring isn't found, try matching individual words
    const queryWords = normQuery.split(/\s+/).filter(Boolean);
    if (queryWords.length > 0) {
      for (const word of queryWords) {
        const idx = lowerSuggestion.indexOf(word);
        if (idx !== -1) {
          const before = normSuggestion.slice(0, idx);
          const match = normSuggestion.slice(idx, idx + word.length);
          const after = normSuggestion.slice(idx + word.length);
          const parts: SuggestionHighlightPart[] = [];
          if (before) parts.push({ text: before, isMatch: false });
          parts.push({ text: match, isMatch: true });
          if (after) parts.push({ text: after, isMatch: false });
          return parts;
        }
      }
    }
    return [{ text: normSuggestion, isMatch: false }];
  }

  const before = normSuggestion.slice(0, matchIndex);
  const match = normSuggestion.slice(matchIndex, matchIndex + normQuery.length);
  const after = normSuggestion.slice(matchIndex + normQuery.length);

  const parts: SuggestionHighlightPart[] = [];
  if (before) parts.push({ text: before, isMatch: false });
  parts.push({ text: match, isMatch: true });
  if (after) parts.push({ text: after, isMatch: false });

  return parts;
}

/**
 * Generates ranked pre-search autocomplete suggestions for listing search.
 */
export function getSearchSuggestions(
  query: string,
  options: GetSearchSuggestionsOptions = {},
): SearchSuggestion[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];

  const {
    recentSearches = [],
    customTags = [],
    customBrands = [],
    limit = 10,
  } = options;

  const seen = new Set<string>();
  const results: SearchSuggestion[] = [];

  const addSuggestion = (text: string, isRecent = false, category?: string) => {
    const clean = text.trim().toLowerCase();
    if (!clean || seen.has(clean)) return;
    seen.add(clean);

    results.push({
      id: `sugg-${clean}`,
      text: clean,
      parts: splitSuggestionHighlight(clean, trimmed),
      category,
      isRecent,
    });
  };

  // 1. Matches from recent searches that start with or contain the query
  for (const recent of recentSearches) {
    const rLower = recent.trim().toLowerCase();
    if (rLower.startsWith(trimmed) || rLower.includes(trimmed)) {
      addSuggestion(rLower, true);
    }
  }

  // 2. Check direct curated maps for exact category / brand / style / attribute matches
  if (CATEGORY_SUGGESTIONS_MAP[trimmed]) {
    for (const item of CATEGORY_SUGGESTIONS_MAP[trimmed]) {
      addSuggestion(item);
    }
  }

  if (BRAND_SUGGESTIONS_MAP[trimmed]) {
    for (const item of BRAND_SUGGESTIONS_MAP[trimmed]) {
      addSuggestion(item);
    }
  }

  if (STYLE_SUGGESTIONS_MAP[trimmed]) {
    for (const item of STYLE_SUGGESTIONS_MAP[trimmed]) {
      addSuggestion(item);
    }
  }

  if (ATTRIBUTE_SUGGESTIONS_MAP[trimmed]) {
    for (const item of ATTRIBUTE_SUGGESTIONS_MAP[trimmed]) {
      addSuggestion(item);
    }
  }

  // 3. Prefix matching against all master recommendations:
  // StartsWith prefix matches first
  for (const item of MASTER_RECOMMENDATIONS) {
    if (item.startsWith(trimmed)) {
      addSuggestion(item);
    }
  }

  // 4. Multi-word partial completion:
  // Query words are matched against suggestion words in order.
  // The final query word must prefix-match the corresponding suggestion word (startsWith),
  // preventing a partial trailing word from matching an earlier suggestion word.
  // e.g. "tops w" -> matches "tops women", "tops with sleeves", "tops women y2k"
  // e.g. "tops h" -> matches "tops hollister"
  // e.g. "tops y" -> matches "tops y2k"
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    for (const item of MASTER_RECOMMENDATIONS) {
      const itemWords = item.split(/\s+/).filter(Boolean);
      if (itemWords.length < words.length) continue;

      let itemIdx = 0;
      let matchesAll = true;

      for (let qIdx = 0; qIdx < words.length; qIdx++) {
        const qWord = words[qIdx];
        const isLast = qIdx === words.length - 1;
        let found = false;

        while (itemIdx < itemWords.length) {
          const itemWord = itemWords[itemIdx];
          itemIdx++;
          const matches = isLast
            ? itemWord.startsWith(qWord)
            : itemWord === qWord || itemWord.startsWith(qWord);

          if (matches) {
            found = true;
            break;
          }
        }

        if (!found) {
          matchesAll = false;
          break;
        }
      }

      if (matchesAll) {
        addSuggestion(item);
      }
    }
  }


  // 5. Taxonomy subcategories matching from CATEGORIES
  for (const cat of CATEGORIES) {
    const catLabel = cat.label.toLowerCase();
    if (catLabel.startsWith(trimmed)) {
      addSuggestion(catLabel, false, cat.id);
    }
    for (const sub of cat.subs) {
      const subLabel = sub.label.toLowerCase();
      if (subLabel.startsWith(trimmed)) {
        addSuggestion(subLabel, false, cat.id);
        addSuggestion(`${subLabel} women`, false, cat.id);
        addSuggestion(`${subLabel} vintage`, false, cat.id);
      }
    }
  }

  // 6. Custom Brands and Custom Tags
  for (const brand of customBrands) {
    const bLower = brand.toLowerCase();
    if (bLower.startsWith(trimmed)) {
      addSuggestion(bLower);
    }
  }
  for (const tag of customTags) {
    const tLower = tag.toLowerCase();
    if (tLower.startsWith(trimmed)) {
      addSuggestion(tLower);
    }
  }

  // 7. Substring contains matches as fallback
  if (results.length < limit) {
    for (const item of MASTER_RECOMMENDATIONS) {
      if (results.length >= limit) break;
      if (item.includes(trimmed)) {
        addSuggestion(item);
      }
    }
  }

  // If user typed a term that has no suggestions at all, suggest the exact term
  if (results.length === 0) {
    addSuggestion(trimmed);
  }

  return results.slice(0, limit);
}

export function resolveSuggestions(
  query?: string,
  suggestions: SearchSuggestion[] = [],
): SearchSuggestion[] {
  const cleanQuery = query?.trim() ?? '';
  if (suggestions.length > 0) return suggestions;
  if (!cleanQuery) return [];
  return [
    {
      id: `fallback-${cleanQuery}`,
      text: cleanQuery,
      parts: splitSuggestionHighlight(cleanQuery, cleanQuery),
    },
  ];
}
