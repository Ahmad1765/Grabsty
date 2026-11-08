// Invoice screen — uses a real listing id at runtime. Pending vs. paid query
// param, plus the unknown-id error state.

import {
  test,
  expect,
  waitForAppReady,
  fetchAnyLiveListing,
  fetchSoldListing,
} from './helpers/page';

test.describe('Invoice', () => {
  test('renders the INVOICE hero and a status pill for a real listing', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    const listing = await fetchAnyLiveListing(page);
    test.skip(!listing, 'no listings in the live DB to drive this test');
    await page.goto(`/invoice/${listing!.id}`);
    await waitForAppReady(page);
    await expect(page.getByText('INVOICE')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Status')).toBeVisible();
    await expect(page.getByText(/Pending|Paid/).first()).toBeVisible();
  });

  // This previously asserted that ?paid=1 flips the badge to Paid and reveals
  // the Download CTA. That behaviour never existed, and it must not: the param
  // is only Stripe's redirect hint (success_url sets paid=1, cancel_url paid=0),
  // so honouring it would let anyone type ?paid=1 and render a "Paid" invoice
  // for an unsold item. Status comes from a row in public.orders; paid=1 merely
  // starts a short re-check while the stripe-webhook catches up.
  test('paid=1 cannot fake a Paid invoice for an unsold listing', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    // fetchAnyLiveListing only returns is_sold=false rows, so this listing is
    // genuinely unpaid — exactly the spoof attempt we're guarding against.
    const listing = await fetchAnyLiveListing(page);
    test.skip(!listing, 'no listings in the live DB to drive this test');
    await page.goto(`/invoice/${listing!.id}?paid=1`);
    await waitForAppReady(page);

    // It may briefly show "Confirming" while it re-checks, but it must never
    // reach Paid, and the Download CTA must stay hidden.
    await expect(page.getByText('Confirming your payment…')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Download invoice')).toHaveCount(0);
    await expect(page.getByText('Paid', { exact: true })).toHaveCount(0);
  });

  // The regression this locks down. listings.is_sold is a SELLER-controlled
  // toggle ("Mark as sold" on the product screen) with no connection to money.
  // The invoice screen used to derive its status from it, so a seller could
  // flip that switch and render a "Paid" invoice — with a Download CTA — for a
  // payment that never happened. Status now comes only from public.orders.
  //
  // No spec covered this before: the ?paid=1 test above guards the URL, not the
  // flag, and it passed happily the whole time the flag was trusted.
  test('a sold-but-unpaid listing never renders a Paid invoice', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    const sold = await fetchSoldListing(page);
    test.skip(!sold, 'no is_sold=true listing in the live DB to drive this test');
    await page.goto(`/invoice/${sold!.id}`);
    await waitForAppReady(page);

    await expect(page.getByText('INVOICE')).toBeVisible({ timeout: 20_000 });
    // Assert the POSITIVE state first. Two toHaveCount(0) checks alone would
    // also pass against a blank screen, which is the classic way an absence
    // assertion rots into decoration.
    await expect(page.getByText('Pending', { exact: true }).first()).toBeVisible();
    // Sold flag set, no order row => not paid.
    await expect(page.getByText('Paid', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Download invoice')).toHaveCount(0);
  });

  test('unknown invoice id renders the "Invoice not found" state', async ({ page }) => {
    await page.goto('/invoice/00000000-dead-beef-0000-000000000000');
    await waitForAppReady(page);
    await expect(page.getByText('Invoice not found')).toBeVisible({ timeout: 20_000 });
  });
});
