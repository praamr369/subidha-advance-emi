"use client";

import { useEffect, useState } from "react";

import PdfDownloadPanel from "@/components/reports/pdf-download-panel";
import PortalPage from "@/components/ui/portal-page";
import { fetchReportRows, type ReportRow } from "@/services/report.service";

const fallbackCollectionRows: ReportRow[] = [
  { label: "Total Collected", value: "INR 8,45,000" },
  { label: "Overdue", value: "INR 76,000" },
];
const fallbackWaiverRows: ReportRow[] = [
  { label: "Total Waived", value: "INR 1,10,000" },
  { label: "Winner Count", value: "9" },
];
const fallbackPayoutRows: ReportRow[] = [
  { label: "Payable", value: "INR 52,000" },
  { label: "Settled", value: "INR 44,000" },
];

export default function AdminReportsPage() {
  const [collectionRows, setCollectionRows] = useState<ReportRow[]>(fallbackCollectionRows);
  const [waiverRows, setWaiverRows] = useState<ReportRow[]>(fallbackWaiverRows);
  const [payoutRows, setPayoutRows] = useState<ReportRow[]>(fallbackPayoutRows);

  useEffect(() => {
    fetchReportRows("/reports/admin/collection-ledger/", fallbackCollectionRows).then(setCollectionRows);
    fetchReportRows("/reports/admin/waiver-ledger/", fallbackWaiverRows).then(setWaiverRows);
    fetchReportRows("/reports/admin/partner-payout-ledger/", fallbackPayoutRows).then(setPayoutRows);
  }, []);

  return (
    <PortalPage title="Financial Reports" subtitle="Track total collected, waived, outstanding, exposure and commission liabilities.">
      <PdfDownloadPanel
        heading="One-Click Ledger PDFs"
        reports={[
          {
            buttonLabel: "Download Collection Ledger PDF",
            fileName: "admin-collection-ledger.pdf",
            title: "Collection Ledger",
            sections: [{ heading: "Collections", rows: collectionRows }],
          },
          {
            buttonLabel: "Download Waiver Ledger PDF",
            fileName: "admin-waiver-ledger.pdf",
            title: "Waiver Ledger",
            sections: [{ heading: "Waiver Summary", rows: waiverRows }],
          },
          {
            buttonLabel: "Download Partner Payout Ledger PDF",
            fileName: "admin-partner-payout-ledger.pdf",
            title: "Partner Payout Ledger",
            sections: [{ heading: "Partner Settlement", rows: payoutRows }],
          },
        ]}
      />
    </PortalPage>
  );
}
