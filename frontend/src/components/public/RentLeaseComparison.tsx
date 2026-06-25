import Link from "next/link";
import { Check, X } from "lucide-react";

import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

type ComparisonRow = {
  feature: string;
  rent: string | boolean;
  lease: string | boolean;
};

const rows: ComparisonRow[] = [
  { feature: "Lucky ID eligibility", rent: false, lease: false },
  { feature: "Monthly draw participation", rent: false, lease: false },
  { feature: "EMI waiver if lucky winner", rent: false, lease: false },
  { feature: "Security deposit required", rent: true, lease: true },
  { feature: "Deposit is refundable", rent: "Subject to inspection", lease: "Subject to inspection" },
  { feature: "Monthly demand (separate from deposit)", rent: true, lease: true },
  { feature: "Typical tenure", rent: "Flexible / short-term", lease: "6 – 12+ months" },
  { feature: "Upgrade / renewal", rent: "Contact branch", lease: "Requires admin approval" },
  { feature: "Ownership transfer at end", rent: false, lease: false },
  { feature: "Delivery / handover documented", rent: true, lease: true },
];

function Cell({ value }: { value: string | boolean }) {
  if (value === true) return <Check className="mx-auto h-4 w-4 text-emerald-600" aria-label="Yes" />;
  if (value === false) return <X className="mx-auto h-4 w-4 text-muted-foreground/70" aria-label="No" />;
  return <span className="text-xs text-muted-foreground">{value}</span>;
}

type RentLeaseComparisonProps = {
  className?: string;
};

export default function RentLeaseComparison({ className }: RentLeaseComparisonProps) {
  return (
    <section
      className={cn(
        "rounded-[2rem] border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] p-6 shadow-[0_24px_70px_-50px_rgba(15,23,42,0.62)]",
        className
      )}
    >
      <div className="mb-5 space-y-2">
        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          Plan comparison
        </div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          Rent vs. Lease — key differences
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          Neither rent nor lease includes Lucky ID, monthly draw, or EMI waiver benefits. These are
          separate usage-access contracts. Deposit and monthly demand are always separate line items.
        </p>
      </div>

      <div className="overflow-x-auto rounded-[1.5rem] border border-white/80">
        <table className="min-w-full text-sm" aria-label="Rent vs Lease comparison">
          <thead>
            <tr className="border-b border-white/70 bg-white/90">
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Feature
              </th>
              <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Rent
              </th>
              <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Lease
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/60 bg-white/78">
            {rows.map((row) => (
              <tr key={row.feature} className="transition hover:bg-white/90">
                <td className="px-4 py-3 font-medium text-foreground">{row.feature}</td>
                <td className="px-4 py-3 text-center">
                  <Cell value={row.rent} />
                </td>
                <td className="px-4 py-3 text-center">
                  <Cell value={row.lease} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <Link href={ROUTES.public.rent} className="public-action-secondary text-sm">
          Rent details
        </Link>
        <Link href={ROUTES.public.lease} className="public-action-secondary text-sm">
          Lease details
        </Link>
        <Link href={ROUTES.public.contact} className="public-action-primary text-sm">
          Contact branch
        </Link>
      </div>

      <p className="mt-4 text-[11px] leading-5 text-muted-foreground">
        Final terms, deposit amounts, and conditions are governed by the approved contract and branch
        policy, not by this comparison table.
      </p>
    </section>
  );
}
