"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle, CheckCircle, ChevronDown, ChevronUp,
  Edit2, Plus, RefreshCw, Trash2, X, Zap,
} from "lucide-react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";
import {
  listManufacturingBoms,
  createManufacturingBom,
  updateManufacturingBom,
  activateManufacturingBom,
  deactivateManufacturingBom,
  deleteManufacturingBom,
  type ManufacturingBom,
  type ManufacturingBomLine,
  type ManufacturingBomServiceLine,
} from "@/services/manufacturing";
import { searchAdminInventoryItems, listServiceCatalog } from "@/services/inventory";
import { listEmployees } from "@/services/admin-hr";

// ─── Tokens ───────────────────────────────────────────────────────────────────
const INP = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
const BTN_PRIMARY = "inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition";
const BTN_GHOST = "inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/60 disabled:opacity-50 transition";
const BTN_DANGER = "inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition";

// ─── Status badge ─────────────────────────────────────────────────────────────
const STATUS_STYLE: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  DRAFT: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  INACTIVE: "bg-muted text-muted-foreground",
};
function StatusBadge({ status }: { status: string }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${STATUS_STYLE[status] ?? STATUS_STYLE.INACTIVE}`}>{status}</span>;
}

// ─── Autocomplete for inventory items ─────────────────────────────────────────
type ItemOption = { id: number; label: string; code: string; type: string };

function ItemSearch({ value, onChange, placeholder }: { value: ItemOption | null; onChange: (v: ItemOption | null) => void; placeholder?: string }) {
  const [query, setQuery] = useState(value?.label ?? "");
  const [options, setOptions] = useState<ItemOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setQuery(value?.label ?? ""); }, [value]);

  function handleInput(q: string) {
    setQuery(q);
    if (!q.trim()) { onChange(null); setOptions([]); return; }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await searchAdminInventoryItems({ q });
        setOptions((res.results ?? []).map((r) => ({ id: r.id, label: r.product_name, code: r.product_code ?? "", type: r.stock_item_type ?? "" })));
        setOpen(true);
      } finally { setLoading(false); }
    }, 280);
  }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => handleInput(e.target.value)}
        onFocus={() => options.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
        placeholder={placeholder ?? "Search material / accessory…"}
        className={INP}
      />
      {loading && <span className="absolute right-3 top-2.5 text-[10px] text-muted-foreground">Searching…</span>}
      {open && options.length > 0 && (
        <div className="absolute z-20 mt-1 w-full overflow-y-auto rounded-xl border-2 border-slate-300 dark:border-slate-600 shadow-[0_8px_32px_rgba(0,0,0,0.22)]" style={{ maxHeight: "18rem" }}>
          <div className="rounded-xl overflow-hidden bg-white dark:bg-slate-900 divide-y-2 divide-slate-100 dark:divide-slate-800">
          {options.slice(0, 8).map((o) => (
            <button
              key={o.id}
              type="button"
              onMouseDown={() => { onChange(o); setQuery(o.label); setOpen(false); }}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
            >
              <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold ${o.type === "RAW_MATERIAL" ? "border-orange-300 bg-orange-100 text-orange-700 dark:border-orange-700 dark:bg-orange-900/50 dark:text-orange-300" : "border-blue-300 bg-blue-100 text-blue-700 dark:border-blue-700 dark:bg-blue-900/50 dark:text-blue-300"}`}>
                {o.type === "RAW_MATERIAL" ? "RM" : "ACC"}
              </span>
              <span className="flex-1 font-medium">{o.label}</span>
              <span className="font-mono text-[11px] font-semibold text-slate-600 dark:text-slate-400">{o.code}</span>
            </button>
          ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── BOM line editor row ──────────────────────────────────────────────────────
type LineDraft = { item: ItemOption | null; qty: string; wastage: string; notes: string };
const blankLine = (): LineDraft => ({ item: null, qty: "1.000", wastage: "0.00", notes: "" });

