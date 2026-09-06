"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  subscriptionId: number;
  allowedDocTypes: string[];
  description?: string;
  onUploadSuccess?: () => void;
};

export function SubscriptionDocumentUploadPanel({ 
  subscriptionId, 
  allowedDocTypes, 
  description = "Upload essential documents for this contract.", 
  onUploadSuccess 
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState<string>(allowedDocTypes[0] || "CUSTOMER_SIGNATURE");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Please select a file to upload.");
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("document_type", documentType);
      
      const response = await fetch(`/api/v1/admin/subscriptions/${subscriptionId}/documents/`, {
        method: "POST",
        body: formData,
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("access_token")}`
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to upload document");
      }
      
      setFile(null);
      if (onUploadSuccess) {
        onUploadSuccess();
      } else {
        router.refresh();
      }
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || "An error occurred during upload.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-5 rounded-xl border border-border bg-card p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-foreground">Upload Contract Documents</h3>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      
      <form onSubmit={handleUpload} className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1">
          <label htmlFor="f-document-type" className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Document Type</label>
          <select id="f-document-type" 
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {allowedDocTypes.map(type => (
              <option key={type} value={type}>{type.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>
        
        <div className="flex-1 space-y-1">
          <label htmlFor="f-file" className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">File</label>
          <input id="f-file"
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
        
        <button
          type="submit"
          disabled={loading || !file}
          className="inline-flex h-10 items-center justify-center rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white shadow transition-colors hover:bg-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:pointer-events-none disabled:opacity-50"
        >
          {loading ? "Uploading..." : "Upload"}
        </button>
      </form>
      {error && <p className="mt-3 text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}
