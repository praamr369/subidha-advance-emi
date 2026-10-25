"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";
import {
  createRentalAsset,
  fetchNextRentalAssetCode,
  listRentalAssets,
  releaseRentalAsset,
  type RentalAssetPage,
} from "@/services/customer-intelligence";
import { listProducts, type ProductRecord } from "@/services/products";

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: "", label: "All" },
  { value: "AVAILABLE", label: "Available" },
  { value: "RESERVED", label: "Reserved" },
  { value: "HANDED_OVER", label: "On hire" },
  { value: "RETURNED", label: "Returned" },
  { value: "UNDER_REPAIR", label: "Under repair" },
  { value: "RETIRED", label: "Retired" },
];

const RELEASABLE = new Set(["RETURNED", "UNDER_REPAIR"]);

const STATUS_TONE: Record<string, string> = {
  AVAILABLE: "border-emerald-200 bg-emerald-50 text-emerald-800",
  RESERVED: "border-sky-200 bg-sky-50 text-sky-800",
  HANDED_OVER: "border-indigo-200 bg-indigo-50 text-indigo-800",
  RETURNED: "border-amber-200 bg-amber-50 text-amber-800",
  UNDER_REPAIR: "border-orange-200 bg-orange-50 text-orange-800",
  RETIRED: "border-border bg-muted text-muted-foreground",
};

