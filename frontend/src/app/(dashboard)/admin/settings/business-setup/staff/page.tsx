"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import BusinessSetupLinks from "@/components/admin/business-setup/BusinessSetupLinks";
import PageHeader from "@/components/ui/PageHeader";
import { getSetupChecklist, type SetupChecklist } from "@/services/business-setup";

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function StaffSetupGuidePage() {
  const [checklist, setChecklist] = useState<SetupChecklist | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getSetupChecklist()
      .then((payload) => {
        if (!mounted) return;
        setChecklist(payload);
        setError(null);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load setup status.");
      });
    return () => {
      mounted = false;
    };
  }, []);

  const cashiers = toNumber(checklist?.counts?.cashier_users_active);
  const partners = toNumber(checklist?.counts?.partner_users_active);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff & roles"
        description="Create internal users (ADMIN/CASHIER) and configure operational assignments in the existing modules. This setup flow stays compatible with current role guards and daily operations."
      />
      <BusinessSetupLinks />

      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <section className="grid gap-5 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="text-sm font-medium text-muted-foreground">Active cashiers</div>
          <div className="mt-2 text-3xl font-semibold text-foreground">{checklist ? cashiers : "—"}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="text-sm font-medium text-muted-foreground">Active partners</div>
          <div className="mt-2 text-3xl font-semibold text-foreground">{checklist ? partners : "—"}</div>
          <div className="mt-2 text-xs text-muted-foreground">Optional unless you use partner collections.</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="text-sm font-medium text-muted-foreground">Next action</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/admin/settings/users" className="rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
              Open Internal Users
            </Link>
            <Link href="/admin/settings/users/create" className="rounded-xl border border-border px-3 py-2 text-sm font-medium text-foreground">
              Create User
            </Link>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="text-base font-semibold text-foreground">Recommended role readiness</div>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>At least one CASHIER user for daily collections.</li>
          <li>Keep ADMIN users limited and controlled (audit and least privilege).</li>
          <li>Assign counters to cashiers in the Counters module as needed.</li>
        </ul>
      </section>
    </div>
  );
}

