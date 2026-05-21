"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { accountingErrorMessage } from "@/components/accounting/shared";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";
import { requestVendorQuotesViaSourcing, suggestVendors } from "@/services/vendor-ops";

type ScoreBreakdown = {
  location?: string;
  price_band?: string;
  quality?: string;
  delivery?: string;
  warranty?: string;
  reliability?: string;
  catalog_filters_match?: boolean;
};

type SuggestionRow = {
  vendor_id: number;
  vendor_name: string;
  location_match_level?: string;
  category_match_indicator?: string;
  overall_score?: string;
  suggested_reason?: string;
  price_score?: string;
  quality_score?: string;
  delivery_score?: string;
  warranty_score?: string;
  reliability_score?: string;
  score_breakdown?: ScoreBreakdown;
  matching_products?: Array<{
    id: number;
    product_name: string;
    vendor_sku?: string;
    base_quote_price?: string;
    lead_time_days?: number;
  }>;
  latest_quote?: { quoted_price?: string; lead_time_days?: number; status?: string } | null;
  actions?: { request_quote?: string; open_vendor?: string; compare_quotes?: string };
};

function BreakdownVisual({ breakdown }: { breakdown: ScoreBreakdown }) {
  const entries: { label: string; value: string }[] = [
    { label: "Location cap 30", value: breakdown.location || "0" },
    { label: "Price cap 20", value: breakdown.price_band || "0" },
    { label: "Quality cap 15", value: breakdown.quality || "0" },
    { label: "Delivery cap 15", value: breakdown.delivery || "0" },
    { label: "Warranty cap 10", value: breakdown.warranty || "0" },
    { label: "Reliability cap 10", value: breakdown.reliability || "0" },
  ];

  const maxPts = Math.max(...entries.map((e) => parseFloat(e.value) || 0), 30);

  return (
    <div className="mt-2 rounded border bg-muted/20 p-2 text-[11px]">
      <div className="mb-1 font-medium text-muted-foreground">Score contribution (weighted caps)</div>
      {entries.map((row) => {
        const w = Math.min(100, ((parseFloat(row.value) || 0) / maxPts) * 100);
        return (
          <div key={row.label} className="mb-1">
            <div className="flex justify-between">
              <span>{row.label}</span>
              <span className="tabular-nums">{row.value}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded bg-muted">
              <div className="h-full bg-primary/70" style={{ width: `${w}%` }} />
            </div>
          </div>
        );
      })}
      <div className="mt-1 text-muted-foreground">
        Catalog filters active: {breakdown.catalog_filters_match ? "yes (non-matching vendors hidden)" : "no (location-only pass)"}
      </div>
    </div>
  );
}

