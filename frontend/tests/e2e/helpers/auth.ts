import { expect, type Page } from "@playwright/test";

import { FRONTEND_BASE_URL, type RoleCredentials } from "./smoke-data";

export async function expectLoginScreen(page: Page): Promise<void> {
  await expect(page.locator("#identifier, #username")).toBeVisible();
  await expect(page.locator("#password")).toBeVisible();
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
}

export async function loginWithCredentials(
  page: Page,
  credentials: RoleCredentials
): Promise<void> {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await expectLoginScreen(page);
  await page.locator("#identifier, #username").fill(credentials.username);
  await page.locator("#password").fill(credentials.password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(new RegExp(`${escapeForUrl(credentials.dashboard)}(?:\\?.*)?$`));
}

export async function bootstrapRoleSession(
  page: Page,
  credentials: RoleCredentials
): Promise<void> {
  await page.context().addCookies([
    {
      name: "subidha_role",
      value: credentials.role.toUpperCase(),
      url: FRONTEND_BASE_URL,
    },
    {
      name: "subidha_auth",
      value: "1",
      url: FRONTEND_BASE_URL,
    },
  ]);

  await page.goto("/login");
  await page.evaluate(
    ({ session }) => {
      window.localStorage.setItem("subidha_access_token", session.accessToken);
      window.localStorage.setItem("subidha_refresh_token", session.refreshToken);
      window.localStorage.setItem("subidha_session", JSON.stringify(session));
    },
    {
      session: {
        id: credentials.user_id,
        name: credentials.name,
        role: credentials.role,
        accessToken: credentials.access_token,
        refreshToken: credentials.refresh_token,
      },
    }
  );
}

export async function logoutFromApp(page: Page): Promise<void> {
  await page.goto("/logout");
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
  await expectLoginScreen(page);
}

function escapeForUrl(pathname: string): string {
  return pathname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
