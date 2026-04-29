"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import AiSafetyBanner from "@/components/admin/ai/AiSafetyBanner";
import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ActionButton from "@/components/ui/ActionButton";
import Card from "@/components/ui/card";
import PortalPage from "@/components/ui/PortalPage";
import StatusBadge from "@/components/ui/status-badge";
import { ROUTES } from "@/lib/routes";
import {
  getSource,
  getSourceChunks,
  ingestSource,
  isAiDisabledError,
  type AiKnowledgeChunk,
  type AiKnowledgeSource,
} from "@/services/admin-ai";

function formatDate(value: string): string {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function AdminAiSourceDetailPage() {
  const params = useParams<{ id: string }>();
  const sourceId = useMemo(() => Number(params?.id ?? 0), [params?.id]);
  const [source, setSource] = useState<AiKnowledgeSource | null>(null);
  const [chunks, setChunks] = useState<AiKnowledgeChunk[]>([]);
  const [loading, setLoading] = useState(true);
  const [ingesting, setIngesting] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [nextSource, nextChunks] = await Promise.all([
          getSource(sourceId),
          getSourceChunks(sourceId),
        ]);
        if (!active) return;
        setSource(nextSource);
        setChunks(nextChunks);
        setDisabled(false);
      } catch (err) {
        if (!active) return;
        if (isAiDisabledError(err)) {
          setDisabled(true);
        } else {
          setError(err instanceof Error ? err.message : "AI source could not be loaded.");
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    if (sourceId > 0) void load();
    return () => {
      active = false;
    };
  }, [sourceId]);

  const runIngestion = async () => {
    if (!sourceId || ingesting) return;
    setIngesting(true);
    setError(null);
    try {
      await ingestSource(sourceId);
      const [nextSource, nextChunks] = await Promise.all([getSource(sourceId), getSourceChunks(sourceId)]);
      setSource(nextSource);
      setChunks(nextChunks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Re-ingestion failed.");
    } finally {
      setIngesting(false);
    }
  };

  return (
    <PortalPage
      eyebrow="AI Assistant"
      title={source?.title || "AI Source"}
      subtitle="Source metadata and chunk previews for citation review."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "AI Assistant", href: ROUTES.admin.aiAssistant },
        { label: "Sources", href: ROUTES.admin.aiSources },
        { label: "Source" },
      ]}
      actions={[
        { href: ROUTES.admin.aiSources, label: "All Sources", variant: "secondary" },
        { href: ROUTES.admin.aiAssistant, label: "Assistant", variant: "secondary" },
        { href: ROUTES.admin.aiReadiness, label: "AI Readiness", variant: "secondary" },
      ]}
      statusBadge={{ label: "Read Only", tone: "warning" }}
      maxWidth="1080px"
    >
      <div className="flex flex-col gap-5">
        <AiSafetyBanner disabled={disabled} />
        {loading ? <LoadingBlock label="Loading source chunks..." /> : null}
        {error ? <ErrorState title="Source unavailable" description={error} /> : null}
        {!loading && source ? (
          <Card variant="bordered" title="Source metadata">
            <div className="mb-3 flex justify-end">
              <ActionButton variant="secondary" loading={ingesting} onClick={() => void runIngestion()}>
                Re-ingest source
              </ActionButton>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-border bg-[var(--surface-muted)] p-3">
                <div className="text-xs text-muted-foreground">Type</div>
                <div className="mt-1 text-sm font-semibold">{source.sourceType.replaceAll("_", " ")}</div>
              </div>
              <div className="rounded-xl border border-border bg-[var(--surface-muted)] p-3">
                <div className="text-xs text-muted-foreground">Status</div>
                <div className="mt-1">
                  <StatusBadge status={source.status} label={source.status.replaceAll("_", " ")} />
                </div>
              </div>
              <div className="rounded-xl border border-border bg-[var(--surface-muted)] p-3">
                <div className="text-xs text-muted-foreground">Visibility</div>
                <div className="mt-1 text-sm font-semibold">{source.visibility.replaceAll("_", " ")}</div>
              </div>
              <div className="rounded-xl border border-border bg-[var(--surface-muted)] p-3">
                <div className="text-xs text-muted-foreground">Updated</div>
                <div className="mt-1 text-sm font-semibold">{formatDate(source.updatedAt)}</div>
              </div>
              <div className="rounded-xl border border-border bg-[var(--surface-muted)] p-3">
                <div className="text-xs text-muted-foreground">Chunk count</div>
                <div className="mt-1 text-sm font-semibold">{chunks.length}</div>
              </div>
              <div className="rounded-xl border border-border bg-[var(--surface-muted)] p-3">
                <div className="text-xs text-muted-foreground">Embedding status</div>
                <div className="mt-1 text-sm font-semibold">{source.embeddingStatus.replaceAll("_", " ")}</div>
              </div>
              <div className="rounded-xl border border-border bg-[var(--surface-muted)] p-3">
                <div className="text-xs text-muted-foreground">Checksum / Version</div>
                <div className="mt-1 text-sm font-semibold">{source.checksum || "N/A"} / {source.version}</div>
              </div>
            </div>
            <div className="mt-3 rounded-xl border border-border bg-[var(--surface-card-elevated)] p-3">
              <div className="text-xs text-muted-foreground">Last ingestion metadata</div>
              <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-foreground">
                {JSON.stringify(source.metadata || {}, null, 2)}
              </pre>
            </div>
          </Card>
        ) : null}

        {!loading && !disabled && chunks.length === 0 ? (
          <EmptyState title="No chunks" description="Ingest this source from the source manager to create retrievable chunks." />
        ) : null}

        {chunks.length > 0 ? (
          <Card variant="bordered" title="Chunk previews">
            <div className="flex flex-col gap-3">
              {chunks.map((chunk) => (
                <article key={chunk.id} className="rounded-2xl border border-border bg-[var(--surface-card-elevated)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{chunk.heading || "Source excerpt"}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Chunk {chunk.chunkIndex + 1} • Approx. tokens {chunk.tokenCount}
                      </p>
                    </div>
                    <StatusBadge status={chunk.visibility} label={chunk.visibility.replaceAll("_", " ")} />
                  </div>
                  <p className="mt-3 line-clamp-5 text-sm leading-6 text-muted-foreground">{chunk.contentPreview}</p>
                </article>
              ))}
            </div>
          </Card>
        ) : null}
      </div>
    </PortalPage>
  );
}
