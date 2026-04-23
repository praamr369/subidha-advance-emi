"use client";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import BookRegisterPage from "@/components/accounting/BookRegisterPage";
import { ACCOUNTING_BOOK_DIRECTORY_GROUPS } from "@/components/admin/control-center/businessControlDirectories";
import { accountingMoney } from "@/components/accounting/shared";
import { ROUTES } from "@/lib/routes";
import type { FinanceBookRow } from "@/services/accounting";
import { getBankBook } from "@/services/accounting";

const columns: EnterpriseColumnDef<FinanceBookRow>[] = [
  { key: "entry_date", header: "Date" },
  { key: "finance_account_name", header: "Bank Account" },
  { key: "entry_no", header: "Journal" },
  { key: "source_model", header: "Source" },
  { key: "debit_amount", header: "Debit", render: (row) => accountingMoney(row.debit_amount) },
  { key: "credit_amount", header: "Credit", render: (row) => accountingMoney(row.credit_amount) },
];

export default function AccountingBankBookPage() {
  return (
    <BookRegisterPage
      eyebrow="Accounting Books"
      title="Bank Book"
      subtitle="Posted bank-account movements from finance accounts and journals."
      printTitle="Bank Book"
      helperNote="This view stays inside the accounting subsystem and reads posted bank-side rows only."
      helperTone="info"
      fetchReport={getBankBook}
      columns={columns}
      actions={[
        { href: ROUTES.admin.accountingBooksCash, label: "Cash Book", variant: "secondary" },
        { href: ROUTES.admin.accountingBooksUpi, label: "UPI Book", variant: "secondary" },
        { href: ROUTES.admin.accountingBalanceSheet, label: "Balance Sheet", variant: "primary" },
      ]}
      directoryTitle="Accounting book map"
      directoryDescription="Shift between posted money books and linked accounting review routes from one workspace family."
      directoryGroups={ACCOUNTING_BOOK_DIRECTORY_GROUPS}
      toPrintRow={(row) => [
        row.entry_date,
        row.finance_account_name,
        row.entry_no,
        row.source_model || "—",
        accountingMoney(row.debit_amount),
        accountingMoney(row.credit_amount),
      ]}
    />
  );
}
