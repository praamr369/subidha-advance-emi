import type { PublicWinner } from "@/lib/public-api";

type WinnerPublicationCardProps = {
  winner: PublicWinner;
};

function formatWinnerDate(winner: PublicWinner): string {
  return winner.draw_datetime || winner.draw_date || "—";
}

function verificationLabel(value?: string | null): string {
  if (!value) return "Unavailable";
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

export default function WinnerPublicationCard({ winner }: WinnerPublicationCardProps) {
  const hash = winner.public_commit_hash || winner.committed_hash || "—";

  return (
    <article className="public-card public-card-animated p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Batch {winner.batch_code || winner.batch} · Month {winner.draw_month || winner.month}
          </div>
          <h3 className="mt-3 text-xl font-semibold text-foreground">Lucky ID {winner.lucky_id || "—"}</h3>
        </div>
        <span className="rounded-full border border-border/70 bg-[color-mix(in_oklab,var(--surface-card-elevated)_82%,transparent)] px-3 py-1 text-xs font-semibold text-muted-foreground">
          {verificationLabel(winner.verification_status)}
        </span>
      </div>

      <div className="mt-4 grid gap-3 text-sm leading-6 text-muted-foreground">
        <div className="rounded-xl border border-border/70 bg-[color-mix(in_oklab,var(--surface-card-elevated)_78%,transparent)] px-3 py-2">
          <span className="font-semibold text-foreground">Public display label:</span> {winner.winner_name_masked || "Not published"}
        </div>
        <div className="rounded-xl border border-border/70 bg-[color-mix(in_oklab,var(--surface-card-elevated)_78%,transparent)] px-3 py-2">
          <span className="font-semibold text-foreground">Draw:</span> {formatWinnerDate(winner)}
        </div>
        <div className="rounded-xl border border-border/70 bg-[color-mix(in_oklab,var(--surface-card-elevated)_78%,transparent)] px-3 py-2">
          <span className="font-semibold text-foreground">Product:</span> {winner.product_name || "—"}
        </div>
        <div className="break-all rounded-xl border border-border/70 bg-[color-mix(in_oklab,var(--surface-card-elevated)_78%,transparent)] px-3 py-2 text-xs">
          <span className="font-semibold text-foreground">Public commit hash:</span> {hash}
        </div>
      </div>

      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        Public winner rows are informational and privacy-safe. Future EMI waiver is controlled by authenticated business workflow only.
      </p>
    </article>
  );
}
