"use client";

import { useEffect, useState } from "react";

import PdfDownloadPanel from "@/components/reports/pdf-download-panel";
import PortalPage from "@/components/ui/portal-page";
import { fetchReportRows, type ReportRow } from "@/services/report.service";

const fallbackRows: ReportRow[] = [
  { label: "Total Earned", value: "INR 12000" },
  { label: "Paid", value: "INR 8000" },
  { label: "Unpaid", value: "INR 4000" },
];

export default function PartnerCommissionsPage() {
  const [rows, setRows] = useState<ReportRow[]>(fallbackRows);

  useEffect(() => {
    fetchReportRows("/reports/partner/commission-ledger/", fallbackRows).then(setRows);
  }, []);

  return (
    <PortalPage title="Commission Ledger" subtitle="Track paid/unpaid commission amounts generated from eligible collections.">
      <PdfDownloadPanel
        heading="Commission & Ledger Exports"
        reports={[
          {
            buttonLabel: "Download Commission Ledger PDF",
            fileName: "partner-commission-ledger.pdf",
            title: "Partner Commission Ledger",
            sections: [{ heading: "Commission Summary", rows }],
          },
        ]}
      />
    </PortalPage>
  );
}
