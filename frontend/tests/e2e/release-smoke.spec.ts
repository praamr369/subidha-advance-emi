import { expect, test } from "@playwright/test";

import { readSmokeMeta, roleStorageStatePath } from "./helpers/smoke-meta";

const backendRoot = process.env.PLAYWRIGHT_BACKEND_ROOT || "http://127.0.0.1:8100";
const meta = readSmokeMeta();

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

test("ops health endpoints are green", async ({ request }) => {
  const endpoints = [
    { path: "/healthz/", expected: "ok" },
    { path: "/readyz/", expected: "ready" },
    { path: "/api/v1/public/health/", expected: "ok" },
    { path: "/api/v1/public/readiness/", expected: "ready" },
  ];

  for (const endpoint of endpoints) {
    const response = await request.get(`${backendRoot}${endpoint.path}`);
    expect(response.ok()).toBeTruthy();
    const payload = (await response.json()) as { status?: string };
    expect(payload.status).toBe(endpoint.expected);
  }
});

test("admin login entry page is available", async ({ page, browser }) => {
  await page.goto("/login");
  await expect(page.locator("#username")).toBeVisible();
  await expect(page.locator("#password")).toBeVisible();
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();

  const context = await browser.newContext({
    storageState: roleStorageStatePath("admin"),
  });
  const adminPage = await context.newPage();
  await adminPage.goto("/admin");
  await expect(adminPage).toHaveURL(/\/admin(?:\/)?$/);
  await expect(adminPage.locator("body")).toContainText(/admin|payments|subscriptions/i);
  await context.close();
});

test.describe("admin release smoke", () => {
  test.use({ storageState: roleStorageStatePath("admin") });

  test("admin batch lifecycle entry flow works", async ({ page }) => {
    const batchCode = `SMOKEE2E${Date.now().toString().slice(-6)}`;

    await page.goto("/admin/batches/create");
    await expect(page.getByRole("heading", { name: /create batch/i })).toBeVisible();
    await page.locator("#batch-code").fill(batchCode);
    await page.locator("#total-slots").fill(String(meta.entities.batch_create.total_slots));
    await page.locator("#duration-months").fill(String(meta.entities.batch_create.duration_months));
    await page.locator("#draw-day").fill(String(meta.entities.batch_create.draw_day));
    await page.locator("#start-date").fill(todayIso());
    await page.locator("#batch-status").selectOption(meta.entities.batch_create.status);
    await page.getByRole("button", { name: /create batch/i }).last().click();

    await expect(page.getByText(/batch created/i)).toBeVisible();
    await expect(page.locator("body")).toContainText(batchCode);
  });

  test("admin payment collection and reversal work", async ({ page }) => {
    const target = meta.entities.admin_collection;
    const referenceNo = `SMOKE-ADMIN-${Date.now()}`;

    await page.goto(`/admin/payments/create?subscription=${target.subscription_id}&emi=${target.emi_id}`);
    await expect(page.getByRole("heading", { name: /admin collection entry/i })).toBeVisible();
    await expect(page.locator("#subscription_id")).toHaveValue(String(target.subscription_id));
    await expect(page.locator("#emi_id")).toHaveValue(String(target.emi_id));
    await page.locator("#payment_method").selectOption("UPI");
    await page.locator("#reference_no").fill(referenceNo);

    const [collectResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().includes("/admin/payments/collect/")
      ),
      page.getByRole("button", { name: /record payment/i }).click(),
    ]);

    expect(collectResponse.ok()).toBeTruthy();
    const collectPayload = (await collectResponse.json()) as {
      payment?: { id?: number };
    };
    const paymentId = Number(collectPayload.payment?.id || 0);
    expect(paymentId).toBeGreaterThan(0);

    await expect(page.locator("body")).toContainText(`Payment #${paymentId}`);

    await page.goto(`/admin/payments/${paymentId}`);
    await expect(page.getByRole("heading", { name: new RegExp(`payment #${paymentId}`, "i") })).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#reverse-reason").fill("Playwright smoke reversal");

    const [reverseResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().includes(`/admin/payments/${paymentId}/reverse/`)
      ),
      page.getByRole("button", { name: /reverse payment/i }).click(),
    ]);

    expect(reverseResponse.ok()).toBeTruthy();
    await expect(page.locator("body")).toContainText(/reversed record|already been reversed|reversed successfully/i);
  });
});

test.describe("cashier release smoke", () => {
  test.use({ storageState: roleStorageStatePath("cashier") });

  test("cashier collection flow works", async ({ page }) => {
    const target = meta.entities.cashier_collection;

    await page.goto("/cashier/collect");
    await expect(page.getByRole("heading", { name: /collect payment/i })).toBeVisible();
    await page.locator("#cashier-search-input").fill(target.customer_phone);
    await page.getByRole("button", { name: /^search$/i }).click();
    await page.getByRole("button", { name: new RegExp(`Subscription #${target.subscription_id}`) }).click();
    await page.getByRole("button", { name: /^collect payment$/i }).click();

    await expect(page.locator("body")).toContainText(/payment #/i);
    await expect(page.getByRole("link", { name: /open receipt/i })).toBeVisible();
  });
});

test.describe("partner release smoke", () => {
  test.use({ storageState: roleStorageStatePath("partner") });

  test("partner payments list loads", async ({ page }) => {
    await page.goto("/partner/payments");
    await expect(page.getByRole("heading", { name: /partner payments/i })).toBeVisible();
    await expect(page.locator("body")).toContainText(meta.entities.preseed_payment.reference_no);
  });
});

test.describe("customer release smoke", () => {
  test.use({ storageState: roleStorageStatePath("customer") });

  test("customer dashboard and payments history load", async ({ page }) => {
    await page.goto("/customer");
    await expect(page.locator("body")).toContainText(/customer workspace/i);

    await page.goto("/customer/payments");
    await expect(page.getByRole("heading", { name: /my payments/i })).toBeVisible();
    await expect(page.locator("body")).toContainText(meta.entities.preseed_payment.reference_no);
  });
});
