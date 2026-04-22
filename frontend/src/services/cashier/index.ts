import { apiFetch } from "@/lib/api";
import type {
  AccountingPaginatedResponse,
  FinanceAccount,
} from "@/services/accounting";
import type {
  CanonicalDashboardSummary,
  DashboardDueSubscription,
  DashboardReconciliationSurface,
  DashboardWinnerSurface,
} from "@/services/dashboard-types";

export type CashierTransaction = {
  id: number;
  amount: string;
  branch_id?: number | null;
  cash_counter_id?: number | null;
  payment_date?: string;
  created_at?: string;
  method?: string;
  reference_no?: string | null;
  customer?: number | null;
  customer_name?: string;
  customer_phone?: string;
  subscription?: number | null;
  subscription_number?: string;
  emi?: number | null;
  emi_month_no?: number | null;
  batch_code?: string | null;
  lucky_number?: number | null;
  collected_by?: number | null;
  collected_by_username?: string | null;
  allocation_metadata?: Record<string, unknown> | null;
  is_reversed?: boolean;
  reversal_metadata?: Record<string, unknown> | null;
  subscription_status?: string | null;
  subscription_plan_type?: string | null;
  emi_due_date?: string | null;
  emi_amount?: string | null;
  emi_status?: string | null;
  status_label?: string;
};

export type CashierDashboardResponse = {
  summary: CanonicalDashboardSummary;
  winner_surface?: DashboardWinnerSurface;
  reconciliation?: DashboardReconciliationSurface;
  due_subscriptions?: DashboardDueSubscription[];
  total_pending_emis: number;
  total_pending_amount: string;
  today_total_collected: string;
  today_transaction_count: number;
  today_cash_total: string;
  today_digital_total: string;
  today_transactions: CashierTransaction[];
};

export type PendingEmiRecord = {
  id: number;
  subscription: number;
  customer?: number;
  customer_name?: string;
  customer_phone?: string;
  subscription_status?: string;
  batch?: number | null;
  batch_code?: string | null;
  lucky_id?: number | null;
  lucky_number?: number | null;
  month_no: number;
  due_date: string;
  amount: string;
  status: string;
  total_paid?: string;
  balance_amount?: string;
  is_overdue?: boolean;
  overdue_days?: number;
};

export type PendingEmiLookupResponse = {
  customer_id: number;
  customer_name: string;
  phone: string;
  total_pending_emis: number;
  total_pending_amount: string;
  overdue_emi_count?: number;
  overdue_amount?: string;
  next_due_emi_id?: number | null;
  next_due_date?: string | null;
  next_due_amount?: string | null;
  emis: PendingEmiRecord[];
};

export type CashierCollectibleSearchMode =
  | "phone"
  | "subscription"
  | "lucky"
  | "emi"
  | "any";

export type CashierDirectSaleSearchMode =
  | "phone"
  | "sale"
  | "customer"
  | "any";

export type CashierCollectibleSearchResult = {
  emi_id: number;
  customer_id?: number | null;
  customer_name?: string;
  customer_phone?: string;
  subscription_id?: number | null;
  subscription_number?: string;
  contract_reference?: string | null;
  batch_id?: number | null;
  batch_code?: string | null;
  lucky_id?: number | null;
  lucky_number?: number | null;
  month_no?: number | null;
  due_date?: string | null;
  amount: string;
  balance_amount: string;
  status?: string;
};

export type CashierCollectibleSearchResponse = {
  count: number;
  results: CashierCollectibleSearchResult[];
};

export type CashierCollectPaymentPayload = {
  emi_id: number;
  amount: number;
  method: "CASH" | "UPI" | "BANK";
  finance_account_id: number;
  branch_id?: number;
  cash_counter_id?: number;
  reference_no?: string;
  note?: string;
};

