import { apiFetch } from "@/lib/api";

export type ChartPayload = {
  labels?: string[];
  series?: Array<{ name?: string; data?: Array<string | number> }>;
  totals?: Record<string, unknown>;
  meta?: {
    source?: string;
    date_from?: string | null;
    date_to?: string | null;
    empty_reason?: string | null;
    ignored_filters?: string[];
  };
};

export type BiSummary = {
  as_of: string;
  sources: Array<{ key: string; path: string }>;
  finance: {
    collection_trend: ChartPayload;
    due_vs_collected: ChartPayload;
    overdue_aging: ChartPayload;
    payment_method_split: ChartPayload;
    waiver_loss_exposure: { waived_count: number; waived_amount: string };
    deposit_liability: { held_total: string; deposit_rows: unknown[] };
    revenue_breakdown: {
      advance_emi: unknown;
      rent: unknown;
      lease: unknown;
      direct_sale: unknown;
    };
  };
  subscriptions: {
    product_demand: ChartPayload;
    erp_snapshot: {
      today_work: Array<unknown>;
      sales_pipeline: Array<unknown>;
      operations_pipeline: Array<unknown>;
    };
  };
  inventory: {
    product_demand: ChartPayload;
  };
  operations: {
    queue_summary: { count: number; results: unknown[] };
  };
  hr: {
    active_staff: number;
    today_present: number;
    today_absent: number;
    pending_leave_requests: number;
    pending_expense_claims: number;
    payroll_periods_active: number;
    salary_payments_pending: number;
  };
};

export type BiInsightMoneySummary = Record<string, string | number | null>;

export type BiProfitability = {
  summary: {
    emi_revenue: string;
    emi_waived_amount: string;
    direct_sale_revenue: string;
    rent_income: string;
    lease_income: string;
    deposit_liabilities: string;
    salary_cost: string;
    gross_income: string;
    operating_margin: string;
  };
  monthly_profit_summary: Array<{
    month: string;
    income: string;
    waived_amount: string;
    salary_cost: string;
    operating_margin: string;
  }>;
  basis_note: string;
  sources: string[];
};

export type BiCustomerInsights = {
  summary: {
    total_customers: number;
    active_customers: number;
    inactive_customers: number;
    high_overdue_customers: number;
    repeat_customers: number;
    churn_risk_customers: number;
  };
  high_overdue_customers: Array<{
    customer_id: number;
    name: string;
    phone: string;
    overdue_count: number;
    overdue_amount: string;
  }>;
  repeat_customers: Array<{
    customer_id: number;
    name: string;
    phone: string;
    relationship_count: number;
    subscription_count: number;
    direct_sale_count: number;
  }>;
  churn_risk: Array<{
    customer_id: number;
    name: string;
    phone: string;
    overdue_count: number;
    overdue_amount: string;
    last_payment_date: string | null;
    reason: string;
  }>;
  sources: string[];
};

export type BiBatchPerformance = {
  summary: {
    batch_count: number;
    average_fill_rate: string;
    high_risk_batches: number;
  };
  rows: Array<{
    batch_id: number;
    batch_code: string;
    status: string;
    total_slots: number;
    sold_slots: number;
    subscription_count: number;
    fill_rate: string;
    due_emi_count: number;
    paid_emi_count: number;
    overdue_emi_count: number;
    payment_discipline: string;
    default_rate: string;
    draws_completed: number;
    draw_completion: string;
    risk_level: "LOW" | "MEDIUM" | "HIGH";
  }>;
  sources: string[];
};

export type BiCashflow = {
  summary: {
    daily_inflow: string;
    window_inflow: string;
    expected_inflow: string;
    overdue_exposure: string;
  };
  daily_trend: Array<{ date: string; inflow: string }>;
  expected_breakdown: {
    pending_emi: string;
    rent_lease_outstanding: string;
    direct_sale_balance: string;
  };
  sources: string[];
};

export type BiInventoryIntelligence = {
  summary: {
    fast_moving_count: number;
    slow_moving_count: number;
    stock_risk_count: number;
  };
  fast_moving_items: Array<{
    item_id: number;
    product_code: string;
    product_name: string;
    moved_out_qty: string;
  }>;
  slow_moving_items: Array<{
    item_id: number;
    product_id: number;
    product_code: string;
    product_name: string;
    sku: string;
    on_hand_qty: string;
    reorder_level_qty: string;
    moved_out_qty: string;
  }>;
  stock_risk: Array<{
    item_id: number;
    product_code: string;
    product_name: string;
    on_hand_qty: string;
    reorder_level_qty: string;
    reason: string;
  }>;
  sources: string[];
};

export type BiHrCosts = {
  summary: {
    salary_cost: string;
    revenue: string;
    salary_vs_revenue_ratio: string | null;
    active_staff: number;
  };
  cost_per_department: Array<{ department: string; cost: string; employee_count: number }>;
  employment_type_split: {
    temporary_cost: string;
    permanent_cost: string;
  };
  sources: string[];
};

export type BiInsightsPayload = {
  as_of: string;
  window: {
    date_from: string;
    date_to: string;
    previous_date_from: string;
    previous_date_to: string;
    ignored_filters: string[];
  };
  safety: {
    read_only: boolean;
    financial_mutation_enabled: boolean;
    ai_automation_enabled: boolean;
  };
  profitability: BiProfitability;
  customer_insights: BiCustomerInsights;
  batch_performance: BiBatchPerformance;
  cashflow: BiCashflow;
  inventory_intelligence: BiInventoryIntelligence;
  hr_costs: BiHrCosts;
  comparisons: {
    actual_inflow: { current: string; previous: string; delta: string };
    overdue_exposure: { current: string };
  };
};

export async function getAdminBiSummary(): Promise<BiSummary> {
  return apiFetch("/admin/bi/summary/");
}

export async function getAdminBiInsights(): Promise<BiInsightsPayload> {
  return apiFetch("/admin/bi/insights/");
}

export async function getAdminBiProfitability(): Promise<BiProfitability> {
  return apiFetch("/admin/bi/profitability/");
}

export async function getAdminBiCustomerInsights(): Promise<BiCustomerInsights> {
  return apiFetch("/admin/bi/customer-insights/");
}

export async function getAdminBiBatchPerformance(): Promise<BiBatchPerformance> {
  return apiFetch("/admin/bi/batch-performance/");
}

export async function getAdminBiCashflow(): Promise<BiCashflow> {
  return apiFetch("/admin/bi/cashflow/");
}

export async function getAdminBiInventoryIntelligence(): Promise<BiInventoryIntelligence> {
  return apiFetch("/admin/bi/inventory-intelligence/");
}

export async function getAdminBiHrCosts(): Promise<BiHrCosts> {
  return apiFetch("/admin/bi/hr-costs/");
}
