import { apiFetch } from "@/lib/api";

import type { EntityLookupOption } from "@/components/erp/forms/EntityLookupCombobox";

type PaginatedResponse<T> = {
  count?: number;
  next?: string | null;
  previous?: string | null;
  results?: T[];
};

type FinanceAccountRow = {
  id: number;
  name: string;
  kind?: string;
  branch_name?: string;
  branch_code?: string;
  chart_account_code?: string;
  bank_last4?: string | null;
  upi_handle?: string | null;
  is_active?: boolean;
};

type PaymentRow = {
  id: number;
  amount?: string;
  payment_date?: string;
  method?: string;
  reference_no?: string | null;
  customer_name?: string;
  customer_phone?: string;
  subscription_number?: string;
  is_reversed?: boolean;
};

type ReceiptRow = {
  id: number;
  receipt_no?: string | null;
  amount?: string;
  status?: string;
  receipt_date?: string;
  customer_name_snapshot?: string;
  customer_phone_snapshot?: string;
  finance_account_name?: string;
};

type MoneyMovementRow = {
  id: number;
  movement_no?: string;
  movement_date?: string;
  amount?: string;
  status?: string;
  from_finance_account_name?: string;
  to_finance_account_name?: string;
  reference_no?: string | null;
};

function compact(parts: Array<string | null | undefined>): string {
  return parts.map((part) => (part || "").trim()).filter(Boolean).join(" · ");
}

function buildQuery(params: Record<string, string | number | boolean | null | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export async function lookupSettlementFinanceAccounts(params: {
  query: string;
  kind?: "BANK" | "UPI" | "CASH";
  isActive?: boolean;
}): Promise<EntityLookupOption[]> {
  const payload = await apiFetch<PaginatedResponse<FinanceAccountRow>>(
    `/accounting/finance-accounts/${buildQuery({
      search: params.query,
      kind: params.kind,
      is_active: params.isActive ?? true,
      page_size: 20,
    })}`
  );

  return (payload.results ?? []).map((row) => {
    const code = row.kind ? String(row.kind).toUpperCase() : undefined;
    const subtitle = compact([
      row.branch_name ? `${row.branch_name}${row.branch_code ? ` (${row.branch_code})` : ""}` : null,
      row.chart_account_code ? `COA ${row.chart_account_code}` : null,
      row.bank_last4 ? `•••• ${row.bank_last4}` : null,
      row.upi_handle ? row.upi_handle : null,
      row.is_active === false ? "INACTIVE" : null,
    ]);

    return {
      id: row.id,
      label: row.name,
      code,
      subtitle: subtitle || undefined,
      metadata: {
        kind: row.kind,
      },
    };
  });
}

export async function lookupSettlementPayments(query: string): Promise<EntityLookupOption[]> {
  const payload = await apiFetch<{ results?: PaymentRow[] }>(
    `/admin/payments/${buildQuery({ q: query })}`
  );

  return (payload.results ?? []).slice(0, 20).map((row) => {
    const subtitle = compact([
      row.payment_date,
      row.method,
      row.reference_no ? `Ref ${row.reference_no}` : null,
      row.customer_name ? `${row.customer_name}${row.customer_phone ? ` (${row.customer_phone})` : ""}` : null,
      row.subscription_number ? `Sub ${row.subscription_number}` : null,
      row.is_reversed ? "REVERSED" : null,
    ]);
    return {
      id: row.id,
      label: compact([`Payment #${row.id}`, row.amount ? `₹${row.amount}` : null]),
      subtitle: subtitle || undefined,
      status: row.is_reversed ? "REVERSED" : undefined,
      metadata: row as unknown as Record<string, unknown>,
    };
  });
}

export async function lookupSettlementReceipts(query: string): Promise<EntityLookupOption[]> {
  const payload = await apiFetch<PaginatedResponse<ReceiptRow>>(
    `/billing/receipts/${buildQuery({
      search: query,
      page_size: 20,
    })}`
  );

  return (payload.results ?? []).map((row) => {
    const subtitle = compact([
      row.receipt_date,
      row.status,
      row.finance_account_name,
      row.customer_name_snapshot
        ? `${row.customer_name_snapshot}${row.customer_phone_snapshot ? ` (${row.customer_phone_snapshot})` : ""}`
        : null,
    ]);

    return {
      id: row.id,
      label: compact([
        row.receipt_no ? `Receipt ${row.receipt_no}` : `Receipt #${row.id}`,
        row.amount ? `₹${row.amount}` : null,
      ]),
      subtitle: subtitle || undefined,
      status: row.status,
      metadata: row as unknown as Record<string, unknown>,
    };
  });
}

export async function lookupSettlementMoneyMovements(query: string): Promise<EntityLookupOption[]> {
  const payload = await apiFetch<PaginatedResponse<MoneyMovementRow>>(
    `/accounting/money-movements/${buildQuery({
      search: query,
      page_size: 20,
    })}`
  );

  return (payload.results ?? []).map((row) => {
    const subtitle = compact([
      row.movement_date,
      row.status,
      row.reference_no ? `Ref ${row.reference_no}` : null,
      row.from_finance_account_name && row.to_finance_account_name
        ? `${row.from_finance_account_name} → ${row.to_finance_account_name}`
        : null,
    ]);

    return {
      id: row.id,
      label: compact([
        row.movement_no ? `Movement ${row.movement_no}` : `Movement #${row.id}`,
        row.amount ? `₹${row.amount}` : null,
      ]),
      subtitle: subtitle || undefined,
      status: row.status,
      metadata: row as unknown as Record<string, unknown>,
    };
  });
}

