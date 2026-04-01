"use client";

import { useMemo } from "react";
import { useParams, useRouter } from "next/navigation";

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

    const popup = window.open("", "_blank", "width=900,height=700");
    if (!popup) return;

    popup.document.write(`
      <html>
        <head>
          <title>Subscription #${subscription.id}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
            h1 { margin-bottom: 8px; }
            .card { border: 1px solid #ddd; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
            .row { margin: 8px 0; }
            .label { font-weight: bold; display: inline-block; min-width: 180px; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          </style>
        </head>
        <body>
          <h1>Subscription Details</h1>
          <div class="card">
            <div class="row"><span class="label">Subscription ID:</span> #${subscription.id}</div>
            <div class="row"><span class="label">Customer:</span> ${customer?.name ?? "-"} (${customer?.phone ?? "-"})</div>
            <div class="row"><span class="label">Product:</span> ${product?.name ?? "-"}</div>
            <div class="row"><span class="label">Batch:</span> ${batch?.batch_code ?? "-"}</div>
            <div class="row"><span class="label">Lucky ID:</span> ${luckyId ? `#${String(luckyId.lucky_number).padStart(2, "0")}` : "-"}</div>
            <div class="row"><span class="label">Partner:</span> ${partner?.username ?? "-"}</div>
            <div class="row"><span class="label">Plan:</span> ${subscription.plan_type}</div>
            <div class="row"><span class="label">Tenure:</span> ${subscription.tenure_months} months</div>
            <div class="row"><span class="label">Monthly Amount:</span> ${formatCurrency(subscription.monthly_amount)}</div>
            <div class="row"><span class="label">Total Amount:</span> ${formatCurrency(subscription.total_amount)}</div>
            <div class="row"><span class="label">Paid So Far:</span> ${formatCurrency(totalPaid)}</div>
            <div class="row"><span class="label">Status:</span> ${subscription.status}</div>
          </div>
          <script>window.onload = function(){ window.print(); };</script>
        </body>
      </html>
    `);

    popup.document.close();
  }

  return (
    <PortalPage
      title={subscription ? `Subscription #${subscription.id}` : "Subscription Detail"}
      subtitle="Track EMI schedule, reconciliation checkpoints, and Lucky Plan allocation details."
    >
      <section
        style={{
          marginBottom: 16,
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <button type="button" onClick={() => router.push("/admin/subscriptions")}>
          Back to Subscriptions
        </button>
        {subscription ? (
          <>
            <button
              type="button"
              onClick={() => router.push(`/admin/payments/create?subscription=${subscription.id}`)}
            >
              Collect EMI
            </button>
            <button
              type="button"
              onClick={() => router.push(`/admin/customers/${subscription.customer}`)}
            >
              View Customer
            </button>
            <button type="button" onClick={handlePrint}>
              Print Details
            </button>
          </>
        ) : null}
      </section>

      {loading ? <p>Loading subscription details...</p> : null}
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}

      {!loading && !error && subscription ? (
        <>
          <section
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

          <section style={{ marginBottom: 16, border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
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

          <section style={{ marginBottom: 16, border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
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