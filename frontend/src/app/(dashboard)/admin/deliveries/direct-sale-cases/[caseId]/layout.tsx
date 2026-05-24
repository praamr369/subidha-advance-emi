"use client";

import Link from "next/link";
import { useParams, useSelectedLayoutSegment } from "next/navigation";
import type { ReactNode } from "react";

import { buildAdminDirectSaleDeliveryChallanPrintRoute } from "@/lib/route-builders";

export default function DirectSaleDeliveryCaseLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ caseId: string }>();
  const selectedSegment = useSelectedLayoutSegment();
  const caseId = params?.caseId;

  if (selectedSegment === "print") {
    return <>{children}</>;
  }

  return (
    <>
      {caseId ? (
        <div data-document-link-strip className="print:hidden border-b border-border bg-background/95 px-4 py-3">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-foreground">Delivery documents</div>
              <div className="text-xs text-muted-foreground">
                Print the delivery challan without changing schedule, dispatch, stock, or payment state.
              </div>
            </div>
            <Link
              href={buildAdminDirectSaleDeliveryChallanPrintRoute(caseId)}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-amber-900 px-4 text-sm font-semibold text-white transition hover:bg-amber-950"
            >
              Delivery Challan / Print
            </Link>
          </div>
        </div>
      ) : null}
      {children}
    </>
  );
}
