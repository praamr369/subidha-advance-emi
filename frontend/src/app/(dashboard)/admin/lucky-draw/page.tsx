"use client";

import { FormEvent, useEffect, useState } from "react";

import PortalPage from "@/components/ui/portal-page";
import { apiFetch, toArray } from "@/lib/api";

type Draw = { id: number; batch: number; draw_month: number; is_revealed: boolean; winner_lucky_id: number | null; committed_hash: string };

export default function AdminLuckyDrawPage() {
  const [draws, setDraws] = useState<Draw[]>([]);
  const [batch, setBatch] = useState("");
  const [winnerMonth, setWinnerMonth] = useState("");
  const [subscriptionId, setSubscriptionId] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/admin/lucky-draws/").then((res) => setDraws(toArray<Draw>(res)));
  }, []);

  async function executeWinner(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      const res = (await apiFetch("/winner/execute-winner/", {
        method: "POST",
        body: JSON.stringify({ subscription_id: Number(subscriptionId), winner_month: Number(winnerMonth) }),
      })) as { message?: string };
      setMessage(res.message || "Winner workflow executed.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to execute winner");
    }
  }

  const visible = batch ? draws.filter((d) => String(d.batch) === batch) : draws;

  return (
    <PortalPage title="Lucky Draw Execution" subtitle="Run winner declaration workflow and review immutable draw history.">
      <form onSubmit={executeWinner} style={{ display: "grid", gap: 8, maxWidth: 420, marginBottom: 20 }}>
        <input type="number" placeholder="Subscription ID" value={subscriptionId} onChange={(e) => setSubscriptionId(e.target.value)} required />
        <input type="number" placeholder="Winner Month" value={winnerMonth} onChange={(e) => setWinnerMonth(e.target.value)} required />
        <button type="submit">Execute Winner Settlement</button>
        {message ? <p>{message}</p> : null}
      </form>

      <label>Filter by Batch ID: <input value={batch} onChange={(e) => setBatch(e.target.value)} /></label>
      <table border={1} cellPadding={8} cellSpacing={0} style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
        <thead><tr><th>ID</th><th>Batch</th><th>Month</th><th>Revealed</th><th>Winner Lucky ID</th><th>Commit Hash</th></tr></thead>
        <tbody>{visible.map((d) => <tr key={d.id}><td>{d.id}</td><td>{d.batch}</td><td>{d.draw_month}</td><td>{String(d.is_revealed)}</td><td>{d.winner_lucky_id ?? "-"}</td><td>{d.committed_hash}</td></tr>)}</tbody>
      </table>
    </PortalPage>
  );
}