function LineRow({ line, index, total, onChange, onRemove }: {
  line: LineDraft; index: number; total: number;
  onChange: (f: Partial<LineDraft>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid gap-3 rounded-xl border border-border bg-muted/20 p-3 sm:grid-cols-[1fr_90px_80px_1fr_32px]">
      <div>
        {index === 0 && <label htmlFor="f-material-accessory-onchange-item-v-index" className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Material / Accessory *</label>}
        <ItemSearch value={line.item} onChange={(v) => onChange({ item: v })} />
      </div>
      <div>
        {index === 0 && <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Qty / Unit</label>}
        <input type="number" min="0.001" step="0.001" value={line.qty} onChange={(e) => onChange({ qty: e.target.value })} className={INP} />
      </div>
      <div>
        {index === 0 && <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Wastage %</label>}
        <input type="number" min="0" max="100" step="0.01" value={line.wastage} onChange={(e) => onChange({ wastage: e.target.value })} className={INP} />
      </div>
      <div>
        {index === 0 && <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Notes</label>}
        <input value={line.notes} onChange={(e) => onChange({ notes: e.target.value })} placeholder="Optional" className={INP} />
      </div>
      <div className={index === 0 ? "mt-5" : ""}>
        <button type="button" onClick={onRemove} disabled={total === 1} className="flex h-9 w-8 items-center justify-center rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 disabled:opacity-30 transition">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function ServiceSearch({ value, onChange, placeholder }: { value: ItemOption | null; onChange: (v: ItemOption | null) => void; placeholder?: string }) {
  const [query, setQuery] = useState(value?.label ?? "");
  const [options, setOptions] = useState<ItemOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setQuery(value?.label ?? ""); }, [value]);

  function handleInput(q: string) {
    setQuery(q);
    if (!q.trim()) { onChange(null); setOptions([]); return; }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await listServiceCatalog({ q });
        setOptions((res.results ?? []).map((r: any) => ({ id: r.id, label: r.name || r.service_name || "", code: r.code || "", type: r.service_type || "" })));
        setOpen(true);
      } finally { setLoading(false); }
    }, 280);
  }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => handleInput(e.target.value)}
        onFocus={() => options.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
        placeholder={placeholder ?? "Search services (e.g., Installation)…"}
        className={INP}
      />
      {loading && <span className="absolute right-3 top-2.5 text-[10px] text-muted-foreground">Searching…</span>}
      {open && options.length > 0 && (
        <div className="absolute z-20 mt-1 w-full overflow-y-auto rounded-xl border-2 border-slate-300 dark:border-slate-600 shadow-[0_8px_32px_rgba(0,0,0,0.22)]" style={{ maxHeight: "18rem" }}>
          <div className="rounded-xl overflow-hidden bg-white dark:bg-slate-900 divide-y-2 divide-slate-100 dark:divide-slate-800">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              onMouseDown={() => { onChange(o); setQuery(o.label); setOpen(false); }}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
            >
              <span className="shrink-0 rounded border border-purple-300 bg-purple-100 text-purple-700 dark:border-purple-700 dark:bg-purple-900/50 dark:text-purple-300 px-1.5 py-0.5 text-[10px] font-bold">
                SRV
              </span>
              <span className="flex-1 text-[13px] font-semibold text-slate-900 dark:text-slate-100">{o.label}</span>
              <span className="font-mono text-[11px] font-semibold text-slate-600 dark:text-slate-400">{o.code}</span>
            </button>
          ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EmployeeSearch({ value, onChange, placeholder }: { value: ItemOption | null; onChange: (v: ItemOption | null) => void; placeholder?: string }) {
  const [query, setQuery] = useState(value?.label ?? "");
  const [options, setOptions] = useState<ItemOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setQuery(value?.label ?? ""); }, [value]);

  function handleInput(q: string) {
    setQuery(q);
    if (!q.trim()) { onChange(null); setOptions([]); return; }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await listEmployees({ q });
        setOptions((res.results ?? []).map((r: any) => ({ id: r.id, label: r.name, code: r.employee_code, type: "Employee" })));
        setOpen(true);
      } finally { setLoading(false); }
    }, 280);
  }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => handleInput(e.target.value)}
        onFocus={() => options.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
        placeholder={placeholder ?? "Search staff..."}
        className={INP}
      />
      {loading && <span className="absolute right-3 top-2.5 text-[10px] text-muted-foreground">Searching?</span>}
      {open && options.length > 0 && (
        <div className="absolute z-20 mt-1 w-full overflow-y-auto rounded-xl border-2 border-slate-300 dark:border-slate-600 shadow-[0_8px_32px_rgba(0,0,0,0.22)]" style={{ maxHeight: "18rem" }}>
          <div className="rounded-xl overflow-hidden bg-white dark:bg-slate-900 divide-y-2 divide-slate-100 dark:divide-slate-800">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              onMouseDown={() => { onChange(o); setQuery(o.label); setOpen(false); }}
              className="flex w-full flex-col items-start px-4 py-2.5 text-left hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
            >
              <div className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 truncate">{o.label}</div>
              {o.code && <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate">{o.code}</div>}
            </button>
          ))}
          </div>
        </div>
      )}
    </div>
  );
}

