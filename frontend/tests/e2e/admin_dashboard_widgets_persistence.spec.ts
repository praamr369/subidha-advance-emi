import { expect, test } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

test.use({ storageState: authStatePath("admin") });

const OPERATOR_MODE_KEY = "subidha:operator-mode:v1";

test("admin operator mode and quick actions persist via localStorage", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Daily Operator Dashboard" })).toBeVisible();
  await expect(page.locator("body")).toContainText("primary daily dashboard");
  await expect(page.locator("body")).toContainText("Quick actions");

  await expect(page.getByTestId("operator-mode-toggle")).toBeVisible();
  const toggle = page.getByTestId("operator-mode-toggle");
  await expect(toggle).toHaveAccessibleName(/Switch Advanced|Switch Simple/);
  const beforeLabel = (await toggle.getAttribute("aria-label")) || "";
  await page.getByTestId("operator-mode-toggle").click();
  await expect(toggle).toHaveAccessibleName(/Switch Advanced|Switch Simple/);
  const afterLabel = (await toggle.getAttribute("aria-label")) || "";
  expect(afterLabel).not.toBe(beforeLabel);

  const storedMode = await page.evaluate(
    (key) => window.localStorage.getItem(key),
    OPERATOR_MODE_KEY
  );
  const expectedStoredMode = afterLabel === "Switch Simple" ? "ADVANCED" : "SIMPLE";
  expect(storedMode).toBe(expectedStoredMode);

  await page.reload();
  await expect(page.getByTestId("operator-mode-toggle")).toBeVisible();
  await expect(page.getByTestId("operator-mode-toggle")).toHaveAccessibleName(/Switch Advanced|Switch Simple/);
  if (expectedStoredMode === "ADVANCED") {
    await expect(page.getByRole("heading", { name: /Executive Dashboard/i })).toBeVisible();
  } else {
    await expect(page.getByRole("heading", { name: /Daily Operator Dashboard/i })).toBeVisible();
  }
});
