// frontend/src/components/ui/DrawerShell.tsx
"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";

type DrawerShellProps = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
};

export default function DrawerShell({
  open,
  title,
  description,
  onClose,
  children,
  footer,
}: DrawerShellProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="flex-1 bg-black/40 transition-opacity"
        onClick={onClose}
      />
      <div className="flex h-full w-full max-w-xl flex-col border-l border-border bg-background shadow-2xl animate-in slide-in-from-right duration-300">
        <div className="flex items-start justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            {description && (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
        {footer && (
          <div className="border-t border-border px-6 py-4 bg-card">{footer}</div>
        )}
      </div>
    </div>
  );
}