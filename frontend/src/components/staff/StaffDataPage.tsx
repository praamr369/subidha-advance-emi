"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

import ActionButton from "@/components/ui/ActionButton";

type StaffDataPageProps<T> = {
  title: string;
  description: string;
  load: () => Promise<T>;
  render: (data: T) => ReactNode;
  empty?: (data: T) => boolean;
  emptyMessage?: string;
};

export default function StaffDataPage<T>({ title, description, load, render, empty, emptyMessage }: StaffDataPageProps<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await load());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load staff data.");
    } finally {
      setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const isEmpty = data ? Boolean(empty?.(data)) : false;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
          <ActionButton variant="secondary" onClick={() => void refresh()} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </ActionButton>
        </div>
      </section>

      {loading ? (
        <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-sm">Loading...</div>
      ) : null}

      {!loading && error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-900 shadow-sm">{error}</div>
      ) : null}

      {!loading && !error && data && isEmpty ? (
        <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-sm">
          {emptyMessage || "No records available."}
        </div>
      ) : null}

      {!loading && !error && data && !isEmpty ? render(data) : null}
    </div>
  );
}
