import { expect, test } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

test.use({ storageState: authStatePath("admin") });

const WIDGET_PREFS_KEY = "subidha:admin-dashboard-widgets:v1";

test("admin dashboard widget open/collapse persists via localStorage", async ({ page }) => {
  await page.goto("/admin/operations");
  await expect(
    page.getByRole("heading", { name: "Operations Workspace" })
  ).toBeVisible();
  await page.evaluate((key) => window.localStorage.removeItem(key), WIDGET_PREFS_KEY);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Operations Workspace" })
  ).toBeVisible();

  await page.getByRole("button", { name: /support queue/i }).click();
  const supportWidgetHeading = page.getByRole("heading", { name: "Support queue" });
  await expect(supportWidgetHeading).toBeVisible();

  const supportWidget = supportWidgetHeading.locator("xpath=ancestor::section[1]");
  await expect(supportWidget.getByRole("link", { name: /open module/i })).toBeVisible();
  await expect(supportWidget.getByRole("link", { name: /open support queue/i })).toBeVisible();
  await supportWidget.getByRole("button", { name: "Collapse widget" }).click();
  await expect(supportWidget.getByRole("link", { name: /open support queue/i })).not.toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Operations Workspace" })
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Support queue" })).toBeVisible();
  await expect(
    page
      .getByRole("heading", { name: "Support queue" })
      .locator("xpath=ancestor::section[1]")
      .getByRole("link", { name: /open support queue/i })
  ).not.toBeVisible();
});
