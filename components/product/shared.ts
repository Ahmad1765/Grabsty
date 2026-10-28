// Cross-cutting primitives for the product detail screen and its extracted
// sub-components. Kept in one module so the screen and the components in
// components/product/* share a single source of truth for dimensions, the
// brand palette, and the listing→related-card mapping.
import { Platform, StyleSheet, useWindowDimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import { cardImageUrl } from '@/lib/images';
import { CONTENT_MAX_WIDTH, isDesktopWidth } from '@/lib/responsive';
import type { Listing } from '@/types';

export const IS_IOS = Platform.OS === 'ios';
export const HAIRLINE = StyleSheet.hairlineWidth;

export const CARD_GAP = 8;
export const CARD_OUTER_PAD = 12;

/**
 * Computes dynamic viewport and product layout dimensions based on a given window width.
 * Capped to CONTENT_MAX_WIDTH so layouts on wide screens/tablets stay disciplined.
 */
export function getProductDimensions(windowWidth: number) {
  const contentWidth = Math.min(windowWidth, CONTENT_MAX_WIDTH);
  // 4:5 portrait hero (Instagram/Shopify standard), rounded to whole pixels.
  const imageHeight = Math.round(contentWidth * 1.25);
  // Floored so two cards + gap never exceed the row on sub-pixel widths.
  const cardWidth = Math.floor((contentWidth - CARD_OUTER_PAD * 2 - CARD_GAP) / 2);
  const cardImageHeight = Math.round(cardWidth * 1.25);

  return {
    contentWidth,
    imageHeight,
    cardWidth,
    cardImageHeight,
  };
}

// Desktop web: gallery on the left, a fixed-width details column on the
// right, related items in a wide grid underneath. `contentWidth` is then the
// gallery width (the carousel and skeleton size from it) and `cardWidth` is
// sized for 4–5 columns across the whole frame.
export const DESKTOP_DETAILS_WIDTH = 400;
export const DESKTOP_COLUMN_GAP = 48;
const DESKTOP_PAGE_PAD = 32;
const DESKTOP_GALLERY_MAX = 680;

// Space above and below the photo on desktop: header (108), breadcrumbs and
// page padding (~92). The photo is sized so all of it fits on screen at once.
const DESKTOP_CHROME_HEIGHT = 200;
const DESKTOP_GALLERY_MIN = 420;

export function getDesktopProductDimensions(areaWidth: number, areaHeight: number) {
  const available = areaWidth - DESKTOP_PAGE_PAD * 2;
  const fitsHeight = Math.floor((areaHeight - DESKTOP_CHROME_HEIGHT) / 1.25);
  const contentWidth = Math.max(
    DESKTOP_GALLERY_MIN,
    Math.min(DESKTOP_GALLERY_MAX, fitsHeight, available - DESKTOP_DETAILS_WIDTH - DESKTOP_COLUMN_GAP),
  );
  const frameWidth = contentWidth + DESKTOP_COLUMN_GAP + DESKTOP_DETAILS_WIDTH;
  const columns = frameWidth >= 1000 ? 5 : 4;
  const cardWidth = Math.floor((frameWidth - CARD_OUTER_PAD * 2 - CARD_GAP * (columns - 1)) / columns);
  return {
    contentWidth,
    imageHeight: Math.round(contentWidth * 1.25),
    cardWidth,
    cardImageHeight: Math.round(cardWidth * 1.25),
    frameWidth,
  };
}

/**
 * Hook returning dynamic dimensions for product screens and cards.
 * Automatically recalculates on screen rotation or window resize (tablet/web).
 */
export function useProductDimensions() {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const desktop = isDesktopWidth(windowWidth);
  const dims = desktop
    ? getDesktopProductDimensions(windowWidth, windowHeight)
    : { ...getProductDimensions(windowWidth), frameWidth: 0 };

  return {
    windowWidth,
    windowHeight,
    desktop,
    ...dims,
  };
}

/** iOS-only haptic tap. No-op on Android/web. */
export function tap(style: 'light' | 'medium' | 'selection' = 'selection') {
  if (!IS_IOS) return;
  if (style === 'selection') Haptics.selectionAsync();
  else if (style === 'light') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

export const iosShadow = IS_IOS
  ? {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.18,
      shadowRadius: 10,
    }
  : {
      shadowColor: '#000',
      elevation: 3,
    };

export const CONDITION_LABELS: Record<string, string> = {
  new_with_tags: 'New with tags',
  like_new: 'Like new',
  good: 'Good',
  fair: 'Fair',
};

// Category labels now live in the single-source taxonomy (lib/categories).
export { CATEGORY_LABELS } from '@/lib/categories';

export const ITEM_COLOR = { name: 'Grabsty purple', hex: '#6C47FF' };

// Unified brand palette (matches home tabs + PromoBanner + LiveActivityTicker)
export const BRAND_PURPLE = '#6C47FF';
export const BRAND_PURPLE_SOFT = 'rgba(108,71,255,0.10)';
export const BRAND_LIME = '#6C47FF';

export const LINK_PURPLE = BRAND_PURPLE;

// Fallback shape used while the real listing is loading; render is gated on
// `listing` being non-null, so this is never visible in the UI.
export const FALLBACK_SELLER = {
  id: '',
  username: '',
  avatar_url: null,
  full_name: '',
  bio: null,
  location: null,
  rating: 0,
  total_sales: 0,
  created_at: '',
};

// Stable empty reference for the React Query rail fallbacks (seller/similar
// items), so downstream memos don't churn before the queries resolve.
export const EMPTY_LISTINGS: Listing[] = [];

export type RelatedItem = {
  id: string;
  images: string[];
  brand: string;
  meta: string;
  price: number;
  inclPrice: number;
  likes: number;
};

export function conditionLabel(c: Listing['condition']) {
  switch (c) {
    case 'new_with_tags':
      return 'New with tags';
    case 'like_new':
      return 'Like new';
    case 'good':
      return 'Good';
    case 'fair':
      return 'Fair';
    default:
      return '';
  }
}

// Relative "uploaded X ago" label for listing timestamps. Coarsens as the
// listing ages (min → hours → days → weeks) and falls back to an absolute
// short date past ~a month, so old items don't read as "6 weeks ago".
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 45) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function listingToRelated(row: Listing): RelatedItem {
  const meta = [row.size, conditionLabel(row.condition)].filter(Boolean).join(' · ');
  // Every surface a RelatedItem reaches — the related rail, the bundle picker,
  // the locked-in base card — is a ~171px tile, so they get the stored
  // thumbnails (640px long edge) rather than the 1440px originals. Mapped by
  // index because `thumbnails` can be shorter than `images` on a row whose
  // thumbnail generation partly failed; cardImageUrl falls back per index.
  return {
    id: row.id,
    images: (row.images ?? []).map((_, i) => cardImageUrl(row, i)),
    brand: row.brand || row.title,
    meta: meta || row.category,
    price: Number(row.price ?? 0),
    inclPrice: Number(row.price ?? 0),
    likes: Number(row.likes ?? 0),
  };
}

// Bundle tiers + the discount math live in lib/bundle.ts (pure + unit-tested).
// Re-exported here so the product components keep a single import surface.
export { BUNDLE_TIERS, BUNDLE_MIN_ITEMS, computeBundlePricing } from '@/lib/bundle';
