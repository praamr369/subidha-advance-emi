"use client";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import BookRegisterPage from "@/components/accounting/BookRegisterPage";
import { accountingMoney } from "@/components/accounting/shared";
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
      title="Sales Book"
      subtitle="Posted retail and EMI billing documents backed by accounting journals."
      printTitle="Sales Book"
      fetchReport={getSalesBook}
      columns={columns}
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

