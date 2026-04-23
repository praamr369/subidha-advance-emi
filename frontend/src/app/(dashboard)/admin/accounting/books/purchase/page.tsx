"use client";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import BookRegisterPage from "@/components/accounting/BookRegisterPage";
import { ACCOUNTING_BOOK_DIRECTORY_GROUPS } from "@/components/admin/control-center/businessControlDirectories";
import { accountingMoney } from "@/components/accounting/shared";
import { ROUTES } from "@/lib/routes";
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
      eyebrow="Accounting Books"
      title="Purchase Book"
      subtitle="Posted purchase bills backed by inventory receipts and accounting journals."
      printTitle="Purchase Book"
      helperNote="Purchase book rows are review-only accounting outputs. Stock inward and vendor payable posting remain controlled in their source workflows."
      helperTone="info"
      fetchReport={getPurchaseBook}
      columns={columns}
      actions={[
        { href: ROUTES.admin.accountingPurchaseBills, label: "Purchase Bills", variant: "secondary" },
        { href: ROUTES.admin.accountingVendorSettlements, label: "Vendor Settlements", variant: "secondary" },
        { href: ROUTES.admin.accountingBalanceSheet, label: "Balance Sheet", variant: "primary" },
      ]}
      directoryTitle="Accounting book map"
      directoryDescription="Jump between posted commercial books and the supporting payable control routes."
      directoryGroups={ACCOUNTING_BOOK_DIRECTORY_GROUPS}
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
