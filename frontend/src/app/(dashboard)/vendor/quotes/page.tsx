"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { accountingErrorMessage } from "@/components/accounting/shared";
import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";
import { listVendorQuotes } from "@/services/vendor-ops";

export default function VendorQuotesPage() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void listVendorQuotes()
      .then((payload) => {
        const parsed = payload as { results?: Record<string, unknown>[] };
        setRows(parsed.results ?? []);
      })
      .catch((err) => setError(accountingErrorMessage(err, "Could not fetch quote invitations.")))
      .finally(() => setLoading(false));
  }, []);

  return (
    <PortalPage title="Quote requests" subtitle="RFQs where your vendor was invited." breadcrumbs={[{ label: "Vendor", href: ROUTES.vendor.dashboard }, { label: "Quotes" }]}>
      {error ? <div className="mb-3 rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}

      {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : null}

      {!loading && rows.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          No invitations right now.{" "}
          <Link href={ROUTES.vendor.products} className="underline text-primary">
            Maintain your catalog
          </Link>{" "}
          so admins can qualify you faster.
        </div>
      ) : null}

      <div className="space-y-2 text-sm">
        {rows.map((row) => (
          <div key={String(row.id)} className="rounded border p-3">
            <Link className="font-medium text-primary underline" href={`/vendor/quotes/${row.id}`}>
              {String(row.request_no || row.id)}
            </Link>
            <div className="text-muted-foreground">{String(row.status)} · product {String(row.product_name || "—")}</div>
          </div>
        ))}
      </div>
    </PortalPage>
  );
}
