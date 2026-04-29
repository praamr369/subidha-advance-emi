"use client";

import { useEffect, useState } from "react";

import AiSafetyBanner from "@/components/admin/ai/AiSafetyBanner";
import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import StatusBadge from "@/components/ui/status-badge";
import Table from "@/components/ui/table";
import { ROUTES } from "@/lib/routes";
import { getQueryLogs, isAiDisabledError, type AiQueryLog } from "@/services/admin-ai";

function formatDate(value: string): string {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function shortText(value: string, limit = 120): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= limit) return compact;
  return `${compact.slice(0, limit - 1).trim()}...`;
}

export default function AdminAiQueryLogPage() {
  const [rows, setRows] = useState<AiQueryLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRows = async () => {
    setLoading(true);
    setError(null);
    try {
      const nextRows = await getQueryLogs();
      setRows(nextRows);
      setDisabled(false);
    } catch (err) {
      if (isAiDisabledError(err)) {
        setDisabled(true);
        setRows([]);
      } else {
        setError(err instanceof Error ? err.message : "AI query log could not be loaded.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRows();
  }, []);

  return (
    <PortalPage
      eyebrow="AI Assistant"
      title="AI Query Log"
      subtitle="Read-only audit trail for internal assistant questions and source-grounded responses."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "AI Assistant", href: ROUTES.admin.aiAssistant },
        { label: "Query Log" },
      ]}
      actions={[
        { href: ROUTES.admin.aiAssistant, label: "Assistant", variant: "secondary" },
        { href: ROUTES.admin.aiSources, label: "Sources", variant: "secondary" },
      ]}
      statusBadge={{ label: "Read Only", tone: "warning" }}
      maxWidth="1180px"
    >
      <div className="flex flex-col gap-5">
        <AiSafetyBanner disabled={disabled} />
        {loading ? <LoadingBlock label="Loading AI query log..." /> : null}
        {error ? <ErrorState title="Query log unavailable" description={error} onRetry={() => void loadRows()} /> : null}
        {!loading && !disabled && rows.length === 0 ? (
          <EmptyState title="No AI queries logged" description="Query history appears after admins ask the assistant a question." />
        ) : null}
        {!loading && !disabled && rows.length > 0 ? (
          <Table
            head={
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Query</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">User</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Created</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Mode</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Result</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Feedback</th>
              </tr>
            }
            body={
              <>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-b-0">
                    <td className="max-w-xs px-4 py-3 text-sm font-semibold text-foreground">{shortText(row.query, 90)}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{row.userDisplay}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{formatDate(row.createdAt)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status="ACTIVE" label={row.retrievalMode} />
                    </td>
                    <td className="max-w-sm px-4 py-3 text-sm text-muted-foreground">
                      {row.deniedReason ? row.deniedReason.replaceAll("_", " ") : shortText(row.answerPreview)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        status={row.feedbackStatus ? "ACTIVE" : "PENDING"}
                        label={row.feedbackStatus ? row.feedbackStatus.replaceAll("_", " ") : "Not captured"}
                      />
                    </td>
                  </tr>
                ))}
              </>
            }
          />
        ) : null}
      </div>
    </PortalPage>
  );
}
