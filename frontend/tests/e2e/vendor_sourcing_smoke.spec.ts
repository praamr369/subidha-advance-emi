import { expect, test } from "@playwright/test";

import { authStatePath, API_BASE_URL } from "./helpers/smoke-data";

test.use({ storageState: authStatePath("admin") });

test("vendor sourcing workspace loads", async ({ page }) => {
  await page.goto("/admin/vendors/sourcing");
  await expect(page.getByRole("heading", { name: "Vendor sourcing workspace" })).toBeVisible();
});

test("vendor quotes prefill_vendor checks invite when a vendor exists", async ({ page }) => {
  await page.goto("/admin/vendors/quotes");
  await expect(page.getByRole("heading", { name: "Vendor quote requests" })).toBeVisible({ timeout: 30_000 });

  const vendorId = await page.evaluate(async (apiBase: string) => {
    const tok = localStorage.getItem("subidha_access_token");
    if (!tok) return null;
    const r = await fetch(`${apiBase}/admin/vendors/?page_size=5`, {
      headers: { Authorization: `Bearer ${tok}` },
    });
    if (!r.ok) return null;
    const body = (await r.json()) as { results?: Array<{ id?: number }>; id?: number };
    const rows = Array.isArray(body) ? body : body.results;
    const first = rows?.[0];
    return typeof first?.id === "number" ? first.id : null;
  }, API_BASE_URL);

  test.skip(!vendorId, "Smoke database has no vendors (admin vendors list empty).");

  await page.goto(`/admin/vendors/quotes?prefill_vendor=${vendorId}`);
  await expect(page.getByRole("heading", { name: "Vendor quote requests" })).toBeVisible({ timeout: 30_000 });

  const inviteSection = page.locator("section").filter({ hasText: "Invite vendors" });
  await expect(inviteSection.locator('input[type="checkbox"]:checked')).toHaveCount(1, { timeout: 30_000 });
});
