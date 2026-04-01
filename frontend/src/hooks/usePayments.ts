"use client";

import { useEffect, useState } from "react";

import { toArray } from "@/lib/api";
import { listPayments } from "@/services/payments";

type Payment = {
  id: number;
  subscription: number;
  amount: string;
  method: string;
  payment_date: string;
};

export function usePayments() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    listPayments()
      .then((payload) => {
        if (cancelled) return;
        setPayments(toArray<Payment>(payload));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load payments");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { payments, loading, error };
}
