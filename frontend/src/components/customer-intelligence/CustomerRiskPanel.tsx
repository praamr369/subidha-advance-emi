"use client";

import { useCallback, useEffect, useState } from "react";

import {
  fetchCustomerRiskProfile,
  type CustomerRiskProfile,
} from "@/services/customer-intelligence";
import { CustomerRiskBadge } from "./CustomerRiskBadge";

type Props = {
  customerId: number;
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

export function CustomerRiskPanel({ customerId }: Props) {
  const [profile, setProfile] = useState<CustomerRiskProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCustomerRiskProfile(customerId);
      setProfile(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load risk profile.");
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div
        className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground"
        data-testid="customer-risk-panel-loading"
      >
        Loading risk profile...
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        data-testid="customer-risk-panel-error"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>Risk profile unavailable: {error}</span>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-50"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div
        className="rounded-xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground"
        data-testid="customer-risk-panel-empty"
      >
        No risk profile available for this customer.
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl border border-border bg-background p-5"
      data-testid="customer-risk-panel"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Customer Risk Profile
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <CustomerRiskBadge band={profile.risk_band} score={profile.risk_score} />
            {!profile.is_persisted && (
              <span className="text-xs text-muted-foreground">(default — not yet calculated)</span>
            )}
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div>Score: <span className="font-semibold text-foreground">{profile.risk_score}</span></div>
          <div className="mt-1">Last calculated: {formatDateTime(profile.last_calculated_at)}</div>
        </div>
      </div>

      {profile.reason_codes.length > 0 && (
        <div className="mt-4" data-testid="customer-risk-reason-codes">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Reason codes
          </div>
          <div className="flex flex-wrap gap-2">
            {profile.reason_codes.map((code) => (
              <span
                key={code}
                className="inline-flex rounded border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground"
              >
                {code}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 rounded-xl border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        Read-only view. Risk recalculation is a backend-only admin action and is not available from this panel.
      </div>
    </div>
  );
}
