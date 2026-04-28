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
    const main = page.locator("#main-content");
    await expect(
      page.getByRole("heading", { name: /Daily Operator Dashboard|Executive Dashboard/i })
    ).toBeVisible();
    await expect(page.locator("body")).toContainText("Today");
    await expect(page.locator("body")).toContainText("Urgent alerts");
    await expect(page.locator("body")).toContainText("Quick actions");
    await expect(main.getByRole("link", { name: "Open Operations", exact: true })).toBeVisible();
    await expect(main.getByRole("link", { name: "ERP Home", exact: true })).toBeVisible();
    await expect(main.getByRole("link", { name: "BI", exact: true })).toBeVisible();
  });

  test("admin advanced mode still accessible via operator mode toggle", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByTestId("operator-mode-toggle")).toBeVisible();
    await expect(page.getByTestId("operator-mode-toggle")).toHaveAccessibleName(/Switch Advanced|Switch Simple/);
    await page.getByTestId("operator-mode-toggle").click();
    await expect(page.getByTestId("operator-mode-toggle")).toHaveAccessibleName(/Switch Advanced|Switch Simple/);
    await expect(page.getByRole("heading", { name: "Executive Dashboard" })).toBeVisible();
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
