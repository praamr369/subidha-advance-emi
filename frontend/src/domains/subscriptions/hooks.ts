import { useCallback, useEffect, useMemo, useState } from "react";

import {
  fetchAvailableLuckyIds,
  fetchSubscriptionDetailData,
  fetchSubscriptionListData,
} from "@/domains/subscriptions/api";
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
} from "@/domains/subscriptions/types";
import { parseApiError } from "@/domains/subscriptions/utils";

export function useSubscriptionListData() {
  const [subscriptions, setSubscriptions] = useState<AdminSubscription[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchSubscriptionListData()
      .then((data) => {
        if (cancelled) return;
        setSubscriptions(data.subscriptions);
        setCustomers(data.customers);
        setProducts(data.products);
        setBatches(data.batches);
        setPartners(data.partners);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(parseApiError(e));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const prependSubscription = useCallback((subscription: AdminSubscription) => {
    setSubscriptions((prev) => [subscription, ...prev]);
  }, []);

  return {
    subscriptions,
    prependSubscription,
    customers,
    products,
    batches,
    partners,
    loading,
    error,
  };
}

export function useAvailableLuckyIds(batchId: string) {
  const [availableLuckyIds, setAvailableLuckyIds] = useState<LuckyId[]>([]);

  useEffect(() => {
    let cancelled = false;

    if (!batchId) return;

    fetchAvailableLuckyIds(batchId)
      .then((res) => {
        if (cancelled) return;
        setAvailableLuckyIds(res);
      })
      .catch(() => {
        if (cancelled) return;
        setAvailableLuckyIds([]);
      });

    return () => {
      cancelled = true;
    };
  }, [batchId]);

  const visibleLuckyIds = useMemo(() => (batchId ? availableLuckyIds : []), [availableLuckyIds, batchId]);

  return { availableLuckyIds: visibleLuckyIds };
}

export function useSubscriptionDetailData(id: string) {
  const [subscription, setSubscription] = useState<SubscriptionDetail | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [luckyIds, setLuckyIds] = useState<LuckyId[]>([]);
  const [emis, setEmis] = useState<Emi[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const data = await fetchSubscriptionDetailData(id);

        if (cancelled) return;

        setSubscription(data.subscription);
        setCustomers(data.customers);
        setProducts(data.products);
        setBatches(data.batches);
        setPartners(data.partners);
        setLuckyIds(data.luckyIds);
        setEmis(data.emis);
        setPayments(data.payments);
      } catch (e) {
        if (cancelled) return;
        setError(parseApiError(e));
      } finally {
        if (cancelled) return;
        setLoading(false);
      }
    }

    if (id) {
      load();
    } else {
      setLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [id]);

  return { subscription, customers, products, batches, partners, luckyIds, emis, payments, loading, error };
}
