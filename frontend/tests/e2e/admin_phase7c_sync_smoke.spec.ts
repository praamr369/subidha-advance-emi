import { expect, test } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

test.use({ storageState: authStatePath("admin") });

test("admin dashboard, ERP, BI, HR surfaces load without duplicate key warnings", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: /Executive Dashboard/i })).toBeVisible();

  await page.goto("/admin/erp");
  await expect(page.getByRole("heading", { name: /ERP Home/i })).toBeVisible();

  await page.goto("/admin/bi");
  await expect(page.getByRole("heading", { name: /Business Intelligence/i })).toBeVisible();

  await page.goto("/admin/hr");
  await expect(page.getByRole("heading", { name: /Staff Workspace/i })).toBeVisible();

  const keyWarnings = consoleErrors.filter((line) =>
    /Encountered two children with the same key/i.test(line)
  );
  expect(keyWarnings).toEqual([]);
});

test("sidebar includes current Admin, ERP, BI, and HR entries", async ({ page }) => {
  await page.goto("/admin");

  await expect(page.getByRole("link", { name: "Admin Dashboard" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "ERP Home" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "BI Dashboards" }).first()).toBeVisible();

  await expect(page.getByRole("link", { name: "HR Dashboard" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Staff", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Attendance" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Payroll", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Salary Payments" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Leave", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Expenses", exact: true }).first()).toBeVisible();
});
