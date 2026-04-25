"use client";

/**
 * CustomerSelector
 *
 * Phone-first live customer search with inline quick-create.
 * Used in: admin subscription create, admin direct sale create,
 *          cashier payment collection, partner subscription/customer create.
 *
 * Behaviour:
 * - Search by phone (primary) or name/code (secondary)
 * - If phone is found exactly → surface existing customer + show duplicate warning
 * - If phone is not found → show quick-create inline form
 * - Admin/partner can choose to select the existing customer or proceed to create
 * - On create → calls POST /api/v1/customers/create/
 * - On select → calls the onSelect callback with the CustomerRecord
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, UserCheck, UserPlus, AlertTriangle, X, Phone, Mail, MapPin } from "lucide-react";

import type { CustomerRecord } from "@/services/customers";
import {
  searchByPhone,
  searchCustomersShared,
  createCustomerQuick,
} from "@/services/customers";
import StatusBadge from "@/components/ui/status-badge";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SelectorMode = "admin" | "partner";

type CustomerSelectorProps = {
  onSelect: (customer: CustomerRecord) => void;
  onClear?: () => void;
  selected?: CustomerRecord | null;
  mode?: SelectorMode;
  /** When true, selector renders inline in a compact layout (e.g., inside a form row) */
  compact?: boolean;
  placeholder?: string;
  /** Disable all interactions */
  disabled?: boolean;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const raw = error.message.trim();
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (typeof parsed.detail === "string") return parsed.detail;
      const first = Object.values(parsed)[0];
      if (Array.isArray(first) && first.length > 0) return String(first[0]);
    } catch {
      return raw;
    }
    return raw;
  }
  return "Something went wrong.";
}



// ---------------------------------------------------------------------------
// Sub-component: Result card
// ---------------------------------------------------------------------------

