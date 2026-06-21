"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Clipboard, Download, FileText, RefreshCw, Send } from "lucide-react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import {
  generateBrochure,
  listBrochureProducts,
  listBrochures,
  type BrochureDocument,
  type BrochureProduct,
  type BrochureType,
} from "@/services/brochures";


const TYPE_OPTIONS: { value: BrochureType; label: string; title: string }[] = [
  { value: "RENT", label: "Rent", title: "Subidha Furniture Rent Catalog" },
  { value: "LEASE", label: "Lease", title: "Subidha Furniture Lease Catalog" },
  { value: "LUCKY_EMI", label: "Lucky EMI", title: "Subidha Furniture Lucky EMI Catalog" },
  { value: "DIRECT_SALE", label: "Direct Sale", title: "Subidha Furniture Direct Sale Price List" },
  { value: "CUSTOM", label: "Custom", title: "Subidha Furniture Selected Product Catalog" },
];

function money(value: string | null): string {
  if (!value) return "—";
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(numeric)
    : value;
}

function formatDate(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? value : new Date(timestamp).toLocaleString();
}

function productPrice(product: BrochureProduct): string {
  if (product.monthly_rent) return `${money(product.monthly_rent)} / month rent`;
  if (product.lease_monthly_amount) return `${money(product.lease_monthly_amount)} / month lease`;
  return product.sale_price ? money(product.sale_price) : "Price on request";
}

