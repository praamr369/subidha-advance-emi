"use client";

import Link from "next/link";
import { buildAdminJournalEntryRoute } from "@/lib/route-builders";
import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import BookRegisterPage from "@/components/accounting/BookRegisterPage";
import { ACCOUNTING_BOOK_DIRECTORY_GROUPS } from "@/components/admin/control-center/businessControlDirectories";
import { accountingMoney } from "@/components/accounting/shared";
import { ROUTES } from "@/lib/routes";
import type { FinanceBookRow } from "@/services/accounting";
import { getBankBook } from "@/services/accounting";

const columns: EnterpriseColumnDef<FinanceBookRow>[] = [
  { key: "entry_date", header: "Date" },
  { key: "finance_account_name", header: "Bank / UPI Account" },
  { 
    key: "entry_no", 
    header: "Journal",
    render: (row) => (
      <Link href={buildAdminJournalEntryRoute(row.journal_entry_id)} className="font-medium text-emerald-700 hover:underline">
        {row.entry_no}
      </Link>
    ),
  },
  { key: "source_model", header: "Source" },
  { key: "debit_amount", header: "Debit", render: (row) => accountingMoney(row.debit_amount) },
  { key: "credit_amount", header: "Credit", render: (row) => accountingMoney(row.credit_amount) },
];

export default function AccountingBankBookPage() {
  return (
    <BookRegisterPage
      eyebrow="Accounting Books"
      title="Bank / UPI Book"
      subtitle="Posted movements for the single Bank/UPI holding account (bank transfers, cheques, deposits, and UPI)."
      printTitle="Bank / UPI Book"
      helperNote="This view stays inside the accounting subsystem and reads posted bank/UPI-side rows only."
      helperTone="info"
      fetchReport={getBankBook}
      columns={columns}
      actions={[
        { href: ROUTES.admin.accountingBooksCash, label: "Cash Book", variant: "secondary" },
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
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Accounting", href: ROUTES.admin.accounting },
        { label: "Books", href: ROUTES.admin.accountingBooks },
        { label: "Bank / UPI Book" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    />
  );
}
