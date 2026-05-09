"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import SubscriptionContractDocument from "@/components/print/SubscriptionContractDocument";
import PortalPage from "@/components/ui/PortalPage";
import DataTable from "@/components/ui/DataTable";
import SearchSelect from "@/components/ui/SearchSelect";
import WizardShell from "@/components/ui/WizardShell";

import { createSubscription, searchCustomers } from "@/domains/subscriptions/api";
import type { AdminSubscription, CreateForm, Customer, TableRow } from "@/domains/subscriptions/types";
import { useAvailableLuckyIds, useSubscriptionListData } from "@/domains/subscriptions/hooks";
import { formatCurrency, parseApiError } from "@/domains/subscriptions/utils";

const defaultForm: CreateForm = {
  customer: null,
  product: "",
  batch: "",
  lucky_id: "",
  partner: "",
  plan_type: "EMI",
  tenure_months: "",
  start_date: new Date().toISOString().slice(0, 10),
};

function subscriptionStatusToneClassName(status: string): string {
  const normalized = status.toUpperCase();
  if (normalized === "COMPLETED" || normalized === "WON") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (normalized === "DEFAULTED" || normalized === "CANCELLED") {
    return "border-red-200 bg-red-50 text-red-700";
  }
  return "border-slate-300 bg-slate-100 text-slate-800";
}

