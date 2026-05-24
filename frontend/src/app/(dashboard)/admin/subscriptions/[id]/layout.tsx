"use client";

import Link from "next/link";
import { useParams, useSelectedLayoutSegment } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { apiFetch } from "@/lib/api";
import {
  buildAdminRentLeaseContractPrintRoute,
  buildAdminSubscriptionContractPrintRoute,
} from "@/lib/route-builders";

type SubscriptionDocumentContext = {
  plan_type?: string | null;
  rent_profile?: unknown;
  lease_profile?: unknown;
};

function isRentLeaseDocumentEligible(payload: SubscriptionDocumentContext | null): boolean {
  const planType = String(payload?.plan_type || "").toUpperCase();
  if (planType === "RENT") return Boolean(payload?.rent_profile);
  if (planType === "LEASE") return Boolean(payload?.lease_profile);
  return false;
}

export default function AdminSubscriptionDetailLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ id: string }>();
  const selectedSegment = useSelectedLayoutSegment();
  const subscriptionId = params?.id;
  const [rentLeasePrintEligible, setRentLeasePrintEligible] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadDocumentContext() {
      if (selectedSegment !== null || !subscriptionId) {
        setRentLeasePrintEligible(false);
        return;
      }

      try {
        const payload = await apiFetch<SubscriptionDocumentContext>(
          `/admin/subscriptions/${subscriptionId}/`,
          { cache: "no-store" }
        );
        if (mounted) setRentLeasePrintEligible(isRentLeaseDocumentEligible(payload));
      } catch {
        if (mounted) setRentLeasePrintEligible(false);
      }
    }

    void loadDocumentContext();

    return () => {
      mounted = false;
    };
  }, [selectedSegment, subscriptionId]);

  if (selectedSegment !== null || !subscriptionId) {
    return <>{children}</>;
  }

  return (
    <>
      <div data-document-link-strip className="mx-auto w-full max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm shadow-sm">
          <div>
            <div className="font-semibold text-amber-950">Subscription document output</div>
            <div className="text-xs text-amber-800">
              Generate read-only customer-facing contract documents from existing subscription payloads.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={buildAdminSubscriptionContractPrintRoute(subscriptionId)}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-950 transition hover:bg-amber-100"
            >
              Contract PDF / Print
            </Link>
            {rentLeasePrintEligible ? (
              <Link
                href={buildAdminRentLeaseContractPrintRoute(subscriptionId)}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-950 transition hover:bg-amber-100"
              >
                Rent / Lease Contract PDF / Print
              </Link>
            ) : null}
          </div>
        </div>
      </div>
      {children}
    </>
  );
}
