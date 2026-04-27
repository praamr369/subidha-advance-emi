"use client";

export default function Phase5SourceMapPanel({
  rows,
}: {
  rows: Array<{
    kpi_key: string;
    label: string;
    authoritative_source: string;
    calculation_summary: string;
    exclusions: string[];
    related_detail_url: string;
  }>;
}) {
  if (!rows.length) return null;
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground">Data source map</h3>
      <div className="mt-3 space-y-3">
        {rows.map((row) => (
          <div key={row.kpi_key} className="rounded-lg border border-border p-3 text-xs">
            <div className="font-semibold text-foreground">{row.label}</div>
            <div className="mt-1 text-muted-foreground">{row.authoritative_source}</div>
            <div className="mt-1 text-muted-foreground">{row.calculation_summary}</div>
            <div className="mt-1 text-muted-foreground">Exclusions: {row.exclusions.join(", ")}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

