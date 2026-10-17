import { ShieldCheck } from "lucide-react";

import Card from "@/components/ui/card";
import StatusBadge from "@/components/ui/status-badge";
import type { AiQueryResponse } from "@/services/admin-ai";

type AiAnswerCardProps = {
  response: AiQueryResponse | null;
};

function confidenceTone(confidence: AiQueryResponse["confidence"]) {
  if (confidence === "HIGH") return "ACTIVE";
  if (confidence === "MEDIUM") return "PENDING";
  return "LOW";
}

export default function AiAnswerCard({ response }: AiAnswerCardProps) {
  if (!response) {
    return (
      <Card variant="bordered" title="Answer">
        <p className="text-sm leading-6 text-muted-foreground">
          Ask a question to search approved internal knowledge sources.
        </p>
      </Card>
    );
  }

  const isN8n = response.retrievalMode === "N8N_AI_AGENT" || response.engine === "n8n_ai";

  return (
    <Card variant="bordered" title="Answer">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {isN8n ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 dark:bg-violet-950/60 px-2.5 py-0.5 text-xs font-semibold text-violet-700 dark:text-violet-300">
              ⚡ n8n AI Agent
            </span>
          ) : null}
          <StatusBadge status={confidenceTone(response.confidence)} label={`Confidence ${response.confidence}`} />
          <StatusBadge status="ACTIVE" label={response.retrievalMode} />
          {response.citations.length > 0 && (
            <StatusBadge status="ACTIVE" label={`Citations ${response.citations.length}`} />
          )}
        </div>
        {response.degraded ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-900">
            Degraded to {response.retrievalMode}: {response.degradedReason || "Fallback applied"}
          </div>
        ) : null}
        {response.retrievalMode === "KEYWORD" ? (
          <div className="rounded-xl border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            Keyword only retrieval is active.
          </div>
        ) : null}
        <div className="rounded-xl border border-border bg-[var(--surface-card-elevated)] p-4">
          <p className="whitespace-pre-line text-sm leading-7 text-foreground">{response.answer}</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            Permission filtered: {response.safety.permissionFiltered ? "Yes" : "No"}
          </div>
          <div className="rounded-xl border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            Source grounded: {response.safety.sourceGrounded ? "Yes" : "No"}
          </div>
          <div className="rounded-xl border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            Financial action request: {response.safety.actionableFinancialInstruction ? "Refused" : "No"}
          </div>
        </div>
        <div className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50/70 px-3 py-2 text-xs leading-5 text-sky-950 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
          <span>
            {isN8n
              ? "Grounded reasoning powered by n8n AI. Read-only analysis protecting financial integrity."
              : "Responses are limited to retrieved excerpts and cannot execute workflows."}
          </span>
        </div>
      </div>
    </Card>
  );
}
