export type AdminDashboardApiResponse = {
  kpis?: {
    active_subscriptions?: number;
    emi_due_today_count?: number;
    overdue_count?: number;
    open_batches?: number;
    collections_this_month?: string;
    reconciliation_exceptions?: number;
  };
  overdue_alerts?: Array<{
    id: number | string;
    customer_name?: string;
    subscription_id?: number | string;
    overdue_amount?: string;
    overdue_months?: number;
  }>;
  recent_payments?: Array<{
    id: number | string;
    customer_name?: string;
    amount?: string;
    payment_date?: string;
    payment_method?: string;
  }>;
  draw_schedule?: Array<{
    id: number | string;
    batch_code?: string;
    draw_date?: string;
    status?: string;
  }>;
  batch_fill_rates?: Array<{
    id: number | string;
    batch_code?: string;
    filled_slots?: number;
    total_slots?: number;
  }>;
  reconciliation_warnings?: Array<{
    id: number | string;
    subscription_id?: number | string;
    issue?: string;
    severity?: string;
  }>;
  financial?: {
    total_revenue?: number | string;
    today_collection?: number | string;
    total_outstanding?: number | string;
  };
  emi?: {
    pending?: number;
    overdue?: number;
  };
  subscriptions?: {
    active?: number;
    completed?: number;
    won?: number;
  };
  batches?: {
    total_batches?: number;
    total_draws?: number;
  };
  risk?: {
    healthy?: number;
    at_risk?: number;
    high_risk?: number;
    defaulted?: number;
    default_rate?: number;
  };
  financial_health?: Record<string, unknown>;
};

export type WorkflowMetric = {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning" | "danger" | "info";
  helpText?: string;
};

export type WorkflowTask = {
  id: string;
  title: string;
  description: string;
  href: string;
  tone?: "default" | "success" | "warning" | "danger" | "info";
  stat?: string;
};

export type WorkflowModule = {
  id: string;
  title: string;
  description: string;
  href: string;
  owner: string;
  health: "healthy" | "attention" | "critical";
  primaryMetric: string;
  supportingMetric: string;
  actions: Array<{
    label: string;
    href: string;
  }>;
};