export type CashierCollectPaymentResponse = {
  message: string;
  created: boolean;
  payment: {
    id: number;
    amount: string;
    method?: string;
    branch_id?: number | null;
    cash_counter_id?: number | null;
    reference_no?: string | null;
    payment_date?: string;
    created_at?: string;
    customer_id?: number | null;
    subscription_id?: number | null;
    emi_id?: number | null;
    collected_by_id?: number | null;
    verified_by_id?: number | null;
    allocation_metadata?: Record<string, unknown> | null;
  };
  emi: {
    id: number;
    month_no?: number | null;
    status?: string | null;
    amount?: string;
    due_date?: string | null;
    paid_amount?: string;
    outstanding_amount?: string;
  };
  subscription: {
    id: number;
    status?: string | null;
    plan_type?: string | null;
    total_amount?: string;
    monthly_amount?: string;
    customer_id?: number | null;
    product_id?: number | null;
    batch_id?: number | null;
    lucky_id?: number | null;
  };
  finance_account?: {
    id: number;
    name: string;
    kind: "CASH" | "BANK" | "UPI";
    chart_account_id?: number | null;
    chart_account_code?: string | null;
  } | null;
  reconciliation_status?: string | null;
};

export type CashierCollectAdvancePayload = {
  customer_id: number;
  amount: number;
  method: "CASH" | "UPI" | "BANK";
  finance_account_id: number;
  branch_id?: number;
  cash_counter_id?: number;
  reference_no?: string;
  note?: string;
  payment_date?: string;
};

export type CashierCollectAdvanceResponse = {
  success: boolean;
  message: string;
  data: {
    customer_advance_id: number;
    customer_id: number;
    finance_account_id: number;
    amount: string;
    unapplied_amount: string;
    status: string;
    reference_no?: string | null;
  };
};

export type CashierCollectibleDirectSale = {
  direct_sale_id: number;
  sale_no?: string | null;
  sale_date?: string | null;
  status?: string | null;
  customer_id?: number | null;
  customer_name?: string;
  customer_phone?: string;
  branch_id?: number | null;
  branch_code?: string | null;
  branch_name?: string | null;
  cash_counter_id?: number | null;
  cash_counter_code?: string | null;
  cash_counter_name?: string | null;
  finance_account_id?: number | null;
  finance_account_name?: string | null;
  grand_total: string;
  received_total: string;
  balance_total: string;
  billing_invoice_id?: number | null;
  billing_invoice_no?: string | null;
  billing_invoice_status?: string | null;
};

export type CashierPendingDirectSalesResponse = {
  customer_id?: number | null;
  customer_name?: string;
  phone?: string;
  total_outstanding_sales: number;
  total_outstanding_amount: string;
  direct_sales: CashierCollectibleDirectSale[];
};

export type CashierDirectSaleSearchResponse = {
  count: number;
  results: CashierCollectibleDirectSale[];
};

export type CashierCollectDirectSalePayload = {
  direct_sale_id: number;
  amount: number;
  branch_id?: number;
  cash_counter_id?: number;
  finance_account_id?: number;
  reference_no?: string;
  note?: string;
};

export type CashierCollectDirectSaleResponse = {
  message: string;
  created: boolean;
  receipt: {
    id: number;
    receipt_no?: string | null;
    receipt_type?: string | null;
    status?: string | null;
    receipt_date?: string | null;
    amount: string;
    finance_account_id?: number | null;
    branch_id?: number | null;
    cash_counter_id?: number | null;
    source_reference?: string | null;
  };
  direct_sale: {
    id: number;
    sale_no?: string | null;
    status?: string | null;
    grand_total: string;
    received_total: string;
    balance_total: string;
    branch_id?: number | null;
    cash_counter_id?: number | null;
    finance_account_id?: number | null;
  };
  invoice: {
    id: number;
    document_no?: string | null;
    status?: string | null;
    received_total: string;
    balance_total: string;
  };
  outstanding_before: string;
  outstanding_after: string;
};

export type CashierPaymentHistoryResponse = {
  count: number;
  results: CashierTransaction[];
};

export type CashierPaymentDetailResponse = {
  payment: CashierTransaction;
  status_label: string;
};

export type { FinanceAccount };

