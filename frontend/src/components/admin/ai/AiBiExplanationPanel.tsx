"use client";

import Link from "next/link";
import { useState } from "react";

import AiSafetyBanner from "@/components/admin/ai/AiSafetyBanner";
import ErrorState from "@/components/feedback/ErrorState";
import ActionButton from "@/components/ui/ActionButton";
import Card from "@/components/ui/card";
import StatusBadge from "@/components/ui/status-badge";
import {
  explainBI,
  isAiDisabledError,
  type BiExplainScope,
  type BiExplainTopic,
  type BiExplainWindow,
  type BiExplanationResponse,
} from "@/services/admin-ai";

const SCOPES: BiExplainScope[] = [
  "ADMIN_BI",
  "ADMIN_DASHBOARD",
  "BI_CONTROL_CENTER",
  "FINANCE",
  "INVENTORY",
  "DELIVERY",
  "HR",
  "SUBSCRIPTIONS",
  "CRM",
  "PARTNER",
  "PROFITABILITY",
  "CUSTOMER_INSIGHTS",
  "BATCH_PERFORMANCE",
  "CASHFLOW",
  "INVENTORY_INTELLIGENCE",
  "HR_COSTS",
];

const WINDOWS: BiExplainWindow[] = ["TODAY", "THIS_WEEK", "THIS_MONTH", "LAST_MONTH"];
const TOPICS: BiExplainTopic[] = ["SUMMARY", "REVENUE_DROP", "OVERDUE_INCREASE", "RISKY_BATCH"];

export default function AiBiExplanationPanel() {
  const [scope, setScope] = useState<BiExplainScope>("ADMIN_BI");
  const [window, setWindow] = useState<BiExplainWindow>("THIS_MONTH");
  const [topic, setTopic] = useState<BiExplainTopic>("SUMMARY");
  const [loading, setLoading] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<BiExplanationResponse | null>(null);

  const runExplain = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await explainBI(scope, window, topic);
      setPayload(data);
      setDisabled(false);
    } catch (err) {
      if (isAiDisabledError(err)) {
        setDisabled(true);
        setPayload(null);
        setError(null);
      } else {
        setError(err instanceof Error ? err.message : "BI explanation is unavailable.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="ai-explanation" className="flex flex-col gap-4">
      <AiSafetyBanner disabled={disabled} />
      {error ? <ErrorState title="BI explanation unavailable" description={error} /> : null}
      <Card variant="bordered" title="AI Explanation">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Scope
            <select
              value={scope}
              onChange={(event) => setScope(event.target.value as BiExplainScope)}
              disabled={loading || disabled}
              className="h-11 rounded-xl border border-border bg-transparent px-3 text-sm font-medium text-foreground outline-none"
            >
              {SCOPES.map((option) => (
                <option key={option} value={option}>
                  {option.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Window
            <select
              value={window}
              onChange={(event) => setWindow(event.target.value as BiExplainWindow)}
              disabled={loading || disabled}
              className="h-11 rounded-xl border border-border bg-transparent px-3 text-sm font-medium text-foreground outline-none"
            >
              {WINDOWS.map((option) => (
                <option key={option} value={option}>
                  {option.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Topic
            <select
              value={topic}
              onChange={(event) => setTopic(event.target.value as BiExplainTopic)}
              disabled={loading || disabled}
              className="h-11 rounded-xl border border-border bg-transparent px-3 text-sm font-medium text-foreground outline-none"
            >
              {TOPICS.map((option) => (
                <option key={option} value={option}>
                  {option.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <ActionButton variant="primary" loading={loading} disabled={disabled} onClick={() => void runExplain()}>
              Explain BI
            </ActionButton>
          </div>
        </div>
      </Card>

      {disabled ? (
        <Card variant="bordered" title="AI assistant is disabled">
          <p className="text-sm text-muted-foreground">BI explanation is unavailable until AI assistant is enabled.</p>
        </Card>
      ) : null}

      {payload ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card variant="bordered" title="Summary">
            <p className="text-sm leading-6 text-foreground">{payload.summary}</p>
            <p className="mt-2 text-xs text-muted-foreground">Generated: {payload.generatedAt || "Not available"}</p>
          </Card>

          <Card variant="bordered" title="Safety">
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={payload.safety.readOnly ? "ACTIVE" : "LOW"} label={`Read only: ${payload.safety.readOnly ? "Yes" : "No"}`} />
              <StatusBadge
                status={!payload.safety.actionsExecuted ? "ACTIVE" : "LOW"}
                label={`Actions executed: ${payload.safety.actionsExecuted ? "Yes" : "No"}`}
              />
              <StatusBadge
                status={!payload.safety.financialActionsEnabled ? "ACTIVE" : "LOW"}
                label={`Financial actions: ${payload.safety.financialActionsEnabled ? "Enabled" : "Disabled"}`}
              />
              <StatusBadge
                status={!payload.safety.automationEnabled ? "ACTIVE" : "LOW"}
                label={`Automation: ${payload.safety.automationEnabled ? "Enabled" : "Disabled"}`}
              />
            </div>
          </Card>

          <Card variant="bordered" title="Highlights">
            <div className="flex flex-col gap-2">
              {payload.highlights.map((row, idx) => (
                <div key={`${row.label}-${idx}`} className="rounded-xl border border-border bg-[var(--surface-card-elevated)] p-3">
                  <p className="text-sm font-semibold text-foreground">{row.label}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{row.message}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card variant="bordered" title="Risks">
            <div className="flex flex-col gap-2">
              {payload.risks.map((row, idx) => (
                <div key={`${row.label}-${idx}`} className="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
                  <p className="text-sm font-semibold text-amber-900">{row.label}</p>
                  <p className="mt-1 text-sm text-amber-900/90">{row.message}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card variant="bordered" title="Follow-up areas">
            <div className="flex flex-col gap-2">
              {payload.followUp.map((row, idx) => (
                <Link
                  key={`${row.label}-${idx}`}
                  href={row.href}
                  className="rounded-xl border border-border bg-[var(--surface-card-elevated)] px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-muted/50"
                >
                  {row.label}
                </Link>
              ))}
            </div>
          </Card>

          <Card variant="bordered" title="Source metrics">
            <div className="flex flex-col gap-2">
              {payload.sourceMetrics.map((row) => (
                <div key={row.key} className="rounded-xl border border-border bg-[var(--surface-card-elevated)] p-3">
                  <p className="text-sm font-semibold text-foreground">{row.label}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Value: {String(row.value)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Source: {row.source}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : null}
    </section>
  );
}
