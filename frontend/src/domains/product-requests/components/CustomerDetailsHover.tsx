"use client";

import { useEffect, useRef, useState } from "react";
import CustomerDetailsCard, { type CustomerDetails } from "./CustomerDetailsCard";

interface CustomerDetailsHoverProps {
  customer: CustomerDetails | null;
  isLoading?: boolean;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}

export default function CustomerDetailsHover({
  customer,
  isLoading = false,
  children,
  side = "right",
}: CustomerDetailsHoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        triggerRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  // Mobile modal
  if (isMobile) {
    return (
      <>
        <div
          ref={triggerRef}
          onClick={() => setIsOpen(true)}
          className="cursor-pointer hover:underline"
        >
          {children}
        </div>

        {isOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40 bg-black/50 transition-opacity"
              onClick={() => setIsOpen(false)}
            />

            {/* Bottom Sheet */}
            <div className="fixed inset-x-0 bottom-0 z-50 animate-in slide-in-from-bottom-5">
              <div className="rounded-t-3xl border-t border-border bg-background p-4 shadow-2xl max-h-[80vh] overflow-y-auto">
                <div className="mx-auto flex w-12 h-1 rounded-full bg-muted mb-4" />
                <div className="px-2">
                  <CustomerDetailsCard
                    customer={customer}
                    isLoading={isLoading}
                    onClose={() => setIsOpen(false)}
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </>
    );
  }

  // Desktop hover popover
  const getPositionClass = () => {
    switch (side) {
      case "top":
        return "bottom-full mb-2";
      case "bottom":
        return "top-full mt-2";
      case "left":
        return "right-full mr-2";
      case "right":
      default:
        return "left-full ml-2";
    }
  };

  return (
    <div className="relative inline-block">
      <div
        ref={triggerRef}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        className="cursor-pointer hover:underline"
      >
        {children}
      </div>

      {isOpen && (
        <div
          ref={popoverRef}
          className={`absolute z-50 animate-in fade-in zoom-in-95 ${getPositionClass()}`}
          onMouseEnter={() => setIsOpen(true)}
          onMouseLeave={() => setIsOpen(false)}
        >
          <CustomerDetailsCard
            customer={customer}
            isLoading={isLoading}
            onClose={() => setIsOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

export type { CustomerDetails };
