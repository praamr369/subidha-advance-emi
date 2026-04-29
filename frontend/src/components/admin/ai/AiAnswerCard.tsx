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

  return (
    <Card variant="bordered" title="Answer">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={confidenceTone(response.confidence)} label={`Confidence ${response.confidence}`} />
          <StatusBadge status="ACTIVE" label={response.retrievalMode} />
        </div>
        <div className="rounded-2xl border border-border bg-[var(--surface-card-elevated)] p-4">
          <p className="whitespace-pre-line text-sm leading-7 text-foreground">{response.answer}</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-[var(--surface-muted)] px-3 py-2 text-xs text-muted-foreground">
            Permission filtered: {response.safety.permissionFiltered ? "Yes" : "No"}
          </div>
          <div className="rounded-xl border border-border bg-[var(--surface-muted)] px-3 py-2 text-xs text-muted-foreground">
            Source grounded: {response.safety.sourceGrounded ? "Yes" : "No"}
          </div>
          <div className="rounded-xl border border-border bg-[var(--surface-muted)] px-3 py-2 text-xs text-muted-foreground">
            Financial action request: {response.safety.actionableFinancialInstruction ? "Refused" : "No"}
          </div>
        </div>
        <div className="flex items-start gap-2 rounded-2xl border border-sky-200 bg-sky-50/70 px-3 py-2 text-xs leading-5 text-sky-950">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Responses are limited to retrieved excerpts and cannot execute workflows.</span>
        </div>
      </div>
    </Card>
  );
}
