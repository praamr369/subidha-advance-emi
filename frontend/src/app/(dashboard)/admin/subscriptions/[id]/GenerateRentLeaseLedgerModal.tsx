"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/ui/modal";
import { generateRentLeaseLedger } from "@/services/subscriptions";
import { useRouter } from "next/navigation";

export function GenerateRentLeaseLedgerModal({
  subscriptionId,
  open,
  onOpenChange,
  currentStartDate,
}: {
  subscriptionId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Contract's current start date (yyyy-mm-dd), used to prefill the picker. */
  currentStartDate?: string | null;
}) {
  const [startDate, setStartDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    setError(null);
    setMessage(null);
    setStartDate((current) => current || (currentStartDate ?? "").slice(0, 10));
  }, [open, currentStartDate]);

  async function handleGenerate() {
    if (!startDate) {
      setError("Pick the date the rent should start from.");
      return;
    }
    try {
      setLoading(true);
      setError(null);
      await generateRentLeaseLedger(subscriptionId, startDate);
      setMessage("Rent schedule rebased to the new start date.");
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to rebuild the rent schedule."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title="Set rent start date"
      open={open}
      onClose={() => onOpenChange(false)}
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Sets the contract start date and rebuilds the monthly rent schedule from
          it, one demand per month for the full tenure. Uncollected rows are
          replaced so the ledger always matches the contract — no duplicate or
          stale schedule is left behind.
        </p>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Rows that already carry collected money are never re-dated. If rent has
          been collected against this schedule, rebasing is refused and you will
          be told how many rows are blocking it.
        </div>
        <div className="grid gap-2">
          <label htmlFor="start_date" className="text-sm font-medium">
            Rent start date
          </label>
          <input
            id="start_date"
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <p className="text-xs text-muted-foreground">
            The first month&apos;s rent falls due on this date, and each following
            month on the same day.
          </p>
        </div>

        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        {message ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {message}
          </div>
        ) : null}

        <div className="flex justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading || !startDate}
            className="inline-flex h-9 items-center justify-center rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-sky-800 disabled:opacity-50"
          >
            {loading ? "Rebuilding..." : "Rebuild schedule"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
