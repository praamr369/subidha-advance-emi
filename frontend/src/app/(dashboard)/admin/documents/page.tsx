"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";
import { toArray } from "@/lib/api";
import {
  listDocuments,
  uploadDocument,
  deleteDocument,
  documentDownloadUrl,
  documentZipExportUrl,
  resolveDocumentFileUrl,
  formatFileSize,
  type DocumentRecord,
} from "@/services/documents";

const CATEGORIES = [
  { value: "", label: "All Categories" },
  { value: "invoice", label: "Invoice" },
  { value: "purchase_invoice", label: "Purchase Invoice" },
  { value: "receipt", label: "Receipt" },
  { value: "contract", label: "Contract" },
  { value: "kyc", label: "KYC Document" },
  { value: "po", label: "Purchase Order" },
  { value: "journal", label: "Journal Entry" },
  { value: "legal", label: "Legal Document" },
  { value: "other", label: "Other" },
];

const CATEGORY_COLORS: Record<string, string> = {
  invoice: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  purchase_invoice: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  receipt: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  contract: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  kyc: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  po: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  journal: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  legal: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  other: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
};

function isPreviewable(mime?: string | null, filename?: string | null): boolean {
  if (!mime && !filename) return false;
  if (mime?.startsWith("image/")) return true;
  if (mime === "application/pdf") return true;
  if (filename?.match(/\.(jpg|jpeg|png|gif|webp|pdf)$/i)) return true;
  return false;
}

