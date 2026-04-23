"use client";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import BookRegisterPage from "@/components/accounting/BookRegisterPage";
import { ACCOUNTING_BOOK_DIRECTORY_GROUPS } from "@/components/admin/control-center/businessControlDirectories";
import { accountingMoney } from "@/components/accounting/shared";
import { ROUTES } from "@/lib/routes";
import type { FinanceBookRow } from "@/services/accounting";
import { getUpiBook } from "@/services/accounting";

const columns: EnterpriseColumnDef<FinanceBookRow>[] = [
  { key: "entry_date", header: "Date" },
  { key: "finance_account_name", header: "UPI Account" },
  { key: "entry_no", header: "Journal" },
  { key: "memo", header: "Memo" },
  { key: "debit_amount", header: "Debit", render: (row) => accountingMoney(row.debit_amount) },
  { key: "credit_amount", header: "Credit", render: (row) => accountingMoney(row.credit_amount) },
];

export default function AccountingUpiBookPage() {
  return (
    <BookRegisterPage
      eyebrow="Accounting Books"
      title="UPI Book"
      subtitle="UPI journal rows grouped by mapped finance accounts."
      printTitle="UPI Book"
      helperNote="UPI book rows remain posted accounting records. This workspace is for review and export, not payment collection."
      helperTone="info"
      fetchReport={getUpiBook}
      columns={columns}
      actions={[
        { href: ROUTES.admin.accountingBooksCash, label: "Cash Book", variant: "secondary" },
        { href: ROUTES.admin.accountingBooksBank, label: "Bank Book", variant: "secondary" },
        { href: ROUTES.admin.accountingProfitLoss, label: "Profit & Loss", variant: "primary" },
      ]}
      directoryTitle="Accounting book map"
      directoryDescription="Use the shared book directory to move between posted money and commercial books."
      directoryGroups={ACCOUNTING_BOOK_DIRECTORY_GROUPS}
      toPrintRow={(row) => [
        row.entry_date,
        row.finance_account_name,
        row.entry_no,
        row.memo || "—",
        accountingMoney(row.debit_amount),
        accountingMoney(row.credit_amount),
      ]}
    />
  );
}
