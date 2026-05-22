import { apiFetch } from "@/lib/api";

import type { EntityLookupOption } from "@/components/erp/forms/EntityLookupCombobox";

type LookupRow = {
  id: number | string;
  label: string;
  subtitle?: string | null;
  status?: string | null;
  metadata?: Record<string, unknown> | null;
  amount?: string | null;
  date?: string | null;
};

type LookupResponse = {
  results?: LookupRow[];
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

export async function resolveSettlementFinanceAccountById(id: number | string): Promise<EntityLookupOption> {
  const payload = await apiFetch<LookupRow>(`/admin/settlements/lookups/finance-accounts/${id}/`);
  return {
    id: payload.id,
    label: payload.label,
    subtitle: payload.subtitle ?? undefined,
    status: payload.status ?? undefined,
    metadata: payload.metadata ?? undefined,
  };
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

export async function resolveSettlementPaymentById(id: number | string): Promise<EntityLookupOption> {
  const payload = await apiFetch<LookupRow>(`/admin/settlements/lookups/payments/${id}/`);
  return {
    id: payload.id,
    label: payload.label,
    subtitle: payload.subtitle ?? undefined,
    status: payload.status ?? undefined,
    metadata: {
      ...(payload.metadata ?? {}),
      amount: payload.amount ?? undefined,
      date: payload.date ?? undefined,
    },
  };
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

export async function resolveSettlementReceiptById(id: number | string): Promise<EntityLookupOption> {
  const payload = await apiFetch<LookupRow>(`/admin/settlements/lookups/receipts/${id}/`);
  return {
    id: payload.id,
    label: payload.label,
    subtitle: payload.subtitle ?? undefined,
    status: payload.status ?? undefined,
    metadata: {
      ...(payload.metadata ?? {}),
      amount: payload.amount ?? undefined,
      date: payload.date ?? undefined,
    },
  };
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

export async function resolveSettlementMoneyMovementById(id: number | string): Promise<EntityLookupOption> {
  const payload = await apiFetch<LookupRow>(`/admin/settlements/lookups/money-movements/${id}/`);
  return {
    id: payload.id,
    label: payload.label,
    subtitle: payload.subtitle ?? undefined,
    status: payload.status ?? undefined,
    metadata: {
      ...(payload.metadata ?? {}),
      amount: payload.amount ?? undefined,
      date: payload.date ?? undefined,
    },
  };
}
