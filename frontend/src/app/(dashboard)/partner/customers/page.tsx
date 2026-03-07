"use client";

import { FormEvent, useEffect, useState } from "react";

import PortalPage from "@/components/ui/portal-page";
import { apiFetch } from "@/lib/api";

type PartnerCustomer = { id: number; user_id: number; name: string; phone: string };

export default function PartnerCustomersPage() {
  const [rows, setRows] = useState<PartnerCustomer[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const load = () => apiFetch("/partner/customers/").then((res) => setRows(res as PartnerCustomer[]));

  useEffect(() => {
    load();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      await apiFetch("/partner/customers/", {
        method: "POST",
        body: JSON.stringify({ name, phone, username, password }),
      });
      setName(""); setPhone(""); setUsername(""); setPassword("");
      setMessage("Customer registered successfully.");
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to register customer");
    }
  }

  return (
    <PortalPage title="Referred Customers" subtitle="Register new customers and manage your referral base.">
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 8, maxWidth: 420, marginBottom: 20 }}>
        <input placeholder="Customer name" value={name} onChange={(e) => setName(e.target.value)} required />
        <input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        <input placeholder="Login username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        <input placeholder="Login password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button type="submit">Register Customer</button>
      </form>
      {message ? <p>{message}</p> : null}

      <table border={1} cellPadding={8} cellSpacing={0} style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><th>ID</th><th>User ID</th><th>Name</th><th>Phone</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id}><td>{r.id}</td><td>{r.user_id}</td><td>{r.name}</td><td>{r.phone}</td></tr>)}</tbody>
      </table>
    </PortalPage>
  );
}
