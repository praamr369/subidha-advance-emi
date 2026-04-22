"use client";

import { AlertTriangle, X } from "lucide-react";
import { useState } from "react";

import ActionButton from "@/components/ui/ActionButton";
import ModalShell from "@/components/ui/ModalShell";

type ConfirmActionButtonProps = {
  label: string;
  confirmLabel?: string;
  title: string;
  description: string;
  onConfirm: () => Promise<void> | void;
  variant?: "primary" | "secondary" | "destructive" | "outline" | "ghost";
  disabled?: boolean;
  className?: string;
};

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

  async function handleConfirm() {
    setLoading(true);
    try {
      await onConfirm();
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <ActionButton
        variant={variant}
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={className}
      >
        {label}
      </ActionButton>

      <ModalShell
        open={open}
        onClose={() => {
          if (loading) return;
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
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-2.5 text-amber-800">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold tracking-tight text-foreground">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
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
                onClick={() => setOpen(false)}
              >
                Cancel
              </ActionButton>
              <ActionButton
                variant={variant === "destructive" ? "destructive" : "primary"}
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
