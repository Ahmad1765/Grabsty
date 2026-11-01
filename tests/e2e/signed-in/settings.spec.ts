// /settings — the section nav (General / Account / Purchases & Sales /
// Verification & Payouts / Security / Help & Legal) switches panels without
// throwing. We never click Log out (that would trash the saved auth state),
// never click Delete account (irreversible), and never persist any toggle.

import { test, expect, type Page } from "@playwright/test";
import { waitForAppReady } from "../helpers/page";

const SECTIONS = [
  "General",
  "Account",
  "Purchases & Sales",
  "Verification & Payouts",
  "Security",
  "Help & Legal",
];

async function openSection(page: Page, name: string) {
  await page.getByText(name, { exact: true }).first().click();
}

test.describe("Settings (signed in)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/settings");
    await waitForAppReady(page);
  });

  test("renders the header, profile card and every section", async ({ page }) => {
    await expect(page.getByText("Settings", { exact: true }).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator("text=/^@[\\w.]+$/").first()).toBeVisible();
    for (const s of SECTIONS) {
      await expect(page.getByText(s, { exact: true }).first()).toBeVisible();
    }
    // General is the default panel.
    await expect(page.getByText("Push notifications", { exact: true })).toBeVisible();
  });

  test("Account shows Edit profile, the email row and Log out", async ({ page }) => {
    await openSection(page, "Account");
    await expect(page.getByText("Edit profile", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/^[\w.+-]+@[\w-]+\.[\w.-]+$/).first()).toBeVisible();
    await expect(page.getByText("Log out", { exact: true })).toBeVisible();
  });

  test("Purchases & Sales shows orders, bundle discount and vacation mode", async ({ page }) => {
    await openSection(page, "Purchases & Sales");
    await expect(page.getByText("Orders & invoices", { exact: true })).toBeVisible();
    await expect(page.getByText("Bundle discount", { exact: true })).toBeVisible();
    await expect(page.getByText("Vacation mode", { exact: true })).toBeVisible();
  });

  test("Verification & Payouts shows the three rows", async ({ page }) => {
    await openSection(page, "Verification & Payouts");
    await expect(page.getByText("Identity verification", { exact: true })).toBeVisible();
    await expect(page.getByText("Payout method", { exact: true })).toBeVisible();
    await expect(page.getByText("Shipping address", { exact: true })).toBeVisible();
  });

  test("Security shows password reset and delete account", async ({ page }) => {
    await openSection(page, "Security");
    await expect(page.getByText("Reset password", { exact: true })).toBeVisible();
    await expect(page.getByText("Delete account", { exact: true }).first()).toBeVisible();
  });

  test("Help & Legal shows support, terms and privacy rows", async ({ page }) => {
    await openSection(page, "Help & Legal");
    await expect(page.getByText("Customer Support", { exact: true })).toBeVisible();
    await expect(page.getByText("Terms of service", { exact: true })).toBeVisible();
    await expect(page.getByText("Privacy policy", { exact: true })).toBeVisible();
  });
});
