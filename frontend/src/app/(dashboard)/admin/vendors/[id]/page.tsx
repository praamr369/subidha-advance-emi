"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { accountingErrorMessage } from "@/components/accounting/shared";
import PortalPage from "@/components/ui/PortalPage";
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
    <PortalPage
      title={String(vendor?.display_name || vendor?.name || "Vendor")}
      subtitle="Vendor profile, sourcing visibility, ledger, procurement links, and product catalog."
      breadcrumbs={[{ label: "Admin", href: ROUTES.admin.dashboard }, { label: "Vendors", href: ROUTES.admin.vendors }, { label: String(vendor?.name || id) }]}
      actions={[
        { href: ROUTES.admin.vendorsQuotes, label: "Vendor quotes", variant: "secondary" },
        { href: ROUTES.admin.purchaseOrders, label: "Purchase orders", variant: "primary" },
      ]}
    >
      <div className="mb-4 flex gap-2 border-b border-border pb-2 text-sm">
        <button
          type="button"
          className={`rounded px-3 py-1 ${tab === "overview" ? "bg-muted font-medium" : "text-muted-foreground"}`}
          onClick={() => setTab("overview")}
        >
          Overview
        </button>
        <button
          type="button"
          className={`rounded px-3 py-1 ${tab === "products" ? "bg-muted font-medium" : "text-muted-foreground"}`}
          onClick={() => setTab("products")}
        >
          Products
        </button>
      </div>

      {tab === "overview" ? (
        <div className="space-y-4">
          <div className="rounded border p-3 text-sm">
            <div>Vendor Code: {String(vendor?.vendor_code || "—")}</div>
            <div>Contact: {String(vendor?.contact_person || "—")}</div>
            <div>Status: {String(vendor?.status || "—")}</div>
            <div>Outstanding: {outstanding}</div>
          </div>
          <div className="rounded border p-3 text-sm">
            <div className="font-medium mb-2">Purchases</div>
            <div>Purchase Orders: {String(purchases?.purchase_orders_count || 0)}</div>
            <div>Purchase Bills: {String(purchases?.purchase_bills_count || 0)}</div>
            <div>Vendor Payments: {String(purchases?.vendor_payments_count || 0)}</div>
          </div>
          <div className="rounded border p-3 text-sm">
            <div className="font-medium mb-2">Purchase Returns</div>
            <div>Returns Count: {String(purchaseReturns?.count || 0)}</div>
            <div>Posted Total: {String((purchaseReturns?.summary as Record<string, unknown> | undefined)?.posted_total || "0.00")}</div>
          </div>
          <div className="rounded border p-3 text-sm">
            <div className="font-medium mb-2">Ledger</div>
            <div className="space-y-1">
              {ledger.map((row, idx) => (
                <div key={idx}>
                  {String(row.entry_type)} - Dr {String(row.debit)} / Cr {String(row.credit)} / Bal {String(row.balance_after)}
                </div>
              ))}
              {ledger.length === 0 ? <div className="text-muted-foreground">No ledger rows.</div> : null}
            </div>
          </div>
          <div className="rounded border p-3 text-sm space-y-2">
            <div className="font-medium">Account Access Panel</div>
            <div>Current Linked User ID: {String(accountLink?.linked_user_id || "—")}</div>
            <div className="flex flex-wrap gap-2">
              <input className="h-9 rounded border px-2" placeholder="User ID" value={userId} onChange={(e) => setUserId(e.target.value)} />
              <input className="h-9 rounded border px-2 min-w-[280px]" placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
              <button className="h-9 rounded border px-3" type="button" onClick={() => void runLink("link")}>Link User</button>
              <button className="h-9 rounded border px-3" type="button" onClick={() => void runLink("change")}>Change User</button>
              <button className="h-9 rounded border px-3" type="button" onClick={() => void runLink("unlink")}>Unlink User</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4 text-sm">
          {prodError ? <div className="rounded border border-destructive/40 bg-destructive/10 p-3 text-destructive">{prodError}</div> : null}
          <form className="rounded border p-3 space-y-2" onSubmit={(e) => void addProduct(e)}>
            <div className="font-medium">Add catalog line</div>
            <div className="flex flex-wrap gap-2">
              <input className="h-9 min-w-[160px] rounded border px-2" placeholder="Product name *" value={npName} onChange={(e) => setNpName(e.target.value)} />
              <input className="h-9 w-28 rounded border px-2" placeholder="SKU" value={npSku} onChange={(e) => setNpSku(e.target.value)} />
              <input className="h-9 min-w-[120px] rounded border px-2" placeholder="Category text" value={npCategory} onChange={(e) => setNpCategory(e.target.value)} />
              <input className="h-9 w-28 rounded border px-2" placeholder="Base price" value={npPrice} onChange={(e) => setNpPrice(e.target.value)} />
              <input className="h-9 w-24 rounded border px-2" placeholder="Lead days" value={npLead} onChange={(e) => setNpLead(e.target.value)} />
              <button className="h-9 rounded border px-3" type="submit" disabled={npSubmitting}>
                {npSubmitting ? "Saving…" : "Add product"}
              </button>
            </div>
          </form>

          <div className="rounded border p-3">
            <div className="mb-2 font-medium">Vendor products</div>
            {prodLoading ? <div>Loading…</div> : null}
            {!prodLoading && products.length === 0 ? <div className="text-muted-foreground">No products yet.</div> : null}
            <div className="space-y-1">
              {products.map((row) => (
                <div key={String(row.id)} className="flex flex-wrap justify-between gap-2 border-b border-border py-1 last:border-0">
                  <div>
                    <div className="font-medium">{String(row.product_name || "—")}</div>
                    <div className="text-muted-foreground text-xs">
                      SKU {String(row.vendor_sku || "—")} · Cat {String(row.category_text || "—")}
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <div>{String(row.base_quote_price ?? "—")}</div>
                    <div>{row.active === false ? "Inactive" : "Active"}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <Link className="text-primary underline text-sm" href={ROUTES.admin.vendorsQuotes}>
              Open vendor RFQ workspace
            </Link>
          </div>
        </div>
      )}
    </PortalPage>
  );
}
