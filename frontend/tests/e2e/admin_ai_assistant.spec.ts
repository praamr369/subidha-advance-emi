import { expect, test } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

test.describe("admin AI assistant", () => {
  test.use({ storageState: authStatePath("admin") });

  test("AI page renders with read-only warning", async ({ page }) => {
    await page.goto("/admin/ai");

    await expect(page.getByRole("heading", { name: "AI Assistant" })).toBeVisible();
    await expect(page.getByText("Read-only assistant")).toBeVisible();
    await expect(page.getByText(/cannot perform or approve financial or operational actions/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Ask" })).toBeVisible();
  });

  test("disabled state renders safely", async ({ page }) => {
    await page.route("**/api/v1/admin/ai/query/", async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: "AI assistant is disabled" }),
      });
    });

    await page.goto("/admin/ai");
    await page.getByLabel("Ask internal docs").fill("How do I reset business data safely?");
    await page.getByRole("button", { name: "Ask" }).click();

    await expect(page.getByRole("heading", { name: "AI assistant is disabled" })).toBeVisible();
    await expect(page.getByLabel("Ask internal docs")).toHaveCount(0);
  });

  test("query shows answer, citations, and submits feedback", async ({ page }) => {
    let feedbackSubmitted = false;

    await page.route("**/api/v1/admin/ai/query/", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          answer: "Based on approved internal documents:\n- Restore Procedure: Verify backup before reset.",
          citations: [
            {
              source_id: 7,
              source_title: "Backup Restore Runbook",
              chunk_id: 22,
              heading: "Restore Procedure",
              excerpt: "Verify backup before reset and record approval.",
            },
          ],
          confidence: "HIGH",
          retrieval_mode: "KEYWORD",
          requested_retrieval_mode: "HYBRID",
          degraded: true,
          degraded_reason: "VECTOR_SEARCH_DISABLED",
          query_log_id: 99,
          safety: {
            actionable_financial_instruction: false,
            permission_filtered: true,
            source_grounded: true,
          },
        }),
      });
    });
    await page.route("**/api/v1/admin/ai/feedback/", async (route) => {
      const body = route.request().postDataJSON() as { query_log?: number; rating?: string };
      feedbackSubmitted = body.query_log === 99 && body.rating === "HELPFUL";
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ id: 1, query_log: 99, rating: "HELPFUL", comment: "" }),
      });
    });

    await page.goto("/admin/ai");
    await page.getByLabel("Ask internal docs").fill("How do I reset business data safely?");
    await page.getByRole("button", { name: "Ask" }).click();

    await expect(page.getByText("Based on approved internal documents")).toBeVisible();
    await expect(page.getByText(/Degraded to KEYWORD/i)).toBeVisible();
    await expect(page.getByText(/Keyword only retrieval is active/i)).toBeVisible();
    await expect(page.getByText("Backup Restore Runbook")).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Source" })).toHaveAttribute("href", "/admin/ai/sources/7");
    await page.getByRole("button", { name: "Helpful", exact: true }).click();
    await expect(page.getByText(/Feedback recorded/i)).toBeVisible();
    expect(feedbackSubmitted).toBe(true);
  });

  test("sources list and query log load", async ({ page }) => {
    await page.route("**/api/v1/admin/ai/sources/", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: 7,
            title: "Backup Restore Runbook",
            source_type: "INTERNAL_RUNBOOK",
            status: "ACTIVE",
            visibility: "ADMIN_ONLY",
            checksum: "abc",
            version: 1,
            metadata: {},
            has_inline_content: true,
            created_at: "2026-04-29T00:00:00Z",
            updated_at: "2026-04-29T00:00:00Z",
          },
        ]),
      });
    });
    await page.route("**/api/v1/admin/ai/query-log/", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: 99,
            user_display: "admin",
            role: "ADMIN",
            query: "How do I reset business data safely?",
            retrieval_mode: "KEYWORD",
            retrieved_chunk_ids: [22],
            answer_preview: "Based on approved internal documents",
            latency_ms: 12,
            denied_reason: null,
            feedback_status: "HELPFUL",
            created_at: "2026-04-29T00:00:00Z",
          },
        ]),
      });
    });

    await page.goto("/admin/ai/sources");
    await expect(page.getByRole("heading", { name: "AI Sources" })).toBeVisible();
    await expect(page.getByText("Backup Restore Runbook")).toBeVisible();
    await expect(page.getByRole("link", { name: "View chunks" })).toHaveAttribute("href", "/admin/ai/sources/7");

    await page.goto("/admin/ai/query-log");
    await expect(page.getByRole("heading", { name: "AI Query Log" })).toBeVisible();
    await expect(page.getByText("How do I reset business data safely?")).toBeVisible();
    await expect(page.getByText("HELPFUL")).toBeVisible();
  });

  test("BI page shows AI explanation panel and renders explanation cards", async ({ page }) => {
    await page.route("**/api/v1/admin/bi/summary/", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          as_of: "2026-04-29T00:00:00Z",
          sources: [],
          finance: {
            collection_trend: { labels: [], series: [], totals: {}, meta: {} },
            due_vs_collected: { labels: [], series: [], totals: {}, meta: {} },
            overdue_aging: { labels: [], series: [], totals: {}, meta: {} },
            payment_method_split: { labels: [], series: [], totals: {}, meta: {} },
            waiver_loss_exposure: { waived_count: 0, waived_amount: "0.00" },
            deposit_liability: { held_total: "0.00", deposit_rows: [] },
            revenue_breakdown: { advance_emi: {}, rent: {}, lease: {}, direct_sale: {} },
          },
          subscriptions: { product_demand: { labels: [], series: [], totals: {}, meta: {} }, erp_snapshot: { today_work: [], sales_pipeline: [], operations_pipeline: [] } },
          inventory: { product_demand: { labels: [], series: [], totals: {}, meta: {} } },
          operations: { queue_summary: { count: 0, results: [] } },
          hr: {
            active_staff: 0,
            today_present: 0,
            today_absent: 0,
            pending_leave_requests: 0,
            pending_expense_claims: 0,
            payroll_periods_active: 0,
            salary_payments_pending: 0,
          },
        }),
      });
    });
    await page.route("**/api/v1/admin/ai/bi-explain/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          summary: "BI explanation for ADMIN_BI in THIS_MONTH.",
          highlights: [{ label: "Collections", message: "Collections posture is stable.", severity: "INFO" }],
          risks: [{ label: "Overdue payments", message: "There are overdue amounts that need collection follow-up.", severity: "WARNING" }],
          follow_up: [{ label: "Open payment queue", href: "/admin/finance/collect" }],
          source_metrics: [{ key: "today_collection", label: "Today Collection", value: 0, source: "/api/v1/admin/dashboard/" }],
          generated_at: "2026-04-29T00:00:00Z",
          safety: { read_only: true, actions_executed: false },
        }),
      });
    });

    await page.goto("/admin/bi");
    await expect(page.getByRole("heading", { name: "Business Intelligence" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "AI Explanation" })).toBeVisible();
    await page.getByRole("button", { name: "Explain BI" }).click();
    await expect(page.getByText("BI explanation for ADMIN_BI in THIS_MONTH.")).toBeVisible();
    await expect(page.getByText("There are overdue amounts that need collection follow-up.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Open payment queue" })).toHaveAttribute("href", "/admin/finance/collect");
    await expect(page.getByText("Source: /api/v1/admin/dashboard/")).toBeVisible();
    await expect(page.getByRole("button", { name: /Take Action/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Take Action/i })).toHaveCount(0);
  });

  test("BI explanation disabled state is handled", async ({ page }) => {
    await page.route("**/api/v1/admin/bi/summary/", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          as_of: "2026-04-29T00:00:00Z",
          sources: [],
          finance: {
            collection_trend: { labels: [], series: [], totals: {}, meta: {} },
            due_vs_collected: { labels: [], series: [], totals: {}, meta: {} },
            overdue_aging: { labels: [], series: [], totals: {}, meta: {} },
            payment_method_split: { labels: [], series: [], totals: {}, meta: {} },
            waiver_loss_exposure: { waived_count: 0, waived_amount: "0.00" },
            deposit_liability: { held_total: "0.00", deposit_rows: [] },
            revenue_breakdown: { advance_emi: {}, rent: {}, lease: {}, direct_sale: {} },
          },
          subscriptions: { product_demand: { labels: [], series: [], totals: {}, meta: {} }, erp_snapshot: { today_work: [], sales_pipeline: [], operations_pipeline: [] } },
          inventory: { product_demand: { labels: [], series: [], totals: {}, meta: {} } },
          operations: { queue_summary: { count: 0, results: [] } },
          hr: {
            active_staff: 0,
            today_present: 0,
            today_absent: 0,
            pending_leave_requests: 0,
            pending_expense_claims: 0,
            payroll_periods_active: 0,
            salary_payments_pending: 0,
          },
        }),
      });
    });
    await page.route("**/api/v1/admin/ai/bi-explain/**", async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: "AI assistant is disabled" }),
      });
    });

    await page.goto("/admin/bi");
    await page.getByRole("button", { name: "Explain BI" }).click();
    await expect(page.getByRole("heading", { name: "AI assistant is disabled" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Take Action/i })).toHaveCount(0);
  });

  test("AI readiness page renders", async ({ page }) => {
    await page.route("**/api/v1/admin/ai/readiness/", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          feature_flags: {
            ai_assistant_enabled: true,
            embeddings_enabled: false,
            vector_search_enabled: false,
          },
          knowledge_base: {
            sources_total: 2,
            sources_active: 1,
            chunks_total: 6,
            embedded_chunks: 0,
            failed_sources: 0,
          },
          retrieval: {
            default_mode: "KEYWORD",
            vector_available: false,
            fallback_enabled: true,
          },
          safety: {
            read_only: true,
            financial_actions_enabled: false,
            customer_private_ingestion_enabled: false,
          },
          last_activity: {
            last_ingestion_status: "",
            last_source_title: "Backup Restore Runbook",
            query_logs_count: 12,
            feedback_count: 3,
            unsafe_blocked_ingestion_count: 0,
          },
          recommendations: ["Activate one more source."],
        }),
      });
    });

    await page.goto("/admin/ai/readiness");
    await expect(page.getByRole("heading", { name: "AI Readiness" })).toBeVisible();
    await expect(page.getByText("Default mode: KEYWORD")).toBeVisible();
    await expect(page.getByText("Activate one more source.")).toBeVisible();
    await expect(page.getByRole("button", { name: /Take Action/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Take Action/i })).toHaveCount(0);
  });
});

test.describe("AI assistant role guard", () => {
  test.use({ storageState: authStatePath("customer") });

  test("non-admin cannot access admin AI page", async ({ page }) => {
    await page.goto("/admin/ai");
    await expect(page).toHaveURL(/unauthorized|\/customer/);
  });
});
