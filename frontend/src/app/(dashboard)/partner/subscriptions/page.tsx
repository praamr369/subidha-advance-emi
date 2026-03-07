"use client";

import { FormEvent, useEffect, useState } from "react";

import PortalPage from "@/components/ui/portal-page";
import { apiFetch } from "@/lib/api";

type Subscription = {
  id: number;
  customer: number;
  customer_name: string;
  product_name: string;
  batch: number;
  lucky_number: number;
  tenure_months: number;
  status: string;
  monthly_amount: string;
  total_amount: string;
};

export default function PartnerSubscriptionsPage() {
  const [rows, setRows] = useState<Subscription[]>([]);
  const [form, setForm] = useState({ customer: "", product: "", batch: "", lucky_id: "", tenure_months: "", start_date: "" });
  const [message, setMessage] = useState<string | null>(null);

  const load = () => apiFetch("/partner/subscriptions/").then((res) => setRows(res as Subscription[]));

  useEffect(() => {
    load();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      await apiFetch("/partner/subscriptions/", {
        method: "POST",
        body: JSON.stringify({
          customer: Number(form.customer),
          product: Number(form.product),
          batch: Number(form.batch),
          lucky_id: Number(form.lucky_id),
          tenure_months: Number(form.tenure_months),
          start_date: form.start_date,
        }),
      });
      setMessage("Subscription created and EMI schedule generated.");
      setForm({ customer: "", product: "", batch: "", lucky_id: "", tenure_months: "", start_date: "" });
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to create subscription");
    }
  }

  return (
    <PortalPage title="Partner Subscriptions" subtitle="Create subscriptions and reserve lucky IDs in one workflow.">
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 8, maxWidth: 480, marginBottom: 20 }}>
        <input type="number" placeholder="Customer ID" value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value })} required />
        <input type="number" placeholder="Product ID" value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })} required />
        <input type="number" placeholder="Batch ID" value={form.batch} onChange={(e) => setForm({ ...form, batch: e.target.value })} required />
        <input type="number" placeholder="Lucky ID row ID" value={form.lucky_id} onChange={(e) => setForm({ ...form, lucky_id: e.target.value })} required />
        <input type="number" placeholder="Tenure months" value={form.tenure_months} onChange={(e) => setForm({ ...form, tenure_months: e.target.value })} required />
        <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} required />
        <button type="submit">Create Subscription</button>
      </form>
      {message ? <p>{message}</p> : null}

      <table border={1} cellPadding={8} cellSpacing={0} style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><th>ID</th><th>Customer</th><th>Product</th><th>Batch</th><th>Lucky</th><th>Tenure</th><th>Monthly</th><th>Total</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((s) => <tr key={s.id}><td>{s.id}</td><td>{s.customer_name}</td><td>{s.product_name}</td><td>{s.batch}</td><td>{s.lucky_number}</td><td>{s.tenure_months}</td><td>{s.monthly_amount}</td><td>{s.total_amount}</td><td>{s.status}</td></tr>)}
        </tbody>
      </table>
    </PortalPage>
  );
}
