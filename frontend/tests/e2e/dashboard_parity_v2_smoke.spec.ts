import { expect, test } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

for (const role of [
  {
    name: "admin",
    path: "/admin",
    heading: /(?:Executive|Admin) Dashboard/i,
    markerText: "Launch Points",
  },
  {
    name: "partner",
    path: "/partner",
    heading: "Partner Dashboard",
    markerText: "Drilldown window",
  },
  {
    name: "cashier",
    path: "/cashier",
    heading: "Cashier Dashboard",
    markerText: "Drilldown window",
  },
  {
    name: "customer",
    path: "/customer",
    heading: "Customer Workspace",
    markerText: "Drilldown window",
  },
] as const) {
  test.describe(`${role.name} dashboard parity v2`, () => {
    test.use({ storageState: authStatePath(role.name) });

    test("shows the shared drilldown window and canonical surfaces", async ({ page }) => {
      await page.goto(role.path);
      await expect(page.getByRole("heading", { name: role.heading })).toBeVisible();
      await expect(page.locator("body")).toContainText(role.markerText);
    });
  });
}
