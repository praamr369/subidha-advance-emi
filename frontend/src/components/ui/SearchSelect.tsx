"use client";

import { useEffect, useRef, useState } from "react";

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
}: SearchSelectProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const [highlightIndex, setHighlightIndex] = useState<number>(-1);

  useEffect(() => {
    if (query.trim().length < minChars) {
      setOptions([]);
      return;
    }

    const timer = setTimeout(() => {
      setLoading(true);

      searchFn(query.trim())
        .then((results) => {
          setOptions(results.slice(0, resultLimit));
          setOpen(true);
        })
        .catch(() => setOptions([]))
        .finally(() => setLoading(false));
    }, 300);

    return () => clearTimeout(timer);
  }, [query, searchFn, minChars, resultLimit]);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handler);

    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function selectOption(option: T) {
    const val = getOptionValue(option);

    onChange(val, option);

    setQuery(getOptionLabel(option));
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(options.length - 1, i + 1));
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(0, i - 1));
    }

    if (e.key === "Enter") {
      e.preventDefault();

      const option = options[highlightIndex];

      if (option) selectOption(option);
    }
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        display: "grid",
        gap: 6,
        width: "100%",
      }}
    >
      {label && (
        <label
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "#334155",
          }}
        >
          {label}
        </label>
      )}

      <div
        style={{
          position: "relative",
        }}
      >
        <input
          value={query}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlightIndex(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid #cbd5e1",
            fontSize: 14,
            outline: "none",
          }}
        />

        {value && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              onChange(null);
              setOptions([]);
            }}
            style={{
              position: "absolute",
              right: 8,
              top: 8,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: 16,
            }}
          >
            ×
          </button>
        )}
      </div>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: 8,
            marginTop: 4,
            maxHeight: 240,
            overflowY: "auto",
            zIndex: 100,
          }}
        >
          {loading && (
            <div
              style={{
                padding: 10,
                fontSize: 13,
                color: "#64748b",
              }}
            >
              Searching...
            </div>
          )}

          {!loading && options.length === 0 && query.length >= minChars && (
            <div
              style={{
                padding: 10,
                fontSize: 13,
                color: "#64748b",
              }}
            >
              No results found
            </div>
          )}

          {options.map((option, index) => {
            const active = index === highlightIndex;

            return (
              <div
                key={getOptionValue(option)}
                onMouseDown={() => selectOption(option)}
                style={{
                  padding: "10px 12px",
                  cursor: "pointer",
                  background: active ? "#f1f5f9" : "transparent",
                  fontSize: 14,
                }}
              >
                {getOptionLabel(option)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}