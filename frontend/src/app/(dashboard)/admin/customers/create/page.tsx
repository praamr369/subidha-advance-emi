"use client";

import React, { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import PortalPage from "@/components/ui/portal-page";
import { apiFetch } from "@/lib/api";

type CustomerCreateForm = {
  name: string;
  phone: string;
  username: string;
  password: string;
  email: string;
  kyc_status: string;
};

const defaultForm: CustomerCreateForm = {
  name: "",
  phone: "",
  username: "",
  password: "",
  email: "",
  kyc_status: "PENDING",
};

function parseError(error: unknown): string {
  if (!(error instanceof Error)) return "Request failed";
  const raw = error.message?.trim() || "Request failed";

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const preferredKeys = ["name", "phone", "username", "password", "email", "user", "detail", "non_field_errors"];

    for (const key of preferredKeys) {
      const value = parsed[key];
      if (Array.isArray(value) && value[0]) return String(value[0]);
      if (typeof value === "string") return value;
    }

    const first = Object.values(parsed)[0];
    if (Array.isArray(first) && first[0]) return String(first[0]);
    if (typeof first === "string") return first;
  } catch {
    return raw;
  }

  return raw;
}

export default function AdminCreateCustomerPage() {
  const router = useRouter();

  const [form, setForm] = useState<CustomerCreateForm>(defaultForm);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdCustomerId, setCreatedCustomerId] = useState<number | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setCreatedCustomerId(null);
    setCreating(true);

    try {
      const created = await apiFetch("/admin/customers/", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone.trim(),
          username: form.username.trim(),
          password: form.password,
          email: form.email.trim(),
          kyc_status: form.kyc_status,
        }),
      });

      const customerId = Number((created as { id: number }).id);
      setCreatedCustomerId(customerId);

      setForm(defaultForm);
    } catch (e) {
      setError(parseError(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <PortalPage
      title="Create Customer"
      subtitle="Register a new customer profile with login credentials and initial KYC status."
    >
      <section style={{ marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" onClick={() => router.push("/admin/customers")}>
          Back to Customers
        </button>
      </section>

      {createdCustomerId ? (
        <section
          style={{
            marginBottom: 16,
            border: "1px solid #bbf7d0",
            background: "#f0fdf4",
            borderRadius: 10,
            padding: 16,
          }}
        >
          <h3 style={{ marginTop: 0, marginBottom: 8, color: "#166534" }}>
            Customer created successfully
          </h3>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" onClick={() => router.push(`/admin/customers/${createdCustomerId}`)}>
              View Customer Profile
            </button>
            <button type="button" onClick={() => router.push(`/admin/subscriptions/create?customer=${createdCustomerId}`)}>
              Create Subscription
            </button>
            <button type="button" onClick={() => setCreatedCustomerId(null)}>
              Create Another Customer
            </button>
          </div>
        </section>
      ) : null}

      <section
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          padding: 16,
          maxWidth: 760,
        }}
      >
        <h2 style={{ marginTop: 0 }}>Customer Registration</h2>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <label htmlFor="name">Full Name</label>
            <input
              id="name"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              required
            />
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label htmlFor="phone">Phone</label>
            <input
              id="phone"
              value={form.phone}
              onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
              required
            />
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label htmlFor="username">Username</label>
            <input
              id="username"
              value={form.username}
              onChange={(event) => setForm((prev) => ({ ...prev, username: event.target.value }))}
              required
            />
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              required
              minLength={8}
            />
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
            />
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label htmlFor="kyc_status">KYC Status</label>
            <select
              id="kyc_status"
              value={form.kyc_status}
              onChange={(event) => setForm((prev) => ({ ...prev, kyc_status: event.target.value }))}
            >
              <option value="PENDING">PENDING</option>
              <option value="VERIFIED">VERIFIED</option>
              <option value="REJECTED">REJECTED</option>
              <option value="NOT_PROVIDED">NOT_PROVIDED</option>
            </select>
          </div>

          {error ? <p style={{ color: "#b91c1c", margin: 0 }}>{error}</p> : null}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="submit" disabled={creating}>
              {creating ? "Creating..." : "Create Customer"}
            </button>
            <button type="button" onClick={() => setForm(defaultForm)}>
              Reset Form
            </button>
          </div>
        </form>
      </section>
    </PortalPage>
  );
}