export default function DocumentCenterPage() {
  const [docs, setDocs] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState({ category: "", date_from: "", date_to: "", search: "" });
  const [activeTab, setActiveTab] = useState<"browse" | "upload">("browse");
  const [previewDoc, setPreviewDoc] = useState<DocumentRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentRecord | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadForm, setUploadForm] = useState({
    category: "other",
    title: "",
    description: "",
    retention_date: "",
    tags: "",
  });

  const showToast = (msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listDocuments({
        category: filter.category || undefined,
        date_from: filter.date_from || undefined,
        date_to: filter.date_to || undefined,
        search: filter.search || undefined,
      });
      const safeDocs = toArray<DocumentRecord>(res?.results ?? res);
      setDocs(safeDocs);
    } catch {
      showToast("Failed to load documents.", "err");
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      showToast("Select a file first.", "err");
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    fd.append("category", uploadForm.category);
    fd.append("title", uploadForm.title || file.name);
    fd.append("description", uploadForm.description);
    fd.append("retention_date", uploadForm.retention_date);
    fd.append("tags", uploadForm.tags);
    setUploading(true);
    try {
      await uploadDocument(fd);
      showToast("File uploaded successfully.");
      setUploadForm({ category: "other", title: "", description: "", retention_date: "", tags: "" });
      if (fileInputRef.current) fileInputRef.current.value = "";
      setActiveTab("browse");
      load();
    } catch {
      showToast("Upload failed.", "err");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteDocument(deleteTarget.id);
      showToast("Document deleted.");
      setDeleteTarget(null);
      load();
    } catch {
      showToast("Delete failed.", "err");
    }
  }

  const zipUrl = documentZipExportUrl({
    category: filter.category || undefined,
    date_from: filter.date_from || undefined,
    date_to: filter.date_to || undefined,
  });

  const activeCategoryLabel = filter.category
    ? CATEGORIES.find((c) => c.value === filter.category)?.label || filter.category
    : "All";

  return (
    <ERPPageShell
      eyebrow="Command Center"
      title="Document Center"
      subtitle="Upload, organise, and export all business documents — invoices, contracts, KYC, receipts and more."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Documents" },
      ]}
      actions={[
        {
          label: "Upload Document",
          onClick: () => setActiveTab("upload"),
          variant: activeTab === "upload" ? "secondary" : "primary",
        },
        {
          label: "ZIP Export",
          href: zipUrl,
          variant: "secondary",
        },
      ]}
      stats={[
        { label: "Total Documents", value: (docs || []).length, tone: "info" },
        { label: "Active Category", value: activeCategoryLabel, tone: "default" },
        { label: "Active View", value: activeTab === "browse" ? "Browse & Filter" : "Upload File", tone: "default" },
      ]}
    >
      <div className="space-y-6">
        {/* Toast */}
        {toast && (
          <div
            className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
              toast.type === "ok" ? "bg-green-600 text-white" : "bg-red-600 text-white"
            }`}
          >
            {toast.msg}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          {(["browse", "upload"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "browse" ? "Browse & Filter" : "Upload File"}
            </button>
          ))}
        </div>

        {/* Browse Tab */}
        {activeTab === "browse" && (
          <>
            {/* Filters */}
            <div className="bg-card rounded-xl border border-border p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                <select
                  value={filter.category}
                  onChange={(e) => setFilter((f) => ({ ...f, category: e.target.value }))}
                  className="col-span-1 border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={filter.date_from}
                  onChange={(e) => setFilter((f) => ({ ...f, date_from: e.target.value }))}
                  className="border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground"
                  placeholder="From"
                />
                <input
                  type="date"
                  value={filter.date_to}
                  onChange={(e) => setFilter((f) => ({ ...f, date_to: e.target.value }))}
                  className="border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground"
                  placeholder="To"
                />
                <input
                  type="text"
                  value={filter.search}
                  onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
                  placeholder="Search title..."
                  className="border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground"
                />
                <a
                  href={zipUrl}
                  download
                  className="flex items-center justify-center gap-2 bg-secondary text-secondary-foreground px-3 py-2 rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  ZIP Export
                </a>
              </div>
            </div>

            {/* Document list */}
            {loading ? (
              <div className="text-center py-16 text-muted-foreground">Loading documents…</div>
            ) : (docs || []).length === 0 ? (
              <div className="text-center py-16 text-muted-foreground bg-card rounded-xl border border-border">
                No documents found.{" "}
                <button
                  onClick={() => setActiveTab("upload")}
                  className="text-primary underline font-medium"
                >
                  Upload one
                </button>
              </div>
            ) : (
              <div className="bg-card rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
                    <tr>
                      <th className="px-4 py-3 text-left">Title</th>
                      <th className="px-4 py-3 text-left">Category</th>
                      <th className="px-4 py-3 text-left hidden md:table-cell">Size</th>
                      <th className="px-4 py-3 text-left hidden lg:table-cell">Uploaded</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(docs || []).map((doc) => {
                      const docAny = doc as unknown as Record<string, unknown>;
                      const displayTitle =
                        doc.title ||
                        doc.original_filename ||
                        (typeof docAny.file_name === "string" ? docAny.file_name : "") ||
                        `Document #${doc.id}`;
                      const displayFilename =
                        doc.original_filename ||
                        (typeof docAny.file_name === "string" ? docAny.file_name : "") ||
                        "—";
                      const displayCategory =
                        doc.category_label ||
                        doc.category ||
                        (typeof docAny.document_type === "string" ? String(docAny.document_type) : "") ||
                        "Contract";
                      const docDate =
                        doc.created_at ||
                        (typeof docAny.generated_at === "string" ? docAny.generated_at : null);
                      const isPreview = isPreviewable(
                        doc.mime_type,
                        displayFilename !== "—" ? displayFilename : ""
                      );
                      const fileDownloadHref = documentDownloadUrl(doc.id);

                      return (
                        <tr key={doc.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3">
                            <div className="font-medium text-foreground truncate max-w-[240px]">
                              {displayTitle}
                            </div>
                            <div className="text-xs text-muted-foreground truncate max-w-[240px]">
                              {displayFilename}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                                CATEGORY_COLORS[doc.category] ||
                                CATEGORY_COLORS.contract ||
                                CATEGORY_COLORS.other
                              }`}
                            >
                              {displayCategory}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                            {formatFileSize(doc.file_size)}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                            {docDate && !isNaN(new Date(docDate).getTime())
                              ? new Date(docDate).toLocaleDateString("en-IN")
                              : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-2">
                              {isPreview && (
                                <button
                                  onClick={() => setPreviewDoc(doc)}
                                  className="text-blue-600 dark:text-blue-400 hover:underline text-xs"
                                >
                                  Preview
                                </button>
                              )}
                              <a
                                href={fileDownloadHref}
                                target="_blank"
                                rel="noreferrer"
                                download={displayFilename !== "—" ? displayFilename : `document_${doc.id}`}
                                className="text-green-600 dark:text-green-400 hover:underline text-xs"
                              >
                                Download
                              </a>
                              <button
                                onClick={() => setDeleteTarget(doc)}
                                className="text-red-500 dark:text-red-400 hover:underline text-xs"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground">
                  {(docs || []).length} document{(docs || []).length !== 1 ? "s" : ""}
                </div>
              </div>
            )}
          </>
        )}

        {/* Upload Tab */}
        {activeTab === "upload" && (
          <div className="max-w-lg">
            <form
              onSubmit={handleUpload}
              className="bg-card rounded-xl border border-border p-6 space-y-4"
            >
              <h2 className="text-base font-semibold text-foreground">Upload Document</h2>

              <div>
                <label
                  htmlFor="f-file"
                  className="block text-xs font-medium text-foreground mb-1"
                >
                  File *
                </label>
                <input
                  id="f-file"
                  ref={fileInputRef}
                  type="file"
                  required
                  className="w-full text-sm text-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-blue-50 file:text-blue-700 dark:file:bg-blue-900 dark:file:text-blue-200 hover:file:bg-blue-100"
                />
              </div>

              <div>
                <label
                  htmlFor="f-category"
                  className="block text-xs font-medium text-foreground mb-1"
                >
                  Category *
                </label>
                <select
                  id="f-category"
                  value={uploadForm.category}
                  onChange={(e) => setUploadForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground"
                >
                  {CATEGORIES.slice(1).map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="f-title"
                  className="block text-xs font-medium text-foreground mb-1"
                >
                  Title
                </label>
                <input
                  id="f-title"
                  type="text"
                  value={uploadForm.title}
                  onChange={(e) => setUploadForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Leave blank to use filename"
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground"
                />
              </div>

              <div>
                <label
                  htmlFor="f-description"
                  className="block text-xs font-medium text-foreground mb-1"
                >
                  Description
                </label>
                <textarea
                  id="f-description"
                  value={uploadForm.description}
                  onChange={(e) => setUploadForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="f-retention-date"
                    className="block text-xs font-medium text-foreground mb-1"
                  >
                    Retention Date
                  </label>
                  <input
                    id="f-retention-date"
                    type="date"
                    value={uploadForm.retention_date}
                    onChange={(e) =>
                      setUploadForm((f) => ({ ...f, retention_date: e.target.value }))
                    }
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground"
                  />
                </div>
                <div>
                  <label
                    htmlFor="f-tags"
                    className="block text-xs font-medium text-foreground mb-1"
                  >
                    Tags
                  </label>
                  <input
                    id="f-tags"
                    type="text"
                    value={uploadForm.tags}
                    onChange={(e) => setUploadForm((f) => ({ ...f, tags: e.target.value }))}
                    placeholder="comma separated"
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={uploading}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 font-medium py-2 rounded-lg text-sm transition-colors"
              >
                {uploading ? "Uploading…" : "Upload"}
              </button>
            </form>
          </div>
        )}

        {/* Preview Modal */}
        {previewDoc && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={() => setPreviewDoc(null)}
          >
            <div
              className="bg-card text-foreground rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-border"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <span className="font-medium text-foreground text-sm truncate">
                  {previewDoc.title || previewDoc.original_filename}
                </span>
                <div className="flex gap-3">
                  <a
                    href={documentDownloadUrl(previewDoc.id)}
                    download={previewDoc.original_filename || `document_${previewDoc.id}`}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Download
                  </a>
                  <button
                    onClick={() => setPreviewDoc(null)}
                    className="text-muted-foreground hover:text-foreground text-lg leading-none"
                  >
                    &times;
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-2 flex items-center justify-center bg-muted/30">
                {previewDoc.mime_type === "application/pdf" ||
                previewDoc.original_filename?.endsWith(".pdf") ||
                Boolean(
                  (previewDoc as unknown as Record<string, unknown>).file_name &&
                    String((previewDoc as unknown as Record<string, unknown>).file_name).endsWith(".pdf")
                ) ? (
                  <iframe
                    src={resolveDocumentFileUrl(previewDoc.file_url) || documentDownloadUrl(previewDoc.id)}
                    className="w-full h-[70vh] border-0"
                    title="PDF Preview"
                  />
                ) : (
                  <img
                    src={resolveDocumentFileUrl(previewDoc.file_url) || documentDownloadUrl(previewDoc.id)}
                    alt={previewDoc.title || "Preview"}
                    className="max-w-full max-h-[70vh] object-contain rounded"
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirm Modal */}
        {deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="bg-card text-foreground rounded-xl shadow-2xl max-w-sm w-full p-6 border border-border">
              <h3 className="font-semibold text-foreground mb-2">Delete Document?</h3>
              <p className="text-sm text-muted-foreground mb-4">
                &ldquo;{deleteTarget.title || deleteTarget.original_filename}&rdquo; will be
                permanently removed from disk.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="flex-1 border border-border text-foreground py-2 rounded-lg text-sm hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ERPPageShell>
  );
}
