import { apiFetch } from "@/lib/api";

export type ErpCard = {
  key: string;
  label: string;
  count: number;
  value?: string | null;
  severity: "LOW" | "MEDIUM" | "HIGH" | string;
  source: string;
  deep_link: string;
  empty_state?: string | null;
};

export type ErpSummary = {
  as_of: string;
  today_work: ErpCard[];
  business_health: ErpCard[];
  crm_pipeline: ErpCard[];
  sales_pipeline: ErpCard[];
  operations_pipeline: ErpCard[];
  charts?: {
    monthly_collection_and_requests?: Array<{
      month: string;
      collections: string;
      requests: number;
    }>;
    kpi_snapshot?: Record<string, number>;
  };
  quick_actions: Array<{ label: string; href: string }>;
};

export type WorkspacePayload = {
  as_of: string;
  cards: ErpCard[];
};

export type CrmWorkspacePayload = {
  as_of: string;
  crm_pipeline: ErpCard[];
  today_work: ErpCard[];
  customer_360: Array<{
    customer_id: number;
    name: string;
    phone: string;
    kyc_status: string;
    subscription_count: number;
    payment_count: number;
    delivery_count: number;
    support_count: number;
    partner_link?: number | null;
    risk_status: string;
    deep_link: string;
  }>;
};

export type AdminGlobalSearchResult = {
  type: string;
  title: string;
  subtitle: string;
  status: string;
  deep_link: string;
};

export async function getAdminErpSummary(): Promise<ErpSummary> {
  return apiFetch<ErpSummary>("/admin/erp/summary/");
}

export async function getAdminTodayWork(): Promise<{ as_of: string; results: ErpCard[]; quick_actions: Array<{ label: string; href: string }> }> {
  return apiFetch("/admin/erp/today-work/");
}

export async function getAdminCrmWorkspace(): Promise<CrmWorkspacePayload> {
  return apiFetch<CrmWorkspacePayload>("/admin/crm/workspace/");
}

export async function getAdminSalesWorkspace(): Promise<WorkspacePayload> {
  return apiFetch<WorkspacePayload>("/admin/sales/workspace/");
}

export async function getAdminProductWorkspace(): Promise<WorkspacePayload> {
  return apiFetch<WorkspacePayload>("/admin/product-operations/workspace/");
}

export async function getAdminInventoryWorkspace(): Promise<WorkspacePayload> {
  return apiFetch<WorkspacePayload>("/admin/inventory/workspace/");
}

export async function getAdminFinanceWorkspace(): Promise<WorkspacePayload> {
  return apiFetch<WorkspacePayload>("/admin/finance/workspace/");
}

export async function getAdminDeliveryWorkspace(): Promise<WorkspacePayload> {
  return apiFetch<WorkspacePayload>("/admin/delivery/workspace/");
}

export async function getAdminPartnerWorkspace(): Promise<WorkspacePayload> {
  return apiFetch<WorkspacePayload>("/admin/partner-operations/workspace/");
}

export async function searchAdminGlobal(query: string): Promise<{ count: number; results: AdminGlobalSearchResult[] }> {
  const encoded = encodeURIComponent(query);
  return apiFetch<{ count: number; results: AdminGlobalSearchResult[] }>(`/admin/global-search/?q=${encoded}`);
}