function CustomerResultCard({
  customer,
  onSelect,
  isExactMatch,
}: {
  customer: CustomerRecord;
  onSelect: () => void;
  isExactMatch: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 transition-colors hover:border-ring hover:bg-accent/30 cursor-pointer ${
        isExactMatch ? "border-amber-400 bg-amber-50/30" : "border-border"
      }`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect();
      }}
    >
      {isExactMatch && (
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5" />
          Existing customer found with this phone
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{customer.name}</span>
            {customer.kyc_status && (
              <StatusBadge status={customer.kyc_status} size="sm" />
            )}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Phone className="h-3 w-3" />
              {customer.phone}
            </span>
            {customer.email && (
              <span className="flex items-center gap-1">
                <Mail className="h-3 w-3" />
                {customer.email}
              </span>
            )}
            {customer.city && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {customer.city}
              </span>
            )}
          </div>
          {customer.customer_code && (
            <div className="text-xs text-muted-foreground">
              Code: {customer.customer_code}
            </div>
          )}
        </div>
        <div className="shrink-0">
          <span className="rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            Select
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CustomerSelector({
  onSelect,
  onClear,
  selected,
  mode = "admin",
  // compact is part of the public API for future use; layout not yet applied
  compact: _c,
  placeholder = "Search by phone, name, or customer code…",
  disabled = false,
}: CustomerSelectorProps) {
  void _c;
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<CustomerRecord[]>([]);
  const [exactMatch, setExactMatch] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Inline quick-create state
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createAddress, setCreateAddress] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-fill create phone from search query when it looks like a phone number
  useEffect(() => {
    if (!showCreate) return;
    const looksLikePhone = /^\d{8,}$/.test(query.replace(/\D/g, ""));
    if (looksLikePhone) {
      setCreatePhone(query.trim());
    }
  }, [showCreate, query]);

  const runSearch = useCallback(async (term: string) => {
    if (!term.trim()) {
      setResults([]);
      setExactMatch(false);
      setSearchError(null);
      return;
    }

    setSearching(true);
    setSearchError(null);

    try {
      const looksLikePhone = /^\+?\d[\d\s\-()]{6,}$/.test(term.trim());
      const response = looksLikePhone
        ? await searchByPhone(term)
        : await searchCustomersShared(term);
      setResults(response.results);
      setExactMatch(response.exact_match);
      setSearchError(null);
    } catch (err) {
      setSearchError(toErrorMessage(err));
      setResults([]);
      setExactMatch(false);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleInputChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setResults([]);
      setExactMatch(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      void runSearch(value);
    }, 350);
  };

  const handleSelect = (customer: CustomerRecord) => {
    setQuery("");
    setResults([]);
    setExactMatch(false);
    setShowCreate(false);
    onSelect(customer);
  };

  const handleClear = () => {
    setQuery("");
    setResults([]);
    setExactMatch(false);
    setShowCreate(false);
    onClear?.();
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleShowCreate = () => {
    setShowCreate(true);
    setCreateName("");
    setCreatePhone(query.trim());
    setCreateEmail("");
    setCreateAddress("");
    setCreateError(null);
  };

  const handleCreate = async () => {
    const nameVal = createName.trim();
    const phoneVal = createPhone.trim();
    if (!nameVal || !phoneVal) {
      setCreateError("Name and phone are required.");
      return;
    }

    setCreating(true);
    setCreateError(null);
    try {
      const response = await createCustomerQuick({
        name: nameVal,
        phone: phoneVal,
        email: createEmail.trim() || undefined,
        address: createAddress.trim() || undefined,
        source: mode === "partner" ? "PARTNER" : "ADMIN",
      });

      if (!response.created && response.customer.id) {
        // Duplicate – surface the existing customer with a warning
        setResults([response.customer]);
        setExactMatch(true);
        setShowCreate(false);
        return;
      }

      handleSelect(response.customer);
    } catch (err) {
      setCreateError(toErrorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  // -------------------------------------------------------------------------
  // Render: selected state
  // -------------------------------------------------------------------------

  if (selected) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50/30 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 shrink-0 text-green-600" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{selected.name}</span>
                {selected.kyc_status && (
                  <StatusBadge status={selected.kyc_status} size="sm" />
                )}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {selected.phone}
                </span>
                {selected.email && (
                  <span className="flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {selected.email}
                  </span>
                )}
              </div>
            </div>
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="shrink-0 rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Clear selected customer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render: search + results
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-3">
      {/* Search input */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="h-11 w-full rounded-xl border border-input bg-background pl-9 pr-4 text-sm outline-none focus:border-ring disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Search customer"
          autoComplete="off"
        />
        {searching && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            Searching…
          </span>
        )}
      </div>

      {/* Search error */}
      {searchError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {searchError}
        </div>
      )}

      {/* Results list */}
      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((customer) => (
            <CustomerResultCard
              key={customer.id}
              customer={customer}
              onSelect={() => handleSelect(customer)}
              isExactMatch={exactMatch && results.length === 1}
            />
          ))}
        </div>
      )}

      {/* No results + quick-create offer */}
      {!searching &&
        query.trim().length >= 3 &&
        results.length === 0 &&
        !showCreate && (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-center">
            <p className="mb-3 text-sm text-muted-foreground">
              No customers found for <strong>{query}</strong>.
            </p>
            <button
              type="button"
              onClick={handleShowCreate}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <UserPlus className="h-4 w-4" />
              Create new customer
            </button>
          </div>
        )}

      {/* Inline quick-create form */}
      {showCreate && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Create new customer</h4>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {createError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {createError}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">
                Name <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Customer name"
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring"
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">
                Phone <span className="text-destructive">*</span>
              </label>
              <input
                type="tel"
                value={createPhone}
                onChange={(e) => setCreatePhone(e.target.value)}
                placeholder="10-digit mobile number"
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Email <span className="text-xs opacity-60">(optional)</span>
              </label>
              <input
                type="email"
                value={createEmail}
                onChange={(e) => setCreateEmail(e.target.value)}
                placeholder="customer@email.com"
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Address <span className="text-xs opacity-60">(optional)</span>
              </label>
              <input
                type="text"
                value={createAddress}
                onChange={(e) => setCreateAddress(e.target.value)}
                placeholder="Address / city"
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 justify-end pt-1">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted"
              disabled={creating}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={creating || !createName.trim() || !createPhone.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {creating ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Creating…
                </>
              ) : (
                <>
                  <UserPlus className="h-3.5 w-3.5" />
                  Create &amp; Select
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