function buildQuery(
  params: Record<string, string | number | undefined | null> = {}
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

function toMoneyString(value: unknown): string {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00";
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asNullableString(value: unknown): string | null | undefined {
  if (typeof value === "string") return value;
  if (value === null) return null;
  return undefined;
}

function toBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeCanonicalDashboardSummary(
  payload: Record<string, unknown>
): CanonicalDashboardSummary {
  return {
    subscription_count: toNumber(payload.subscription_count, 0),
    active_subscriptions: toNumber(payload.active_subscriptions, 0),
    completed_subscriptions: toNumber(payload.completed_subscriptions, 0),
    winner_subscriptions: toNumber(payload.winner_subscriptions, 0),
    pending_emis: toNumber(payload.pending_emis, 0),
    upcoming_emis: toNumber(payload.upcoming_emis, 0),
    overdue_emis: toNumber(payload.overdue_emis, 0),
    paid_emis: toNumber(payload.paid_emis, 0),
    waived_emis: toNumber(payload.waived_emis, 0),
    total_paid_amount: toMoneyString(payload.total_paid_amount),
    total_pending_amount: toMoneyString(payload.total_pending_amount),
    total_waived_amount: toMoneyString(payload.total_waived_amount),
    remaining_amount: toMoneyString(payload.remaining_amount),
    outstanding_amount: toMoneyString(payload.outstanding_amount),
    overdue_amount: toMoneyString(payload.overdue_amount),
    upcoming_amount: toMoneyString(payload.upcoming_amount),
    next_due_amount:
      payload.next_due_amount === null || payload.next_due_amount === undefined
        ? null
        : toMoneyString(payload.next_due_amount),
    next_due_date: asNullableString(payload.next_due_date) ?? null,
    next_due_is_overdue: toBoolean(payload.next_due_is_overdue, false),
    next_due_subscription_id:
      payload.next_due_subscription_id === null ||
      payload.next_due_subscription_id === undefined
        ? null
        : toNumber(payload.next_due_subscription_id),
    next_due_subscription_number:
      asNullableString(payload.next_due_subscription_number) ?? null,
    next_due_product_name: asNullableString(payload.next_due_product_name) ?? null,
    next_due_lucky_number:
      payload.next_due_lucky_number === null ||
      payload.next_due_lucky_number === undefined
        ? null
        : toNumber(payload.next_due_lucky_number),
    has_payment_adjustments: toBoolean(payload.has_payment_adjustments, false),
  };
}

function normalizeWinnerSurface(input: unknown): DashboardWinnerSurface | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }

  const row = input as Record<string, unknown>;
  return {
    winner_subscriptions: toNumber(row.winner_subscriptions, 0),
    waived_emis: toNumber(row.waived_emis, 0),
    total_waived_amount: toMoneyString(row.total_waived_amount),
    note: typeof row.note === "string" ? row.note : "",
  };
}

function normalizeReconciliationSurface(
  input: unknown
): DashboardReconciliationSurface | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }

  const row = input as Record<string, unknown>;
  const rawResults = Array.isArray(row.results) ? row.results : [];

  return {
    checked_count: toNumber(row.checked_count, 0),
    flagged_count: toNumber(row.flagged_count, 0),
    results: rawResults.map((item) => {
      const result = (item ?? {}) as Record<string, unknown>;
      return {
        subscription_id: toNumber(result.subscription_id, 0),
        subscription_number:
          typeof result.subscription_number === "string"
            ? result.subscription_number
            : "",
        customer_name:
          typeof result.customer_name === "string"
            ? result.customer_name
            : undefined,
        total_amount: toMoneyString(result.total_amount),
        paid_amount: toMoneyString(result.paid_amount),
        waived_amount: toMoneyString(result.waived_amount),
        pending_outstanding: toMoneyString(result.pending_outstanding),
        computed_outstanding: toMoneyString(result.computed_outstanding),
        delta: toMoneyString(result.delta),
      };
    }),
    note: typeof row.note === "string" ? row.note : undefined,
  };
}

