"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";

import {
  confirmSuggestion,
  suggestField,
  suggestHsn,
  type SmartSuggestion,
} from "@/services/smart-fields";

type SmartSuggestFieldProps = {
  id: string;
  label: string;
  /** Stored value of the field (e.g. the HSN code). */
  value: string;
  onChange: (value: string) => void;
  /**
   * Free text the suggestion is derived from (e.g. product name + description).
   * The "Suggest" action and confirmation learning both key off this.
   */
  sourceText: string;
  /** Namespace for learning, e.g. "product.hsn". Defaults to the HSN field. */
  fieldKey?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  error?: string;
  /** Called when a suggestion is accepted, with any associated rate metadata. */
  onAccept?: (suggestion: SmartSuggestion) => void;
};

/**
 * Reusable "AI suggest" field. Renders a text input plus a Suggest button that
 * fetches ranked, locally-computed suggestions. Accepting one fills the field and
 * records the confirmation so future suggestions for the same input improve.
 */
export default function SmartSuggestField({
  id,
  label,
  value,
  onChange,
  sourceText,
  fieldKey = "product.hsn",
  placeholder,
  disabled = false,
  required = false,
  error,
  onAccept,
}: SmartSuggestFieldProps) {
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<SmartSuggestion[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  async function handleSuggest() {
    const text = (sourceText || "").trim();
    if (!text) {
      setFetchError("Enter a name/description first to get suggestions.");
      setSuggestions([]);
      setOpen(true);
      return;
    }
    setLoading(true);
    setFetchError(null);
    try {
      const results =
        fieldKey === "product.hsn"
          ? await suggestHsn(text)
          : await suggestField(fieldKey, text);
      setSuggestions(results);
      setOpen(true);
      if (results.length === 0) setFetchError("No suggestions found.");
    } catch {
      setFetchError("Could not load suggestions.");
    } finally {
      setLoading(false);
    }
  }

  function handleAccept(s: SmartSuggestion) {
    onChange(s.code);
    onAccept?.(s);
    setOpen(false);
    // Fire-and-forget: persist the confirmation so the mapping is learned.
    void confirmSuggestion({
      fieldKey,
      input: sourceText,
      value: s.code,
      label: s.description,
      gstRate: s.gst_rate,
    }).catch(() => {});
  }

  return (
    <div className="space-y-2" ref={containerRef}>
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </label>
      <div className="relative">
        <div className="flex gap-2">
          <input
            id={id}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            className={[
              "h-12 w-full rounded-xl border bg-background px-4 text-sm text-foreground outline-none transition",
              error
                ? "border-destructive focus:border-destructive focus:ring-destructive/20"
                : "border-input focus:border-ring focus:ring-2 focus:ring-ring/20",
            ].join(" ")}
          />
          <button
            type="button"
            onClick={handleSuggest}
            disabled={disabled || loading}
            className="inline-flex h-12 shrink-0 items-center gap-1.5 rounded-xl border border-input bg-muted px-3 text-sm font-medium text-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Get AI suggestions"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 text-primary" />
            )}
            Suggest
          </button>
        </div>

        {open && (
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-border bg-background shadow-lg">
            {fetchError ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">{fetchError}</p>
            ) : (
              <ul className="max-h-64 overflow-auto py-1">
                {suggestions.map((s) => (
                  <li key={`${s.code}-${s.source}`}>
                    <button
                      type="button"
                      onClick={() => handleAccept(s)}
                      className="flex w-full items-start justify-between gap-3 px-4 py-2.5 text-left transition hover:bg-accent"
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="font-medium text-foreground">{s.code}</span>
                          {s.gst_rate != null && (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                              GST {s.gst_rate}%
                            </span>
                          )}
                          {s.source === "LEARNED" && (
                            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                              Learned
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {s.description}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {Math.round((s.confidence ?? 0) * 100)}%
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
