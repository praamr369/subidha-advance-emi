"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import PortalPage from "@/components/ui/portal-page";
import { apiFetch, toArray } from "@/lib/api";

type Customer = {
  id: number;
  name: string;
  phone: string;
  kyc_status: string;
};

type Subscription = {
  id: number;
  customer: number;
  customer_name?: string;
  customer_phone?: string;
  product: number;
  product_name?: string;
  batch: number | null;
  batch_code?: string;
  lucky_id: number | null;
  lucky_number?: number | null;
  plan_type: string;
  tenure_months: number;
  monthly_amount: string;
  total_amount: string;
  status: string;
  start_date: string;
};

type Emi = {
  id: number;
  subscription: number;
  customer?: number;
  customer_name?: string;
  customer_phone?: string;
  month_no: number;
  due_date: string;
  amount: string;
  status: string;
  total_paid?: string;
  balance_amount?: string;
};

type PaymentCreateForm = {
  subscription: string;
  emi: string;
  amount: string;
  method: string;
  reference_no: string;
  payment_date: string;
};

type CreatedPayment = {
  id: number;
  customer: number;
  subscription: number;
  emi: number | null;
  amount: string;
  method: string;
  reference_no: string | null;
  payment_date: string;
};

const defaultForm: PaymentCreateForm = {
  subscription: "",
  emi: "",
  amount: "",
  method: "CASH",
  reference_no: "",
  payment_date: new Date().toISOString().slice(0, 10),
};

