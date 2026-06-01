import { expect, test, type Page } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

type PolicyFixtureRow = Record<string, unknown>;
type CoverageFixtureRow = Record<string, unknown>;

const policiesPayload: { count: number; results: PolicyFixtureRow[] } = {
  count: 3,
  results: [
    {
      id: 101,
      slug: "terms",
      version: 1,
      category: "GENERAL",
      governance_category: "GENERAL",
      coverage_group: "Public Legal",
      visibility: "PUBLIC",
      public_ready: false,
      internal_ready: false,
      title: "Terms and Conditions",
      summary: "Public terms draft",
      content: "# Terms\n\nDraft text",
      status: "DRAFT",
      lifecycle_actions: {
        can_edit: true,
        can_submit_review: true,
        can_approve: false,
        can_reject: false,
        can_publish: true,
        can_accept_internal: false,
        can_archive: false,
        can_create_draft: false,
        can_sync_metadata: true,
      },
      updated_at: "2026-06-01T10:00:00Z",
    },
    {
      id: 102,
      slug: "payment-reversal-void-policy",
      version: 1,
      category: "PAYMENT",
      governance_category: "PAYMENT_CONTROL",
      coverage_group: "Finance / Accounting Controls",
      visibility: "INTERNAL",
      public_ready: false,
      internal_ready: false,
      requires_admin_acceptance: true,
      title: "Payment Reversal and Receipt Void Policy",
      summary: "Internal control draft",
      content: "# Payment Reversal\n\nInternal draft",
      status: "UNDER_REVIEW",
      submitted_for_review_at: "2026-06-01T10:00:00Z",
      reviewer_username: "admin",
      lifecycle_actions: {
        can_edit: true,
        can_submit_review: false,
        can_approve: true,
        can_reject: true,
        can_publish: false,
        can_accept_internal: true,
        can_archive: false,
        can_create_draft: false,
        can_sync_metadata: true,
      },
      updated_at: "2026-06-01T10:10:00Z",
    },
    {
      id: 103,
      slug: "privacy",
      version: 2,
      category: "PRIVACY",
      governance_category: "PRIVACY",
      coverage_group: "Privacy / Data",
      visibility: "PUBLIC",
      public_ready: true,
      internal_ready: false,
      title: "Privacy Policy",
      summary: "Published privacy policy",
      content: "# Privacy\n\nPublished text",
      status: "PUBLISHED",
      published_at: "2026-06-01T10:20:00Z",
      published_by_username: "admin",
      lifecycle_actions: {
        can_edit: false,
        can_submit_review: false,
        can_approve: false,
        can_reject: false,
        can_publish: false,
        can_accept_internal: false,
        can_archive: true,
        can_create_draft: true,
        can_sync_metadata: true,
      },
      updated_at: "2026-06-01T10:20:00Z",
    },
  ],
};

