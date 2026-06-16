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
      "Lucky ID register: 00–99 allocation grid, batch linkage, and assignment status per subscriber.",
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
      "Winner visibility and EMI waiver status. Links to draw evidence for audit trail. See gap note below.",
    badge: "Gap",
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
          <li>• Lucky draw commit/reveal/winner logic is unchanged by navigation.</li>
          <li>• Winner receives future EMI waiver only — no past payment changes.</li>
          <li>• No fake draw readiness or fake winner data is shown.</li>
          <li>• Rent/lease operations are not owned by this module.</li>
          <li>• Direct sale is not owned by this module.</li>
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

      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 dark:border-amber-700 dark:bg-amber-900/20">
        <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
          Gap — dedicated winners route
        </h2>
        <p className="mt-2 text-sm text-amber-800 dark:text-amber-300">
          There is no dedicated <code>/admin/lucky-plan/winners</code> backend endpoint yet.
          Winner visibility is currently available through the Lucky Draw detail pages at{" "}
          <Link href="/admin/lucky-draws" className="underline hover:no-underline">
            /admin/lucky-draws
          </Link>
          . A standalone winners register (showing all draw winners, EMI waiver status, and
          audit evidence across batches) is deferred to a future release that adds a backend
          winners aggregate endpoint. No fake winner data is shown in the interim.
        </p>
      </div>
    </div>
  );
}
