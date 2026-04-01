// frontend/src/components/ui/SearchSelect.tsx
"use client";

import { cn } from "@/lib/utils";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";

type SearchSelectProps<T> = {
  value: string | null;
  onChange: (value: string | null, item?: T) => void;
  searchFn: (query: string) => Promise<T[]>;
  getOptionValue: (item: T) => string;
  getOptionLabel: (item: T) => string;
  label?: string;
  placeholder?: string;
  minChars?: number;
  disabled?: boolean;
  resultLimit?: number;
  loadingText?: string;
  emptyText?: string;
};

export default function SearchSelect<T>({
  value,
  onChange,
  searchFn,
  getOptionValue,
  getOptionLabel,
  label,
  placeholder = "Search...",
  minChars = 2,
  disabled,
  resultLimit = 20,
  loadingText = "Searching...",
  emptyText = "No results found",
}: SearchSelectProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const latestRequestRef = useRef(0);

  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);

  const trimmedQuery = query.trim();
  const shouldSearch = trimmedQuery.length >= minChars;

  useEffect(() => {
    if (!shouldSearch) return;

    const requestId = latestRequestRef.current + 1;
    latestRequestRef.current = requestId;

    const timer = setTimeout(() => {
      setLoading(true);
      searchFn(trimmedQuery)
        .then((results) => {
          if (latestRequestRef.current !== requestId) return;
          setOptions(results.slice(0, resultLimit));
          setOpen(true);
        })
        .catch(() => {
          if (latestRequestRef.current !== requestId) return;
          setOptions([]);
        })
        .finally(() => {
          if (latestRequestRef.current !== requestId) return;
          setLoading(false);
        });
    }, 300);

    return () => clearTimeout(timer);
  }, [trimmedQuery, shouldSearch, searchFn, resultLimit]);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const visibleOptions = useMemo(() => (shouldSearch ? options : []), [options, shouldSearch]);

  function selectOption(option: T) {
    onChange(getOptionValue(option), option);
    setQuery(getOptionLabel(option));
    setOpen(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || visibleOptions.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightIndex((idx) => Math.min(visibleOptions.length - 1, idx + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightIndex((idx) => Math.max(0, idx - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = visibleOptions[highlightIndex];
      if (option) selectOption(option);
    }
  }

  return (
    <div ref={containerRef} className="relative w-full space-y-1.5">
      {label && (
        <label className="text-sm font-medium text-foreground">{label}</label>
      )}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlightIndex(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-10 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
        />
        {value && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              onChange(null);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {open && (
        <div className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-border bg-card shadow-lg">
          {loading && (
            <div className="p-3 text-sm text-muted-foreground">{loadingText}</div>
          )}
          {!loading && shouldSearch && visibleOptions.length === 0 && (
            <div className="p-3 text-sm text-muted-foreground">{emptyText}</div>
          )}
          {visibleOptions.map((option, idx) => (
            <div
              key={getOptionValue(option)}
              onClick={() => selectOption(option)}
              onMouseEnter={() => setHighlightIndex(idx)}
              className={cn(
                "cursor-pointer px-3 py-2 text-sm transition-colors",
                idx === highlightIndex && "bg-muted"
              )}
            >
              {getOptionLabel(option)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}