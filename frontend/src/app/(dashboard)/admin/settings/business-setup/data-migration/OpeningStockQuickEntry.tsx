"use client";

import { useEffect, useRef, useState } from "react";
import { createOpeningStockDraft, postOpeningStockDraft } from "@/services/data-migration";
import { listStockLocations, searchInventoryItems, type InventoryItem, type StockLocationsRow } from "@/services/inventory";

function toErr(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null && "readableMessage" in e) return String((e as { readableMessage: unknown }).readableMessage);
  return "Request failed.";
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function ItemSearch({ value, onChange }: { value: InventoryItem | null; onChange: (item: InventoryItem | null) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<InventoryItem[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function handleInput(q: string) {
    setQuery(q);
    onChange(null);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (q.trim().length < 1) { setResults([]); setOpen(false); return; }
    timerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await searchInventoryItems(q);
        setResults(res.results ?? []);
        setOpen(true);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 300);
  }

  function select(item: InventoryItem) {
    onChange(item);
    setQuery(`${item.product_name ?? item.name ?? item.product_code} (${item.sku ?? item.product_code})`);
    setOpen(false);
  }

  function clear() {
    onChange(null);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search by name, SKU, or code…"
          className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
        />
        {(value || query) && (
          <button type="button" onClick={clear} className="shrink-0 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground">✕</button>
        )}
      </div>
      {searching && <div className="mt-1 text-xs text-muted-foreground">Searching…</div>}
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full overflow-y-auto rounded-xl border-2 border-slate-300 dark:border-slate-600 shadow-[0_8px_32px_rgba(0,0,0,0.22)]" style={{ maxHeight: "18rem" }}>
          <div className="rounded-xl overflow-hidden bg-white dark:bg-slate-900 divide-y-2 divide-slate-100 dark:divide-slate-800">
          {results.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => select(item)}
              className="flex w-full flex-col items-start px-4 py-2.5 text-left hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
            >
              <span className="text-[13px] font-bold text-slate-900 dark:text-slate-100">{item.product_name ?? item.name ?? item.product_code}</span>
              <div className="flex gap-3 text-[12px] text-slate-500 dark:text-slate-400">
                <span>SKU: <strong className="text-slate-700 dark:text-slate-300">{item.sku ?? "—"}</strong></span>
                <span>Code: <strong className="text-slate-700 dark:text-slate-300">{item.product_code}</strong></span>
              </div>
            </button>
          ))}
          </div>
        </div>
      )}
      {open && !searching && results.length === 0 && query.trim().length > 0 && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-4 py-3 text-[13px] text-slate-500 dark:text-slate-400 shadow-[0_8px_32px_rgba(0,0,0,0.22)]">
          No items found for &ldquo;{query}&rdquo;
        </div>
      )}
    </div>
  );
}

export default function OpeningStockQuickEntry() {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locations, setLocations] = useState<StockLocationsRow[]>([]);

  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [locationId, setLocationId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(today());
  const [note, setNote] = useState("Opening stock entry");

  useEffect(() => {
    listStockLocations({ is_active: true }).then((res) => {
      setLocations(res.results ?? []);
      if (res.results?.length === 1) setLocationId(String(res.results[0].id));
    }).catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedItem) { setError("Select an inventory item first."); return; }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const draft = await createOpeningStockDraft({
        inventory_item: { pk: selectedItem.id },
        stock_location: { pk: parseInt(locationId) },
        quantity: parseFloat(quantity),
        unit_cost_snapshot: unitCost || null,
        effective_date: effectiveDate,
        note,
      });
      await postOpeningStockDraft(draft.id);
      setNotice(`Opening stock of ${quantity} × "${selectedItem.product_name ?? selectedItem.product_code}" saved.`);
      setSelectedItem(null);
      setQuantity("");
      setUnitCost("");
    } catch (err) {
      setError(toErr(err));
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = !!selectedItem && !!locationId && !!quantity && !busy;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Opening Stock</h2>
        <p className="text-sm text-muted-foreground">Enter opening inventory quantities from your old books. Search by product name or SKU.</p>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300">{error}</div>}
      {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-900/10 dark:text-emerald-300">{notice}</div>}

      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <label className="block text-sm font-medium text-foreground">
          Inventory Item *
          <div className="mt-1">
            <ItemSearch value={selectedItem} onChange={setSelectedItem} />
          </div>
          {selectedItem && (
            <div className="mt-1 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-1.5 text-xs text-emerald-700">
              Selected: {selectedItem.product_name ?? selectedItem.product_code} — ID #{selectedItem.id}
            </div>
          )}
        </label>

        <label className="block text-sm font-medium text-foreground">
          Stock Location *
          <select
            required
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">— Select location —</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>{loc.name} ({loc.location_type})</option>
            ))}
          </select>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-foreground">
            Quantity *
            <input
              required
              type="number"
              min="0.001"
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 tabular-nums"
              placeholder="e.g. 100"
            />
          </label>
          <label className="block text-sm font-medium text-foreground">
            Unit Cost (Optional)
            <input
              type="number"
              step="0.01"
              min="0"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 tabular-nums"
              placeholder="0.00"
            />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-foreground">
            Effective Date *
            <input
              required
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2"
            />
          </label>
          <label className="block text-sm font-medium text-foreground">
            Notes
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2"
              placeholder="e.g. From old books"
            />
          </label>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save & Add Another"}
          </button>
        </div>
      </form>
    </div>
  );
}
