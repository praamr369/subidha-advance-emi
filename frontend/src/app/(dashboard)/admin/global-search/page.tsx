"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Search } from "lucide-react";

import ERPDataToolbar from "@/components/erp/ERPDataToolbar";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ActionButton from "@/components/ui/ActionButton";
import { GlobalSearchOperationalWorkspace } from "@/components/workspace/GlobalSearchOperationalWorkspace";
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
    <ERPPageShell
      eyebrow="Operations"
      title="Global Search"
      subtitle="Search operational records through the existing admin global search API."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Global Search" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <div className="space-y-5">
        <form onSubmit={handleSubmit}>
          <ERPDataToolbar
            left={
              <label htmlFor="admin-global-search" className="flex w-full flex-col gap-2">
                <span className="text-sm font-semibold text-foreground">Search business records</span>
                <div className="relative min-w-0">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    id="admin-global-search"
                    value={query}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
                    placeholder="Customer, phone, subscription, payment, delivery"
                    className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-sm outline-none transition focus:border-ring"
                  />
                </div>
              </label>
            }
            right={
              <ActionButton type="submit" variant="primary" className="h-11 px-4 text-sm">
                Search
              </ActionButton>
            }
          />
        </form>

        {loading ? <ERPLoadingState label="Searching admin records..." /> : null}
        {!loading && error ? <ERPErrorState title="Search failed" description={error} /> : null}
        {!loading && !error && submittedQuery.trim().length >= 2 && results.length === 0 ? (
          <ERPEmptyState
            title="No records found"
            description="Try a customer name, phone number, subscription number, or payment reference."
          />
        ) : null}
        {!loading && !error && results.length > 0 ? (
          <GlobalSearchOperationalWorkspace results={results} />
        ) : null}
      </div>
    </ERPPageShell>
  );
}
