"use client";

import { useState, useEffect } from "react";
import { ChevronDown } from "lucide-react";

type CollapsibleSectionProps = {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
};

export default function CollapsibleSection({
  id,
  title,
  description,
  children,
  defaultOpen = true,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  // Load persisted state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(`section-${id}`);
    if (saved !== null) {
      setIsOpen(JSON.parse(saved));
    }
  }, [id]);

  // Save state to localStorage
  const handleToggle = () => {
    const newState = !isOpen;
    setIsOpen(newState);
    localStorage.setItem(`section-${id}`, JSON.stringify(newState));
  };

  return (
    <div className="space-y-2">
      <button
        onClick={handleToggle}
        className="flex w-full items-center justify-between rounded-lg border border-border bg-card/50 px-4 py-3 transition hover:bg-card"
      >
        <div className="flex-1 text-left">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {description && (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div className="space-y-3 animate-in fade-in duration-200">
          {children}
        </div>
      )}
    </div>
  );
}
