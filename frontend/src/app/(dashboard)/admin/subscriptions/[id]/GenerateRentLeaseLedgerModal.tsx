"use client";

import { useState } from "react";
import Modal from "@/components/ui/modal";
import { generateRentLeaseLedger } from "@/services/subscriptions";
import { useRouter } from "next/navigation";

export function GenerateRentLeaseLedgerModal({
  subscriptionId,
  open,
  onOpenChange,
}: {
  subscriptionId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [startDate, setStartDate] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleGenerate() {
    if (!startDate) {
      alert("Start Date is required");
      return;
    }
    try {
      setLoading(true);
      await generateRentLeaseLedger(subscriptionId, startDate);
      alert("Rent/Lease ledger generated.");
      onOpenChange(false);
      router.refresh();
    } catch (err: any) {
      alert(err.message || "Failed to generate schedule");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Generate Rent/Lease Ledger" open={open} onClose={() => onOpenChange(false)}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          This will update the contract start date and generate the full rent/lease ledger upfront for the remaining tenure.
        </p>
        <div className="grid gap-2">
          <label htmlFor="start_date" className="text-sm font-medium">
            Start Date
          </label>
          <input
            id="start_date"
            type="date"
            value={startDate}
            onChange={(e: any) => setStartDate(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
        <div className="flex justify-end gap-3 pt-4">
          <button
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={loading || !startDate}
            className="inline-flex h-9 items-center justify-center rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-sky-800 disabled:opacity-50"
          >
            {loading ? "Generating..." : "Generate Schedule"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
