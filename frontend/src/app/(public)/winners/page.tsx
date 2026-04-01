import type { Metadata } from "next";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import PublicLatestWinnerWidget from "@/components/public/PublicLatestWinnerWidget";
import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";
import {
  getPublicWinnerHistory,
  type PublicWinner,
} from "@/services/public";

export const metadata: Metadata = {
  title: "Winners",
  description:
    "Review the latest published winner and recent public lucky draw outcomes sourced from the live backend.",
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

function WinnerRow({ winner }: { winner: PublicWinner }) {
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
        {winner.committed_hash || "—"}
      </td>
      <td className="border-b border-border px-4 py-3 text-sm text-muted-foreground">
        {formatDrawDate(winner.draw_date)}
      </td>
    </tr>
  );
}

export default async function WinnersPage() {
  let winners: PublicWinner[] = [];
  let error: string | null = null;

  try {
    const payload = await getPublicWinnerHistory(12);
    winners = payload.results;
  } catch (err) {
    error =
      err instanceof Error ? err.message : "Unable to load public winner history.";
  }

  return (
    <PortalPage
      title="Winner Transparency"
      subtitle="Published winner information sourced from real revealed draw records."
      breadcrumbs={[
        { label: "Home", href: ROUTES.public.home },
        { label: "Winners" },
      ]}
      actions={[
        {
          href: ROUTES.public.winnerHistory,
          label: "Full Winner History",
          variant: "secondary",
        },
        { href: ROUTES.public.apply, label: "Apply", variant: "primary" },
      ]}
    >
      <PublicLatestWinnerWidget />

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-foreground">Recent published winners</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          This feed is sourced from revealed draw records. If the public winner
          service is unavailable, the page shows an error state instead of static
          demo rows.
        </p>

        <div className="mt-5">
          {error ? (
            <ErrorState
              title="Winner feed unavailable"
              description={error}
            />
          ) : winners.length === 0 ? (
            <EmptyState
              title="No winners published yet"
              description="Recent public winner rows will appear here after revealed draw records are available."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0">
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
                      Commitment Hash
                    </th>
                    <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Published At
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {winners.map((winner) => (
                    <WinnerRow key={winner.id} winner={winner} />
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
