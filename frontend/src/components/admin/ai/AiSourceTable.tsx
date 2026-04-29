"use client";

import Link from "next/link";
import { Eye, RefreshCw } from "lucide-react";

import ActionButton from "@/components/ui/ActionButton";
import StatusBadge from "@/components/ui/status-badge";
import Table from "@/components/ui/table";
import type { AiKnowledgeSource } from "@/services/admin-ai";

type AiSourceTableProps = {
  sources: AiKnowledgeSource[];
  ingestingId?: number | null;
  onIngest: (source: AiKnowledgeSource) => void;
};

function formatDate(value: string): string {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function AiSourceTable({ sources, ingestingId = null, onIngest }: AiSourceTableProps) {
  return (
    <Table
      head={
        <tr>
          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Title</th>
          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Type</th>
          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Status</th>
          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Embedding</th>
          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Updated</th>
          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Actions</th>
        </tr>
      }
      body={
        <>
          {sources.map((source) => (
            <tr key={source.id} className="border-b border-border last:border-b-0">
              <td className="px-4 py-3">
                <div className="font-semibold text-foreground">{source.title}</div>
                <div className="mt-1 text-xs text-muted-foreground">{source.visibility}</div>
              </td>
              <td className="px-4 py-3 text-sm text-muted-foreground">{source.sourceType.replaceAll("_", " ")}</td>
              <td className="px-4 py-3">
                <StatusBadge status={source.status} label={source.status.replaceAll("_", " ")} />
              </td>
              <td className="px-4 py-3 text-sm text-muted-foreground">{source.embeddingStatus.replaceAll("_", " ")}</td>
              <td className="px-4 py-3 text-sm text-muted-foreground">{formatDate(source.updatedAt)}</td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap justify-end gap-2">
                  <Link
                    href={`/admin/ai/sources/${source.id}`}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-border bg-[var(--surface-card-elevated)] px-3 text-xs font-semibold text-foreground transition hover:bg-[var(--surface-muted)]"
                  >
                    <Eye className="h-4 w-4" />
                    View chunks
                  </Link>
                  <ActionButton
                    size="sm"
                    variant="secondary"
                    loading={ingestingId === source.id}
                    disabled={Boolean(ingestingId)}
                    leftIcon={<RefreshCw className={ingestingId === source.id ? "h-4 w-4 animate-spin" : "h-4 w-4"} />}
                    onClick={() => onIngest(source)}
                  >
                    Ingest
                  </ActionButton>
                </div>
              </td>
            </tr>
          ))}
        </>
      }
    />
  );
}
