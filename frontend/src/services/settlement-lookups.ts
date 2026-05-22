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

type SettlementLookupEntity = "finance_account" | "payment" | "receipt" | "money_movement";

const resolveCache = new Map<string, EntityLookupOption>();

function buildResolveCacheKey(entity: SettlementLookupEntity, id: number | string): string {
  return `${entity}:${String(id)}`;
}

function sanitizeLookupOption(option: EntityLookupOption): EntityLookupOption {
  const metadata = option.metadata && typeof option.metadata === "object" ? option.metadata : undefined;
  const safeMetadata: Record<string, unknown> = {};

  if (metadata) {
    if ("amount" in metadata && typeof metadata.amount === "string" && metadata.amount.trim()) {
      safeMetadata.amount = metadata.amount;
    }
    if ("date" in metadata && typeof metadata.date === "string" && metadata.date.trim()) {
      safeMetadata.date = metadata.date;
    }
    if ("is_reversed" in metadata && typeof metadata.is_reversed === "boolean") {
      safeMetadata.is_reversed = metadata.is_reversed;
    }
  }

  return {
    id: option.id,
    label: option.label,
    subtitle: option.subtitle,
    status: option.status,
    metadata: Object.keys(safeMetadata).length > 0 ? safeMetadata : undefined,
  };
}

export function primeSettlementLookupResolveCache(
  entity: SettlementLookupEntity,
  id: number | string,
  option: EntityLookupOption
): void {
  resolveCache.set(buildResolveCacheKey(entity, id), sanitizeLookupOption(option));
}

function readSettlementLookupResolveCache(
  entity: SettlementLookupEntity,
  id: number | string
): EntityLookupOption | null {
  return resolveCache.get(buildResolveCacheKey(entity, id)) ?? null;
}

async function resolveWithCache(
  entity: SettlementLookupEntity,
  id: number | string,
  fetcher: (id: number | string) => Promise<EntityLookupOption>
): Promise<EntityLookupOption> {
  const cached = readSettlementLookupResolveCache(entity, id);
  if (cached) return cached;
  const resolved = await fetcher(id);
  primeSettlementLookupResolveCache(entity, id, resolved);
  return resolved;
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
}): Promise<EntityLookupOption[]> {
  const payload = await apiFetch<LookupResponse>(
    `/admin/settlements/lookups/finance-accounts/${buildQuery({
      q: params.query,
      kind: params.kind,
    })}`
  );

  const options = (payload.results ?? []).slice(0, 20).map((row) => ({
    id: row.id,
    label: row.label,
    subtitle: row.subtitle ?? undefined,
    status: row.status ?? undefined,
    metadata: row.metadata ?? undefined,
  }));
  options.forEach((option) => primeSettlementLookupResolveCache("finance_account", option.id, option));
  return options;
}

export async function resolveSettlementFinanceAccountById(id: number | string): Promise<EntityLookupOption> {
  return resolveWithCache("finance_account", id, async (nextId) => {
    const payload = await apiFetch<LookupRow>(`/admin/settlements/lookups/finance-accounts/${nextId}/`);
    return {
      id: payload.id,
      label: payload.label,
      subtitle: payload.subtitle ?? undefined,
      status: payload.status ?? undefined,
      metadata: payload.metadata ?? undefined,
    };
  });
}

export async function lookupSettlementPayments(query: string): Promise<EntityLookupOption[]> {
  const payload = await apiFetch<LookupResponse>(
    `/admin/settlements/lookups/payments/${buildQuery({ q: query })}`
  );

  const options = (payload.results ?? []).slice(0, 20).map((row) => ({
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
  options.forEach((option) => primeSettlementLookupResolveCache("payment", option.id, option));
  return options;
}

export async function resolveSettlementPaymentById(id: number | string): Promise<EntityLookupOption> {
  return resolveWithCache("payment", id, async (nextId) => {
    const payload = await apiFetch<LookupRow>(`/admin/settlements/lookups/payments/${nextId}/`);
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
  });
}

export async function lookupSettlementReceipts(query: string): Promise<EntityLookupOption[]> {
  const payload = await apiFetch<LookupResponse>(
    `/admin/settlements/lookups/receipts/${buildQuery({
      q: query,
    })}`
  );

  const options = (payload.results ?? []).slice(0, 20).map((row) => ({
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
  options.forEach((option) => primeSettlementLookupResolveCache("receipt", option.id, option));
  return options;
}

export async function resolveSettlementReceiptById(id: number | string): Promise<EntityLookupOption> {
  return resolveWithCache("receipt", id, async (nextId) => {
    const payload = await apiFetch<LookupRow>(`/admin/settlements/lookups/receipts/${nextId}/`);
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
  });
}

export async function lookupSettlementMoneyMovements(query: string): Promise<EntityLookupOption[]> {
  const payload = await apiFetch<LookupResponse>(
    `/admin/settlements/lookups/money-movements/${buildQuery({
      q: query,
    })}`
  );

  const options = (payload.results ?? []).slice(0, 20).map((row) => ({
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
  options.forEach((option) => primeSettlementLookupResolveCache("money_movement", option.id, option));
  return options;
}

export async function resolveSettlementMoneyMovementById(id: number | string): Promise<EntityLookupOption> {
  return resolveWithCache("money_movement", id, async (nextId) => {
    const payload = await apiFetch<LookupRow>(`/admin/settlements/lookups/money-movements/${nextId}/`);
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
  });
}