function parseError(error: unknown): string {
  if (!(error instanceof Error)) return "Request failed";
  const raw = error.message?.trim() || "Request failed";

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const preferredKeys = ["detail", "amount", "emi", "subscription", "customer", "reference_no", "non_field_errors"];

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

function formatCurrency(value: string | number | null | undefined): string {
  const amount = Number(value || 0);
  return `₹${amount.toFixed(2)}`;
}

export default function AdminCreatePaymentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const subscriptionIdFromUrl = searchParams.get("subscription") || "";

  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [emis, setEmis] = useState<Emi[]>([]);

  const [form, setForm] = useState<PaymentCreateForm>({
    ...defaultForm,
    subscription: subscriptionIdFromUrl,
  });

  const [loadingBase, setLoadingBase] = useState(true);
  const [loadingEmis, setLoadingEmis] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createdPayment, setCreatedPayment] = useState<CreatedPayment | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadBase(): Promise<void> {
      try {
        const [subscriptionRes, customerRes] = await Promise.all([
          apiFetch("/admin/subscriptions/"),
          apiFetch("/admin/customers/"),
        ]);

        if (cancelled) return;
        setSubscriptions(toArray<Subscription>(subscriptionRes));
        setCustomers(toArray<Customer>(customerRes));
      } catch (e) {
        if (cancelled) return;
        setError(parseError(e));
      } finally {
        if (cancelled) return;
        setLoadingBase(false);
      }
    }

    loadBase();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadEmis(): Promise<void> {
      if (!form.subscription) {
        setEmis([]);
        setForm((prev) => ({
          ...prev,
          emi: "",
          amount: "",
        }));
        return;
      }

      setLoadingEmis(true);
      try {
        const emiRes = await apiFetch(`/admin/emis/?subscription=${encodeURIComponent(form.subscription)}`);
        if (cancelled) return;

        const rows = toArray<Emi>(emiRes).sort((a, b) => a.month_no - b.month_no);
        setEmis(rows);

        const firstPending = rows.find((item) => item.status === "PENDING");
        setForm((prev) => ({
          ...prev,
          emi: firstPending ? String(firstPending.id) : "",
          amount: firstPending ? String(firstPending.balance_amount || firstPending.amount) : "",
        }));
      } catch (e) {
        if (cancelled) return;
        setSubmitError(parseError(e));
        setEmis([]);
      } finally {
        if (cancelled) return;
        setLoadingEmis(false);
      }
    }

    loadEmis();

    return () => {
      cancelled = true;
    };
  }, [form.subscription]);

  const selectedSubscription = useMemo(
    () => subscriptions.find((item) => String(item.id) === form.subscription) ?? null,
    [subscriptions, form.subscription]
  );

  const selectedCustomer = useMemo(() => {
    if (!selectedSubscription) return null;
    return customers.find((item) => item.id === selectedSubscription.customer) ?? null;
  }, [customers, selectedSubscription]);

  const pendingEmis = useMemo(
    () => emis.filter((item) => item.status === "PENDING"),
    [emis]
  );

  const selectedEmi = useMemo(
    () => pendingEmis.find((item) => String(item.id) === form.emi) ?? null,
    [pendingEmis, form.emi]
  );

  const paymentPreview = useMemo(() => {
    const amount = Number(form.amount || 0);
    const monthlyAmount = Number(selectedSubscription?.monthly_amount || 0);
    const pendingCount = pendingEmis.length;
    return {
      amount,
      monthlyAmount,
      pendingCount,
      isExactMonthly: monthlyAmount > 0 && amount === monthlyAmount,
    };
  }, [form.amount, selectedSubscription?.monthly_amount, pendingEmis.length]);

  function onSubscriptionChange(value: string): void {
    setCreatedPayment(null);
    setSubmitError(null);
    setForm((prev) => ({
      ...prev,
      subscription: value,
      emi: "",
      amount: "",
    }));
  }

  function onEmiChange(value: string): void {
    const emi = pendingEmis.find((item) => String(item.id) === value) ?? null;

    setForm((prev) => ({
      ...prev,
      emi: value,
      amount: emi ? String(emi.balance_amount || emi.amount) : "",
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitError(null);
    setCreatedPayment(null);
    setCreating(true);

    try {
      if (!selectedSubscription || !selectedCustomer) {
        throw new Error("Please select a valid subscription.");
      }

      const payload: Record<string, unknown> = {
        customer: selectedCustomer.id,
        subscription: selectedSubscription.id,
        amount: form.amount,
        method: form.method,
        payment_date: form.payment_date,
      };

      if (form.emi) payload.emi = Number(form.emi);
      if (form.reference_no.trim()) payload.reference_no = form.reference_no.trim();

      const created = (await apiFetch("/admin/payments/", {
        method: "POST",
        body: JSON.stringify(payload),
      })) as CreatedPayment;

      setCreatedPayment(created);

      const refreshedEmis = await apiFetch(`/admin/emis/?subscription=${encodeURIComponent(String(selectedSubscription.id))}`);
      const rows = toArray<Emi>(refreshedEmis).sort((a, b) => a.month_no - b.month_no);
      setEmis(rows);

      const firstPending = rows.find((item) => item.status === "PENDING");

      setForm((prev) => ({
        ...prev,
        emi: firstPending ? String(firstPending.id) : "",
        amount: firstPending ? String(firstPending.balance_amount || firstPending.amount) : "",
        reference_no: "",
        method: "CASH",
        payment_date: new Date().toISOString().slice(0, 10),
      }));
    } catch (e) {
      setSubmitError(parseError(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <PortalPage
      title="Create Payment"
      subtitle="Collect EMI against a subscription, auto-target the pending installment, and update payment ledger safely."
    >
      <section style={{ marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" onClick={() => router.push("/admin/payments")}>
          Back to Payments
        </button>
        {selectedSubscription ? (
          <>
            <button
              type="button"
              onClick={() => router.push(`/admin/subscriptions/${selectedSubscription.id}`)}
            >
              Back to Subscription
            </button>
            <button
              type="button"
              onClick={() => router.push(`/admin/customers/${selectedSubscription.customer}`)}
            >
              View Customer
            </button>
          </>
        ) : null}
      </section>

      {createdPayment ? (
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
            Payment recorded successfully
          </h3>
          <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
            <div><strong>Payment ID:</strong> #{createdPayment.id}</div>
            <div><strong>Amount:</strong> {formatCurrency(createdPayment.amount)}</div>
            <div><strong>Method:</strong> {createdPayment.method}</div>
            <div><strong>Date:</strong> {createdPayment.payment_date}</div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => router.push(`/admin/subscriptions/${createdPayment.subscription}`)}
            >
              View Updated Subscription
            </button>
            <button
              type="button"
              onClick={() => router.push("/admin/payments")}
            >
              Open Payment List
            </button>
          </div>
        </section>
      ) : null}

      <section
        style={{
          marginBottom: 16,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          gap: 10,
        }}
      >
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
          Selected Subscription: <b>{selectedSubscription ? `#${selectedSubscription.id}` : "-"}</b>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
          Pending EMI Count: <b>{pendingEmis.length}</b>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
          EMI Amount: <b>{formatCurrency(selectedSubscription?.monthly_amount)}</b>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
          Current Payment: <b>{formatCurrency(form.amount)}</b>
        </div>
      </section>

      {loadingBase ? <p>Loading payment context...</p> : null}
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}

      {!loadingBase && !error ? (
        <section style={{ display: "grid", gridTemplateColumns: "minmax(320px, 1.2fr) minmax(280px, 0.8fr)", gap: 16 }}>
          <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
            <h2 style={{ marginTop: 0 }}>Payment Entry</h2>

            <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <label htmlFor="subscription">Subscription</label>
                <select
                  id="subscription"
                  value={form.subscription}
                  onChange={(event) => onSubscriptionChange(event.target.value)}
                  required
                >
                  <option value="">Select subscription</option>
                  {subscriptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      #{item.id} - {item.customer_name || `Customer ${item.customer}`} - {item.product_name || `Product ${item.product}`}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <label htmlFor="emi">Pending EMI</label>
                <select
                  id="emi"
                  value={form.emi}
                  onChange={(event) => onEmiChange(event.target.value)}
                  disabled={!form.subscription || loadingEmis || pendingEmis.length === 0}
                >
                  <option value="">
                    {loadingEmis
                      ? "Loading EMI..."
                      : pendingEmis.length === 0
                        ? "No pending EMI"
                        : "Select pending EMI"}
                  </option>
                  {pendingEmis.map((item) => (
                    <option key={item.id} value={item.id}>
                      Month {item.month_no} - Due {item.due_date} - {formatCurrency(item.balance_amount || item.amount)}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <label htmlFor="amount">Amount</label>
                <input
                  id="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.amount}
                  onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
                  required
                />
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <label htmlFor="method">Method</label>
                <select
                  id="method"
                  value={form.method}
                  onChange={(event) => setForm((prev) => ({ ...prev, method: event.target.value }))}
                >
                  <option value="CASH">CASH</option>
                  <option value="UPI">UPI</option>
                  <option value="BANK">BANK</option>
                </select>
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <label htmlFor="reference_no">Reference No. (optional)</label>
                <input
                  id="reference_no"
                  value={form.reference_no}
                  onChange={(event) => setForm((prev) => ({ ...prev, reference_no: event.target.value }))}
                  placeholder="UPI / Bank reference"
                />
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <label htmlFor="payment_date">Payment Date</label>
                <input
                  id="payment_date"
                  type="date"
                  value={form.payment_date}
                  onChange={(event) => setForm((prev) => ({ ...prev, payment_date: event.target.value }))}
                  required
                />
              </div>

              {submitError ? <p style={{ color: "#b91c1c", margin: 0 }}>{submitError}</p> : null}

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="submit" disabled={creating || !selectedSubscription || !form.amount}>
                  {creating ? "Saving Payment..." : "Save Payment"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      emi: selectedEmi ? String(selectedEmi.id) : "",
                      amount: selectedEmi ? String(selectedEmi.balance_amount || selectedEmi.amount) : "",
                      method: "CASH",
                      reference_no: "",
                      payment_date: new Date().toISOString().slice(0, 10),
                    }))
                  }
                >
                  Reset Entry
                </button>
              </div>
            </form>
          </section>

          <section style={{ display: "grid", gap: 16 }}>
            <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
              <h3 style={{ marginTop: 0 }}>Subscription Context</h3>
              <p><strong>Customer:</strong> {selectedCustomer ? `${selectedCustomer.name} (${selectedCustomer.phone})` : "-"}</p>
              <p><strong>Plan:</strong> {selectedSubscription?.plan_type || "-"}</p>
              <p><strong>Batch:</strong> {selectedSubscription?.batch_code || "-"}</p>
              <p><strong>Lucky ID:</strong> {selectedSubscription?.lucky_number ? `#${selectedSubscription.lucky_number}` : "-"}</p>
              <p><strong>Status:</strong> {selectedSubscription?.status || "-"}</p>
              <p><strong>Monthly EMI:</strong> {formatCurrency(selectedSubscription?.monthly_amount)}</p>
            </section>

            <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
              <h3 style={{ marginTop: 0 }}>Selected EMI</h3>
              <p><strong>Month:</strong> {selectedEmi?.month_no ?? "-"}</p>
              <p><strong>Due Date:</strong> {selectedEmi?.due_date ?? "-"}</p>
              <p><strong>EMI Amount:</strong> {formatCurrency(selectedEmi?.amount)}</p>
              <p><strong>Balance:</strong> {formatCurrency(selectedEmi?.balance_amount || selectedEmi?.amount)}</p>
              <p><strong>Status:</strong> {selectedEmi?.status ?? "-"}</p>
            </section>

            <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
              <h3 style={{ marginTop: 0 }}>Payment Validation Preview</h3>
              <p><strong>Entered Amount:</strong> {formatCurrency(paymentPreview.amount)}</p>
              <p><strong>Standard Monthly EMI:</strong> {formatCurrency(paymentPreview.monthlyAmount)}</p>
              <p><strong>Pending EMIs Left:</strong> {paymentPreview.pendingCount}</p>
              <p><strong>Exact Monthly Match:</strong> {paymentPreview.isExactMonthly ? "Yes" : "No"}</p>
            </section>
          </section>
        </section>
      ) : null}
    </PortalPage>
  );
}