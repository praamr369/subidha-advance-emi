"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { accountingErrorMessage } from "@/components/accounting/shared";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import KycDocumentPanel from "@/components/kyc/KycDocumentPanel";
import { Party360Embed, UniversalQuickWidgetsEmbed } from "@/components/profile/Profile360";
import { WorkbenchFilterChips } from "@/components/workbench/WorkbenchFilterChips";
import {
  DetailItem as DetailValue,
  WorkspaceSection as SectionCard,
} from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import {
  createAdminVendorProduct,
  getAdminVendorOutstanding,
  listAdminVendorLedger,
  listAdminVendorProducts,
  listAdminVendorPurchaseReturns,
  listAdminVendorPurchases,
  type PurchaseSummary,
  type ReturnSummary,
  type VendorLedgerEntry,
  type VendorOutstanding,
  type VendorProduct,
} from "@/services/vendor-ops";
import { getVendor, type Vendor } from "@/services/vendors";
import { changeVendorAccount, getVendorAccountLink, linkVendorAccount, unlinkVendorAccount, type AccountLink } from "@/services/vendor-account-links";

// ── page ─────────────────────────────────────────────────────────────────────

type Segment = "overview" | "operations" | "products";

const SEGMENTS: { key: Segment; label: string }[] = [
  { key: "overview", label: "Overview & Actions" },
  { key: "operations", label: "Operations 360" },
  { key: "products", label: "Products" },
];

