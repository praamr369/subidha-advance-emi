import { expect, test } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";
import { resetAdminDashboardClientState } from "./helpers/dashboard-state";

test.describe("admin dashboard smoke", () => {
  test.use({ storageState: authStatePath("admin") });

  test.beforeEach(async ({ page }) => {
    await resetAdminDashboardClientState(page);
  });

  test("admin dashboard renders canonical finance panels", async ({ page }) => {
    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { name: /(?:Executive|Admin) Dashboard/i })
    ).toBeVisible();
    await expect(page.locator("body")).toContainText("Settlement Posture");
    await expect(page.locator("body")).toContainText("Launch Points");
  });

  test("admin widget board supports hide, pin, and reset controls", async ({
    page,
  }) => {
    await page.goto("/admin");
    await page.getByRole("button", { name: "Widget controls" }).click();

    const quickActionsRow = page.getByTestId(
      "dashboard-widget-control-row:quick-actions"
    );
    await quickActionsRow
      .getByRole("button", { name: "Hide", exact: true })
      .click();
    await expect(page.locator("body")).toContainText("1 widget is currently hidden.");

    await quickActionsRow
      .getByRole("button", { name: /^(Pin|Unpin)$/ })
      .click();
    await expect(page.locator("body")).toContainText(/Widget (pinned|unpinned)/);

    await page.getByRole("button", { name: "Reset layout" }).click();
    await expect(page.locator("body")).toContainText("Quick actions");
  });

  test("admin dashboard supports preset mode switching", async ({ page }) => {
    await page.goto("/admin");
    await page.getByRole("button", { name: "Finance watch" }).click();
    await expect(page.getByRole("button", { name: "Reset to preset" })).toBeVisible();
    await expect(page.locator("body")).toContainText("Settlement posture");
  });
});

test.describe("partner dashboard smoke", () => {
  test.use({ storageState: authStatePath("partner") });

  test("partner dashboard renders canonical finance panels", async ({ page }) => {
    await page.goto("/partner");
    await expect(
      page.getByRole("heading", { name: "Partner Dashboard" })
    ).toBeVisible();
    await expect(page.locator("body")).toContainText("Settlement posture");
    await expect(page.locator("body")).toContainText("Due collection queue");
  });
});

test.describe("cashier dashboard smoke", () => {
  test.use({ storageState: authStatePath("cashier") });

  test("cashier dashboard renders canonical finance panels", async ({ page }) => {
    await page.goto("/cashier");
    await expect(
      page.getByRole("heading", { name: "Cashier Dashboard" })
    ).toBeVisible();
    await expect(page.locator("body")).toContainText("Settlement posture");
    await expect(page.locator("body")).toContainText("Due collection queue");
  });
});

test.describe("customer dashboard smoke", () => {
  test.use({ storageState: authStatePath("customer") });

  test("customer dashboard remains the canonical baseline", async ({ page }) => {
    await page.goto("/customer");
    await expect(
      page.getByRole("heading", { name: "Customer Workspace" })
    ).toBeVisible();
    await expect(page.locator("body")).toContainText("Financial alignment");
    await expect(page.locator("body")).toContainText("Waived by benefit");
  });
});
