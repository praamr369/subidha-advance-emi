"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Home, Sparkles, Truck, Wallet, Boxes } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import Image from "next/image";
import { ROUTES } from "@/lib/routes";

type Chapter = {
  eyebrow: string;
  title: string;
  body: string;
  icon: LucideIcon;
  asset: string;
  href: string;
  cta: string;
};

const CHAPTERS: Chapter[] = [
  {
    eyebrow: "01 · The showroom",
    title: "Furniture for real Asansol homes",
    body: "Beds, sofas, wardrobes, dining sets and mattresses — chosen for everyday family living. Visit the showroom to see current designs and availability.",
    icon: Home,
    asset: "/images/hero_living_room.jpg",
    href: ROUTES.public.products,
    cta: "Explore products",
  },
  {
    eyebrow: "02 · The plan",
    title: "Own it now, pay monthly",
    body: "Advance EMI lets eligible customers take furniture home and pay in monthly instalments, with clear tenure and receipted payments as per approved terms.",
    icon: Wallet,
    asset: "/images/banner_draw.jpg",
    href: ROUTES.public.apply,
    cta: "Apply / Enquire",
  },
  {
    eyebrow: "03 · The Lucky Plan",
    title: "A transparent monthly benefit",
    body: "Lucky Plan EMI is a purchase plan where, if a customer wins as per the approved rulebook, future EMIs may be waived per the contract. No lottery, no guaranteed win.",
    icon: Sparkles,
    asset: "/images/banner_draw.jpg",
    href: ROUTES.public.luckyPlan,
    cta: "View Lucky Plan",
  },
  {
    eyebrow: "04 · Flexible ways",
    title: "Rent and lease options too",
    body: "Prefer not to buy outright? Rent and lease options support monthly billing workflows for furniture, as per approved terms and availability.",
    icon: Boxes,
    asset: "/images/banner_rent.jpg",
    href: ROUTES.public.products,
    cta: "See options",
  },
  {
    eyebrow: "05 · To your door",
    title: "Delivery across Asansol",
    body: "We deliver in Asansol and nearby areas. Delivery availability and charges depend on the product and your location — confirm with us before ordering.",
    icon: Truck,
    asset: "/images/category_sofa.jpg",
    href: ROUTES.public.contact,
    cta: "Contact us",
  },
];

export default function CinematicStory() {
  const sectionRef = useRef<HTMLElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    let frame = 0;
    const update = () => {
      const rect = section.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const total = rect.height - vh;
      const scrolled = Math.min(Math.max(-rect.top, 0), Math.max(total, 1));
      const progress = total > 0 ? scrolled / total : 0;
      const index = Math.min(CHAPTERS.length - 1, Math.floor(progress * CHAPTERS.length + 0.001));
      setActive((prev) => (prev === index ? prev : index));
      if (railRef.current) railRef.current.style.setProperty("--imx-progress", progress.toFixed(4));
      frame = 0;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    update();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      aria-label="Subidha Furniture story"
      className="imx-scene relative"
      style={{ height: `${CHAPTERS.length * 100}vh` }}
    >
      <div className="sticky top-0 flex h-screen items-center overflow-hidden">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 sm:px-6 lg:grid-cols-[3rem_minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-10">
          {/* Progress rail */}
          <div className="hidden lg:flex lg:h-64 lg:flex-col lg:items-center">
            <div ref={railRef} className="relative h-full w-[3px] overflow-hidden rounded-full bg-border/60">
              <div className="imx-progress-fill absolute inset-x-0 top-0 h-full rounded-full bg-primary" />
            </div>
          </div>

          {/* Copy column — all chapters in DOM (crawlable); active one shown */}
          <div className="relative min-h-[16rem]">
            {CHAPTERS.map((chapter, index) => {
              const isActive = index === active;
              const Icon = chapter.icon;
              return (
                <article
                  key={chapter.title}
                  className="imx-layer absolute inset-0 flex flex-col justify-center gap-4"
                  style={{
                    ["--imx-depth" as string]: -10,
                    ["--imx-tilt" as string]: 1.5,
                    opacity: isActive ? 1 : 0,
                    transform: isActive ? "translate3d(0,0,0)" : "translate3d(0,26px,0)",
                    transition: "opacity 560ms cubic-bezier(0.22,1,0.36,1), transform 560ms cubic-bezier(0.22,1,0.36,1)",
                    pointerEvents: isActive ? "auto" : "none",
                  }}
                  aria-hidden={!isActive}
                >
                  <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border/70 bg-[color-mix(in_oklab,var(--surface-card-elevated)_78%,transparent)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                    <Icon className="h-3.5 w-3.5 text-primary" />
                    {chapter.eyebrow}
                  </div>
                  <h2 className="text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl lg:text-5xl">
                    {chapter.title}
                  </h2>
                  <p className="max-w-xl text-base leading-8 text-muted-foreground">{chapter.body}</p>
                  <Link href={chapter.href} className="public-action-primary w-fit gap-2">
                    {chapter.cta}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </article>
              );
            })}
          </div>

          {/* Visual column — depth-scaled marketing frames */}
          <div className="relative aspect-[4/3] w-full">
            {CHAPTERS.map((chapter, index) => {
              const isActive = index === active;
              const offset = index - active;
              return (
                <div
                  key={chapter.title}
                  className="imx-layer absolute inset-0"
                  style={{
                    ["--imx-depth" as string]: 12,
                    ["--imx-tilt" as string]: 8,
                    opacity: isActive ? 1 : 0,
                    transform: isActive
                      ? "translate3d(0,0,0) scale(1) rotateY(0deg)"
                      : `translate3d(0,${offset * 8}%,0) scale(0.9) rotateY(${offset * -6}deg)`,
                    transition: "opacity 620ms cubic-bezier(0.22,1,0.36,1), transform 620ms cubic-bezier(0.22,1,0.36,1)",
                    zIndex: isActive ? 2 : 1,
                  }}
                  aria-hidden={!isActive}
                >
                  <div className="relative w-full overflow-hidden rounded-[1.2rem] shadow-[0_24px_54px_-24px_rgba(15,23,42,0.6)]">
                    <Image
                      src={chapter.asset}
                      alt={chapter.title}
                      width={800}
                      height={533}
                      className="w-full object-cover aspect-[4/3] sm:aspect-[16/9]"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
