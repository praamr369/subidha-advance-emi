"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import PortalPage from "@/components/ui/PortalPage";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ErrorState from "@/components/feedback/ErrorState";
import { getResource } from "@/services/admin";

type Props = {
  title: string;
  subtitle: string;
  resourcePath: string;
};

export default function EnterpriseDetailPage({ title, subtitle, resourcePath }: Props) {
  const params = useParams<{ id: string }>();
  const id = String(params?.id || "");
  const [record, setRecord] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!id) return;

    getResource<Record<string, unknown>>(resourcePath, id)
      .then((res) => {
        if (cancelled) return;
        setRecord(res);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load record");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, resourcePath]);

  return (
    <PortalPage title={title} subtitle={subtitle}>
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {loading ? <LoadingBlock label="Loading detail..." /> : null}
        {!id ? <ErrorState title="Missing record id" description="Record identifier was not provided." /> : null}
        {error ? <ErrorState title="Failed to load detail" description={error} /> : null}

        {!loading && !error && record ? (
          <dl className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {Object.entries(record).map(([key, value]) => (
              <div key={key} className="rounded-md border border-slate-100 p-3">
                <dt className="text-xs uppercase tracking-wide text-slate-500">{key}</dt>
                <dd className="mt-1 text-sm text-slate-900">{String(value ?? "-")}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </section>
    </PortalPage>
  );
}
