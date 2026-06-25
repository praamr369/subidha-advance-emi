"use client";

import { useState } from "react";

interface Props {
  title: string;
  description: string;
  confirmLabel?: string;
  confirmTone?: "danger" | "primary";
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

/** Extract a human-readable error + optional blockers list from a backend error response. */
export function parseProcurementError(err: unknown): { message: string; blockers: string[] } {
  const body = (err as { body?: Record<string, unknown> })?.body;
  const detail = body?.detail as string | undefined;
  const blockers = Array.isArray(body?.blockers) ? (body.blockers as string[]) : [];
  const nonField = Array.isArray(body?.non_field_errors)
    ? (body.non_field_errors as string[]).join(" ")
    : undefined;
  const message = detail ?? nonField ?? (err instanceof Error ? err.message : "Action failed.");
  return { message, blockers };
}

export default function ProcurementConfirmDialog({
  title,
  description,
  confirmLabel = "Confirm",
  confirmTone = "primary",
  onConfirm,
  onCancel,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [errorInfo, setErrorInfo] = useState<{ message: string; blockers: string[] } | null>(null);

  async function handleConfirm() {
    setBusy(true);
    setErrorInfo(null);
    try {
      await onConfirm();
    } catch (err: unknown) {
      setErrorInfo(parseProcurementError(err));
    } finally {
      setBusy(false);
    }
  }

  const btnClass =
    confirmTone === "danger"
      ? "bg-red-600 text-white hover:bg-red-700 border-red-600"
      : "bg-primary text-primary-foreground hover:opacity-90 border-primary";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-xl">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
        {errorInfo ? (
          <div className="mt-3 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
            <p className="font-semibold">{errorInfo.message}</p>
            {errorInfo.blockers.length > 0 ? (
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                {errorInfo.blockers.map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            ) : null}
          </div>
        ) : null}
        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={busy}
            className="h-9 rounded-xl border border-border bg-background px-4 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleConfirm()}
            disabled={busy}
            className={`h-9 rounded-xl border px-4 text-sm font-semibold disabled:opacity-50 ${btnClass}`}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
