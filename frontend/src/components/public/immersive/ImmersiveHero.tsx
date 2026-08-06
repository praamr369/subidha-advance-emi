"use client";
import { useI18n } from "@/components/i18n/I18nProvider";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { ArrowRight, ChevronDown, ReceiptText, ShieldCheck, Sparkles } from "lucide-react";

import { brandConfig } from "@/config/brand";
import { ROUTES } from "@/lib/routes";

import { type PublicStats } from "@/services/public";

type Props = {
  title: string;
  subtitle: string;
  companyName: string;
  tagline: string;
  stats: PublicStats | null;
};

/**
 * Cinematic hero with real depth: a perspective scene whose layers respond to
 * pointer position (3D tilt/parallax) and scroll (drift + fade). Pure CSS
 * transforms driven by JS-set custom properties — no animation library, no
 * WebGL. All content is real DOM (crawlable) and motion is disabled under
 * prefers-reduced-motion.
 */
export default function ImmersiveHero({ title, subtitle, companyName, tagline, stats }: Props) {
  const { t } = useI18n();
  const sceneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let mx = 0;
    let my = 0;
    let targetX = 0;
    let targetY = 0;
    let scroll = 0;
    let frame = 0;

    const onPointer = (event: PointerEvent) => {
      const rect = scene.getBoundingClientRect();
      targetX = (event.clientX - rect.left) / rect.width - 0.5;
      targetY = (event.clientY - rect.top) / rect.height - 0.5;
    };
    const onLeave = () => {
      targetX = 0;
      targetY = 0;
    };
    const onScroll = () => {
      const rect = scene.getBoundingClientRect();
      scroll = Math.max(-1, Math.min(1, -rect.top / Math.max(rect.height, 1)));
    };

    const tick = () => {
      mx += (targetX - mx) * 0.08;
      my += (targetY - my) * 0.08;
      scene.style.setProperty("--imx-mx", mx.toFixed(4));
      scene.style.setProperty("--imx-my", my.toFixed(4));
      scene.style.setProperty("--imx-scroll", scroll.toFixed(4));
      frame = requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onPointer, { passive: true });
    scene.addEventListener("pointerleave", onLeave);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointer);
      scene.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const heroStats = stats
    ? [
        { label: t('public.ImmersiveHero_prop1'), value: stats.total_batches.toLocaleString("en-IN") },
        { label: t('public.ImmersiveHero_prop2'), value: stats.active_subscriptions.toLocaleString("en-IN") },
        { label: t('public.ImmersiveHero_prop3'), value: stats.total_winners.toLocaleString("en-IN") },
        { label: "Available Seats", value: (stats.batch_available_seats || 0).toLocaleString("en-IN") },
        { label: "Rent Active", value: (stats.active_rent_subscriptions || 0).toLocaleString("en-IN") },
        { label: "Lease Active", value: (stats.active_lease_subscriptions || 0).toLocaleString("en-IN") },
      ]
    : [];

  return (
    <section
      ref={sceneRef}
      className="imx-scene relative isolate overflow-hidden rounded-[2rem] border border-border/60 p-5 sm:p-8 lg:p-10"
      style={{ minHeight: "min(88vh, 46rem)" }}
    >
      {/* Depth 0 — ambient light field (farthest) */}
      <div
        className="imx-layer pointer-events-none absolute inset-0 -z-10"
        style={{ ["--imx-depth" as string]: 18, ["--imx-drift" as string]: 26 }}
        aria-hidden
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_76%_16%,color-mix(in_oklab,var(--primary)_30%,transparent),transparent_42%),radial-gradient(circle_at_16%_82%,color-mix(in_oklab,var(--primary)_16%,transparent),transparent_46%)]" />
        <div className="imx-sweep absolute inset-0" />
      </div>

      <div className="relative z-10 grid gap-10 lg:grid-cols-[minmax(0,1.02fr)_minmax(20rem,0.98fr)] lg:items-center">
        {/* Foreground text — nearest layer, counter-parallax for depth */}
        <div
          className="imx-layer space-y-6"
          style={{ ["--imx-depth" as string]: -14, ["--imx-tilt" as string]: 2, ["--imx-drift" as string]: -14 }}
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-[color-mix(in_oklab,var(--surface-card-elevated)_78%,transparent)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            {companyName} · {brandConfig.publicBranchLocation}
          </div>

          <h1 className="max-w-4xl text-4xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            {title}
          </h1>
          <p className="max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">{subtitle}</p>
          <p className="max-w-2xl text-sm font-semibold leading-6 text-foreground/80">{tagline}</p>

          <div className="flex flex-wrap gap-3">
            <Link href={ROUTES.public.apply} className="public-action-primary gap-2">
              Apply / Enquire
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href={ROUTES.public.products} className="public-action-secondary">
              Explore products
            </Link>
            <Link href={ROUTES.public.luckyPlan} className="public-action-secondary">
              View Lucky Plan
            </Link>
          </div>

          {heroStats.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-3">
              {heroStats.map((item) => (
                <div key={item.label} className="rounded-2xl border border-border/60 bg-[color-mix(in_oklab,var(--surface-card-elevated)_70%,transparent)] px-4 py-3 backdrop-blur">
                  <div className="text-2xl font-semibold tracking-tight text-foreground">{item.value}</div>
                  <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{item.label}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* Mid-depth showroom image + floating spec chips */}
        <div className="relative">
          <div
            className="imx-layer relative"
            style={{ ["--imx-depth" as string]: 8, ["--imx-tilt" as string]: 7, ["--imx-drift" as string]: 12 }}
          >
            <div className="relative overflow-hidden rounded-[1.6rem] shadow-[0_24px_54px_-24px_rgba(15,23,42,0.6)]">
              <Image
                src="/images/hero_living_room.jpg"
                alt="Modern living room with elegant sofa"
                width={800}
                height={533}
                priority
                quality={90}
                sizes="(max-width: 1024px) 100vw, 46vw"
                className="h-full w-full object-cover min-h-[20rem] lg:min-h-[30rem] transition-transform duration-700 hover:scale-[1.02]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
            </div>
          </div>

          <div
            className="imx-layer imx-float pointer-events-none absolute -left-3 top-8 hidden rounded-xl border border-border/70 bg-[color-mix(in_oklab,var(--surface-card-elevated)_86%,transparent)] px-4 py-3 shadow-[0_22px_54px_-38px_rgba(15,23,42,0.74)] backdrop-blur md:block"
            style={{ ["--imx-depth" as string]: 40, ["--imx-tilt" as string]: 10 }}
          >
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Lucky Plan
            </div>
            <div className="mt-1 text-sm font-semibold text-foreground">Future EMI waiver only</div>
          </div>

          <div
            className="imx-layer imx-float pointer-events-none absolute -right-2 bottom-8 hidden rounded-xl border border-border/70 bg-[color-mix(in_oklab,var(--surface-card-elevated)_86%,transparent)] px-4 py-3 shadow-[0_22px_54px_-38px_rgba(15,23,42,0.74)] backdrop-blur md:block"
            style={{ ["--imx-depth" as string]: 54, ["--imx-tilt" as string]: 12, animationDelay: "1.6s" }}
          >
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              <ReceiptText className="h-3.5 w-3.5 text-primary" /> Rent / Lease
            </div>
            <div className="mt-1 text-sm font-semibold text-foreground">Monthly invoice workflow</div>
          </div>
        </div>
      </div>

      <div className="imx-cue pointer-events-none absolute inset-x-0 bottom-4 flex flex-col items-center gap-1 text-muted-foreground">
        <span className="text-[10px] font-bold uppercase tracking-[0.24em]">Scroll</span>
        <span>
          <ChevronDown className="h-4 w-4" />
        </span>
      </div>
    </section>
  );
}
