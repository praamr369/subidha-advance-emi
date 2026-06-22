export type AdminDashboardResponse = {
  financial: {
    total_revenue: string;
    today_collection: string;
    total_outstanding: string;
  };
  summary: {
    subscription_count: number;
    active_subscriptions: number;
    completed_subscriptions: number;
    winner_subscriptions: number;
    pending_emis: number;
    upcoming_emis: number;
    overdue_emis: number;
    paid_emis: number;
    waived_emis: number;
    total_paid_amount: string;
    total_pending_amount: string;
    total_waived_amount: string;
    remaining_amount: string;
    outstanding_amount: string;
    overdue_amount: string;
    upcoming_amount: string;
  };
  emi: {
    pending: number;
    overdue: number;
  };
  subscriptions: {
    active: number;
    completed: number;
    won: number;
  };
  portfolio_mix: {
    emi: number;
    rent: number;
    lease: number;
  };
  batches: {
    total_batches: number;
    total_draws: number;
    live_batches: number;
    open_batches: number;
    next_draw_batch: {
      id: number;
      batch_code: string;
      status: string;
      draw_day: number;
      draw_date: string;
      days_until_draw: number;
      subscription_count: number;
      total_slots: number;
      available_slots: number;
    } | null;
  };
  collections: {
    today_transaction_count: number;
    today_active_transaction_count: number;
    today_reversed_transaction_count: number;
    today_active_payments: string;
    today_reversed_payments: string;
    today_gross_amount: string;
    today_reversed_amount: string;
    today_net_amount: string;
  };
  subscription_kpis: {
    total_customers: number;
    total_subscriptions: number;
    defaulted_subscriptions: number;
    total_contract_value: string;
    total_monthly_value: string;
    total_waived_value: string;
  };
  commission_summary: {
    total_commission: string;
    pending_commission: string;
    settled_commission: string;
    reversed_commission: string;
    total_count: number;
    pending_count: number;
    settled_count: number;
    reversed_count: number;
  };
  recent_activity: RecentActivityItem[];
  operations: Record<string, unknown>;
  risk: {
    healthy: number;
    at_risk: number;
    high_risk: number;
    defaulted: number;
    default_rate: number;
  };
  financial_health: Record<string, unknown>;
  winner_surface?: {
    winner_subscriptions: number;
    waived_emis: number;
    total_waived_amount: string;
    note: string;
  };
  reconciliation?: {
    checked_count: number;
    flagged_count: number;
    results: ReconciliationRow[];
    note?: string;
  };
  due_subscriptions: DueSubscriptionRow[];
  crm: {
    lead_pipeline: Record<string, number>;
    open_leads: number;
  };
};

export type RecentActivityItem = {
  kind: string;
  payment_id: number;
  amount: string;
  payment_date: string | null;
  created_at: string | null;
  method: string | null;
  reference_no: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  subscription_id: number | null;
  subscription_number: string | null;
  batch_code: string | null;
  lucky_number: number | null;
  is_reversed: boolean;
};

export type ReconciliationRow = {
  subscription_id: number;
  subscription_number: string;
  customer_name?: string;
  total_amount?: string;
  paid_amount?: string;
  waived_amount?: string;
  pending_outstanding?: string;
  computed_outstanding?: string;
  delta?: string;
};

export type DueSubscriptionRow = {
  id: number | string;
  subscription_id?: number | string;
  subscription_number?: string;
  customer_name?: string;
  customer_phone?: string;
  product_name?: string;
  batch_code?: string | null;
  lucky_number?: number | string | null;
  due_date?: string | null;
  monthly_amount?: string;
  pending_amount?: string;
  overdue_days?: number;
  is_overdue?: boolean;
};
