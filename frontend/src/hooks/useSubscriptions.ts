"use client";

import { useEffect, useState } from "react";

import type { AdminSubscription } from "@/domains/subscriptions/types";
import { toArray } from "@/lib/api";
import { listSubscriptions } from "@/services/subscriptions";

export function useSubscriptions() {
  const [subscriptions, setSubscriptions] = useState<AdminSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    listSubscriptions()
      .then((payload) => {
        if (cancelled) return;
        setSubscriptions(toArray<AdminSubscription>(payload));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load subscriptions");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { subscriptions, loading, error };
}
