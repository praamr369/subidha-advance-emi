"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import RoleGuard from "@/components/auth/RoleGuard";
import { apiFetch } from "@/lib/api";

type WinnerInfo = {
  lucky_number: number;
};

type LuckyDraw = {
  id: number;
  draw_month: number;
  is_revealed: boolean;
  winner_lucky_id: WinnerInfo | null;
  draw_date: string | null;
};

type BatchDetail = {
  id: number;
  batch_code: string;
  status: string;
  total_slots: number;
  duration_months: number;
  draw_day: number;
  lucky_draws: LuckyDraw[];
};

export default function BatchDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const [batch, setBatch] = useState<BatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // -----------------------------------
  // Load Batch (Defensive + Normalized)
  // -----------------------------------

  const loadBatch = async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await apiFetch(`/admin/batches/${id}/`) as BatchDetail;

      // Defensive normalization
      const normalized: BatchDetail = {
        id: data?.id,
        batch_code: data?.batch_code ?? "",
        status: data?.status ?? "",
        total_slots: data?.total_slots ?? 0,
        duration_months: data?.duration_months ?? 0,
        draw_day: data?.draw_day ?? 0,
        lucky_draws: data?.lucky_draws ?? [],
      };

      setBatch(normalized);
    } catch (err) {
      setError("Failed to load batch details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) loadBatch();
  }, [id]);

  // -----------------------------------
  // Create Draw Commitment
  // -----------------------------------

  const handleCreateCommitment = async () => {
    try {
      setProcessing(true);

      await apiFetch(`/admin/batches/${id}/create-commit/`, {
        method: "POST",
      });

      await loadBatch();
    } catch (err) {
      alert("Failed to create draw commitment.");
    } finally {
      setProcessing(false);
    }
  };

  // -----------------------------------
  // Reveal Draw
  // -----------------------------------

  const handleRevealDraw = async (drawId: number) => {
    const seed = prompt("Enter reveal seed:");
    if (!seed) return;

    try {
      setProcessing(true);

      await apiFetch(`/admin/draw/${drawId}/reveal/`, {
        method: "POST",
        body: JSON.stringify({ revealed_seed: seed }),
      });

      await loadBatch();
    } catch (err) {
      alert("Reveal failed. Check seed.");
    } finally {
      setProcessing(false);
    }
  };

  // -----------------------------------
  // UI
  // -----------------------------------

  return (
    <RoleGuard allowedRoles={["ADMIN"]}>
      <div className="p-6 space-y-8">

        {/* Loading */}
        {loading && <p>Loading batch details...</p>}

        {/* Error */}
        {error && (
          <p className="text-red-600 font-semibold">{error}</p>
        )}

        {/* Batch Content */}
        {batch && !loading && (
          <>
            {/* Batch Info */}
            <div className="space-y-2">
              <h1 className="text-3xl font-bold">
                Batch: {batch.batch_code}
              </h1>

              <p>Status: {batch.status}</p>
              <p>Total Slots: {batch.total_slots}</p>
              <p>Duration: {batch.duration_months} months</p>
              <p>Draw Day: {batch.draw_day}</p>
            </div>

            {/* Create Commitment Button */}
            <div>
              <button
                onClick={handleCreateCommitment}
                disabled={processing}
                className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
              >
                {processing ? "Processing..." : "Create Draw Commitment"}
              </button>
            </div>

            {/* Draw History */}
            <div>
              <h2 className="text-xl font-semibold mb-4">
                Draw History
              </h2>

              <table className="w-full border">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border p-2">Month</th>
                    <th className="border p-2">Status</th>
                    <th className="border p-2">Winner</th>
                    <th className="border p-2">Draw Date</th>
                    <th className="border p-2">Action</th>
                  </tr>
                </thead>

                <tbody>
                  {batch.lucky_draws.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center p-4 border">
                        No draws created yet.
                      </td>
                    </tr>
                  )}

                  {batch.lucky_draws.map((draw) => (
                    <tr key={draw.id}>
                      <td className="border p-2">
                        {draw.draw_month}
                      </td>

                      <td className="border p-2">
                        {draw.is_revealed
                          ? "Revealed"
                          : "Committed"}
                      </td>

                      <td className="border p-2">
                        {draw.winner_lucky_id
                          ? draw.winner_lucky_id.lucky_number
                          : "-"}
                      </td>

                      <td className="border p-2">
                        {draw.draw_date
                          ? new Date(draw.draw_date).toLocaleString()
                          : "-"
                        }
                      </td>

                      <td className="border p-2">
                        {!draw.is_revealed && (
                          <button
                            onClick={() =>
                              handleRevealDraw(draw.id)
                            }
                            disabled={processing}
                            className="text-blue-600"
                          >
                            Reveal
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </RoleGuard>
  );
}