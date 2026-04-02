import { expect, test } from "@playwright/test";

import { readSmokeMeta, type RealLoginRole } from "./helpers/smoke-meta";

const meta = readSmokeMeta();
const loginMeta = meta.real_login;

function normalizePath(value: string): string {
  return value.endsWith("/") && value !== "/" ? value.slice(0, -1) : value;
}

async function submitThroughForm(page, username: string, secret: string) {
  await page.goto("/login");
  await expect(page.locator("input").nth(0)).toBeVisible();
  await expect(page.locator("input").nth(1)).toBeVisible();
  await page.locator("input").nth(0).fill(username);
  await page.locator("input").nth(1).fill(secret);
  await page.locator("button").first().click();
}

test.describe("real login smoke", () => {
  test("login page loads and failed submission shows a sane error", async ({ page }) => {
    const adminUsername = loginMeta.roles.admin.username;

    await submitThroughForm(page, adminUsername, loginMeta.invalid_secret);

    await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
    await expect(page.locator("body")).toContainText(
      /login failed|no active account|invalid/i
    );
  });

  for (const role of ["admin", "cashier"] as RealLoginRole[]) {
    test(`${role} real form submission reaches the correct dashboard`, async ({ page }) => {
      const roleInfo = loginMeta.roles[role];
      const expectedPath = normalizePath(roleInfo.dashboard_path);

      await submitThroughForm(page, roleInfo.username, loginMeta.secret);

      await expect(page).toHaveURL((url) => {
        const pathname = normalizePath(url.pathname);
        return pathname === expectedPath || pathname.startsWith(`${expectedPath}/`);
      });

      await expect(page.locator("body")).toContainText(
        role === "admin"
          ? /admin|payments|subscriptions/i
          : /cashier|collect payment|payment history/i
      );
    });
  }
});
