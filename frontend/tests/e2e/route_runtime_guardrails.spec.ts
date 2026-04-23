import { expect, test, type Page } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";
import { attachRuntimeGuard } from "./helpers/runtime-guard";

async function visitRouteAndAssertClean(page: Page, route: string) {
  const guard = attachRuntimeGuard(page);
  await page.goto(route);
  await expect(page.locator("body")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(route.replace("/", "\\/")));
  await guard.assertClean();
}

test.describe("admin runtime guardrails", () => {
  test.use({ storageState: authStatePath("admin") });

  test("/admin, /admin/operations, and /admin/finance remain runtime clean", async ({
    page,
  }) => {
    await visitRouteAndAssertClean(page, "/admin");
    await visitRouteAndAssertClean(page, "/admin/operations");
    await visitRouteAndAssertClean(page, "/admin/finance");
  });
});

test.describe("cashier runtime guardrails", () => {
  test.use({ storageState: authStatePath("cashier") });

  test("/cashier/collect remains runtime clean", async ({ page }) => {
    await visitRouteAndAssertClean(page, "/cashier/collect");
  });
});

test.describe("customer runtime guardrails", () => {
  test.use({ storageState: authStatePath("customer") });

  test("/customer/profile remains runtime clean", async ({ page }) => {
    await visitRouteAndAssertClean(page, "/customer/profile");
  });
});

test.describe("partner runtime guardrails", () => {
  test.use({ storageState: authStatePath("partner") });

  test("/partner remains runtime clean", async ({ page }) => {
    await visitRouteAndAssertClean(page, "/partner");
  });
});
