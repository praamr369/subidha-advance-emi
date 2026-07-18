"use client";

import { motion } from "framer-motion";
import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface CategoryPillProps {
  icon: ReactNode;
  label: string;
  isActive?: boolean;
  onClick?: () => void;
  className?: string;
}

export default function CategoryPill({ icon, label, isActive, onClick, className }: CategoryPillProps) {
  return (
    <motion.button
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-2xl border px-4 py-3 transition-colors",
        isActive
          ? "border-primary bg-primary/10 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
          : "border-[var(--border)] bg-[color-mix(in_oklab,var(--surface-card)_95%,transparent)] text-muted-foreground hover:bg-[var(--surface-muted)] hover:text-foreground shadow-sm",
        className
      )}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-background/50">
        {icon}
      </div>
      <span className="text-xs font-semibold tracking-tight">{label}</span>
    </motion.button>
  );
}
