import type { Metadata } from "next";
import Link from "next/link";

import BrandLockup from "@/components/public/BrandLockup";
import PublicLatestWinnerWidget from "@/components/public/PublicLatestWinnerWidget";
import PublicStatsWidget from "@/components/public/PublicStatsWidget";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Lucky Plan EMI",
  description:
    "Browse products, review published winner transparency, and submit a real Lucky Plan application with Subidha Furniture.",
};

const trustPoints = [
  {
    title: "Real product browsing",
    description:
      "Browse the live public catalog before you enquire, so the branch already knows which product or price range you are considering.",
  },
  {
    title: "Published winner signals",
    description:
      "Latest winner and winner history are sourced from revealed lucky draw records, not demo marketing rows.",
  },
  {
    title: "Clear next steps",
    description:
      "You can move directly into Apply, Register, or Login without hitting dead-end public CTAs.",
  },
];

const conversionLinks = [
  {
    href: ROUTES.public.products,
    title: "Browse products",
    description: "View the live furniture catalog before you apply.",
  },
  {
    href: ROUTES.public.apply,
    title: "Apply now",
    description: "Send a real enquiry with your preferred product and EMI comfort.",
  },
  {
    href: ROUTES.public.login,
    title: "Customer login",
    description: "Check your customer account, payments, and support route.",
  },
  {
    href: ROUTES.public.register,
    title: "Register account",
    description: "Create an account before or after your branch onboarding.",
  },
];

export default function PublicHome() {
  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <section className="relative overflow-hidden rounded-[2.25rem] border border-white/75 bg-[radial-gradient(circle_at_top_right,rgba(125,211,252,0.18),transparent_28%),radial-gradient(circle_at_top_left,rgba(251,191,36,0.14),transparent_24%),linear-gradient(140deg,rgba(255,255,255,0.98),rgba(248,250,252,0.92))] p-8 shadow-[0_32px_90px_-52px_rgba(15,23,42,0.68)] sm:p-10">
        <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-slate-300/80 to-transparent" />
        <div className="pointer-events-none absolute -right-20 top-0 h-48 w-48 rounded-full bg-sky-200/30 blur-3xl" />
        <div className="pointer-events-none absolute left-0 top-24 h-40 w-40 rounded-full bg-amber-200/25 blur-3xl" />
        <div className="grid gap-8 lg:grid-cols-[1.3fr_0.7fr] lg:items-center">
          <div>
            <BrandLockup subtitle="Public Lucky Plan catalogue, enquiry, and winner transparency" />
            <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-[3.4rem]">
              Browse products, verify published winners, and move into a real
              Lucky Plan enquiry.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
              The public site is built for trust-first retail conversion: live
              products, live public winner signals, practical plan information,
              and a real application path into branch follow-up.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={ROUTES.public.apply}
                className="inline-flex h-11 items-center rounded-xl border border-slate-900/10 bg-slate-900 px-5 text-sm font-medium text-white shadow-[0_18px_40px_-28px_rgba(15,23,42,0.82)] transition hover:-translate-y-0.5"
              >
                Apply Now
              </Link>
              <Link
                href={ROUTES.public.products}
                className="inline-flex h-11 items-center rounded-xl border border-white/75 bg-white/75 px-5 text-sm font-medium text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] transition hover:-translate-y-0.5 hover:bg-white"
              >
                Browse Products
              </Link>
              <Link
                href={ROUTES.public.winnerHistory}
                className="inline-flex h-11 items-center rounded-xl border border-white/75 bg-white/75 px-5 text-sm font-medium text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] transition hover:-translate-y-0.5 hover:bg-white"
              >
                Winner History
              </Link>
            </div>
          </div>

          <div className="rounded-[1.9rem] border border-white/75 bg-white/72 p-6 shadow-[0_26px_60px_-44px_rgba(15,23,42,0.64)] backdrop-blur">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Start Here
            </div>
            <div className="mt-4 grid gap-3">
              {conversionLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-[1.4rem] border border-white/75 bg-white/75 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] transition hover:-translate-y-0.5 hover:bg-white"
                >
                  <div className="font-medium text-foreground">{item.title}</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {item.description}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-[2rem] border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] p-6 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.6)]">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            Live public business signals
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            These trust indicators come from the live public API and are updated
            from the actual production data model.
          </p>
        </div>
        <PublicStatsWidget />
      </section>

      <section className="space-y-4 rounded-[2rem] border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] p-6 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.6)]">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            Latest winner
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Published only from revealed lucky draw records. If no draw has been
            published yet, the public site shows that directly instead of
            inventing a winner row.
          </p>
        </div>
        <PublicLatestWinnerWidget />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {trustPoints.map((item) => (
          <div
            key={item.title}
            className="rounded-[1.8rem] border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] p-6 shadow-[0_24px_60px_-44px_rgba(15,23,42,0.62)]"
          >
            <h2 className="text-lg font-semibold text-foreground">{item.title}</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {item.description}
            </p>
          </div>
        ))}
      </section>
    </main>
  );
}
