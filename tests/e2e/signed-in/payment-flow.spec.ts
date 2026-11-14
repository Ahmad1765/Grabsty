// Payment screen — the Cash-on-Delivery Checkout, using a real listing id at
// runtime. We assert the summary rows and the Pay CTA, plus the unknown-id
// error state. We never press Pay — that would create a real order.
//
// Lives under signed-in/ because app/payment/[id].tsx does
// `if (!user) return <Redirect href="/auth/login" />` — signed out, the screen
// never renders and every assertion here times out against the login form.

import { test, expect, waitForAppReady, fetchAnyLiveListing } from '../helpers/page';

test.describe('Payment', () => {
  test('renders the Checkout summary with the COD total and Pay CTA', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    const listing = await fetchAnyLiveListing(page);
    test.skip(!listing, 'no listings in the live DB to drive this test');
    await page.goto(`/payment/${listing!.id}`);
    await waitForAppReady(page);
    await expect(page.getByText('Checkout', { exact: true }).first()).toBeVisible({ timeout: 20_000 });
    for (const row of ['Item price', 'Buyer protection', 'Delivery', 'Total']) {
      await expect(page.getByText(row, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByText('Cash on Delivery', { exact: true }).first()).toBeVisible();
    // Either state is right: depends on whether the E2E account saved an address.
    await expect(
      page.getByRole('button', { name: /^(Add|Edit) delivery address$/ }).first(),
    ).toBeVisible();
    // Cash on delivery: nothing is paid here, so the CTA says "Place order".
    await expect(page.getByText('Place order', { exact: true }).first()).toBeVisible();
  });

  test('unknown listing id shows the "Item unavailable" state', async ({ page }) => {
    await page.goto('/payment/00000000-dead-beef-0000-000000000000');
    await waitForAppReady(page);
    await expect(page.getByText('Item unavailable')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Go back')).toBeVisible();
  });
});
