"use client";

import { useState, useEffect, useCallback } from "react";

import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";
import {
  listAMLScreenings,
  createAMLScreening,
  togglePEPFlag,
  getCustomerAMLProfile,
  AMLScreening,
  CustomerAMLProfile,
  AML_RESULT_LABELS,
  AML_RESULT_COLORS,
  AMLResult,
} from "@/services/aml";

const AML_RESULTS: AMLResult[] = ["CLEAR", "WATCHLIST_HIT", "PEP_CONFIRMED", "SANCTIONED", "PENDING"];

export default function AMLScreeningPage() {
  const [screenings, setScreenings] = useState<AMLScreening[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterResult, setFilterResult] = useState("");

  const [selectedProfile, setSelectedProfile] = useState<CustomerAMLProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const [showScreeningForm, setShowScreeningForm] = useState(false);
  const [screenCustomerId, setScreenCustomerId] = useState("");
  const [screenForm, setScreenForm] = useState<{
    result: AMLResult;
    screening_date: string;
    notes: string;
    watchlist_reference: string;
    checked_rbi_defaulter_list: boolean;
    checked_interpol: boolean;
    checked_ofac: boolean;
    checked_un_sanctions: boolean;
    checked_pep_list: boolean;
  }>({
    result: "PENDING",
    screening_date: new Date().toISOString().split("T")[0],
    notes: "",
    watchlist_reference: "",
    checked_rbi_defaulter_list: false,
    checked_interpol: false,
    checked_ofac: false,
    checked_un_sanctions: false,
    checked_pep_list: false,
  });
  const [screenBusy, setScreenBusy] = useState(false);
  const [screenErr, setScreenErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listAMLScreenings({ result: filterResult || undefined, latest_only: true });
      setScreenings(res.results);
      setCount(res.count);
    } catch {
      // noop
    } finally {
      setLoading(false);
    }
  }, [filterResult]);

  useEffect(() => { void load(); }, [load]);

  const openProfile = async (customerId: number) => {
    setProfileLoading(true);
    setSelectedProfile(null);
    try {
      const profile = await getCustomerAMLProfile(customerId);
      setSelectedProfile(profile);
    } catch {
      // noop
    } finally {
      setProfileLoading(false);
    }
  };

  const handleTogglePEP = async (customerId: number, current: boolean) => {
    await togglePEPFlag(customerId, !current);
    if (selectedProfile?.customer_id === customerId) {
      setSelectedProfile(p => p ? { ...p, is_pep: !current } : p);
    }
    void load();
  };

  const submitScreening = async () => {
    if (!screenCustomerId) { setScreenErr("Customer ID is required."); return; }
    setScreenBusy(true);
    setScreenErr(null);
    try {
      await createAMLScreening(Number(screenCustomerId), screenForm);
      setShowScreeningForm(false);
      setScreenCustomerId("");
      void load();
    } catch {
      setScreenErr("Failed to save screening record.");
    } finally {
      setScreenBusy(false);
    }
  };

  const CheckRow = ({ label, field }: { label: string; field: keyof typeof screenForm }) => (
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <input
        type="checkbox"
        checked={screenForm[field] as boolean}
        onChange={e => setScreenForm(f => ({ ...f, [field]: e.target.checked }))}
        className="rounded"
      />
      {label}
    </label>
  );

  return (
    <ERPPageShell
      eyebrow="CRM · Compliance"
      title="AML Screening"
      subtitle="Anti-Money Laundering screening records and PEP flags for customer risk management."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "CRM", href: ROUTES.admin.crm },
        { label: "AML Screening" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    >
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setShowScreeningForm(true)}
          className="h-9 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"
        >
          + New Screening
        </button>
      </div>

      <div className="flex gap-3 mb-4">
        <select value={filterResult} onChange={e => setFilterResult(e.target.value)} className="h-9 rounded-xl border border-border bg-background px-3 text-sm">
          <option value="">All Results</option>
          {AML_RESULTS.map(r => <option key={r} value={r}>{AML_RESULT_LABELS[r]}</option>)}
        </select>
        <button onClick={() => void load()} className="h-9 px-4 rounded-xl border border-border text-sm">Refresh</button>
        <div className="ml-auto text-sm text-muted-foreground self-center">{count} record{count !== 1 ? "s" : ""}</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* List */}
        <div className="lg:col-span-3 rounded-xl border border-border overflow-hidden">
          {loading && <div className="text-sm text-muted-foreground py-10 text-center">Loading…</div>}
          {!loading && screenings.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-12">No screening records found.</div>
          )}
          {screenings.length > 0 && (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Customer</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Result</th>
                  <th className="px-4 py-3 text-left">PEP</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {screenings.map(s => (
                  <tr key={s.id} className="border-t border-border hover:bg-muted/20 cursor-pointer" onClick={() => void openProfile(s.customer_id)}>
                    <td className="px-4 py-3 font-medium">{s.customer_name}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{s.screening_date}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full border text-xs font-medium ${AML_RESULT_COLORS[s.result]}`}>
                        {AML_RESULT_LABELS[s.result]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={e => { e.stopPropagation(); void handleTogglePEP(s.customer_id, false); }}
                        className="text-xs px-2 py-0.5 rounded-full border border-gray-200 text-muted-foreground hover:bg-gray-50"
                      >
                        Not PEP
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={e => { e.stopPropagation(); void openProfile(s.customer_id); }}
                        className="text-xs text-primary underline"
                      >
                        Profile
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Profile panel */}
        <div className="lg:col-span-2 rounded-xl border border-border p-4">
          {!selectedProfile && !profileLoading && (
            <div className="text-sm text-muted-foreground text-center py-10">Select a customer to view their AML profile.</div>
          )}
          {profileLoading && <div className="text-sm text-muted-foreground text-center py-10">Loading…</div>}
          {selectedProfile && (
            <div>
              <div className="font-semibold text-base mb-1">{selectedProfile.customer_name}</div>
              <div className="flex gap-2 mb-4 flex-wrap">
                <span className={`px-2 py-0.5 rounded-full border text-xs font-medium ${selectedProfile.is_pep ? "bg-orange-50 text-orange-700 border-orange-200" : "bg-gray-50 text-muted-foreground border-gray-200"}`}>
                  {selectedProfile.is_pep ? "PEP" : "Not PEP"}
                </span>
                <span className={`px-2 py-0.5 rounded-full border text-xs font-medium ${selectedProfile.aml_cleared ? "bg-green-50 text-green-700 border-green-200" : "bg-yellow-50 text-yellow-700 border-yellow-200"}`}>
                  {selectedProfile.aml_cleared ? "AML Cleared" : "AML Pending"}
                </span>
              </div>

              <button
                onClick={() => void handleTogglePEP(selectedProfile.customer_id, selectedProfile.is_pep)}
                className={`w-full h-8 rounded-xl text-xs font-semibold border mb-3 ${selectedProfile.is_pep ? "border-green-300 text-green-700 hover:bg-green-50" : "border-orange-300 text-orange-700 hover:bg-orange-50"}`}
              >
                {selectedProfile.is_pep ? "Clear PEP Flag" : "Mark as PEP"}
              </button>

              {selectedProfile.latest_screening && (
                <div className="mb-3 p-3 rounded-xl bg-muted/40 text-xs space-y-1">
                  <div className="font-semibold text-sm mb-1">Latest Screening</div>
                  <div>Date: {selectedProfile.latest_screening.screening_date}</div>
                  <div className="flex items-center gap-2">
                    Result:
                    <span className={`px-2 py-0.5 rounded-full border text-xs font-medium ${AML_RESULT_COLORS[selectedProfile.latest_screening.result]}`}>
                      {AML_RESULT_LABELS[selectedProfile.latest_screening.result]}
                    </span>
                  </div>
                  {selectedProfile.latest_screening.watchlist_reference && (
                    <div>Ref: {selectedProfile.latest_screening.watchlist_reference}</div>
                  )}
                  {selectedProfile.latest_screening.notes && (
                    <div className="text-muted-foreground">{selectedProfile.latest_screening.notes}</div>
                  )}
                  <div className="pt-1 flex flex-wrap gap-1">
                    {selectedProfile.latest_screening.checked_rbi_defaulter_list && <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">RBI</span>}
                    {selectedProfile.latest_screening.checked_interpol && <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Interpol</span>}
                    {selectedProfile.latest_screening.checked_ofac && <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">OFAC</span>}
                    {selectedProfile.latest_screening.checked_un_sanctions && <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">UN</span>}
                    {selectedProfile.latest_screening.checked_pep_list && <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">PEP List</span>}
                  </div>
                </div>
              )}

              {selectedProfile.history.length > 1 && (
                <div>
                  <div className="text-xs font-semibold text-muted-foreground mb-2">History</div>
                  <div className="space-y-2">
                    {selectedProfile.history.slice(0, 5).map(h => (
                      <div key={h.id} className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground">{h.screening_date}</span>
                        <span className={`px-1.5 py-0.5 rounded-full border ${AML_RESULT_COLORS[h.result]}`}>{AML_RESULT_LABELS[h.result]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* New Screening Modal */}
      {showScreeningForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl p-6 w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="font-semibold mb-4">New AML Screening</div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Customer ID</label>
                <input type="number" value={screenCustomerId} onChange={e => setScreenCustomerId(e.target.value)}
                  className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Screening Date</label>
                <input type="date" value={screenForm.screening_date} onChange={e => setScreenForm(f => ({ ...f, screening_date: e.target.value }))}
                  className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Result</label>
                <select value={screenForm.result} onChange={e => setScreenForm(f => ({ ...f, result: e.target.value as AMLResult }))}
                  className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm mt-1">
                  {AML_RESULTS.map(r => <option key={r} value={r}>{AML_RESULT_LABELS[r]}</option>)}
                </select>
              </div>
              <div className="border border-border rounded-xl p-3 space-y-2">
                <div className="text-xs font-semibold text-muted-foreground mb-1">Lists Checked</div>
                <CheckRow label="RBI Defaulter List" field="checked_rbi_defaulter_list" />
                <CheckRow label="Interpol" field="checked_interpol" />
                <CheckRow label="OFAC Sanctions" field="checked_ofac" />
                <CheckRow label="UN Sanctions" field="checked_un_sanctions" />
                <CheckRow label="PEP List" field="checked_pep_list" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Watchlist Reference</label>
                <input value={screenForm.watchlist_reference} onChange={e => setScreenForm(f => ({ ...f, watchlist_reference: e.target.value }))}
                  className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Notes</label>
                <textarea value={screenForm.notes} onChange={e => setScreenForm(f => ({ ...f, notes: e.target.value }))}
                  rows={3} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm mt-1 resize-none" />
              </div>
              {screenErr && <div className="text-xs text-red-600">{screenErr}</div>}
              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowScreeningForm(false)} className="flex-1 h-9 rounded-xl border border-border text-sm">Cancel</button>
                <button onClick={() => void submitScreening()} disabled={screenBusy}
                  className="flex-1 h-9 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
                  {screenBusy ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ERPPageShell>
  );
}