const coverageGroups: Array<{ group: string; items: CoverageFixtureRow[] }> = [
  {
    group: "Public Legal",
    items: [
      {
        required_policy_key: "terms",
        label: "Terms and Conditions",
        coverage_group: "Public Legal",
        catalog_coverage_group: "Public Legal",
        category: "GENERAL",
        stored_category: "GENERAL",
        visibility: "PUBLIC",
        catalog_visibility: "PUBLIC",
        status: "DRAFT",
        policy_id: 101,
        slug: "terms",
        public_ready: false,
        internal_ready: false,
        blocker_reason: "Public policy exists but is not published.",
        recommended_action: "Review, approve, then publish.",
        metadata_synced: true,
        metadata_mismatches: [],
      },
      {
        required_policy_key: "business-compliance",
        label: "Business Compliance Policy",
        coverage_group: "Public Legal",
        catalog_coverage_group: "Public Legal",
        category: "COMPLIANCE",
        stored_category: "COMPLIANCE",
        visibility: "INTERNAL",
        catalog_visibility: "PUBLIC",
        status: "DRAFT",
        policy_id: 104,
        slug: "business-compliance",
        public_ready: false,
        internal_ready: false,
        blocker_reason: "Stored governance metadata does not match catalog visibility.",
        recommended_action: "Sync governance metadata from catalog.",
        metadata_synced: false,
        metadata_mismatches: ["visibility"],
      },
      {
        required_policy_key: "ownership-business-proof",
        label: "Ownership and Business Proof Policy",
        coverage_group: "Public Legal",
        catalog_coverage_group: "Public Legal",
        category: "COMPLIANCE",
        stored_category: "COMPLIANCE",
        visibility: "PUBLIC",
        catalog_visibility: "PUBLIC",
        status: "MISSING",
        policy_id: null,
        slug: "ownership-business-proof",
        public_ready: false,
        internal_ready: false,
        blocker_reason: "Policy template is missing.",
        recommended_action: "Seed default templates.",
        metadata_synced: true,
        metadata_mismatches: [],
      },
    ],
  },
  {
    group: "Finance / Accounting Controls",
    items: [
      {
        required_policy_key: "payment-reversal-void-policy",
        label: "Payment Reversal and Receipt Void Policy",
        coverage_group: "Finance / Accounting Controls",
        catalog_coverage_group: "Finance / Accounting Controls",
        category: "PAYMENT_CONTROL",
        stored_category: "PAYMENT_CONTROL",
        visibility: "INTERNAL",
        catalog_visibility: "INTERNAL",
        status: "UNDER_REVIEW",
        policy_id: 102,
        slug: "payment-reversal-void-policy",
        public_ready: false,
        internal_ready: false,
        blocker_reason: "Internal governance policy is not approved or accepted.",
        recommended_action: "Review internally and use Accept Internal Policy.",
        metadata_synced: true,
        metadata_mismatches: [],
      },
    ],
  },
];

const coveragePayload: {
  summary: Record<string, number>;
  groups: Array<{ group: string; items: CoverageFixtureRow[] }>;
  results: CoverageFixtureRow[];
} = {
  summary: {
    required_count: 4,
    missing_count: 1,
    public_required_count: 3,
    public_published_count: 1,
    public_draft_count: 1,
    public_under_review_count: 0,
    public_approved_count: 0,
    internal_required_count: 1,
    internal_ready_count: 0,
    internal_draft_count: 0,
    internal_under_review_count: 1,
    metadata_mismatch_count: 1,
  },
  groups: coverageGroups,
  results: coverageGroups.flatMap((group) => group.items),
};

async function mockPolicyGovernance(page: Page) {
  await page.route("**/api/v1/admin/public-site/policies/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/by-slug/terms/")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ policy: policiesPayload.results[0] }) });
      return;
    }
    if (url.includes("/by-slug/payment-reversal-void-policy/")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ policy: policiesPayload.results[1] }) });
      return;
    }
    if (url.includes("/accept-internal/")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...policiesPayload.results[1], status: "APPROVED", internal_ready: true, internal_acceptance_at: "2026-06-01T11:00:00Z", internal_accepted_by_username: "admin" }) });
      return;
    }
    if (url.includes("/approve/")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...policiesPayload.results[1], status: "APPROVED", approved_by_username: "admin", approved_at: "2026-06-01T11:00:00Z" }) });
      return;
    }
    if (url.includes("/submit-review/")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...policiesPayload.results[0], status: "UNDER_REVIEW" }) });
      return;
    }
    if (url.includes("/reject/")) {
      const payload = route.request().postDataJSON() as { reason?: string };
      await route.fulfill({ status: payload.reason ? 200 : 400, contentType: "application/json", body: JSON.stringify(payload.reason ? { ...policiesPayload.results[1], status: "DRAFT", rejection_reason: payload.reason } : { detail: "Reason is required" }) });
      return;
    }
    if (url.includes("/sync-governance-metadata/")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(policiesPayload.results[0]) });
      return;
    }
    if (url.includes("/archive/")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...policiesPayload.results[2], status: "ARCHIVED", archived_at: "2026-06-01T11:00:00Z" }) });
      return;
    }
    if (url.includes("/create-draft/")) {
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ ...policiesPayload.results[2], status: "DRAFT", version: 3 }) });
      return;
    }
    if (url.includes("/seed-defaults/")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ created: 1, updated: 0, skipped: 3 }) });
      return;
    }
    if (method === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(policiesPayload) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(policiesPayload.results[0]) });
  });

  await page.route("**/api/v1/admin/settings/policies/coverage/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(coveragePayload) });
  });
}

