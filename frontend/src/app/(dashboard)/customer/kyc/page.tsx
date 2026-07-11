"use client";

import { useEffect, useState } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
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

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  PENDING: { label: "Not Started", color: "gray", icon: "○" },
  SUBMITTED: { label: "Submitted", color: "blue", icon: "📤" },
  UNDER_REVIEW: { label: "Under Review", color: "yellow", icon: "🔍" },
  VERIFIED: { label: "Verified", color: "green", icon: "✅" },
  REJECTED: { label: "Rejected", color: "red", icon: "❌" },
};

export default function KYCPage() {
  const [kycStatus, setKycStatus] = useState<KYCStatus | null>(null);
  const [docType, setDocType] = useState("AADHAAR");
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/v1/customers/kyc-status/")
      .then((d) => setKycStatus(d as KYCStatus))
      .catch(() => {});
  }, [uploaded]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("document_type", docType);
      formData.append("file", file);
      await fetch("/api/v1/customers/kyc-upload/", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      setUploaded(true);
      setTimeout(() => setUploaded(false), 3000);
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const cfg = kycStatus ? STATUS_CONFIG[kycStatus.status] : null;

  return (
    <ERPPageShell
      title="KYC Verification"
      subtitle="Identity verification required for subscription and payment services"
      breadcrumbs={[{ label: "Home", href: "/customer/dashboard" }, { label: "KYC Status" }]}
    >
      <div className="max-w-2xl mx-auto space-y-6">
        {kycStatus && cfg && (
          <WorkspaceSection title="Verification Status">
            <div className={`flex items-center gap-4 p-4 rounded-lg border-2 ${
              kycStatus.status === "VERIFIED" ? "border-green-400 bg-green-50 dark:bg-green-900/20" :
              kycStatus.status === "REJECTED" ? "border-red-400 bg-red-50 dark:bg-red-900/20" :
              "border-blue-300 bg-blue-50 dark:bg-blue-900/20"
            }`}>
              <div className="text-3xl">{cfg.icon}</div>
              <div>
                <div className="font-bold text-lg">{cfg.label}</div>
                {kycStatus.submitted_at && (
                  <div className="text-sm text-gray-600">Submitted: {new Date(kycStatus.submitted_at).toLocaleDateString("en-IN")}</div>
                )}
                {kycStatus.verified_at && (
                  <div className="text-sm text-green-700">Verified: {new Date(kycStatus.verified_at).toLocaleDateString("en-IN")}</div>
                )}
                {kycStatus.rejection_reason && (
                  <div className="text-sm text-red-700 mt-1">Reason: {kycStatus.rejection_reason}</div>
                )}
              </div>
            </div>
          </WorkspaceSection>
        )}

        {kycStatus?.documents && kycStatus.documents.length > 0 && (
          <WorkspaceSection title="Submitted Documents">
            <div className="space-y-2">
              {kycStatus.documents.map((doc, i) => (
                <div key={i} className="flex items-center justify-between p-3 border rounded-lg text-sm">
                  <div>
                    <div className="font-medium">{DOC_TYPES.find((d) => d.value === doc.type)?.label || doc.type}</div>
                    <div className="text-xs text-gray-500">{new Date(doc.uploaded_at).toLocaleDateString("en-IN")}</div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    doc.status === "VERIFIED" ? "bg-green-100 text-green-700" :
                    doc.status === "REJECTED" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"
                  }`}>{doc.status}</span>
                </div>
              ))}
            </div>
          </WorkspaceSection>
        )}

        {kycStatus?.status !== "VERIFIED" && (
          <WorkspaceSection title="Upload Document">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Document Type</label>
                <select
                  className="w-full border rounded-lg px-3 py-2 bg-white dark:bg-gray-800 dark:border-gray-600"
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                >
                  {DOC_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>

              {uploaded && (
                <div className="p-3 bg-green-50 dark:bg-green-900/20 text-green-700 rounded-lg text-sm">
                  ✅ Document uploaded. We will verify it within 24–48 hours.
                </div>
              )}

              {error && <div className="text-red-600 text-sm">{error}</div>}

              <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 ${uploading ? "opacity-50" : ""}`}>
                <div className="text-3xl mb-2">📄</div>
                <div className="text-sm font-medium">{uploading ? "Uploading..." : "Click to upload document"}</div>
                <div className="text-xs text-gray-500 mt-1">PDF, JPG, PNG — max 5MB</div>
                <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={handleUpload} disabled={uploading} />
              </label>
            </div>
          </WorkspaceSection>
        )}

        <WorkspaceSection title="Why KYC?">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            KYC verification is required under Indian regulations for financial services. Your documents are encrypted, stored securely, and never shared without your consent.
          </p>
        </WorkspaceSection>
      </div>
    </ERPPageShell>
  );
}
