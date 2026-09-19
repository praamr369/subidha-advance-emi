"use client";

import { useEffect, useMemo, useState, useRef, type FormEvent } from "react";

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
import { ACCOUNTING_REGISTER_DIRECTORY_GROUPS } from "@/components/admin/control-center/businessControlDirectories";
import { WorkspaceDirectory } from "@/components/admin/control-center/WorkspaceDirectory";
import ConfirmActionButton from "@/components/ui/ConfirmActionButton";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import VendorPayablesToggle from "@/components/vendors/VendorPayablesToggle";
import type { InventoryItem, StockLocation, VendorBill } from "@/services/inventory";
import { listInventoryItems, listStockLocations, listVendorBills } from "@/services/inventory";
import type {
  AccountingPurchaseBill,
  AccountingPurchaseBillLine,
  FinanceAccount,
  Vendor,
} from "@/services/accounting";
import {
  approvePurchaseBill,
  cancelPurchaseBill,
  createPurchaseBill,
  listFinanceAccounts,
  listPurchaseBills,
  listVendors,
  postPurchaseBill,
  updatePurchaseBill,
} from "@/services/accounting";
import { getComplianceTaxProfile } from "@/services/compliance";
import type { BusinessTaxMode } from "@/types/compliance";

type PurchaseLineForm = {
  inventory_item: string;
  description: string;
  quantity: string;
  unit_cost: string;
  tax_amount: string;
};

type PurchaseBillForm = {
  bill_no: string;
  bill_date: string;
  vendor: string;
  tax_mode: "GST" | "NON_GST";
  stock_location: string;
  finance_account: string;
  notes: string;
  lines: PurchaseLineForm[];
};

function blankLine(): PurchaseLineForm {
  return {
    inventory_item: "",
    description: "",
    quantity: "1.000",
    unit_cost: "0.00",
    tax_amount: "0.00",
  };
}

function emptyForm(): PurchaseBillForm {
  return {
    bill_no: "",
    bill_date: new Date().toISOString().slice(0, 10),
    vendor: "",
    tax_mode: "NON_GST",
    stock_location: "",
    finance_account: "",
    notes: "",
    lines: [blankLine()],
  };
}

function lineTaxableValue(line: PurchaseLineForm): number {
  return Number(line.quantity || 0) * Number(line.unit_cost || 0);
}

function lineTotal(line: PurchaseLineForm, taxMode: PurchaseBillForm["tax_mode"]): number {
  const taxableValue = lineTaxableValue(line);
  return taxableValue + (taxMode === "GST" ? Number(line.tax_amount || 0) : 0);
}

function toLineForm(line: AccountingPurchaseBillLine): PurchaseLineForm {
  return {
    inventory_item: String(line.inventory_item),
    description: line.description ?? "",
    quantity: line.quantity,
    unit_cost: line.unit_cost,
    tax_amount: line.tax_amount ?? "0.00",
  };
}

// ── Searchable Item Combobox ──────────────────────────────────────────────────
interface ItemComboboxProps {
  items: InventoryItem[];
  value: string;
  onChange: (itemId: string, item: InventoryItem | null) => void;
  required?: boolean;
}

