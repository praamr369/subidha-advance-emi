"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import ERPPageShell from "@/components/erp/ERPPageShell";
import { listBatches } from "@/services/batches";
import type { BatchRecord } from "@/services/batches";
import { createDrawCommit, getBatchDrawSummary, revealDraw, type BatchDrawSummary, type DrawCommitResponse, type DrawRevealResponse } from "@/services/draws";

export default function AdminLuckyDrawExecutionPage() {
  const router = useRouter();

  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [batchId, setBatchId] = useState("");
  const [summary, setSummary] = useState<BatchDrawSummary | null>(null);

  const [commit, setCommit] = useState<DrawCommitResponse | null>(null);
  const [revealSeed, setRevealSeed] = useState("");
  const [result, setResult] = useState<DrawRevealResponse | null>(null);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    listBatches().then(setBatches).catch(() => setBatches([]));
  }, []);

  useEffect(() => {
    if (!batchId) {
      setSummary(null);
      return;
    }

    getBatchDrawSummary(batchId)
      .then(setSummary)
      .catch(() => setSummary(null));
  }, [batchId]);

  async function handleCreateCommit() {
    if (!batchId) return;
    setLoading(true);
    setMessage(null);
    setResult(null);

    try {
      const payload = await createDrawCommit(batchId);
      setCommit(payload);
      setRevealSeed(payload.admin_seed_store_securely);
      setMessage("Draw commitment created. Store seed securely, then reveal explicitly.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to create draw commitment.");
    } finally {
      setLoading(false);
    }
  }

  async function handleReveal() {
    if (!commit || !revealSeed.trim()) return;

    setLoading(true);
    setMessage(null);

    try {
      const payload = await revealDraw(commit.id, revealSeed.trim());
      setResult(payload);
      setMessage("Draw revealed successfully.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to reveal draw.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ERPPageShell
      title="Execute Lucky Draw"
      subtitle="Operator-controlled flow: select batch, create commitment, then reveal winner with seed."
      actions={[{ href: "/admin/lucky-draw", label: "Back to Draw List" }]}
    >
      <section style={{ display: "grid", gap: 8, maxWidth: 780 }}>
        <select value={batchId} onChange={(event) => setBatchId(event.target.value)}>
          <option value="">Select eligible batch</option>
          {batches.map((item) => (
            <option key={item.id} value={item.id}>{item.batch_code || `Batch #${item.id}`} ({item.status || "-"})</option>
          ))}
        </select>

        {summary ? (
          <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 12 }}>
            <h3 style={{ marginTop: 0 }}>Batch Context</h3>
            <p><b>Batch:</b> {summary.batch_code}</p>
            <p><b>Status:</b> {summary.status}</p>
            <p><b>Total Slots:</b> {summary.total_slots}</p>
            <p><b>Assigned Lucky IDs:</b> {summary.assigned_lucky_ids}</p>
            <p><b>Active Subscriptions:</b> {summary.active_subscription_count}</p>
            <p><b>Draws Completed:</b> {summary.draw_count} / {summary.duration_months}</p>
          </div>
        ) : null}

        <button type="button" disabled={!batchId || loading} onClick={handleCreateCommit}>
          {loading ? "Processing..." : "Create Draw Commitment"}
        </button>

        {commit ? (
          <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 12 }}>
            <h3 style={{ marginTop: 0 }}>Commitment Created</h3>
            <p><b>Draw ID:</b> {commit.id}</p>
            <p><b>Draw Month:</b> {commit.draw_month}</p>
            <p><b>Committed Hash:</b> {commit.committed_hash}</p>
            <p><b>Seed (store securely):</b> {commit.admin_seed_store_securely}</p>

            <label style={{ display: "grid", gap: 6 }}>
              <span>Reveal Seed</span>
              <input value={revealSeed} onChange={(event) => setRevealSeed(event.target.value)} placeholder="Paste reveal seed" />
            </label>

            <button type="button" onClick={handleReveal} disabled={loading || !revealSeed.trim()} style={{ marginTop: 8 }}>
              {loading ? "Revealing..." : "Reveal and Execute Draw"}
            </button>
          </div>
        ) : null}

        {result ? (
          <div style={{ border: "1px solid #bbf7d0", background: "#f0fdf4", borderRadius: 8, padding: 12 }}>
            <h3 style={{ marginTop: 0 }}>Winner Result</h3>
            <p><b>Winner Lucky ID:</b> {result.winner_lucky_number ? `#${result.winner_lucky_number}` : "-"}</p>
            <p><b>Winner Subscription:</b> {result.winner_subscription_id || "-"}</p>
            <p><b>Waived Future EMI Amount:</b> ₹{Number(result.waived_amount || 0).toFixed(2)}</p>
            <button type="button" onClick={() => router.push(`/admin/lucky-draws/${result.id}`)}>Open Draw Result</button>
          </div>
        ) : null}

        {message ? <p style={{ margin: 0 }}>{message}</p> : null}
      </section>
    </ERPPageShell>
  );
}
