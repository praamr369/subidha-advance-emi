import { apiFetch } from "@/lib/api";

export interface FunnelAnalytics {
  period_days: number;
  funnel: {
    leads_created: number;
    leads_contacted: number;
    leads_contacted_pct: number;
    requests_created: number;
    requests_quoted: number;
    requests_quoted_pct: number;
    requests_accepted: number;
    requests_accepted_pct: number;
    requests_approved: number;
    requests_approved_pct: number;
    subscriptions_created: number;
    direct_sales_created: number;
    total_conversions: number;
    conversion_rate_lead_to_sale: number;
  };
  date_range: {
    start: string;
    end: string;
  };
}

export interface ProductPerformance {
  product_id: number;
  product_name: string;
  requests_count: number;
  approved_count: number;
  conversion_rate: number;
  avg_quoted_price: number;
  total_quoted_amount: number;
  revenue_from_subscriptions: number;
  revenue_from_sales: number;
  total_revenue: number;
}

export interface TimelineAnalytics {
  daily_leads: Array<{ date: string; count: number }>;
  daily_requests: Array<{ date: string; count: number }>;
  daily_approvals: Array<{ date: string; count: number }>;
  daily_subscriptions: Array<{ date: string; count: number }>;
  daily_sales: Array<{ date: string; count: number }>;
  date_range: {
    start: string;
    end: string;
  };
}

export interface RequestTypeAnalytics {
  [key: string]: {
    requests_count: number;
    approved_count: number;
    conversion_rate: number;
    total_amount: number;
    avg_amount: number;
  };
}

export async function getFunnelAnalytics(days: number = 30): Promise<FunnelAnalytics> {
  return apiFetch(`/api/v1/admin/crm/analytics/funnel/?days=${days}`);
}

export async function getProductPerformance(days: number = 30): Promise<{ products: ProductPerformance[] }> {
  return apiFetch(`/api/v1/admin/crm/analytics/products/?days=${days}`);
}

export async function getTimelineAnalytics(days: number = 30): Promise<TimelineAnalytics> {
  return apiFetch(`/api/v1/admin/crm/analytics/timeline/?days=${days}`);
}

export async function getRequestTypeAnalytics(days: number = 30): Promise<{ by_type: RequestTypeAnalytics }> {
  return apiFetch(`/api/v1/admin/crm/analytics/by-type/?days=${days}`);
}

export async function getAnalyticsSummary(days: number = 30) {
  return apiFetch(`/api/v1/admin/crm/analytics/summary/?days=${days}`);
}
