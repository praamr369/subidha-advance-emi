// frontend/src/components/ui/DrawerShell.tsx
"use client";

import { X } from "lucide-react";
import { useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";
import { usePopupPortalRoot, usePopupShell } from "@/components/ui/usePopupShell";

type DrawerShellProps = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "compact" | "default" | "wide" | "full";
  closeOnEscape?: boolean;
  closeOnOverlayClick?: boolean;
  disableClose?: boolean;
  panelClassName?: string;
  bodyClassName?: string;
  contentClassName?: string;
  footerClassName?: string;
};

const sizeClassNames: Record<NonNullable<DrawerShellProps["size"]>, string> = {
  compact: "max-w-md",
  default: "max-w-xl",
  wide: "max-w-[min(100vw,76rem)]",
  full: "max-w-none sm:max-w-[calc(100vw-1.5rem)]",
};

export default function DrawerShell({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  size = "default",
  closeOnEscape = true,
  closeOnOverlayClick = true,
  disableClose = false,
  panelClassName,
  bodyClassName,
  contentClassName,
  footerClassName,
}: DrawerShellProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const portalRoot = usePopupPortalRoot();
  const titleId = useId();
  const descriptionId = useId();

  usePopupShell({
    open,
    panelRef,
    onClose,
    closeOnEscape,
    disableClose,
    ignoreEscapeOnEditableTarget: true,
  });

  if (!open || !portalRoot) return null;

  return createPortal(
    <div className="dashboard-app pointer-events-none fixed inset-0 z-[160] flex" style={{ background: "transparent" }}>
      <div className="workflow-overlay pointer-events-auto absolute inset-0" />
      <div className="relative flex h-full w-full justify-end">
        <div
          className="pointer-events-auto flex-1"
          onMouseDown={(event) => {
            if (!closeOnOverlayClick || disableClose) return;
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
          aria-describedby={description ? descriptionId : undefined}
          className={cn(
            "workflow-drawer-panel pointer-events-auto relative flex h-full w-full min-h-0 flex-col outline-none animate-in slide-in-from-right duration-200",
            sizeClassNames[size],
            panelClassName
          )}
        >
          <div className="workflow-panel-header sticky top-0 z-20 px-4 py-4 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 id={titleId} className="text-lg font-semibold tracking-tight text-foreground">
                  {title}
                </h2>
                {description ? (
                  <p id={descriptionId} className="mt-1 text-sm leading-6 text-muted-foreground">
                    {description}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => {
                  if (disableClose) return;
                  onClose();
                }}
                className="popup-control inline-flex h-10 w-10 items-center justify-center rounded-2xl text-muted-foreground transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                disabled={disableClose}
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className={cn("workflow-panel-body workflow-scroll-area min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5", bodyClassName)}>
            <div className={cn("route-content-fade min-h-full", contentClassName)}>{children}</div>
          </div>

          {footer ? (
            <div className={cn("workflow-panel-footer px-4 py-4 sm:px-6", footerClassName)}>
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    portalRoot
  );
}