export default function AdminSubscriptionsPage() {
  const router = useRouter();

  const [step, setStep] = useState(1);

  const { subscriptions, prependSubscription, customers, products, batches, partners, loading, error } =
    useSubscriptionListData();

  const [form, setForm] = useState<CreateForm>(defaultForm);
  const { availableLuckyIds } = useAvailableLuckyIds(form.batch);

  const [createError, setCreateError] = useState<string | null>(null);
  const [creatingSubscription, setCreatingSubscription] = useState(false);
  const [successSubscription, setSuccessSubscription] = useState<AdminSubscription | null>(null);

  const customerMap = useMemo(
    () => Object.fromEntries(customers.map((c) => [c.id, c])),
    [customers]
  );

  const productMap = useMemo(
    () => Object.fromEntries(products.map((p) => [p.id, p])),
    [products]
  );

  const batchMap = useMemo(
    () => Object.fromEntries(batches.map((b) => [b.id, b])),
    [batches]
  );

  const partnerMap = useMemo(
    () => Object.fromEntries(partners.map((p) => [p.id, p])),
    [partners]
  );

  const selectedBatch = useMemo(
    () => batches.find((b) => String(b.id) === form.batch) ?? null,
    [batches, form.batch]
  );

  const selectedProduct = useMemo(
    () => products.find((p) => String(p.id) === form.product) ?? null,
    [products, form.product]
  );

  const selectedCustomer = useMemo(
    () => customers.find((c) => String(c.id) === form.customer) ?? null,
    [customers, form.customer]
  );

  const selectedPartner = useMemo(
    () => partners.find((p) => String(p.id) === form.partner) ?? null,
    [partners, form.partner]
  );

  const selectedLuckyId = useMemo(
    () => availableLuckyIds.find((l) => String(l.id) === form.lucky_id) ?? null,
    [availableLuckyIds, form.lucky_id]
  );

  const summary = useMemo(() => {
    const duration = Number(form.tenure_months || 0);
    const monthly = Number(selectedProduct?.base_price || 0);
    const total = duration * monthly;
    return { duration, monthly, total };
  }, [form.tenure_months, selectedProduct?.base_price]);

  const kpis = useMemo(() => {
    const totalSubscriptions = subscriptions.length;
    const activeSubscriptions = subscriptions.filter((s) => s.status === "ACTIVE").length;
    const emiPlans = subscriptions.filter((s) => s.plan_type === "EMI").length;
    const rentPlans = subscriptions.filter((s) => s.plan_type === "RENT").length;
    const leasePlans = subscriptions.filter((s) => s.plan_type === "LEASE").length;
    const openBatches = batches.filter((b) => b.status === "OPEN").length;
    const monthlyBookedValue = subscriptions.reduce((sum, s) => sum + Number(s.monthly_amount || 0), 0);
    const totalContractValue = subscriptions.reduce((sum, s) => sum + Number(s.total_amount || 0), 0);

    return {
      totalSubscriptions,
      activeSubscriptions,
      emiPlans,
      rentPlans,
      leasePlans,
      openBatches,
      monthlyBookedValue,
      totalContractValue,
    };
  }, [subscriptions, batches]);

  const tableRows = useMemo<TableRow[]>(
    () =>
      subscriptions.map((sub) => ({
        id: sub.id,
        customer_name: customerMap[sub.customer]
          ? `${customerMap[sub.customer].name} (${customerMap[sub.customer].phone})`
          : `Customer #${sub.customer}`,
        product_name: productMap[sub.product]
          ? productMap[sub.product].name
          : `Product #${sub.product}`,
        partner_name:
          sub.partner && partnerMap[sub.partner]
            ? `${partnerMap[sub.partner].username}${partnerMap[sub.partner].phone ? ` (${partnerMap[sub.partner].phone})` : ""}`
            : "-",
        batch_code:
          sub.batch && batchMap[sub.batch]
            ? batchMap[sub.batch].batch_code
            : "-",
        lucky_label: sub.lucky_id ? `#${sub.lucky_id}` : "-",
        plan_type: sub.plan_type,
        tenure_months: sub.tenure_months,
        monthly_amount: formatCurrency(sub.monthly_amount),
        total_amount: formatCurrency(sub.total_amount),
        status: sub.status,
        start_date: sub.start_date,
      })),
    [subscriptions, customerMap, productMap, partnerMap, batchMap]
  );



  useEffect(() => {
    if (!selectedBatch) return;
    setForm((prev) => ({
      ...prev,
      tenure_months: String(selectedBatch.duration_months || ""),
    }));
  }, [selectedBatch]);

  useEffect(() => {
    if (!form.customer || partners.length === 0 || subscriptions.length === 0) return;

    const latest = subscriptions.find((sub) => String(sub.customer) === form.customer && sub.partner);
    if (latest?.partner && partners.some((p) => p.id === latest.partner)) {
      setForm((prev) => ({ ...prev, partner: String(latest.partner) }));
    }
  }, [form.customer, partners, subscriptions]);

  async function customerSearchFn(q: string): Promise<Customer[]> {
    return searchCustomers(q);
  }

  function handlePrintAcknowledgement(subscription: AdminSubscription): void {
    setSuccessSubscription(subscription);
    window.print();
  }

  async function handleCreateSubscription(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setCreateError(null);
    setSuccessSubscription(null);
    setCreatingSubscription(true);

    try {
      const payload: Record<string, unknown> = {
        customer: Number(form.customer),
        product: Number(form.product),
        plan_type: form.plan_type,
        tenure_months: Number(form.tenure_months),
        start_date: form.start_date,
      };

      if (form.batch) payload.batch = Number(form.batch);
      if (form.partner) payload.partner = Number(form.partner);
      if (form.lucky_id) payload.lucky_id = Number(form.lucky_id);

      const created = await createSubscription(payload);

      prependSubscription(created);
      setSuccessSubscription(created);

      setForm(defaultForm);
      setStep(1);
    } catch (e) {
      setCreateError(parseApiError(e));
    } finally {
      setCreatingSubscription(false);
    }
  }

  return (
    <PortalPage
      className="receipt-print-page"
      title="Subscription Management"
      subtitle="Create subscriptions, review portfolio health, and operate daily Lucky Plan workflows."
    >
      <section
        className="receipt-print-hide"
        style={{
          marginBottom: 16,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          gap: 10,
        }}
      >
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
          Total Subscriptions: <b>{kpis.totalSubscriptions}</b>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
          Active Subscriptions: <b>{kpis.activeSubscriptions}</b>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
          EMI Plans: <b>{kpis.emiPlans}</b>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
          Rent Plans: <b>{kpis.rentPlans}</b>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
          Lease Plans: <b>{kpis.leasePlans}</b>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
          Open Batches: <b>{kpis.openBatches}</b>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
          Available Lucky IDs {form.batch ? "(selected batch)" : ""}: <b>{availableLuckyIds.length}</b>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
          Monthly Booked Value: <b>{formatCurrency(kpis.monthlyBookedValue)}</b>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
          Total Contract Value: <b>{formatCurrency(kpis.totalContractValue)}</b>
        </div>
      </section>

      {successSubscription ? (
        <section
          style={{
            marginBottom: 16,
            border: "1px solid #bbf7d0",
            background: "#f0fdf4",
            borderRadius: 10,
            padding: 16,
          }}
        >
          <div className="receipt-print-hide">
            <h3 style={{ marginTop: 0, marginBottom: 8, color: "#166534" }}>
              Subscription created successfully
            </h3>

            <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
              <div>
                <strong>Subscription ID:</strong> #{successSubscription.id}
              </div>
              <div>
                <strong>Customer:</strong>{" "}
                {customerMap[successSubscription.customer]
                  ? `${customerMap[successSubscription.customer].name} (${customerMap[successSubscription.customer].phone})`
                  : successSubscription.customer}
              </div>
              <div>
                <strong>Product:</strong>{" "}
                {productMap[successSubscription.product]?.name ?? successSubscription.product}
              </div>
              <div>
                <strong>Batch:</strong>{" "}
                {successSubscription.batch
                  ? (batchMap[successSubscription.batch]?.batch_code ?? successSubscription.batch)
                  : "-"}
              </div>
              <div>
                <strong>Plan:</strong> {successSubscription.plan_type}
              </div>
              <div>
                <strong>Monthly Amount:</strong> {formatCurrency(successSubscription.monthly_amount)}
              </div>
              <div>
                <strong>Status:</strong> {successSubscription.status}
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <button
                type="button"
                onClick={() => router.push(`/admin/subscriptions/${successSubscription.id}`)}
              >
                View Subscription
              </button>

              <button
                type="button"
                onClick={() => router.push(`/admin/finance/collect?subscription=${successSubscription.id}`)}
              >
                Create Payment
              </button>

              <button
                type="button"
                onClick={() => handlePrintAcknowledgement(successSubscription)}
              >
                Print Contract / Acknowledgement
              </button>

              <button
                type="button"
                onClick={() => {
                  setSuccessSubscription(null);
                  setForm(defaultForm);
                  setStep(1);
                }}
              >
                Create Another Subscription
              </button>

              <button
                type="button"
                onClick={() => router.push(`/admin/customers/${successSubscription.customer}`)}
              >
                Go to Customer Profile
              </button>
            </div>
          </div>

          <SubscriptionContractDocument
            audienceLabel="Subscription acknowledgement snapshot for customer and shop counter use."
            contractReference={`SUB-${successSubscription.id}`}
            subscriptionId={successSubscription.id}
            statusLabel={successSubscription.status}
            statusToneClassName={subscriptionStatusToneClassName(successSubscription.status)}
            customerFields={[
              {
                label: "Customer",
                value: customerMap[successSubscription.customer]
                  ? `${customerMap[successSubscription.customer].name}`
                  : `Customer #${successSubscription.customer}`,
                emphasize: true,
              },
              {
                label: "Phone",
                value: customerMap[successSubscription.customer]?.phone ?? "—",
              },
              {
                label: "Product",
                value:
                  productMap[successSubscription.product]?.name ??
                  `Product #${successSubscription.product}`,
                emphasize: true,
              },
              {
                label: "Product Code",
                value: productMap[successSubscription.product]?.product_code ?? "—",
              },
            ]}
            contractFields={[
              { label: "Plan Type", value: successSubscription.plan_type },
              {
                label: "Tenure",
                value: `${successSubscription.tenure_months} months`,
              },
              { label: "Start Date", value: successSubscription.start_date || "—" },
              {
                label: "Batch",
                value: successSubscription.batch
                  ? batchMap[successSubscription.batch]?.batch_code ??
                    `Batch #${successSubscription.batch}`
                  : "—",
              },
              {
                label: "Lucky ID",
                value: successSubscription.lucky_id
                  ? `#${successSubscription.lucky_id}`
                  : "Auto",
              },
              {
                label: "Partner",
                value: successSubscription.partner
                  ? partnerMap[successSubscription.partner]?.username ??
                    `Partner #${successSubscription.partner}`
                  : "Auto / None",
              },
            ]}
            financialFields={[
              {
                label: "Monthly EMI",
                value: formatCurrency(successSubscription.monthly_amount),
                emphasize: true,
              },
              {
                label: "Total Contract Value",
                value: formatCurrency(successSubscription.total_amount),
                emphasize: true,
              },
              { label: "Contract Status", value: successSubscription.status },
              {
                label: "Lifecycle",
                value: "Newly created contract",
              },
            ]}
            terms={[
              "Product base price is treated as total contract value for Lucky Plan EMI contracts.",
              "Monthly EMI remains derived from tenure and contract value in canonical subscription records.",
              "This acknowledgement does not modify payment, waiver, or winner history.",
            ]}
          />
        </section>
      ) : null}

      <div className="receipt-print-hide">
        <WizardShell step={step} totalSteps={3} title="Create Subscription Wizard">
        <form onSubmit={handleCreateSubscription} style={{ display: "grid", gap: 12 }}>
          {step === 1 ? (
            <>
              <SearchSelect<Customer>
                label="Search Customer"
                value={form.customer}
                onChange={(value) => setForm((prev) => ({ ...prev, customer: value }))}
                searchFn={customerSearchFn}
                getOptionValue={(item) => String(item.id)}
                getOptionLabel={(item) => `${item.name} (${item.phone}) - ${item.kyc_status}`}
                placeholder="Type phone or name"
              />

              {selectedCustomer ? (
                <p style={{ margin: 0 }}>
                  Selected: <b>{selectedCustomer.name}</b> ({selectedCustomer.phone})
                </p>
              ) : null}

              <button type="button" disabled={!form.customer} onClick={() => setStep(2)}>
                Next: Plan & Product
              </button>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <select
                value={form.plan_type}
                onChange={(event) => setForm((prev) => ({ ...prev, plan_type: event.target.value }))}
              >
                <option value="EMI">EMI</option>
                <option value="RENT">RENT</option>
                <option value="LEASE">LEASE</option>
              </select>

              <select
                required
                value={form.batch}
                onChange={(event) => setForm((prev) => ({ ...prev, batch: event.target.value }))}
              >
                <option value="">Select batch</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.batch_code} ({b.status})
                  </option>
                ))}
              </select>

              <select
                required
                value={form.product}
                onChange={(event) => setForm((prev) => ({ ...prev, product: event.target.value }))}
              >
                <option value="">Select product</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} - {formatCurrency(p.base_price)}
                  </option>
                ))}
              </select>

              <select
                value={form.partner}
                onChange={(event) => setForm((prev) => ({ ...prev, partner: event.target.value }))}
              >
                <option value="">Auto/None partner</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.username} ({p.phone || "-"})
                  </option>
                ))}
              </select>

              <input
                required
                type="number"
                min={1}
                value={form.tenure_months}
                onChange={(event) => setForm((prev) => ({ ...prev, tenure_months: event.target.value }))}
                placeholder="Tenure months"
              />

              <input
                required
                type="date"
                value={form.start_date}
                onChange={(event) => setForm((prev) => ({ ...prev, start_date: event.target.value }))}
              />

              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" onClick={() => setStep(1)}>
                  Back
                </button>
                <button type="button" disabled={!form.product || !form.batch} onClick={() => setStep(3)}>
                  Next: Lucky ID & Confirm
                </button>
              </div>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <select
                value={form.lucky_id}
                onChange={(event) => setForm((prev) => ({ ...prev, lucky_id: event.target.value }))}
              >
                <option value="">Auto-assign next available lucky ID</option>
                {availableLuckyIds.map((l) => (
                  <option key={l.id} value={l.id}>
                    #{String(l.lucky_number).padStart(2, "0")}
                  </option>
                ))}
              </select>

              <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
                <h3 style={{ marginTop: 0 }}>Summary</h3>
                <p>
                  Customer: <b>{selectedCustomer?.name || "-"}</b>
                </p>
                <p>
                  Product: <b>{selectedProduct?.name || "-"}</b>
                </p>
                <p>
                  Batch: <b>{selectedBatch?.batch_code || "-"}</b>
                </p>
                <p>
                  Partner: <b>{selectedPartner?.username || "Auto / None"}</b>
                </p>
                <p>
                  Lucky ID: <b>{selectedLuckyId ? `#${String(selectedLuckyId.lucky_number).padStart(2, "0")}` : "Auto assign"}</b>
                </p>
                <p>
                  Plan: <b>{form.plan_type}</b>
                </p>
                <p>
                  Duration: <b>{summary.duration}</b> months
                </p>
                <p>
                  Monthly (preview): <b>{formatCurrency(summary.monthly)}</b>
                </p>
                <p>
                  Total (preview): <b>{formatCurrency(summary.total)}</b>
                </p>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" onClick={() => setStep(2)}>
                  Back
                </button>
                <button type="submit" disabled={creatingSubscription}>
                  {creatingSubscription ? "Creating..." : "Confirm Subscription"}
                </button>
              </div>
            </>
          ) : null}
        </form>

        {createError ? <p style={{ color: "#b91c1c", margin: 0 }}>{createError}</p> : null}
        </WizardShell>

        <DataTable<TableRow>
          loading={loading}
          error={error}
          rows={tableRows}
          columns={[
            { key: "id", title: "ID" },
            { key: "customer_name", title: "Customer" },
            { key: "product_name", title: "Product" },
            { key: "partner_name", title: "Partner" },
            { key: "batch_code", title: "Batch" },
            { key: "lucky_label", title: "Lucky ID" },
            { key: "plan_type", title: "Plan" },
            { key: "tenure_months", title: "Tenure" },
            { key: "monthly_amount", title: "Monthly" },
            { key: "total_amount", title: "Total" },
            { key: "status", title: "Status" },
            { key: "start_date", title: "Start Date" },
          ]}
        />
      </div>
    </PortalPage>
  );
}
