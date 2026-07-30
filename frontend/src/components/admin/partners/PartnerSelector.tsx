"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, Users, CheckCircle, Phone, Fingerprint, X } from "lucide-react";
import { apiFetch, toArray } from "@/lib/api";

export type PartnerOption = {
  id: number;
  username?: string;
  phone?: string;
};

type PartnerSelectorProps = {
  onSelect: (partner: PartnerOption) => void;
  onClear?: () => void;
  selected?: PartnerOption | null;
  disabled?: boolean;
  placeholder?: string;
};

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function normalizePartner(raw: Record<string, unknown>): PartnerOption {
  return {
    id: toNumber(raw.id),
    username: toOptionalString(raw.username),
    phone: toOptionalString(raw.phone),
  };
}

function PartnerResultCard({
  partner,
  onSelect,
}: {
  partner: PartnerOption;
  onSelect: () => void;
}) {
  return (
    <div
      className="cursor-pointer rounded-xl border border-border p-4 transition-colors hover:border-ring hover:bg-accent/30"
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect();
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground">
              {partner.username || "Unknown Partner"}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {partner.phone && (
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {partner.phone}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Fingerprint className="h-3 w-3" />
              ID: {partner.id}
            </span>
          </div>
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

export default function PartnerSelector({
  onSelect,
  onClear,
  selected,
  disabled = false,
  placeholder = "Search partner by name, phone, or ID…",
}: PartnerSelectorProps) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<PartnerOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const runSearch = useCallback(async (term: string) => {
    if (!term.trim()) {
      setResults([]);
      setError(null);
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const payload = await apiFetch<unknown>(
        `/admin/partners/?q=${encodeURIComponent(term.trim())}`
      );
      const normalized = toArray<Record<string, unknown>>(payload).map(normalizePartner);
      setResults(normalized);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error searching partners");
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleInputChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      void runSearch(value);
    }, 300);
  };

  const handleSelect = (partner: PartnerOption) => {
    setQuery("");
    setResults([]);
    onSelect(partner);
  };

  const handleClear = () => {
    setQuery("");
    setResults([]);
    onClear?.();
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckCircle className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold text-emerald-900">
              {selected.username || "Unknown Partner"}
            </div>
            <div className="text-xs text-emerald-700">
              {selected.phone ? `${selected.phone} • ` : ""}
              ID: {selected.id}
            </div>
          </div>
        </div>
        {!disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="h-11 w-full rounded-xl border border-border bg-card pl-10 pr-4 text-sm text-foreground outline-none transition focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-[var(--ring)]/35 disabled:cursor-not-allowed disabled:opacity-60"
        />
        {searching && (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-r-transparent" />
          </div>
        )}
      </div>

      {error && <div className="mt-2 text-xs font-medium text-destructive">{error}</div>}

      {!searching && query.trim() && results.length === 0 && !error && (
        <div className="mt-3 rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <Users className="h-5 w-5 text-muted-foreground" />
          </div>
          <h3 className="mt-3 text-sm font-semibold text-foreground">No partners found</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            No active partners matched &quot;{query}&quot;.
          </p>
        </div>
      )}

      {results.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {results.map((partner) => (
            <PartnerResultCard
              key={partner.id}
              partner={partner}
              onSelect={() => handleSelect(partner)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
