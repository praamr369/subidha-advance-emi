"use client";

import { useEffect, useState } from "react";

import PortalPage from "@/components/ui/portal-page";
import { apiFetch } from "@/lib/api";

type Commission = { id: number; subscription: number; commission_amount: string; status: string; created_at: string };

export default function PartnerCommissionsPage() {
  const [rows, setRows] = useState<Commission[]>([]);

  useEffect(() => {
    apiFetch("/partner/commissions/").then((res) => setRows(res as Commission[]));
  }, []);

  return (
    <PortalPage title="Commission Ledger" subtitle="Track earned commission from customer payment collections.">
      <table border={1} cellPadding={8} cellSpacing={0} style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><th>ID</th><th>Subscription</th><th>Amount</th><th>Status</th><th>Created At</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id}><td>{r.id}</td><td>{r.subscription}</td><td>{r.commission_amount}</td><td>{r.status}</td><td>{new Date(r.created_at).toLocaleString()}</td></tr>)}</tbody>
      </table>
    </PortalPage>
  );
}
