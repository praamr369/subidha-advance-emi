import { request } from "@/services/api";
import { listBatches } from "@/services/batches";
import {
  listCustomers,
  searchCustomers as searchCustomersByDomain,
} from "@/services/customers";
import { listAvailableLuckyIds } from "@/services/draws";
import { listProducts } from "@/services/products";
import {
  listSubscriptions,
  getSubscription,
  type SubscriptionRecord,
} from "@/services/subscriptions";

import type {
  AdminSubscription,
  Batch,
  Customer,
  Emi,
  LuckyId,
  Partner,
  Payment,
  Product,
  SubscriptionDetail,
} from "./types";

export async function fetchSubscriptionListData(): Promise<{
  subscriptions: AdminSubscription[];
  customers: Customer[];
  products: Product[];
  batches: Batch[];
  partners: Partner[];
}> {
  const [subscriptionPage, customerPage, products, batches, partnerRes] =
    await Promise.all([
      listSubscriptions(),
      listCustomers(),
      listProducts(),
      listBatches(),
      request<Partner[] | { results?: Partner[] }>("/admin/partners/"),
    ]);

  const partners = Array.isArray(partnerRes)
    ? partnerRes
    : partnerRes.results || [];

  return {
    subscriptions: (subscriptionPage.results || []) as AdminSubscription[],
    customers: Array.isArray(customerPage.results)
      ? (customerPage.results as Customer[])
      : [],
    products: products as Product[],
    batches: batches as Batch[],
    partners,
  };
}

export async function fetchAvailableLuckyIds(batchId: string): Promise<LuckyId[]> {
  if (!batchId) return [];
  return (await listAvailableLuckyIds(batchId)) as LuckyId[];
}

export async function searchCustomers(query: string): Promise<Customer[]> {
  return (await searchCustomersByDomain(query)) as Customer[];
}

export async function createSubscription(
  payload: Record<string, unknown>
): Promise<AdminSubscription> {
  return request("/admin/subscriptions/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchSubscriptionDetailData(id: string): Promise<{
  subscription: SubscriptionDetail;
  customers: Customer[];
  products: Product[];
  batches: Batch[];
  partners: Partner[];
  luckyIds: LuckyId[];
  emis: Emi[];
  payments: Payment[];
}> {
  const [
    subscription,
    customerPage,
    products,
    batches,
    partnerRes,
    luckyIds,
    emiRes,
    paymentRes,
  ] = await Promise.all([
    getSubscription(id) as Promise<SubscriptionRecord>,
    listCustomers(),
    listProducts(),
    listBatches(),
    request<Partner[] | { results?: Partner[] }>("/admin/partners/"),
    request<LuckyId[] | { results?: LuckyId[] }>("/admin/lucky-ids/"),
    request<Emi[] | { results?: Emi[] }>(
      `/admin/emis/?subscription=${encodeURIComponent(id)}`
    ),
    request<Payment[] | { results?: Payment[] }>(
      `/admin/payments/?subscription=${encodeURIComponent(id)}`
    ),
  ]);

  const partners = Array.isArray(partnerRes)
    ? partnerRes
    : partnerRes.results || [];
  const lucky = Array.isArray(luckyIds) ? luckyIds : luckyIds.results || [];
  const emis = Array.isArray(emiRes) ? emiRes : emiRes.results || [];
  const payments = Array.isArray(paymentRes)
    ? paymentRes
    : paymentRes.results || [];

  return {
    subscription: subscription as SubscriptionDetail,
    customers: Array.isArray(customerPage.results)
      ? (customerPage.results as Customer[])
      : [],
    products: products as Product[],
    batches: batches as Batch[],
    partners,
    luckyIds: lucky,
    emis,
    payments,
  };
}