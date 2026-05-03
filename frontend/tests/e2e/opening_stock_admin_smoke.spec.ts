import { expect, test } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

test.describe("Admin opening stock", () => {
  test.use({ storageState: authStatePath("admin") });

  test("opening stock page loads with manual entry and CSV controls", async ({ page }) => {
    await page.goto("/admin/inventory/opening-stock");
    await expect(
      page.locator("#main-content").getByRole("heading", { name: /^Opening Stock$/i })
    ).toBeVisible({ timeout: 45_000 });
    await page.getByTestId("opening-stock-tab-manual").click();
    await expect(page.getByTestId("opening-stock-item-select")).toBeVisible();
    await expect(page.getByTestId("opening-stock-location-select")).toBeVisible();
    await expect(page.getByTestId("opening-stock-qty-input")).toBeVisible();
    await expect(page.getByTestId("opening-stock-unit-cost-input")).toBeVisible();
    await expect(page.getByTestId("opening-stock-effective-date-input")).toBeVisible();

    await page.getByTestId("opening-stock-tab-csv").click();
    await expect(page.getByTestId("opening-stock-csv-template-btn")).toBeVisible();
    await expect(page.getByTestId("opening-stock-csv-file-input")).toBeVisible();
    await expect(page.getByTestId("opening-stock-csv-preview-btn")).toBeVisible();
    await expect(page.getByTestId("opening-stock-csv-apply-btn")).toBeVisible();
  });

  test("manual entry shows validation when required selects empty", async ({ page }) => {
    await page.goto("/admin/inventory/opening-stock");
    await page.getByTestId("opening-stock-tab-manual").click();
    await page.getByRole("button", { name: /save draft/i }).click();
    const alertVisible = await page.evaluate(() => {
      const sel = document.querySelector('[data-testid="opening-stock-item-select"]') as HTMLSelectElement | null;
      return sel?.matches(":invalid") ?? false;
    });
    expect(alertVisible).toBeTruthy();
  });
});
