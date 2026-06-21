"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type ScrollRevealSectionProps = {
  children: ReactNode;
  className?: string;
  stagger?: boolean;
  threshold?: number;
  once?: boolean;
};

export default function ScrollRevealSection({
  children,
  className,
  stagger = false,
  threshold = 0.12,
  once = true,
}: ScrollRevealSectionProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mediaQuery.matches) {
      el.querySelectorAll<HTMLElement>(
        ".scroll-reveal-item, .scroll-reveal-item-left, .scroll-reveal-item-right, .scroll-reveal-item-scale"
      ).forEach((child) => child.classList.add("is-revealed"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const target = entry.target;
          target.querySelectorAll<HTMLElement>(
            ".scroll-reveal-item, .scroll-reveal-item-left, .scroll-reveal-item-right, .scroll-reveal-item-scale"
          ).forEach((child) => child.classList.add("is-revealed"));
          if (once) observer.unobserve(target);
        });
      },
      { threshold }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, once]);

  return (
    <div ref={ref} className={cn(stagger && "stagger-children", className)}>
      {children}
    </div>
  );
}
