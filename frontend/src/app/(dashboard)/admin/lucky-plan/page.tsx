import Link from "next/link";

const LUCKY_PLAN_SECTIONS = [
  {
    href: "/admin/lucky-plan/batches",
    label: "Batches",
    description:
      "Batch lifecycle: slot pressure, draw timing, subscription attachment, and status register.",
    badge: null,
  },
  {
    href: "/admin/lucky-plan/lucky-ids",
    label: "Lucky IDs",
    description:
      "Lucky ID register: 00-99 allocation grid, batch linkage, and assignment status per subscriber.",
    badge: null,
  },
  {
    href: "/admin/lucky-plan/draws",
    label: "Lucky Draws",
    description:
      "Draw schedule and execution: commitment hash, reveal state, and winner Lucky ID audit evidence.",
    badge: null,
  },
  {
    href: "/admin/lucky-plan/winners",
    label: "Winners",
    description:
      "Winner register with EMI waiver status, delivery posture, and draw evidence for audit trail.",
    badge: null,
  },
  {
    href: "/admin/lucky-plan/analytics",
    label: "Analytics",
    description:
      "Draw performance metrics: total draws, verified winners, waiver totals, average waiver, and success rate.",
    badge: null,
  },
];

export default function LuckyPlanControlPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Lucky Plan Control</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Audit-first control room for all Lucky Plan operations. Batch lifecycle, Lucky ID
          allocation, draw execution, and winner waiver evidence are managed from this module.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">Module safety contract</h2>
        <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
          <li>Lucky draw commit/reveal/winner logic is unchanged by navigation.</li>
          <li>Winner receives future EMI waiver only; no past payment changes.</li>
          <li>No fake draw readiness or fake winner data is shown.</li>
          <li>Rent/lease operations are not owned by this module.</li>
          <li>Direct sale is not owned by this module.</li>
        </ul>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {LUCKY_PLAN_SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="group relative flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:border-ring hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground group-hover:text-primary">
                {section.label}
              </span>
              {section.badge ? (
                <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                  {section.badge}
                </span>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">{section.description}</p>
          </Link>
        ))}
      </div>

      <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5 dark:border-emerald-700 dark:bg-emerald-900/20">
        <h2 className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
          Production register
        </h2>
        <p className="mt-2 text-sm text-emerald-800 dark:text-emerald-300">
          The winners page is backed by the admin Lucky Draw winners endpoint and shows only
          revealed draw records with a linked winner subscription. Waiver status remains
          backend-owned, and past-paid EMI records are not changed from this page.
        </p>
      </div>
    </div>
  );
}
