"use client";

import { useEffect, useState } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { apiFetch } from "@/lib/api";

type DrawAudit = {
  id: number;
  batch_number: string;
  draw_date: string;
  commit_hash: string;
  reveal_seed: string | null;
  winner_lucky_id: string | null;
  winner_customer: string | null;
  waiver_amount: number;
  verified: boolean;
  total_eligible: number;
};

export default function DrawAuditPage() {
  const [draws, setDraws] = useState<DrawAudit[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState<number | null>(null);
  const [verifyResult, setVerifyResult] = useState<Record<number, boolean>>({});

  useEffect(() => {
    apiFetch("/api/v1/lucky-plan/draw-audit/")
      .then((d) => setDraws(Array.isArray(d) ? d as DrawAudit[] : ((d as { results?: DrawAudit[] })?.results ?? [])))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleVerify = async (draw: DrawAudit) => {
    if (!draw.reveal_seed) return;
    setVerifying(draw.id);
    try {
      const res = await apiFetch("/api/v1/public/lucky-plan/verify-seed/", {
        method: "POST",
        body: JSON.stringify({ commit_hash: draw.commit_hash, reveal_seed: draw.reveal_seed, batch_id: draw.id }),
      });
      setVerifyResult((prev) => ({ ...prev, [draw.id]: (res as { valid?: boolean }).valid === true }));
    } catch {
      setVerifyResult((prev) => ({ ...prev, [draw.id]: false }));
    } finally {
      setVerifying(null);
    }
  };

  return (
    <ERPPageShell
      title="Lucky Draw Audit Trail"
      subtitle="Cryptographic fairness verification for all draws"
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Lucky Plan", href: "/admin/lucky-plan/batches" },
        { label: "Draw Audit" },
      ]}
    >
      <div className="space-y-6">
        <WorkspaceSection title="How Fairness Works">
          <ol className="text-sm space-y-1 list-decimal list-inside text-blue-800 dark:text-blue-200">
            <li>Before draw: SHA-256 commitment hash is published (immutable)</li>
            <li>Draw runs: winner selected from eligible set using hash + seed</li>
            <li>After draw: reveal seed is published publicly</li>
            <li>Anyone can verify: hash(seed + eligible_ids) must match commit</li>
          </ol>
        </WorkspaceSection>

        <WorkspaceSection title={`${draws.length} Draw Records`}>
          {loading && <div className="py-8 text-center text-gray-500">Loading...</div>}
          {!loading && draws.length === 0 && (
            <div className="py-12 text-center text-gray-500">No draws completed yet.</div>
          )}
          {draws.map((d) => {
            const verifyStatus = verifyResult[d.id];
            return (
              <div key={d.id} className="p-4 border rounded-lg mb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold">Batch {d.batch_number}</div>
                    <div className="text-sm text-gray-500">{new Date(d.draw_date).toLocaleDateString("en-IN")} · {d.total_eligible} eligible</div>
                  </div>
                  <div className="text-right">
                    {d.verified && <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">Verified</span>}
                    {verifyStatus === true && <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 ml-1">✅ Hash Match</span>}
                    {verifyStatus === false && <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700 ml-1">❌ Hash Mismatch</span>}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 text-xs font-mono">
                  <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded">
                    <span className="text-gray-500 font-sans">Commit Hash: </span>
                    <span className="break-all">{d.commit_hash}</span>
                  </div>
                  {d.reveal_seed && (
                    <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded">
                      <span className="text-gray-500 font-sans">Reveal Seed: </span>
                      <span className="break-all">{d.reveal_seed}</span>
                    </div>
                  )}
                </div>

                {d.winner_customer && (
                  <div className="mt-3 p-2 bg-green-50 dark:bg-green-900/20 rounded text-sm">
                    🏆 Winner: <strong>{d.winner_customer}</strong> (ID: {d.winner_lucky_id}) — Waiver: ₹{d.waiver_amount.toLocaleString("en-IN")}
                  </div>
                )}

                {d.reveal_seed && verifyStatus === undefined && (
                  <button
                    onClick={() => handleVerify(d)}
                    disabled={verifying === d.id}
                    className="mt-3 px-3 py-1.5 border rounded-lg text-xs hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                  >
                    {verifying === d.id ? "Verifying..." : "Verify Cryptographic Proof"}
                  </button>
                )}
              </div>
            );
          })}
        </WorkspaceSection>
      </div>
    </ERPPageShell>
  );
}
