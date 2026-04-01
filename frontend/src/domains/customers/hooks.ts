"use client";

import { useEffect, useState } from "react";

import { listCustomers } from "@/domains/customers/api";
import type { Customer } from "@/domains/customers/types";

export function useCustomers() {
  const [rows, setRows] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listCustomers()
      .then((res) => {
        if (!cancelled) setRows(res);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load customers");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { rows, loading, error };
}
