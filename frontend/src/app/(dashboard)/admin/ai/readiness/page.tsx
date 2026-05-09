"use client";

import { useEffect, useState } from "react";

import AiSafetyBanner from "@/components/admin/ai/AiSafetyBanner";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import Card from "@/components/ui/card";
import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";
import { getAiReadiness, isAiDisabledError, type AiReadinessResponse } from "@/services/admin-ai";

export default function AdminAiReadinessPage() {
  const [payload, setPayload] = useState<AiReadinessResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getAiReadiness();
        if (!active) return;
        setPayload(data);
        setDisabled(false);
      } catch (err) {
        if (!active) return;
        if (isAiDisabledError(err)) {
          setDisabled(true);
          setPayload(null);
        } else {
          setError(err instanceof Error ? err.message : "AI readiness is unavailable.");
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <PortalPage
      eyebrow="AI Assistant"
      title="AI Readiness"
      subtitle="Read-only operational readiness checks for safe AI assistant usage."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "AI Assistant", href: ROUTES.admin.aiAssistant },
        { label: "AI Readiness" },
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
        {loading ? <LoadingBlock label="Loading AI readiness..." /> : null}
        {error ? <ErrorState title="AI readiness unavailable" description={error} /> : null}
        {disabled ? (
          <Card variant="bordered" title="AI assistant is disabled">
            <p className="text-sm text-muted-foreground">Readiness checks are available after AI assistant is enabled.</p>
          </Card>
        ) : null}

        {!loading && payload ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <Card variant="bordered" title="Feature Flags">
              <p className="text-sm text-muted-foreground">AI Assistant: {payload.featureFlags.aiAssistantEnabled ? "Enabled" : "Disabled"}</p>
              <p className="text-sm text-muted-foreground">Embeddings: {payload.featureFlags.embeddingsEnabled ? "Enabled" : "Disabled"}</p>
              <p className="text-sm text-muted-foreground">Vector Search: {payload.featureFlags.vectorSearchEnabled ? "Enabled" : "Disabled"}</p>
            </Card>
            <Card variant="bordered" title="Knowledge Base Health">
              <p className="text-sm text-muted-foreground">Sources total: {payload.knowledgeBase.sourcesTotal}</p>
              <p className="text-sm text-muted-foreground">Sources active: {payload.knowledgeBase.sourcesActive}</p>
              <p className="text-sm text-muted-foreground">Chunks total: {payload.knowledgeBase.chunksTotal}</p>
              <p className="text-sm text-muted-foreground">Embedded chunks: {payload.knowledgeBase.embeddedChunks}</p>
              <p className="text-sm text-muted-foreground">Failed sources: {payload.knowledgeBase.failedSources}</p>
            </Card>
            <Card variant="bordered" title="Retrieval Health">
              <p className="text-sm text-muted-foreground">Default mode: {payload.retrieval.defaultMode}</p>
              <p className="text-sm text-muted-foreground">Vector available: {payload.retrieval.vectorAvailable ? "Yes" : "No"}</p>
              <p className="text-sm text-muted-foreground">Fallback enabled: {payload.retrieval.fallbackEnabled ? "Yes" : "No"}</p>
            </Card>
            <Card variant="bordered" title="Safety Status">
              <p className="text-sm text-muted-foreground">Read only: {payload.safety.readOnly ? "Yes" : "No"}</p>
              <p className="text-sm text-muted-foreground">
                Financial actions enabled: {payload.safety.financialActionsEnabled ? "Yes" : "No"}
              </p>
              <p className="text-sm text-muted-foreground">
                Customer/private ingestion enabled: {payload.safety.customerPrivateIngestionEnabled ? "Yes" : "No"}
              </p>
            </Card>
            <Card variant="bordered" title="Last Activity">
              <p className="text-sm text-muted-foreground">Last source: {payload.lastActivity.lastSourceTitle || "N/A"}</p>
              <p className="text-sm text-muted-foreground">Last ingestion status: {payload.lastActivity.lastIngestionStatus || "N/A"}</p>
              <p className="text-sm text-muted-foreground">Query logs: {payload.lastActivity.queryLogsCount}</p>
              <p className="text-sm text-muted-foreground">Feedback rows: {payload.lastActivity.feedbackCount}</p>
              <p className="text-sm text-muted-foreground">
                Unsafe/blocked ingestion count: {payload.lastActivity.unsafeBlockedIngestionCount}
              </p>
            </Card>
            <Card variant="bordered" title="Recommended Next Steps">
              <div className="flex flex-col gap-2">
                {(payload.recommendations.length ? payload.recommendations : ["No action required."]).map((row, index) => (
                  <p key={`rec-${index}`} className="text-sm text-muted-foreground">
                    - {row}
                  </p>
                ))}
              </div>
            </Card>
          </div>
        ) : null}
      </div>
    </PortalPage>
  );
}

