import Link from "next/link";
import { FileText } from "lucide-react";

import Card from "@/components/ui/card";
import type { AiCitation } from "@/services/admin-ai";

type AiCitationListProps = {
  citations: AiCitation[];
};

export default function AiCitationList({ citations }: AiCitationListProps) {
  if (citations.length === 0) {
    return (
      <Card variant="bordered" title="Citations">
        <p className="text-sm text-muted-foreground">No approved source citations were returned.</p>
      </Card>
    );
  }

  return (
    <Card variant="bordered" title="Citations">
      <div className="flex flex-col gap-3">
        {citations.map((citation) => (
          <article
            key={`${citation.sourceId}-${citation.chunkId}`}
            className="rounded-xl border border-border bg-[var(--surface-card-elevated)] p-4"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">{citation.sourceTitle}</span>
                </div>
                <p className="mt-1 text-xs font-medium text-muted-foreground">{citation.heading || "Source excerpt"}</p>
              </div>
              {citation.sourceId > 0 ? (
                <Link
                  href={`/admin/ai/sources/${citation.sourceId}`}
                  className="inline-flex items-center justify-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-muted/50"
                >
                  Open Source
                </Link>
              ) : null}
            </div>
            <p className="mt-3 line-clamp-4 text-sm leading-6 text-muted-foreground">{citation.excerpt}</p>
          </article>
        ))}
      </div>
    </Card>
  );
}
