import { expect, test } from "@playwright/test";

import { bootstrapRoleSession, logoutFromApp } from "./helpers/auth";
import {
  authStatePath,
  readSmokeManifest,
  type RoleKey,
} from "./helpers/smoke-data";

const roleKeys: RoleKey[] = ["admin", "cashier", "customer", "partner"];

for (const role of roleKeys) {
  test(`role session bootstrap and logout works for ${role}`, async ({ page }) => {
    const manifest = readSmokeManifest();
    await bootstrapRoleSession(page, manifest.credentials[role]);
    await page.goto(manifest.credentials[role].dashboard);
    await expect(page).toHaveURL(
      new RegExp(
        `${manifest.credentials[role].dashboard.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        )}(?:\\?.*)?$`
      )
    );
    await logoutFromApp(page);
  });
}

test.describe("authenticated role redirects", () => {
  test.use({ storageState: authStatePath("partner") });

  test("login page redirects authenticated partner to dashboard", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/partner$/);
  });
});

test.describe("unauthorized route blocking", () => {
  test.use({ storageState: authStatePath("customer") });

  test("customer cannot access admin workspace", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/unauthorized$/);
    await expect(
      page.getByRole("heading", { name: "Access Denied" })
    ).toBeVisible();
  });
});
