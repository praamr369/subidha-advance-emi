"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  listDocuments,
  uploadDocument,
  deleteDocument,
  documentDownloadUrl,
  documentZipExportUrl,
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

function isPreviewable(mime: string, filename: string): boolean {
  if (mime.startsWith("image/")) return true;
  if (mime === "application/pdf") return true;
  if (filename.match(/\.(jpg|jpeg|png|gif|webp|pdf)$/i)) return true;
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
      setDocs(res.results);
    } catch {
      showToast("Failed to load documents.", "err");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) { showToast("Select a file first.", "err"); return; }
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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Document Center</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Upload, organise, and export all business documents — invoices, contracts, KYC, receipts and more.
        </p>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
          toast.type === "ok"
            ? "bg-green-600 text-white"
            : "bg-red-600 text-white"
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-gray-700">
        {(["browse", "upload"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
              activeTab === tab
                ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
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
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-4">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
              <select
                value={filter.category}
                onChange={(e) => setFilter((f) => ({ ...f, category: e.target.value }))}
                className="col-span-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
              <input
                type="date"
                value={filter.date_from}
                onChange={(e) => setFilter((f) => ({ ...f, date_from: e.target.value }))}
                className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                placeholder="From"
              />
              <input
                type="date"
                value={filter.date_to}
                onChange={(e) => setFilter((f) => ({ ...f, date_to: e.target.value }))}
                className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                placeholder="To"
              />
              <input
                type="text"
                value={filter.search}
                onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
                placeholder="Search title..."
                className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
              <a
                href={zipUrl}
                download
                className="flex items-center justify-center gap-2 bg-gray-800 dark:bg-gray-700 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-900 dark:hover:bg-gray-600 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                ZIP Export
              </a>
            </div>
          </div>

          {/* Document list */}
          {loading ? (
            <div className="text-center py-16 text-gray-400 dark:text-gray-500">Loading…</div>
          ) : docs.length === 0 ? (
            <div className="text-center py-16 text-gray-400 dark:text-gray-500">
              No documents found.{" "}
              <button onClick={() => setActiveTab("upload")} className="text-blue-600 dark:text-blue-400 underline">
                Upload one
              </button>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left">Title</th>
                    <th className="px-4 py-3 text-left">Category</th>
                    <th className="px-4 py-3 text-left hidden md:table-cell">Size</th>
                    <th className="px-4 py-3 text-left hidden lg:table-cell">Uploaded</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {docs.map((doc) => (
                    <tr key={doc.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-white truncate max-w-[200px]">{doc.title}</div>
                        <div className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-[200px]">{doc.original_filename}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${CATEGORY_COLORS[doc.category] || CATEGORY_COLORS.other}`}>
                          {doc.category_label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 hidden md:table-cell">
                        {formatFileSize(doc.file_size)}
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 hidden lg:table-cell">
                        {new Date(doc.created_at).toLocaleDateString("en-IN")}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {isPreviewable(doc.mime_type, doc.original_filename) && (
                            <button
                              onClick={() => setPreviewDoc(doc)}
                              className="text-blue-600 dark:text-blue-400 hover:underline text-xs"
                            >
                              Preview
                            </button>
                          )}
                          <a
                            href={documentDownloadUrl(doc.id)}
                            download={doc.original_filename}
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
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-400 dark:text-gray-500">
                {docs.length} document{docs.length !== 1 ? "s" : ""}
              </div>
            </div>
          )}
        </>
      )}

      {/* Upload Tab */}
      {activeTab === "upload" && (
        <div className="max-w-lg">
          <form onSubmit={handleUpload} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Upload Document</h2>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">File *</label>
              <input
                ref={fileInputRef}
                type="file"
                required
                className="w-full text-sm text-gray-700 dark:text-gray-200 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-blue-50 file:text-blue-700 dark:file:bg-blue-900 dark:file:text-blue-200 hover:file:bg-blue-100"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Category *</label>
              <select
                value={uploadForm.category}
                onChange={(e) => setUploadForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              >
                {CATEGORIES.slice(1).map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Title</label>
              <input
                type="text"
                value={uploadForm.title}
                onChange={(e) => setUploadForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Leave blank to use filename"
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Description</label>
              <textarea
                value={uploadForm.description}
                onChange={(e) => setUploadForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Retention Date</label>
                <input
                  type="date"
                  value={uploadForm.retention_date}
                  onChange={(e) => setUploadForm((f) => ({ ...f, retention_date: e.target.value }))}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Tags</label>
                <input
                  type="text"
                  value={uploadForm.tags}
                  onChange={(e) => setUploadForm((f) => ({ ...f, tags: e.target.value }))}
                  placeholder="comma separated"
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={uploading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2 rounded-lg text-sm transition-colors"
            >
              {uploading ? "Uploading…" : "Upload"}
            </button>
          </form>
        </div>
      )}

      {/* Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setPreviewDoc(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <span className="font-medium text-gray-900 dark:text-white text-sm truncate">{previewDoc.title}</span>
              <div className="flex gap-3">
                <a
                  href={documentDownloadUrl(previewDoc.id)}
                  download={previewDoc.original_filename}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Download
                </a>
                <button onClick={() => setPreviewDoc(null)} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-lg leading-none">&times;</button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-2 flex items-center justify-center bg-gray-100 dark:bg-gray-800">
              {previewDoc.mime_type === "application/pdf" || previewDoc.original_filename.endsWith(".pdf") ? (
                <iframe
                  src={documentDownloadUrl(previewDoc.id)}
                  className="w-full h-[70vh] border-0"
                  title="PDF Preview"
                />
              ) : (
                <img
                  src={previewDoc.file_url ?? documentDownloadUrl(previewDoc.id)}
                  alt={previewDoc.title}
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
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-sm w-full p-6">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Delete Document?</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              &ldquo;{deleteTarget.title}&rdquo; will be permanently removed from disk.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 py-2 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
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
  );
}
