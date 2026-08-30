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
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border px-4 py-4 transition-all duration-200",
        isActive
          ? "border-primary bg-primary/5 text-primary shadow-[0_2px_10px_-4px_rgba(0,0,0,0.1)]"
          : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:bg-muted hover:text-foreground hover:shadow-sm",
        className
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-background shadow-sm border border-border/50 transition-colors">
        {icon}
      </div>
      <span className="text-sm font-medium tracking-tight">{label}</span>
    </motion.button>
  );
}
