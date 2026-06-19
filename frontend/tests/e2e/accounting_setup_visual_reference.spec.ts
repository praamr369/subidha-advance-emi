import { mkdirSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

test.use({ storageState: authStatePath("admin") });

const screenshotDir = path.resolve(process.cwd(), "../docs/accounting/screenshots");

async function saveScreenshot(page: Page, name: string, fullPage = true) {
  mkdirSync(screenshotDir, { recursive: true });
  await page.screenshot({ path: path.join(screenshotDir, name), fullPage });
}

test("accounting bridge readiness visual reference screenshots", async ({ page }) => {
  await page.goto("/admin/accounting/bridges");

  await expect(page.getByRole("heading", { name: /Accounting Bridge Readiness/i }).first()).toBeVisible();
  await expect(
    page.getByText(
      "This page summarizes accounting setup definitions only. It does not post, reconcile, approve, close, or mutate operational source records."
    )
  ).toBeVisible();
  await expect(page.getByText("Setup-ready", { exact: true })).toBeVisible();
  await expect(page.getByText("Reconciled evidence", { exact: true })).toBeVisible();
  await expect(page.getByText("Unsupported boundary", { exact: true })).toBeVisible();
  await expect(page.getByText("Open bridge reconciliation").first()).toBeVisible();

  await saveScreenshot(page, "02-accounting-bridge-readiness-summary.png", false);
  await saveScreenshot(page, "03-accounting-bridge-readiness-groups.png", true);

  await page.getByPlaceholder("Search event, source, status, profile key, account").fill("Staff advance");
  await expect(page.getByText("Staff advance").first()).toBeVisible();
  await expect(page.getByText("UNSUPPORTED_SOURCE").first()).toBeVisible();
  await expect(
    page.getByText(
      /This is a future\/unsupported source boundary.*create fake posting readiness/i
    )
  ).toBeVisible();
  await saveScreenshot(page, "03a-accounting-bridge-staff-advance-unsupported.png", true);

  await page.getByPlaceholder("Search event, source, status, profile key, account").fill("");
  const approvalFilter = page.getByRole("button", { name: "Approval" });
  await approvalFilter.click();
  await expect(approvalFilter).toBeFocused();
  await expect(page.getByText("BLOCKED_BY_APPROVAL")).toHaveCount(0);
  await saveScreenshot(page, "03b-accounting-bridge-approval-empty.png", true);

  await page.getByRole("button", { name: "Postable" }).click();
  await expect(page.getByText("Setup-ready profile").first()).toBeVisible();
  await expect(page.getByText("Open bridge reconciliation").first()).toBeVisible();
  await saveScreenshot(page, "03c-accounting-bridge-setup-ready.png", true);

  await page.getByRole("button", { name: "All" }).click();
  await expect(page.getByRole("heading", { name: "Readiness definitions" })).toBeVisible();
  await expect(page.getByText("Staff advance").first()).toBeVisible();
  await saveScreenshot(page, "03d-accounting-bridge-all-definitions.png", true);
});
