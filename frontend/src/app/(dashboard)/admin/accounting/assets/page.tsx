"use client";

import { useEffect, useState, type FormEvent } from "react";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import {
  AccountingNotice,
  AccountingRefreshButton,
  accountingDate,
  accountingErrorMessage,
  accountingFieldClassName,
  accountingMoney,
} from "@/components/accounting/shared";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import type {
  AccountingPurchaseBill,
  Asset,
  AssetCategory,
  Vendor,
} from "@/services/accounting";
import {
  createAsset,
  createAssetCategory,
  listAssetCategories,
  listAssets,
  listPurchaseBills,
  listVendors,
} from "@/services/accounting";

const today = new Date().toISOString().slice(0, 10);

export default function AccountingAssetsPage() {
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [purchaseBills, setPurchaseBills] = useState<AccountingPurchaseBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [categoryForm, setCategoryForm] = useState({
    code: "",
    name: "",
    method: "SLM" as "SLM" | "WDM",
    useful_life_months: "60",
    rate_annual: "",
    default_salvage: "0.00",
  });
  const [assetForm, setAssetForm] = useState({
    category: "",
    description: "",
    acquisition_date: today,
    in_service_date: today,
    cost_amount: "0.00",
    salvage_value: "0.00",
    vendor: "",
    purchase_bill: "",
  });

  async function loadPage(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const [categoryPayload, assetPayload, vendorPayload, purchaseBillPayload] = await Promise.all([
        listAssetCategories(),
        listAssets(),
        listVendors(),
        listPurchaseBills(),
      ]);
      setCategories(categoryPayload.results);
      setAssets(assetPayload.results);
      setVendors(vendorPayload.results);
      setPurchaseBills(purchaseBillPayload.results);
      setError(null);
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to load asset registers."));
      if (mode === "initial") {
        setCategories([]);
        setAssets([]);
        setVendors([]);
        setPurchaseBills([]);
      }
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadPage("initial");
  }, []);

  async function handleCreateCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await createAssetCategory({
        code: categoryForm.code,
        name: categoryForm.name,
        method: categoryForm.method,
        useful_life_months: Number(categoryForm.useful_life_months),
        rate_annual: categoryForm.rate_annual || undefined,
        default_salvage: categoryForm.default_salvage,
      });
      setNotice("Asset category created.");
      setCategoryForm({
        code: "",
        name: "",
        method: "SLM",
        useful_life_months: "60",
        rate_annual: "",
        default_salvage: "0.00",
      });
      await loadPage("refresh");
    } catch (err) {
      setNotice(null);
      setError(accountingErrorMessage(err, "Failed to create the asset category."));
    }
  }

  async function handleCreateAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await createAsset({
        category: Number(assetForm.category),
        description: assetForm.description,
        acquisition_date: assetForm.acquisition_date,
        in_service_date: assetForm.in_service_date,
        cost_amount: assetForm.cost_amount,
        salvage_value: assetForm.salvage_value,
        vendor: assetForm.vendor ? Number(assetForm.vendor) : undefined,
        purchase_bill: assetForm.purchase_bill ? Number(assetForm.purchase_bill) : undefined,
      });
      setNotice("Asset created.");
      setAssetForm({
        category: "",
        description: "",
        acquisition_date: today,
        in_service_date: today,
        cost_amount: "0.00",
        salvage_value: "0.00",
        vendor: "",
        purchase_bill: "",
      });
      await loadPage("refresh");
    } catch (err) {
      setNotice(null);
      setError(accountingErrorMessage(err, "Failed to create the asset."));
    }
  }

  const categoryColumns: EnterpriseColumnDef<AssetCategory>[] = [
    { key: "code", header: "Code" },
    { key: "name", header: "Name" },
    { key: "method", header: "Method" },
    { key: "useful_life_months", header: "Life (months)" },
    { key: "rate_annual", header: "Rate %" },
    { key: "default_salvage", header: "Salvage", render: (row) => accountingMoney(row.default_salvage) },
  ];

  const assetColumns: EnterpriseColumnDef<Asset>[] = [
    { key: "asset_code", header: "Asset Code" },
    { key: "category_name", header: "Category" },
    { key: "description", header: "Description" },
    { key: "acquisition_date", header: "Acquired", render: (row) => accountingDate(row.acquisition_date) },
    { key: "in_service_date", header: "In Service", render: (row) => accountingDate(row.in_service_date) },
    { key: "cost_amount", header: "Cost", render: (row) => accountingMoney(row.cost_amount) },
    { key: "accumulated_depreciation", header: "Acc. Dep.", render: (row) => accountingMoney(row.accumulated_depreciation) },
    { key: "status", header: "Status" },
  ];

  return (
    <ERPPageShell
      eyebrow="Accounting"
      title="Asset Register"
      subtitle="Asset categories and fixed assets for depreciation-ready accounting, kept separate from operational EMI and payment truth."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Accounting", href: ROUTES.admin.accounting },
        { label: "Assets" },
      ]}
      actions={[
        { href: ROUTES.admin.accountingDepreciation, label: "Depreciation", variant: "primary" },
        { href: ROUTES.admin.accountingPurchaseBills, label: "Purchase Bills", variant: "secondary" },
      ]}
      stats={[
        { label: "Categories", value: String(categories.length), tone: "info" },
        { label: "Assets", value: String(assets.length) },
        { label: "Active", value: String(assets.filter((row) => row.status === "ACTIVE").length), tone: "success" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <div className="space-y-6">
        <div className="flex justify-end">
          <AccountingRefreshButton loading={loading} refreshing={refreshing} onClick={() => void loadPage("refresh")} />
        </div>

        {notice ? <AccountingNotice message={notice} /> : null}

        <div className="grid gap-4 xl:grid-cols-2">
          <WorkspaceSection title="Create Asset Category" description="Define the default depreciation method and useful life for similar assets.">
            <form className="grid gap-3" onSubmit={handleCreateCategory}>
              <label className="text-sm text-muted-foreground">
                Code
                <input className={accountingFieldClassName()} value={categoryForm.code} onChange={(event) => setCategoryForm((current) => ({ ...current, code: event.target.value }))} required />
              </label>
              <label className="text-sm text-muted-foreground">
                Name
                <input className={accountingFieldClassName()} value={categoryForm.name} onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))} required />
              </label>
              <label className="text-sm text-muted-foreground">
                Method
                <select className={accountingFieldClassName()} value={categoryForm.method} onChange={(event) => setCategoryForm((current) => ({ ...current, method: event.target.value as "SLM" | "WDM" }))}>
                  <option value="SLM">SLM</option>
                  <option value="WDM">WDM</option>
                </select>
              </label>
              <label className="text-sm text-muted-foreground">
                Useful life months
                <input className={accountingFieldClassName()} type="number" min="1" value={categoryForm.useful_life_months} onChange={(event) => setCategoryForm((current) => ({ ...current, useful_life_months: event.target.value }))} required />
              </label>
              <label className="text-sm text-muted-foreground">
                Annual rate %
                <input className={accountingFieldClassName()} value={categoryForm.rate_annual} onChange={(event) => setCategoryForm((current) => ({ ...current, rate_annual: event.target.value }))} placeholder="Optional for WDM" />
              </label>
              <label className="text-sm text-muted-foreground">
                Default salvage
                <input className={accountingFieldClassName()} value={categoryForm.default_salvage} onChange={(event) => setCategoryForm((current) => ({ ...current, default_salvage: event.target.value }))} required />
              </label>
              <button type="submit" className="rounded-xl border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-medium text-white">
                Create Category
              </button>
            </form>
          </WorkspaceSection>

          <WorkspaceSection title="Create Asset" description="Add new assets with optional vendor and purchase-bill linkage for later depreciation runs.">
            <form className="grid gap-3" onSubmit={handleCreateAsset}>
              <label className="text-sm text-muted-foreground">
                Category
                <select className={accountingFieldClassName()} value={assetForm.category} onChange={(event) => setAssetForm((current) => ({ ...current, category: event.target.value }))} required>
                  <option value="">Select category</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.code} • {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-muted-foreground">
                Description
                <input className={accountingFieldClassName()} value={assetForm.description} onChange={(event) => setAssetForm((current) => ({ ...current, description: event.target.value }))} required />
              </label>
              <label className="text-sm text-muted-foreground">
                Acquisition date
                <input type="date" className={accountingFieldClassName()} value={assetForm.acquisition_date} onChange={(event) => setAssetForm((current) => ({ ...current, acquisition_date: event.target.value }))} required />
              </label>
              <label className="text-sm text-muted-foreground">
                In-service date
                <input type="date" className={accountingFieldClassName()} value={assetForm.in_service_date} onChange={(event) => setAssetForm((current) => ({ ...current, in_service_date: event.target.value }))} required />
              </label>
              <label className="text-sm text-muted-foreground">
                Cost amount
                <input className={accountingFieldClassName()} value={assetForm.cost_amount} onChange={(event) => setAssetForm((current) => ({ ...current, cost_amount: event.target.value }))} required />
              </label>
              <label className="text-sm text-muted-foreground">
                Salvage value
                <input className={accountingFieldClassName()} value={assetForm.salvage_value} onChange={(event) => setAssetForm((current) => ({ ...current, salvage_value: event.target.value }))} required />
              </label>
              <label className="text-sm text-muted-foreground">
                Vendor
                <select className={accountingFieldClassName()} value={assetForm.vendor} onChange={(event) => setAssetForm((current) => ({ ...current, vendor: event.target.value }))}>
                  <option value="">Optional vendor</option>
                  {vendors.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-muted-foreground">
                Purchase bill
                <select className={accountingFieldClassName()} value={assetForm.purchase_bill} onChange={(event) => setAssetForm((current) => ({ ...current, purchase_bill: event.target.value }))}>
                  <option value="">Optional purchase bill</option>
                  {purchaseBills.map((bill) => (
                    <option key={bill.id} value={bill.id}>
                      {bill.bill_no} • {bill.vendor_name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="rounded-xl border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-medium text-white">
                Create Asset
              </button>
            </form>
          </WorkspaceSection>
        </div>

        <EnterpriseDataTable
          data={categories}
          columns={categoryColumns}
          loading={loading}
          error={error}
          onRetry={() => void loadPage("initial")}
          emptyTitle="No asset categories found"
          emptyDescription="Create an asset category before adding assets."
        />

        <EnterpriseDataTable
          data={assets}
          columns={assetColumns}
          loading={loading}
          error={error}
          onRetry={() => void loadPage("initial")}
          emptyTitle="No assets found"
          emptyDescription="Create an asset to begin the fixed-asset register."
        />
      </div>
    </ERPPageShell>
  );
}
