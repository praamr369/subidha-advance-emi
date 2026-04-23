"use client";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import BookRegisterPage from "@/components/accounting/BookRegisterPage";
import { BILLING_CONTROL_DIRECTORY_GROUPS } from "@/components/admin/control-center/businessControlDirectories";
import { accountingDate, accountingMoney } from "@/components/accounting/shared";
import { ROUTES } from "@/lib/routes";
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
      eyebrow="Billing Books"
      title="Billing Cash Book"
      subtitle="Cash-facing receipt movements derived from posted billing receipts and related accounting journals."
      printTitle="Billing Cash Book"
      helperNote="Billing books stay document-first and posted-only. They remain distinct from accounting money books and from cashier collection operations."
      helperTone="info"
      fetchReport={getBillingCashBook}
      columns={columns}
      actions={[
        { href: ROUTES.admin.billingDailyBook, label: "Daily Book", variant: "secondary" },
        { href: ROUTES.admin.billingReceipts, label: "Receipts", variant: "secondary" },
        { href: ROUTES.admin.billingRegister, label: "Document Register", variant: "primary" },
      ]}
      statusBadge={{ label: "Posted Billing Rows", tone: "info" }}
      directoryTitle="Billing route map"
      directoryDescription="Move across posted billing books, document registers, and linked billing control routes."
      directoryGroups={BILLING_CONTROL_DIRECTORY_GROUPS}
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