export default function AdminVendorDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [segment, setSegment] = useState<Segment>("overview");

  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ledger, setLedger] = useState<VendorLedgerEntry[]>([]);
  const [outstanding, setOutstanding] = useState("0.00");
  const [accountLink, setAccountLink] = useState<AccountLink | null>(null);
  const [purchases, setPurchases] = useState<PurchaseSummary | null>(null);
  const [purchaseReturns, setPurchaseReturns] = useState<ReturnSummary | null>(null);
  const [userId, setUserId] = useState("");
  const [reason, setReason] = useState("");

  const [products, setProducts] = useState<VendorProduct[]>([]);
  const [prodLoading, setProdLoading] = useState(false);
  const [prodError, setProdError] = useState<string | null>(null);

  const [npName, setNpName] = useState("");
  const [npSku, setNpSku] = useState("");
  const [npCategory, setNpCategory] = useState("");
  const [npPrice, setNpPrice] = useState("");
  const [npLead, setNpLead] = useState("");
  const [npSubmitting, setNpSubmitting] = useState(false);

  const loadProducts = useCallback(async () => {
    setProdLoading(true);
    try {
      const p = await listAdminVendorProducts(id);
      setProducts(p.results ?? []);
      setProdError(null);
    } catch (err) {
      setProdError(accountingErrorMessage(err, "Could not load vendor products."));
    } finally {
      setProdLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!Number.isFinite(id) || id < 1) {
      setLoadError("Invalid vendor identifier.");
      setLoading(false);
      return;
    }
    setLoading(true);
    void Promise.all([
      getVendor(id),
      listAdminVendorLedger(id),
      getAdminVendorOutstanding(id),
      getVendorAccountLink(id),
      listAdminVendorPurchases(id),
      listAdminVendorPurchaseReturns(id),
    ]).then(([v, l, o, a, p, r]) => {
      setVendor(v);
      setLedger(l.results ?? []);
      setOutstanding(String(o.outstanding ?? "0.00"));
      setAccountLink(a);
      setPurchases(p);
      setPurchaseReturns(r);
      setLoadError(null);
    }).catch((err) => {
      setLoadError(accountingErrorMessage(err, "Could not load the vendor workspace."));
      setVendor(null);
    }).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (segment === "products") void loadProducts();
  }, [segment, loadProducts]);

  async function runLink(mode: "link" | "change" | "unlink") {
    if (!reason.trim()) return;
    if (mode === "unlink") {
      await unlinkVendorAccount(id, { reason });
    } else if (mode === "change") {
      await changeVendorAccount(id, { user_id: Number(userId), reason });
    } else {
      await linkVendorAccount(id, { user_id: Number(userId), reason });
    }
    const latest = await getVendorAccountLink(id);
    setAccountLink(latest);
    setReason("");
  }

  async function addProduct(ev: React.FormEvent) {
    ev.preventDefault();
    if (!npName.trim()) return;
    setNpSubmitting(true);
    try {
      await createAdminVendorProduct(id, {
        product_name: npName.trim(),
        vendor_sku: npSku.trim(),
        category_text: npCategory.trim(),
        base_quote_price: npPrice.trim() || "0.00",
        lead_time_days: npLead.trim() ? Number(npLead.trim()) : 0,
        min_order_qty: "1.000",
        active: true,
      });
      setNpName("");
      setNpSku("");
      setNpCategory("");
      setNpPrice("");
      setNpLead("");
      await loadProducts();
    } catch (err) {
      setProdError(accountingErrorMessage(err, "Could not create product."));
    } finally {
      setNpSubmitting(false);
    }
  }

  const vendorName = vendor?.display_name || vendor?.name || "Vendor";

  return (
    <ERPPageShell
      eyebrow="Purchases & Vendors"
      title={vendorName}
      subtitle="Vendor profile, sourcing visibility, ledger, procurement links, and product catalog."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Vendors", href: ROUTES.admin.vendors },
        { label: vendor?.name ?? String(id) },
      ]}
      actions={[
        { href: ROUTES.admin.vendorsQuotes, label: "Vendor quotes", variant: "secondary" },
        { href: ROUTES.admin.purchaseOrders, label: "Purchase orders", variant: "primary" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    >
      {loading ? <ERPLoadingState label="Loading vendor workspace..." /> : null}
      {!loading && loadError ? <ERPErrorState title="Unable to load vendor" description={loadError} /> : null}
      {!loading && !loadError ? (
        <div className="space-y-6">
          {/* Segmented workbench navigation */}
          <div className="sticky top-0 z-10 -mx-2 flex flex-wrap items-center justify-between gap-3 bg-background/95 px-2 py-3 backdrop-blur sm:-mx-6 sm:px-6">
            <WorkbenchFilterChips
              active={segment}
              onSelect={(key) => setSegment(key as Segment)}
              chips={SEGMENTS}
            />
            <ERPStatusBadge status={vendor?.status ?? "—"} size="md" />
          </div>

          {segment === "overview" ? (
            <div className="space-y-6">
              <UniversalQuickWidgetsEmbed role="VENDOR" sourceId={id} />

              <SectionCard
                title="Vendor snapshot"
                description="Vendor master profile and payable visibility. Procurement and accounting remain source-of-truth for posting and settlement."
              >
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <DetailValue label="Vendor code" value={vendor?.vendor_code ?? "—"} />
                  <DetailValue label="Contact" value={vendor?.contact_person ?? "—"} />
                  <DetailValue label="Status" value={vendor?.status ?? "—"} />
                  <DetailValue label="Outstanding" value={outstanding} />
                </div>
              </SectionCard>

              <div className="grid gap-6 lg:grid-cols-2">
                <SectionCard title="Purchases" description="Counts are sourced from the vendor purchase summary endpoints.">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <DetailValue label="Purchase orders" value={purchases?.purchase_orders_count ?? 0} />
                    <DetailValue label="Purchase bills" value={purchases?.purchase_bills_count ?? 0} />
                    <DetailValue label="Vendor payments" value={purchases?.vendor_payments_count ?? 0} />
                  </div>
                </SectionCard>

                <SectionCard title="Purchase returns" description="Posted totals remain audit-safe and traceable to return documents.">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <DetailValue label="Returns count" value={purchaseReturns?.count ?? 0} />
                    <DetailValue label="Posted total" value={purchaseReturns?.summary.posted_total ?? "0.00"} />
                  </div>
                </SectionCard>
              </div>

              <SectionCard title="Ledger preview" description="Ledger is read-only here; full drill-down remains in the accounting vendor control room.">
                <div className="space-y-2 text-sm">
                  {ledger.map((row) => (
                    <div
                      key={row.id}
                      className="rounded-xl border border-border bg-muted/40 px-3 py-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-medium">{row.entry_type.replace(/_/g, " ")}</div>
                        <div className="text-xs text-muted-foreground">
                          Dr {row.debit} / Cr {row.credit}
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">Balance {row.balance_after}</div>
                    </div>
                  ))}
                  {ledger.length === 0 ? <div className="text-sm text-muted-foreground">No ledger rows.</div> : null}
                </div>
              </SectionCard>

              <SectionCard
                title="Account access panel"
                description="Linking controls access only. Purchasing, posting, and settlement remain governed by existing role permissions and services."
                action={
                  <div className="text-sm text-muted-foreground">
                    Linked user ID:{" "}
                    <span className="font-semibold text-foreground">
                      {accountLink?.linked_user_id ?? "—"}
                    </span>
                  </div>
                }
              >
                <div className="flex flex-wrap gap-2">
                  <input
                    className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
                    placeholder="User ID"
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                  />
                  <input
                    className="h-10 min-w-[260px] flex-1 rounded-xl border border-border bg-background px-3 text-sm"
                    placeholder="Reason (required)"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <button
                    className="h-10 rounded-xl border border-border px-4 text-sm font-semibold transition hover:bg-muted"
                    type="button"
                    onClick={() => void runLink("link")}
                  >
                    Link user
                  </button>
                  <button
                    className="h-10 rounded-xl border border-border px-4 text-sm font-semibold transition hover:bg-muted"
                    type="button"
                    onClick={() => void runLink("change")}
                  >
                    Change user
                  </button>
                  <button
                    className="h-10 rounded-xl border border-border px-4 text-sm font-semibold transition hover:bg-muted"
                    type="button"
                    onClick={() => void runLink("unlink")}
                  >
                    Unlink user
                  </button>
                </div>
              </SectionCard>

              <KycDocumentPanel mode="admin" owner="vendor" ownerId={id} />
            </div>
          ) : null}

          {segment === "operations" ? <Party360Embed role="VENDOR" sourceId={id} /> : null}

          {segment === "products" ? (
            <div className="space-y-6 text-sm">
              {prodError ? <ERPErrorState title="Unable to load vendor products" description={prodError} /> : null}
              <SectionCard
                title="Add catalog line"
                description="Adds a vendor-scoped catalog line used by RFQ and procurement workflows."
              >
                <form className="flex flex-wrap gap-2" onSubmit={(e) => void addProduct(e)}>
                  <input className="h-10 min-w-[160px] rounded-xl border border-border bg-background px-3" placeholder="Product name *" value={npName} onChange={(e) => setNpName(e.target.value)} />
                  <input className="h-10 w-28 rounded-xl border border-border bg-background px-3" placeholder="SKU" value={npSku} onChange={(e) => setNpSku(e.target.value)} />
                  <input className="h-10 min-w-[120px] rounded-xl border border-border bg-background px-3" placeholder="Category text" value={npCategory} onChange={(e) => setNpCategory(e.target.value)} />
                  <input className="h-10 w-28 rounded-xl border border-border bg-background px-3" placeholder="Base price" value={npPrice} onChange={(e) => setNpPrice(e.target.value)} />
                  <input className="h-10 w-28 rounded-xl border border-border bg-background px-3" placeholder="Lead days" value={npLead} onChange={(e) => setNpLead(e.target.value)} />
                  <button
                    className="h-10 rounded-xl border border-border bg-background px-4 text-sm font-semibold transition hover:bg-muted disabled:opacity-50"
                    type="submit"
                    disabled={npSubmitting}
                  >
                    {npSubmitting ? "Saving…" : "Add product"}
                  </button>
                </form>
              </SectionCard>

              <SectionCard
                title="Vendor products"
                description="Catalog lines visible to sourcing and RFQ workflows."
                action={
                  <Link className="text-sm font-medium text-primary underline" href={ROUTES.admin.vendorsQuotes}>
                    Open RFQ workspace
                  </Link>
                }
              >
                {prodLoading ? <ERPLoadingState label="Loading products..." /> : null}
                {!prodLoading && products.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No products yet.</div>
                ) : null}
                {!prodLoading && products.length > 0 ? (
                  <div className="space-y-2">
                    {products.map((row) => (
                      <div
                        key={row.id}
                        className="flex flex-wrap justify-between gap-3 rounded-xl border border-border bg-muted/40 px-3 py-2"
                      >
                        <div>
                          <div className="font-semibold">{row.product_name || "—"}</div>
                          <div className="text-xs text-muted-foreground">
                            SKU {row.vendor_sku || "—"} · Cat {row.category_text || "—"}
                          </div>
                        </div>
                        <div className="text-right text-xs">
                          <div className="tabular-nums">{row.base_quote_price ?? "—"}</div>
                          <ERPStatusBadge status={row.active ? "ACTIVE" : "INACTIVE"} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </SectionCard>

              <div className="text-xs text-muted-foreground">
                Tip: Use{" "}
                <span className="font-medium text-foreground">Vendor quotes</span> to compare and accept vendor responses; procurement documents remain posted through purchase modules.
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </ERPPageShell>
  );
}
