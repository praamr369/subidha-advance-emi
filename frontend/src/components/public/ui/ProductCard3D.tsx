"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface ProductCard3DProps {
  id: string;
  title: string;
  category: string;
  price: number;
  emiAmount: number;
  imageUrl: string;
  href: string;
  className?: string;
}

export default function ProductCard3D({
  id,
  title,
  category,
  price,
  emiAmount,
  imageUrl,
  href,
  className,
}: ProductCard3DProps) {
  return (
    <motion.div
      whileHover={{ y: -6 }}
      className={cn(
        "group relative flex min-w-[240px] flex-col overflow-hidden rounded-[1.8rem] border border-[var(--border)] bg-[color-mix(in_oklab,var(--surface-card)_98%,transparent)] p-3 shadow-[0_16px_34px_-24px_rgba(15,23,42,0.5)] transition-shadow hover:shadow-[0_24px_54px_-24px_rgba(15,23,42,0.6)] dark:shadow-[0_16px_34px_-24px_rgba(0,0,0,0.6)] dark:hover:shadow-[0_24px_54px_-24px_rgba(0,0,0,0.7)]",
        className
      )}
      style={{
        boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.4)",
      }}
    >
      <Link href={href} className="absolute inset-0 z-10">
        <span className="sr-only">View {title}</span>
      </Link>
      
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[1.2rem] bg-muted/30">
        {/* Replace with real image when data is mapped */}
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/30 font-bold text-xl">
          Image Placeholder
        </div>
        <div className="absolute top-2 left-2 z-20 rounded-lg border border-white/20 bg-black/40 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur-md">
          {category}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-1 px-1 pb-1">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
          {title}
        </h3>
        
        <div className="mt-2 flex items-end justify-between">
          <div className="flex flex-col">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">From</span>
            <span className="text-lg font-bold text-primary">₹{emiAmount.toLocaleString()}<span className="text-xs font-medium text-muted-foreground">/mo</span></span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-medium text-muted-foreground">Cash Price</span>
            <span className="text-sm font-semibold text-foreground">₹{price.toLocaleString()}</span>
          </div>
        </div>
        
        <motion.button
          whileTap={{ scale: 0.95 }}
          className="mt-3 relative z-20 w-full rounded-xl bg-primary/10 py-2.5 text-xs font-bold text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
        >
          View Plans
        </motion.button>
      </div>
    </motion.div>
  );
}
