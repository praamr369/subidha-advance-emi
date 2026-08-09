import { expect, test } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";
import { attachBulkRuntimeGuard } from "./helpers/runtime-guard";
import { staticRoutesForRole } from "./helpers/route-inventory";
import type { SmokeRole } from "./helpers/smoke-meta";

// Layer-A.4: load every static App-Router page for each seeded role and assert
// it renders without a runtime crash. This mechanically discharges the "page
// renders / no error boundary / no console crash" hygiene check for the whole
// authenticated surface, so manual review only owes each page its business-logic
// delta. Dynamic `[param]` routes are out of scope here (need a concrete id) and
// the staff/vendor roles are not seeded by the smoke harness yet.
const ROLES: SmokeRole[] = ["admin", "cashier", "partner", "customer"];

for (const role of ROLES) {
  const routes = staticRoutesForRole(role);

  test.describe(`route-load smoke: ${role} (${routes.length} routes)`, () => {
    test.use({ storageState: authStatePath(role) });

    for (const route of routes) {
      test(`${role} loads ${route}`, async ({ page }) => {
        const guard = attachBulkRuntimeGuard(page);

        const response = await page.goto(route, { waitUntil: "domcontentloaded" });

        // The session must be recognised — a bounce to /login means the sweep is
        // misconfigured, not that the page is broken.
        expect(
          page.url(),
          `expected to stay authenticated but landed on ${page.url()}`
        ).not.toContain("/login");

        // The document itself must not be a hard server error.
        if (response) {
          expect(
            response.status(),
            `HTTP ${response.status()} for ${route}`
          ).toBeLessThan(500);
        }

        await expect(page.locator("body")).toBeVisible();

        // Let hydration + the first data fetch settle so client-side crashes and
        // React render errors have a chance to surface.
        await page.waitForTimeout(750);

        const crashes = guard.crashes();
        const detail = crashes
          .map((c) => `[${c.kind}] ${c.message} @ ${c.url}`)
          .join("\n");
        expect(crashes, `runtime crash on ${route}:\n${detail}`).toEqual([]);
      });
    }
  });
}