export default function AdminBrochuresPage() {
  const [brochureType, setBrochureType] = useState<BrochureType>("RENT");
  const [title, setTitle] = useState(TYPE_OPTIONS[0].title);
  const [category, setCategory] = useState("");
  const [products, setProducts] = useState<BrochureProduct[]>([]);
  const [recent, setRecent] = useState<BrochureDocument[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [generated, setGenerated] = useState<BrochureDocument | null>(null);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copied, setCopied] = useState<"public" | "whatsapp" | null>(null);

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const rows = await listBrochureProducts(brochureType, category || undefined);
      setProducts(rows);
      setSelectedIds((current) => new Set([...current].filter((id) => rows.some((row) => row.id === id))));
      setError(null);
    } catch (err) {
      setProducts([]);
      setError(err instanceof Error ? err.message : "Unable to load brochure-safe products.");
    } finally {
      setLoadingProducts(false);
    }
  }, [brochureType, category]);

  const loadRecent = useCallback(async () => {
    setLoadingRecent(true);
    try {
      setRecent(await listBrochures());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load recent brochures.");
    } finally {
      setLoadingRecent(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadProducts(), 0);
    return () => window.clearTimeout(timer);
  }, [loadProducts]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadRecent(), 0);
    return () => window.clearTimeout(timer);
  }, [loadRecent]);

  const categories = useMemo(
    () => [...new Set(products.map((product) => product.category).filter(Boolean))].sort(),
    [products]
  );

  function changeType(nextType: BrochureType) {
    setBrochureType(nextType);
    setTitle(TYPE_OPTIONS.find((row) => row.value === nextType)?.title ?? "Subidha Furniture Product Catalog");
    setCategory("");
    setSelectedIds(new Set());
    setGenerated(null);
    setSuccess(null);
  }

  function toggleProduct(id: number) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleGenerate() {
    if (brochureType === "CUSTOM" && selectedIds.size === 0) {
      setError("Select at least one product for a custom brochure.");
      return;
    }
    if (!title.trim()) {
      setError("Enter a brochure title.");
      return;
    }
    setGenerating(true);
    setError(null);
    setSuccess(null);
    try {
      const document = await generateBrochure({
        brochure_type: brochureType,
        title: title.trim(),
        category: category.trim() || null,
        product_ids: brochureType === "CUSTOM" ? [...selectedIds] : [],
        expires_at: null,
      });
      setGenerated(document);
      setSuccess(`${document.brochure_no} generated with ${document.product_count} products.`);
      await loadRecent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Brochure generation failed.");
    } finally {
      setGenerating(false);
    }
  }

  async function copyText(kind: "public" | "whatsapp", value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setError("Clipboard access was blocked. Open the link and copy it manually.");
    }
  }

  return (
    <ERPPageShell
      title="Product Brochure Generator"
      subtitle="Generate customer-facing catalogs from brochure-safe product and price fields. This workflow never reserves stock or creates billing, contracts, payments, or accounting entries."
      breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Products", href: "/admin/products" }, { label: "Brochures" }]}
      actions={[{ href: "/admin/brochures/settings", label: "Manage Product Brochure Settings", variant: "secondary" }]}
      statusBadge={{ label: "Read-only catalog workflow", tone: "success" }}
      stats={[
        { label: "Eligible products", value: products.length },
        { label: "Selected products", value: brochureType === "CUSTOM" ? selectedIds.size : products.length },
        { label: "Recent brochures", value: recent.length },
      ]}
    >
      <div className="space-y-6">
        <ERPSectionShell title="Create brochure" description="Choose a catalog type and optional category. Custom brochures require explicit product selection.">
          <div className="grid gap-4 lg:grid-cols-3">
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Brochure type</span>
              <select value={brochureType} onChange={(event) => changeType(event.target.value as BrochureType)} className="h-11 w-full rounded-xl border border-border bg-background px-3">
                {TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium text-foreground lg:col-span-2">
              <span>Brochure title</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} className="h-11 w-full rounded-xl border border-border bg-background px-4" />
            </label>
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Category filter (optional)</span>
              <input list="brochure-categories" value={category} onChange={(event) => setCategory(event.target.value)} placeholder="All categories" className="h-11 w-full rounded-xl border border-border bg-background px-4" />
              <datalist id="brochure-categories">{categories.map((row) => <option key={row} value={row} />)}</datalist>
            </label>
            <div className="flex items-end gap-3 lg:col-span-2">
              <button type="button" onClick={() => void loadProducts()} disabled={loadingProducts} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold hover:bg-muted disabled:opacity-60">
                <RefreshCw className="h-4 w-4" /> Refresh products
              </button>
              <button type="button" onClick={() => void handleGenerate()} disabled={generating || loadingProducts || products.length === 0} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-95 disabled:opacity-60">
                <FileText className="h-4 w-4" /> {generating ? "Generating PDF..." : "Generate brochure"}
              </button>
            </div>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            Prices remain indicative until an approved quotation, invoice, or contract. Generating this brochure does not reserve stock.
          </div>
          {error ? <ERPErrorState title="Brochure action failed" description={error} onRetry={() => void loadProducts()} /> : null}
          {success ? <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900"><Check className="h-4 w-4" /> {success}</div> : null}
        </ERPSectionShell>

        {generated ? (
          <ERPSectionShell title="Generated brochure" description="Download the PDF or copy a customer-safe public link and WhatsApp message.">
            <div className="grid gap-4 rounded-2xl border border-border bg-card p-5 md:grid-cols-[1fr_auto]">
              <div className="space-y-2">
                <div className="text-lg font-semibold text-foreground">{generated.title}</div>
                <div className="text-sm text-muted-foreground">{generated.brochure_no} · {generated.product_count} products</div>
                <ERPStatusBadge status={generated.status} label={generated.brochure_type.replace("_", " ")} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a href={generated.pdf_url} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"><Download className="h-4 w-4" /> Download PDF</a>
                <button type="button" onClick={() => void copyText("public", generated.public_url)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold">{copied === "public" ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />} Copy public link</button>
                <button type="button" onClick={() => void copyText("whatsapp", generated.whatsapp_message)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold">{copied === "whatsapp" ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />} Copy WhatsApp message</button>
              </div>
            </div>
          </ERPSectionShell>
        ) : null}

        <ERPSectionShell title={brochureType === "CUSTOM" ? "Select products" : "Eligible products"} description={brochureType === "CUSTOM" ? "Only checked products will be snapshotted into the brochure." : "These products pass visibility, price, lifecycle, and safe availability checks."}>
          {loadingProducts ? <ERPLoadingState label="Loading brochure-safe products..." /> : null}
          {!loadingProducts && products.length === 0 ? <ERPEmptyState title="No eligible products" description="Add brochure pricing/settings or change the catalog type or category filter." /> : null}
          {!loadingProducts && products.length > 0 ? (
            <div className="overflow-x-auto rounded-2xl border border-border">
              <table className="min-w-full divide-y divide-border text-sm">
                <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>{brochureType === "CUSTOM" ? <th className="px-4 py-3">Select</th> : null}<th className="px-4 py-3">Product</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Visible price</th><th className="px-4 py-3">Availability</th></tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {products.map((product) => (
                    <tr key={product.id}>
                      {brochureType === "CUSTOM" ? <td className="px-4 py-3"><input type="checkbox" checked={selectedIds.has(product.id)} onChange={() => toggleProduct(product.id)} aria-label={`Select ${product.name}`} className="h-4 w-4 accent-primary" /></td> : null}
                      <td className="px-4 py-3"><div className="font-semibold text-foreground">{product.name}</div><div className="text-xs text-muted-foreground">{product.product_code}</div>{product.public_badge ? <div className="mt-1 text-xs font-medium text-amber-800">{product.public_badge}</div> : null}</td>
                      <td className="px-4 py-3 text-muted-foreground">{product.category}</td>
                      <td className="px-4 py-3 font-medium text-foreground">{productPrice(product)}{product.security_deposit ? <div className="text-xs text-muted-foreground">Deposit {money(product.security_deposit)}</div> : null}</td>
                      <td className="px-4 py-3"><ERPStatusBadge status="AVAILABLE" label={product.availability_label} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </ERPSectionShell>

        <ERPSectionShell title="Recent brochures" description="Generated snapshots remain available even when current product prices later change.">
          {loadingRecent ? <ERPLoadingState label="Loading recent brochures..." /> : null}
          {!loadingRecent && recent.length === 0 ? <ERPEmptyState title="No brochures generated yet" description="Your generated brochure history will appear here." /> : null}
          {!loadingRecent && recent.length > 0 ? (
            <div className="grid gap-3">
              {recent.map((document) => (
                <div key={document.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 md:flex-row md:items-center md:justify-between">
                  <div><div className="font-semibold text-foreground">{document.title}</div><div className="text-xs text-muted-foreground">{document.brochure_no} · {document.product_count} products · {formatDate(document.created_at)}</div></div>
                  <div className="flex flex-wrap gap-2">
                    <a href={document.pdf_url} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold"><Download className="h-4 w-4" /> PDF</a>
                    <button type="button" onClick={() => void copyText("public", document.public_url)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold"><Clipboard className="h-4 w-4" /> Public link</button>
                    <button type="button" onClick={() => void copyText("whatsapp", document.whatsapp_message)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold"><Send className="h-4 w-4" /> WhatsApp</button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </ERPSectionShell>
      </div>
    </ERPPageShell>
  );
}