function normalizeDueSubscription(item: unknown): DashboardDueSubscription {
  const row = (item ?? {}) as Record<string, unknown>;

  return {
    id: row.id !== undefined && row.id !== null ? String(row.id) : "",
    subscription_id:
      row.subscription_id !== undefined && row.subscription_id !== null
        ? String(row.subscription_id)
        : undefined,
    subscription_number:
      typeof row.subscription_number === "string"
        ? row.subscription_number
        : undefined,
    customer_id:
      row.customer_id !== undefined && row.customer_id !== null
        ? String(row.customer_id)
        : undefined,
    customer_name:
      typeof row.customer_name === "string" ? row.customer_name : undefined,
    customer_phone:
      typeof row.customer_phone === "string" ? row.customer_phone : undefined,
    product_name:
      typeof row.product_name === "string" ? row.product_name : undefined,
    batch_code: asNullableString(row.batch_code),
    lucky_number:
      typeof row.lucky_number === "number"
        ? row.lucky_number
        : typeof row.lucky_number === "string"
        ? row.lucky_number
        : undefined,
    due_date: asNullableString(row.due_date),
    monthly_amount:
      row.monthly_amount === null || row.monthly_amount === undefined
        ? undefined
        : toMoneyString(row.monthly_amount),
    pending_amount:
      row.pending_amount === null || row.pending_amount === undefined
        ? undefined
        : toMoneyString(row.pending_amount),
    overdue_days: toNumber(row.overdue_days, 0),
    is_overdue: toBoolean(row.is_overdue, false),
    emi_id:
      row.emi_id === null || row.emi_id === undefined
        ? null
        : toNumber(row.emi_id),
    month_no:
      row.month_no === null || row.month_no === undefined
        ? null
        : toNumber(row.month_no),
  };
}

function normalizeTransaction(row: Record<string, unknown>): CashierTransaction {
  const subscriptionId =
    typeof row.subscription_id === "number"
      ? row.subscription_id
      : typeof row.subscription === "number"
      ? row.subscription
      : null;

  const emiId =
    typeof row.emi_id === "number"
      ? row.emi_id
      : typeof row.emi === "number"
      ? row.emi
      : null;

  return {
    id: toNumber(row.id),
    amount: toMoneyString(row.amount),
    branch_id:
      typeof row.branch_id === "number" ? row.branch_id : undefined,
    cash_counter_id:
      typeof row.cash_counter_id === "number" ? row.cash_counter_id : undefined,
    payment_date: typeof row.payment_date === "string" ? row.payment_date : undefined,
    created_at: typeof row.created_at === "string" ? row.created_at : undefined,
    method: typeof row.method === "string" ? row.method : undefined,
    reference_no: asNullableString(row.reference_no),
    customer:
      typeof row.customer_id === "number"
        ? row.customer_id
        : typeof row.customer === "number"
        ? row.customer
        : undefined,
    customer_name:
      typeof row.customer_name === "string" ? row.customer_name : undefined,
    customer_phone:
      typeof row.customer_phone === "string" ? row.customer_phone : undefined,
    subscription: subscriptionId ?? undefined,
    subscription_number:
      subscriptionId !== null ? `SUB-${subscriptionId}` : undefined,
    emi: emiId ?? undefined,
    emi_month_no:
      typeof row.emi_month_no === "number" ? row.emi_month_no : undefined,
    batch_code: asNullableString(row.batch_code),
    lucky_number:
      typeof row.lucky_number === "number" ? row.lucky_number : undefined,
    collected_by:
      typeof row.collected_by_id === "number"
        ? row.collected_by_id
        : typeof row.collected_by === "number"
        ? row.collected_by
        : undefined,
    collected_by_username:
      typeof row.collected_by_username === "string"
        ? row.collected_by_username
        : undefined,
    allocation_metadata:
      row.allocation_metadata && typeof row.allocation_metadata === "object"
        ? (row.allocation_metadata as Record<string, unknown>)
        : null,
    is_reversed: Boolean(row.is_reversed),
    reversal_metadata:
      row.reversal_metadata && typeof row.reversal_metadata === "object"
        ? (row.reversal_metadata as Record<string, unknown>)
        : null,
    subscription_status: asNullableString(row.subscription_status),
    subscription_plan_type: asNullableString(row.subscription_plan_type),
    emi_due_date: asNullableString(row.emi_due_date),
    emi_amount: asNullableString(row.emi_amount),
    emi_status: asNullableString(row.emi_status),
  };
}

