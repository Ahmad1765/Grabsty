// Cross-cutting primitives for the product detail screen and its extracted
// sub-components. Kept in one module so the screen and the components in
// components/product/* share a single source of truth for dimensions, the
// brand palette, and the listing→related-card mapping.
import { Dimensions, Platform, StyleSheet, useWindowDimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import { cardImageUrl } from '@/lib/images';
import { CONTENT_MAX_WIDTH } from '@/lib/responsive';
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
  const imageHeight = Math.round(contentWidth * 1.25);
  const cardWidth = Math.floor((contentWidth - CARD_OUTER_PAD * 2 - CARD_GAP) / 2);
  const cardImageHeight = Math.round(cardWidth * 1.25);

  return {
    contentWidth,
    imageHeight,
    cardWidth,
    cardImageHeight,
  };
}

/**
 * Hook returning dynamic dimensions for product screens and cards.
 * Automatically recalculates on screen rotation or window resize (tablet/web).
 */
export function useProductDimensions() {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const dims = getProductDimensions(windowWidth);

  return {
    windowWidth,
    windowHeight,
    ...dims,
  };
}

// Fallback initial evaluations for legacy static references
const win = Dimensions.get('window');
export const width = win.width;
export const SCREEN_HEIGHT = win.height;
// Hero images render at a 4:5 portrait ratio — the e-commerce standard
// (Instagram/Shopify), tall enough to show a garment without dominating the
// fold. Rounded so the parallax math lands on whole pixels.
export const IMAGE_HEIGHT = Math.round(Math.min(win.width, CONTENT_MAX_WIDTH) * 1.25);

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

// Floor so 2*CARD_WIDTH + CARD_GAP can never exceed the row width due to
// sub-pixel rounding — otherwise the second card wraps and the grid collapses
// into a single column on certain devices/layout passes.
export const CARD_WIDTH = Math.floor((Math.min(width, CONTENT_MAX_WIDTH) - CARD_OUTER_PAD * 2 - CARD_GAP) / 2);
export const CARD_IMAGE_HEIGHT = Math.round(CARD_WIDTH * 1.25);
