"use client";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import BookRegisterPage from "@/components/accounting/BookRegisterPage";
import { accountingMoney } from "@/components/accounting/shared";
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
      title="Bank Book"
      subtitle="Posted bank-account movements from finance accounts and journals."
      printTitle="Bank Book"
      fetchReport={getBankBook}
      columns={columns}
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

