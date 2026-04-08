"use client";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import BookRegisterPage from "@/components/accounting/BookRegisterPage";
import { accountingMoney } from "@/components/accounting/shared";
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
      title="UPI Book"
      subtitle="UPI journal rows grouped by mapped finance accounts."
      printTitle="UPI Book"
      fetchReport={getUpiBook}
      columns={columns}
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

