"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight, CheckCircle2, Circle, Download, ExternalLink,
  Layers, RefreshCw, Search, XCircle,
} from "lucide-react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import {
  pimService,
  type PimProduct,
  type RegisterStatusItem,
  type RegisterStatusResponse,
  type SyncResult,
} from "@/services/pim";

function fmt(n: number | string) {
  return Number(n).toLocaleString("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0 });
}

function StatusBadge({ synced }: { synced: boolean }) {
  return synced
    ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs font-medium text-emerald-700"><CheckCircle2 className="h-3 w-3" />PIM Synced</span>
    : <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs font-medium text-amber-700"><Circle className="h-3 w-3" />Not in PIM</span>;
}

function SyncResultBanner({ result, onClose }: { result: SyncResult; onClose: () => void }) {
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-start gap-3">
      <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
      <div className="flex-1 text-sm">
        <p className="font-semibold text-emerald-800">Sync complete — {result.total_processed} products processed</p>
        <p className="text-emerald-700 mt-0.5">
          Created: <strong>{result.created}</strong> · Updated: <strong>{result.updated}</strong> · Already synced: <strong>{result.skipped}</strong>
          {result.errors.length > 0 && <span className="text-red-600"> · Errors: {result.errors.length}</span>}
        </p>
        {result.errors.length > 0 && (
          <ul className="mt-1 space-y-0.5 text-xs text-red-600">
            {result.errors.slice(0, 5).map((e) => <li key={e.code}>{e.code}: {e.error}</li>)}
          </ul>
        )}
      </div>
      <button type="button" onClick={onClose}><XCircle className="h-4 w-4 text-emerald-600 hover:text-emerald-800" /></button>
    </div>
  );
}

