import { useState } from "react";
import { X } from "lucide-react";
import { ApiError } from "@/shared/api/api-error";
import { ServerErrorAlert } from "@/shared/forms/ServerErrorAlert";
import { KycBadge } from "./CustomerStatusBadge";
import { useKycDecision } from "../api/customer.mutations";
import type { CustomerAdmin, KycStatus } from "../api/customer.types";

type Props = {
  customer: CustomerAdmin | null;
  onClose: () => void;
};

const decisions: { value: KycStatus; label: string; needsReason: boolean }[] = [
  { value: "APPROVED", label: "Approve", needsReason: false },
  { value: "VERIFIED", label: "Verify", needsReason: false },
  { value: "REJECTED", label: "Reject", needsReason: true },
  { value: "PENDING", label: "Reset to Pending", needsReason: false },
];

export function KycDecisionDialog({ customer, onClose }: Props) {
  const [selected, setSelected] = useState<KycStatus | "">("");
  const [reason, setReason] = useState("");
  const mutation = useKycDecision();

  if (!customer) return null;

  const decision = decisions.find((d) => d.value === selected);

  function handleSubmit() {
    if (!selected || !customer) return;
    mutation.mutate(
      { id: customer.id, status: selected, reason: reason || undefined },
      {
        onSuccess: () => {
          setSelected("");
          setReason("");
          onClose();
        },
      },
    );
  }

  const serverError =
    mutation.error instanceof ApiError
      ? (mutation.error.body as Record<string, unknown> | undefined)?.detail as
          string | undefined ?? "KYC decision failed"
      : mutation.error
        ? "An unexpected error occurred"
        : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-stone-800">
            KYC Decision — {customer.name}
          </h2>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mb-4 text-sm text-stone-500">
          Current status: <KycBadge status={customer.kyc_status} />
        </div>

        <ServerErrorAlert error={serverError} />

        <div className="mb-4 space-y-2">
          {decisions.map((d) => (
            <label
              key={d.value}
              className={`flex cursor-pointer items-center gap-3 rounded-md border px-4 py-3 text-sm transition-colors ${
                selected === d.value
                  ? "border-brand-500 bg-brand-50"
                  : "border-stone-200 hover:bg-stone-50"
              }`}
            >
              <input
                type="radio"
                name="kyc-decision"
                value={d.value}
                checked={selected === d.value}
                onChange={() => setSelected(d.value)}
                className="accent-brand-700"
              />
              {d.label}
            </label>
          ))}
        </div>

        {decision?.needsReason && (
          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-stone-700">
              Reason *
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={
              !selected ||
              mutation.isPending ||
              (decision?.needsReason && !reason.trim())
            }
            className="rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
          >
            {mutation.isPending ? "Submitting..." : "Submit Decision"}
          </button>
        </div>
      </div>
    </div>
  );
}
