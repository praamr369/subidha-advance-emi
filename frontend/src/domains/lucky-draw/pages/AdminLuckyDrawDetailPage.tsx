"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import PortalPage from "@/components/ui/PortalPage";
import { getLuckyDraw, type LuckyDrawRecord } from "@/services/draws";

export default function AdminLuckyDrawDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const drawId = String(params?.id || "");
  const [draw, setDraw] = useState<LuckyDrawRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getLuckyDraw(drawId)
      .then((payload) => {
        setDraw(payload);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load draw detail");
      });
  }, [drawId]);

  const timeline = useMemo(() => {
    if (!draw) return [] as Array<{ at: string; label: string; detail: string }>;
    const events: Array<{ at: string; label: string; detail: string }> = [];

    if (draw.created_at) {
      events.push({ at: draw.created_at, label: "Draw Commitment Created", detail: `Hash ${draw.committed_hash || "N/A"}` });
    }

    if (draw.executed_at || draw.draw_date) {
      events.push({
        at: draw.executed_at || draw.draw_date || "",
        label: draw.is_revealed ? "Draw Revealed" : "Draw Date Recorded",
        detail: draw.winner_lucky_number ? `Winner #${draw.winner_lucky_number}` : "Winner pending",
      });
    }

    return events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }, [draw]);

  return (
    <PortalPage title={draw ? `Lucky Draw #${draw.id}` : "Lucky Draw Detail"} subtitle="Committed hash, reveal state, winner result and traceability context.">
      <button type="button" onClick={() => router.push("/admin/lucky-draw")}>Back to Draw List</button>

      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}

      {draw ? (
        <>
          <section style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 12, marginTop: 10 }}>
            <p><b>Draw ID:</b> {draw.id}</p>
            <p><b>Batch:</b> {draw.batch_code || (draw.batch ? `Batch #${draw.batch}` : "-")}</p>
            <p><b>Draw Month:</b> {draw.draw_month || "-"}</p>
            <p><b>State:</b> {draw.is_revealed ? "REVEALED" : "PENDING REVEAL"}</p>
            <p><b>Winner Lucky Number:</b> {draw.winner_lucky_number ? `#${draw.winner_lucky_number}` : "-"}</p>
            <p><b>Committed Hash:</b> {draw.committed_hash || "-"}</p>
            <p><b>Executed At:</b> {draw.executed_at ? new Date(draw.executed_at).toLocaleString() : draw.draw_date ? new Date(draw.draw_date).toLocaleString() : "-"}</p>
            <p><b>Winner Context:</b> {draw.winner_context ? `Lucky #${draw.winner_context.winner_lucky_number} · Month ${draw.winner_context.draw_month}` : "-"}</p>
          </section>

          <section style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 12, marginTop: 10 }}>
            <h3 style={{ marginTop: 0 }}>Draw Timeline</h3>
            {timeline.length === 0 ? (
              <p>No timeline events available for this draw yet.</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {timeline.map((event, index) => (
                  <li key={`${event.label}-${index}`}>
                    <b>{new Date(event.at).toLocaleString()}</b> — {event.label} — {event.detail}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </PortalPage>
  );
}
