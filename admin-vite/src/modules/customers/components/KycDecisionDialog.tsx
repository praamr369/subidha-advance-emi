import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { ApiError } from "@/shared/api/api-error";
import { ServerErrorAlert } from "@/shared/forms/ServerErrorAlert";
import { KycBadge } from "./CustomerStatusBadge";
import { useKycDecision } from "../api/customer.mutations";
import type { CustomerAdmin, KycStatus } from "../api/customer.types";

type Props = {
  customer: CustomerAdmin | null;
  onClose: () => void;
};

type Step = "select" | "confirm";

const decisions: {
  value: KycStatus;
  label: string;
  needsReason: boolean;
  needsConfirm: boolean;
  warning?: string;
}[] = [
  { value: "APPROVED", label: "Approve", needsReason: false, needsConfirm: false },
  { value: "VERIFIED", label: "Verify", needsReason: false, needsConfirm: false },
  {
    value: "REJECTED",
    label: "Reject",
    needsReason: true,
    needsConfirm: true,
    warning:
      "Rejecting KYC will block this customer from active subscriptions until re-submitted and approved.",
  },
  {
    value: "PENDING",
    label: "Reset to Pending",
    needsReason: false,
    needsConfirm: true,
    warning:
      "Resetting KYC to Pending removes the current approval/rejection status. The customer may need to re-submit documents.",
  },
];

export function KycDecisionDialog({ customer, onClose }: Props) {
  const [selected, setSelected] = useState<KycStatus | "">("");
  const [reason, setReason] = useState("");
  const [step, setStep] = useState<Step>("select");
  const mutation = useKycDecision();

  if (!customer) return null;

  const decision = decisions.find((d) => d.value === selected);

  function handleClose() {
    setSelected("");
    setReason("");
    setStep("select");
    mutation.reset();
    onClose();
  }

  function handleNext() {
    if (!selected) return;
    if (decision?.needsConfirm) {
      setStep("confirm");
    } else {
      doSubmit();
    }
  }

  function doSubmit() {
    if (!selected || !customer) return;
    mutation.mutate(
      { id: customer.id, status: selected, reason: reason || undefined },
      {
        onSuccess: () => {
          setSelected("");
          setReason("");
          setStep("select");
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
            onClick={handleClose}
            className="text-stone-400 hover:text-stone-600"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mb-4 text-sm text-stone-500">
          Current status: <KycBadge status={customer.kyc_status} />
        </div>

        <ServerErrorAlert error={serverError} />

        {step === "select" && (
          <>
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
                    onChange={() => {
                      setSelected(d.value);
                      mutation.reset();
                    }}
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
                onClick={handleClose}
                className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                onClick={handleNext}
                disabled={
                  !selected ||
                  mutation.isPending ||
                  (decision?.needsReason && !reason.trim())
                }
                className="rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
              >
                {decision?.needsConfirm ? "Next" : mutation.isPending ? "Submitting..." : "Submit Decision"}
              </button>
            </div>
          </>
        )}

        {step === "confirm" && decision && (
          <>
            <div className="mb-4 flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
              <div className="text-sm text-amber-800">
                <p className="font-medium">
                  Are you sure you want to {decision.label.toLowerCase()} KYC for{" "}
                  {customer.name}?
                </p>
                {decision.warning && (
                  <p className="mt-1 text-amber-700">{decision.warning}</p>
                )}
                {reason && (
                  <p className="mt-2 text-stone-600">
                    <span className="font-medium">Reason:</span> {reason}
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setStep("select")}
                className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
              >
                Back
              </button>
              <button
                onClick={doSubmit}
                disabled={mutation.isPending}
                className={`rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
                  selected === "REJECTED"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-brand-700 hover:bg-brand-800"
                }`}
              >
                {mutation.isPending
                  ? "Submitting..."
                  : `Confirm ${decision.label}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
