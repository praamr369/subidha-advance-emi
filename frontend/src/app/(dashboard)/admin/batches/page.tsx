"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import RoleGuard from "@/components/auth/RoleGuard";
import { apiFetch, toArray } from "@/lib/api";

type BatchSummary = {
  id: number;
  batch_code: string;
  status: string;
  total_slots: number;
  duration_months: number;
  draw_day: number;
  start_date: string;
};

type Subscription = {
  id: number;
  batch: number | null;
  status: string;
  plan_type: string;
};

type LuckyId = {
  id: number;
  batch: number;
  lucky_number: number;
  status: string;
};

const defaultForm = {
  batch_code: "",
  total_slots: "100",
  duration_months: "15",
  draw_day: "5",
  start_date: "",
  status: "DRAFT",
};

function parseApiError(error: unknown): string {
  if (!(error instanceof Error)) return "Request failed";
  const raw = error.message.trim();
  if (!raw) return "Request failed";

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const first = Object.values(parsed)[0];
    if (Array.isArray(first) && first.length > 0) return String(first[0]);
    if (typeof first === "string") return first;
  } catch {
    return raw;
  }

  return raw;
}

export default function BatchesPage() {
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [luckyIds, setLuckyIds] = useState<LuckyId[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [form, setForm] = useState(defaultForm);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function loadAll(showRefreshing = false): Promise<void> {
    try {
      if (showRefreshing) setRefreshing(true);
      else setLoading(true);

      const [batchRes, subscriptionRes, luckyIdRes] = await Promise.all([
        apiFetch("/admin/batches/"),
        apiFetch("/admin/subscriptions/"),
        apiFetch("/admin/lucky-ids/"),
      ]);

      setBatches(toArray<BatchSummary>(batchRes));
      setSubscriptions(toArray<Subscription>(subscriptionRes));
      setLuckyIds(toArray<LuckyId>(luckyIdRes));
      setError(null);
    } catch (fetchError) {
      setError(parseApiError(fetchError));
      setBatches([]);
      setSubscriptions([]);
      setLuckyIds([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function handleCreateBatch(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setCreateError(null);
    setCreating(true);

    try {
      const payload = {
        batch_code: form.batch_code.trim(),
        total_slots: Number(form.total_slots),
        duration_months: Number(form.duration_months),
        draw_day: Number(form.draw_day),
        start_date: form.start_date,
        status: form.status,
      };

      const created = (await apiFetch("/admin/batches/", {
        method: "POST",
        body: JSON.stringify(payload),
      })) as BatchSummary;

      setBatches((prev) => [created, ...prev]);
      setForm(defaultForm);
    } catch (submitError) {
      setCreateError(parseApiError(submitError));
    } finally {
      setCreating(false);
    }
  }

  const filteredBatches = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return batches.filter((batch) => {
      if (statusFilter && batch.status !== statusFilter) return false;
      if (!needle) return true;

      return [
        batch.batch_code,
        batch.status,
        String(batch.id),
        String(batch.draw_day),
        String(batch.duration_months),
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [batches, query, statusFilter]);

  const kpis = useMemo(() => {
    const totalBatches = filteredBatches.length;
    const openBatches = filteredBatches.filter((b) => b.status === "OPEN").length;
    const draftBatches = filteredBatches.filter((b) => b.status === "DRAFT").length;
    const closedBatches = filteredBatches.filter((b) => b.status === "CLOSED").length;

    const batchIds = new Set(filteredBatches.map((b) => b.id));

    const relatedSubscriptions = subscriptions.filter(
      (s) => s.batch != null && batchIds.has(s.batch)
    );
    const relatedLuckyIds = luckyIds.filter((l) => batchIds.has(l.batch));

    const activeSubscriptions = relatedSubscriptions.filter((s) => s.status === "ACTIVE").length;
    const availableLuckyIds = relatedLuckyIds.filter((l) => l.status === "AVAILABLE").length;
    const assignedLuckyIds = relatedLuckyIds.filter((l) => l.status === "ASSIGNED").length;
    const wonLuckyIds = relatedLuckyIds.filter((l) => l.status === "WON").length;

    return {
      totalBatches,
      openBatches,
      draftBatches,
      closedBatches,
      activeSubscriptions,
      availableLuckyIds,
      assignedLuckyIds,
      wonLuckyIds,
    };
  }, [filteredBatches, subscriptions, luckyIds]);

  function getBatchSubscriptionCount(batchId: number): number {
    return subscriptions.filter((s) => s.batch === batchId).length;
  }

  function getBatchAvailableLuckyCount(batchId: number): number {
    return luckyIds.filter((l) => l.batch === batchId && l.status === "AVAILABLE").length;
  }

  return (
    <RoleGuard allowedRoles={["ADMIN"]}>
      <div style={{ padding: 24, display: "grid", gap: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0 }}>Batch Management</h1>
            <p style={{ marginTop: 6, color: "#4b5563" }}>
              Create, monitor, and control Lucky Plan batches for EMI operations.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" onClick={() => loadAll(true)} disabled={refreshing}>
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
            gap: 10,
          }}
        >
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
            Total Batches: <b>{kpis.totalBatches}</b>
          </div>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
            Open Batches: <b>{kpis.openBatches}</b>
          </div>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
            Draft Batches: <b>{kpis.draftBatches}</b>
          </div>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
            Closed Batches: <b>{kpis.closedBatches}</b>
          </div>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
            Active Subscriptions: <b>{kpis.activeSubscriptions}</b>
          </div>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
            Available Lucky IDs: <b>{kpis.availableLuckyIds}</b>
          </div>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
            Assigned Lucky IDs: <b>{kpis.assignedLuckyIds}</b>
          </div>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
            Won Lucky IDs: <b>{kpis.wonLuckyIds}</b>
          </div>
        </section>

        <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
          <h2 style={{ marginTop: 0 }}>Create Batch</h2>
          <p style={{ color: "#4b5563", marginTop: 0 }}>
            Draw day must be between 1 and 28. Use stable batch codes for business tracking.
          </p>

          <form
            onSubmit={handleCreateBatch}
            style={{
              display: "grid",
              gap: 10,
              gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
            }}
          >
            <input
              placeholder="Batch code (e.g. LP-2026-APR-A)"
              value={form.batch_code}
              onChange={(event) => setForm((state) => ({ ...state, batch_code: event.target.value }))}
              required
            />
            <input
              type="number"
              min={1}
              placeholder="Total slots"
              value={form.total_slots}
              onChange={(event) => setForm((state) => ({ ...state, total_slots: event.target.value }))}
              required
            />
            <input
              type="number"
              min={1}
              placeholder="Duration months"
              value={form.duration_months}
              onChange={(event) => setForm((state) => ({ ...state, duration_months: event.target.value }))}
              required
            />
            <input
              type="number"
              min={1}
              max={28}
              placeholder="Draw day"
              value={form.draw_day}
              onChange={(event) => setForm((state) => ({ ...state, draw_day: event.target.value }))}
              required
            />
            <input
              type="date"
              value={form.start_date}
              onChange={(event) => setForm((state) => ({ ...state, start_date: event.target.value }))}
              required
            />
            <select value={form.status} onChange={(event) => setForm((state) => ({ ...state, status: event.target.value }))}>
              <option value="DRAFT">DRAFT</option>
              <option value="OPEN">OPEN</option>
              <option value="FULL">FULL</option>
              <option value="DRAW_IN_PROGRESS">DRAW_IN_PROGRESS</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="CLOSED">CLOSED</option>
            </select>

            <button type="submit" disabled={creating}>
              {creating ? "Creating..." : "Create Batch"}
            </button>
          </form>

          {createError ? <p style={{ color: "#b91c1c", marginBottom: 0 }}>{createError}</p> : null}
        </section>

        <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14, display: "grid", gap: 10 }}>
          <h2 style={{ marginTop: 0, marginBottom: 0 }}>Filters</h2>

          <div
            style={{
              display: "grid",
              gap: 10,
              gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
            }}
          >
            <input
              placeholder="Search batch code, id, status..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />

            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">All statuses</option>
              <option value="DRAFT">DRAFT</option>
              <option value="OPEN">OPEN</option>
              <option value="FULL">FULL</option>
              <option value="DRAW_IN_PROGRESS">DRAW_IN_PROGRESS</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="CLOSED">CLOSED</option>
            </select>
          </div>

          <div>
            <button type="button" onClick={() => { setQuery(""); setStatusFilter(""); }}>
              Reset Filters
            </button>
          </div>
        </section>

        <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
          <h2 style={{ marginTop: 0 }}>Existing Batches</h2>

          {loading ? <p>Loading batches...</p> : null}
          {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}

          {!loading && !error ? (
            <table border={1} cellPadding={8} cellSpacing={0} style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Batch Code</th>
                  <th>Status</th>
                  <th>Slots</th>
                  <th>Subscriptions</th>
                  <th>Available Lucky IDs</th>
                  <th>Duration</th>
                  <th>Draw Day</th>
                  <th>Start Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBatches.map((batch) => (
                  <tr key={batch.id}>
                    <td>{batch.id}</td>
                    <td>{batch.batch_code}</td>
                    <td>{batch.status}</td>
                    <td>{batch.total_slots}</td>
                    <td>{getBatchSubscriptionCount(batch.id)}</td>
                    <td>{getBatchAvailableLuckyCount(batch.id)}</td>
                    <td>{batch.duration_months}</td>
                    <td>{batch.draw_day}</td>
                    <td>{batch.start_date}</td>
                    <td>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <Link href={`/admin/batches/${batch.id}`}>View</Link>
                        <Link href={`/admin/subscriptions/create?batch=${batch.id}`}>Add Subscription</Link>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredBatches.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: "center" }}>
                      No batches found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          ) : null}
        </section>
      </div>
    </RoleGuard>
  );
}