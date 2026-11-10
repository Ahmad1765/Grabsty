// Settings → payout details, CNIC-only Certified Seller, and the hidden
// Appearance row. Writes real rows for the E2E account on the dev backend
// (payout_methods + verifications); the account is test-only. Serial because
// each step builds on the previous one's saved state.

import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import { waitForAppReady } from "../helpers/page";

test.describe.configure({ mode: "serial" });

const PHOTO = path.join(process.cwd(), "public", "brand-showcase.jpg");
// Random so reruns never collide with the one-CNIC-per-account rule.
const CNIC = `35202${String(Date.now()).slice(-8)}`;

async function openVerifyPanel(page: Page) {
  await page.goto("/settings");
  await waitForAppReady(page);
  await page.getByText("Verification & Payouts", { exact: true }).first().click();
  await expect(page.getByText("Payout method", { exact: true })).toBeVisible();
}

const field = (page: Page, label: string) => page.getByLabel(label, { exact: true }).last();

test("General no longer offers Appearance / dark mode", async ({ page }) => {
  await page.goto("/settings");
  await waitForAppReady(page);
  await expect(page.getByText("Push notifications", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Appearance", { exact: true })).toHaveCount(0);
  const dark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
  expect(dark).toBe(false);
});

test("payout: validates, saves a bank IBAN, then switches to a +92 wallet", async ({ page }) => {
  await openVerifyPanel(page);
  await page.getByText(/^(Add payout|Manage)$/).first().click();
  await expect(page.getByText("Account holder name", { exact: true })).toBeVisible();

  const save = page.getByText(/^(Save payout|Update payout)$/).last();
  // Reruns start from the wallet the previous run saved.
  await page.getByText("Bank account", { exact: true }).last().click();

  await field(page, "Bank name").fill("HBL");
  await field(page, "Account holder name").fill("E2E Tester");
  await field(page, "IBAN or account number").fill("PK36 SCBL 1234");
  await expect(page.getByText("Enter a 24-character IBAN (PK…) or your account number")).toBeVisible();
  await expect(save).toBeDisabled();

  await field(page, "IBAN or account number").fill("pk36 scbl 0000 0011 2345 6702");
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByText(/HBL ••6702 · E2E Tester/)).toBeVisible({ timeout: 15_000 });

  // Edit: switch to a wallet typed in international format.
  await page.getByText("Manage", { exact: true }).first().click();
  await expect(field(page, "IBAN or account number")).toHaveValue("PK36SCBL0000001123456702");
  await page.getByText("Mobile wallet", { exact: true }).last().click();
  await page.getByText("Easypaisa", { exact: true }).last().click();
  await field(page, "Wallet mobile number").fill("+92 300 1234567");
  await page.getByText("Update payout", { exact: true }).last().click();
  await expect(page.getByText(/Easypaisa ••4567 · E2E Tester/)).toBeVisible({ timeout: 15_000 });
});

test("Certified Seller: CNIC only, formats the number, needs both photos", async ({ page }) => {
  await openVerifyPanel(page);
  await expect(page.getByText("Certified Seller", { exact: true })).toBeVisible();
  // "Pending" on reruns: resubmitting while under review is allowed.
  // Wait for the saved status: the button reads "Verify CNIC" until it loads.
  await expect(
    page.getByText(/^(Verify with your CNIC|CNIC submitted, pending review|Not approved)/).first(),
  ).toBeVisible({ timeout: 15_000 });
  const entry = page.getByText(/^(Verify CNIC|Pending)$/).first();
  await expect(entry).toBeVisible({ timeout: 15_000 });
  const rerun = (await entry.textContent()) === "Pending";
  await entry.click();
  await expect(page.getByText("Become a Certified Seller", { exact: true })).toBeVisible();
  // Passport / licence options are gone.
  await expect(page.getByText("Passport", { exact: true })).toHaveCount(0);

  await field(page, "Full name (as on CNIC)").fill("E2E Tester");
  await field(page, "CNIC number").fill(CNIC);
  await expect(field(page, "CNIC number")).toHaveValue(`${CNIC.slice(0, 5)}-${CNIC.slice(5, 12)}-${CNIC.slice(12)}`);

  const submit = page.getByText(/^(Submit for review|Resubmit for review)$/).last();
  if (rerun) {
    await expect(page.getByText("Under review. We usually reply within a day.")).toBeVisible();
  } else {
    await expect(submit).toBeDisabled(); // no photos yet
  }

  for (const side of ["Front", "Back"]) {
    const chooser = page.waitForEvent("filechooser");
    await page.getByTestId(`cnic-${side}`).click();
    await (await chooser).setFiles(PHOTO);
    await expect(page.getByTestId(`cnic-${side}`).locator("img")).toHaveCount(1, { timeout: 10_000 });
  }

  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByText("CNIC submitted, pending review")).toBeVisible({ timeout: 30_000 });
});
