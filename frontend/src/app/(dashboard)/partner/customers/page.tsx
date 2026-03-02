"use client";

import { useEffect, useState } from "react";

import PdfDownloadPanel from "@/components/reports/pdf-download-panel";
import PortalPage from "@/components/ui/portal-page";
import { fetchReportRows, type ReportRow } from "@/services/report.service";

const fallbackRows: ReportRow[] = [
  { label: "Partner Name", value: "Demo Partner" },
  { label: "Partner Code", value: "PT-010" },
  { label: "Commission Rate", value: "5%" },
  { label: "Status", value: "ACTIVE" },
];

export default function PartnerCustomersPage() {
  const [rows, setRows] = useState<ReportRow[]>(fallbackRows);

  useEffect(() => {
    fetchReportRows("/reports/partner/registration/", fallbackRows).then(setRows);
  }, []);

  return (
    <PortalPage title="Referred Customers" subtitle="Register and view only partner-referred customers with full audit coverage.">
      <PdfDownloadPanel
        heading="Partner Registration PDF"
        reports={[
          {
            buttonLabel: "Download Partner Registration PDF",
            fileName: "partner-registration.pdf",
            title: "Partner Registration Summary",
            sections: [{ heading: "Partner Profile", rows }],
          },
        ]}
      />
    </PortalPage>
  );
}
