import { expect, test } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

test.use({ storageState: authStatePath("admin") });

test("dashboard renders clean in operator mode", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: /Daily Operator Dashboard/i })).toBeVisible();
  await expect(page.getByText(/You have .* tasks pending today/i)).toBeVisible();
  await expect(page.getByTestId("operator-mode-toggle")).toBeVisible();
  await expect(page.getByTestId("operator-mode-toggle")).toHaveAccessibleName(/Switch Advanced|Switch Simple/);
  await expect(page.locator("body")).toContainText("Quick actions");

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
  await expect(page.getByRole("heading", { name: /Business Intelligence/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Profitability View" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Cashflow" })).toHaveAttribute("href", "/admin/bi/cashflow");
  await expect(page.getByRole("link", { name: "Open report" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Take Action/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Take Action/i })).toHaveCount(0);

  await page.goto("/admin/bi/cashflow");
  await expect(page.getByRole("heading", { name: "Cashflow Dashboard" })).toBeVisible();
  await expect(page.getByText(/Financial mutation: disabled/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /Take Action/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Take Action/i })).toHaveCount(0);
});

test("sidebar includes phase 7D groups without duplicate dashboard href links", async ({ page }) => {
  await page.goto("/admin");
  const sidebar = page.getByRole("complementary");
  await expect(sidebar.getByRole("button", { name: "Command Center" })).toBeVisible();
  await expect(sidebar.getByRole("button", { name: "Staff & Business Setup" })).toBeVisible();

  const dashboardLinks = sidebar.locator('a[href="/admin"]');
  await expect(dashboardLinks).toHaveCount(1);
});

test("staff register and payroll setup render hardening controls", async ({ page }) => {
  await page.goto("/admin/hr/staff");
  await expect(page.getByRole("heading", { name: /staff register/i })).toBeVisible();
  await expect(page.getByText(/Quick create staff/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Create staff" })).toBeVisible();
  await expect(page.getByText(/Profile PDF|Salary PDF/i)).toHaveCount(0);

  await page.goto("/admin/hr/payroll");
  await expect(page.getByRole("heading", { name: /salary \/ payroll/i })).toBeVisible();
  await expect(page.getByText(/Payroll Setup \(Staff Master\)/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /Save payroll setup/i })).toBeVisible();
});

test("staff documents workspace renders real upload controls", async ({ page }) => {
  await page.goto("/admin/hr/staff-documents");
  await expect(page.getByRole("banner").getByRole("heading", { name: "Staff Documents" })).toBeVisible();
  await expect(page.getByRole("button", { name: /upload document/i })).toBeVisible();
});
