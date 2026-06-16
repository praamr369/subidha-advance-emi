import Link from "next/link";

export default function LuckyPlanWinnersPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Winners</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Lucky Plan winner visibility and EMI waiver audit trail.
        </p>
      </div>

      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 dark:border-amber-700 dark:bg-amber-900/20">
        <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
          Gap — no dedicated winners endpoint
        </h2>
        <p className="mt-2 text-sm text-amber-800 dark:text-amber-300">
          A standalone winners register requires a dedicated backend endpoint that aggregates
          winner records with EMI waiver status across all batches. That endpoint does not
          exist yet. No fake winner data is shown here.
        </p>
        <p className="mt-2 text-sm text-amber-800 dark:text-amber-300">
          Winner information is currently accessible through individual Lucky Draw detail
          pages. Each revealed draw record shows the winning Lucky ID, the winner subscriber,
          and the linked subscription number.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">Where to find winner data now</h2>
        <div className="mt-4 space-y-3">
          <div className="flex flex-col gap-1">
            <Link
              href="/admin/lucky-draws"
              className="text-sm font-medium text-primary underline hover:no-underline"
            >
              Lucky Draw Register → /admin/lucky-draws
            </Link>
            <p className="text-sm text-muted-foreground">
              Lists all draw records. Revealed draws show the winner Lucky ID and linked
              subscriber. Filter by batch or reveal state to narrow to winners.
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <Link
              href="/admin/batches"
              className="text-sm font-medium text-primary underline hover:no-underline"
            >
              Batch Register → /admin/batches
            </Link>
            <p className="text-sm text-muted-foreground">
              Each batch detail page shows the batch winner count. Open a specific batch to
              see which Lucky IDs were drawn and which subscription holds a waiver.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">Winner waiver rule</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          When a Lucky Draw is revealed and a winner Lucky ID is confirmed, the linked
          subscriber receives a waiver on{" "}
          <span className="font-medium text-foreground">future EMI instalments only</span>.
          Past-paid EMIs are not reversed. The waiver is evidence-backed and audit-logged
          against the draw record. This rule cannot be changed from this page.
        </p>
      </div>

      <div className="flex gap-3">
        <Link
          href="/admin/lucky-draws"
          className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95"
        >
          Open Lucky Draws
        </Link>
        <Link
          href="/admin/lucky-plan"
          className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
        >
          Back to Lucky Plan Control
        </Link>
      </div>
    </div>
  );
}
