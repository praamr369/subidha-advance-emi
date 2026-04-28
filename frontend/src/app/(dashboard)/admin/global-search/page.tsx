"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Search } from "lucide-react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";
import { searchAdminGlobal, type AdminGlobalSearchResult } from "@/services/admin-erp";

export default function AdminGlobalSearchPage() {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [results, setResults] = useState<AdminGlobalSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const normalized = submittedQuery.trim();
    if (normalized.length < 2) {
      return;
    }

    let active = true;
    void searchAdminGlobal(normalized)
      .then((payload) => {
        if (!active) return;
        setResults(payload.results);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Global search failed.");
        setResults([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [submittedQuery]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = query.trim();
    if (normalized.length < 2) {
      setSubmittedQuery("");
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setSubmittedQuery(normalized);
  }

  return (
    <PortalPage
      title="Global Search"
      subtitle="Search operational records through the existing admin global search API."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Global Search" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <div className="space-y-5">
        <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <label htmlFor="admin-global-search" className="text-sm font-semibold text-foreground">
            Search business records
          </label>
          <div className="mt-2 flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="admin-global-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Customer, phone, subscription, payment, delivery"
                className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-sm outline-none transition focus:border-ring"
              />
            </div>
            <button
              type="submit"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-95"
            >
              Search
            </button>
          </div>
        </form>

        {loading ? <LoadingBlock label="Searching admin records..." /> : null}
        {!loading && error ? <ErrorState title="Search failed" description={error} /> : null}
        {!loading && !error && submittedQuery.trim().length >= 2 && results.length === 0 ? (
          <EmptyState title="No records found" description="Try a customer name, phone number, subscription number, or payment reference." />
        ) : null}
        {!loading && !error && results.length > 0 ? (
          <div className="grid gap-3">
            {results.map((result) => (
              <Link
                key={`${result.type}:${result.deep_link}:${result.title}`}
                href={result.deep_link}
                className="rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-[var(--surface-border-strong)] hover:bg-[var(--surface-muted)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground">{result.title}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{result.subtitle}</div>
                  </div>
                  <span className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                    {result.type}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </PortalPage>
  );
}
