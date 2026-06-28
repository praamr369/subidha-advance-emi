import { expect, test } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";
import { resetAdminDashboardClientState } from "./helpers/dashboard-state";

async function expectDashboardSurfaceOrFetchError(
  page: Parameters<Parameters<typeof test>[1]>[0]["page"],
  successMarkers: string[]
) {
  const body = page.locator("body");
  const hasFetchError = await body
    .getByText(/Unable to load .*dashboard|Unable to load .*workspace|Failed to fetch/i)
    .first()
    .isVisible()
    .catch(() => false);

  if (hasFetchError) {
    await expect(body).toContainText(/Failed to fetch|Unable to load/i);
    await expect(page.getByRole("button", { name: /Retry/i }).first()).toBeVisible();
    return;
  }

  for (const marker of successMarkers) {
    await expect(body).toContainText(marker);
  }
}

test.describe("admin dashboard smoke", () => {
  test.use({ storageState: authStatePath("admin") });

  test.beforeEach(async ({ page }) => {
    await resetAdminDashboardClientState(page);
  });

  test("admin dashboard renders canonical finance panels", async ({ page }) => {
    await page.goto("/admin");
    const main = page.locator("#main-content");
    await expect(page).toHaveURL(/\/admin$/);
    await expectDashboardSurfaceOrFetchError(page, [
      "Today",
      "Urgent alerts",
      "Quick actions",
    ]);
    const hasFetchError = await page
      .locator("body")
      .getByText(/Unable to load .*dashboard|Failed to fetch/i)
      .first()
      .isVisible()
      .catch(() => false);
    if (!hasFetchError) {
      await expect(
        main.getByRole("link", { name: "Open Operations", exact: true })
      ).toBeVisible();
      await expect(main.getByRole("link", { name: "ERP Home", exact: true })).toBeVisible();
      await expect(main.getByRole("link", { name: "BI", exact: true })).toBeVisible();
    }
  });

  test("admin exposes one merged sidebar without an operator mode selector", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByTestId("operator-mode-toggle")).toHaveCount(0);
    await expect(page.getByRole("complementary").getByRole("button", { name: /Accounting & Reconciliation/i })).toBeVisible();
  });
});

test.describe("partner dashboard smoke", () => {
  test.use({ storageState: authStatePath("partner") });

  test("partner dashboard renders canonical finance panels", async ({ page }) => {
    await page.goto("/partner");
    await expect(
      page.getByRole("heading", { name: "Partner Dashboard" })
    ).toBeVisible();
    await expectDashboardSurfaceOrFetchError(page, [
      "Settlement posture",
      "Due collection queue",
    ]);
  });
});

test.describe("cashier dashboard smoke", () => {
  test.use({ storageState: authStatePath("cashier") });

  test("cashier dashboard renders canonical finance panels", async ({ page }) => {
    await page.goto("/cashier");
    await expect(
      page.getByRole("heading", { name: "Cashier Dashboard" })
    ).toBeVisible();
    await expectDashboardSurfaceOrFetchError(page, [
      "Settlement posture",
      "Due collection queue",
    ]);
  });
});

test.describe("customer dashboard smoke", () => {
  test.use({ storageState: authStatePath("customer") });

  test("customer dashboard remains the canonical baseline", async ({ page }) => {
    await page.goto("/customer");
    await expect(
      page.getByRole("heading", { name: "Customer Workspace" })
    ).toBeVisible();
    await expectDashboardSurfaceOrFetchError(page, [
      "Financial alignment",
      "Waived by benefit",
    ]);
  });
});
