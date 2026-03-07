"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import RoleGuard from "@/components/auth/RoleGuard";
import { apiFetch, toArray } from "@/lib/api";

type BatchDetail = {
  id: number;
  batch_code: string;
  status: string;
  total_slots: number;
  duration_months: number;
  draw_day: number;
  start_date?: string;
};

type LuckyId = {
  id: number;
  batch: number;
  lucky_number: number;
  status: string;
};

type Subscription = {
  id: number;
  customer: number;
  customer_name?: string;
  customer_phone?: string;
  product_name?: string;
  partner_name?: string;
  batch: number | null;
  lucky_id: number | null;
  lucky_number?: number | null;
  monthly_amount: string;
  total_amount: string;
  status: string;
  plan_type: string;
  tenure_months: number;
};

type LuckyDraw = {
  id: number;
  batch: number;
  draw_month: number;
  is_revealed: boolean;
  winner_lucky_id: number | null;
  winner_lucky_number?: number | null;
  draw_date: string | null;
  committed_hash?: string;
  revealed_seed?: string | null;
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

function formatCurrency(value: string | number | null | undefined): string {
  const amount = Number(value || 0);
  return `₹${amount.toFixed(2)}`;
}

export default function BatchDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [batch, setBatch] = useState<BatchDetail | null>(null);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [luckyIds, setLuckyIds] = useState<LuckyId[]>([]);
  const [draws, setDraws] = useState<LuckyDraw[]>([]);

  const [loading, setLoading] = useState(true);
  const [processingCommit, setProcessingCommit] = useState(false);
  const [processingRevealId, setProcessingRevealId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [revealSeeds, setRevealSeeds] = useState<Record<number, string>>({});

  const loadBatch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [batchRes, subscriptionRes, luckyRes, drawRes] = await Promise.all([
        apiFetch(`/admin/batches/${id}/`),
        apiFetch(`/admin/subscriptions/?batch_id=${encodeURIComponent(id)}`),
        apiFetch(`/admin/lucky-ids/?batch_id=${encodeURIComponent(id)}`),
        apiFetch(`/admin/lucky-draws/?batch=${encodeURIComponent(id)}`),
      ]);

      setBatch(batchRes as BatchDetail);
      setSubscriptions(toArray<Subscription>(subscriptionRes));
      setLuckyIds(toArray<LuckyId>(luckyRes));
      setDraws(toArray<LuckyDraw>(drawRes));
    } catch (e) {
      setError(parseApiError(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) loadBatch();
  }, [id, loadBatch]);

  const kpis = useMemo(() => {
    const assignedLuckyIds = luckyIds.filter((x) => x.status === "ASSIGNED").length;
    const availableLuckyIds = luckyIds.filter((x) => x.status === "AVAILABLE").length;
    const wonLuckyIds = luckyIds.filter((x) => x.status === "WON").length;

    const activeSubscriptions = subscriptions.filter((x) => x.status === "ACTIVE").length;
    const wonSubscriptions = subscriptions.filter((x) => x.status === "WON").length;
    const totalMonthlyBook = subscriptions.reduce((sum, x) => sum + Number(x.monthly_amount || 0), 0);

    return {
      subscriptionCount: subscriptions.length,
      activeSubscriptions,
      wonSubscriptions,
      assignedLuckyIds,
      availableLuckyIds,
      wonLuckyIds,
      totalMonthlyBook,
      drawCount: draws.length,
    };
  }, [subscriptions, luckyIds, draws]);

  async function handleCreateCommitment(): Promise<void> {
    try {
      setProcessingCommit(true);

      await apiFetch(`/admin/batches/${id}/create-commit/`, {
        method: "POST",
      });

      await loadBatch();
    } catch (e) {
      alert(parseApiError(e));
    } finally {
      setProcessingCommit(false);
    }
  }

  async function handleRevealDraw(drawId: number): Promise<void> {
    const seed = (revealSeeds[drawId] || "").trim();
    if (!seed) {
      alert("Reveal seed is required.");
      return;
    }

    try {
      setProcessingRevealId(drawId);

      await apiFetch(`/admin/draw/${drawId}/reveal/`, {
        method: "POST",
        body: JSON.stringify({ revealed_seed: seed }),
      });

      setRevealSeeds((prev) => ({ ...prev, [drawId]: "" }));
      await loadBatch();
    } catch (e) {
      alert(parseApiError(e));
    } finally {
      setProcessingRevealId(null);
    }
  }

  return (
    <RoleGuard allowedRoles={["ADMIN"]}>
      <div style={{ padding: 24, display: "grid", gap: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0 }}>
                {batch ? `Batch: ${batch.batch_code}` : "Batch Detail"}
              </h1>
            <p style={{ marginTop: 6, color: "#4b5563" }}>
              Control subscriptions, lucky allocation, and monthly draw commitment for this batch.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" onClick={() => router.push("/admin/batches")}>
              Back to Batches
            </button>
            {batch ? (
              <button type="button" onClick={() => router.push(`/admin/subscriptions/create?batch=${batch.id}`)}>
                Add Subscription
              </button>
            ) : null}
          </div>
        </div>

        {loading ? <p>Loading batch details...</p> : null}
        {error ? <p style={{ color: "#b91c1c", fontWeight: 600 }}>{error}</p> : null}

        {batch && !loading ? (
          <>
            <section
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
                gap: 10,
              }}
            >
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
                Status: <b>{batch.status}</b>
              </div>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
                Total Slots: <b>{batch.total_slots}</b>
              </div>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
                Duration: <b>{batch.duration_months}</b> months
              </div>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
                Draw Day: <b>{batch.draw_day}</b>
              </div>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
                Subscriptions: <b>{kpis.subscriptionCount}</b>
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
                Winner Lucky IDs: <b>{kpis.wonLuckyIds}</b>
              </div>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
                Monthly Booked Value: <b>{formatCurrency(kpis.totalMonthlyBook)}</b>
              </div>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
                Draw Records: <b>{kpis.drawCount}</b>
              </div>
            </section>

            <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
              <h2 style={{ marginTop: 0 }}>Batch Controls</h2>
              <p style={{ color: "#4b5563", marginTop: 0 }}>
                Create monthly commitment first, then reveal with the matching seed to finalize the draw.
              </p>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={handleCreateCommitment}
                  disabled={processingCommit}
                >
                  {processingCommit ? "Creating Commitment..." : "Create Draw Commitment"}
                </button>

                <button type="button" onClick={loadBatch}>
                  Reload Batch
                </button>
              </div>
            </section>

            <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
              <h2 style={{ marginTop: 0 }}>Draw History</h2>

              <table border={1} cellPadding={8} cellSpacing={0} style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Status</th>
                    <th>Commitment Hash</th>
                    <th>Winner Lucky ID</th>
                    <th>Draw Date</th>
                    <th>Reveal Seed</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {draws.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: "center", padding: 16 }}>
                        No draws created yet.
                      </td>
                    </tr>
                  ) : null}

                  {draws.map((draw) => (
                    <tr key={draw.id}>
                      <td>{draw.draw_month}</td>
                      <td>{draw.is_revealed ? "REVEALED" : "COMMITTED"}</td>
                      <td>{draw.committed_hash || "-"}</td>
                      <td>
                        {draw.winner_lucky_number != null
                          ? `#${draw.winner_lucky_number}`
                          : draw.winner_lucky_id ?? "-"}
                      </td>
                      <td>{draw.draw_date ? new Date(draw.draw_date).toLocaleString() : "-"}</td>
                      <td style={{ minWidth: 220 }}>
                        {!draw.is_revealed ? (
                          <input
                            placeholder="Enter reveal seed"
                            value={revealSeeds[draw.id] || ""}
                            onChange={(event) =>
                              setRevealSeeds((prev) => ({
                                ...prev,
                                [draw.id]: event.target.value,
                              }))
                            }
                          />
                        ) : (
                          draw.revealed_seed || "-"
                        )}
                      </td>
                      <td>
                        {!draw.is_revealed ? (
                          <button
                            type="button"
                            onClick={() => handleRevealDraw(draw.id)}
                            disabled={processingRevealId === draw.id}
                          >
                            {processingRevealId === draw.id ? "Revealing..." : "Reveal"}
                          </button>
                        ) : (
                          "Completed"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
              <h2 style={{ marginTop: 0 }}>Subscriptions</h2>

              <table border={1} cellPadding={8} cellSpacing={0} style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Customer</th>
                    <th>Product</th>
                    <th>Partner</th>
                    <th>Lucky ID</th>
                    <th>Monthly EMI</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {subscriptions.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: "center", padding: 16 }}>
                        No subscriptions in this batch yet.
                      </td>
                    </tr>
                  ) : null}

                  {subscriptions.map((sub) => (
                    <tr key={sub.id}>
                      <td>{sub.id}</td>
                      <td>
                        {sub.customer_name || `Customer #${sub.customer}`}
                        {sub.customer_phone ? ` (${sub.customer_phone})` : ""}
                      </td>
                      <td>{sub.product_name || "-"}</td>
                      <td>{sub.partner_name || "-"}</td>
                      <td>{sub.lucky_number != null ? `#${sub.lucky_number}` : "-"}</td>
                      <td>{formatCurrency(sub.monthly_amount)}</td>
                      <td>{formatCurrency(sub.total_amount)}</td>
                      <td>{sub.status}</td>
                      <td>
                        <button type="button" onClick={() => router.push(`/admin/subscriptions/${sub.id}`)}>
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
              <h2 style={{ marginTop: 0 }}>Lucky IDs</h2>

              <table border={1} cellPadding={8} cellSpacing={0} style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th>Lucky Number</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {luckyIds.length === 0 ? (
                    <tr>
                      <td colSpan={2} style={{ textAlign: "center", padding: 16 }}>
                        No lucky IDs found for this batch.
                      </td>
                    </tr>
                  ) : null}

                  {luckyIds.map((lucky) => (
                    <tr key={lucky.id}>
                      <td>{String(lucky.lucky_number).padStart(2, "0")}</td>
                      <td>{lucky.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        ) : null}
      </div>
    </RoleGuard>
  );
}