function normalizePendingEmi(row: Record<string, unknown>): PendingEmiRecord {
  return {
    id: toNumber(row.id),
    subscription: toNumber(row.subscription),
    customer: typeof row.customer === "number" ? row.customer : undefined,
    customer_name:
      typeof row.customer_name === "string" ? row.customer_name : undefined,
    customer_phone:
      typeof row.customer_phone === "string" ? row.customer_phone : undefined,
    subscription_status:
      typeof row.subscription_status === "string"
        ? row.subscription_status
        : undefined,
    batch: typeof row.batch === "number" ? row.batch : null,
    batch_code: asNullableString(row.batch_code) ?? null,
    lucky_id: typeof row.lucky_id === "number" ? row.lucky_id : null,
    lucky_number:
      typeof row.lucky_number === "number" ? row.lucky_number : null,
    month_no: toNumber(row.month_no),
    due_date: typeof row.due_date === "string" ? row.due_date : "",
    amount: toMoneyString(row.amount),
    status: typeof row.status === "string" ? row.status : "PENDING",
    total_paid:
      typeof row.total_paid === "string" ? row.total_paid : undefined,
    balance_amount:
      typeof row.balance_amount === "string" ? row.balance_amount : undefined,
    is_overdue:
      typeof row.is_overdue === "boolean" ? row.is_overdue : undefined,
    overdue_days:
      typeof row.overdue_days === "number" ? row.overdue_days : undefined,
  };
}

function normalizeCollectibleSearchResult(
  row: Record<string, unknown>
): CashierCollectibleSearchResult {
  return {
    emi_id:
      typeof row.emi_id === "number"
        ? row.emi_id
        : toNumber(row.id),
    customer_id:
      typeof row.customer_id === "number" ? row.customer_id : undefined,
    customer_name:
      typeof row.customer_name === "string" ? row.customer_name : undefined,
    customer_phone:
      typeof row.customer_phone === "string" ? row.customer_phone : undefined,
    subscription_id:
      typeof row.subscription_id === "number" ? row.subscription_id : undefined,
    subscription_number:
      typeof row.subscription_number === "string"
        ? row.subscription_number
        : undefined,
    contract_reference: asNullableString(row.contract_reference),
    batch_id: typeof row.batch_id === "number" ? row.batch_id : undefined,
    batch_code: asNullableString(row.batch_code),
    lucky_id: typeof row.lucky_id === "number" ? row.lucky_id : undefined,
    lucky_number:
      typeof row.lucky_number === "number" ? row.lucky_number : undefined,
    month_no: typeof row.month_no === "number" ? row.month_no : undefined,
    due_date: asNullableString(row.due_date),
    amount: toMoneyString(row.amount),
    balance_amount: toMoneyString(row.balance_amount),
    status: typeof row.status === "string" ? row.status : undefined,
  };
}

function normalizeCashierDirectSale(
  row: Record<string, unknown>
): CashierCollectibleDirectSale {
  return {
    direct_sale_id: toNumber(row.direct_sale_id ?? row.id),
    sale_no: asNullableString(row.sale_no),
    sale_date: asNullableString(row.sale_date),
    status: asNullableString(row.status),
    customer_id:
      typeof row.customer_id === "number" ? row.customer_id : null,
    customer_name:
      typeof row.customer_name === "string" ? row.customer_name : undefined,
    customer_phone:
      typeof row.customer_phone === "string" ? row.customer_phone : undefined,
    branch_id: typeof row.branch_id === "number" ? row.branch_id : null,
    branch_code: asNullableString(row.branch_code),
    branch_name: asNullableString(row.branch_name),
    cash_counter_id:
      typeof row.cash_counter_id === "number" ? row.cash_counter_id : null,
    cash_counter_code: asNullableString(row.cash_counter_code),
    cash_counter_name: asNullableString(row.cash_counter_name),
    finance_account_id:
      typeof row.finance_account_id === "number" ? row.finance_account_id : null,
    finance_account_name: asNullableString(row.finance_account_name),
    grand_total: toMoneyString(row.grand_total),
    received_total: toMoneyString(row.received_total),
    balance_total: toMoneyString(row.balance_total),
    billing_invoice_id:
      typeof row.billing_invoice_id === "number" ? row.billing_invoice_id : null,
    billing_invoice_no: asNullableString(row.billing_invoice_no),
    billing_invoice_status: asNullableString(row.billing_invoice_status),
  };
}

