"use client";

import { motion, useInView, useSpring, useTransform } from "framer-motion";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface StatItemProps {
  label: string;
  value: number;
  suffix?: string;
  prefix?: string;
}

function AnimatedNumber({ value, prefix = "", suffix = "" }: Omit<StatItemProps, "label">) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });
  
  const spring = useSpring(0, { mass: 1, stiffness: 50, damping: 20 });
  const display = useTransform(spring, (current) => Math.round(current).toLocaleString());

  useEffect(() => {
    if (inView) {
      spring.set(value);
    }
  }, [inView, spring, value]);

  return (
    <span ref={ref} className="font-bold text-3xl md:text-4xl text-foreground">
      {prefix}
      <motion.span>{display}</motion.span>
      {suffix}
    </span>
  );
}

interface AnimatedStatsStripProps {
  stats: StatItemProps[];
  className?: string;
}

export default function AnimatedStatsStrip({ stats, className }: AnimatedStatsStripProps) {
  return (
    <div className={cn("grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-8", className)}>
      {stats.map((stat, idx) => (
        <motion.div
          key={idx}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5, delay: idx * 0.1 }}
          className="flex flex-col items-center justify-center p-4 rounded-3xl border border-[var(--border)] bg-[color-mix(in_oklab,var(--surface-card)_80%,transparent)] backdrop-blur shadow-sm"
        >
          <AnimatedNumber value={stat.value} prefix={stat.prefix} suffix={stat.suffix} />
          <span className="mt-2 text-xs md:text-sm font-semibold tracking-wide text-muted-foreground uppercase text-center">
            {stat.label}
          </span>
        </motion.div>
      ))}
    </div>
  );
}
