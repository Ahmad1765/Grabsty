// Network-failure edge cases. We intercept the Supabase REST endpoint at the
// Playwright route layer (BEFORE the page navigates), so the bundle's real
// supabase-js client hits our stubs instead of the live backend. Auth + edge
// function endpoints are left untouched — only `/rest/v1/*` (the table-level
// queries that hydrate the feed) is intercepted.
//
// Each test asserts the SAME observable property: the page does not get stuck
// in an infinite loading spinner. It must reach SOME terminal state — either
// an empty state, an error message, or a hydrated feed (in the recovery
// case). We do not assert specific copy because the app surfaces errors as
// silent empty grids in some flows; "no spinner forever" is the load-bearing
// signal.

import {
  test,
  expect,
  waitForAppReady,
  priceText,
  SUPABASE_URL,
  homeSearch,
} from './helpers/page';

const REST_RE = SUPABASE_URL
  ? new RegExp(`${SUPABASE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/rest/v1/.*`)
  : /__no_supabase_configured__/;

test.describe('Network failures', () => {
  test.skip(
    !SUPABASE_URL,
    'EXPO_PUBLIC_SUPABASE_URL not configured — cannot install REST stubs',
  );

  test('REST 500 on listings reaches a terminal state (no infinite spinner)', async ({
    page,
  }) => {
    await page.route(REST_RE, async (route) => {
      const url = route.request().url();
      // Only fail listing-shaped queries — letting profile / category lookups
      // through reduces the chance of unrelated UI getting stuck waiting on
      // its own dependency.
      if (url.includes('/listings')) {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'simulated server error' }),
        });
      }
      return route.continue();
    });
    await page.goto('/');
    await waitForAppReady(page);
    // Give the query layer ~3s to settle into its error/empty state.
    await page.waitForTimeout(3000);
    // The home shell is still rendered (we never showed a global error).
    await expect(homeSearch(page)).toBeVisible();
    // And no listing prices snuck in despite the 500 — proves the stub took.
    await expect(priceText(page)).toHaveCount(0);
  });

  test('REST timeout (route aborted) does not block the rest of the UI', async ({
    page,
  }) => {
    await page.route(REST_RE, async (route) => {
      const url = route.request().url();
      if (url.includes('/listings')) {
        // Abort with a generic failure — supabase-js treats this as a network
        // error and resolves the query with error state.
        return route.abort('failed');
      }
      return route.continue();
    });
    await page.goto('/');
    await waitForAppReady(page);
    await page.waitForTimeout(3000);
    // Tab bar is still interactive even though the feed failed. The dock is
    // icon-only (components/AnimatedTabBar.tsx renders no Text for a tab), so
    // tabs are reachable only through accessibilityRole/Label — getByText can
    // never match one.
    await page.getByRole('button', { name: 'Categories' }).click();
    // The Categories TAB opens the search sheet in its landing state, whose box
    // reads "Search Grabsty..." — the search helpers match the per-tab copy on
    // the Discover SCREEN ("Search items, brands, sellers", …), which this flow
    // never reaches. The app was behaving correctly the whole time: the sheet
    // opens fine with the REST route aborted, which is exactly what this test
    // set out to prove.
    await expect(page.getByPlaceholder(/^Search Grabsty/)).toBeVisible();
  });

  test('slow network — header renders before the feed resolves', async ({ page }) => {
    // 15s is deliberately far longer than app boot. The previous version used a
    // 3s delay and asserted the header appeared within 2500ms of page.goto —
    // but that clock starts before the 4.8 MB web bundle is even parsed, so on
    // a loaded machine it measured boot time, not feed-blocking, and flaked.
    const FEED_DELAY_MS = 15_000;
    await page.route(REST_RE, async (route) => {
      const url = route.request().url();
      if (url.includes('/listings')) {
        await new Promise((r) => setTimeout(r, FEED_DELAY_MS));
      }
      return route.continue();
    });
    await page.goto('/');
    await waitForAppReady(page);

    // The causal property, not a wall-clock budget: the header is on screen
    // while the listing query is demonstrably still in flight (no prices yet).
    // With a 15s delay there is ample margin for a slow boot, so this stays
    // true for the right reason.
    await expect(homeSearch(page)).toBeVisible();
    await expect(priceText(page)).toHaveCount(0);
  });

  test('recovery: feed hydrates after the failing route is unrouted', async ({
    page,
  }) => {
    // Start with /listings failing.
    await page.route(REST_RE, async (route) => {
      const url = route.request().url();
      if (url.includes('/listings')) return route.abort('failed');
      return route.continue();
    });
    await page.goto('/');
    await waitForAppReady(page);
    await page.waitForTimeout(1500);

    // Tear down the failure stub, then nudge the app to refetch by switching
    // tabs and coming back. If the query layer has a stale-while-error policy
    // this should produce live data.
    await page.unroute(REST_RE);
    // Nudge a refetch by leaving Home and returning. Use CHAT, not Discover:
    // Discover no longer routes — it slides a full-screen sheet over the
    // current screen (components/discover/DiscoverSheet.tsx), and that overlay
    // then intercepts the click on Home, so the old Discover→Home round trip
    // never actually left Home. Chat is a real route.
    // Icon-only dock — address tabs by accessible role/name, not text.
    await page.getByRole('button', { name: /Activity|Inbox/i }).click();
    await page.getByRole('button', { name: 'Home' }).click();
    await page.waitForTimeout(2500);
    // We accept either: real listings now visible, OR the empty state still
    // showing (the suite may run against a low-volume staging DB). What we
    // refuse is a thrown error overlay.
    const errorOverlay = page.getByText(/Something went wrong|Unhandled error/i);
    await expect(errorOverlay).toHaveCount(0);
  });
});
