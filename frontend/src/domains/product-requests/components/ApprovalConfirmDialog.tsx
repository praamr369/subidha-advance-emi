"use client";

import { useEffect } from "react";

interface ApprovalConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  isLoading?: boolean;
  title: string;
  description: string;
  approveLabel?: string;
  rejectLabel?: string;
}

export default function ApprovalConfirmDialog({
  isOpen,
  onClose,
  onApprove,
  onReject,
  isLoading = false,
  title,
  description,
  approveLabel = "Approve",
  rejectLabel = "Reject",
}: ApprovalConfirmDialogProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isLoading) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
      return () => {
        document.removeEventListener("keydown", handleEscape);
        document.body.style.overflow = "auto";
      };
    }
  }, [isOpen, onClose, isLoading]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 transition-opacity"
        onClick={() => !isLoading && onClose()}
      />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl bg-background shadow-2xl animate-in fade-in zoom-in-95">
          <div className="px-6 py-6">
            {/* Title */}
            <h2 className="text-xl font-bold text-foreground">{title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{description}</p>

            {/* Actions */}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className="rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onReject();
                }}
                disabled={isLoading}
                className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition"
              >
                {isLoading ? "Processing..." : rejectLabel}
              </button>
              <button
                type="button"
                onClick={() => {
                  onApprove();
                }}
                disabled={isLoading}
                className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition"
              >
                {isLoading ? "Processing..." : approveLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