test.describe("PG-2C policy governance lifecycle UI", () => {
  test.use({ storageState: authStatePath("admin") });

  test("shows lifecycle filters, public/internal badges, metadata mismatch, and coverage actions", async ({ page }) => {
    await mockPolicyGovernance(page);
    await page.goto("/admin/settings/policies");

    const main = page.locator("#main-content");
    await expect(main.getByRole("heading", { name: "Policy governance" })).toBeVisible();
    await expect(main.getByText("Under review", { exact: true })).toBeVisible();
    await expect(main.getByText("Approved", { exact: true })).toBeVisible();
    await expect(main.getByText("Archived", { exact: true })).toBeVisible();
    await expect(main.getByText("Metadata mismatch", { exact: true }).first()).toBeVisible();
    await expect(main.getByText("Public published", { exact: true })).toBeVisible();
    await expect(main.getByText("Internal ready", { exact: true })).toBeVisible();
    await expect(main.getByText("Stored INTERNAL", { exact: true })).toBeVisible();
    await expect(main.getByText("Catalog PUBLIC", { exact: true })).toBeVisible();
    await expect(main.getByText("Mismatches: visibility", { exact: true })).toBeVisible();

    await main.getByRole("button", { name: "Metadata mismatch" }).click();
    await expect(main.getByText("Business Compliance Policy", { exact: true })).toBeVisible();
    await expect(main.getByText("Ownership and Business Proof Policy", { exact: true })).toHaveCount(0);
  });

  test("editor shows governance panel and public lifecycle actions", async ({ page }) => {
    await mockPolicyGovernance(page);
    await page.goto("/admin/settings/policies/terms");

    const main = page.locator("#main-content");
    await expect(main.getByRole("heading", { name: "Policy editor: terms" })).toBeVisible();
    await expect(main.getByText("Governance metadata", { exact: true })).toBeVisible();
    await expect(main.getByText("Review trail", { exact: true })).toBeVisible();
    await expect(main.getByText("Publication / internal state", { exact: true })).toBeVisible();
    await expect(main.getByRole("button", { name: "Submit for review" })).toBeEnabled();
    await expect(main.getByRole("button", { name: "Publish" })).toBeVisible();
    await expect(main.getByRole("button", { name: "Accept internal policy" })).toHaveCount(0);

    await main.getByRole("button", { name: "Submit for review" }).click();
    await expect(main.getByText("Policy submitted for review.", { exact: true })).toBeVisible();
  });

  test("internal editor uses accept-internal and reject reason instead of public publish", async ({ page }) => {
    await mockPolicyGovernance(page);
    await page.goto("/admin/settings/policies/payment-reversal-void-policy");

    const main = page.locator("#main-content");
    await expect(main.getByRole("heading", { name: "Policy editor: payment-reversal-void-policy" })).toBeVisible();
    await expect(main.getByText("Visibility: INTERNAL", { exact: true })).toBeVisible();
    await expect(main.getByRole("button", { name: "Accept internal policy" })).toBeVisible();
    await expect(main.getByRole("button", { name: "Publish" })).toHaveCount(0);
    await expect(main.getByRole("button", { name: "Reject with reason" })).toBeDisabled();

    await main.getByLabel("Reject reason").fill("Needs finance owner approval");
    await expect(main.getByRole("button", { name: "Reject with reason" })).toBeEnabled();
    await main.getByRole("button", { name: "Reject with reason" }).click();
    await expect(main.getByText("Policy rejected and returned to draft.", { exact: true })).toBeVisible();
  });
});
