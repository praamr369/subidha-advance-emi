"use client";

import { useState, type FormEvent } from "react";
import { ShieldCheck, ShieldAlert, Search } from "lucide-react";

import PublicPageShell from "@/components/public/PublicPageShell";
import {
  getPublicLuckyDrawVerification,
  getPublicLuckyDrawSummary,
  type PublicLuckyDrawVerification,
  type PublicLuckyDrawSummary,
} from "@/services/public";

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1 border-b border-border/60 py-3 sm:flex-row sm:items-start sm:justify-between">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <span
        className={`text-sm text-foreground sm:max-w-[60%] sm:text-right ${
          mono ? "break-all font-mono text-xs" : ""
        }`}
      >
        {value ?? "—"}
      </span>
    </div>
  );
}

export default function PublicLuckyDrawVerifyPage() {
  const [drawId, setDrawId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verification, setVerification] =
    useState<PublicLuckyDrawVerification | null>(null);
  const [summary, setSummary] = useState<PublicLuckyDrawSummary | null>(null);
  const [searched, setSearched] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = drawId.trim();
    if (!id) {
      setError("Enter a draw ID to verify.");
      return;
    }
    setLoading(true);
    setError(null);
    setVerification(null);
    setSummary(null);
    try {
      const [verRes, sumRes] = await Promise.all([
        getPublicLuckyDrawVerification(id),
        getPublicLuckyDrawSummary(id).catch(() => ({ draw: null })),
      ]);
      setVerification(verRes.verification);
      setSummary(sumRes.draw);
      setSearched(true);
      if (!verRes.verification) {
        setError("No public verification record found for that draw ID.");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to verify this draw right now."
      );
    } finally {
      setLoading(false);
    }
  }

  const matches = verification?.hash_matches === true;

  return (
    <PublicPageShell
      title="Verify a Lucky Draw"
      subtitle="Independently confirm any revealed draw was provably fair. We publish a commitment hash before each draw and the random seed after — anyone can re-hash the seed and confirm it matches."
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Lucky Plan", href: "/lucky-plan" },
        { label: "Verify" },
      ]}
    >
      <div className="mx-auto w-full max-w-2xl space-y-8">
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-end"
        >
          <div className="flex-1 space-y-1">
            <label htmlFor="draw-id" className="text-sm font-medium text-foreground">
              Draw ID
            </label>
            <input
              id="draw-id"
              type="number"
              inputMode="numeric"
              value={drawId}
              onChange={(e) => setDrawId(e.target.value)}
              placeholder="e.g. 42"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Search className="h-4 w-4" />
            {loading ? "Verifying…" : "Verify"}
          </button>
        </form>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        )}

        {verification && (
          <div className="space-y-6">
            <div
              className={`flex items-center gap-3 rounded-2xl border p-5 ${
                matches
                  ? "border-green-200 bg-green-50"
                  : "border-amber-200 bg-amber-50"
              }`}
            >
              {matches ? (
                <ShieldCheck className="h-8 w-8 text-green-600" />
              ) : (
                <ShieldAlert className="h-8 w-8 text-amber-600" />
              )}
              <div>
                <p
                  className={`text-lg font-semibold ${
                    matches ? "text-green-800" : "text-amber-800"
                  }`}
                >
                  {matches
                    ? "Verified — commitment hash matches the revealed seed"
                    : verification.verification_message ||
                      "This draw has not been revealed or could not be verified yet."}
                </p>
                {verification.public_explanation && (
                  <p className="text-sm text-muted-foreground">
                    {verification.public_explanation}
                  </p>
                )}
              </div>
            </div>

            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <h2 className="mb-2 text-base font-semibold text-foreground">
                Draw details
              </h2>
              <Row label="Batch" value={verification.batch_code} />
              <Row label="Draw month" value={verification.draw_month} />
              <Row
                label="Eligible entries (snapshot)"
                value={verification.eligible_snapshot_count}
              />
              <Row
                label="Commitment published"
                value={verification.commitment_published_at}
              />
              <Row label="Revealed at" value={verification.reveal_timestamp} />
            </section>

            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <h2 className="mb-2 text-base font-semibold text-foreground">
                Cryptographic proof
              </h2>
              <Row
                label="Published commitment hash"
                value={verification.public_commit_hash}
                mono
              />
              <Row label="Revealed seed" value={verification.revealed_seed} mono />
              <Row
                label="Recalculated hash (SHA-256 of seed)"
                value={verification.recalculated_hash}
                mono
              />
              <Row
                label="Hashes match"
                value={
                  verification.hash_matches === null ||
                  verification.hash_matches === undefined
                    ? "Not revealed yet"
                    : verification.hash_matches
                    ? "Yes ✓"
                    : "No ✗"
                }
              />
            </section>

            {summary && (
              <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <h2 className="mb-2 text-base font-semibold text-foreground">
                  Winner (privacy-safe)
                </h2>
                <Row label="Winner" value={summary.winner_name_masked} />
                <Row label="Winning lucky number" value={summary.winner_lucky_number} />
                <Row label="EMIs waived" value={summary.waived_emi_count} />
              </section>
            )}
          </div>
        )}

        {!verification && !error && searched && !loading && (
          <p className="text-center text-sm text-muted-foreground">
            No verification record found.
          </p>
        )}
      </div>
    </PublicPageShell>
  );
}