export default function RentalAssetsPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<RentalAssetPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Register modal states
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [formProductId, setFormProductId] = useState("");
  const [formAssetCode, setFormAssetCode] = useState("");
  const [formSerialNo, setFormSerialNo] = useState("");
  const [formPurchaseCost, setFormPurchaseCost] = useState("");
  const [formConditionGrade, setFormConditionGrade] = useState("GOOD");

  const loadProducts = useCallback(async () => {
    if (products.length > 0 || productsLoading) return;
    setProductsLoading(true);
    try {
      const items = await listProducts();
      setProducts(items.filter((p) => p.is_active !== false));
    } catch {
      // ignore product load error
    } finally {
      setProductsLoading(false);
    }
  }, [products.length, productsLoading]);

  async function handleProductChange(productIdStr: string) {
    setFormProductId(productIdStr);
    if (!productIdStr) {
      setFormAssetCode("");
      return;
    }
    const selectedProd = products.find((p) => String(p.id) === productIdStr);
    if (selectedProd?.base_price) {
      setFormPurchaseCost(selectedProd.base_price);
    }
    try {
      const res = await fetchNextRentalAssetCode(Number(productIdStr));
      if (res.suggested_asset_code) {
        setFormAssetCode(res.suggested_asset_code);
      }
    } catch {
      // fallback
      setFormAssetCode(`RA-PROD${productIdStr}-001`);
    }
  }

  async function handleRegisterSubmit() {
    if (!formProductId) {
      setRegisterError("Please select a product.");
      return;
    }
    setRegisterLoading(true);
    setRegisterError(null);
    try {
      await createRentalAsset({
        product: Number(formProductId),
        asset_code: formAssetCode.trim() || undefined,
        serial_no: formSerialNo.trim() || undefined,
        purchase_cost: formPurchaseCost.trim() || undefined,
        condition_grade: formConditionGrade,
      });
      setActionMessage(`Unit registered successfully${formAssetCode ? ` as ${formAssetCode}` : ""} and added to the rental fleet.`);
      setShowRegisterModal(false);
      setFormProductId("");
      setFormAssetCode("");
      setFormSerialNo("");
      setFormPurchaseCost("");
      setFormConditionGrade("GOOD");
      await load();
    } catch (err) {
      setRegisterError(err instanceof Error ? err.message : "Failed to register rental asset.");
    } finally {
      setRegisterLoading(false);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await listRentalAssets({ status: statusFilter || undefined, page }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load rental assets.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function release(assetId: number, assetCode: string) {
    setBusyId(assetId);
    setActionError(null);
    setActionMessage(null);
    try {
      await releaseRentalAsset(assetId);
      setActionMessage(`${assetCode} released — available to hire again.`);
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Release failed.");
    } finally {
      setBusyId(null);
    }
  }

  const rows = data?.results ?? [];

  return (
    <ERPPageShell
      eyebrow="Sales"
      title="Rental Assets"
      subtitle="Every physical unit you hire out on rent or lease. Units back from hire stay out of the pool until you release them."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Rent/Lease", href: ROUTES.admin.rentLease },
        { label: "Rental Assets" },
      ]}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
            {STATUS_FILTERS.map((filter) => (
              <button
                key={filter.value || "all"}
                type="button"
                aria-pressed={statusFilter === filter.value}
                onClick={() => {
                  setStatusFilter(filter.value);
                  setPage(1);
                }}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  statusFilter === filter.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground hover:bg-muted"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              setShowRegisterModal((prev) => !prev);
              void loadProducts();
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-95"
          >
            {showRegisterModal ? "Close Drawer" : "+ Register Unit"}
          </button>
        </div>

        {/* Tip for store operators */}
        <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-3 text-xs text-sky-900 flex items-start gap-2">
          <span className="font-bold text-sky-700">💡 Automated Fleet Tagging:</span>
          <span>
            When brand-new furniture returns from its 1st rental or lease contract, approving the return inspection
            automatically assigns a sequential asset tag (e.g. <code className="bg-sky-100 px-1 py-0.5 rounded font-mono font-semibold">RA-SOFA-001</code>)
            and registers it into your available pool. You can also manually register existing shop units using the button above.
          </span>
        </div>

        {showRegisterModal && (
          <div className="rounded-xl border border-primary/30 bg-card p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Register Physical Rental Asset</h3>
                <p className="text-xs text-muted-foreground">
                  Serialize a furniture piece for your reusable rental fleet. Code auto-generates sequentially.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowRegisterModal(false)}
                className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
            </div>

            {registerError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {registerError}
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="text-xs font-medium text-foreground">Select Product *</label>
                <select
                  value={formProductId}
                  onChange={(e) => void handleProductChange(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-xs"
                >
                  <option value="">-- Choose Product --</option>
                  {products.map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      {p.name} {p.product_code ? `(${p.product_code})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-foreground">Asset Code / Tag *</label>
                <input
                  type="text"
                  value={formAssetCode}
                  onChange={(e) => setFormAssetCode(e.target.value)}
                  placeholder="e.g. RA-SOFA-001"
                  className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-xs font-mono font-medium"
                />
                <span className="text-[10px] text-muted-foreground">Auto-generated, or scan physical barcode</span>
              </div>

              <div>
                <label className="text-xs font-medium text-foreground">Serial No (Optional)</label>
                <input
                  type="text"
                  value={formSerialNo}
                  onChange={(e) => setFormSerialNo(e.target.value)}
                  placeholder="Manufacturer Serial No"
                  className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-foreground">Condition Grade</label>
                <select
                  value={formConditionGrade}
                  onChange={(e) => setFormConditionGrade(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-xs"
                >
                  <option value="NEW">NEW (Like New)</option>
                  <option value="GOOD">GOOD (Ready to Rent)</option>
                  <option value="FAIR">FAIR (Minor wear)</option>
                  <option value="DAMAGED">DAMAGED (Needs repair)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setShowRegisterModal(false)}
                className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={registerLoading || !formProductId}
                onClick={() => void handleRegisterSubmit()}
                className="rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-95 disabled:opacity-50"
              >
                {registerLoading ? "Registering..." : "Save & Add to Fleet"}
              </button>
            </div>
          </div>
        )}

        {actionError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            {actionError}
          </div>
        ) : null}
        {actionMessage ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
            {actionMessage}
          </div>
        ) : null}

        {loading ? (
          <ERPLoadingState label="Loading rental assets..." />
        ) : error ? (
          <ERPErrorState title="Unable to load rental assets" description={error} onRetry={() => void load()} />
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
            No rental assets{statusFilter ? " with this status" : ""} yet. Register units from a rent or lease contract.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2">Asset</th>
                  <th scope="col" className="px-4 py-2">Product</th>
                  <th scope="col" className="px-4 py-2">Status</th>
                  <th scope="col" className="px-4 py-2">On hire to</th>
                  <th scope="col" className="px-4 py-2">Location</th>
                  <th scope="col" className="px-4 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((asset) => (
                  <tr key={asset.id} data-testid="rental-asset-register-row">
                    <td className="px-4 py-2">
                      <div className="font-medium text-foreground">{asset.asset_code}</div>
                      {asset.serial_no ? (
                        <div className="text-xs text-muted-foreground">SN {asset.serial_no}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-2 text-foreground">{asset.product_name ?? "—"}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-flex rounded border px-2 py-0.5 text-xs font-semibold ${
                          STATUS_TONE[asset.status] ?? "border-border bg-muted text-foreground"
                        }`}
                      >
                        {asset.status}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      {asset.current_subscription_id ? (
                        <Link
                          href={`${ROUTES.admin.subscriptions}/${asset.current_subscription_id}`}
                          className="text-primary underline-offset-2 hover:underline"
                        >
                          {asset.current_customer_name ?? "Customer"} ·{" "}
                          {asset.current_subscription_number ?? `#${asset.current_subscription_id}`}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{asset.current_location_code ?? "—"}</td>
                    <td className="px-4 py-2 text-right">
                      {RELEASABLE.has(asset.status) ? (
                        <button
                          type="button"
                          disabled={busyId !== null}
                          onClick={() => void release(asset.id, asset.asset_code)}
                          className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-95 disabled:opacity-50"
                        >
                          {busyId === asset.id ? "Releasing..." : "Release to available"}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && (data.previous || data.next) ? (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {data.count} asset{data.count === 1 ? "" : "s"} · page {page}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!data.previous || loading}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="rounded-md border border-border bg-background px-3 py-1 hover:bg-muted disabled:opacity-50"
              >
                Prev
              </button>
              <button
                type="button"
                disabled={!data.next || loading}
                onClick={() => setPage((current) => current + 1)}
                className="rounded-md border border-border bg-background px-3 py-1 hover:bg-muted disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground">
          Releasing a unit under repair also lifts the maintenance hold its return inspection placed on stock.
        </p>
      </div>
    </ERPPageShell>
  );
}
