"use client";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import BookRegisterPage from "@/components/accounting/BookRegisterPage";
import { accountingMoney } from "@/components/accounting/shared";
import type { PurchaseBookRow } from "@/services/accounting";
import { getPurchaseBook } from "@/services/accounting";

const columns: EnterpriseColumnDef<PurchaseBookRow>[] = [
  { key: "bill_date", header: "Date" },
  { key: "bill_no", header: "Bill No" },
  { key: "vendor_name", header: "Vendor" },
  { key: "tax_mode", header: "Tax Mode" },
  { key: "grand_total", header: "Grand Total", render: (row) => accountingMoney(row.grand_total) },
  { key: "journal_entry_no", header: "Journal" },
];

export default function AccountingPurchaseBookPage() {
  return (
    <BookRegisterPage
      title="Purchase Book"
      subtitle="Posted purchase bills backed by inventory receipts and accounting journals."
      printTitle="Purchase Book"
      fetchReport={getPurchaseBook}
      columns={columns}
      toPrintRow={(row) => [
        row.bill_date,
        row.bill_no,
        row.vendor_name,
        row.tax_mode,
        accountingMoney(row.grand_total),
        row.journal_entry_no,
      ]}
    />
  );
}
