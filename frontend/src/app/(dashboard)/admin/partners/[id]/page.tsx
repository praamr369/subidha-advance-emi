"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { DetailItem, WorkspaceSection } from "@/components/ui/workspace";
import { apiFetch } from "@/lib/api";

type PartnerDetail = {
  id: number;
  username: string;
  email?: string;
  phone?: string;
  is_active: boolean;
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Failed to load partner detail.";
}

export default function AdminPartnerDetailPage() {
  const params = useParams<{ id: string }>();
  const partnerId = Number(params?.id || 0);
  const [partner, setPartner] = useState<PartnerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newUsername, setNewUsername] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadPage = useCallback(async () => {
    if (!partnerId) return;
    setLoading(true);
    try {
      const payload = await apiFetch<PartnerDetail>(`/admin/partners/${partnerId}/`);
      setPartner(payload);
      setError(null);
    } catch (err) {
      setPartner(null);
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [partnerId]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const handleChangeUsername = useCallback(async () => {
    if (!partner?.id) return;
    setSaving(true);
    setNotice(null);
    try {
      await apiFetch(`/admin/users/${partner.id}/username/`, {
        method: "PATCH",
        body: {
          new_username: newUsername.trim(),
          reason: reason.trim(),
        },
      });
      setNotice("Username updated. Partner must sign in again.");
      setNewUsername("");
      setReason("");
      await loadPage();
    } catch (err) {
      setNotice(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }, [loadPage, newUsername, partner?.id, reason]);

  return (
    <PortalPage
      title={partner ? `Partner #${partner.id}` : "Partner Detail"}
      subtitle="Admin access handoff for partner login identity."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Partners", href: "/admin/partners" },
        { label: partner ? partner.username : "Detail" },
      ]}
      actions={[
        { href: "/admin/partners", label: "Back to Partners", variant: "secondary" },
      ]}
      stats={[
        { label: "Partner ID", value: partner?.id ?? "—" },
        { label: "Status", value: partner?.is_active ? "ACTIVE" : "INACTIVE" },
      ]}
      statusBadge={{ label: "Access Handoff", tone: "info" }}
    >
      {loading ? <LoadingBlock label="Loading partner detail..." /> : null}
      {!loading && error ? (
        <ErrorState title="Unable to load partner detail" description={error} onRetry={() => void loadPage()} />
      ) : null}
      {!loading && partner ? (
        <div className="space-y-6">
          <WorkspaceSection
            title="Access Handoff"
            description="This changes login username only. Customer/partner IDs and financial history remain unchanged."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <DetailItem label="Current Username" value={partner.username} />
              <DetailItem label="Email" value={partner.email || "—"} />
              <DetailItem label="Phone" value={partner.phone || "—"} />
              <DetailItem label="Login" value={<Link href="/login">Open Login</Link>} />
            </div>
            {notice ? (
              <div className="mt-4 rounded-xl border border-border bg-muted px-4 py-3 text-sm text-foreground">
                {notice}
              </div>
            ) : null}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input
                value={newUsername}
                onChange={(event) => setNewUsername(event.target.value)}
                placeholder="New username"
                className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
              />
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Reason (required)"
                className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
              />
              <button
                type="button"
                onClick={() => void handleChangeUsername()}
                disabled={saving || !newUsername.trim() || !reason.trim()}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
              >
                {saving ? "Changing username..." : "Change Username"}
              </button>
            </div>
          </WorkspaceSection>
        </div>
      ) : null}
    </PortalPage>
  );
}
