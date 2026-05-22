import { apiFetch } from "@/lib/api";

import type { EntityLookupOption } from "@/components/erp/forms/EntityLookupCombobox";

type LookupResponse = {
  results?: Array<{
    id: number | string;
    label: string;
    subtitle?: string | null;
    status?: string | null;
    metadata?: Record<string, unknown> | null;
    amount?: string | null;
    date?: string | null;
  }>;
};

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
}): Promise<EntityLookupOption[]> {
  const payload = await apiFetch<LookupResponse>(
    `/admin/settlements/lookups/finance-accounts/${buildQuery({
      q: params.query,
      kind: params.kind,
    })}`
  );

  return (payload.results ?? []).slice(0, 20).map((row) => ({
    id: row.id,
    label: row.label,
    subtitle: row.subtitle ?? undefined,
    status: row.status ?? undefined,
    metadata: row.metadata ?? undefined,
  }));
}

export async function lookupSettlementPayments(query: string): Promise<EntityLookupOption[]> {
  const payload = await apiFetch<LookupResponse>(
    `/admin/settlements/lookups/payments/${buildQuery({ q: query })}`
  );

  return (payload.results ?? []).slice(0, 20).map((row) => ({
    id: row.id,
    label: row.label,
    subtitle: row.subtitle ?? undefined,
    status: row.status ?? undefined,
    metadata: {
      ...(row.metadata ?? {}),
      amount: row.amount ?? undefined,
      date: row.date ?? undefined,
    },
  }));
}

export async function lookupSettlementReceipts(query: string): Promise<EntityLookupOption[]> {
  const payload = await apiFetch<LookupResponse>(
    `/admin/settlements/lookups/receipts/${buildQuery({
      q: query,
    })}`
  );

  return (payload.results ?? []).slice(0, 20).map((row) => ({
    id: row.id,
    label: row.label,
    subtitle: row.subtitle ?? undefined,
    status: row.status ?? undefined,
    metadata: {
      ...(row.metadata ?? {}),
      amount: row.amount ?? undefined,
      date: row.date ?? undefined,
    },
  }));
}

export async function lookupSettlementMoneyMovements(query: string): Promise<EntityLookupOption[]> {
  const payload = await apiFetch<LookupResponse>(
    `/admin/settlements/lookups/money-movements/${buildQuery({
      q: query,
    })}`
  );

  return (payload.results ?? []).slice(0, 20).map((row) => ({
    id: row.id,
    label: row.label,
    subtitle: row.subtitle ?? undefined,
    status: row.status ?? undefined,
    metadata: {
      ...(row.metadata ?? {}),
      amount: row.amount ?? undefined,
      date: row.date ?? undefined,
    },
  }));
}
