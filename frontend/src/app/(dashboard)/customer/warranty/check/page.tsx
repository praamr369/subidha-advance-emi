"use client";

import { useEffect, useState } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { apiFetch } from "@/lib/api";

type Subscription = { id: number; product_name: string; subscription_number: string; product_id: number };
type WarrantyInfo = {
  product_id: number;
  product_name: string;
  warranty_enabled: boolean;
  manufacturing_months: number;
  structural_months: number;
  extended_months_max: number;
  purchase_date: string | null;
  manufacturing_expiry: string | null;
  structural_expiry: string | null;
  is_manufacturing_active: boolean;
  is_structural_active: boolean;
};

export default function WarrantyCheckPage() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [selectedSub, setSelectedSub] = useState("");
  const [info, setInfo] = useState<WarrantyInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/v1/subscriptions/?page_size=50")
      .then((d) => setSubs(Array.isArray(d) ? d as Subscription[] : ((d as { results?: Subscription[] })?.results ?? [])))
      .catch(() => {});
  }, []);

  const handleCheck = async () => {
    const sub = subs.find((s) => String(s.id) === selectedSub);
    if (!sub) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/v1/warranty/check/${sub.product_id}/`);
      setInfo(res as WarrantyInfo);
    } catch {
      setError("Could not fetch warranty information.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ERPPageShell
      title="Warranty Check"
      subtitle="Check warranty coverage for your products"
      breadcrumbs={[{ label: "Home", href: "/customer/dashboard" }, { label: "Warranty" }, { label: "Check Coverage" }]}
    >
      <div className="max-w-2xl mx-auto space-y-6">
        <WorkspaceSection title="Select Product">
          <div className="flex gap-3">
            <select
              className="flex-1 border rounded-lg px-3 py-2 bg-white dark:bg-gray-800 dark:border-gray-600"
              value={selectedSub}
              onChange={(e) => { setSelectedSub(e.target.value); setInfo(null); }}
            >
              <option value="">Choose a subscription...</option>
              {subs.map((s) => (
                <option key={s.id} value={s.id}>{s.subscription_number} — {s.product_name}</option>
              ))}
            </select>
            <button
              onClick={handleCheck}
              disabled={!selectedSub || loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50 hover:bg-blue-700"
            >
              {loading ? "Checking..." : "Check"}
            </button>
          </div>
          {error && <div className="mt-3 text-red-600 text-sm">{error}</div>}
        </WorkspaceSection>

        {info && (
          <>
            {!info.warranty_enabled ? (
              <WorkspaceSection title="Warranty Status">
                <div className="text-center py-6">
                  <div className="text-3xl mb-2">❌</div>
                  <p className="font-medium">No warranty on this product</p>
                  <p className="text-sm text-gray-500 mt-1">This product does not have a manufacturer warranty.</p>
                </div>
              </WorkspaceSection>
            ) : (
              <WorkspaceSection title="Warranty Coverage">
                <div className="space-y-4">
                  <div className={`p-4 rounded-lg border-2 ${info.is_manufacturing_active ? "border-green-400 bg-green-50 dark:bg-green-900/20" : "border-gray-200 bg-gray-50 dark:bg-gray-800"}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold">Manufacturing Warranty</div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">{info.manufacturing_months} months — defects in materials/workmanship</div>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${info.is_manufacturing_active ? "bg-green-500 text-white" : "bg-gray-300 text-gray-600"}`}>
                        {info.is_manufacturing_active ? "ACTIVE" : "EXPIRED"}
                      </span>
                    </div>
                    {info.manufacturing_expiry && (
                      <div className="mt-2 text-sm text-gray-500">
                        Expires: {new Date(info.manufacturing_expiry).toLocaleDateString("en-IN")}
                      </div>
                    )}
                  </div>

                  <div className={`p-4 rounded-lg border-2 ${info.is_structural_active ? "border-blue-400 bg-blue-50 dark:bg-blue-900/20" : "border-gray-200 bg-gray-50 dark:bg-gray-800"}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold">Structural Warranty</div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">{info.structural_months} months — frame & structural integrity</div>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${info.is_structural_active ? "bg-blue-500 text-white" : "bg-gray-300 text-gray-600"}`}>
                        {info.is_structural_active ? "ACTIVE" : "EXPIRED"}
                      </span>
                    </div>
                    {info.structural_expiry && (
                      <div className="mt-2 text-sm text-gray-500">
                        Expires: {new Date(info.structural_expiry).toLocaleDateString("en-IN")}
                      </div>
                    )}
                  </div>

                  {info.extended_months_max > 0 && (
                    <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200">
                      <div className="text-sm font-medium text-purple-800 dark:text-purple-200">
                        Extended warranty available up to {info.extended_months_max} months
                      </div>
                      <a href="/customer/warranty/extended" className="text-xs text-purple-600 underline mt-1 inline-block">
                        Enroll in Extended Warranty →
                      </a>
                    </div>
                  )}
                </div>
              </WorkspaceSection>
            )}

            <div className="flex gap-3">
              <a href="/customer/warranty/claim" className="flex-1 py-2 text-center bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700 text-sm">
                File a Warranty Claim
              </a>
              <a href="/customer/warranty/service-history" className="flex-1 py-2 text-center border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800">
                View Service History
              </a>
            </div>
          </>
        )}
      </div>
    </ERPPageShell>
  );
}
