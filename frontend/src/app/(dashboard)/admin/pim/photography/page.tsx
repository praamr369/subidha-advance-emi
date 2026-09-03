"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { apiFetch } from "@/lib/api";
import { pimService } from "@/services/pim";
import { cn } from "@/lib/utils";

type CoverageProduct = {
  id: number;
  code: string;
  name: string;
  category: string | null;
  photo_count: number;
  is_published: boolean;
};

type Coverage = {
  total: number;
  with_photos: number;
  without_photos: number;
  returned: number;
  products: CoverageProduct[];
};

type Match = {
  file: File;
  product: CoverageProduct | null;
  reason: string;
};

type UploadState = "idle" | "uploading" | "done" | "failed";

const IMAGE_TYPES = /\.(jpe?g|png|webp|gif|avif)$/i;
// Mirrors ORDER_SUFFIX in the import_product_images management command.
const ORDER_SUFFIX = /^(.+?)[_-](\d{1,3})$/;

function stemOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(0, dot) : filename;
}

/**
 * Resolve a filename to a product using the same precedence as the CLI
 * importer: the whole stem first, and only then the stem with a trailing
 * _N / -N stripped. Product codes here routinely end in digits
 * (AHUJABTA660-0001), so guessing a suffix first would mis-match them.
 */
function matchFile(file: File, byCode: Map<string, CoverageProduct>): Match {
  const stem = stemOf(file.name);

  const exact = byCode.get(stem.toLowerCase());
  if (exact) return { file, product: exact, reason: "" };

  const m = ORDER_SUFFIX.exec(stem);
  if (m) {
    const base = byCode.get(m[1].toLowerCase());
    if (base) return { file, product: base, reason: `additional image ${m[2]}` };
  }

  return { file, product: null, reason: "No product code matches this filename." };
}

