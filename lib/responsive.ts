// Responsive helpers. Eliminates the `width: '48%'` anti-pattern that was
// breaking grids on devices outside the iPhone-12 baseline.
//
// Use `useResponsiveColumns` to pick a column count that adapts to the
// viewport, and `cardWidth` to compute exact pixel widths when you can't
// rely on FlatList's numColumns + columnWrapperStyle.

import { Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const bp = {
  xs: 320, // small Android phones, iPhone SE 1st gen
  sm: 380, // iPhone 12 mini, most small phones
  md: 420, // iPhone Plus, modern Android
  lg: 768, // tablet portrait
  xl: 1024, // tablet landscape / web
} as const;

export type Breakpoint = keyof typeof bp;

export function useBreakpoint(): Breakpoint {
  const { width } = useWindowDimensions();
  if (width >= bp.xl) return 'xl';
  if (width >= bp.lg) return 'lg';
  if (width >= bp.md) return 'md';
  if (width >= bp.sm) return 'sm';
  return 'xs';
}

export function useIsTablet(): boolean {
  const { width } = useWindowDimensions();
  return width >= bp.lg;
}

// ── Desktop web ─────────────────────────────────────────────────────────────
// From bp.xl up, the web build swaps the bottom tab bar for a top header
// (components/navigation/DesktopTopNav) and centres content in capped frames.
// Native is never "desktop": a landscape iPad keeps the phone chrome it was
// tested with.
export function isDesktopWidth(width: number): boolean {
  return Platform.OS === 'web' && width >= bp.xl;
}

export function useIsDesktop(): boolean {
  return isDesktopWidth(useWindowDimensions().width);
}

// Width of the area screens render into. Grids size from this.
export function useContentWidth(): number {
  return useWindowDimensions().width;
}

// Side padding that centres a `max`-wide frame in the content area on
// desktop. 0 on phones and whenever the content area is narrower than `max`.
export function useDesktopGutter(max: number): number {
  const width = useContentWidth();
  return useIsDesktop() ? Math.max(0, (width - max) / 2) : 0;
}

// Max widths for centred desktop columns. Feeds get a wide frame; reading
// and form-style screens (activity, chat, notifications) a narrow one.
export const DESKTOP_FEED_MAX = 1320;
export const DESKTOP_READING_MAX = 760;
// Shop grids (own profile, other users' profiles).
export const DESKTOP_PROFILE_MAX = 1080;

export function useIsCompact(): boolean {
  const { width, height } = useWindowDimensions();
  return width < bp.sm || height < 700;
}

// Pick a column count that scales with screen width. The defaults work for
// 4:5 listing tiles: 2 cols on phones, 3 on big phones, 4 on tablets,
// 5 on wide tablets/web. Pass `min` to raise the floor (e.g. 3 for the home
// feed which always wants a dense grid).
export function useResponsiveColumns(opts: {
  min?: number;
  max?: number;
  // Width breakpoint thresholds that bump the column count up by 1
  thresholds?: number[];
} = {}): number {
  return columnsFor(useContentWidth(), opts);
}

function columnsFor(
  width: number,
  opts: { min?: number; max?: number; thresholds?: number[] },
): number {
  const min = opts.min ?? 2;
  const max = opts.max ?? 5;
  const thresholds = opts.thresholds ?? [bp.md, bp.lg, bp.xl, 1440];
  let cols = min;
  for (const t of thresholds) {
    if (width >= t) cols += 1;
  }
  return Math.min(max, cols);
}

// Compute the exact pixel width of one card in a grid, given the available
// row width, column count, horizontal padding inside the row, and gap
// between cards. Useful when wrapping cards in a flex-row with `gap`
// instead of using FlatList numColumns.
export function cardWidth(args: {
  rowWidth: number;
  columns: number;
  horizontalPadding?: number;
  gap?: number;
}): number {
  const { rowWidth, columns, horizontalPadding = 0, gap = 0 } = args;
  if (columns <= 0) return 0;
  const usable = rowWidth - horizontalPadding * 2;
  const totalGap = gap * (columns - 1);
  return Math.max(0, Math.floor((usable - totalGap) / columns));
}

// Combine the two: derive both the column count and the per-card width
// using the current viewport. Call this from screens that draw their own
// grids (rather than FlatList numColumns).
export function useGridDimensions(opts: {
  min?: number;
  max?: number;
  thresholds?: number[];
  horizontalPadding?: number;
  gap?: number;
  // Desktop: the grid sits in a centred frame this wide at most. Columns and
  // card widths are computed against the frame, not the full content area.
  maxWidth?: number;
} = {}): { columns: number; cardWidth: number; viewportWidth: number } {
  const contentWidth = useContentWidth();
  const width = opts.maxWidth ? Math.min(contentWidth, opts.maxWidth) : contentWidth;
  const columns = columnsFor(width, opts);
  const w = cardWidth({
    rowWidth: width,
    columns,
    horizontalPadding: opts.horizontalPadding ?? 0,
    gap: opts.gap ?? 0,
  });
  return { columns, cardWidth: w, viewportWidth: width };
}

// FlashList `drawDistance` for the four listing grids (home, discover, profile,
// user). Derived from the row geometry above rather than picked by feel:
//
//   On a 390pt phone the grid is 2 columns, so a card is
//   (390 - 12*2 - 8) / 2 = 179pt wide. Its photo is aspectRatio 1/1.33, i.e.
//   238pt tall, the text block under it runs ~76pt, and the card + row margins
//   add 24pt. One row is therefore ~338pt.
//
// FlashList's default drawDistance is 250 — LESS than a single row, so a fast
// flick outruns the buffer and lands on blank cells. 700 buys ~2 rows (4 cards)
// of runway ahead of the viewport in each direction.
//
// This is a real trade, not a free win: a bigger draw distance mounts more
// cards. It is worth taking now specifically because the per-card mount cost
// was cut first (lazy carousel slides, no Reanimated wrapper on the photo,
// synchronous liked-state seeding) — the same number would have been the wrong
// call against the older, heavier card.
export const GRID_DRAW_DISTANCE = 700;

// Standard max width for content on large screens — keeps layouts readable
// instead of stretching edge-to-edge on tablets/web.
export const CONTENT_MAX_WIDTH = 720;

// The bottom tab bar (components/AnimatedTabBar) is absolutely positioned and
// overlays screen content — it does NOT reserve layout space. Screens inside the
// (tabs) group must pad the bottom of their scroll content (and any sticky CTA
// bar) by this much, or the bar covers the last row / buttons beneath it.
// AnimatedTabBar's BAR_HEIGHT is 56; the extra 6 is deliberate slack so content
// clears the bar's border, not just its box. Keep it >= 56.
export const TAB_BAR_HEIGHT = 62;
export function useTabBarClearance(extra = 12): number {
  const insets = useSafeAreaInsets();
  // Desktop has no bottom bar to clear — the top header takes its place.
  if (useIsDesktop()) return extra;
  // The bar sits flush at the bottom with internal paddingBottom = insets.bottom.
  // Content clearance = bar content height + insets + extra breathing room.
  return TAB_BAR_HEIGHT + insets.bottom + extra;
}

// Hit-slop preset for small icon buttons (improves touch target on phones).
export const HIT_SLOP_8 = { top: 8, bottom: 8, left: 8, right: 8 } as const;
export const HIT_SLOP_12 = { top: 12, bottom: 12, left: 12, right: 12 } as const;
