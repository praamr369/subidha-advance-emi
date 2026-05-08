import { expect, test } from "@playwright/test";
import { authStatePath } from "./helpers/smoke-data";
import { hasStorageState } from "./helpers/auth-state";

test.describe("UX polish smoke", () => {
  test.describe("admin surfaces", () => {
    test.use({ storageState: authStatePath("admin") });

    test("direct sale workspace settles loading skeletons without persistent busy regions", async ({ page }) => {
      await page.goto("/admin/billing/direct-sale");
      await expect(page.getByRole("heading", { name: /Direct Sale Workspace/i })).toBeVisible();
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 45_000 });
    });

    test("notification bell opens an accessible dropdown shell", async ({ page }) => {
      await page.goto("/admin");
      await page.getByTestId("header-notification-bell").click();
      await expect(page.getByRole("dialog", { name: "Notifications menu" })).toBeVisible();
    });

    test("notification bell opens on mobile viewport", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/admin");
      await page.getByTestId("header-notification-bell").click();
      await expect(page.getByRole("dialog", { name: "Notifications menu" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Close", exact: true })).toBeVisible();
    });

    test("notification bell shows error state safely", async ({ page }) => {
      await page.route("**/api/v1/admin/notifications/**", async (route) => {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Server error" }),
        });
      });
      await page.goto("/admin");
      await page.getByTestId("header-notification-bell").click();
      await expect(page.locator("body")).toContainText("Notifications unavailable");
    });

    test("mobile sidebar opens and closes from header controls", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/admin");
      const openMenu = page.getByRole("button", { name: "Open menu" });
      await openMenu.click();
      await expect(page.getByRole("navigation", { name: /sidebar navigation/i })).toBeVisible();
      await page.getByRole("button", { name: "Close sidebar" }).click();
      await expect(openMenu).toHaveAttribute("aria-expanded", "false");
    });

    test("mobile sidebar closes after route click", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/admin");
      const openMenu = page.getByRole("button", { name: "Open menu" });
      await openMenu.click();
      await expect(page.locator("input[placeholder='Filter modules']:visible")).toHaveCount(1);
      const nextRouteLink = page.locator("#mobile-sidebar-nav a[href]:visible").nth(1);
      await nextRouteLink.click();
      await expect(openMenu).toHaveAttribute("aria-expanded", "false");
    });

    test("mobile key pages avoid body-level horizontal overflow", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      for (const route of ["/admin", "/admin/billing/direct-sale", "/admin/deliveries"]) {
        await page.goto(route);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth
        );
        expect(overflow).toBeFalsy();
      }
    });

    test("direct-sale delivery history-only case hides mutation actions", async ({ page }) => {
      await page.route("**/api/v1/admin/deliveries/direct-sale-cases/99/", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: 99,
            case_id: 99,
            sale_no: "SALE-99",
            status: "CANCELLED",
            status_label: "History only",
            source_status: "REVERSED_POST_INVOICE",
            source_reversed: true,
            source_archived: true,
            history_only: true,
            return_pickup_completed: true,
            stock_return_status: "SALE_RETURN_IN_POSTED",
            links: { open_direct_sale: "/admin/billing/direct-sale?highlight_sale=99" },
            next_actions: [],
            blocking_reasons: [],
          }),
        });
      });
      await page.route("**/api/v1/admin/audit-logs/timeline/ServiceDeskCase/99/", async (route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results: [] }) });
      });

      await page.goto("/admin/deliveries/direct-sale-cases/99");
      await expect(page.locator("body")).toContainText("Source reversed");
      await expect(page.locator("body")).toContainText("Returned to stock");
      await expect(page.locator("body")).toContainText("History only");
      await expect(page.locator("body")).toContainText("No action required");
      await expect(page.getByRole("button", { name: "Assign / Reschedule Delivery" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Create Delivery Action Note" })).toBeDisabled();
      await expect(page.getByRole("button", { name: "Mark Delivered" })).toHaveCount(0);
    });

    test("collapsed navigation remains keyboard focusable", async ({ page }) => {
      await page.goto("/admin");
      await page.getByRole("button", { name: "Collapse sidebar" }).click();
      const commandCenterButton = page.getByRole("button", { name: "Command Center" });
      await commandCenterButton.focus();
      await expect(commandCenterButton).toBeFocused();
    });

    test("opening stock workspace renders without persistent busy overlay", async ({ page }) => {
      await page.goto("/admin/inventory/opening-stock");
      await expect(
        page.locator("#main-content").getByRole("heading", { name: /^Opening Stock$/i })
      ).toBeVisible({ timeout: 45_000 });
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 45_000 });
    });
  });

  test.describe("customer dashboard", () => {
    test.use({ storageState: authStatePath("customer") });

    test("customer home renders workspace heading after navigation", async ({ page }) => {
      await page.goto("/customer");
      await expect(page.getByRole("heading", { name: "Customer Workspace" })).toBeVisible({
        timeout: 45_000,
      });
    });
  });

  test.describe("cashier navigation boundaries", () => {
    test.use({ storageState: authStatePath("cashier") });

    test("cashier mobile sidebar excludes admin-only links", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/cashier");
      await page.getByRole("button", { name: "Open menu" }).click();
      await expect(page.locator("#mobile-sidebar-nav input[placeholder='Filter modules']")).toBeVisible();
      await expect(page.locator("body")).not.toContainText("Admin Workspace");
      await expect(page.locator("body")).not.toContainText("Reversal Center");
    });
  });

  test.describe("vendor dashboard", () => {
    test.skip(!hasStorageState("vendor"), "vendor auth state missing; run auth setup or provide vendor.json");
    test.use({ storageState: authStatePath("vendor") });

    test("vendor workspace keeps role-safe actions only", async ({ page }) => {
      await page.goto("/vendor");
      const hasWorkspaceHeading = await page
        .getByRole("heading", { name: "Vendor Workspace" })
        .isVisible({ timeout: 45_000 })
        .catch(() => false);
      if (!hasWorkspaceHeading) {
        await expect(page.locator("body")).toContainText("Vendor portal coming after vendor setup.");
      }
      await expect(page.locator("body")).not.toContainText("Reversal Center");
      await expect(page.locator("body")).not.toContainText("Accounting Settings");
    });
  });
});
