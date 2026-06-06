import { mkdirSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

test.use({ storageState: authStatePath("admin") });

const screenshotDir = path.resolve(process.cwd(), "../docs/accounting/screenshots");

async function saveScreenshot(page, name: string, fullPage = true) {
  mkdirSync(screenshotDir, { recursive: true });
  await page.screenshot({ path: path.join(screenshotDir, name), fullPage });
}

test("accounting bridge readiness visual reference screenshots", async ({ page }) => {
  await page.goto("/admin/accounting/bridges");

  await expect(page.getByRole("heading", { name: /Accounting Bridge Readiness/i }).first()).toBeVisible();
  await expect(page.getByText("This page is read-only")).toBeVisible();
  await expect(page.getByText("Postable").first()).toBeVisible();
  await expect(page.getByText("Reconciled").first()).toBeVisible();
  await expect(page.getByText("Unsupported").first()).toBeVisible();
  await expect(page.getByText("Open bridge reconciliation").first()).toBeVisible();

  await saveScreenshot(page, "02-accounting-bridge-readiness-summary.png", false);
  await saveScreenshot(page, "03-accounting-bridge-readiness-groups.png", true);

  await page.getByPlaceholder("Search event, source, status, profile key, account").fill("Staff advance");
  await expect(page.getByText("Staff advance").first()).toBeVisible();
  await expect(page.getByText("UNSUPPORTED_SOURCE").first()).toBeVisible();
  await expect(page.getByText("Do not create fake posting readiness").first()).toBeVisible();
  await saveScreenshot(page, "03a-accounting-bridge-staff-advance-unsupported.png", true);

  await page.getByPlaceholder("Search event, source, status, profile key, account").fill("");
  await page.getByRole("button", { name: "Approval" }).click();
  await expect(page.getByText("BLOCKED_BY_APPROVAL").first()).toBeVisible();
  await expect(page.getByText("Accounting setup exists, but controlled bridge posting approval is required").first()).toBeVisible();
  await saveScreenshot(page, "03b-accounting-bridge-approval-gated.png", true);

  await page.getByRole("button", { name: "Reconciliation pending" }).click();
  await expect(page.getByText("Postable · Reconciliation pending").first()).toBeVisible();
  await expect(page.getByText("Open bridge reconciliation").first()).toBeVisible();
  await saveScreenshot(page, "03c-accounting-bridge-reconciliation-pending.png", true);

  await page.getByRole("button", { name: "All" }).click();
  await page.getByText("Advanced raw readiness").click();
  await expect(page.getByText("Advanced raw readiness")).toBeVisible();
  await expect(page.getByText("Canonical status")).toBeVisible();
  await saveScreenshot(page, "03d-accounting-bridge-advanced-raw-readiness.png", true);
});
