"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Box } from "lucide-react";

import { pimService, type PimArCoverage } from "@/services/pim";

/**
 * Room view (AR) readiness across published finished goods: which have a 3D model,
 * which get the auto size preview, and which customers can't place in a room yet.
 */
export default function ArCoverageCard() {
  const [coverage, setCoverage] = useState<PimArCoverage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filling, setFilling] = useState(false);
  const [fillResult, setFillResult] = useState<string | null>(null);
  const [showMissing, setShowMissing] = useState(false);

  const load = useCallback(() => {
    pimService.getArCoverage().then(setCoverage, () => setError("Could not load room-view coverage."));
  }, []);

  useEffect(load, [load]);

  const handleFill = async () => {
    setFilling(true);
    setFillResult(null);
    try {
      const result = await pimService.fillArSizes();
      setFillResult(
        result.filled
          ? `Filled ${result.filled} product${result.filled === 1 ? "" : "s"} from their attributes. Open each one to check the size matches the real product.`
          : "No blank sizes could be read from attributes. Enter sizes on each product.",
      );
      load();
    } catch {
      setFillResult("Filling sizes failed.");
    } finally {
      setFilling(false);
    }
  };

  if (error) return <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>;
  if (!coverage) return null;

  const ready = coverage.with_model + coverage.size_preview_only;
  const stats = [
    { label: "3D model", value: coverage.with_model },
    { label: "Size preview", value: coverage.size_preview_only },
    { label: "Not ready", value: coverage.not_ready },
  ];

  return (
    <section className="rounded-lg border bg-card p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Box className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Room view (AR)</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {ready} of {coverage.total} published products can be placed in a customer&apos;s room. A product needs a
              3D model or an AR size (width and depth).
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleFill()}
          disabled={filling || coverage.not_ready === 0}
          className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
        >
          {filling ? "Filling…" : "Fill blank sizes from attributes"}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-md border bg-background px-3 py-2">
            <div className="text-lg font-semibold tabular-nums text-foreground">{s.value}</div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      {fillResult && <p className="text-xs text-muted-foreground">{fillResult}</p>}

      {coverage.missing.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowMissing((v) => !v)}
            className="text-xs font-medium text-primary hover:underline"
          >
            {showMissing ? "Hide" : "Show"} products without room view ({coverage.not_ready})
          </button>
          {showMissing && (
            <ul className="mt-2 max-h-64 divide-y overflow-y-auto rounded-md border text-sm">
              {coverage.missing.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0 truncate">
                    <span className="font-mono text-xs text-muted-foreground">{p.code}</span> {p.name}
                  </span>
                  <Link href={`/admin/pim/products/${p.id}/edit`} className="shrink-0 text-xs font-medium text-primary hover:underline">
                    Add size
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
