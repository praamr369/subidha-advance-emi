"use client";

import { AlertTriangle, X } from "lucide-react";
import { useState } from "react";

import { ApiError } from "@/lib/api";
import ActionButton from "@/components/ui/ActionButton";
import ModalShell from "@/components/ui/ModalShell";

type ConfirmActionButtonVariant = "primary" | "secondary" | "destructive" | "danger" | "outline" | "ghost";

type ConfirmActionButtonProps = {
  label: string;
  confirmLabel?: string;
  title: string;
  description: string;
  onConfirm: () => Promise<void> | void;
  variant?: ConfirmActionButtonVariant;
  disabled?: boolean;
  className?: string;
};

function normalizeVariant(variant: ConfirmActionButtonVariant): Exclude<ConfirmActionButtonVariant, "danger"> {
  return variant === "danger" ? "destructive" : variant;
}

export default function ConfirmActionButton({
  label,
  confirmLabel = "Confirm",
  title,
  description,
  onConfirm,
  variant = "secondary",
  disabled = false,
  className,
}: ConfirmActionButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const actionVariant = normalizeVariant(variant);

  function formatActionError(err: unknown): string {
    if (err instanceof ApiError) {
      if (err.status === 404) return "That record was not found.";
      if (err.status === 400) return err.readableMessage || "Request could not be validated.";
      if (err.status >= 500) return "A server error occurred. Please try again or contact support.";
      return err.readableMessage || `Request failed (${err.status}).`;
    }
    if (err instanceof TypeError) {
      return "Unable to reach the server. Check your network connection and try again.";
    }
    if (err instanceof Error && err.message.trim()) return err.message.trim();
    return "Something went wrong.";
  }

  async function handleConfirm() {
    setLoading(true);
    setActionError(null);
    try {
      await onConfirm();
      setOpen(false);
    } catch (err) {
      setActionError(formatActionError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <ActionButton
        variant={actionVariant}
        disabled={disabled}
        onClick={() => {
          setActionError(null);
          setOpen(true);
        }}
        className={className}
      >
        {label}
      </ActionButton>

      <ModalShell
        open={open}
        onClose={() => {
          if (loading) return;
          setActionError(null);
          setOpen(false);
        }}
        title={title}
        closeOnEscape={!loading}
        closeOnOverlayClick={!loading}
        panelClassName="max-w-lg"
      >
        <div className="flex flex-col">
          <div className="workflow-panel-header px-5 py-5 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-amber-800">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold tracking-tight text-foreground">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
                  {actionError ? (
                    <p
                      className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                      role="alert"
                    >
                      {actionError}
                    </p>
                  ) : null}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setActionError(null);
                  setOpen(false);
                }}
                disabled={loading}
                className="popup-control inline-flex h-10 w-10 items-center justify-center rounded-2xl text-muted-foreground transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Close confirmation dialog"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="workflow-panel-footer px-5 py-4 sm:px-6">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <ActionButton
                variant="outline"
                disabled={loading}
                onClick={() => {
                  setActionError(null);
                  setOpen(false);
                }}
              >
                Cancel
              </ActionButton>
              <ActionButton
                variant={actionVariant === "destructive" ? "destructive" : "primary"}
                loading={loading}
                onClick={() => void handleConfirm()}
              >
                {confirmLabel}
              </ActionButton>
            </div>
          </div>
        </div>
      </ModalShell>
    </>
  );
}