type ServiceLineDraft = { item: ItemOption | null; employee: ItemOption | null; qty: string; notes: string };
const blankServiceLine = (): ServiceLineDraft => ({ item: null, employee: null, qty: "1.00", notes: "" });

function ServiceLineRow({ line, index, onChange, onRemove }: {
  line: ServiceLineDraft; index: number;
  onChange: (f: Partial<ServiceLineDraft>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid gap-3 rounded-xl border border-border bg-muted/20 p-3 sm:grid-cols-[2fr_1fr_90px_1fr_32px]">
      <div>
        {index === 0 && <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Service / Labor *</label>}
        <ServiceSearch value={line.item} onChange={(v) => onChange({ item: v })} />
      </div>
      <div>
        {index === 0 && <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Staff Profile</label>}
        <EmployeeSearch value={line.employee} onChange={(v) => onChange({ employee: v })} />
      </div>
      <div>
        {index === 0 && <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Qty</label>}
        <input type="number" min="0.01" step="0.01" value={line.qty} onChange={(e) => onChange({ qty: e.target.value })} className={INP} />
      </div>
      <div>
        {index === 0 && <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Notes</label>}
        <input value={line.notes} onChange={(e) => onChange({ notes: e.target.value })} placeholder="Optional" className={INP} />
      </div>
      <div className={index === 0 ? "mt-5" : ""}>
        <button type="button" onClick={onRemove} className="flex h-9 w-8 items-center justify-center rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 transition">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Create form ──────────────────────────────────────────────────────────────
type FGOption = ItemOption;

function CreateBomForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [fg, setFg] = useState<FGOption | null>(null);
  const [fgQuery, setFgQuery] = useState("");
  const [fgOpts, setFgOpts] = useState<FGOption[]>([]);
  const [fgOpen, setFgOpen] = useState(false);
  const [revision, setRevision] = useState("1");
  const [isDefault, setIsDefault] = useState(true);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([blankLine()]);
  const [serviceLines, setServiceLines] = useState<ServiceLineDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  function searchFg(q: string) {
    setFgQuery(q);
    if (!q.trim()) { setFg(null); setFgOpts([]); return; }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      const res = await searchAdminInventoryItems({ q, stock_item_type: "FINISHED_GOOD" });
      setFgOpts((res.results ?? []).filter((r) => r.stock_item_type === "FINISHED_GOOD").map((r) => ({ id: r.id, label: r.product_name, code: r.product_code ?? "", type: "FINISHED_GOOD" })));
      setFgOpen(true);
    }, 280);
  }

  function updateLine(i: number, f: Partial<LineDraft>) {
    setLines((ls) => ls.map((l, idx) => idx === i ? { ...l, ...f } : l));
  }
  function updateServiceLine(i: number, f: Partial<ServiceLineDraft>) {
    setServiceLines((ls) => ls.map((l, idx) => idx === i ? { ...l, ...f } : l));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fg) { setErr("Select a finished good."); return; }
    const validLines = lines.filter((l) => l.item);
    const validServiceLines = serviceLines.filter((l) => l.item);
    if (!validLines.length) { setErr("Add at least one material line."); return; }
    setSaving(true); setErr(null);
    try {
      await createManufacturingBom({
        finished_good_inventory_item: fg.id,
        revision_no: parseInt(revision) || 1,
        is_default: isDefault,
        notes,
        lines: validLines.map((l, i) => ({
          inventory_item: l.item!.id,
          quantity_per_unit: l.qty,
          wastage_percent: l.wastage,
          sort_order: i + 1,
          notes: l.notes,
        })),
        service_lines: validServiceLines.map((l, i) => ({
          service: l.item!.id,
          quantity: l.qty,
          sort_order: i + 1,
          notes: l.notes,
        })),
      });
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create BOM.");
    } finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-5">
      <div className="text-sm font-semibold text-primary">Create New BOM Draft</div>

      {/* Header fields */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* FG search */}
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Finished Good *</label>
          <div className="relative">
            <input
              value={fgQuery}
              onChange={(e) => searchFg(e.target.value)}
              onFocus={() => fgOpts.length && setFgOpen(true)}
              onBlur={() => setTimeout(() => setFgOpen(false), 180)}
              placeholder="Search finished good by name or SKU…"
              className={INP}
            />
            {fgOpen && fgOpts.length > 0 && (
              <div className="absolute z-20 mt-1 w-full overflow-y-auto rounded-xl border-2 border-slate-300 dark:border-slate-600 shadow-[0_8px_32px_rgba(0,0,0,0.22)]" style={{ maxHeight: "18rem" }}>
                <div className="rounded-xl overflow-hidden bg-white dark:bg-slate-900 divide-y-2 divide-slate-100 dark:divide-slate-800">
                {fgOpts.slice(0, 8).map((o) => (
                  <button key={o.id} type="button" onMouseDown={() => { setFg(o); setFgQuery(o.label); setFgOpen(false); }}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors">
                    <span className="flex-1 text-[13px] font-semibold text-slate-900 dark:text-slate-100">{o.label}</span>
                    <span className="font-mono text-[11px] font-semibold text-slate-600 dark:text-slate-400">{o.code}</span>
                  </button>
                ))}
                </div>
              </div>
            )}
            {fg && (
              <div className="mt-1.5 flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
                <CheckCircle className="h-3.5 w-3.5" /><span className="font-medium">{fg.label}</span>
                <span className="font-mono text-muted-foreground">{fg.code}</span>
              </div>
            )}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Revision No</label>
          <input id="f-material-accessory-onchange-item-v-index" type="number" min="1" value={revision} onChange={(e) => setRevision(e.target.value)} className={INP} />
        </div>
        <div className="flex items-center gap-2 mt-5">
          <input id="is-default" type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="h-4 w-4 rounded border-border" />
          <label htmlFor="is-default" className="text-sm">Mark as default revision</label>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="f-notes" className="mb-1 block text-xs font-medium text-muted-foreground">Notes</label>
          <textarea id="f-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional — describe changes in this revision" className={INP} />
        </div>
      </div>

      {/* BOM lines */}
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Material Lines</div>
        <div className="space-y-2">
          {lines.map((line, i) => (
            <LineRow key={i} line={line} index={i} total={lines.length}
              onChange={(f) => updateLine(i, f)}
              onRemove={() => setLines((ls) => ls.filter((_, idx) => idx !== i))} />
          ))}
        </div>
        <button type="button" onClick={() => setLines((ls) => [...ls, blankLine()])} className={`mt-3 ${BTN_GHOST}`}>
          <Plus className="h-3.5 w-3.5" />Add Material
        </button>
      </div>

      {/* BOM service lines */}
      <div className="pt-2 border-t border-primary/10">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Service & Labor Lines</div>
        <div className="space-y-2">
          {serviceLines.map((line, i) => (
            <ServiceLineRow key={i} line={line} index={i}
              onChange={(f) => updateServiceLine(i, f)}
              onRemove={() => setServiceLines((ls) => ls.filter((_, idx) => idx !== i))} />
          ))}
        </div>
        <button type="button" onClick={() => setServiceLines((ls) => [...ls, blankServiceLine()])} className={`mt-3 ${BTN_GHOST}`}>
          <Plus className="h-3.5 w-3.5" />Add Service/Labor
        </button>
      </div>

      {err && (
        <div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{err}
        </div>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className={BTN_PRIMARY}><CheckCircle className="h-3.5 w-3.5" />{saving ? "Creating…" : "Create BOM Draft"}</button>
        <button type="button" onClick={onCancel} className={BTN_GHOST}><X className="h-3.5 w-3.5" />Cancel</button>
      </div>
    </form>
  );
}

// ─── Edit BOM lines drawer ────────────────────────────────────────────────────
function EditBomLinesPanel({ bom, onSaved, onClose }: { bom: ManufacturingBom; onSaved: () => void; onClose: () => void }) {
  const [lines, setLines] = useState<LineDraft[]>(
    bom.lines.map((l) => ({
      item: l.inventory_item_product_name ? { id: l.inventory_item, label: l.inventory_item_product_name, code: "", type: "" } : null,
      qty: l.quantity_per_unit,
      wastage: l.wastage_percent ?? "0.00",
      notes: l.notes ?? "",
    }))
  );
  const [serviceLines, setServiceLines] = useState<ServiceLineDraft[]>(
    bom.service_lines?.map((l) => ({
      item: l.service_name ? { id: l.service, label: l.service_name, code: l.service_code || "", type: "" } : null,
      employee: l.default_employee ? { id: l.default_employee, label: l.default_employee_name || "", code: l.default_employee_code || "", type: "Employee" } : null,
      qty: l.quantity,
      notes: l.notes ?? "",
    })) || []
  );
  const [notes, setNotes] = useState(bom.notes ?? "");
  const [isDefault, setIsDefault] = useState(bom.is_default);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function updateLine(i: number, f: Partial<LineDraft>) {
    setLines((ls) => ls.map((l, idx) => idx === i ? { ...l, ...f } : l));
  }
  function updateServiceLine(i: number, f: Partial<ServiceLineDraft>) {
    setServiceLines((ls) => ls.map((l, idx) => idx === i ? { ...l, ...f } : l));
  }

  async function handleSave() {
    const validLines = lines.filter((l) => l.item);
    const validServiceLines = serviceLines.filter((l) => l.item);
    if (!validLines.length) { setErr("At least one material line required."); return; }
    setSaving(true); setErr(null);
    try {
      await updateManufacturingBom(bom.id, {
        is_default: isDefault,
        notes,
        lines: validLines.map((l, i) => ({
          inventory_item: l.item!.id,
          quantity_per_unit: l.qty,
          wastage_percent: l.wastage,
          sort_order: i + 1,
          notes: l.notes,
        })),
        service_lines: validServiceLines.map((l, i) => ({
          service: l.item!.id,
          quantity: l.qty,
          sort_order: i + 1,
          notes: l.notes,
        })),
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save.");
    } finally { setSaving(false); }
  }

  return (
    <div className="border-t border-border px-4 pb-5 pt-4 space-y-4">
      <div className="text-xs font-semibold text-primary">Edit BOM Lines — {bom.bom_no}</div>
      {bom.status === "ACTIVE" && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900/30 dark:bg-amber-900/10 dark:text-amber-400">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          This BOM is ACTIVE. Editing lines will take effect immediately for new production jobs. Consider deactivating first and creating a new revision for audit safety.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-2">
          <input id={`def-${bom.id}`} type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="h-4 w-4 rounded border-border" />
          <label htmlFor={`def-${bom.id}`} className="text-sm">Default revision</label>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="f-notes-2" className="mb-1 block text-xs font-medium text-muted-foreground">Notes</label>
          <textarea id="f-notes-2" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={INP} />
        </div>
      </div>

      <div className="space-y-2">
        {lines.map((line, i) => (
          <LineRow key={i} line={line} index={i} total={lines.length}
            onChange={(f) => updateLine(i, f)}
            onRemove={() => setLines((ls) => ls.filter((_, idx) => idx !== i))} />
        ))}
      </div>
      <button type="button" onClick={() => setLines((ls) => [...ls, blankLine()])} className={BTN_GHOST}>
        <Plus className="h-3.5 w-3.5" />Add Material
      </button>

      <div className="pt-2 border-t border-border mt-4">
        <div className="text-xs font-semibold text-primary mb-3">Service & Labor Lines</div>
        <div className="space-y-2">
          {serviceLines.map((line, i) => (
            <ServiceLineRow key={`srv-${i}`} line={line} index={i}
              onChange={(f) => updateServiceLine(i, f)}
              onRemove={() => setServiceLines((ls) => ls.filter((_, idx) => idx !== i))} />
          ))}
        </div>
        <button type="button" onClick={() => setServiceLines((ls) => [...ls, blankServiceLine()])} className={`${BTN_GHOST} mt-3`}>
          <Plus className="h-3.5 w-3.5" />Add Service/Labor
        </button>
      </div>

      {err && <div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{err}</div>}
      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving} className={BTN_PRIMARY}><CheckCircle className="h-3.5 w-3.5" />{saving ? "Saving…" : "Save Lines"}</button>
        <button onClick={onClose} className={BTN_GHOST}><X className="h-3.5 w-3.5" />Cancel</button>
      </div>
    </div>
  );
}

// ─── BOM card ─────────────────────────────────────────────────────────────────
function BomCard({ bom, onRefresh }: { bom: ManufacturingBom; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [actioning, setActioning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);

  async function handleActivate() {
    setActioning(true); setActionErr(null);
    try { await activateManufacturingBom(bom.id); onRefresh(); }
    catch (e) { setActionErr(e instanceof Error ? e.message : "Failed."); }
    finally { setActioning(false); }
  }

  async function handleDeactivate() {
    setActioning(true); setActionErr(null);
    try { await deactivateManufacturingBom(bom.id); onRefresh(); }
    catch (e) { setActionErr(e instanceof Error ? e.message : "Failed."); }
    finally { setActioning(false); }
  }

  async function handleDelete() {
    setDeleting(true); setActionErr(null);
    try { await deleteManufacturingBom(bom.id); onRefresh(); }
    catch (e) { setActionErr(e instanceof Error ? e.message : "Cannot delete — may have production jobs attached."); setDeleting(false); }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <button onClick={() => { setExpanded((v) => !v); setEditing(false); }} className="flex items-center gap-2 min-w-0 flex-1 text-left">
          {expanded ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-sm">{bom.bom_no}</span>
              <StatusBadge status={bom.status} />
              {bom.is_default && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">Default</span>}
              <span className="text-xs text-muted-foreground">Rev {bom.revision_no}</span>
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{bom.finished_good_product_name || bom.finished_good_sku || "—"}</span>
              {bom.finished_good_sku ? <span className="ml-2 font-mono">{bom.finished_good_sku}</span> : null}
              <span className="ml-2">{bom.lines.length} line{bom.lines.length === 1 ? "" : "s"}</span>
              {bom.activated_by_username ? <span className="ml-2">Activated by {bom.activated_by_username}</span> : null}
            </div>
          </div>
        </button>

        <div className="flex shrink-0 flex-wrap gap-2">
          {bom.status === "DRAFT" && (
            <button onClick={handleActivate} disabled={actioning} className={`${BTN_GHOST} border-emerald-400 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-600 dark:text-emerald-400 dark:hover:bg-emerald-900/20`}>
              <Zap className="h-3.5 w-3.5" />{actioning ? "…" : "Activate"}
            </button>
          )}
          {bom.status === "ACTIVE" && (
            <button onClick={handleDeactivate} disabled={actioning} className={BTN_GHOST}>
              {actioning ? "…" : "Deactivate"}
            </button>
          )}
          <button onClick={() => { setEditing((v) => !v); setExpanded(true); setDeleteConfirm(false); setActionErr(null); }} className={BTN_GHOST}>
            <Edit2 className="h-3.5 w-3.5" />{editing ? "Close" : "Edit Lines"}
          </button>
          <button onClick={() => { setDeleteConfirm((v) => !v); setEditing(false); setActionErr(null); }} className={BTN_DANGER}>
            <Trash2 className="h-3.5 w-3.5" />{deleteConfirm ? "Cancel" : "Delete"}
          </button>
        </div>
      </div>

      {actionErr && (
        <div className="border-t border-border px-4 py-2 text-xs text-destructive flex gap-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />{actionErr}
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="flex flex-wrap items-center gap-3 border-t border-destructive/20 bg-destructive/5 px-4 py-3">
          <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
          <span className="flex-1 text-sm text-destructive">Delete BOM <strong>{bom.bom_no}</strong>? Cannot be undone. Blocked if production jobs exist.</span>
          <button onClick={handleDelete} disabled={deleting} className="rounded-lg bg-destructive px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50 transition">
            {deleting ? "Deleting…" : "Confirm Delete"}
          </button>
        </div>
      )}

      {/* Edit panel */}
      {editing && (
        <EditBomLinesPanel bom={bom} onSaved={() => { setEditing(false); onRefresh(); }} onClose={() => setEditing(false)} />
      )}

      {/* Expanded line table */}
      {expanded && !editing && bom.lines.length > 0 && (
        <div className="border-t border-border">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2 text-left">#</th>
                  <th className="px-4 py-2 text-left">Material / Accessory</th>
                  <th className="px-4 py-2 text-left">Type</th>
                  <th className="px-4 py-2 text-right">Qty / Unit</th>
                  <th className="px-4 py-2 text-right">Wastage %</th>
                  <th className="px-4 py-2 text-left">Notes</th>
                </tr>
              </thead>
              <tbody>
                {bom.lines.map((ln: ManufacturingBomLine, i: number) => (
                  <tr key={ln.id ?? i} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="px-4 py-2 text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-2 font-medium">{ln.inventory_item_product_name ?? `Item #${ln.inventory_item}`}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ln.inventory_item_sku?.startsWith("RM") || (ln as { item_type?: string }).item_type === "RAW_MATERIAL" ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"}`}>
                        {ln.inventory_item_sku ? ln.inventory_item_sku.startsWith("RM") ? "Raw" : "Acc" : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-semibold">{ln.quantity_per_unit}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground">{ln.wastage_percent ?? "0"}%</td>
                    <td className="px-4 py-2 text-xs italic text-muted-foreground">{ln.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {bom.service_lines && bom.service_lines.length > 0 && (
            <div className="overflow-x-auto mt-4 border-t border-border">
              <div className="bg-muted/10 px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Service & Labor</div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2 text-left">#</th>
                    <th className="px-4 py-2 text-left">Service</th>
                    <th className="px-4 py-2 text-right">Qty</th>
                    <th className="px-4 py-2 text-left">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {bom.service_lines.map((ln, i) => (
                    <tr key={ln.id ?? i} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="px-4 py-2 text-muted-foreground">{i + 1}</td>
                      <td className="px-4 py-2 font-medium">{ln.service_name ?? `Service #${ln.service}`}</td>
                      <td className="px-4 py-2 text-right font-semibold">{ln.quantity}</td>
                      <td className="px-4 py-2 text-xs italic text-muted-foreground">{ln.notes || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {bom.notes && (
            <div className="border-t border-border/50 px-4 py-2 text-xs text-muted-foreground"><strong>Notes:</strong> {bom.notes}</div>
          )}
        </div>
      )}

      {expanded && !editing && bom.lines.length === 0 && (
        <div className="border-t border-border px-4 py-4 text-sm text-muted-foreground">No lines defined. Click <strong>Edit Lines</strong> to add materials.</div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function BomsPage() {
  const [boms, setBoms] = useState<ManufacturingBom[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterStatus, setFilterStatus] = useState("");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filterStatus) params.status = filterStatus;
      if (search.trim()) params.search = search.trim();
      const res = await listManufacturingBoms(params);
      setBoms(res.results ?? []);
      setTotal(res.count ?? 0);
      setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load."); }
    finally { setLoading(false); }
  }, [filterStatus, search]);

  useEffect(() => { void load(); }, [load]);

  const active = boms.filter((b) => b.status === "ACTIVE").length;
  const draft = boms.filter((b) => b.status === "DRAFT").length;
  const inactive = boms.filter((b) => b.status === "INACTIVE").length;

  return (
    <ERPPageShell
      eyebrow="Manufacturing"
      title="BOM Register"
      subtitle="Create and manage Bill of Materials revisions. Activate a BOM to enable production jobs against it."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Manufacturing", href: ROUTES.admin.manufacturing },
        { label: "BOMs" },
      ]}
      statusBadge={{ label: "BOM Governance", tone: "info" as const }}
      stats={[
        { label: "Total", value: loading ? "—" : total, tone: "default" },
        { label: "Active", value: loading ? "—" : active, tone: "success" },
        { label: "Draft", value: loading ? "—" : draft, tone: "warning" },
        { label: "Inactive", value: loading ? "—" : inactive, tone: "default" },
      ]}
    >
      <div className="space-y-5">

        {/* Create form */}
        {showCreate ? (
          <CreateBomForm onCreated={() => { setShowCreate(false); void load(); }} onCancel={() => setShowCreate(false)} />
        ) : (
          <div className="flex flex-wrap gap-3">
            <button onClick={() => setShowCreate(true)} className={BTN_PRIMARY}><Plus className="h-4 w-4" />New BOM Draft</button>
            <Link href={ROUTES.admin.inventoryRawMaterials} className={BTN_GHOST}>Raw Materials →</Link>
            <Link href={ROUTES.admin.manufacturingJobs} className={BTN_GHOST}>Production Jobs →</Link>
            <button onClick={() => void load()} className={BTN_GHOST}><RefreshCw className="h-3.5 w-3.5" />Refresh</button>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3 rounded-xl border border-border bg-muted/20 px-4 py-3">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by BOM No, product name, SKU…" className="min-w-[220px] flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="DRAFT">Draft</option>
            <option value="INACTIVE">Inactive</option>
          </select>
          {(search || filterStatus) && <button onClick={() => { setSearch(""); setFilterStatus(""); }} className={BTN_GHOST}><X className="h-3.5 w-3.5" />Clear</button>}
          <span className="self-center text-xs text-muted-foreground">{total} BOM{total === 1 ? "" : "s"}</span>
        </div>

        {/* BOM list */}
        {loading ? <ERPLoadingState label="Loading BOMs…" /> : error ? (
          <div className="flex gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>
        ) : boms.length === 0 ? (
          <ERPEmptyState title="No BOMs found" description={search || filterStatus ? "No BOMs match your filters." : "Click 'New BOM Draft' to create your first Bill of Materials."} />
        ) : (
          <div className="space-y-3">
            {boms.map((bom) => <BomCard key={bom.id} bom={bom} onRefresh={() => void load()} />)}
          </div>
        )}

        {/* Workflow */}
        <div className="rounded-xl border border-border bg-muted/20 px-5 py-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">BOM Workflow</div>
          <ol className="space-y-2 text-sm text-muted-foreground">
            <li><span className="font-semibold text-foreground">1. Create raw materials</span> — add ply, timber, fabric etc. in <Link href={ROUTES.admin.inventoryRawMaterials} className="text-primary underline">Raw Materials</Link> with std unit cost.</li>
            <li><span className="font-semibold text-foreground">2. Create BOM Draft</span> — select the finished good, set revision, add material lines (qty per unit + wastage %).</li>
            <li><span className="font-semibold text-foreground">3. Activate</span> — click Activate to make it available for production jobs. Only ACTIVE BOMs are selectable in jobs.</li>
            <li><span className="font-semibold text-foreground">4. New revisions</span> — create a new BOM draft (same FG, higher revision) to iterate. Deactivate old, activate new.</li>
            <li><span className="font-semibold text-foreground">5. Production job</span> — go to <Link href={ROUTES.admin.manufacturingJobs} className="text-primary underline">Production Jobs</Link>, create a job against the active BOM, issue materials and post.</li>
          </ol>
        </div>

      </div>
    </ERPPageShell>
  );
}