export async function getCashierDashboard(): Promise<CashierDashboardResponse> {
  const payload = await apiFetch<Record<string, unknown>>("/cashier/dashboard/");
  const rawSummary =
    payload.summary && typeof payload.summary === "object"
      ? (payload.summary as Record<string, unknown>)
      : {};

  const rawTransactions = Array.isArray(payload.today_transactions)
    ? payload.today_transactions
    : [];

  return {
    summary: normalizeCanonicalDashboardSummary(rawSummary),
    winner_surface: normalizeWinnerSurface(payload.winner_surface),
    reconciliation: normalizeReconciliationSurface(payload.reconciliation),
    due_subscriptions: Array.isArray(payload.due_subscriptions)
      ? payload.due_subscriptions.map(normalizeDueSubscription)
      : [],
    total_pending_emis: toNumber(payload.total_pending_emis),
    total_pending_amount: toMoneyString(payload.total_pending_amount),
    today_total_collected: toMoneyString(payload.today_total_collected),
    today_transaction_count: toNumber(payload.today_transaction_count),
    today_cash_total: toMoneyString(payload.today_cash_total),
    today_digital_total: toMoneyString(payload.today_digital_total),
    today_transactions: rawTransactions.map((item) =>
      normalizeTransaction(item as Record<string, unknown>)
    ),
  };
}

export async function getPendingEmisByPhone(
  phone: string
): Promise<PendingEmiLookupResponse> {
  const payload = await apiFetch<Record<string, unknown>>(
    `/cashier/pending-emis/?phone=${encodeURIComponent(phone)}`
  );

  const rawEmis = Array.isArray(payload.emis) ? payload.emis : [];

  return {
    customer_id: toNumber(payload.customer_id),
    customer_name:
      typeof payload.customer_name === "string" ? payload.customer_name : "",
    phone: typeof payload.phone === "string" ? payload.phone : phone,
    total_pending_emis: toNumber(payload.total_pending_emis ?? rawEmis.length),
    total_pending_amount: toMoneyString(payload.total_pending_amount),
    overdue_emi_count: toNumber(payload.overdue_emi_count),
    overdue_amount: toMoneyString(payload.overdue_amount),
    next_due_emi_id:
      typeof payload.next_due_emi_id === "number"
        ? payload.next_due_emi_id
        : null,
    next_due_date: asNullableString(payload.next_due_date) ?? null,
    next_due_amount: asNullableString(payload.next_due_amount) ?? null,
    emis: rawEmis.map((item) =>
      normalizePendingEmi(item as Record<string, unknown>)
    ),
  };
}

export async function listCashierFinanceAccounts(
  params: Record<string, string | number | undefined | null> = {}
): Promise<AccountingPaginatedResponse<FinanceAccount>> {
  return apiFetch<AccountingPaginatedResponse<FinanceAccount>>(
    `/cashier/finance-accounts/${buildQuery(params)}`
  );
}

export async function searchCashierCollectibleEmis(
  query: string,
  mode: CashierCollectibleSearchMode
): Promise<CashierCollectibleSearchResponse> {
  const payload = await apiFetch<Record<string, unknown>>(
    `/cashier/search-emis/?q=${encodeURIComponent(query)}&mode=${encodeURIComponent(mode)}`
  );

  const rawResults = Array.isArray(payload.results) ? payload.results : [];

  return {
    count: toNumber(payload.count ?? rawResults.length),
    results: rawResults.map((item) =>
      normalizeCollectibleSearchResult(item as Record<string, unknown>)
    ),
  };
}

