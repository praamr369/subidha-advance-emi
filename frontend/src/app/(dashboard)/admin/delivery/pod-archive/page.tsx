"use client";

import { useState, useEffect, useCallback } from "react";
import { listPOD, getPODDetail, exportPODYear, PODRecord, PODDetail } from "@/services/pod";

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];

export default function PODArchivePage() {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [pods, setPods] = useState<PODRecord[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedPOD, setSelectedPOD] = useState<PODDetail | null>(null);
  const [podLoading, setPodLoading] = useState(false);

  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listPOD({ year });
      setPods(res.results);
      setCount(res.count);
    } catch {
      setError("Failed to load POD records.");
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    void load();
  }, [load]);

  const openPODDetail = async (podId: number) => {
    setPodLoading(true);
    try {
      const detail = await getPODDetail(podId);
      setSelectedPOD(detail);
    } catch {
      // noop
    } finally {
      setPodLoading(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    setExportMsg(null);
    try {
      const blob = await exportPODYear(year);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pod_export_${year}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportMsg(`✓ POD export for ${year} downloaded successfully.`);
    } catch {
      setExportMsg("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-foreground">POD Archive</h1>
          <p className="text-sm text-muted-foreground">Proof of Delivery records and year-end export for security & legal</p>
        </div>
      </div>

      {/* Year Selection & Export */}
      <div className="rounded-xl border border-border bg-card p-4 mb-5">
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <label className="text-xs text-muted-foreground">Select Year</label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="h-9 rounded-xl border border-border bg-background px-3 text-sm mt-1"
            >
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div className="ml-auto flex gap-2 items-end">
            <button onClick={() => void load()} className="h-9 px-4 rounded-xl border border-border text-sm">
              Refresh
            </button>
            <button
              onClick={() => void handleExport()}
              disabled={exporting || count === 0}
              className="h-9 px-4 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {exporting ? "Exporting…" : `📥 Export ${year}`}
            </button>
          </div>
        </div>
        {exportMsg && (
          <div className={`mt-2 text-xs ${exportMsg.startsWith("✓") ? "text-green-700 bg-green-50" : "text-red-600 bg-red-50"} rounded-lg px-3 py-2`}>
            {exportMsg}
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Total POD Records</div>
          <div className="text-lg font-bold mt-1">{count}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Export Format</div>
          <div className="text-sm font-semibold mt-1">ZIP (JSON + CSV + Images)</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Year Covered</div>
          <div className="text-sm font-semibold mt-1">{year}</div>
        </div>
      </div>

      {/* POD List */}
      {loading && <div className="text-sm text-muted-foreground text-center py-10">Loading…</div>}
      {error && <div className="text-sm text-red-600 py-4">{error}</div>}

      {!loading && pods.length === 0 && (
        <div className="text-sm text-muted-foreground text-center py-12">No POD records found for {year}.</div>
      )}

      {pods.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Delivery ID</th>
                <th className="px-4 py-3 text-left">Customer</th>
                <th className="px-4 py-3 text-left">Contract</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Driver</th>
                <th className="px-4 py-3 text-center">Photos</th>
                <th className="px-4 py-3 text-center">Signature</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {pods.map((p) => (
                <tr key={p.pod_id} className="border-t border-border hover:bg-muted/20">
                  <td className="px-4 py-3 font-mono text-xs">{p.pod_id}</td>
                  <td className="px-4 py-3">{p.customer_name}</td>
                  <td className="px-4 py-3 text-xs font-mono">{p.contract_ref}</td>
                  <td className="px-4 py-3 text-xs">{new Date(p.delivery_date).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-xs">{p.driver_name}</td>
                  <td className="px-4 py-3 text-center text-xs font-semibold">{p.photos}</td>
                  <td className="px-4 py-3 text-center">{p.signature ? "✓" : "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.status === "CAPTURED" ? "bg-blue-50 text-blue-700 border border-blue-200" : p.status === "VERIFIED" ? "bg-green-50 text-green-700 border border-green-200" : "bg-gray-50 text-gray-600 border border-gray-200"}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => void openPODDetail(p.pod_id)}
                      className="text-xs text-primary underline hover:opacity-70"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* POD Detail Modal */}
      {selectedPOD && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl p-6 w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="font-semibold text-lg">POD #{selectedPOD.pod_id}</div>
                <div className="text-xs text-muted-foreground">{selectedPOD.customer_name} — {selectedPOD.contract_ref}</div>
              </div>
              <button
                onClick={() => setSelectedPOD(null)}
                className="text-lg text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>

            {podLoading ? (
              <div className="text-sm text-muted-foreground py-10">Loading…</div>
            ) : (
              <div className="space-y-4">
                {/* Meta */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-muted-foreground">Delivery Date:</span>
                    <div className="font-medium">{new Date(selectedPOD.delivery_date).toLocaleString()}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Driver:</span>
                    <div className="font-medium">{selectedPOD.driver_name} {selectedPOD.driver_phone && `(${selectedPOD.driver_phone})`}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Customer Signature:</span>
                    <div className="font-medium">{selectedPOD.customer_signature_name}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">GPS:</span>
                    <div className="font-medium">{selectedPOD.gps_latitude ? `${selectedPOD.gps_latitude}, ${selectedPOD.gps_longitude}` : "—"}</div>
                  </div>
                </div>

                {/* Images */}
                <div className="border-t border-border pt-3">
                  <div className="text-xs font-semibold mb-2">Media</div>
                  <div className="grid grid-cols-3 gap-2">
                    {selectedPOD.photo_1_url && (
                      <a
                        href={selectedPOD.photo_1_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="aspect-square rounded-lg border border-border bg-muted flex items-center justify-center hover:opacity-75 text-xs"
                      >
                        Photo 1
                      </a>
                    )}
                    {selectedPOD.photo_2_url && (
                      <a
                        href={selectedPOD.photo_2_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="aspect-square rounded-lg border border-border bg-muted flex items-center justify-center hover:opacity-75 text-xs"
                      >
                        Photo 2
                      </a>
                    )}
                    {selectedPOD.signature_image_url && (
                      <a
                        href={selectedPOD.signature_image_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="aspect-square rounded-lg border border-border bg-muted flex items-center justify-center hover:opacity-75 text-xs"
                      >
                        Signature
                      </a>
                    )}
                  </div>
                </div>

                {/* Notes */}
                {selectedPOD.notes && (
                  <div className="border-t border-border pt-3">
                    <div className="text-xs font-semibold mb-1">Notes</div>
                    <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">{selectedPOD.notes}</div>
                  </div>
                )}

                {/* Close */}
                <div className="border-t border-border pt-3">
                  <button
                    onClick={() => setSelectedPOD(null)}
                    className="w-full h-8 rounded-xl border border-border text-sm"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
