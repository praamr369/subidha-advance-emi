import { authFetch } from "@/services/api-client";

export type CollectionQueueItem = {
  id: number;
  customerId: number;
  customerName: string;
  subscriptionId: number;
  subscriptionCode?: string | null;
  batchName?: string | null;
  luckyId?: string | null;
  installmentNo?: number | null;
  amountDue: number;
  penaltyAmount?: number | null;
  payableNow: number;
  overdueDays?: number | null;
  riskLevel?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | null;
  status: string;
};

export type RecentCollectionItem = {
  id: number;
  customerName: string;
  subscriptionId: number;
  amount: number;
  paymentReference: string;
  paidAt: string;
};

export async function getDueTodayCollections(): Promise<CollectionQueueItem[]> {
  return authFetch("/admin/collections/due-today");
}

export async function getOverdueCollections(): Promise<CollectionQueueItem[]> {
  return authFetch("/admin/collections/overdue");
}

export async function getRecentCollections(): Promise<RecentCollectionItem[]> {
  return authFetch("/admin/collections/recent");
}