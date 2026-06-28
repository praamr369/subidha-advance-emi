import { expect, test } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

test.use({ storageState: authStatePath("admin") });

test("admin uses one merged navigation catalog", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Daily Operator Dashboard" })).toBeVisible();
  await expect(page.locator("body")).toContainText("primary daily dashboard");
  await expect(page.locator("body")).toContainText("Quick actions");

  await expect(page.getByTestId("operator-mode-toggle")).toHaveCount(0);
  await expect(page.getByRole("complementary").getByRole("button", { name: /Accounting & Reconciliation/i })).toBeVisible();
});
