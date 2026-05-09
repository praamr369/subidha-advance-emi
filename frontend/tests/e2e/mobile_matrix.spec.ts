import { expect, test } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

const VIEWPORTS = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1366, height: 768 },
] as const;

async function expectNoHorizontalOverflow(page: Parameters<Parameters<typeof test>[1]>[0]["page"]) {
  const metrics = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    return {
      overflowDelta: root.scrollWidth - root.clientWidth,
      rootOverflowX: window.getComputedStyle(root).overflowX,
      bodyOverflowX: window.getComputedStyle(body).overflowX,
    };
  });
  if (metrics.overflowDelta > 2) {
    const overflowIsClipped =
      ["hidden", "clip"].includes(metrics.rootOverflowX) ||
      ["hidden", "clip"].includes(metrics.bodyOverflowX);
    expect(overflowIsClipped).toBeTruthy();
    return;
  }
  expect(metrics.overflowDelta).toBeLessThanOrEqual(2);
}

async function checkRouteAtViewport(
  page: Parameters<Parameters<typeof test>[1]>[0]["page"],
  route: string,
  headingPattern: RegExp
) {
  await page.goto(route);
  await expect(page.getByRole("heading", { name: headingPattern }).first()).toBeVisible();
  await expectNoHorizontalOverflow(page);
}

test.describe("mobile matrix public routes", () => {
  test("home, products, and login remain usable across target widths", async ({ page }) => {
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await checkRouteAtViewport(page, "/", /Furniture and appliances|Home/i);
      await checkRouteAtViewport(page, "/products", /Products/i);
      await checkRouteAtViewport(page, "/login", /Welcome back|Login/i);
    }
  });
});

test.describe("mobile matrix admin routes", () => {
  test.use({ storageState: authStatePath("admin") });

  test("admin, inventory, and deliveries layouts stay stable across widths", async ({
    page,
  }) => {
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await checkRouteAtViewport(page, "/admin", /Dashboard|Workspace/i);
      await checkRouteAtViewport(page, "/admin/inventory", /Inventory/i);
      await checkRouteAtViewport(page, "/admin/deliveries", /Deliver/i);

      if (viewport.width < 768) {
        const openMenu = page.getByRole("button", { name: "Open menu" });
        await openMenu.click();
        await expect(
          page.getByRole("navigation", { name: /sidebar navigation/i })
        ).toBeVisible();
        await page.getByRole("button", { name: "Close sidebar" }).click();
        await expect(openMenu).toHaveAttribute("aria-expanded", "false");
      }

      await page.getByTestId("header-notification-bell").click();
      await expect(page.getByRole("dialog", { name: "Notifications menu" })).toBeVisible();
      await page.keyboard.press("Escape");
    }
  });
});

test.describe("mobile matrix cashier routes", () => {
  test.use({ storageState: authStatePath("cashier") });

  test("cashier dashboard and collect remain usable across widths", async ({ page }) => {
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await checkRouteAtViewport(page, "/cashier", /Cashier Dashboard/i);
      await checkRouteAtViewport(page, "/cashier/collect", /Collect/i);
    }
  });
});

test.describe("mobile matrix customer and partner routes", () => {
  test("customer dashboard stays usable across widths", async ({ browser }) => {
    const context = await browser.newContext({ storageState: authStatePath("customer") });
    const page = await context.newPage();
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await checkRouteAtViewport(page, "/customer", /Customer Workspace/i);
    }
    await context.close();
  });

  test("partner dashboard stays usable across widths", async ({ browser }) => {
    const context = await browser.newContext({ storageState: authStatePath("partner") });
    const page = await context.newPage();
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await checkRouteAtViewport(page, "/partner", /Partner Dashboard/i);
    }
    await context.close();
  });
});