export default function ProductPhotographyPage() {
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [missingOnly, setMissingOnly] = useState(true);

  const [matches, setMatches] = useState<Match[]>([]);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0, failed: 0 });
  const [setHero, setSetHero] = useState(true);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (search.trim()) qs.set("search", search.trim());
    if (missingOnly) qs.set("missing_only", "true");
    apiFetch<Coverage>(`/admin/pim/photo-coverage/?${qs}`)
      .then(setCoverage)
      .catch((e) => setError(e?.message ?? "Could not load photography coverage."))
      .finally(() => setLoading(false));
  }, [search, missingOnly]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  // Matching needs every code, not just the filtered page, so a file for an
  // already-photographed product still resolves.
  const [allByCode, setAllByCode] = useState<Map<string, CoverageProduct>>(new Map());
  useEffect(() => {
    apiFetch<Coverage>(`/admin/pim/photo-coverage/?limit=500`)
      .then((c) => setAllByCode(new Map(c.products.map((p) => [p.code.toLowerCase(), p]))))
      .catch(() => setAllByCode(new Map()));
  }, []);

  const matched = useMemo(() => matches.filter((m) => m.product), [matches]);
  const unmatched = useMemo(() => matches.filter((m) => !m.product), [matches]);

  const takeFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const images = Array.from(files).filter((f) => IMAGE_TYPES.test(f.name));
    setMatches(images.map((f) => matchFile(f, allByCode)));
    setUploadState("idle");
    setProgress({ done: 0, total: 0, failed: 0 });
  };

  const upload = async () => {
    if (!matched.length) return;
    setUploadState("uploading");
    setProgress({ done: 0, total: matched.length, failed: 0 });

    let done = 0;
    let failed = 0;
    const heroUsed = new Set<number>();

    for (const m of matched) {
      const product = m.product!;
      const fd = new FormData();
      fd.append("product", String(product.id));
      fd.append("kind", "IMAGE");
      fd.append("scope", "ALL_VARIANTS");
      fd.append("file", m.file);
      // Only the first image of a product that has none becomes the hero.
      if (setHero && product.photo_count === 0 && !heroUsed.has(product.id)) {
        fd.append("is_hero", "true");
        heroUsed.add(product.id);
      }
      try {
        await pimService.uploadMedia(fd);
        done += 1;
      } catch {
        failed += 1;
      }
      setProgress({ done, total: matched.length, failed });
    }

    setUploadState(failed === matched.length ? "failed" : "done");
    load();
  };

  if (loading && !coverage) return <ERPLoadingState />;
  if (error && !coverage) return <ERPErrorState message={error} />;

  const pct = coverage && coverage.total > 0
    ? Math.round((coverage.with_photos / coverage.total) * 100)
    : 0;

  return (
    <ERPPageShell
      title="Product Photography"
      subtitle="Drop a folder of photos and they are matched to products by filename. Name each file after the product code."
    >
      {/* Coverage */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {[
          { label: "Products", value: coverage?.total ?? 0 },
          { label: "With photos", value: coverage?.with_photos ?? 0 },
          { label: "Still missing", value: coverage?.without_photos ?? 0 },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {s.label}
            </div>
            <div className="mt-1 text-2xl font-bold text-foreground">{s.value}</div>
          </div>
        ))}
      </div>
      <div className="mb-8">
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{pct}% of the catalogue is photographed.</p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          takeFiles(e.dataTransfer.files);
        }}
        className="rounded-2xl border-2 border-dashed border-border bg-card p-8 text-center"
      >
        <p className="text-sm font-medium text-foreground">
          Drop photos here, or{" "}
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="text-primary underline underline-offset-2"
          >
            choose files
          </button>
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Name files after the product code — <code>AHUJABTA660-0001.jpg</code>. Add{" "}
          <code>_2</code>, <code>_3</code> for extra shots of the same product.
        </p>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => takeFiles(e.target.files)}
        />
      </div>

      {/* Match preview */}
      {matches.length > 0 ? (
        <div className="mt-6 rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <span className="font-semibold text-foreground">{matched.length} matched</span>
              {unmatched.length > 0 ? (
                <span className="text-destructive"> · {unmatched.length} unmatched</span>
              ) : null}
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={setHero}
                  onChange={(e) => setSetHero(e.target.checked)}
                />
                Set first photo as main image
              </label>
              <button
                type="button"
                disabled={!matched.length || uploadState === "uploading"}
                onClick={upload}
                className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
              >
                {uploadState === "uploading"
                  ? `Uploading ${progress.done}/${progress.total}...`
                  : `Upload ${matched.length} photo${matched.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>

          {uploadState === "done" ? (
            <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/20 dark:text-green-300">
              Uploaded {progress.done} of {progress.total}
              {progress.failed > 0 ? ` · ${progress.failed} failed` : ""}.
            </div>
          ) : null}

          <ul className="mt-4 max-h-72 divide-y divide-border overflow-y-auto text-sm">
            {matches.map((m, i) => (
              <li key={`${m.file.name}-${i}`} className="flex items-center justify-between gap-3 py-2">
                <span className="truncate text-foreground">{m.file.name}</span>
                <span
                  className={cn(
                    "shrink-0 text-xs",
                    m.product ? "text-muted-foreground" : "text-destructive"
                  )}
                >
                  {m.product
                    ? `→ ${m.product.code}${m.reason ? ` (${m.reason})` : ""}`
                    : m.reason}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Product list */}
      <div className="mt-8">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by code or name"
            className="w-64 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/45"
          />
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={missingOnly}
              onChange={(e) => setMissingOnly(e.target.checked)}
            />
            Only products without photos
          </label>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-semibold">Code</th>
                <th className="px-4 py-2 font-semibold">Product</th>
                <th className="px-4 py-2 font-semibold">Category</th>
                <th className="px-4 py-2 font-semibold">Photos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(coverage?.products ?? []).map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2 font-mono text-xs text-foreground">{p.code}</td>
                  <td className="px-4 py-2 text-foreground">{p.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{p.category ?? "—"}</td>
                  <td className="px-4 py-2">
                    {p.photo_count > 0 ? (
                      <span className="text-green-700 dark:text-green-400">{p.photo_count}</span>
                    ) : (
                      <span className="text-muted-foreground">none</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {coverage && coverage.returned < coverage.without_photos && missingOnly ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Showing {coverage.returned} of {coverage.without_photos}. Search to narrow the list.
          </p>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
