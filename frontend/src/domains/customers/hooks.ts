"use client";

import { useEffect, useState } from "react";

import { listCustomerRows } from "@/domains/customers/api";
import type { Customer } from "@/domains/customers/types";

export function useCustomerRows() {
  const [rows, setRows] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listCustomerRows()
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

/**
 * Backward-compatible alias. Prefer useCustomerRows() for this flat-array hook.
 */
export const useCustomers = useCustomerRows;
