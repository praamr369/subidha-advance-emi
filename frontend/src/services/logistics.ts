import { apiFetch } from "@/lib/api";

export type LogisticsCockpit = {
  generated_at: string;
  deliveries_today: Array<{
    id: number;
    type: "SUBSCRIPTION" | "DIRECT_SALE";
    customer_name: string;
    customer_phone?: string;
    address?: string;
    product_name?: string;
    subscription_number?: string;
    case_no?: string;
    status: string;
    scheduled_date?: string | null;
    is_overdue?: boolean;
  }>;
  deliveries_today_count: number;
  stock_alerts: Array<{
    item_id: number;
    product_id: number;
    product_name: string;
    sku?: string;
    on_hand_qty: string;
    available_qty: string;
    reorder_level_qty: string;
    is_below_reorder: boolean;
    default_stock_location_name?: string | null;
  }>;
  stock_alerts_count: number;
  returns_in_flight: Array<{
    id: number;
    case_no: string;
    case_type: string;
    customer_name: string;
    status: string;
    stock_status: string;
    finance_status: string;
  }>;
  returns_in_flight_count: number;
};

export function fetchLogisticsCockpit(): Promise<LogisticsCockpit> {
  return apiFetch<LogisticsCockpit>("/admin/logistics/cockpit/");
}
