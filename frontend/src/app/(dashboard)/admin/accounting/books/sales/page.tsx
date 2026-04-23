"use client";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import BookRegisterPage from "@/components/accounting/BookRegisterPage";
import { ACCOUNTING_BOOK_DIRECTORY_GROUPS } from "@/components/admin/control-center/businessControlDirectories";
import { accountingMoney } from "@/components/accounting/shared";
import { ROUTES } from "@/lib/routes";
import type { SalesBookRow } from "@/services/accounting";
import { getSalesBook } from "@/services/accounting";

const columns: EnterpriseColumnDef<SalesBookRow>[] = [
  { key: "invoice_date", header: "Date" },
  { key: "document_no", header: "Invoice No" },
  { key: "customer_name", header: "Customer" },
  { key: "billing_channel", header: "Channel" },
  { key: "grand_total", header: "Grand Total", render: (row) => accountingMoney(row.grand_total) },
  { key: "journal_entry_no", header: "Journal" },
];

export default function AccountingSalesBookPage() {
  return (
    <BookRegisterPage
      eyebrow="Accounting Books"
      title="Sales Book"
      subtitle="Posted retail and EMI billing documents backed by accounting journals."
      printTitle="Sales Book"
      helperNote="Sales book rows are accounting views of posted commercial documents. Billing and cashier execution remain separate operational surfaces."
      helperTone="info"
      fetchReport={getSalesBook}
      columns={columns}
      actions={[
        { href: ROUTES.admin.billingRegister, label: "Billing Register", variant: "secondary" },
        { href: ROUTES.admin.accountingBooksPurchase, label: "Purchase Book", variant: "secondary" },
        { href: ROUTES.admin.accountingTrialBalance, label: "Trial Balance", variant: "primary" },
      ]}
      directoryTitle="Accounting book map"
      directoryDescription="Move between money books and commercial books while staying in the accounting review workspace."
      directoryGroups={ACCOUNTING_BOOK_DIRECTORY_GROUPS}
      toPrintRow={(row) => [
        row.invoice_date,
        row.document_no || "—",
        row.customer_name || "—",
        row.billing_channel,
        accountingMoney(row.grand_total),
        row.journal_entry_no,
      ]}
    />
  );
}
