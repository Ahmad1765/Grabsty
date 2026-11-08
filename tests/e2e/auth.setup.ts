// One-shot UI sign-in. Reads E2E_USER_EMAIL / E2E_USER_PASSWORD from
// .env.test (gitignored), drives the welcome → Log in → submit flow, and
// dumps the resulting browser storage to playwright/.auth/user.json. Every
// authenticated spec references that file via test.use({ storageState: ... }),
// so the suite pays for a real auth roundtrip exactly once.

import { test as setup, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  AUTH_STORAGE_PATH,
  E2E_USER_EMAIL,
  E2E_USER_PASSWORD,
  passwordField,
  waitForAppReady,
  homeSearch,
} from './helpers/page';

setup('authenticate user', async ({ page }) => {
  setup.skip(
    !E2E_USER_EMAIL || !E2E_USER_PASSWORD,
    'E2E_USER_EMAIL / E2E_USER_PASSWORD not configured — auth-required specs will skip',
  );

  await page.goto('/auth/login');
  await waitForAppReady(page);

  // Welcome → form (Log in mode).
  await page.getByText('Log in', { exact: true }).click();
  await expect(page.getByPlaceholder('you@example.com')).toBeVisible();

  await page.getByPlaceholder('you@example.com').fill(E2E_USER_EMAIL);
  await passwordField(page).fill(E2E_USER_PASSWORD);
  // "Sign in" appears twice on the form step — the submit button is the last.
  await page.getByText('Sign in', { exact: true }).last().click();

  // Successful sign-in dismisses the modal back to the tabs. The home
  // feed's search field is the unique signal that we're past the auth flow.
  await expect(homeSearch(page)).toBeVisible({
    timeout: 30_000,
  });

  // Persist the resulting localStorage + cookies so auth-required specs
  // start signed in without paying for another roundtrip.
  fs.mkdirSync(path.dirname(AUTH_STORAGE_PATH), { recursive: true });
  await page.context().storageState({ path: AUTH_STORAGE_PATH });
});
