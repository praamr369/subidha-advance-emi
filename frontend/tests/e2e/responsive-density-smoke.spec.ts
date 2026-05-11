import { expect, test } from "@playwright/test";

import { authStatePath, readSmokeManifest } from "./helpers/smoke-data";

/**
 * Representative viewports for 100% zoom operational QA (see AGENTS / UX goals).
 */
const VIEWPORTS = [
  { label: "1366x768", width: 1366, height: 768 },
  { label: "1536x864", width: 1536, height: 864 },
  { label: "768x1024", width: 768, height: 1024 },
  { label: "390x844", width: 390, height: 844 },
] as const;

const DASH_ROLES = ["admin", "cashier", "customer", "partner"] as const;

test.describe.configure({ timeout: 120_000 });

/** Primary surface: #main-content should not grow wider than the viewport (scroll lives inside panels/tables). */
async function assertNoRunawayHorizontalOverflow(page: import("@playwright/test").Page) {
  const mainDelta = await page.evaluate(() => {
    const main = document.getElementById("main-content");
    return main ? main.scrollWidth - main.clientWidth : 0;
  });
  expect(mainDelta, "#main-content scrollWidth delta").toBeLessThanOrEqual(12);
}

for (const vp of VIEWPORTS) {
  test.describe(`responsive density — ${vp.label}`, () => {
    test(`public home + login (${vp.label})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      await assertNoRunawayHorizontalOverflow(page);

      await page.goto("/login");
      await expect(page.locator("#username")).toBeVisible();
      await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
      await assertNoRunawayHorizontalOverflow(page);
    });

    for (const role of DASH_ROLES) {
      test(`${role} dashboard shell (${vp.label})`, async ({ browser }) => {
        const manifest = readSmokeManifest();
        const targetUrl = manifest.credentials[role].dashboard;

        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          storageState: authStatePath(role),
        });
        const page = await context.newPage();

        await page.goto(targetUrl);
        await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 45_000 });
        await assertNoRunawayHorizontalOverflow(page);

        const mobile = vp.width < 768;
        if (mobile) {
          await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
        } else {
          await expect(page.getByRole("navigation", { name: /sidebar navigation/i })).toBeVisible();
        }

        await expect(
          page.getByRole("button", { name: /quick actions|open quick actions/i }).first()
        ).toBeVisible();

        await context.close();
      });
    }

    test(`admin subscriptions table scroll container (${vp.label})`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        storageState: authStatePath("admin"),
      });
      const page = await context.newPage();
      await page.goto("/admin/subscriptions?page=1&page_size=25");
      await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 45_000 });
      await page.waitForFunction(
        () =>
          Boolean(
            document.querySelector("#main-content table") ||
              document.body.innerText.includes("No subscriptions") ||
              document.body.innerText.includes("Unable to load subscription register")
          ),
        undefined,
        { timeout: 90_000 }
      );
      const tableCount = await page.locator("#main-content table").count();
      if (tableCount > 0) {
        const tableScroll = page.locator("#main-content .overflow-x-auto, #main-content .ops-table-scroll");
        await expect(tableScroll.first()).toBeVisible({ timeout: 15_000 });
      } else {
        await expect(
          page.getByText(/No subscriptions|Unable to load subscription register/i)
        ).toBeVisible();
      }
      await assertNoRunawayHorizontalOverflow(page);
      await context.close();
    });
  });
}
