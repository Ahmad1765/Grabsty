// Real-Supabase mode helpers. The web bundle is built with .env.local (real
// project URL + anon key); requests flow through unmocked. We don't seed or
// reset the DB between tests, so every assertion has to be data-agnostic —
// either structural (headers, controls, URL changes) or based on data the
// test fetched at runtime.

import { test as base, expect, type Page } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, use) => {
    // Surface app-level runtime errors in the Playwright trace so silent
    // hangs are easier to diagnose.
    page.on('pageerror', (e) => console.warn('[pageerror]', e.message));
    await use(page);
  },
});

export { expect };

// Wait for the Expo Router app to mount. The root component blocks render
// until icon fonts load; we poll the document body for non-empty text content
// instead of pinning to a specific string (the auth form step, "not found"
// screens, etc. all show different copy).
export async function waitForAppReady(page: Page, options: { timeout?: number } = {}) {
  const timeout = options.timeout ?? 25_000;
  await page.waitForFunction(
    () => {
      const text = (document.body.innerText ?? '').trim();
      return text.length > 0;
    },
    undefined,
    { timeout },
  );
}

export async function gotoRoute(page: Page, route: string) {
  await page.goto(route);
  await waitForAppReady(page);
}

// A listing price exactly as lib/currency.formatPrice renders it: "Rs 8,000"
// for whole amounts, "Rs 8,400.70" when there's a fraction.
//
// Every spec matches prices through here rather than inlining the pattern. The
// suite previously hard-coded `^\$\d[\d,]*$` in eight places; when the app
// moved to PKR they all silently stopped matching anything — the `toBeVisible`
// ones went red, and worse, the `toHaveCount(0)` ones started passing for the
// wrong reason. One definition means the next currency change breaks one line,
// loudly, instead of eight quietly.
export const PRICE_PATTERN = String.raw`^Rs [\d,]+(\.\d{2})?$`;

/** Locator for any rendered listing price. */
export function priceText(page: Page) {
  return page.locator(`text=/${PRICE_PATTERN}/`);
}

// The sell form is a Modal (components/sell/SellSheet.tsx), not a route — it
// opens over whatever screen is active rather than navigating to a URL, the
// same way the product page's "Offer" button opens OfferSheet. So specs that
// need it can't `page.goto('/sell')`; they have to land somewhere with the
// tab bar and tap the Sell tab, exactly like a real user would.
export async function openSellSheet(page: Page) {
  await page.goto('/');
  await waitForAppReady(page);
  const sellTab = page.locator('[aria-label="Sell"]');
  await sellTab.waitFor({ state: 'visible', timeout: 15_000 });
  await sellTab.click();
}

// Discover's search box placeholder changes per tab: "Search items, brands,
// sellers" / "Search aesthetics" / "Search brands" / "Search people".
//
// Since c00ce82 the screen OPENS on the Aesthetics tab and the Items chip is
// hidden (components/discover/SearchTabs.tsx HIDDEN_TABS), so the Items grid is
// only reachable by deep link (?q= or ?category=) or by tapping through a
// brand/aesthetic. Specs that just need "the Discover screen loaded" should
// match any placeholder rather than pinning to one tab's copy.
export function discoverSearch(page: Page) {
  return page.getByPlaceholder(/^Search (items, brands, sellers|aesthetics|brands|people)$/);
}

// Home's search field. Phones/narrow web render HomeHeader ("Search items,
// brands…" under 380px, "What are you
// looking for?", "…today?" on wide phones); >=1024px renders DesktopTopNav
// ("Search for items, brands or members"). Discover was folded into this
// search (app/(tabs)/discover.tsx now redirects to /).
export function homeSearch(page: Page) {
  return page
    .getByPlaceholder(/^(What are you looking for( today)?\?|Search items, brands…|Search for items, brands or members)$/)
    .first();
}

/**
 * Open Home search like a user would. On phones the header field is a
 * read-only input inside a button that opens the search overlay (clicks on the
 * input itself are intercepted); on desktop the top-nav input is typeable.
 */
export async function openHomeSearch(page: Page) {
  if (await hasTopNav(page)) {
    await homeSearch(page).click();
  } else {
    await page.getByRole('button', { name: /^(What are you looking for( today)?\?|Search items, brands…)$/ }).first().click();
  }
}

/** True when the desktop top nav (>=1024px) is rendered instead of the tab bar. */
export async function hasTopNav(page: Page) {
  return (await page.getByTestId('topnav-search').count()) > 0;
}

// Search results with a query, opened by deep link (HomeSearchView reads these
// params). Zero results render 'No listings found matching "<q>"'.
export function searchUrl(q: string) {
  return `/?searchOpen=1&searchQuery=${encodeURIComponent(q)}`;
}

// The password field's placeholder states the minimum length ("At least 8
// characters"), so it changes every time that policy does — the specs pinned
// "At least 6 characters" and broke silently when the minimum moved to 8.
// Match the shape, not the number, so the next bump doesn't cost six tests.
export function passwordField(page: Page) {
  return page.getByPlaceholder(/^At least \d+ characters$/);
}

