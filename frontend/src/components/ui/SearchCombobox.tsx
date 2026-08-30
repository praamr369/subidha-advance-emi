"use client";
import { type ReactNode } from "react";

interface SearchComboboxProps<T> {
  show: boolean;
  loading?: boolean;
  error?: string | null;
  results: T[];
  renderItem: (item: T) => ReactNode;
  emptyMessage?: string;
  loadingMessage?: string;
  maxHeight?: string;
  zIndex?: string;
  footer?: ReactNode;
}

/**
 * Shared search-dropdown shell used across the webapp.
 * Renders a solid-background, high-contrast dropdown panel below a search input.
 * The caller controls `show`, supplies `results`, and provides `renderItem` for row content.
 */
export default function SearchCombobox<T>({
  show,
  loading = false,
  error,
  results,
  renderItem,
  emptyMessage = "No results found.",
  loadingMessage = "Searching…",
  maxHeight = "20rem",
  zIndex = "z-[90]",
  footer,
}: SearchComboboxProps<T>) {
  if (!show) return null;

  return (
    <div
      className={`absolute left-0 right-0 mt-1 ${zIndex} overflow-y-auto rounded-xl border-2 border-slate-300 dark:border-slate-600 shadow-[0_8px_32px_rgba(0,0,0,0.22)]`}
      style={{ maxHeight, background: "transparent" }}
    >
      <div className="rounded-xl overflow-hidden bg-white dark:bg-slate-900">
        {loading ? (
          <div className="flex items-center gap-2.5 px-4 py-3.5 text-[13px] font-medium text-slate-500 dark:text-slate-400">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
            {loadingMessage}
          </div>
        ) : error ? (
          <div className="px-4 py-3 text-[13px] font-medium text-red-600 dark:text-red-400">{error}</div>
        ) : results.length > 0 ? (
          <>
            <ul className="divide-y-2 divide-slate-100 dark:divide-slate-800">
              {results.map((item, idx) => (
                <li key={idx}>{renderItem(item)}</li>
              ))}
            </ul>
            {footer && (
              <div className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-4 py-2.5">
                {footer}
              </div>
            )}
          </>
        ) : (
          <div className="px-4 py-3.5 text-[13px] text-slate-500 dark:text-slate-400">
            {emptyMessage}
            {footer && (
              <div className="mt-2.5 flex flex-wrap gap-2">{footer}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Standard row button wrapper — gives hover bg, consistent padding */
export function SearchComboboxRow({
  onClick,
  children,
  disabled,
}: {
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onMouseDown={onClick}
      disabled={disabled}
      className="w-full px-4 py-2.5 text-left transition-colors hover:bg-blue-50 dark:hover:bg-blue-950/40 focus:bg-blue-50 dark:focus:bg-blue-950/40 focus:outline-none disabled:opacity-50"
    >
      {children}
    </button>
  );
}

/** Code badge — monospace pill for product codes / customer codes */
export function CodeBadge({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 rounded border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] font-bold text-slate-700 dark:text-slate-200">
      {children}
    </span>
  );
}

/** Status pill — green for active/in-stock, red for inactive/out */
export function StatusPill({
  ok,
  labelOk,
  labelBad,
}: {
  ok: boolean;
  labelOk?: string;
  labelBad?: string;
}) {
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
        ok
          ? "border-green-400 bg-green-100 text-green-800 dark:border-green-600 dark:bg-green-900 dark:text-green-200"
          : "border-red-400 bg-red-100 text-red-800 dark:border-red-600 dark:bg-red-900 dark:text-red-200"
      }`}
    >
      {ok ? (labelOk ?? "✓ Active") : (labelBad ?? "✗ Inactive")}
    </span>
  );
}
