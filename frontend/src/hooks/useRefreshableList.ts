"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Manages a fetchable list where:
 * - First load shows a full loading state (initialLoading=true, items=[])
 * - Subsequent refreshes keep old items visible and show a subtle refreshing=true flag
 *
 * This prevents the table from unmounting on refresh, which caused:
 *   1. Scroll position jumping to top
 *   2. Laggy flash of "Loading..." after every action
 *
 * Usage:
 *   const { items, initialLoading, refreshing, reload } = useRefreshableList(listFn);
 */
export function useRefreshableList<T>(
  fetcher: () => Promise<T[]>,
  deps: unknown[] = []
) {
  const [items, setItems] = useState<T[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);

  const reload = useCallback(
    async (isInitial = false) => {
      if (isInitial) {
        setInitialLoading(true);
      } else {
        setRefreshing(true);
      }
      try {
        const data = await fetcher();
        setItems(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setInitialLoading(false);
        setRefreshing(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps
  );

  useEffect(() => {
    const isFirstMount = !mounted.current;
    mounted.current = true;
    reload(isFirstMount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);

  return { items, setItems, initialLoading, refreshing, error, reload };
}