// RN-Web FlatList virtualizes off-screen rows; on web the outer `body`
// doesn't scroll — the FlatList has its own div with overflow:auto. We sweep
// every scrollable container on the page and pin its scrollTop to scrollHeight
// so every row mounts into the DOM. Idempotent and safe to re-run.
export async function scrollFeedToBottom(page: Page) {
  await waitForAppReady(page);
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => {
      const scrollables = Array.from(document.querySelectorAll<HTMLElement>('*')).filter(
        (el) => {
          const s = getComputedStyle(el);
          return (
            (s.overflowY === 'auto' || s.overflowY === 'scroll') &&
            el.scrollHeight > el.clientHeight
          );
        },
      );
      scrollables.forEach((el) => {
        el.scrollTop = el.scrollHeight;
      });
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
    await page.waitForTimeout(180);
  }
  await page.waitForTimeout(150);
}

// Read EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY from .env.local at module load.
// The Playwright runner is a long-lived Node process, so the file is parsed
// exactly once per worker — cheap and avoids leaking secrets into a stage-3
// browser global.
import * as fs from 'node:fs';
import * as path from 'node:path';

function parseEnvFile(file: string): Record<string, string> {
  const full = path.resolve(process.cwd(), file);
  if (!fs.existsSync(full)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(full, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (!m) continue;
    let rawValue = m[2];
    let inQuote: string | null = null;
    let hashIdx = -1;
    for (let i = 0; i < rawValue.length; i++) {
      const c = rawValue[i];
      if ((c === '"' || c === "'") && !inQuote) inQuote = c;
      else if (c === inQuote) inQuote = null;
      else if (c === '#' && !inQuote) {
        hashIdx = i;
        break;
      }
    }
    if (hashIdx !== -1) rawValue = rawValue.slice(0, hashIdx);
    rawValue = rawValue.trim();
    if (rawValue.length >= 2 && (rawValue[0] === '"' || rawValue[0] === "'") && rawValue[0] === rawValue[rawValue.length - 1]) {
      rawValue = rawValue.slice(1, -1);
    }
    out[m[1]] = rawValue;
  }
  return out;
}

// `.env.test` (gitignored) is the canonical source for E2E_USER_EMAIL /
// _PASSWORD, used by auth.setup.ts to drive a one-shot UI sign-in. The
// public Supabase URL + anon key fall back to `.env.local` so a contributor
// without `.env.test` can still run the read-only suite.
const LOCAL_ENV = parseEnvFile('.env.local');
const TEST_ENV = parseEnvFile('.env.test');
const ENV = { ...LOCAL_ENV, ...TEST_ENV };

export const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL || ENV.EXPO_PUBLIC_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || ENV.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
export const E2E_USER_EMAIL = process.env.E2E_USER_EMAIL || ENV.E2E_USER_EMAIL || '';
export const E2E_USER_PASSWORD = process.env.E2E_USER_PASSWORD || ENV.E2E_USER_PASSWORD || '';

export const AUTH_STORAGE_PATH = path.resolve(process.cwd(), 'playwright/.auth/user.json');

// Hit the real Supabase REST endpoint to grab a sample listing for tests that
// need a real listing id (product detail, payment, invoice). Uses the URL +
// anon key from .env.local — the same values the bundle was built with.
// A listing whose is_sold flag is TRUE. Sellers set this by hand from the
// product screen ("Mark as sold"), so it says nothing about payment — which is
// exactly what the invoice screen must not confuse it with. Used to prove a
// sold-but-unpaid listing never renders a Paid invoice.
export async function fetchSoldListing(
  _page: Page,
): Promise<{ id: string; title: string } | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/listings?select=id,title&is_sold=eq.true&order=created_at.desc&limit=1`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        signal: controller.signal,
      },
    );
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ id: string; title: string }>;
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function fetchAnyLiveListing(
  _page: Page,
  // "oldest": blocks.spec takes a different seller than the specs that buy from the newest.
  order: "newest" | "oldest" = "newest",
): Promise<{ id: string; title: string; price: number; brand: string | null; seller_id: string | null } | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(
      // A regular seller: official (admin) accounts can't be blocked or messaged like one.
      `${SUPABASE_URL}/rest/v1/listings?select=id,title,price,brand,seller_id,seller:profiles!listings_seller_id_fkey!inner(is_admin)&seller.is_admin=eq.false&is_sold=eq.false&order=created_at.${order === "oldest" ? "asc" : "desc"}&limit=1`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        signal: controller.signal,
      },
    );
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{
      id: string;
      title: string;
      price: number;
      brand: string | null;
      seller_id: string | null;
    }>;
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

// Generate a fresh, unique email so signup tests don't collide between runs.
export function freshTestEmail(): string {
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  return `e2e-${stamp}@example.test`;
}
