"use client";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import BookRegisterPage from "@/components/accounting/BookRegisterPage";
import { BILLING_CONTROL_DIRECTORY_GROUPS } from "@/components/admin/control-center/businessControlDirectories";
import { accountingDate, accountingMoney } from "@/components/accounting/shared";
import { ROUTES } from "@/lib/routes";
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
      eyebrow="Billing Books"
      title="Billing Daily Book"
      subtitle="Daily posted billing register for retail and EMI-linked billing documents."
      printTitle="Billing Daily Book"
      helperNote="The billing daily book remains a posted billing register. It does not replace direct-sale execution or accounting statement surfaces."
      helperTone="info"
      fetchReport={getBillingDailyBook}
      columns={columns}
      actions={[
        { href: ROUTES.admin.billingInvoices, label: "Invoices", variant: "secondary" },
        { href: ROUTES.admin.billingDirectSales, label: "Direct Sales", variant: "secondary" },
        { href: ROUTES.admin.billingRegister, label: "Document Register", variant: "primary" },
      ]}
      statusBadge={{ label: "Posted Billing Rows", tone: "info" }}
      directoryTitle="Billing route map"
      directoryDescription="Use the shared billing directory to move between source documents, posted books, and retail execution routes."
      directoryGroups={BILLING_CONTROL_DIRECTORY_GROUPS}
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
