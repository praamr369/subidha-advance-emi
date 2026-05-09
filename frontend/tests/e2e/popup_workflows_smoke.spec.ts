import { expect, test, type Locator, type Page } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

async function openQuickActions(page: Page) {
  const trigger = page.getByRole("button", { name: "Open quick actions" });
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  await expect(page.getByRole("dialog", { name: "Quick actions" })).toBeVisible();
  await expect(page.locator(".workflow-modal-panel")).toBeVisible();
}

async function openWorkflowFromQuickActions(page: Page, label: string) {
  const quickActions = page.getByRole("dialog", { name: "Quick actions" });
  const workflowCard = quickActions
    .locator("section")
    .filter({ hasText: "Workflows" })
    .locator("div.rounded-\\[1\\.35rem\\]")
    .filter({ hasText: label })
    .first();

  await expect(workflowCard).toBeVisible();
  await workflowCard.getByRole("button", { name: "Open" }).click();
}

async function expectContainedWithin(container: Locator, target: Locator) {
  const [containerBox, targetBox] = await Promise.all([container.boundingBox(), target.boundingBox()]);

  expect(containerBox).not.toBeNull();
  expect(targetBox).not.toBeNull();

  expect(targetBox!.x).toBeGreaterThanOrEqual(containerBox!.x - 1);
  expect(targetBox!.y).toBeGreaterThanOrEqual(containerBox!.y - 1);
  expect(targetBox!.x + targetBox!.width).toBeLessThanOrEqual(containerBox!.x + containerBox!.width + 1);
  expect(targetBox!.y + targetBox!.height).toBeLessThanOrEqual(containerBox!.y + containerBox!.height + 1);
}

async function expectPopupLayer(page: Page) {
  const portalRoot = page.locator("#subidha-popup-root");
  await expect(portalRoot).toHaveCount(1);
  return portalRoot;
}

async function expectActionBarContained(dialog: Locator) {
  const actionBar = dialog.locator(".popup-action-bar");
  await actionBar.scrollIntoViewIfNeeded();
  await expect(actionBar).toBeVisible();
  await expectContainedWithin(dialog, actionBar);
}

test.describe("admin popup workflow chrome", () => {
  test.use({ storageState: authStatePath("admin") });

  test("command palette, quick actions, payment drawer, and confirm dialog remain layered and readable", async ({
    page,
  }) => {
    await page.goto("/admin");

    await page.getByRole("button", { name: /Open command palette/i }).click();
    await expectPopupLayer(page);
    const commandPalette = page.getByRole("dialog", { name: "Command palette" });
    await expect(commandPalette).toBeVisible();
    await expect(
      commandPalette.getByPlaceholder("Search operations, registers, workflows…")
    ).toBeVisible();
    await expectContainedWithin(commandPalette, commandPalette.getByRole("button", { name: "Close" }));
    const paletteBox = await commandPalette.boundingBox();
    expect(paletteBox).not.toBeNull();
    expect(paletteBox!.width).toBeLessThan(980);
    expect(paletteBox!.y).toBeGreaterThanOrEqual(8);
    await commandPalette.getByRole("button", { name: "Close" }).click();
    await expect(commandPalette).not.toBeVisible();

    await openQuickActions(page);
    await openWorkflowFromQuickActions(page, "Collect subscription payment");

    const paymentDrawer = page.getByRole("dialog", { name: "Collect subscription payment" });
    await expect(paymentDrawer).toBeVisible();
    await expect(paymentDrawer.locator(".popup-workflow-toolbar")).toBeVisible();
    await expect(paymentDrawer.locator(".portal-page-header")).toHaveCount(0);
    await expectContainedWithin(paymentDrawer, paymentDrawer.getByLabel("Close", { exact: true }));
    await expectActionBarContained(paymentDrawer);

    await page.getByRole("button", { name: "Record Payment" }).click();
    const confirmDialog = page.getByRole("dialog", { name: "Confirm payment posting" });
    await expect(confirmDialog).toBeVisible();
    await expect(confirmDialog.locator(".workflow-modal-panel, .workflow-panel-header")).toBeVisible();
    const [drawerLayerZ, confirmLayerZ] = await Promise.all([
      paymentDrawer.evaluate((node) => Number(getComputedStyle(node.closest(".dashboard-app")!).zIndex || 0)),
      confirmDialog.evaluate((node) => Number(getComputedStyle(node.closest(".dashboard-app")!).zIndex || 0)),
    ]);
    expect(confirmLayerZ).toBeGreaterThan(drawerLayerZ);

    await confirmDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(confirmDialog).not.toBeVisible();

    await paymentDrawer.getByLabel("Close", { exact: true }).click();
    await expect(paymentDrawer).not.toBeVisible();
  });

  test("admin create customer and subscription drawers expose sticky action bars", async ({
    page,
  }) => {
    await page.goto("/admin");

    await openQuickActions(page);
    await openWorkflowFromQuickActions(page, "Create customer");

    const customerDrawer = page.getByRole("dialog", { name: "Create customer" });
    await expect(customerDrawer).toBeVisible();
    await expect(customerDrawer.locator(".popup-workflow-toolbar")).toBeVisible();
    await expect(customerDrawer.locator(".portal-page-header")).toHaveCount(0);
    await expectActionBarContained(customerDrawer);
    await customerDrawer.getByLabel("Close", { exact: true }).click();
    await expect(customerDrawer).not.toBeVisible();

    await openQuickActions(page);
    await openWorkflowFromQuickActions(page, "Create subscription sale");

    const subscriptionDrawer = page.getByRole("dialog", { name: "Create subscription" });
    await expect(subscriptionDrawer).toBeVisible();
    await expect(subscriptionDrawer.getByText("Create contract")).toBeVisible();
    await expect(subscriptionDrawer.locator(".popup-workflow-toolbar")).toBeVisible();
    await expect(subscriptionDrawer.locator(".portal-page-header")).toHaveCount(0);
    await expectActionBarContained(subscriptionDrawer);
  });
});

test.describe("partner popup workflow chrome", () => {
  test.use({ storageState: authStatePath("partner") });

  test("partner quick workflow drawer keeps the submit action visible", async ({ page }) => {
    await page.goto("/partner");

    await openQuickActions(page);
    await openWorkflowFromQuickActions(page, "Submit collection");

    const partnerDrawer = page.getByRole("dialog", { name: "Submit collection" });
    await expect(partnerDrawer).toBeVisible();
    await expect(partnerDrawer.locator(".popup-workflow-toolbar")).toBeVisible();
    await expect(partnerDrawer.locator(".portal-page-header")).toHaveCount(0);
    await expectActionBarContained(partnerDrawer);
  });
});

test.describe("customer popup workflow chrome", () => {
  test.use({ storageState: authStatePath("customer") });

  test("customer quick workflow drawer keeps the request action visible", async ({ page }) => {
    await page.goto("/customer");

    await openQuickActions(page);
    await openWorkflowFromQuickActions(page, "Request subscription");

    const customerDrawer = page.getByRole("dialog", { name: "Request subscription" });
    await expect(customerDrawer).toBeVisible();
    await expect(customerDrawer.locator(".popup-workflow-toolbar")).toBeVisible();
    await expect(customerDrawer.locator(".portal-page-header")).toHaveCount(0);
    await expectActionBarContained(customerDrawer);
  });
});
