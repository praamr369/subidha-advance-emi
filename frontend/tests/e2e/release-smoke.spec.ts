import { expect, test } from "@playwright/test";

import { readSmokeManifest } from "./helpers/smoke-data";
import { readSmokeMeta, roleStorageStatePath } from "./helpers/smoke-meta";

const backendRoot = process.env.PLAYWRIGHT_BACKEND_ROOT || "http://127.0.0.1:8100";

function getMeta() {
  return readSmokeMeta();
}

function getManifest() {
  return readSmokeManifest();
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function selectFirstRealOption(page: import("@playwright/test").Page, selector: string) {
  const field = page.locator(selector);
  await expect(field).toBeVisible();
  const options = await field.locator("option").evaluateAll((nodes) =>
    nodes.map((node) => ({
      value: (node as HTMLOptionElement).value,
      disabled: (node as HTMLOptionElement).disabled,
    }))
  );
  const firstRealOption = options.find((option) => option.value && !option.disabled);
  expect(firstRealOption?.value).toBeTruthy();
  await field.selectOption(firstRealOption!.value);
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

test.describe("public release smoke", () => {
  test("public product catalogue and detail load", async ({ page }) => {
    const manifest = getManifest();
    await page.goto("/products");
    await expect(
      page.getByRole("heading", { name: "Products" })
    ).toBeVisible();
    await expect(page.locator("body")).toContainText(/browse the live catalogue/i);
    await expect(page.locator("body")).toContainText(/media-ready cards/i);

    await page.goto(`/products/${manifest.entities.public.product_id}`);
    await expect(page.locator("body")).toContainText(/enquire now/i);
    await expect(page.locator("body")).toContainText(/media state/i);
    await expect(page.locator("body")).toContainText(/base price/i);
  });
});

test.describe("admin release smoke", () => {
  test.use({ storageState: roleStorageStatePath("admin") });

  test("admin batch lifecycle entry flow works", async ({ page }) => {
    const meta = getMeta();
    const batchCode = `SMOKEE2E${Date.now().toString().slice(-6)}`;

    await page.goto("/admin/batches/create");
    await expect(
      page.getByRole("heading", { name: "Create Batch", exact: true }).first()
    ).toBeVisible();
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
    const meta = getMeta();
    const target = meta.entities.admin_collection;
    const referenceNo = `SMOKE-ADMIN-${Date.now()}`;

    await page.goto(`/admin/payments/create?subscription=${target.subscription_id}&emi=${target.emi_id}`);
    await expect(page.getByRole("heading", { name: /admin collection entry/i })).toBeVisible();
    await expect(page.locator("#subscription_id")).toHaveValue(String(target.subscription_id));
    await expect(page.locator("#emi_id")).toHaveValue(String(target.emi_id));
    await page.locator("#payment_method").selectOption("CASH");
    await selectFirstRealOption(page, "#finance_account_id");
    await page.locator("#reference_no").fill(referenceNo);

    await page.getByRole("button", { name: /record payment/i }).click();
    await expect(
      page.getByRole("heading", { name: /confirm payment posting/i })
    ).toBeVisible();

    const [collectResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().includes("/admin/payments/collect/")
      ),
      page.getByRole("button", { name: /confirm posting/i }).click(),
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

  test("admin subscription detail renders lifecycle surfaces", async ({ page }) => {
    const meta = getMeta();
    await page.goto(`/admin/subscriptions/${meta.entities.admin_collection.subscription_id}`);
    await expect(page.getByRole("heading", { name: /subscription #/i })).toBeVisible();
    await expect(page.locator("body")).toContainText(/contract, winner, and waiver posture/i);
    await expect(page.locator("body")).toContainText(/contract lifecycle/i);
    await expect(page.locator("body")).toContainText(/winner benefit/i);
    await expect(page.locator("body")).toContainText(/waiver and settlement/i);
  });

  test("admin payment reconciliation compatibility route redirects to canonical workspace", async ({
    page,
  }) => {
    const meta = getMeta();
    await page.goto(
      `/admin/payments/reconciliation?subscription=${meta.entities.preseed_payment.subscription_id}&payment=${meta.entities.preseed_payment.payment_id}`
    );
    await expect(page).toHaveURL(
      new RegExp(
        `/admin/reconciliation\\?view=payments&subscription=${meta.entities.preseed_payment.subscription_id}&payment=${meta.entities.preseed_payment.payment_id}$`
      )
    );
    await expect(
      page.getByRole("heading", { name: "Admin Reconciliation" })
    ).toBeVisible();
  });
});

test.describe("cashier release smoke", () => {
  test.use({ storageState: roleStorageStatePath("cashier") });

  test("cashier collection flow works", async ({ page }) => {
    const meta = getMeta();
    const target = meta.entities.cashier_collection;

    await page.goto("/cashier/collect");
    await expect(page.getByRole("heading", { name: /collect payment/i })).toBeVisible();
    await page.locator("#cashier-search-input").fill(target.customer_phone);
    await page.locator("#cashier-collect-search-submit").click();
    const selectableEmis = page.locator("button", {
      hasText: /Advance EMI Month/i,
    });
    const noPendingState = page.getByText(/No pending Advance EMIs/i);

    await Promise.race([
      selectableEmis.first().waitFor({ state: "visible", timeout: 10_000 }),
      noPendingState.waitFor({ state: "visible", timeout: 10_000 }),
    ]).catch(() => undefined);

    const canCollect = (await selectableEmis.count()) > 0;

    if (canCollect) {
      await selectableEmis.first().click();
      await selectFirstRealOption(page, "#collect-finance-account");
      await page.getByRole("button", { name: /^collect payment$/i }).click();
      await expect(page.locator("body")).toContainText(/payment #/i);
      await expect(page.getByRole("link", { name: /open receipt/i })).toBeVisible();
    } else {
      await expect(noPendingState).toBeVisible();
    }
  });
});

test.describe("partner release smoke", () => {
  test.use({ storageState: roleStorageStatePath("partner") });

  test("partner payments list loads", async ({ page }) => {
    const meta = getMeta();
    await page.goto("/partner/payments");
    await expect(page.getByRole("heading", { name: /partner payments/i })).toBeVisible();
    await expect(page.locator("body")).toContainText(meta.entities.preseed_payment.reference_no);
  });
});

test.describe("customer release smoke", () => {
  test.use({ storageState: roleStorageStatePath("customer") });

  test("customer dashboard and payments history load", async ({ page }) => {
    const meta = getMeta();
    await page.goto("/customer");
    await expect(page.locator("body")).toContainText(/customer workspace/i);
    await expect(page.locator("body")).toContainText(/next payment due/i);

    await page.goto("/customer/payments");
    await expect(page.getByRole("heading", { name: /my payments/i })).toBeVisible();
    await expect(page.locator("body")).toContainText(meta.entities.preseed_payment.reference_no);
  });

  test("customer subscription detail renders lifecycle surfaces", async ({ page }) => {
    const meta = getMeta();
    await page.goto(`/customer/subscriptions/${meta.entities.preseed_payment.subscription_id}`);
    await expect(
      page.getByRole("heading", { name: "Subscription Details" })
    ).toBeVisible();
    await expect(page.locator("body")).toContainText(/contract, winner, and waiver state/i);
    await expect(page.locator("body")).toContainText(/contract lifecycle/i);
    await expect(page.locator("body")).toContainText(/winner benefit/i);
    await expect(page.locator("body")).toContainText(/waiver and settlement impact/i);
  });
});
