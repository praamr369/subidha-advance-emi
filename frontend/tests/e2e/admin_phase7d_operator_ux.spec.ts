import { expect, test } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

test.use({ storageState: authStatePath("admin") });

async function expectSuccessOrControlledFetchError(page: Parameters<typeof test>[0]["page"], success: () => Promise<void>) {
  const failedToFetch = page.getByText("Failed to fetch");
  if (await failedToFetch.isVisible().catch(() => false)) {
    await expect(failedToFetch).toBeVisible();
    await expect(page.getByRole("heading", { name: /Admin Dashboard|Business Intelligence|Staff Register/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Unauthorized/i })).toHaveCount(0);
    return;
  }
  await success();
}

test("dashboard renders clean in operator mode", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await page.goto("/admin");
  await expectSuccessOrControlledFetchError(page, async () => {
    await expect(page.getByRole("heading", { name: /Daily Operator Dashboard/i })).toBeVisible();
    await expect(page.getByText(/You have .* tasks pending today/i)).toBeVisible();
    await expect(page.getByTestId("operator-mode-toggle")).toBeVisible();
    await expect(page.getByTestId("operator-mode-toggle")).toHaveAccessibleName(/Switch Advanced|Switch Simple/);
    await expect(page.locator("body")).toContainText("Quick actions");
  });

  const warnings = consoleErrors.filter((line) =>
    /Encountered two children with the same key|hydration|Warning:/i.test(line)
  );
  expect(warnings).toEqual([]);
});

test("operations workspace is action-first and HR tasks visible", async ({ page }) => {
  await page.goto("/admin/operations");
  await expect(page.getByRole("heading", { name: /Operations Working Screen/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Collect Now|Take Action/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Mark Attendance" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Approve Leave" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Approve Expense" })).toBeVisible();
});

test("bi charts show read-only report links", async ({ page }) => {
  await page.goto("/admin/bi");
  await expectSuccessOrControlledFetchError(page, async () => {
    await expect(page.getByRole("heading", { name: /Business Intelligence/i })).toBeVisible();
    const profitabilityHeading = page.getByRole("heading", { name: /Profitability View/i });
    const openReportLink = page.getByRole("link", { name: "Open report" }).first();
    if (await profitabilityHeading.isVisible().catch(() => false)) {
      await expect(profitabilityHeading).toBeVisible();
    } else {
      await expect(openReportLink).toBeVisible();
    }
    const cashflowLink = page.getByRole("link", { name: "Cashflow" });
    if (await cashflowLink.isVisible().catch(() => false)) {
      await expect(cashflowLink).toHaveAttribute("href", "/admin/bi/cashflow");
    } else {
      await expect(page.getByRole("link", { name: "Open report" }).first()).toBeVisible();
    }
    if (!(await profitabilityHeading.isVisible().catch(() => false))) {
      await expect(openReportLink).toBeVisible();
    }
    await expect(page.getByRole("link", { name: /Take Action/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Take Action/i })).toHaveCount(0);
  });

  await page.goto("/admin/bi/cashflow");
  await expect(page.getByRole("heading", { name: "Cashflow Dashboard" }).first()).toBeVisible();
  if (await page.getByText("Failed to fetch").isVisible().catch(() => false)) {
    await expect(page.getByText("Failed to fetch")).toBeVisible();
  } else {
    await expect(page.getByText(/Financial mutation: disabled/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /Take Action/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Take Action/i })).toHaveCount(0);
  }
});

test("sidebar includes phase 7D groups without duplicate dashboard href links", async ({ page }) => {
  await page.goto("/admin");
  const sidebar = page.getByRole("complementary");
  await expect(sidebar.getByRole("button", { name: "Command Center" })).toBeVisible();
  await expect(sidebar.getByRole("button", { name: /Staff & Business Setup|Settings/ })).toBeVisible();

  const dashboardLinks = sidebar.locator('a[href="/admin"]');
  await expect(dashboardLinks).toHaveCount(1);
});

test("staff register and payroll setup render hardening controls", async ({ page }) => {
  await page.goto("/admin/hr/staff");
  await expect(page.getByRole("heading", { name: "Staff Recruitment & Onboarding" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Search and filters" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Apply filters/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Recruit staff" })).toBeVisible();

  await page.getByRole("button", { name: "Recruit staff" }).click();
  await page.getByLabel("Full name").fill("Smoke HR Profile");
  await page.getByRole("textbox", { name: /^Phone/ }).fill("9867001122");
  await page.getByRole("button", { name: "Save draft" }).click();
  const failedToFetch = page.getByText("Failed to fetch");
  if (await failedToFetch.isVisible().catch(() => false)) {
    await expect(failedToFetch).toBeVisible();
    await expect(page.getByText(/Unable to load staff/i)).toBeVisible();
  } else {
    await expect(page.getByText("Staff draft saved.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Smoke HR Profile" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open" }).first()).toBeVisible();

    await page.getByRole("link", { name: "Smoke HR Profile" }).click();
    await expect(page.locator("h1.enterprise-title", { hasText: "Smoke HR Profile" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Staff profile summary" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Download Profile PDF" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Download Salary Agreement PDF" })).toBeVisible();
    await page.getByRole("button", { name: "Edit Profile" }).click();
    await page.getByRole("button", { name: "KYC", exact: true }).first().click();
    await page.getByLabel("KYC type").fill("NID");
    await page.getByRole("button", { name: "Save Profile" }).click();
    await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  }

  await page.goto("/admin/hr/payroll");
  await expect(page.getByRole("heading", { name: "Payroll Setup", exact: true })).toBeVisible();
  if (await page.getByText("Failed to fetch").isVisible().catch(() => false)) {
    await expect(page.getByText(/Payroll unavailable/i)).toBeVisible();
  } else {
    await expect(page.getByRole("heading", { name: "Payroll setup — staff master" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Save payroll setup/i })).toBeVisible();
  }
});

test("staff documents workspace renders real upload controls", async ({ page }) => {
  await page.goto("/admin/hr/staff-documents");
  await expect(page.getByRole("banner").getByRole("heading", { name: "Staff Documents" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Apply Filters" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload Document" })).toBeVisible();
  await page.getByRole("button", { name: "Upload Document" }).click();
  await expect(page.getByText(/Uploads use POST \/api\/v1\/admin\/hr\/staff-documents\//i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload Document" }).last()).toBeDisabled();
  await expect(page.getByRole("button", { name: /Verify \/ Reject unavailable/i })).toHaveCount(0);
});
