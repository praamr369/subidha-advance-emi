"use client";

import { AlertTriangle, CheckCircle2, Info, Mail, ShieldAlert, Smartphone } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import CustomerAmendmentRecontractPanel from "@/components/customers/CustomerAmendmentRecontractPanel";
import {
  getOtpDeliveryReadiness,
  type OtpDeliveryReadinessResponse,
} from "@/domains/customers/api";

type OtpDeliveryReadinessCardProps = {
  operatorContext?: "create" | "detail" | "import";
  className?: string;
};

function statusTone(status: string): string {
  switch (status) {
    case "READY":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "DEV_ONLY":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "NOT_READY":
    case "INCOMPLETE":
    case "NOT_SUPPORTED":
      return "border-red-200 bg-red-50 text-red-900";
    case "API_ONLY":
      return "border-blue-200 bg-blue-50 text-blue-900";
    case "DISABLED":
      return "border-slate-200 bg-slate-100 text-slate-800";
    default:
      return "border-border bg-muted text-foreground";
  }
}

function statusLabel(status: string): string {
  return status
    .split("_")
    .map((part) => {
      if (part === "API") return part;
      return part[0] + part.slice(1).toLowerCase();
    })
    .join(" ");
}

function contextHint(
  data: OtpDeliveryReadinessResponse,
  operatorContext: "create" | "detail" | "import"
): string {
  if (operatorContext === "import") {
    if (data.overall_status === "READY") {
      return "Imported customers still need OTP reset after import. Use this readiness card to confirm the live delivery path before promising portal access.";
    }

    return "Imported customers should not be promised portal access until this card shows a live-ready delivery path.";
  }

  if (data.overall_status === "READY") {
    return "OTP handoff is configured, but ops should still verify one real customer-facing reset before promising access.";
  }

  if (data.overall_status === "DEV_ONLY") {
    return "Current OTP delivery is limited to debug or console-only behavior. Do not promise live customer access from this environment.";
  }

  return "Do not promise self-service password reset until email delivery is configured and verified.";
}

export default function OtpDeliveryReadinessCard({
  operatorContext = "detail",
  className = "",
}: OtpDeliveryReadinessCardProps) {
  const [readiness, setReadiness] = useState<OtpDeliveryReadinessResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadReadiness() {
      try {
        const next = await getOtpDeliveryReadiness();
        if (!active) return;
        setReadiness(next);
        setError(null);
      } catch {
        if (!active) return;
        setReadiness(null);
        setError(
          "Unable to verify current OTP delivery readiness. Use the ops checklist and confirm one live reset before promising customer access."
        );
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadReadiness();
    return () => {
      active = false;
    };
  }, []);

  const summary = useMemo(() => {
    if (!readiness) return null;
    return contextHint(readiness, operatorContext);
  }, [operatorContext, readiness]);

  return (
    <>
      <div className={`rounded-xl border border-border bg-card p-4 ${className}`.trim()}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <ShieldAlert className="h-4 w-4 text-blue-700" />
              OTP delivery readiness
            </div>
            <p className="text-sm text-muted-foreground">
              Check the live reset path before promising portal access or handing off CSV-imported customers.
            </p>
          </div>
          {readiness ? (
            <span
              className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${statusTone(readiness.overall_status)}`}
            >
              {statusLabel(readiness.overall_status)}
            </span>
          ) : null}
        </div>

        {loading ? (
          <div className="mt-4 rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
            Checking current backend OTP configuration...
          </div>
        ) : null}

        {!loading && error ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
            {error}
          </div>
        ) : null}

        {!loading && readiness ? (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 lg:grid-cols-3">
              <div className="rounded-lg border border-border bg-background p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Smartphone className="h-4 w-4 text-muted-foreground" />
                  SMS channel
                </div>
                <div className="mt-2">
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusTone(readiness.sms.status)}`}
                  >
                    {statusLabel(readiness.sms.status)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{readiness.sms.detail}</p>
              </div>

              <div className="rounded-lg border border-border bg-background p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  Email delivery
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusTone(readiness.email.status)}`}
                  >
                    {statusLabel(readiness.email.status)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Backend {readiness.email.backend}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{readiness.email.detail}</p>
              </div>

              <div className="rounded-lg border border-border bg-background p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Info className="h-4 w-4 text-muted-foreground" />
                  Admin visibility
                </div>
                <div className="mt-2">
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusTone(readiness.admin_visibility.status)}`}
                  >
                    {statusLabel(readiness.admin_visibility.status)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {readiness.admin_visibility.detail}
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-3 text-sm text-blue-900">
                <div className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4" />
                  Reset identifiers
                </div>
                <div className="mt-1 text-blue-800">
                  {readiness.public_reset_identifiers.join(", ")}
                </div>
              </div>
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-3 text-sm text-blue-900">
                <div className="flex items-center gap-2 font-medium">
                  <AlertTriangle className="h-4 w-4" />
                  Eligible roles
                </div>
                <div className="mt-1 text-blue-800">
                  {readiness.public_reset_roles.join(", ")}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
              <div className="font-medium">Operator guidance</div>
              <div className="mt-1">{summary}</div>
              <div className="mt-2 text-amber-800">{readiness.summary}</div>
            </div>
          </div>
        ) : null}
      </div>

      {operatorContext === "detail" ? <CustomerAmendmentRecontractPanel /> : null}
    </>
  );
}
