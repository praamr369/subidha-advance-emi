"use client";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import BookRegisterPage from "@/components/accounting/BookRegisterPage";
import { ACCOUNTING_BOOK_DIRECTORY_GROUPS } from "@/components/admin/control-center/businessControlDirectories";
import { accountingMoney } from "@/components/accounting/shared";
import { ROUTES } from "@/lib/routes";
import type { FinanceBookRow } from "@/services/accounting";
import { getCashBook } from "@/services/accounting";

const columns: EnterpriseColumnDef<FinanceBookRow>[] = [
  { key: "entry_date", header: "Date" },
  { key: "finance_account_name", header: "Cash Account" },
  { key: "entry_no", header: "Journal" },
  { key: "description", header: "Description" },
  { key: "debit_amount", header: "Debit", render: (row) => accountingMoney(row.debit_amount) },
  { key: "credit_amount", header: "Credit", render: (row) => accountingMoney(row.credit_amount) },
];

export default function AccountingCashBookPage() {
  return (
    <BookRegisterPage
      eyebrow="Accounting Books"
      title="Cash Book"
      subtitle="Cash-account journal rows grouped from actual finance accounts."
      printTitle="Cash Book"
      helperNote="Accounting books remain posted-data review surfaces. They do not replace cashier collection rails or mutate source financial records."
      helperTone="info"
      fetchReport={getCashBook}
      columns={columns}
      actions={[
        { href: ROUTES.admin.accountingBooksBank, label: "Bank Book", variant: "secondary" },
        { href: ROUTES.admin.accountingJournals, label: "Journals", variant: "secondary" },
        { href: ROUTES.admin.accountingTrialBalance, label: "Trial Balance", variant: "primary" },
      ]}
      directoryTitle="Accounting book map"
      directoryDescription="Move between posted cash, bank, UPI, sales, and purchase views without leaving the accounting workspace."
      directoryGroups={ACCOUNTING_BOOK_DIRECTORY_GROUPS}
      toPrintRow={(row) => [
        row.entry_date,
        row.finance_account_name,
        row.entry_no,
        row.description || "—",
        accountingMoney(row.debit_amount),
        accountingMoney(row.credit_amount),
      ]}
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Accounting", href: ROUTES.admin.accounting },
        { label: "Books", href: ROUTES.admin.accountingBooks },
        { label: "Cash Book" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    />
  );
}
