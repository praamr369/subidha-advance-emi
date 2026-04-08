"use client";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import BookRegisterPage from "@/components/accounting/BookRegisterPage";
import { accountingDate, accountingMoney } from "@/components/accounting/shared";
import type { BillingDailyBookRow } from "@/services/billing";
import { getBillingDailyBook } from "@/services/billing";

const columns: EnterpriseColumnDef<BillingDailyBookRow>[] = [
  { key: "invoice_date", header: "Date", render: (row) => accountingDate(row.invoice_date) },
  { key: "document_no", header: "Invoice" },
  { key: "customer_name", header: "Customer" },
  { key: "billing_channel", header: "Channel" },
  { key: "tax_mode", header: "Tax Mode" },
  { key: "tax_total", header: "Tax", render: (row) => accountingMoney(row.tax_total) },
  { key: "grand_total", header: "Grand Total", render: (row) => accountingMoney(row.grand_total) },
  { key: "journal_entry_no", header: "Journal" },
];

export default function BillingDailyBookPage() {
  return (
    <BookRegisterPage<BillingDailyBookRow>
      title="Billing Daily Book"
      subtitle="Daily posted billing register for retail and EMI-linked billing documents."
      printTitle="Billing Daily Book"
      fetchReport={getBillingDailyBook}
      columns={columns}
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Billing", href: "/admin/billing" },
        { label: "Daily Book" },
      ]}
      toPrintRow={(row) => [
        accountingDate(row.invoice_date),
        row.document_no || "—",
        row.customer_name || "—",
        row.billing_channel,
        accountingMoney(row.tax_total),
        accountingMoney(row.grand_total),
        row.journal_entry_no,
      ]}
    />
  );
}
