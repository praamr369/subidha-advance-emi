// frontend/src/components/ui/ModalShell.tsx
"use client";

import { useId, useMemo, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";
import { usePopupPortalRoot, usePopupShell } from "@/components/ui/usePopupShell";

type ModalShellProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  panelClassName?: string;
  overlayClassName?: string;
  align?: "center" | "right";
  closeOnEscape?: boolean;
  closeOnOverlayClick?: boolean;
};

export default function ModalShell({
  open,
  title,
  onClose,
  children,
  panelClassName,
  overlayClassName,
  align = "center",
  closeOnEscape = true,
  closeOnOverlayClick = true,
}: ModalShellProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const portalRoot = usePopupPortalRoot();
  const titleId = useId();

  const alignmentClassName = useMemo(() => {
    if (align === "right") return "items-start justify-end";
    return "items-start justify-center sm:items-center";
  }, [align]);

  usePopupShell({
    open,
    panelRef,
    onClose,
    closeOnEscape,
    ignoreEscapeOnEditableTarget: true,
  });

  if (!open || !portalRoot) return null;

  return createPortal(
    <div
      className={cn(
        "dashboard-app pointer-events-none fixed inset-0 z-[180] flex px-3 py-3 sm:px-6 sm:py-6 lg:px-8",
        alignmentClassName
      )}
      style={{ background: "transparent" }}
      aria-hidden={false}
    >
      <div
        className={cn("workflow-overlay pointer-events-auto absolute inset-0", overlayClassName)}
        onMouseDown={(event) => {
          if (!closeOnOverlayClick) return;
          if (event.target !== event.currentTarget) return;
          onClose();
        }}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "workflow-modal-panel pointer-events-auto relative flex w-full min-h-0 max-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-[1.85rem] focus:outline-none sm:max-h-[calc(100dvh-3rem)]",
          panelClassName
        )}
      >
        <div className="sr-only" id={titleId}>
          {title}
        </div>
        {children}
      </div>
    </div>,
    portalRoot
  );
}
