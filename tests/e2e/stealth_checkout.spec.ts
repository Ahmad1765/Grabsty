import { test, expect } from '@playwright/test';

// =============================================================================
// Playwright E2E: Stealth Kinetics & Network Chaos
// =============================================================================

// Note: In React Native, components use testID="foo". React Native for Web 
// automatically compiles testID into the DOM attribute data-testid="foo",
// which Playwright's page.getByTestId('foo') targets directly.

test.describe('Adversarial UI Kinetics', () => {
  
  test.beforeEach(async ({ page }) => {
    const LOCAL_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

    // Route all remote Supabase traffic to the running local Supabase stack
    await page.route(/.*supabase\.co\/(.*)/, async (route, request) => {
      const url = new URL(request.url());
      const localUrl = `http://127.0.0.1:54321${url.pathname}${url.search}`;
      const headers = { ...request.headers() };
      if (headers['apikey']) {
        headers['apikey'] = LOCAL_ANON;
      }
      // If authorization is the anon key, replace with local anon key
      if (headers['authorization'] && headers['authorization'].includes('ttxestvncdynsssmjqhk')) {
        headers['authorization'] = `Bearer ${LOCAL_ANON}`;
      }
      try {
        const response = await page.request.fetch(localUrl, {
          method: request.method(),
          headers,
          data: request.postDataBuffer() ?? undefined,
        });
        await route.fulfill({ response });
      } catch {
        await route.abort('failed');
      }
    });

    // Navigate and authenticate
    await page.goto('/auth/login?mode=signin');
    const welcomeBtn = page.getByTestId('welcome-login-button');
    if (await welcomeBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await welcomeBtn.click();
    }
    await page.getByTestId('email-input').waitFor({ state: 'visible', timeout: 15000 });
    await page.getByTestId('email-input').fill('test_buyer@grabsty.internal');
    await page.getByTestId('password-input').fill('password123');
    await page.getByTestId('login-button').click();
    await page.waitForURL(url => !url.pathname.includes('/auth/login'), { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(1000);
  });

  test('UI Race Condition: Double-tap "Buy Now" before edge function resolves', async ({ page }) => {
    await page.goto('/product/11111111-1111-4111-8111-111111111111');
    
    const buyButton = page.getByTestId('buy-now-button');
    await expect(buyButton).toBeVisible();

    // Route interception to artificially delay the edge function response
    // simulating a slow cold start.
    await page.route('**/functions/v1/create-checkout-session', async route => {
      await new Promise(f => setTimeout(f, 3000));
      await route.continue();
    });

    // Fire two exact simultaneous clicks using evaluate to bypass Playwright's click safeguards
    await page.evaluate(() => {
      const btn = document.querySelector('[data-testid="buy-now-button"]') as HTMLButtonElement;
      if (btn) {
        btn.click();
        btn.click();
      }
    });

    // The UI MUST instantly disable the button to prevent duplicate edge function calls.
    // If it isn't disabled, the test fails.
    await expect(buyButton).toBeDisabled({ timeout: 500 });
  });

  test('Network Chaos: Drop connection exact millisecond of Delivery Confirmation', async ({ page, context }) => {
    // Auto-accept confirmation modal on web
    page.on('dialog', dialog => dialog.accept());

    // Buyer marks item as delivered to release escrow
    await page.goto('/activity/orders/12345678-1234-1234-1234-123456789012');
    
    const confirmDeliveryBtn = page.getByTestId('confirm-delivery-button');
    await expect(confirmDeliveryBtn).toBeVisible();

    // Intercept the RPC call `advance_order_fulfillment`
    let rpcCalled = false;
    await page.route('**/rest/v1/rpc/advance_order_fulfillment', async route => {
      rpcCalled = true;
      // Abort the request simulating a sudden network drop (e.g. entering a tunnel)
      await route.abort('failed');
    });

    await confirmDeliveryBtn.click();

    // Ensure the RPC was intercepted and dropped
    expect(rpcCalled).toBe(true);

    // The UI MUST NOT show a "Success" toast or navigate away.
    // It must gracefully recover and show a network error state.
    const successToast = page.locator('text="Delivery confirmed"');
    await expect(successToast).not.toBeVisible();
    
    const errorToast = page.locator('text="Network error. Please try again."');
    await expect(errorToast).toBeVisible();
  });
});
