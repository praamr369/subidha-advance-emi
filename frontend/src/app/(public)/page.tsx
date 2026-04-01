import type { Metadata } from "next";
import Link from "next/link";

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
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <section className="overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/10 via-background to-emerald-50 p-8 shadow-sm sm:p-10">
        <div className="grid gap-8 lg:grid-cols-[1.3fr_0.7fr] lg:items-center">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              Subidha Furniture · Public Lucky Plan
            </div>
            <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
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
                className="inline-flex h-11 items-center rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:opacity-95"
              >
                Apply Now
              </Link>
              <Link
                href={ROUTES.public.products}
                className="inline-flex h-11 items-center rounded-xl border border-border bg-background px-5 text-sm font-medium text-foreground transition hover:bg-muted"
              >
                Browse Products
              </Link>
              <Link
                href={ROUTES.public.winnerHistory}
                className="inline-flex h-11 items-center rounded-xl border border-border bg-background px-5 text-sm font-medium text-foreground transition hover:bg-muted"
              >
                Winner History
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-background/90 p-6 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Start Here
            </div>
            <div className="mt-4 grid gap-3">
              {conversionLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-2xl border border-border bg-card p-4 transition hover:bg-muted/50"
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

      <section className="space-y-4">
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

      <section className="space-y-4">
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
            className="rounded-2xl border border-border bg-card p-6 shadow-sm"
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
