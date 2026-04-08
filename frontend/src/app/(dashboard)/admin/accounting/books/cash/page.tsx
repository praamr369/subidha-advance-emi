"use client";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import BookRegisterPage from "@/components/accounting/BookRegisterPage";
import { accountingMoney } from "@/components/accounting/shared";
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
      title="Cash Book"
      subtitle="Cash-account journal rows grouped from actual finance accounts."
      printTitle="Cash Book"
      fetchReport={getCashBook}
      columns={columns}
      toPrintRow={(row) => [
        row.entry_date,
        row.finance_account_name,
        row.entry_no,
        row.description || "—",
        accountingMoney(row.debit_amount),
        accountingMoney(row.credit_amount),
      ]}
    />
  );
}

