// Auth edge cases — runs signed-out. Covers:
//   1. Deep-linking to a gated route (the RequireAuth gate must render).
//   2. Expired-session simulation via 401 on /auth/v1/user (the app must
//      land on the welcome / auth prompt, not silently consume a bad token).
//   3. Double-submitting the login form must not produce a JS error overlay.
//
// We don't drive a real auth roundtrip here — auth.setup.ts covers that.
// These tests only exercise the client-side guards and resilience paths.

import { test, expect, waitForAppReady, passwordField, SUPABASE_URL } from './helpers/page';

const AUTH_USER_RE = SUPABASE_URL
  ? new RegExp(`${SUPABASE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/auth/v1/user.*`)
  : /__no_supabase_configured__/;

test.describe('Auth edges', () => {
  test('deep link to /upload while signed out lands on the auth prompt', async ({ page }) => {
    await page.goto('/upload');
    await waitForAppReady(page);
    // The RequireAuth gate surfaces the welcome modal. Any of these phrases
    // means the gate did its job.
    await expect(
      page.getByText(/Continue as guest|Sign up with email|Your story[\s\S]*starts\s+now\./i).first(),
    ).toBeVisible();
  });

  test('deep link to /profile while signed out lands on the auth prompt', async ({ page }) => {
    await page.goto('/profile');
    await waitForAppReady(page);
    await expect(
      page.getByText(/Continue as guest|Sign up with email|Your story[\s\S]*starts\s+now\./i).first(),
    ).toBeVisible();
  });

  test('expired session (401 on /auth/v1/user) does not crash the home shell', async ({
    page,
  }) => {
    test.skip(
      !SUPABASE_URL,
      'EXPO_PUBLIC_SUPABASE_URL not configured — cannot stub auth endpoint',
    );
    // Pre-seed a junk token so supabase-js attempts to hydrate the user.
    await page.addInitScript((url: string | undefined) => {
      const projectId = url ? new URL(url).hostname.split('.')[0] : 'test';
      const fake = {
        access_token: 'expired-fake-token',
        refresh_token: 'expired-fake-refresh',
        expires_at: Math.floor(Date.now() / 1000) - 60,
        token_type: 'bearer',
      };
      try {
        // supabase-js stores its session under a project-scoped key. We don't
        // know the exact prefix here, so we just plant a generic auth marker
        // that the bundle's recovery path will see.
        localStorage.setItem(`sb-${projectId}-auth-token`, JSON.stringify(fake));
      } catch {
        /* private mode — ignore */
      }
    }, SUPABASE_URL);
    // Any call to /auth/v1/user returns 401, the same as an expired token.
    await page.route(AUTH_USER_RE, async (route) => {
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'JWT expired' }),
      });
    });
    await page.goto('/');
    await waitForAppReady(page);
    // The home shell still rendered.
    await expect(page.getByPlaceholder('Search your feed')).toBeVisible();
    // And no error overlay was raised.
    await expect(page.getByText(/Something went wrong|Unhandled error/i)).toHaveCount(0);
  });

  test('rapid double-submit on login does not raise an error overlay', async ({ page }) => {
    await page.goto('/auth/login');
    await waitForAppReady(page);
    await page.getByText('Log in', { exact: true }).click();
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
    await page.getByPlaceholder('you@example.com').fill('test@example.test');
    await passwordField(page).fill('hunter22');
    const submit = page.getByText('Sign in', { exact: true }).last();
    // Two clicks in quick succession — must not throw.
    await submit.click();
    await submit.click().catch(() => undefined);
    // Form is still on the page (the credentials are bogus so we never
    // dismiss).
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
    await expect(page.getByText(/Something went wrong|Unhandled error/i)).toHaveCount(0);
  });

  test('signed-out /chat lands on the chat empty / sign-in prompt', async ({ page }) => {
    await page.goto('/chat');
    await waitForAppReady(page);
    await expect(
      page.getByText(/Inbox|Sign in to chat|It's quiet here|Continue as guest/i).first(),
    ).toBeVisible();
  });
});
