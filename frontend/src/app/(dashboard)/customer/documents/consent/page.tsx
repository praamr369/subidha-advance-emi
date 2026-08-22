"use client";

import { useEffect, useState } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { fetchCustomerDocumentConsents } from "@/services/customer-portal";

type DocConsent = {
  id: number;
  document_type: string;
  document_title: string;
  signed_at: string;
  valid_until: string | null;
  e_sign_ref: string | null;
  file_url: string | null;
};

export default function DocumentConsentHistoryPage() {
  const [docs, setDocs] = useState<DocConsent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCustomerDocumentConsents()
      .then((d) => setDocs(Array.isArray(d) ? d as DocConsent[] : ((d as { results?: DocConsent[] })?.results ?? [])))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <ERPPageShell
      title="Document & E-Sign Consent History"
      subtitle="All documents you have signed or consented to"
      breadcrumbs={[
        { label: "Home", href: "/customer/dashboard" },
        { label: "Documents", href: "/customer/documents" },
        { label: "Consent History" },
      ]}
    >
      <WorkspaceSection title={`${docs.length} Document${docs.length !== 1 ? "s" : ""}`}>
        {loading && <div className="py-8 text-center text-gray-500">Loading...</div>}
        {!loading && docs.length === 0 && (
          <div className="py-12 text-center text-gray-500">
            <div className="text-4xl mb-3">📄</div>
            <p className="font-medium">No signed documents</p>
          </div>
        )}
        <div className="space-y-3">
          {docs.map((d) => (
            <div key={d.id} className="p-4 border rounded-lg">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold">{d.document_title}</div>
                  <div className="text-sm text-gray-500">{d.document_type?.replace(/_/g, " ")}</div>
                </div>
                <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">Signed</span>
              </div>
              <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-gray-500 sm:grid-cols-2 sm:gap-3">
                <span>Signed: {new Date(d.signed_at).toLocaleDateString("en-IN")}</span>
                {d.valid_until && <span>Valid until: {new Date(d.valid_until).toLocaleDateString("en-IN")}</span>}
                {d.e_sign_ref && <span className="col-span-2 font-mono">Ref: {d.e_sign_ref}</span>}
              </div>
              {d.file_url && (
                <a href={d.file_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-blue-600 underline">
                  Download Signed Document →
                </a>
              )}
            </div>
          ))}
        </div>
      </WorkspaceSection>
    </ERPPageShell>
  );
}
