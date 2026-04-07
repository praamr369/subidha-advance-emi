import type { Metadata } from "next";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";
import {
  getPublicWinnerHistory,
  type PublicWinner,
} from "@/services/public";

export const metadata: Metadata = {
  title: "Winner History",
  description:
    "Read the public winner history sourced from real revealed lucky draw events.",
};

function formatDrawDate(value: string | null | undefined): string {
  if (!value) return "—";

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;

  return new Date(parsed).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function WinnerHistoryRow({ winner }: { winner: PublicWinner }) {
  return (
    <tr className="align-top">
      <td className="border-b border-border px-4 py-3 text-sm text-foreground">
        {winner.batch_code}
      </td>
      <td className="border-b border-border px-4 py-3 text-sm text-foreground">
        Month {winner.draw_month}
      </td>
      <td className="border-b border-border px-4 py-3 text-sm text-foreground">
        {winner.lucky_id || "—"}
      </td>
      <td className="border-b border-border px-4 py-3 text-sm text-foreground">
        {winner.customer_name || "Published"}
      </td>
      <td className="border-b border-border px-4 py-3 text-sm text-foreground">
        {winner.product_name || "—"}
      </td>
      <td className="border-b border-border px-4 py-3 text-sm text-muted-foreground">
        {winner.waived_emi_count ?? 0}
      </td>
      <td className="border-b border-border px-4 py-3 text-sm text-muted-foreground">
        {winner.waived_amount ? `₹${winner.waived_amount}` : "—"}
      </td>
      <td className="border-b border-border px-4 py-3 text-sm text-muted-foreground">
        {formatDrawDate(winner.draw_date)}
      </td>
    </tr>
  );
}

export default async function WinnerHistoryPage() {
  let winners: PublicWinner[] = [];
  let error: string | null = null;

  try {
    const payload = await getPublicWinnerHistory(50);
    winners = payload.results;
  } catch (err) {
    error =
      err instanceof Error ? err.message : "Unable to load winner history right now.";
  }

  return (
    <PortalPage
      title="Winner History"
      subtitle="Read-only publication of real lucky draw outcomes from the production system."
      breadcrumbs={[
        { label: "Home", href: ROUTES.public.home },
        { label: "Winner History" },
      ]}
      actions={[
        { href: ROUTES.public.winners, label: "Latest Winners", variant: "secondary" },
        { href: ROUTES.public.apply, label: "Apply", variant: "primary" },
      ]}
    >
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <p className="text-sm leading-6 text-muted-foreground">
          Winner history is now sourced from immutable revealed draw events
          instead of static demonstration rows.
        </p>

        <div className="mt-5">
          {error ? (
            <ErrorState
              title="Winner history unavailable"
              description={error}
            />
          ) : winners.length === 0 ? (
            <EmptyState
              title="No winner history published yet"
              description="Winner history will appear here once revealed lucky draw records exist."
            />
          ) : (
            <div className="overflow-x-auto">
              <table
                aria-label="Winner history records"
                className="min-w-full border-separate border-spacing-0"
              >
                <thead>
                  <tr className="text-left">
                    <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Batch
                    </th>
                    <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Draw Month
                    </th>
                    <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Lucky ID
                    </th>
                    <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Winner
                    </th>
                    <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Product
                    </th>
                    <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Waived EMI Count
                    </th>
                    <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Waived Amount
                    </th>
                    <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Published At
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {winners.map((winner) => (
                    <WinnerHistoryRow key={winner.id} winner={winner} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </PortalPage>
  );
}
