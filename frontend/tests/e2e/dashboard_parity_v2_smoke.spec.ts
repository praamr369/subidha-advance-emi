import { expect, test } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

for (const role of [
  { name: "admin", path: "/admin", heading: "Admin Dashboard" },
  { name: "partner", path: "/partner", heading: "Partner Dashboard" },
  { name: "cashier", path: "/cashier", heading: "Cashier Dashboard" },
  { name: "customer", path: "/customer", heading: "Customer Workspace" },
] as const) {
  test.describe(`${role.name} dashboard parity v2`, () => {
    test.use({ storageState: authStatePath(role.name) });

    test("shows the shared drilldown window and canonical surfaces", async ({ page }) => {
      await page.goto(role.path);
      await expect(page.getByRole("heading", { name: role.heading })).toBeVisible();
      await expect(page.locator("body")).toContainText("Drilldown window");
    });
  });
}