function RegisterTable({
  items, selected, onToggle, onSelectAll, loading,
}: {
  items: RegisterStatusItem[];
  selected: Set<number>;
  onToggle: (id: number) => void;
  onSelectAll: (ids: number[]) => void;
  loading: boolean;
}) {
  const allSelected = items.length > 0 && items.every((i) => selected.has(i.id));
  if (loading) return <ERPLoadingState label="Loading products…" />;
  if (items.length === 0) return <div className="rounded-xl border-2 border-dashed p-10 text-center text-sm text-muted-foreground">No products match current filter.</div>;

  return (
    <div className="rounded-xl border overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 border-b">
          <tr>
            <th className="px-3 py-3"><input type="checkbox" checked={allSelected} onChange={(e) => onSelectAll(e.target.checked ? items.map((i) => i.id) : [])} className="accent-primary" /></th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Code</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Name</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Category</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Price</th>
            <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">PIM Status</th>
            <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.map((item) => (
            <tr key={item.id} className={`hover:bg-muted/20 transition-colors ${selected.has(item.id) ? "bg-primary/5" : ""}`}>
              <td className="px-3 py-2.5"><input type="checkbox" checked={selected.has(item.id)} onChange={() => onToggle(item.id)} className="accent-primary" /></td>
              <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{item.product_code}</td>
              <td className="px-4 py-2.5">
                <div className="font-medium">{item.name}</div>
                {item.item_type && <div className="text-xs text-muted-foreground">{item.item_type}</div>}
              </td>
              <td className="px-4 py-2.5 text-xs text-muted-foreground">{item.category || "—"}{item.subcategory ? ` / ${item.subcategory}` : ""}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{fmt(item.base_price)}</td>
              <td className="px-4 py-2.5 text-center"><StatusBadge synced={item.pim_synced} /></td>
              <td className="px-4 py-2.5 text-center">
                <div className="flex items-center justify-center gap-2">
                  <Link href={`/admin/products/${item.id}/edit`} className="text-xs text-muted-foreground hover:text-foreground hover:underline">Product</Link>
                  {item.pim_product_id
                    ? <Link href={`/admin/pim/products/${item.pim_product_id}/edit`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium">PIM <ExternalLink className="h-3 w-3" /></Link>
                    : <span className="text-xs text-muted-foreground italic">No PIM</span>
                  }
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PimProductsTable({ products, loading }: { products: PimProduct[]; loading: boolean }) {
  if (loading) return <ERPLoadingState label="Loading PIM products…" />;
  if (products.length === 0) return (
    <div className="rounded-xl border-2 border-dashed p-10 text-center text-sm text-muted-foreground">
      No PIM products yet. Use the &quot;From Register&quot; tab to import.
    </div>
  );
  return (
    <div className="rounded-xl border overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 border-b">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Code</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Name</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Category</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Price</th>
            <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">SKUs</th>
            <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">Status</th>
            <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">Edit</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {products.map((p) => (
            <tr key={p.id} className="hover:bg-muted/20 transition-colors">
              <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{p.code}</td>
              <td className="px-4 py-2.5 font-medium">{p.name}</td>
              <td className="px-4 py-2.5 text-xs text-muted-foreground">{p.category_name}{p.subcategory_name ? ` / ${p.subcategory_name}` : ""}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{fmt(p.base_price)}</td>
              <td className="px-4 py-2.5 text-center">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold">{p.variant_count ?? 0}</span>
              </td>
              <td className="px-4 py-2.5 text-center">
                {p.is_published
                  ? <span className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">Published</span>
                  : <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">Draft</span>
                }
              </td>
              <td className="px-4 py-2.5 text-center">
                <Link href={`/admin/pim/products/${p.id}/edit`} className="inline-flex items-center gap-1 text-primary text-xs hover:underline font-medium">Edit <ExternalLink className="h-3 w-3" /></Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PimProductsPage() {
  const [tab, setTab] = useState<"pim" | "register" | "unsynced">("pim");
  const [search, setSearch] = useState("");
  const [pimProducts, setPimProducts] = useState<PimProduct[]>([]);
  const [pimLoading, setPimLoading] = useState(true);
  const [status, setStatus] = useState<RegisterStatusResponse | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  const loadPim = useCallback(async () => {
    setPimLoading(true);
    try { setPimProducts(await pimService.getProducts({ search: search || undefined })); }
    catch { /* silent */ } finally { setPimLoading(false); }
  }, [search]);

  const loadStatus = useCallback(async (p = 1) => {
    setStatusLoading(true);
    try {
      const data = await pimService.getRegisterStatus({
        search: search || undefined,
        synced: tab === "unsynced" ? "false" : undefined,
        page: p, page_size: 50,
      });
      setStatus(data);
    } catch { /* silent */ } finally { setStatusLoading(false); }
  }, [search, tab]);

  useEffect(() => { void loadPim(); }, [loadPim]);
  useEffect(() => { if (tab !== "pim") void loadStatus(1); }, [tab, loadStatus]);

  // Also load status on mount for KPIs
  useEffect(() => { void loadStatus(1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setTimeout(() => { void loadPim(); void loadStatus(1); setPage(1); }, 400);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function toggleSelect(id: number) {
    setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  async function syncSelected() {
    if (!selected.size) return;
    setSyncing(true);
    try {
      const result = await pimService.syncFromRegister({ product_ids: [...selected] });
      setSyncResult(result); setSelected(new Set());
      await Promise.all([loadPim(), loadStatus(page)]);
    } catch (e: unknown) {
      setSyncResult({ created: 0, updated: 0, skipped: 0, total_processed: 0, errors: [{ code: "—", error: (e as { message?: string })?.message ?? "Error" }] });
    } finally { setSyncing(false); }
  }

  async function syncAll() {
    if (!confirm(`Import ALL ${status?.not_synced_count ?? "?"} unsynced products into PIM? They'll get "Unclassified" category — you can re-assign each in PIM edit.`)) return;
    setSyncing(true);
    try {
      const result = await pimService.syncFromRegister({ all: true });
      setSyncResult(result); setSelected(new Set());
      await Promise.all([loadPim(), loadStatus(page)]);
    } catch (e: unknown) {
      setSyncResult({ created: 0, updated: 0, skipped: 0, total_processed: 0, errors: [{ code: "—", error: (e as { message?: string })?.message ?? "Error" }] });
    } finally { setSyncing(false); }
  }

  const registerItems = status?.results ?? [];
  const kpiTotal = status?.total_register ?? 0;
  const kpiSynced = status?.synced_count ?? 0;
  const kpiNotSynced = status?.not_synced_count ?? 0;
  const kpiPim = status?.total_pim ?? pimProducts.length;

  return (
    <ERPPageShell
      eyebrow="PIM"
      title="PIM Products"
      subtitle="Enterprise product catalogue with category attributes and SKU variants. Import and sync from your subscription product register."
      breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Products", href: "/admin/products" }, { label: "PIM Products" }]}
      actions={[
        { href: "/admin/pim/products/create", label: "New PIM Product", variant: "primary" },
        { href: "/admin/pim/categories/manage", label: "Manage Categories", variant: "secondary" },
      ]}
      statusBadge={{ label: "PIM Workbench", tone: "info" }}
    >
      <div className="space-y-5">
        {syncResult && <SyncResultBanner result={syncResult} onClose={() => setSyncResult(null)} />}

        {/* KPI strip */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Register Products", value: kpiTotal, color: "text-foreground" },
            { label: "PIM Synced", value: kpiSynced, color: "text-emerald-600" },
            { label: "Not in PIM", value: kpiNotSynced, color: "text-amber-600" },
            { label: "PIM Total", value: kpiPim, color: "text-primary" },
          ].map((k) => (
            <div key={k.label} className="rounded-xl border bg-background px-4 py-3">
              <div className={`text-2xl font-bold tabular-nums ${k.color}`}>{k.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{k.label}</div>
            </div>
          ))}
        </div>

        {/* Unsynced alert */}
        {kpiNotSynced > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center gap-3 flex-wrap">
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800">{kpiNotSynced} products not yet in PIM</p>
              <p className="text-xs text-amber-700 mt-0.5">Select individual products in the &ldquo;Not Synced&rdquo; tab, or Import All to bulk-create with Unclassified category.</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button type="button" onClick={() => setTab("unsynced")} className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-50">View Unsynced</button>
              <button type="button" onClick={() => void syncAll()} disabled={syncing} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50">
                {syncing ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                Import All
              </button>
            </div>
          </div>
        )}

        {/* Search + tab switcher */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input className="w-full pl-9 pr-3 py-2 text-sm border rounded-xl bg-background" placeholder="Search name, code, category…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-1 p-1 bg-muted rounded-xl ml-auto">
            {(["pim", "register", "unsynced"] as const).map((t) => (
              <button key={t} type="button" onClick={() => setTab(t)} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${tab === t ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {t === "pim" ? `PIM (${kpiPim})` : t === "register" ? `All Register (${kpiTotal})` : `Not Synced (${kpiNotSynced})`}
              </button>
            ))}
          </div>
        </div>

        {/* Selection bar */}
        {(tab === "register" || tab === "unsynced") && selected.size > 0 && (
          <div className="flex items-center gap-3 rounded-xl bg-primary/5 border border-primary/20 px-4 py-2.5">
            <span className="text-sm font-medium text-primary">{selected.size} selected</span>
            <button type="button" onClick={() => void syncSelected()} disabled={syncing} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
              {syncing ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Layers className="h-3 w-3" />}
              {syncing ? "Importing…" : "Import Selected to PIM"}
            </button>
            <button type="button" onClick={() => setSelected(new Set())} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
          </div>
        )}

        {/* Tables */}
        {tab === "pim" && <PimProductsTable products={pimProducts} loading={pimLoading} />}
        {(tab === "register" || tab === "unsynced") && (
          <>
            <RegisterTable items={registerItems} selected={selected} onToggle={toggleSelect} onSelectAll={(ids) => setSelected(new Set(ids))} loading={statusLoading} />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{registerItems.length} shown · {status?.count ?? 0} total filtered</span>
              <div className="flex gap-2">
                {page > 1 && <button type="button" onClick={() => { setPage(p => p - 1); void loadStatus(page - 1); }} className="rounded-lg border px-3 py-1.5 hover:bg-muted">← Prev</button>}
                {registerItems.length === 50 && <button type="button" onClick={() => { setPage(p => p + 1); void loadStatus(page + 1); }} className="rounded-lg border px-3 py-1.5 hover:bg-muted">Next →</button>}
              </div>
            </div>
          </>
        )}

        {/* Module links */}
        <div className="grid gap-3 sm:grid-cols-3 pt-2 border-t">
          {[
            { label: "Products Register", desc: "Subscription billing — EMI, Rent, Lease, Direct Sale", href: "/admin/products", icon: "📋" },
            { label: "Inventory", desc: "Stock profiles, movements, adjustments, opening stock", href: "/admin/inventory", icon: "📦" },
            { label: "PIM Categories", desc: "Category tree, subcategories, attribute templates", href: "/admin/pim/categories/manage", icon: "🏷️" },
          ].map((m) => (
            <Link key={m.href} href={m.href} className="flex items-start gap-3 rounded-xl border bg-background px-4 py-3 hover:bg-muted/30 transition-colors group">
              <span className="text-xl">{m.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium group-hover:text-primary transition-colors">{m.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{m.desc}</p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary mt-0.5 transition-colors" />
            </Link>
          ))}
        </div>
      </div>
    </ERPPageShell>
  );
}
