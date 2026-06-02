import { apiFetch } from "@/lib/api";

type ChartRow = {
  id: number;
  code?: string | null;
  name?: string | null;
  system_code?: string | null;
  account_type?: string | null;
  type?: string | null;
  is_active?: boolean;
};

type Readiness = { chart_accounts?: ChartRow[] };

type MappingPayload = {
  detail?: string;
  mapping_id?: number;
  mapping?: Record<string, unknown> | null;
  chart_accounts?: Array<Record<string, unknown>>;
  finance_accounts?: Array<Record<string, unknown>>;
  posting_boundary_note?: string;
  premade_setup_enabled?: boolean;
};

function upper(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function rowType(row: ChartRow): string {
  return upper(row.account_type ?? row.type);
}

function pick(rows: ChartRow[], type: string, keys: string[]): ChartRow | null {
  const wanted = new Set(keys.map(upper));
  return rows.find((row) => {
    if (row.is_active === false || rowType(row) !== type) return false;
    return wanted.has(upper(row.system_code)) || wanted.has(upper(row.code)) || wanted.has(upper(row.name));
  }) ?? null;
}

function requireRow(row: ChartRow | null, label: string): ChartRow {
  if (!row) throw new Error(`${label} account is required.`);
  return row;
}

async function postMapping(input: Record<string, unknown>) {
  return apiFetch<MappingPayload>("/admin/finance/account-mapping/", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function prepareRentLeaseAccountingMapping() {
  await apiFetch<Record<string, unknown>>("/admin/accounting/setup/bootstrap/", {
    method: "POST",
    body: JSON.stringify({ dry_run: false }),
  });
  try {
    return await postMapping({ action: "ENSURE_PREMADE" });
  } catch {
    const readiness = await apiFetch<Readiness>("/admin/accounting/setup/readiness/");
    const rows = readiness.chart_accounts ?? [];
    const income = requireRow(pick(rows, "INCOME", ["RENT_INCOME", "RENT-4000", "3000", "Rent Income"]), "Monthly income");
    const liability = requireRow(
      pick(rows, "LIABILITY", ["SECURITY_DEPOSIT_LIABILITY", "RENT_LEASE_SECURITY_DEPOSIT_LIABILITY", "SEC-2300", "2000", "Rent/Lease Security Deposit Liability", "Security Deposit Liability"]),
      "Deposit liability",
    );
    const damage = requireRow(pick(rows, "INCOME", ["DAMAGE_RECOVERY", "RENT_LEASE_DAMAGE_RECOVERY_INCOME", "3020", "Damage Recovery Income"]), "Damage recovery");
    return postMapping({
      monthly_income_account_id: income.id,
      deposit_liability_account_id: liability.id,
      deposit_refund_account_id: liability.id,
      damage_recovery_income_account_id: damage.id,
      notes: "Prepared from active chart accounts.",
    });
  }
}
