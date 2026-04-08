"use client";

import { useState } from "react";

import ActionButton from "@/components/ui/ActionButton";

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

      {open ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-md rounded-[1.75rem] border border-white/70 bg-white p-6 shadow-[0_32px_90px_-42px_rgba(15,23,42,0.8)]">
            <h3 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <ActionButton
                variant="ghost"
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
      ) : null}
    </>
  );
}

