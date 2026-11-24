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
import DrawerShell from "@/components/ui/DrawerShell";
import { ROUTES } from "@/lib/routes";
import {
  createAdminPurchaseReturn,
  createAdminVendorProduct,
  getAdminVendorOutstanding,
  listAdminVendorLedger,
  listAdminVendorProducts,
  listAdminVendorPurchaseReturnRegister,
  listAdminVendorPurchaseReturns,
  listAdminVendorPurchases,
  postAdminPurchaseReturn,
  type AdminVendorPurchaseReturn,
  type PurchaseSummary,
  type ReturnSummary,
  type VendorLedgerEntry,
  type VendorOutstanding,
  type VendorProduct,
} from "@/services/vendor-ops";
import { listPurchaseBills } from "@/services/accounting";
import { listVendorBills, listStockLocations, type StockLocation } from "@/services/inventory";
import { getVendor, type Vendor } from "@/services/vendors";
import { changeVendorAccount, getVendorAccountLink, linkVendorAccount, unlinkVendorAccount, type AccountLink } from "@/services/vendor-account-links";
import { VendorPaymentDeskPanel } from "./VendorPaymentDeskPanel";

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
  const [returnList, setReturnList] = useState<AdminVendorPurchaseReturn[]>([]);
  const [returnDrawerOpen, setReturnDrawerOpen] = useState(false);
  const [vendorBills, setVendorBills] = useState<any[]>([]);
  const [selectedBillId, setSelectedBillId] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [returnLines, setReturnLines] = useState<Record<number, string>>({});
  const [stockLocations, setStockLocations] = useState<StockLocation[]>([]);
  const [stockLocationId, setStockLocationId] = useState("");
  const [returnSubmitting, setReturnSubmitting] = useState(false);
  const [returnError, setReturnError] = useState<string | null>(null);
  const [returnNotice, setReturnNotice] = useState<string | null>(null);
  const [billsLoading, setBillsLoading] = useState(false);
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

  const loadReturnList = useCallback(async () => {
    try {
      const res = await listAdminVendorPurchaseReturnRegister({ vendor: id });
      setReturnList(res.results ?? []);
    } catch {
      // Non-blocking
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
      listAdminVendorPurchaseReturnRegister({ vendor: id }),
    ]).then(([v, l, o, a, p, r, ret]) => {
      setVendor(v);
      setLedger(l.results ?? []);
      setOutstanding(String(o.outstanding ?? "0.00"));
      setAccountLink(a);
      setPurchases(p);
      setPurchaseReturns(r);
      setReturnList(ret.results ?? []);
      setLoadError(null);
    }).catch((err) => {
      setLoadError(accountingErrorMessage(err, "Could not load the vendor workspace."));
      setVendor(null);
    }).finally(() => setLoading(false));
  }, [id]);

  const openReturnDrawer = useCallback(async () => {
    setReturnDrawerOpen(true);
    setReturnError(null);
    setSelectedBillId("");
    setReturnLines({});
    setReturnReason("");
    setBillsLoading(true);
    try {
      const [pbRes, vbRes, locRes] = await Promise.all([
        listPurchaseBills({ vendor: id, status: "POSTED" }),
        listVendorBills({ vendor: id, status: "POSTED" }),
        listStockLocations({ is_active: 1, page_size: 100 }),
      ]);
      const pb = Array.isArray(pbRes) ? pbRes : pbRes.results ?? [];
      const vb = Array.isArray(vbRes) ? vbRes : (vbRes as any)?.results ?? [];
      const combined = [
        ...pb.map((b: any) => ({
          ...b,
          _isVendor: false,
          _id: `pb_${b.id}`,
          lines:
            b.lines?.map((l: any) => ({
              id: l.id,
              name: l.inventory_item_product_name || l.description || `Item #${l.inventory_item}`,
              sku: l.inventory_item_sku || "",
              unit_cost: l.unit_cost,
              quantity: l.quantity,
            })) ?? [],
        })),
        ...vb.map((b: any) => ({
          ...b,
          _isVendor: true,
          _id: `vb_${b.id}`,
          lines:
            b.lines?.map((l: any) => ({
              id: l.id,
              name: l.inventory_item_product_name || l.description || `Item #${l.inventory_item}`,
              sku: l.inventory_item_sku || "",
              unit_cost: l.unit_cost,
              quantity: l.quantity,
            })) ?? [],
        })),
      ];
      setVendorBills(combined);
      const locs = Array.isArray(locRes) ? locRes : locRes.results ?? [];
      setStockLocations(locs);
      if (locs.length > 0 && !stockLocationId) {
        setStockLocationId(String(locs[0].id));
      }
    } catch (err) {
      setReturnError(accountingErrorMessage(err, "Could not load vendor bills for return."));
    } finally {
      setBillsLoading(false);
    }
  }, [id, stockLocationId]);

  async function handleCreateReturn(shouldPost: boolean = true) {
    if (!selectedBillId) {
      setReturnError("Please select a purchase bill to return products from.");
      return;
    }
    const bill = vendorBills.find((b) => b._id === selectedBillId);
    if (!bill) return;

    const validLines = Object.entries(returnLines)
      .map(([lineId, qty]) => {
        const q = Number(qty);
        if (q <= 0) return null;
        const payload: any = { quantity: q };
        if (bill._isVendor) payload.vendor_bill_line_id = Number(lineId);
        else payload.purchase_bill_line_id = Number(lineId);
        return payload;
      })
      .filter(Boolean);

    if (validLines.length === 0) {
      setReturnError("Enter a return quantity for at least one item.");
      return;
    }
    if (!returnReason.trim()) {
      setReturnError("Please enter a return reason.");
      return;
    }
    if (!stockLocationId) {
      setReturnError("Please select a stock location.");
      return;
    }

    setReturnSubmitting(true);
    setReturnError(null);
    try {
      const rawBillId = Number(bill._id.split("_")[1]);
      const res = await createAdminPurchaseReturn(
        rawBillId,
        {
          reason: returnReason.trim(),
          stock_location_id: Number(stockLocationId),
          lines: validLines as any,
        },
        bill._isVendor
      );

      if (shouldPost) {
        await postAdminPurchaseReturn(res.id);
      }

      setReturnDrawerOpen(false);
      setReturnNotice(`Purchase return ${res.return_no} created${shouldPost ? " and posted" : ""}.`);
      // Refresh workspace
      const [o, l, r] = await Promise.all([
        getAdminVendorOutstanding(id),
        listAdminVendorLedger(id),
        listAdminVendorPurchaseReturns(id),
      ]);
      setOutstanding(String(o.outstanding ?? "0.00"));
      setLedger(l.results ?? []);
      setPurchaseReturns(r);
      await loadReturnList();
    } catch (err) {
      setReturnError(accountingErrorMessage(err, "Failed to create purchase return."));
    } finally {
      setReturnSubmitting(false);
    }
  }

  async function handlePostExistingReturn(returnId: number) {
    try {
      await postAdminPurchaseReturn(returnId);
      setReturnNotice("Purchase return posted to ledger and inventory updated.");
      const [o, l, r] = await Promise.all([
        getAdminVendorOutstanding(id),
        listAdminVendorLedger(id),
        listAdminVendorPurchaseReturns(id),
      ]);
      setOutstanding(String(o.outstanding ?? "0.00"));
      setLedger(l.results ?? []);
      setPurchaseReturns(r);
      await loadReturnList();
    } catch (err) {
      alert(accountingErrorMessage(err, "Failed to post return."));
    }
  }

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

              <VendorPaymentDeskPanel
                vendorId={id}
                onChanged={() => {
                  void Promise.all([
                    getAdminVendorOutstanding(id),
                    listAdminVendorLedger(id),
                    loadReturnList(),
                  ]).then(([o, l]) => {
                    setOutstanding(String(o.outstanding ?? "0.00"));
                    setLedger(l.results ?? []);
                  });
                }}
              />

              {returnNotice ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800">
                  {returnNotice}
                </div>
              ) : null}

              <div className="grid gap-6 lg:grid-cols-2">
                <SectionCard 
                  title="Purchases" 
                  description="Counts are sourced from the vendor purchase summary endpoints."
                  action={
                    <div className="flex gap-3 text-sm font-medium">
                      <Link className="text-primary hover:underline" href={`${ROUTES.admin.purchaseOrders}?search=${encodeURIComponent(vendorName)}`}>Orders</Link>
                      <Link className="text-primary hover:underline" href={`${ROUTES.admin.purchaseBills}?search=${encodeURIComponent(vendorName)}`}>Bills</Link>
                      <Link className="text-primary hover:underline" href={`${ROUTES.admin.purchaseVendorPayments}?search=${encodeURIComponent(vendorName)}`}>Payments</Link>
                    </div>
                  }
                >
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Link href={`${ROUTES.admin.purchaseOrders}?search=${encodeURIComponent(vendorName)}`} className="hover:opacity-80 transition-opacity">
                      <DetailValue label="Purchase orders" value={<span className="text-primary">{purchases?.purchase_orders_count ?? 0}</span>} />
                    </Link>
                    <Link href={`${ROUTES.admin.purchaseBills}?search=${encodeURIComponent(vendorName)}`} className="hover:opacity-80 transition-opacity">
                      <DetailValue label="Purchase bills" value={<span className="text-primary">{purchases?.purchase_bills_count ?? 0}</span>} />
                    </Link>
                    <Link href={`${ROUTES.admin.purchaseVendorPayments}?search=${encodeURIComponent(vendorName)}`} className="hover:opacity-80 transition-opacity">
                      <DetailValue label="Vendor payments" value={<span className="text-primary">{purchases?.vendor_payments_count ?? 0}</span>} />
                    </Link>
                  </div>
                </SectionCard>

                <SectionCard 
                  title="Purchase returns" 
                  description="Posted totals remain audit-safe and traceable to return documents."
                  action={
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void openReturnDrawer()}
                        className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition"
                      >
                        + Return products
                      </button>
                      <Link className="text-xs font-medium text-primary hover:underline ml-1" href={`${ROUTES.admin.purchaseVendorReturns}?vendor_id=${id}`}>View all</Link>
                    </div>
                  }
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Link href={`${ROUTES.admin.purchaseVendorReturns}?vendor_id=${id}`} className="hover:opacity-80 transition-opacity">
                      <DetailValue label="Returns count" value={<span className="text-primary">{purchaseReturns?.count ?? 0}</span>} />
                    </Link>
                    <DetailValue label="Posted total" value={purchaseReturns?.summary.posted_total ?? "0.00"} />
                  </div>

                  {returnList.length > 0 ? (
                    <div className="mt-3 space-y-2 border-t border-border pt-3">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recent returns</div>
                      <div className="space-y-1.5">
                        {returnList.slice(0, 4).map((ret) => (
                          <div key={ret.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
                            <div>
                              <span className="font-semibold">{ret.return_no}</span> · {ret.return_date} · {ret.purchase_bill_no || "Bill"}
                              <div className="text-[11px] text-muted-foreground">{ret.reason}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold tabular-nums">₹{Number(ret.grand_total).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                              <ERPStatusBadge status={ret.status} size="sm" />
                              {ret.status === "DRAFT" ? (
                                <button
                                  type="button"
                                  onClick={() => void handlePostExistingReturn(ret.id)}
                                  className="rounded bg-sky-700 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-sky-800"
                                >
                                  Post
                                </button>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 text-xs text-muted-foreground">
                      No purchase returns yet. Click &ldquo;+ Return products&rdquo; to initiate a return against posted bills.
                    </div>
                  )}
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

      {/* Return Products Drawer */}
      <DrawerShell
        open={returnDrawerOpen}
        onClose={() => setReturnDrawerOpen(false)}
        title={`Return products to ${vendorName}`}
        description="Select a posted purchase bill and specify return quantities. Returning goods updates inventory and debits Accounts Payable."
        size="wide"
      >
        <div className="space-y-4 text-sm">
          {returnError ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive font-medium">
              {returnError}
            </div>
          ) : null}

          {billsLoading ? (
            <ERPLoadingState label="Loading posted bills and inventory items..." />
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Select posted purchase bill *
                </label>
                <select
                  className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm font-medium"
                  value={selectedBillId}
                  onChange={(e) => {
                    setSelectedBillId(e.target.value);
                    setReturnLines({});
                  }}
                >
                  <option value="">-- Choose a bill to return products from --</option>
                  {vendorBills.map((b) => (
                    <option key={b._id} value={b._id}>
                      {b.bill_no} · {b.bill_date ?? "—"} · Grand total ₹{Number(b.grand_total).toLocaleString("en-IN", { minimumFractionDigits: 2 })} ({b.lines.length} items)
                    </option>
                  ))}
                </select>
                {vendorBills.length === 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    No posted purchase bills found for this vendor. Returns require a posted bill document.
                  </p>
                ) : null}
              </div>

              {selectedBillId ? (
                <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3.5">
                  <div className="text-xs font-semibold uppercase tracking-wide text-foreground">
                    Bill line items to return
                  </div>
                  {(() => {
                    const bill = vendorBills.find((b) => b._id === selectedBillId);
                    if (!bill || !bill.lines || bill.lines.length === 0) {
                      return <div className="text-xs text-muted-foreground">No item lines on this bill.</div>;
                    }
                    return (
                      <div className="space-y-2">
                        {bill.lines.map((line: any) => (
                          <div
                            key={line.id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background p-2.5 text-xs"
                          >
                            <div className="space-y-0.5">
                              <div className="font-semibold text-foreground">{line.name}</div>
                              <div className="text-muted-foreground">
                                SKU: {line.sku || "—"} · Cost: ₹{Number(line.unit_cost).toLocaleString("en-IN", { minimumFractionDigits: 2 })} · Billed qty:{" "}
                                <span className="font-semibold text-foreground">{line.quantity}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  setReturnLines((c) => ({
                                    ...c,
                                    [line.id]: c[line.id] ? "" : String(line.quantity),
                                  }))
                                }
                                className="h-8 rounded-lg border border-border bg-muted/40 px-2 text-xs font-medium hover:bg-muted"
                              >
                                {returnLines[line.id] ? "Clear" : "All"}
                              </button>
                              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                                <span>Qty:</span>
                                <input
                                  type="number"
                                  min="0"
                                  max={line.quantity}
                                  step="any"
                                  placeholder="0"
                                  className="h-8 w-20 rounded-lg border border-border bg-background px-2 text-right font-semibold text-foreground"
                                  value={returnLines[line.id] ?? ""}
                                  onChange={(e) =>
                                    setReturnLines((c) => ({
                                      ...c,
                                      [line.id]: e.target.value,
                                    }))
                                  }
                                />
                              </label>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    Source stock location *
                  </label>
                  <select
                    className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
                    value={stockLocationId}
                    onChange={(e) => setStockLocationId(e.target.value)}
                  >
                    <option value="">Select location</option>
                    {stockLocations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name} ({loc.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    Return reason *
                  </label>
                  <input
                    className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
                    placeholder="e.g. Defective items / Advance return"
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <div className="text-xs text-muted-foreground mb-1">Quick reasons:</div>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    "Defective / damaged items",
                    "Advance return - unfulfilled items",
                    "Excess delivery returned",
                    "Wrong product specifications",
                    "Order cancelled",
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setReturnReason(preset)}
                      className="rounded-lg border border-border bg-muted/30 px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
                <button
                  type="button"
                  disabled={returnSubmitting}
                  onClick={() => setReturnDrawerOpen(false)}
                  className="h-10 rounded-xl border border-border bg-background px-4 text-sm font-semibold hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={returnSubmitting || !selectedBillId}
                  onClick={() => void handleCreateReturn(false)}
                  className="h-10 rounded-xl border border-border bg-background px-4 text-sm font-semibold hover:bg-muted disabled:opacity-50"
                >
                  {returnSubmitting ? "Saving…" : "Save draft return"}
                </button>
                <button
                  type="button"
                  disabled={returnSubmitting || !selectedBillId}
                  onClick={() => void handleCreateReturn(true)}
                  className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-95 disabled:opacity-50"
                >
                  {returnSubmitting ? "Posting…" : "Create & post return"}
                </button>
              </div>
            </>
          )}
        </div>
      </DrawerShell>
    </ERPPageShell>
  );
}