export async function getPendingDirectSalesByPhone(
  phone: string
): Promise<CashierPendingDirectSalesResponse> {
  const payload = await apiFetch<Record<string, unknown>>(
    `/cashier/pending-direct-sales/?phone=${encodeURIComponent(phone)}`
  );

  const rawRows = Array.isArray(payload.direct_sales) ? payload.direct_sales : [];

  return {
    customer_id:
      typeof payload.customer_id === "number" ? payload.customer_id : null,
    customer_name:
      typeof payload.customer_name === "string" ? payload.customer_name : undefined,
    phone: typeof payload.phone === "string" ? payload.phone : undefined,
    total_outstanding_sales: toNumber(payload.total_outstanding_sales ?? rawRows.length),
    total_outstanding_amount: toMoneyString(payload.total_outstanding_amount),
    direct_sales: rawRows.map((item) =>
      normalizeCashierDirectSale(item as Record<string, unknown>)
    ),
  };
}

export async function searchCashierCollectibleDirectSales(
  query: string,
  mode: CashierDirectSaleSearchMode
): Promise<CashierDirectSaleSearchResponse> {
  const payload = await apiFetch<Record<string, unknown>>(
    `/cashier/search-direct-sales/?q=${encodeURIComponent(query)}&mode=${encodeURIComponent(mode)}`
  );

  const rawRows = Array.isArray(payload.results) ? payload.results : [];

  return {
    count: toNumber(payload.count ?? rawRows.length),
    results: rawRows.map((item) =>
      normalizeCashierDirectSale(item as Record<string, unknown>)
    ),
  };
}

export async function collectPayment(
  payload: CashierCollectPaymentPayload
): Promise<CashierCollectPaymentResponse> {
  return apiFetch<CashierCollectPaymentResponse>("/cashier/collect-payment/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function collectAdvance(
  payload: CashierCollectAdvancePayload
): Promise<CashierCollectAdvanceResponse> {
  return apiFetch<CashierCollectAdvanceResponse>("/cashier/collect-advance/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function collectDirectSalePayment(
  payload: CashierCollectDirectSalePayload
): Promise<CashierCollectDirectSaleResponse> {
  return apiFetch<CashierCollectDirectSaleResponse>("/cashier/collect-direct-sale/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getCashierPaymentHistory(params?: {
  q?: string;
  limit?: number;
}): Promise<CashierPaymentHistoryResponse> {
  const search = new URLSearchParams();
  if (params?.q?.trim()) search.set("q", params.q.trim());
  if (params?.limit) search.set("limit", String(params.limit));

  const queryString = search.toString();
  const payload = await apiFetch<Record<string, unknown>>(
    queryString ? `/cashier/payments/?${queryString}` : "/cashier/payments/"
  );

  const rawResults = Array.isArray(payload.results) ? payload.results : [];

  return {
    count: toNumber(payload.count ?? rawResults.length),
    results: rawResults.map((item) =>
      normalizeTransaction(item as Record<string, unknown>)
    ),
  };
}

export async function getCashierPaymentDetail(
  paymentId: number
): Promise<CashierPaymentDetailResponse> {
  const payload = await apiFetch<Record<string, unknown>>(
    `/cashier/payments/${paymentId}/`
  );

  const rawPayment =
    payload.payment && typeof payload.payment === "object"
      ? (payload.payment as Record<string, unknown>)
      : {};

  const payment = normalizeTransaction(rawPayment);

  return {
    payment: {
      ...payment,
      status_label:
        typeof payload.status_label === "string"
          ? payload.status_label
          : payment.is_reversed
            ? "REVERSED"
            : "POSTED",
    },
    status_label:
      typeof payload.status_label === "string"
        ? payload.status_label
        : payment.is_reversed
          ? "REVERSED"
          : "POSTED",
  };
}
