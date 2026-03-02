"use client";

import { downloadSimplePdf, type PdfSection } from "@/lib/pdf";

type ReportConfig = {
  buttonLabel: string;
  fileName: string;
  title: string;
  sections: PdfSection[];
};

type PdfDownloadPanelProps = {
  heading?: string;
  reports: ReportConfig[];
};

export default function PdfDownloadPanel({ heading = "Download Reports", reports }: PdfDownloadPanelProps) {
  return (
    <section style={{ marginTop: 20 }}>
      <h2>{heading}</h2>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {reports.map((report) => (
          <button
            key={report.fileName}
            type="button"
            onClick={() => downloadSimplePdf(report.fileName, report.title, report.sections)}
            style={{ border: "1px solid #111827", borderRadius: 8, padding: "8px 12px", cursor: "pointer" }}
          >
            {report.buttonLabel}
          </button>
        ))}
      </div>
    </section>
  );
}
