"use client";

import { useRef, useState } from "react";
import { createCustomerOpeningOutstanding } from "@/services/data-migration";
import { searchCustomers, type CustomerRecord } from "@/services/customers";

function toErr(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null && "readableMessage" in e) return String((e as { readableMessage: unknown }).readableMessage);
  return "Request failed.";
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function CustomerSearch({ onSelect }: { onSelect: (c: CustomerRecord) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  function handleInput(q: string) {
    setQuery(q);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (q.trim().length < 2) { setResults([]); setOpen(false); return; }
    timerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await searchCustomers(q);
        setResults(res);
        setOpen(true);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 300);
  }

  function select(c: CustomerRecord) {
    onSelect(c);
    setQuery(`${c.name} (${c.phone})`);
    setOpen(false);
  }

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => handleInput(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search existing customer by name or phone…"
        className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
      />
      {searching && <div className="mt-1 text-xs text-muted-foreground">Searching…</div>}
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full overflow-y-auto rounded-xl border-2 border-slate-300 dark:border-slate-600 shadow-[0_8px_32px_rgba(0,0,0,0.22)]" style={{ maxHeight: "16rem" }}>
          <div className="rounded-xl overflow-hidden bg-white dark:bg-slate-900 divide-y-2 divide-slate-100 dark:divide-slate-800">
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              onMouseDown={() => select(c)}
              className="flex w-full flex-col items-start px-4 py-2.5 text-left hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
            >
              <span className="text-[13px] font-bold text-slate-900 dark:text-slate-100">{c.name}</span>
              <span className="text-[12px] text-slate-500 dark:text-slate-400">{c.phone}</span>
            </button>
          ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CustomerOutstandingQuickEntry() {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [matched, setMatched] = useState<CustomerRecord | null>(null);

  const [form, setForm] = useState({
    customer_name: "",
    phone: "",
    outstanding_amount: "",
    entry_date: today(),
    notes: "",
  });

  function handleCustomerSelect(c: CustomerRecord) {
    setMatched(c);
    setForm((p) => ({ ...p, customer_name: c.name, phone: c.phone }));
  }

  function clearMatch() {
    setMatched(null);
    setForm((p) => ({ ...p, customer_name: "", phone: "" }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await createCustomerOpeningOutstanding(form);
      setNotice(`Outstanding ₹${form.outstanding_amount} for "${form.customer_name}" saved.`);
      setForm((p) => ({ ...p, customer_name: "", phone: "", outstanding_amount: "", notes: "" }));
      setMatched(null);
    } catch (err) {
      setError(toErr(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Customer Opening Outstanding</h2>
        <p className="text-sm text-muted-foreground">Record unpaid amounts owed by customers at the time of migration. Each entry posts a journal to Customer Receivables.</p>
      </div>

      <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 px-4 py-3 text-sm text-foreground">
        Search for an existing CRM customer to auto-fill name and phone, or type a legacy customer's name manually if they are not yet in the system.
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300">{error}</div>}
      {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-900/10 dark:text-emerald-300">{notice}</div>}

      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <div>
          <span className="mb-1.5 block text-sm font-medium text-foreground">Search existing customer <span className="font-normal text-muted-foreground">(optional)</span></span>
          <CustomerSearch onSelect={handleCustomerSelect} />
          {matched && (
            <div className="mt-1.5 flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-1.5">
              <span className="text-xs text-emerald-700">Linked: {matched.name} · {matched.phone}</span>
              <button type="button" onClick={clearMatch} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-foreground">
            Customer Name *
            <input
              required
              type="text"
              value={form.customer_name}
              onChange={(e) => setForm((p) => ({ ...p, customer_name: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2"
              placeholder="e.g. Ramesh Kumar"
            />
          </label>
          <label className="block text-sm font-medium text-foreground">
            Phone
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2"
              placeholder="e.g. 9876543210"
            />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-foreground">
            Outstanding Amount (₹) *
            <input
              required
              type="number"
              min="0.01"
              step="0.01"
              value={form.outstanding_amount}
              onChange={(e) => setForm((p) => ({ ...p, outstanding_amount: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-right tabular-nums"
              placeholder="0.00"
            />
          </label>
          <label className="block text-sm font-medium text-foreground">
            Entry Date *
            <input
              required
              type="date"
              value={form.entry_date}
              onChange={(e) => setForm((p) => ({ ...p, entry_date: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2"
            />
          </label>
        </div>

        <label className="block text-sm font-medium text-foreground">
          Notes / Reference
          <input
            type="text"
            value={form.notes}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2"
            placeholder="e.g. Balance from old ledger page 42"
          />
        </label>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={busy || !form.customer_name || !form.outstanding_amount}
            className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save & Add Another"}
          </button>
        </div>
      </form>
    </div>
  );
}
