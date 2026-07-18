"use client";

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
    <div
      className={cn(
        "group relative flex min-w-[240px] flex-col overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm transition-all duration-300 hover:shadow-md hover:border-primary/30",
        className
      )}
    >
      <Link href={href} className="absolute inset-0 z-10">
        <span className="sr-only">View {title}</span>
      </Link>
      
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-muted/40 flex items-center justify-center">
        {imageUrl ? (
          <Image src={imageUrl} alt={title} fill className="object-cover" sizes="(max-width: 768px) 100vw, 33vw" />
        ) : (
          <div className="text-muted-foreground/40 font-medium text-sm">Image Pending</div>
        )}
        <div className="absolute top-2 left-2 z-20 rounded border border-white/40 bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-slate-800 backdrop-blur-md dark:border-black/40 dark:bg-black/60 dark:text-slate-200">
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
        
        <button
          className="mt-4 relative z-20 w-full rounded-md bg-primary/10 py-2.5 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
        >
          View Plans
        </button>
      </div>
    </div>
  );
}
