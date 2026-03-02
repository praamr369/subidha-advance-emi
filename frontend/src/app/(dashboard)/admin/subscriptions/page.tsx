"use client";

import { useEffect, useState } from "react";

import PortalPage from "@/components/ui/portal-page";
import { apiFetch } from "@/lib/api";

type AdminSubscription = {
  id: number;
  customer: number | null;
  product: number | null;
  partner: number | null;
  batch: number | null;
  lucky_id: number | null;
  plan_type: string;
  tenure_months: number;
  start_date: string;
  total_amount: string;
  monthly_amount: string;
  status: string;
  winner_month: number | null;
  waived_amount: string;
};

function SimpleTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <table
      border={1}
      cellPadding={6}
      cellSpacing={0}
      style={{ width: "100%", marginTop: 16, borderCollapse: "collapse" }}
    >
      <thead>
        <tr>
          {headers.map((header) => (
            <th key={header} style={{ textAlign: "left", background: "#f3f4f6" }}>
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={headers.length}>No subscriptions found.</td>
          </tr>
        ) : (
          rows.map((row, index) => (
            <tr key={`${row.join("-")}-${index}`}>
              {row.map((cell, i) => (
                <td key={`${index}-${i}`}>{cell}</td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

export default function AdminSubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<AdminSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [customerId, setCustomerId] = useState("");
  const [productId, setProductId] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [luckyId, setLuckyId] = useState("");
  const [planType, setPlanType] = useState("EMI");
  const [tenureMonths, setTenureMonths] = useState("");
  const [startDate, setStartDate] = useState("");

  useEffect(() => {
    let isMounted = true;

    apiFetch("/admin/subscriptions/")
      .then((response) => {
        if (!isMounted) return;
        setSubscriptions(response as AdminSubscription[]);
        setLoading(false);
      })
      .catch(() => {
        if (!isMounted) return;
        setError("Failed to load subscriptions from the server.");
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleCreate(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);

    try {
      const payload: Record<string, unknown> = {
        plan_type: planType,
        tenure_months: Number(tenureMonths),
        start_date: startDate,
      };

      if (customerId) payload.customer = Number(customerId);
      if (productId) payload.product = Number(productId);
      if (partnerId) payload.partner = Number(partnerId);
      if (batchId) payload.batch = Number(batchId);
      if (luckyId) payload.lucky_id = Number(luckyId);

      const created = (await apiFetch("/admin/subscriptions/", {
        method: "POST",
        body: JSON.stringify(payload),
      })) as AdminSubscription;

      setSubscriptions((prev) => [created, ...prev]);

      setCustomerId("");
      setProductId("");
      setPartnerId("");
      setBatchId("");
      setLuckyId("");
      setPlanType("EMI");
      setTenureMonths("");
      setStartDate("");
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Failed to create subscription.",
      );
    } finally {
      setCreating(false);
    }
  }

  const headers = [
    "ID",
    "Customer ID",
    "Product ID",
    "Batch ID",
    "Lucky ID",
    "Plan Type",
    "Tenure (months)",
    "Start Date",
    "Status",
    "Monthly Amount",
    "Total Amount",
    "Winner Month",
    "Waived Amount",
  ];

  const rows = subscriptions.map((sub) => [
    String(sub.id),
    sub.customer !== null ? String(sub.customer) : "-",
    sub.product !== null ? String(sub.product) : "-",
    sub.batch !== null ? String(sub.batch) : "-",
    sub.lucky_id !== null ? String(sub.lucky_id) : "-",
    sub.plan_type,
    String(sub.tenure_months),
    sub.start_date,
    sub.status,
    sub.monthly_amount,
    sub.total_amount,
    sub.winner_month !== null ? String(sub.winner_month) : "-",
    sub.waived_amount,
  ]);

  return (
    <PortalPage
      title="Subscription Management"
      subtitle="Live view of all subscriptions with batch, lucky ID and partner linkage."
    >
      <section style={{ marginBottom: 24, padding: 16, border: "1px solid #e5e7eb", borderRadius: 8 }}>
        <h2 style={{ marginTop: 0 }}>Add Subscription</h2>
        <p style={{ marginTop: 4, color: "#4b5563" }}>
          Use numeric IDs from Customers, Products, Batches and Lucky IDs (same as Django admin).
        </p>
        <form
          onSubmit={handleCreate}
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginTop: 12 }}
        >
          <input
            type="number"
            placeholder="Customer ID"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
          />
          <input
            type="number"
            placeholder="Product ID"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
          />
          <input
            type="number"
            placeholder="Partner ID (optional)"
            value={partnerId}
            onChange={(e) => setPartnerId(e.target.value)}
          />
          <input
            type="number"
            placeholder="Batch ID"
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
          />
          <input
            type="number"
            placeholder="Lucky ID"
            value={luckyId}
            onChange={(e) => setLuckyId(e.target.value)}
          />
          <select
            value={planType}
            onChange={(e) => setPlanType(e.target.value)}
          >
            <option value="EMI">EMI</option>
            <option value="RENT">RENT</option>
            <option value="LEASE">LEASE</option>
          </select>
          <input
            type="number"
            placeholder="Tenure months"
            value={tenureMonths}
            onChange={(e) => setTenureMonths(e.target.value)}
            required
          />
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
          />
          <button type="submit" disabled={creating} style={{ alignSelf: "flex-end", padding: "8px 12px" }}>
            {creating ? "Creating..." : "Create Subscription"}
          </button>
        </form>
        {createError && (
          <p style={{ marginTop: 8, color: "#b91c1c" }}>{createError}</p>
        )}
      </section>

      {loading && <p>Loading subscriptions...</p>}
      {error && <p style={{ color: "#b91c1c" }}>{error}</p>}
      {!loading && !error && <SimpleTable headers={headers} rows={rows} />}
    </PortalPage>
  );
}
