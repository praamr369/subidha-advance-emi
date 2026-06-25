"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import ERPPageShell from "@/components/erp/ERPPageShell";
import DataTable from "@/components/ui/DataTable";
import { getCustomer, type CustomerRecord } from "@/services/customers";
import { listEmis, type EmiRecord } from "@/services/emis";
import { listPayments, type PaymentRecord } from "@/services/payments";
import { getSubscription, type SubscriptionRecord } from "@/services/subscriptions";

function money(value: string | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

export default function AdminSubscriptionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const id = String(params?.id || "");

  const [subscription, setSubscription] = useState<SubscriptionRecord | null>(null);
  const [customer, setCustomer] = useState<CustomerRecord | null>(null);
  const [emis, setEmis] = useState<EmiRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadedId, setLoadedId] = useState("");

  useEffect(() => {
    let cancelled = false;

    getSubscription(id)
      .then(async (sub) => {
        if (cancelled) return;
        setSubscription(sub);

        const [customerData, emiPage, paymentPage] = await Promise.all([
          getCustomer(sub.customer),
          listEmis({ subscription: sub.id }),
          listPayments({ subscription: sub.id }),
        ]);

        if (cancelled) return;
        setCustomer(customerData);
        setEmis(emiPage.results || []);
        setPayments(paymentPage.results || []);
        setError(null);
        setLoadedId(id);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load subscription details");
        setLoadedId(id);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const loading = loadedId !== id;

  const totals = useMemo(() => {
    const paid = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const scheduled = emis.reduce((sum, emi) => sum + Number(emi.amount || 0), 0);
    const waived = emis.reduce((sum, emi) => sum + Number(emi.waived_amount || 0), 0);
    const outstanding = Math.max(0, scheduled - paid - waived);
    return { paid, scheduled, waived, outstanding };
  }, [emis, payments]);

  const timeline = useMemo(() => {
    if (!subscription) return [] as Array<{ at: string; label: string; detail: string }>;

    const events: Array<{ at: string; label: string; detail: string }> = [];

    if (subscription.created_at) {
      events.push({
        at: subscription.created_at,
        label: "Subscription Created",
        detail: `Contract created with status ${subscription.status || "-"}`,
      });
    }

    if (subscription.start_date) {
      events.push({
        at: subscription.start_date,
        label: "Contract Start Date",
        detail: `Tenure ${subscription.tenure_months || "-"} months`,
      });
    }

    for (const payment of payments) {
      events.push({
        at: payment.payment_date,
        label: "Payment Posted",
        detail: `Payment #${payment.id} ${money(payment.amount)} via ${payment.method}`,
      });
    }

    if (subscription.winner_month) {
      events.push({
        at: subscription.created_at || subscription.start_date || new Date().toISOString(),
        label: "Winner Benefit Applied",
        detail: `Winner month ${subscription.winner_month}; waived ${money(subscription.waived_amount || "0")}`,
      });
    }

    return events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }, [payments, subscription]);

  return (
    <ERPPageShell title={subscription ? `Subscription #${subscription.id}` : "Subscription Detail"} subtitle="Contract, EMI, payment and reconciliation operational snapshot.">
      <section style={{ marginBottom: 12, display: "flex", gap: 8 }}>
        <button type="button" onClick={() => router.push("/admin/subscriptions")}>Back</button>
        {subscription ? (
          <button type="button" onClick={() => router.push(`/admin/finance/collect?subscription=${subscription.id}`)}>
            Collect Payment
          </button>
        ) : null}
      </section>

      {loading ? <p>Loading subscription detail...</p> : null}
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}

      {subscription && !loading && !error ? (
        <>
          <section style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", marginBottom: 16 }}>
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 12 }}>
              <b>Customer</b>
              <p>{subscription.customer_name || customer?.name || `Customer #${subscription.customer}`}</p>
              <p>{customer?.phone || "-"}</p>
            </div>
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 12 }}>
              <b>Product Snapshot</b>
              <p>{subscription.product_name || `Product #${subscription.product}`}</p>
              <p>{subscription.product_code || "-"}</p>
            </div>
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 12 }}>
              <b>Batch / Lucky</b>
              <p>{subscription.batch_code || "-"}</p>
              <p>{subscription.lucky_number ? `#${subscription.lucky_number}` : "-"}</p>
            </div>
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 12 }}>
              <b>Contract</b>
              <p>Status: {subscription.status || "-"}</p>
              <p>Plan Type: {subscription.plan_type || "EMI"}</p>
              <p>Fulfillment: {subscription.fulfillment_status || "PENDING"}</p>
              <p>Start: {subscription.start_date || "-"}</p>
              <p>Contract Ref: {subscription.contract_reference || "-"}</p>
            </div>
          </section>

          <section style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", marginBottom: 16 }}>
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 10 }}>Monthly: <b>{money(subscription.monthly_amount)}</b></div>
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 10 }}>Total: <b>{money(subscription.total_amount)}</b></div>
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 10 }}>Paid: <b>{money(String(totals.paid))}</b></div>
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 10 }}>Waived: <b>{money(String(totals.waived))}</b></div>
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 10 }}>Outstanding: <b>{money(String(totals.outstanding))}</b></div>
          </section>

          <section style={{ marginTop: 16, marginBottom: 16, border: "1px solid #e2e8f0", borderRadius: 8, padding: 12 }}>
            <h3 style={{ marginTop: 0 }}>Audit Timeline</h3>
            {timeline.length === 0 ? (
              <p>No timeline events available from current API fields.</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {timeline.map((event, index) => (
                  <li key={`${event.label}-${index}`} style={{ marginBottom: 6 }}>
                    <b>{new Date(event.at).toLocaleString()}</b> — {event.label} — {event.detail}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <h3>EMI Schedule</h3>
          <DataTable<EmiRecord>
            rows={emis}
            columns={[
              { key: "month_no", title: "EMI #" },
              { key: "due_date", title: "Due Date" },
              { key: "amount", title: "Amount", align: "right", render: (row) => money(row.amount) },
              { key: "total_paid", title: "Paid", align: "right", render: (row) => money(row.total_paid || row.paid_amount) },
              { key: "waived_amount", title: "Waived", align: "right", render: (row) => money(row.waived_amount) },
              { key: "balance_amount", title: "Outstanding", align: "right", render: (row) => money(row.balance_amount || row.outstanding_amount) },
              { key: "status", title: "Status" },
            ]}
            emptyText="No EMI schedule found for this subscription."
          />

          <h3 style={{ marginTop: 16 }}>Payment History</h3>
          <DataTable<PaymentRecord>
            rows={payments}
            columns={[
              { key: "id", title: "Payment ID" },
              { key: "payment_date", title: "Date" },
              { key: "amount", title: "Amount", align: "right", render: (row) => money(row.amount) },
              { key: "method", title: "Method" },
              { key: "reference_no", title: "Reference", render: (row) => row.reference_no || "-" },
              { key: "emi_month_no", title: "EMI Ref", render: (row) => row.emi_month_no ? `Month ${row.emi_month_no}` : "-" },
            ]}
            emptyText="No payments posted yet."
          />

          <section style={{ marginTop: 16, border: "1px solid #e2e8f0", borderRadius: 8, padding: 12 }}>
            <h3 style={{ marginTop: 0 }}>Waiver / Reconciliation</h3>
            <p>Configured waived amount: {money(subscription.financial_summary?.waived_amount || "0")}</p>
            <p>Financial summary outstanding: {money(subscription.financial_summary?.outstanding_amount || String(totals.outstanding))}</p>
            <p>Note: Reconciliation data shown from existing subscription + EMI + payment APIs only.</p>
          </section>
        </>
      ) : null}
    </ERPPageShell>
  );
}