function ItemCombobox({ items, value, onChange, required }: ItemComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedItem = items.find((it) => String(it.id) === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 80);
    return items
      .filter(
        (it) =>
          (it.sku ?? "").toLowerCase().includes(q) ||
          (it.product_name ?? "").toLowerCase().includes(q) ||
          (it.product_code ?? "").toLowerCase().includes(q) ||
          (it.stock_item_type ?? "").toLowerCase().includes(q)
      )
      .slice(0, 60);
  }, [items, query]);

  function handleSelect(item: InventoryItem) {
    onChange(String(item.id), item);
    setOpen(false);
    setQuery("");
  }

  function handleInputFocus() {
    setOpen(true);
    setQuery("");
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        listRef.current &&
        !listRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const displayValue = open
    ? query
    : selectedItem
    ? `${selectedItem.sku ?? selectedItem.product_code} · ${selectedItem.product_name ?? "—"}`
    : "";

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        autoComplete="off"
        placeholder={selectedItem ? undefined : "Search by SKU, name, or type…"}
        className={accountingFieldClassName()}
        value={displayValue}
        onFocus={handleInputFocus}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
      />
      {required && (
        <input
          type="text"
          className="sr-only"
          tabIndex={-1}
          value={value}
          required
          readOnly
          aria-hidden="true"
        />
      )}
      {open && (
        <div
          ref={listRef}
          className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-border bg-background shadow-lg"
        >
          {filtered.length === 0 ? (
            <p className="px-4 py-3 text-xs text-muted-foreground">No items found.</p>
          ) : (
            filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onMouseDown={() => handleSelect(item)}
                className="flex w-full flex-col px-4 py-2.5 text-left hover:bg-muted/60 focus:bg-muted/60"
              >
                <span className="text-xs font-semibold text-foreground">
                  {item.sku ?? item.product_code} · {item.product_name}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {item.stock_item_type ?? "—"}
                  {item.purchase_unit_cost
                    ? ` · Last price: ${accountingMoney(item.purchase_unit_cost)}`
                    : item.standard_unit_cost
                    ? ` · Std cost: ${accountingMoney(item.standard_unit_cost)}`
                    : ""}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function AccountingPurchaseBillsPage() {
  const [rows, setRows] = useState<AccountingPurchaseBill[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [financeAccounts, setFinanceAccounts] = useState<FinanceAccount[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [legacyBills, setLegacyBills] = useState<VendorBill[]>([]);
  const [selectedBillId, setSelectedBillId] = useState<number | null>(null);
  const [form, setForm] = useState<PurchaseBillForm>(emptyForm());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeTaxMode, setActiveTaxMode] = useState<BusinessTaxMode>("GST_UNREGISTERED");

  async function loadPage(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const [purchasePayload, vendorPayload, financePayload, locationPayload, itemPayload, compliancePayload, legacyBillsPayload] =
                  await Promise.all([
            listPurchaseBills(),
            listVendors({ is_active: 1 }),
            listFinanceAccounts({ is_active: 1 }),
            listStockLocations({ is_active: 1 }),
            listInventoryItems({ is_active: 1, stock_tracking_enabled: 1 }),
            getComplianceTaxProfile(),
            listVendorBills({ page_size: 100 }),
          ]);
      setRows(purchasePayload.results);
      setVendors(vendorPayload.results);
      setFinanceAccounts(financePayload.results);
      setLocations(locationPayload.results);
      setInventoryItems(itemPayload.results);
        setLegacyBills(legacyBillsPayload.results);
      setActiveTaxMode(compliancePayload.active.mode);
      setError(null);
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to load purchase bills."));
      if (mode === "initial") {
        setRows([]);
        setVendors([]);
        setFinanceAccounts([]);
        setLocations([]);
        setInventoryItems([]);
      }
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadPage("initial");
  }, []);

  const selectedBill = useMemo(
    () => rows.find((row) => row.id === selectedBillId) ?? null,
    [rows, selectedBillId]
  );
  const isNonGstBusiness = activeTaxMode === "GST_UNREGISTERED";

  const rawMaterialReadyCount = inventoryItems.filter(
    (item) => item.stock_item_type === "RAW_MATERIAL"
  ).length;

  function handleImportLegacy(idString: string) {
    if (!idString) return;
    const legacy = legacyBills.find((b) => String(b.id) === idString);
    if (!legacy) return;
    
    const isGst = Number(legacy.tax_total || 0) > 0;
    
    setForm((current) => ({
      ...current,
      bill_no: legacy.bill_no,
      bill_date: legacy.bill_date,
      vendor: legacy.vendor ? String(legacy.vendor) : current.vendor,
      tax_mode: isGst ? "GST" : "NON_GST",
      notes: legacy.notes || current.notes,
      lines: legacy.lines.map((line) => ({
        inventory_item: String(line.inventory_item),
        description: line.description || "",
        quantity: String(line.quantity || "1.000"),
        unit_cost: String(line.unit_cost || "0.00"),
        tax_amount: String(line.tax_amount || "0.00"),
      })),
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const payload = {
        bill_no: form.bill_no,
        bill_date: form.bill_date,
        vendor: Number(form.vendor),
        tax_mode: form.tax_mode,
        stock_location: form.stock_location ? Number(form.stock_location) : null,
        finance_account: form.finance_account ? Number(form.finance_account) : null,
        notes: form.notes,
        lines: form.lines.map((line) => ({
          inventory_item: Number(line.inventory_item),
          description: line.description,
          quantity: line.quantity,
          unit_cost: line.unit_cost,
          tax_amount: form.tax_mode === "GST" ? line.tax_amount : "0.00",
        })),
      };
      if (selectedBill) {
        await updatePurchaseBill(selectedBill.id, payload);
        setNotice(`Purchase bill ${selectedBill.bill_no} updated.`);
      } else {
        await createPurchaseBill(payload);
        setNotice("Purchase bill created.");
      }
      setSelectedBillId(null);
      setForm(emptyForm());
      await loadPage("refresh");
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to save purchase bill."));
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setSelectedBillId(null);
    setForm(emptyForm());
    setNotice(null);
    setError(null);
  }

  const columns: EnterpriseColumnDef<AccountingPurchaseBill>[] = [
    { key: "bill_date", header: "Date", render: (row) => accountingDate(row.bill_date) },
    { key: "bill_no", header: "Bill" },
    {
      key: "branch_name",
      header: "Branch",
      render: (row) => row.branch_code || row.branch_name || "Primary default",
    },
    { key: "vendor_name", header: "Vendor" },
    { key: "stock_location_name", header: "Inward Location" },
    { key: "status", header: "Status" },
    { key: "grand_total", header: "Grand Total", render: (row) => accountingMoney(row.grand_total) },
    { key: "posted_journal_entry_no", header: "Journal" },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <div className="flex flex-wrap gap-2">
          {row.status === "DRAFT" ? (
            <button
              type="button"
              onClick={() => {
                setSelectedBillId(row.id);
                setForm({
                  bill_no: row.bill_no,
                  bill_date: row.bill_date,
                  vendor: String(row.vendor),
                  tax_mode: row.tax_mode as "GST" | "NON_GST",
                  stock_location: row.stock_location ? String(row.stock_location) : "",
                  finance_account: row.finance_account ? String(row.finance_account) : "",
                  notes: row.notes ?? "",
                  lines: row.lines?.length ? row.lines.map(toLineForm) : [blankLine()],
                });
                setNotice(null);
                setError(null);
              }}
              className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted"
            >
              Edit
            </button>
          ) : null}
          {row.status === "DRAFT" ? (
            <ConfirmActionButton
              label="Approve"
              title={`Approve ${row.bill_no}?`}
              description="Approval freezes the draft purchase bill before stock inward and accounting posting."
              onConfirm={async () => {
                await approvePurchaseBill(row.id);
                setNotice(`Purchase bill ${row.bill_no} approved.`);
                await loadPage("refresh");
              }}
              variant="secondary"
            />
          ) : null}
          {row.status === "APPROVED" ? (
            <ConfirmActionButton
              label="Post"
              title={`Post ${row.bill_no}?`}
              description="Posting writes stock inward and the linked accounting entry through one controlled service flow."
              onConfirm={async () => {
                await postPurchaseBill(row.id);
                setNotice(`Purchase bill ${row.bill_no} posted.`);
                await loadPage("refresh");
              }}
              variant="primary"
            />
          ) : null}
          {row.status !== "POSTED" && row.status !== "CANCELLED" ? (
            <ConfirmActionButton
              label="Cancel"
              title={`Cancel ${row.bill_no}?`}
              description="This cancels the draft or approved purchase bill before posting."
              onConfirm={async () => {
                await cancelPurchaseBill(row.id, "Cancelled from accounting purchase bills page.");
                setNotice(`Purchase bill ${row.bill_no} cancelled.`);
                await loadPage("refresh");
              }}
              variant="destructive"
            />
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <ERPPageShell
      eyebrow="Accounting Purchase Control"
      title="Purchase Bills"
      subtitle="Draft, approve, and post purchase-side stock inward documents through controlled inventory and accounting services without touching billing, EMI, or payment truth."
      helperNote="Purchase bills remain accounting-side source documents for stock inward and payable recognition. Billing and cashier flows remain separate."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Accounting", href: ROUTES.admin.accounting },
        { label: "Purchase Bills" },
      ]}
      actions={[
        { href: ROUTES.admin.vendors, label: "Vendor Register", variant: "secondary" },
        { href: ROUTES.admin.inventoryItems, label: "Inventory Items", variant: "secondary" },
        { href: ROUTES.admin.vendorsSettlements, label: "Vendor Settlements", variant: "primary" },
      ]}
      stats={[
        { label: "Bills", value: String(rows.length), tone: "info" },
        { label: "Approved", value: String(rows.filter((row) => row.status === "APPROVED").length), tone: "warning" },
        { label: "Posted", value: String(rows.filter((row) => row.status === "POSTED").length), tone: "success" },
        { label: "Raw-Material Ready Items", value: String(rawMaterialReadyCount), tone: rawMaterialReadyCount > 0 ? "warning" : "default" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <div className="space-y-6">
        <div className="flex justify-end">
          <AccountingRefreshButton loading={loading} refreshing={refreshing} onClick={() => void loadPage("refresh")} />
        </div>

        {notice ? <AccountingNotice message={notice} /> : null}
        {error ? <AccountingNotice tone="danger" message={error} /> : null}

        <WorkspaceDirectory
          title="Accounting control map"
          description="Jump between purchase bills, vendors, settlements, books, and statements from one accounting business-control workspace."
          groups={ACCOUNTING_REGISTER_DIRECTORY_GROUPS}
        />

        <WorkspaceSection
          title={selectedBill ? "Edit Draft Purchase Bill" : "Create Draft Purchase Bill"}
          description="Draft purchase bills stay editable until approval. Posting later performs stock inward and accounting recognition together."
        >
          {!selectedBill && (
            <div className="mb-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
              <label className="mb-2 block text-sm font-semibold text-primary">Import Data from Legacy Vendor Bill</label>
              <select 
                className={accountingFieldClassName()} 
                onChange={(e) => { handleImportLegacy(e.target.value); e.target.value = ""; }}
                defaultValue=""
              >
                <option value="">-- Select a legacy bill to auto-fill this form --</option>
                {legacyBills.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.bill_no} ({b.vendor_name || 'No Vendor'}) - {b.bill_date}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-muted-foreground">Select a legacy Vendor Bill to instantly populate the supplier, dates, taxes, and product lines below.</p>
            </div>
          )}
          <div className="mb-4 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm">
            <p>
              Current tax mode:{" "}
              <span className="font-medium">
                {isNonGstBusiness ? "GST Unregistered (Non-GST operations)" : activeTaxMode}
              </span>
            </p>
            <p>
              ITC claimable:{" "}
              <span className="font-medium">{isNonGstBusiness ? "No" : "Yes (subject to active GST mode)"}</span>
            </p>
            {isNonGstBusiness ? (
              <p className="text-muted-foreground">
                Supplier GST can be captured on purchase lines and is posted to landed cost instead of Input GST.
              </p>
            ) : null}
          </div>
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <label className="text-sm text-muted-foreground">
                Supplier bill no
                <input className={accountingFieldClassName()} value={form.bill_no} onChange={(event) => setForm((current) => ({ ...current, bill_no: event.target.value }))} required />
              </label>
              <label className="text-sm text-muted-foreground">
                Bill date
                <input type="date" className={accountingFieldClassName()} value={form.bill_date} onChange={(event) => setForm((current) => ({ ...current, bill_date: event.target.value }))} required />
              </label>
              <label className="text-sm text-muted-foreground">
                Vendor
                <select className={accountingFieldClassName()} value={form.vendor} onChange={(event) => setForm((current) => ({ ...current, vendor: event.target.value }))} required>
                  <option value="">Select vendor</option>
                  {vendors.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </option>
                  ))}
                </select>
              </label>
              {form.vendor ? (
                // The chosen vendor's balance — billed, paid, what we owe — so a
                // purchase bill is drafted with the vendor's position in view.
                // Keyed by vendor so switching vendors never shows stale figures.
                <div className="md:col-span-2 xl:col-span-3">
                  <VendorPayablesToggle key={form.vendor} vendorId={Number(form.vendor)} />
                </div>
              ) : null}
              <label className="text-sm text-muted-foreground">
                Tax mode
                <select className={accountingFieldClassName()} value={form.tax_mode} onChange={(event) => setForm((current) => ({ ...current, tax_mode: event.target.value as "GST" | "NON_GST" }))}>
                  <option value="GST">GST</option>
                  <option value="NON_GST">Non-GST</option>
                </select>
              </label>
              <label className="text-sm text-muted-foreground">
                Stock location
                <select className={accountingFieldClassName()} value={form.stock_location} onChange={(event) => setForm((current) => ({ ...current, stock_location: event.target.value }))}>
                  <option value="">Use item default</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.code} · {location.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-muted-foreground">
                Finance account
                <select className={accountingFieldClassName()} value={form.finance_account} onChange={(event) => setForm((current) => ({ ...current, finance_account: event.target.value }))}>
                  <option value="">Post to accounts payable later</option>
                  {financeAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-muted-foreground xl:col-span-3">
                Notes
                <textarea className={accountingFieldClassName()} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} rows={3} />
              </label>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">Purchase lines</div>
                  <div className="text-xs text-muted-foreground">
                    Select stock-tracked inventory items. Raw-material items are supported here without starting a manufacturing flow.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setForm((current) => ({ ...current, lines: [...current.lines, blankLine()] }))}
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
                >
                  Add Line
                </button>
              </div>

              {form.lines.map((line, index) => {
                const selectedItem =
                  inventoryItems.find((item) => String(item.id) === line.inventory_item) ?? null;
                const lastCost = selectedItem?.purchase_unit_cost ?? selectedItem?.standard_unit_cost ?? null;
                return (
                  <div key={`${index}-${line.inventory_item}`} className="rounded-[1.2rem] border border-border bg-background p-4">
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                      <div className="text-sm text-muted-foreground xl:col-span-2">
                        <span className="mb-1 block">Inventory item</span>
                        <ItemCombobox
                          items={inventoryItems}
                          value={line.inventory_item}
                          onChange={(itemId, item) => {
                            setForm((current) => ({
                              ...current,
                              lines: current.lines.map((entry, entryIndex) =>
                                entryIndex === index
                                  ? {
                                      ...entry,
                                      inventory_item: itemId,
                                      // Auto-fill cost from last purchase cost or standard cost
                                      unit_cost: item?.purchase_unit_cost
                                        ? parseFloat(item.purchase_unit_cost).toFixed(2)
                                        : item?.standard_unit_cost
                                          ? parseFloat(item.standard_unit_cost).toFixed(2)
                                          : entry.unit_cost,
                                    }
                                  : entry
                              ),
                            }));
                          }}
                          required
                        />
                        {selectedItem && lastCost ? (
                          <p className="mt-1 text-[10px] text-emerald-700">
                            ✓ Last purchase price: {accountingMoney(lastCost)}
                            {selectedItem.purchase_unit_cost ? " (auto-filled)" : " (std cost, editable)"}
                          </p>
                        ) : selectedItem ? (
                          <p className="mt-1 text-[10px] text-muted-foreground">No previous purchase cost — enter manually.</p>
                        ) : null}
                      </div>
                      <label className="text-sm text-muted-foreground">
                        Quantity
                        <input
                          type="number"
                          min="0.001"
                          step="0.001"
                          className={accountingFieldClassName()}
                          value={line.quantity}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              lines: current.lines.map((entry, entryIndex) =>
                                entryIndex === index
                                  ? { ...entry, quantity: event.target.value }
                                  : entry
                              ),
                            }))
                          }
                          required
                        />
                      </label>
                      <label className="text-sm text-muted-foreground">
                        Unit cost
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className={accountingFieldClassName()}
                          value={line.unit_cost}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              lines: current.lines.map((entry, entryIndex) =>
                                entryIndex === index
                                  ? { ...entry, unit_cost: event.target.value }
                                  : entry
                              ),
                            }))
                          }
                          required
                        />
                      </label>
                      <label className="text-sm text-muted-foreground">
                        Tax amount
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className={accountingFieldClassName()}
                          value={line.tax_amount}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              lines: current.lines.map((entry, entryIndex) =>
                                entryIndex === index
                                  ? { ...entry, tax_amount: event.target.value }
                                  : entry
                              ),
                            }))
                          }
                          disabled={form.tax_mode === "NON_GST"}
                        />
                        {form.tax_mode === "NON_GST" ? (
                          <span className="mt-0.5 block text-[10px] text-muted-foreground">Disabled (Non-GST mode)</span>
                        ) : null}
                      </label>
                      <label className="text-sm text-muted-foreground xl:col-span-4">
                        Description
                        <input
                          className={accountingFieldClassName()}
                          value={line.description}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              lines: current.lines.map((entry, entryIndex) =>
                                entryIndex === index
                                  ? { ...entry, description: event.target.value }
                                  : entry
                              ),
                            }))
                          }
                        />
                      </label>
                      <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                        <div>{selectedItem?.unit_of_measure || "PCS"} · {selectedItem?.stock_item_type || "Select item"}</div>
                        <div className="mt-1 font-medium text-foreground">
                          Line total {accountingMoney(lineTotal(line, form.tax_mode))}
                        </div>
                      </div>
                    </div>
                    {form.lines.length > 1 ? (
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() =>
                            setForm((current) => ({
                              ...current,
                              lines: current.lines.filter((_, entryIndex) => entryIndex !== index),
                            }))
                          }
                          className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive transition hover:bg-destructive/20"
                        >
                          Remove Line
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}

              {/* Grand total preview */}
              <div className="flex justify-end">
                <div className="rounded-xl border border-primary/20 bg-primary/5 px-5 py-3 text-right">
                  <p className="text-xs text-muted-foreground">Bill grand total (preview)</p>
                  <p className="text-lg font-bold text-primary">
                    {accountingMoney(form.lines.reduce((sum, line) => sum + lineTotal(line, form.tax_mode), 0))}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:opacity-60"
              >
                {saving ? "Saving..." : selectedBill ? "Update Draft Purchase Bill" : "Create Draft Purchase Bill"}
              </button>
              {selectedBill ? (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
                >
                  Reset
                </button>
              ) : null}
            </div>
          </form>
        </WorkspaceSection>

        <WorkspaceSection
          title="Purchase Register"
          description="Use the register to review draft, approved, and posted purchase bills alongside their stock inward and accounting lifecycle."
        >
          <EnterpriseDataTable
            data={rows}
            columns={columns}
            loading={loading}
            error={error}
            onRetry={() => void loadPage("initial")}
            emptyTitle="No purchase bills found"
            emptyDescription="Create the first draft purchase bill above."
          />
        </WorkspaceSection>
      </div>
    </ERPPageShell>
  );
}
