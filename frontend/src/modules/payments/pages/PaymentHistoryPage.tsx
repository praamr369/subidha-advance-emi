"use client";

import EnterpriseListPage from "@/components/enterprise/EnterpriseListPage";
import { buildColumns } from "@/components/enterprise/columns";

const columns = buildColumns([
  "id",
  "customer_name",
  "subscription",
  "emi_month_no",
  "amount",
  "method",
  "payment_date",
  "reference_no",
]);

export default function PaymentHistoryPage() {
  return (
    <EnterpriseListPage
      title="Payment History"
      subtitle="Review posted payments and collection methods."
      resourcePath="/admin/payments/"
      columns={columns}
    />
  );
}
