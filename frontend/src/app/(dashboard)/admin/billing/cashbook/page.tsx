"use client";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import BookRegisterPage from "@/components/accounting/BookRegisterPage";
import { accountingDate, accountingMoney } from "@/components/accounting/shared";
import type { BillingCashBookRow } from "@/services/billing";
import { getBillingCashBook } from "@/services/billing";

const columns: EnterpriseColumnDef<BillingCashBookRow>[] = [
  { key: "entry_date", header: "Date", render: (row) => accountingDate(row.entry_date) },
  { key: "finance_account_name", header: "Finance Account" },
  { key: "kind", header: "Kind" },
  { key: "entry_no", header: "Journal" },
  { key: "memo", header: "Memo" },
  { key: "debit_amount", header: "Debit", render: (row) => accountingMoney(row.debit_amount) },
  { key: "credit_amount", header: "Credit", render: (row) => accountingMoney(row.credit_amount) },
];

export default function BillingCashBookPage() {
  return (
    <BookRegisterPage<BillingCashBookRow>
      title="Billing Cash Book"
      subtitle="Cash-facing receipt movements derived from posted billing receipts and related accounting journals."
      printTitle="Billing Cash Book"
      fetchReport={getBillingCashBook}
      columns={columns}
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Billing", href: "/admin/billing" },
        { label: "Cash Book" },
      ]}
      toPrintRow={(row) => [
        accountingDate(row.entry_date),
        row.finance_account_name,
        row.entry_no,
        row.memo || "—",
        accountingMoney(row.debit_amount),
        accountingMoney(row.credit_amount),
      ]}
    />
  );
}