export default function AdminVendorSourcingPage() {
  const searchParams = useSearchParams();
  const [pincode, setPincode] = useState("");
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [state, setState] = useState("");
  const [branchHint, setBranchHint] = useState("");
  const [productId, setProductId] = useState("");
  const [productName, setProductName] = useState("");
  const [categoryText, setCategoryText] = useState("");
  const [material, setMaterial] = useState("");
  const [quantity, setQuantity] = useState("1.000");
  const [requiredBy, setRequiredBy] = useState("");
  const [budgetAmount, setBudgetAmount] = useState("");
  const [includeOutOfArea, setIncludeOutOfArea] = useState(false);

  const [rows, setRows] = useState<SuggestionRow[]>([]);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [picked, setPicked] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [rqBusy, setRqBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    const read = (key: string) => searchParams.get(key)?.trim() ?? "";
    if (read("prefill_pincode")) setPincode(read("prefill_pincode"));
    if (read("prefill_city")) setCity(read("prefill_city"));
    if (read("prefill_district")) setDistrict(read("prefill_district"));
    if (read("prefill_state")) setState(read("prefill_state"));
    if (read("prefill_branch")) setBranchHint(read("prefill_branch"));
    if (read("prefill_product_id")) setProductId(read("prefill_product_id"));
    if (read("prefill_product_name")) setProductName(read("prefill_product_name"));
    if (read("prefill_category_text")) setCategoryText(read("prefill_category_text"));
    if (read("prefill_material")) setMaterial(read("prefill_material"));
    if (read("prefill_quantity")) setQuantity(read("prefill_quantity"));
    if (read("prefill_required_by")) setRequiredBy(read("prefill_required_by"));
    if (read("prefill_budget_amount")) setBudgetAmount(read("prefill_budget_amount"));
    const oo = searchParams.get("prefill_include_out_of_area");
    if (oo === "1" || oo === "true") setIncludeOutOfArea(true);
  }, [searchParams]);

  const runSuggest = useCallback(async () => {
    setBanner(null);
    setError(null);
    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        customer_pincode: pincode.trim(),
        customer_city: city.trim(),
        customer_district: district.trim(),
        customer_state: state.trim(),
        customer_branch: branchHint.trim(),
        product_name: productName.trim(),
        category_text: categoryText.trim(),
        material: material.trim(),
        quantity: quantity.trim() || "1.000",
        include_out_of_area: includeOutOfArea,
      };
      const pid = productId.trim();
      if (pid) payload.product_id = Number(pid);
      if (requiredBy.trim()) payload.required_by = requiredBy.trim();
      if (budgetAmount.trim()) payload.budget_amount = budgetAmount.trim();

      const res = (await suggestVendors(payload)) as { results?: SuggestionRow[] };
      const list = Array.isArray(res.results) ? res.results : [];
      setRows(list);
      setExpanded({});
      setPicked({});
    } catch (err) {
      setError(accountingErrorMessage(err, "Could not retrieve sourcing suggestions."));
    } finally {
      setLoading(false);
    }
  }, [pincode, city, district, state, branchHint, productName, categoryText, material, quantity, requiredBy, budgetAmount, productId, includeOutOfArea]);

  async function sendRequestsForPicklist() {
    const vendor_ids = Object.entries(picked)
      .filter(([, v]) => v)
      .map(([id]) => Number(id));
    if (vendor_ids.length === 0) {
      setError("Select vendors to invite with the checkboxes first.");
      return;
    }

    const payload: Record<string, unknown> = {
      source_type: "MANUAL",
      product_name: productName.trim(),
      category_text: categoryText.trim(),
      quantity: quantity.trim() || "1.000",
      vendor_ids,
      send_to_vendors: true,
      customer_pincode: pincode.trim(),
      customer_city: city.trim(),
      customer_district: district.trim(),
      customer_state: state.trim(),
    };
    if (requiredBy.trim()) payload.required_by = requiredBy.trim();
    if (budgetAmount.trim()) payload.budget_amount = budgetAmount.trim();
    const pid = productId.trim();
    if (pid) payload.product = Number(pid);

    setBanner(null);
    setError(null);
    setRqBusy(true);
    try {
      await requestVendorQuotesViaSourcing(payload);
      setBanner("Quote request drafted — review Vendor Quotes registry.");
      setPicked({});
    } catch (err) {
      setError(accountingErrorMessage(err, "Unable to initiate vendor invitations."));
    } finally {
      setRqBusy(false);
    }
  }

  function togglePick(id: number) {
    setPicked((p) => ({ ...p, [id]: !p[id] }));
  }

  return (
    <ERPPageShell
      title="Vendor sourcing workspace"
      subtitle="Ranked supplier recommendations — read-only until procurement records RFQs manually. Orders are never auto-placed."
      breadcrumbs={[{ label: "Admin", href: ROUTES.admin.dashboard }, { label: "Vendor sourcing", href: ROUTES.admin.vendorsSourcing }]}
      actions={[
        { href: ROUTES.admin.vendorsQuotes, label: "Vendor quotes", variant: "primary" },
        { href: ROUTES.admin.vendors, label: "Vendor register", variant: "secondary" },
      ]}
      stats={[
        {
          label: "Suggestions returned",
          value: String(rows.length),
          tone: loading ? "info" : rows.length === 0 ? "warning" : "info",
        },
        { label: "Selected invites", value: String(Object.values(picked).filter(Boolean).length), tone: "info" },
      ]}
    >
      {banner ? <div className="mb-3 rounded border border-emerald-600/40 bg-emerald-600/10 p-3 text-sm">{banner}</div> : null}
      {error ? <div className="mb-3 rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}

      <ERPSectionShell
        title="Customer / fulfilment cues & SKU filters"
        description="Use geography cues and SKU filters to rank vendors. Results remain read-only until you explicitly create RFQs."
      >
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
          <input className="h-10 rounded border px-2" placeholder="Customer pincode" value={pincode} onChange={(e) => setPincode(e.target.value)} />
          <input className="h-10 rounded border px-2" placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} />
          <input className="h-10 rounded border px-2" placeholder="District" value={district} onChange={(e) => setDistrict(e.target.value)} />
          <input className="h-10 rounded border px-2" placeholder="State" value={state} onChange={(e) => setState(e.target.value)} />
          <input
            className="h-10 rounded border px-2 md:col-span-2"
            placeholder="Branch / location hint (optional metadata)"
            value={branchHint}
            onChange={(e) => setBranchHint(e.target.value)}
          />
          <input className="h-10 rounded border px-2" placeholder="Internal product ID" value={productId} onChange={(e) => setProductId(e.target.value)} />
          <input className="h-10 rounded border px-2" placeholder="Product name contains" value={productName} onChange={(e) => setProductName(e.target.value)} />
          <input className="h-10 rounded border px-2" placeholder="Category text (exact CI)" value={categoryText} onChange={(e) => setCategoryText(e.target.value)} />
          <input className="h-10 rounded border px-2" placeholder="Material contains" value={material} onChange={(e) => setMaterial(e.target.value)} />
          <input className="h-10 rounded border px-2" placeholder="Quantity" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          <input className="h-10 rounded border px-2" placeholder="Required by YYYY-MM-DD" value={requiredBy} onChange={(e) => setRequiredBy(e.target.value)} />
          <input className="h-10 rounded border px-2" placeholder="Budget amount" value={budgetAmount} onChange={(e) => setBudgetAmount(e.target.value)} />
        </div>
        <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={includeOutOfArea} onChange={(e) => setIncludeOutOfArea(e.target.checked)} />
          Include footprints outside geography (scores them materially lower than inline matches).
        </label>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="h-10 rounded border bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50" disabled={loading} onClick={() => void runSuggest()}>
        {loading ? "Ranking…" : "Run sourcing"}
          </button>
          <button
            type="button"
            className="h-10 rounded border px-4 text-sm disabled:opacity-50"
            disabled={rqBusy || Object.values(picked).every((v) => !v)}
            onClick={() => void sendRequestsForPicklist()}
          >
            {rqBusy ? "Creating RFQs…" : "Request quotes from checked vendors"}
          </button>
        </div>
        <div className="mt-4 rounded bg-muted/30 p-3 text-xs text-muted-foreground">
          <div className="font-medium text-foreground">Weights</div>
          Location dominates (30 pts), vendor price posture up to 20, delivery 15, quality 15, warranty 10, reliability 10. Catalog/category/material filters prune non-feasible partners before scoring.
        </div>
      </ERPSectionShell>

      {error ? <ERPErrorState title="Vendor sourcing unavailable" description={error} /> : null}

      <ERPSectionShell
        title="Suggested vendors"
        description="Results are read-only summaries until downstream RFQ creation. Orders are never auto-placed."
      >
        {loading ? <ERPLoadingState label="Loading supplier intelligence..." /> : null}
        {!loading && rows.length === 0 && !error ? (
          <ERPEmptyState
            title="No suggestions yet"
            description="Enter geography cues (pincode/state) or SKU/category/material filters to see ranked suppliers."
          />
        ) : null}

        {!loading && rows.length > 0 ? (
          <div className="space-y-3 text-sm">
          {rows.map((row) => {
            const lq = row.latest_quote ?? null;
            const expandedRow = !!expanded[row.vendor_id];
            const bd = row.score_breakdown || {};
            const actions = row.actions || {};
            return (
              <div
                key={row.vendor_id}
                className="rounded-[1.4rem] border border-border/70 bg-[var(--surface-card-elevated)] p-4 shadow-[inset_0_1px_0_var(--hairline-shine)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1.5 h-4 w-4 shrink-0"
                      checked={!!picked[row.vendor_id]}
                      onChange={() => togglePick(row.vendor_id)}
                      aria-label={`Select ${row.vendor_name}`}
                    />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-base font-medium">{row.vendor_name}</div>
                        <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-medium">Score {String(row.overall_score)}</span>
                        <span className="rounded border px-2 py-0.5 text-[11px] text-muted-foreground">{(row.matching_products || []).length} catalog hits</span>
                      </div>
                      <div className="text-xs text-muted-foreground">{row.suggested_reason}</div>
                      <button type="button" className="mt-2 text-xs text-primary underline" onClick={() => setExpanded((m) => ({ ...m, [row.vendor_id]: !expanded[row.vendor_id] }))}>
                        {expandedRow ? "Hide score breakdown" : "Show score breakdown"}
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link className="h-9 rounded border px-3 text-xs leading-9 underline" href={actions.open_vendor || `${ROUTES.admin.vendors}/${row.vendor_id}`}>
                      Open vendor
                    </Link>
                    <Link
                      className="h-9 rounded border px-3 text-xs leading-9 underline"
                      href={
                        typeof actions.request_quote === "string" && actions.request_quote.startsWith("/")
                          ? actions.request_quote
                          : `${ROUTES.admin.vendorsQuotes}?prefill_vendor=${row.vendor_id}`
                      }
                    >
                      Request quote
                    </Link>
                    <Link className="h-9 rounded border px-3 text-xs leading-9 underline" href={ROUTES.admin.vendorsQuotes}>
                      Compare quotes
                    </Link>
                  </div>
                </div>

                {expandedRow && Object.keys(bd).length ? <BreakdownVisual breakdown={bd as ScoreBreakdown} /> : null}

                <div className="mt-3 overflow-auto rounded border">
                  <table className="w-full min-w-[860px] text-left text-xs">
                    <thead className="bg-muted/60 uppercase tracking-wide text-[10px] text-muted-foreground">
                      <tr>
                        <th className="p-2">Category match</th>
                        <th className="p-2">Location</th>
                        <th className="p-2">Quote</th>
                        <th className="p-2">Lead (days)</th>
                        <th className="p-2">Vendor warranty pts</th>
                        <th className="p-2">Ratings snapshot</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border-t border-border p-2">{String(row.category_match_indicator || "—")}</td>
                        <td className="border-t border-border p-2">{String(row.location_match_level || "—")}</td>
                        <td className="border-t border-border p-2">
                          {lq && lq.status ? `${lq.status}: ${lq.quoted_price ?? "—"}` : <span className="text-muted-foreground">No stored quote baseline</span>}
                        </td>
                        <td className="border-t border-border p-2">{lq?.lead_time_days != null ? String(lq.lead_time_days) : "—"}</td>
                        <td className="border-t border-border p-2">{String(row.warranty_score ?? "—")}</td>
                        <td className="border-t border-border p-2">
                          Q/P/D/R {String(row.quality_score)}/{String(row.price_score)}/{String(row.delivery_score)}/{String(row.reliability_score)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {(row.matching_products || []).length ? (
                  <details className="mt-3 text-xs">
                    <summary className="cursor-pointer select-none font-medium text-muted-foreground">Matching SKU lines ({(row.matching_products || []).length})</summary>
                    <ul className="mt-2 grid gap-1 md:grid-cols-2">
                      {(row.matching_products || []).map((prod) => (
                        <li key={prod.id} className="rounded border border-border px-2 py-1">
                          {prod.product_name} · SKU {prod.vendor_sku || "—"} · list {prod.base_quote_price ?? "—"} · lead {prod.lead_time_days ?? "—"}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </div>
            );
          })}
          </div>
        ) : null}
      </ERPSectionShell>
    </ERPPageShell>
  );
}
