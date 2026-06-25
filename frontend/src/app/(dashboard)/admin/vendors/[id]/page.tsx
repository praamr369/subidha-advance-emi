"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { accountingErrorMessage } from "@/components/accounting/shared";
import ERPDataToolbar from "@/components/erp/ERPDataToolbar";
import ERPDetailGrid from "@/components/erp/ERPDetailGrid";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import KycDocumentPanel from "@/components/kyc/KycDocumentPanel";
import { ROUTES } from "@/lib/routes";
import {
  createAdminVendorProduct,
  getAdminVendor,
  getAdminVendorOutstanding,
  listAdminVendorLedger,
  listAdminVendorProducts,
  listAdminVendorPurchaseReturns,
  listAdminVendorPurchases,
} from "@/services/vendor-ops";
import { changeVendorAccount, getVendorAccountLink, linkVendorAccount, unlinkVendorAccount } from "@/services/vendor-account-links";

type TabKey = "overview" | "products";

export default function AdminVendorDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [tab, setTab] = useState<TabKey>("overview");

  const [vendor, setVendor] = useState<Record<string, unknown> | null>(null);
  const [ledger, setLedger] = useState<Record<string, unknown>[]>([]);
  const [outstanding, setOutstanding] = useState<string>("0.00");
  const [accountLink, setAccountLink] = useState<Record<string, unknown> | null>(null);
  const [purchases, setPurchases] = useState<Record<string, unknown> | null>(null);
  const [purchaseReturns, setPurchaseReturns] = useState<Record<string, unknown> | null>(null);
  const [userId, setUserId] = useState("");
  const [reason, setReason] = useState("");

  const [products, setProducts] = useState<Record<string, unknown>[]>([]);
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
      const p = (await listAdminVendorProducts(id)) as { results?: Record<string, unknown>[] };
      setProducts(p.results ?? []);
      setProdError(null);
    } catch (err) {
      setProdError(accountingErrorMessage(err, "Could not load vendor products."));
    } finally {
      setProdLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void Promise.all([
      getAdminVendor(id),
      listAdminVendorLedger(id),
      getAdminVendorOutstanding(id),
      getVendorAccountLink(id),
      listAdminVendorPurchases(id),
      listAdminVendorPurchaseReturns(id),
    ]).then(([v, l, o, a, p, r]) => {
      const ledgerPayload = l as { results?: Record<string, unknown>[] };
      const outstandingPayload = o as { outstanding?: string | number };
      setVendor(v as Record<string, unknown>);
      setLedger(ledgerPayload.results || []);
      setOutstanding(String(outstandingPayload.outstanding || "0.00"));
      setAccountLink(a as Record<string, unknown>);
      setPurchases(p as Record<string, unknown>);
      setPurchaseReturns(r as Record<string, unknown>);
    });
  }, [id]);

  useEffect(() => {
    if (tab === "products") void loadProducts();
  }, [tab, loadProducts]);

  async function runLink(mode: "link" | "change" | "unlink") {
    if (!reason.trim()) return;
    if (mode === "unlink") {
      await unlinkVendorAccount(id, { reason });
    } else if (mode === "change") {
      await changeVendorAccount(id, { user_id: Number(userId), reason });
    } else {
      await linkVendorAccount(id, { user_id: Number(userId), reason });
    }
    const latest = (await getVendorAccountLink(id)) as Record<string, unknown>;
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

  return (
    <ERPPageShell
      eyebrow="Purchases & Vendors"
      title={String(vendor?.display_name || vendor?.name || "Vendor")}
      subtitle="Vendor profile, sourcing visibility, ledger, procurement links, and product catalog."
      breadcrumbs={[{ label: "Admin", href: ROUTES.admin.dashboard }, { label: "Vendors", href: ROUTES.admin.vendors }, { label: String(vendor?.name || id) }]}
      actions={[
        { href: ROUTES.admin.vendorsQuotes, label: "Vendor quotes", variant: "secondary" },
        { href: ROUTES.admin.purchaseOrders, label: "Purchase orders", variant: "primary" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    >
      <ERPDataToolbar
        left={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={`h-10 rounded-xl border px-4 text-sm font-semibold transition ${tab === "overview" ? "border-border bg-muted" : "border-border/60 bg-background text-muted-foreground hover:bg-muted/60"}`}
              onClick={() => setTab("overview")}
            >
              Overview
            </button>
            <button
              type="button"
              className={`h-10 rounded-xl border px-4 text-sm font-semibold transition ${tab === "products" ? "border-border bg-muted" : "border-border/60 bg-background text-muted-foreground hover:bg-muted/60"}`}
              onClick={() => setTab("products")}
            >
              Products
            </button>
          </div>
        }
        right={<ERPStatusBadge status={String(vendor?.status || "—")} size="md" />}
      />

      {tab === "overview" ? (
        <div className="space-y-4">
          <ERPSectionShell
            title="Vendor snapshot"
            description="Vendor master profile and payable visibility. Procurement and accounting remain source-of-truth for posting and settlement."
          >
            <ERPDetailGrid
              columns={4}
              items={[
                { label: "Vendor code", value: String(vendor?.vendor_code || "—") },
                { label: "Contact", value: String(vendor?.contact_person || "—") },
                { label: "Status", value: String(vendor?.status || "—") },
                { label: "Outstanding", value: String(outstanding) },
              ]}
            />
          </ERPSectionShell>

          <div className="grid gap-4 lg:grid-cols-2">
            <ERPSectionShell title="Purchases" description="Counts are sourced from the vendor purchase summary endpoints.">
              <ERPDetailGrid
                columns={3}
                items={[
                  { label: "Purchase orders", value: String(purchases?.purchase_orders_count || 0) },
                  { label: "Purchase bills", value: String(purchases?.purchase_bills_count || 0) },
                  { label: "Vendor payments", value: String(purchases?.vendor_payments_count || 0) },
                ]}
              />
            </ERPSectionShell>

            <ERPSectionShell title="Purchase returns" description="Posted totals remain audit-safe and traceable to return documents.">
              <ERPDetailGrid
                columns={2}
                items={[
                  { label: "Returns count", value: String(purchaseReturns?.count || 0) },
                  {
                    label: "Posted total",
                    value: String(
                      (purchaseReturns?.summary as Record<string, unknown> | undefined)?.posted_total || "0.00"
                    ),
                  },
                ]}
              />
            </ERPSectionShell>
          </div>

          <ERPSectionShell title="Ledger preview" description="Ledger is read-only here; full drill-down remains in the accounting vendor control room.">
            <div className="space-y-2 text-sm">
              {ledger.map((row, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-border bg-muted/40 px-3 py-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium">{String(row.entry_type)}</div>
                    <div className="text-xs text-muted-foreground">
                      Dr {String(row.debit)} / Cr {String(row.credit)}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">Balance {String(row.balance_after)}</div>
                </div>
              ))}
              {ledger.length === 0 ? <div className="text-sm text-muted-foreground">No ledger rows.</div> : null}
            </div>
          </ERPSectionShell>

          <ERPSectionShell
            title="Account access panel"
            description="Linking controls access only. Purchasing, posting, and settlement remain governed by existing role permissions and services."
            actions={
              <div className="text-sm text-muted-foreground">
                Linked user ID: <span className="font-semibold text-foreground">{String(accountLink?.linked_user_id || "—")}</span>
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
          </ERPSectionShell>

          <KycDocumentPanel mode="admin" owner="vendor" ownerId={id} />
        </div>
      ) : (
        <div className="space-y-4 text-sm">
          {prodError ? <ERPErrorState title="Unable to load vendor products" description={prodError} /> : null}
          <ERPSectionShell
            title="Add catalog line"
            description="Adds a vendor-scoped catalog line used by RFQ and procurement workflows."
          >
            <div className="flex flex-wrap gap-2">
              <form className="flex flex-wrap gap-2" onSubmit={(e) => void addProduct(e)}>
                <input className="h-10 min-w-[160px] rounded-xl border border-border bg-background px-3" placeholder="Product name *" value={npName} onChange={(e) => setNpName(e.target.value)} />
                <input className="h-10 w-28 rounded-xl border border-border bg-background px-3" placeholder="SKU" value={npSku} onChange={(e) => setNpSku(e.target.value)} />
                <input className="h-10 min-w-[120px] rounded-xl border border-border bg-background px-3" placeholder="Category text" value={npCategory} onChange={(e) => setNpCategory(e.target.value)} />
                <input className="h-10 w-28 rounded-xl border border-border bg-background px-3" placeholder="Base price" value={npPrice} onChange={(e) => setNpPrice(e.target.value)} />
                <input className="h-10 w-28 rounded-xl border border-border bg-background px-3" placeholder="Lead days" value={npLead} onChange={(e) => setNpLead(e.target.value)} />
                <button className="h-10 rounded-xl border border-border bg-background px-4 text-sm font-semibold transition hover:bg-muted disabled:opacity-50" type="submit" disabled={npSubmitting}>
                  {npSubmitting ? "Saving…" : "Add product"}
                </button>
              </form>
            </div>
          </ERPSectionShell>

          <ERPSectionShell
            title="Vendor products"
            description="Catalog lines visible to sourcing and RFQ workflows."
            actions={<Link className="text-sm font-medium text-primary underline" href={ROUTES.admin.vendorsQuotes}>Open RFQ workspace</Link>}
          >
            {prodLoading ? <ERPLoadingState label="Loading products..." /> : null}
            {!prodLoading && products.length === 0 ? <div className="text-sm text-muted-foreground">No products yet.</div> : null}
            {!prodLoading && products.length > 0 ? (
              <div className="space-y-2">
                {products.map((row) => (
                  <div
                    key={String(row.id)}
                    className="flex flex-wrap justify-between gap-3 rounded-xl border border-border bg-muted/40 px-3 py-2"
                  >
                    <div>
                      <div className="font-semibold">{String(row.product_name || "—")}</div>
                      <div className="text-xs text-muted-foreground">
                        SKU {String(row.vendor_sku || "—")} · Cat {String(row.category_text || "—")}
                      </div>
                    </div>
                    <div className="text-right text-xs">
                      <div className="tabular-nums">{String(row.base_quote_price ?? "—")}</div>
                      <ERPStatusBadge status={row.active === false ? "INACTIVE" : "ACTIVE"} />
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </ERPSectionShell>

          <div className="text-xs text-muted-foreground">
            Tip: Use <span className="font-medium text-foreground">Vendor quotes</span> to compare and accept vendor responses; procurement documents remain posted through purchase modules.
          </div>
        </div>
      )}
    </ERPPageShell>
  );
}
