import { expect, test } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

test.use({ storageState: authStatePath("admin") });

test("online enquiries workspace loads", async ({ page }) => {
  await page.goto("/admin/online-enquiries");
  await expect(page.getByRole("heading", { name: "Online purchase enquiries" })).toBeVisible();
});
