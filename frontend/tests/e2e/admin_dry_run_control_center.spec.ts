/**
 * Requires the same smoke bundle as `npm run test:e2e:smoke`:
 * `npm run build:smoke` inlines `NEXT_PUBLIC_API_BASE_URL` for the Playwright backend (8100).
 */
import { expect, test } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

test.use({ storageState: authStatePath("admin") });

test("admin dry run control center loads options and can run selected checks", async ({ page }) => {
  await page.goto("/admin/settings/business-setup/dry-runs");
  await expect(page.getByRole("heading", { name: "Dry Run Control Center" })).toBeVisible();
  await expect(page.getByText("Dry runs do not mutate business data", { exact: false })).toBeVisible();
  await expect(page.getByText("Loading dry run catalog")).toBeHidden({ timeout: 60_000 });
  await expect(page.getByText("Quick checks", { exact: false })).toBeVisible({ timeout: 30_000 });

  await page.getByTestId("dry-run-run-selected").click();
  await expect(page.getByTestId("dry-run-summary-pass")).toBeVisible({ timeout: 60_000 });

  const blocked = page.getByTestId("dry-run-row-blocked");
  const blockedCount = await blocked.count();
  if (blockedCount > 0) {
    await expect(blocked.first()).toBeVisible();
  }
});
