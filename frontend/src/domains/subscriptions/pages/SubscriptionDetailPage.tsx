"use client";

import { useMemo } from "react";
import { useParams, useRouter } from "next/navigation";

import SubscriptionContractDocument from "@/components/print/SubscriptionContractDocument";
import ActionButton from "@/components/ui/ActionButton";
import PortalPage from "@/components/ui/PortalPage";

import { useSubscriptionDetailData } from "@/domains/subscriptions/hooks";
import { formatCurrency } from "@/domains/subscriptions/utils";

export default function AdminSubscriptionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = String(params?.id || "");

  const { subscription, customers, products, batches, partners, luckyIds, emis, payments, loading, error } =
    useSubscriptionDetailData(id);

  const customer = useMemo(
    () => customers.find((item) => item.id === subscription?.customer) ?? null,
    [customers, subscription]
  );

  const product = useMemo(
    () => products.find((item) => item.id === subscription?.product) ?? null,
    [products, subscription]
  );

  const batch = useMemo(
    () => batches.find((item) => item.id === subscription?.batch) ?? null,
    [batches, subscription]
  );

  const partner = useMemo(
    () => partners.find((item) => item.id === subscription?.partner) ?? null,
    [partners, subscription]
  );

  const luckyId = useMemo(
    () => luckyIds.find((item) => item.id === subscription?.lucky_id) ?? null,
    [luckyIds, subscription]
  );

  const subscriptionEmis = useMemo(
    () => emis.filter((item) => item.subscription === subscription?.id),
    [emis, subscription]
  );

  const subscriptionPayments = useMemo(
    () => payments.filter((item) => item.subscription === subscription?.id),
    [payments, subscription]
  );

  const totalPaid = useMemo(
    () => subscriptionPayments.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    [subscriptionPayments]
  );

  const totalScheduled = useMemo(
    () => subscriptionEmis.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    [subscriptionEmis]
  );

  const pendingEmiCount = useMemo(
    () => subscriptionEmis.filter((item) => item.status === "PENDING").length,
    [subscriptionEmis]
  );

  const paidEmiCount = useMemo(
    () => subscriptionEmis.filter((item) => item.status === "PAID").length,
    [subscriptionEmis]
  );

  const waivedEmiCount = useMemo(
    () => subscriptionEmis.filter((item) => item.status === "WAIVED").length,
    [subscriptionEmis]
  );

  function handlePrint(): void {
    if (!subscription) return;
    window.print();
  }

  const contractStatusToneClassName = useMemo(() => {
    const status = String(subscription?.status || "").toUpperCase();
    if (status === "COMPLETED" || status === "WON") {
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    }
    if (status === "DEFAULTED" || status === "CANCELLED") {
      return "border-red-200 bg-red-50 text-red-700";
    }
    return "border-slate-300 bg-slate-100 text-slate-800";
  }, [subscription?.status]);

  const remainingAmount = useMemo(
    () =>
      Math.max(
        Number(subscription?.total_amount || 0) -
          totalPaid -
          Number(subscription?.waived_amount || 0),
        0
      ),
    [subscription?.total_amount, subscription?.waived_amount, totalPaid]
  );

  return (
    <PortalPage
      className="receipt-print-page"
      title={subscription ? `Subscription #${subscription.id}` : "Subscription Detail"}
      subtitle="Track EMI schedule, reconciliation checkpoints, and Lucky Plan allocation details."
    >
      <section
        className="receipt-print-hide"
        style={{ marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 10 }}
      >
        <ActionButton type="button" variant="secondary" onClick={() => router.push("/admin/subscriptions")}>
          Back to Subscriptions
        </ActionButton>
        {subscription ? (
          <>
            <ActionButton
              type="button"
              variant="primary"
              onClick={() => router.push(`/admin/payments/create?subscription=${subscription.id}`)}
            >
              Collect EMI
            </ActionButton>
            <ActionButton
              type="button"
              variant="outline"
              onClick={() => router.push(`/admin/customers/${subscription.customer}`)}
            >
              View Customer
            </ActionButton>
            <ActionButton type="button" variant="secondary" onClick={handlePrint}>
              Print / Save PDF
            </ActionButton>
          </>
        ) : null}
      </section>

      {loading ? (
        <div className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          Loading subscription details...
        </div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {!loading && !error && subscription ? (
        <>
          <SubscriptionContractDocument
            audienceLabel="Contract summary for customer handover and shop operations."
            contractReference={`SUB-${subscription.id}`}
            subscriptionId={subscription.id}
            statusLabel={subscription.status}
            statusToneClassName={contractStatusToneClassName}
            customerFields={[
              { label: "Customer", value: customer?.name ?? "-", emphasize: true },
              { label: "Phone", value: customer?.phone ?? "-" },
              { label: "Product", value: product?.name ?? "-", emphasize: true },
              { label: "Product Code", value: product?.product_code ?? "-" },
            ]}
            contractFields={[
              { label: "Plan Type", value: subscription.plan_type },
              { label: "Tenure", value: `${subscription.tenure_months} months` },
              { label: "Start Date", value: subscription.start_date || "—" },
              { label: "Batch", value: batch?.batch_code ?? "-" },
              {
                label: "Lucky Number",
                value: luckyId
                  ? `#${String(luckyId.lucky_number).padStart(2, "0")}`
                  : "—",
              },
              { label: "Partner", value: partner?.username ?? "—" },
            ]}
            financialFields={[
              {
                label: "Monthly EMI",
                value: formatCurrency(subscription.monthly_amount),
                emphasize: true,
              },
              {
                label: "Total Contract Value",
                value: formatCurrency(subscription.total_amount),
                emphasize: true,
              },
              { label: "Paid Amount", value: formatCurrency(totalPaid) },
              { label: "Waived Amount", value: formatCurrency(subscription.waived_amount) },
              {
                label: "Remaining Exposure",
                value: formatCurrency(remainingAmount),
                emphasize: true,
              },
              {
                label: "EMI Coverage",
                value: `${paidEmiCount} paid · ${pendingEmiCount} pending · ${waivedEmiCount} waived`,
              },
            ]}
            terms={[
              "Product base price is treated as total contract value in this workflow.",
              "Monthly EMI is derived from contract value and tenure months in canonical records.",
              "Winner benefits, when applicable, waive future eligible EMI rows only.",
            ]}
          />

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
              Contract Value: <b>{formatCurrency(subscription.total_amount)}</b>
            </div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
              Monthly EMI: <b>{formatCurrency(subscription.monthly_amount)}</b>
            </div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
              Paid So Far: <b>{formatCurrency(totalPaid)}</b>
            </div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
              Scheduled Total: <b>{formatCurrency(totalScheduled)}</b>
            </div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
              Paid EMI Count: <b>{paidEmiCount}</b>
            </div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
              Pending EMI Count: <b>{pendingEmiCount}</b>
            </div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
              Waived EMI Count: <b>{waivedEmiCount}</b>
            </div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
              Status: <b>{subscription.status}</b>
            </div>
          </section>

          <section
            className="receipt-print-hide"
            style={{
              marginBottom: 16,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))",
              gap: 16,
            }}
          >
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
              <h3 style={{ marginTop: 0 }}>Subscription Information</h3>
              <p><b>Subscription ID:</b> #{subscription.id}</p>
              <p><b>Plan Type:</b> {subscription.plan_type}</p>
              <p><b>Tenure:</b> {subscription.tenure_months} months</p>
              <p><b>Start Date:</b> {subscription.start_date}</p>
              <p><b>Status:</b> {subscription.status}</p>
              <p><b>Winner Month:</b> {subscription.winner_month ?? "-"}</p>
              <p><b>Waived Amount:</b> {formatCurrency(subscription.waived_amount)}</p>
            </div>

            <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
              <h3 style={{ marginTop: 0 }}>Customer / Allocation</h3>
              <p><b>Customer:</b> {customer?.name ?? "-"}</p>
              <p><b>Phone:</b> {customer?.phone ?? "-"}</p>
              <p><b>KYC:</b> {customer?.kyc_status ?? "-"}</p>
              <p><b>Product:</b> {product?.name ?? "-"}</p>
              <p><b>Product Code:</b> {product?.product_code ?? "-"}</p>
              <p><b>Batch:</b> {batch?.batch_code ?? "-"}</p>
              <p><b>Lucky ID:</b> {luckyId ? `#${String(luckyId.lucky_number).padStart(2, "0")}` : "-"}</p>
              <p><b>Partner:</b> {partner?.username ?? "-"}</p>
            </div>
          </section>

          <section
            className="receipt-print-hide"
            style={{ marginBottom: 16, border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}
          >
            <h3 style={{ marginTop: 0 }}>EMI Schedule</h3>

            {subscriptionEmis.length === 0 ? (
              <p>No EMI schedule found for this subscription.</p>
            ) : (
              <table border={1} cellPadding={8} cellSpacing={0} style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Due Date</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {subscriptionEmis
                    .slice()
                    .sort((a, b) => a.month_no - b.month_no)
                    .map((emi) => (
                      <tr key={emi.id}>
                        <td>{emi.month_no}</td>
                        <td>{emi.due_date}</td>
                        <td>{formatCurrency(emi.amount)}</td>
                        <td>{emi.status}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </section>

          <section
            className="receipt-print-hide"
            style={{ marginBottom: 16, border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}
          >
            <h3 style={{ marginTop: 0 }}>Payment Ledger</h3>

            {subscriptionPayments.length === 0 ? (
              <p>No payments recorded yet.</p>
            ) : (
              <table border={1} cellPadding={8} cellSpacing={0} style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th>Payment ID</th>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Method</th>
                    <th>Reference</th>
                    <th>EMI ID</th>
                  </tr>
                </thead>
                <tbody>
                  {subscriptionPayments.map((payment) => (
                    <tr key={payment.id}>
                      <td>{payment.id}</td>
                      <td>{payment.payment_date}</td>
                      <td>{formatCurrency(payment.amount)}</td>
                      <td>{payment.method}</td>
                      <td>{payment.reference_no || "-"}</td>
                      <td>{payment.emi ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      ) : null}
    </PortalPage>
  );
}
