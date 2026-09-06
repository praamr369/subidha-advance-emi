"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import CustomerPageShell, { CPageCard, CPageSection } from "@/components/layout/CustomerPageShell";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import { apiFetch } from "@/lib/api";

type KYCStatus = {
  status: "PENDING" | "SUBMITTED" | "UNDER_REVIEW" | "VERIFIED" | "REJECTED";
  submitted_at: string | null;
  verified_at: string | null;
  rejection_reason: string | null;
  documents: { type: string; status: string; uploaded_at: string }[];
};

const DOC_TYPES = [
  { value: "AADHAAR", label: "Aadhaar Card" },
  { value: "PAN", label: "PAN Card" },
  { value: "PASSPORT", label: "Passport" },
  { value: "VOTER_ID", label: "Voter ID" },
  { value: "DRIVING_LICENSE", label: "Driving Licence" },
];

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Not Started",
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under Review",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
};

function statusCls(s: string) {
  if (s === "VERIFIED") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400";
  if (s === "REJECTED") return "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400";
  if (s === "UNDER_REVIEW") return "bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400";
  return "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400";
}

export default function KYCPage() {
  const [kycStatus, setKycStatus] = useState<KYCStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [docType, setDocType] = useState("AADHAAR");
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputCls = "w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 transition";

  async function load() {
    setLoading(true);
    try {
      const d = await apiFetch<KYCStatus>("/api/v1/customers/kyc-status/");
      setKycStatus(d);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [uploaded]);

  const kycUploadSchema = z.object({
    docType: z.enum(["AADHAAR", "PAN", "PASSPORT", "VOTER_ID", "DRIVING_LICENSE"], {
      required_error: "Document type is required.",
    }),
    fileName: z.string().min(1, "Please select a file."),
    fileSize: z.number().max(5 * 1024 * 1024, "File must be 5 MB or smaller."),
    fileType: z.string().refine(
      (t) => ["application/pdf", "image/jpeg", "image/png"].includes(t),
      "Only PDF, JPG, or PNG files are accepted."
    ),
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validation = kycUploadSchema.safeParse({
      docType,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
    });
    if (!validation.success) {
      setError(validation.error.issues[0].message);
      e.target.value = "";
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("document_type", docType);
      formData.append("file", file);
      await apiFetch("/api/v1/customers/kyc-upload/", { method: "POST", body: formData });
      setUploaded(true);
      setTimeout(() => setUploaded(false), 3000);
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <CustomerPageShell
      title="KYC Verification"
      subtitle="Verify your identity to access all services"
      backHref="/customer"
      backLabel="Dashboard"
    >
      {loading ? <ERPLoadingState label="Loading KYC status…" /> : null}

      {!loading && kycStatus ? (
        <>
          {/* Status */}
          <CPageSection title="Verification Status">
            <CPageCard>
              <div className="flex items-center gap-3">
                <span className={`rounded-full px-3 py-1 text-sm font-bold ${statusCls(kycStatus.status)}`}>
                  {STATUS_LABEL[kycStatus.status] || kycStatus.status}
                </span>
              </div>
              {kycStatus.submitted_at ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Submitted: {new Date(kycStatus.submitted_at).toLocaleDateString("en-IN")}
                </p>
              ) : null}
              {kycStatus.verified_at ? (
                <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                  Verified: {new Date(kycStatus.verified_at).toLocaleDateString("en-IN")}
                </p>
              ) : null}
              {kycStatus.rejection_reason ? (
                <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                  Reason: {kycStatus.rejection_reason}
                </p>
              ) : null}
            </CPageCard>
          </CPageSection>

          {/* Submitted docs */}
          {kycStatus.documents.length > 0 ? (
            <CPageSection title="Submitted Documents">
              <div className="space-y-2">
                {kycStatus.documents.map((doc, i) => (
                  <CPageCard key={i}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">{DOC_TYPES.find((d) => d.value === doc.type)?.label || doc.type}</div>
                        <div className="text-xs text-muted-foreground">{new Date(doc.uploaded_at).toLocaleDateString("en-IN")}</div>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusCls(doc.status)}`}>{doc.status}</span>
                    </div>
                  </CPageCard>
                ))}
              </div>
            </CPageSection>
          ) : null}

          {/* Upload form */}
          {kycStatus.status !== "VERIFIED" ? (
            <CPageSection title="Upload Document">
              <CPageCard>
                {uploaded ? (
                  <div className="mb-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                    Document uploaded! We&apos;ll verify it within 24–48 hours.
                  </div>
                ) : null}
                {error ? (
                  <div className="mb-3 rounded-xl bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700">{error}</div>
                ) : null}

                <div className="space-y-3">
                  <div>
                    <label htmlFor="f-document-type" className="block text-xs font-semibold text-muted-foreground mb-1.5">Document Type</label>
                    <select id="f-document-type" className={inputCls} value={docType} onChange={(e) => setDocType(e.target.value)}>
                      {DOC_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                  </div>
                  <label className={`flex flex-col items-center justify-center w-full rounded-2xl border-2 border-dashed border-border py-8 cursor-pointer hover:bg-muted/30 transition ${uploading ? "opacity-50" : ""}`}>
                    <div className="text-3xl mb-2">📄</div>
                    <div className="text-sm font-semibold text-foreground">{uploading ? "Uploading…" : "Tap to upload document"}</div>
                    <div className="text-xs text-muted-foreground mt-1">PDF, JPG, PNG — max 5MB</div>
                    <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => void handleUpload(e)} disabled={uploading} />
                  </label>
                </div>
              </CPageCard>
            </CPageSection>
          ) : null}
        </>
      ) : null}

      {/* Info */}
      <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        KYC verification is required under Indian regulations. Your documents are encrypted and never shared without consent.
      </div>
    </CustomerPageShell>
  );
}
