import {
  BadgeCheck,
  Box,
  CalendarDays,
  CreditCard,
  FileCheck,
  Gift,
  PackageCheck,
  Trophy,
} from "lucide-react";

import ScrollRevealSection from "@/components/public/ScrollRevealSection";
import { cn } from "@/lib/utils";

type JourneyStep = {
  icon: React.ElementType;
  step: number;
  title: string;
  description: string;
  note?: string;
};

const emiJourney: JourneyStep[] = [
  {
    icon: Box,
    step: 1,
    title: "Choose a product",
    description:
      "Visit the showroom or browse the online catalogue. Ask the branch about which product fits your monthly budget and family needs.",
  },
  {
    icon: FileCheck,
    step: 2,
    title: "Register as a customer",
    description:
      "The branch team creates your customer profile. KYC documents may be required before activation. Your details are securely stored inside the system.",
  },
  {
    icon: BadgeCheck,
    step: 3,
    title: "Join a batch and receive your Lucky ID",
    description:
      "You are enrolled in an active batch. The system assigns a Lucky ID (00–99) to your subscription. One customer can hold multiple Lucky IDs across different batches.",
    note: "Lucky ID assignment does not guarantee winning.",
  },
  {
    icon: CreditCard,
    step: 4,
    title: "Pay monthly EMI",
    description:
      "Pay your scheduled monthly EMI through approved channels (cash, UPI, bank transfer). Each payment generates an official receipt you can view in your customer portal.",
  },
  {
    icon: CalendarDays,
    step: 5,
    title: "Monthly draw takes place",
    description:
      "Every month, a draw is conducted under published rules. A commitment hash is published before the draw, and the reveal comes afterward — so results cannot be secretly changed.",
  },
  {
    icon: Trophy,
    step: 6,
    title: "Winner receives future EMI waiver",
    description:
      "If your Lucky ID wins, remaining future EMI obligations from that month onward may be waived per plan rules. Already-paid EMI is not reversed or refunded automatically.",
    note: "Winning is not guaranteed. Waiver applies to future EMI only.",
  },
  {
    icon: Gift,
    step: 7,
    title: "Delivery and handover",
    description:
      "Delivery depends on contract readiness, stock availability, and verification checks. A delivery/handover document is generated to confirm condition and completion.",
  },
  {
    icon: PackageCheck,
    step: 8,
    title: "Keep your documents",
    description:
      "Always keep your contract, payment receipts, delivery note, and any winner confirmation documents. These form your proof of the entire transaction history.",
  },
];

type EmiJourneyTimelineProps = {
  className?: string;
};

export default function EmiJourneyTimeline({ className }: EmiJourneyTimelineProps) {
  return (
    <section
      className={cn(
        "rounded-[2rem] border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] p-6 shadow-[0_24px_70px_-50px_rgba(15,23,42,0.62)]",
        className
      )}
    >
      <div className="mb-6 space-y-2">
        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          Step-by-step journey
        </div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          The Lucky Plan EMI journey
        </h2>
        <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
          From product selection to final delivery — here is how the full Lucky Plan cycle works.
        </p>
      </div>

      <ScrollRevealSection stagger>
        <ol className="relative space-y-0 border-l-2 border-dashed border-border/60 pl-6">
          {emiJourney.map((step, index) => (
            <li
              key={step.title}
              className={cn(
                "scroll-reveal-item relative pb-6",
                index === emiJourney.length - 1 && "pb-0"
              )}
            >
              <span
                className="absolute -left-[calc(1.5rem+1px)] flex h-6 w-6 items-center justify-center rounded-full border-2 border-border/60 bg-white shadow-[0_4px_10px_-4px_rgba(15,23,42,0.3)]"
                aria-hidden="true"
              >
                <step.icon className="h-3 w-3 text-primary" />
              </span>

              <div className="public-card-sm ml-2 p-4">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                    Step {step.step}
                  </span>
                </div>
                <h3 className="mt-1 text-sm font-semibold text-foreground">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{step.description}</p>
                {step.note ? (
                  <p className="mt-2 rounded-lg border border-amber-200/70 bg-amber-50/70 px-3 py-2 text-[11px] font-semibold text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
                    ⚠ {step.note}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </ScrollRevealSection>
    </section>
  );
}
