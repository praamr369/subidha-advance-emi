"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";

import AmendmentSafetyNotice from "@/components/amendments/SafetyNotice";
import AmendmentValueFields from "@/components/amendments/AmendmentValueFields";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ActionButton from "@/components/ui/ActionButton";
import { DetailPanel } from "@/components/ui/operations";
import { buildRequestedValues, validateRequestedValues } from "@/services/amendment-fields";
import {
  AMENDMENT_TYPES,
  createAdminAmendment,
  type AmendmentRequesterRole,
  type AmendmentType,
} from "@/services/amendments";
import { getSubscription } from "@/services/subscriptions";
import type { SubscriptionRecord } from "@/services/subscriptions";
import { formatCurrency } from "@/lib/formatters";

export default function AmendSubscriptionPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const resolvedParams = use(params);
  const subscriptionId = Number(resolvedParams.id);

  const [subscription, setSubscription] = useState<SubscriptionRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [requestedRole, setRequestedRole] = useState<AmendmentRequesterRole>("CUSTOMER");
  const [amendmentType, setAmendmentType] = useState<AmendmentType>("ADDRESS_CHANGE");
  const [reason, setReason] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const data = await getSubscription(subscriptionId);
        setSubscription(data);
      } catch (err) {
        setFetchError(err instanceof Error ? err.message : "Failed to load subscription details.");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [subscriptionId]);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      if (!subscription) throw new Error("Subscription not loaded.");
      if (!reason.trim()) throw new Error("Reason is required.");
      
      const fieldError = validateRequestedValues(amendmentType, fieldValues);
      if (fieldError) throw new Error(fieldError);
      
      const created = await createAdminAmendment({
        contract_type: subscription.plan_type === "RENT" || subscription.plan_type === "LEASE" ? "RENT_LEASE" : "EMI_SUBSCRIPTION",
        subscription: subscription.plan_type === "RENT" || subscription.plan_type === "LEASE" ? null : subscriptionId,
        rent_lease_contract: subscription.plan_type === "RENT" || subscription.plan_type === "LEASE" ? subscriptionId : null,
        amendment_type: amendmentType,
        requested_values: buildRequestedValues(amendmentType, fieldValues),
        reason: reason.trim(),
        requested_role: requestedRole,
        admin_note: adminNote.trim(),
        metadata: { ui_phase: "PHASE_10A_ADMIN_CREATE", source_record_mutation: false },
      });
      
      router.push(`/admin/contract-amendments/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create amendment request.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <ERPPageShell eyebrow="Subscriptions" title="Amend Contract">
        <div className="flex h-32 items-center justify-center">
          <div className="text-sm text-muted-foreground">Loading subscription details...</div>
        </div>
      </ERPPageShell>
    );
  }

  if (fetchError || !subscription) {
    return (
      <ERPPageShell eyebrow="Subscriptions" title="Amend Contract">
        <ERPErrorState title="Error Loading Subscription" description={fetchError || "Subscription not found"} />
        <div className="mt-4">
          <ActionButton variant="outline" href="/admin/subscriptions">Back to Subscriptions</ActionButton>
        </div>
      </ERPPageShell>
    );
  }

  return (
    <ERPPageShell
      eyebrow={`Subscription ${subscription.subscription_number}`}
      title="Amend Contract"
      subtitle="Create an auditable amendment request for this specific contract. This does not mutate the source contract immediately."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Subscriptions", href: "/admin/subscriptions" },
        { label: subscription.subscription_number || String(subscriptionId), href: `/admin/subscriptions/${subscriptionId}` },
        { label: "Amend" },
      ]}
      statusBadge={{ label: "Request only", tone: "warning" }}
    >
      <div className="space-y-5">
        <AmendmentSafetyNotice />
        {error ? <ERPErrorState title="Unable to create amendment" description={error} /> : null}
        
        <DetailPanel title="Contract Context">
          <div className="grid gap-4 md:grid-cols-3 text-sm">
            <div>
              <div className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Customer</div>
              <div className="mt-1 font-medium">{subscription.customer_name}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Product Context</div>
              <div className="mt-1 font-medium">{subscription.product_name}</div>
              <div className="text-xs text-muted-foreground">{subscription.plan_type || "EMI"} Plan</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Value</div>
              <div className="mt-1 font-medium">{formatCurrency(Number(subscription.total_amount) || 0)}</div>
            </div>
          </div>
        </DetailPanel>

        <DetailPanel
          title="Amendment Details"
          description="Specify the changes required for this contract."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium">
              Requested by role
              <select
                className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3"
                value={requestedRole}
                onChange={(event) => setRequestedRole(event.target.value as AmendmentRequesterRole)}
              >
                <option value="CUSTOMER">Customer</option>
                <option value="PARTNER">Partner</option>
              </select>
            </label>
            
            <label className="text-sm font-medium">
              Amendment type
              <select
                className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3"
                value={amendmentType}
                onChange={(event) => {
                  setAmendmentType(event.target.value as AmendmentType);
                  setFieldValues({});
                }}
              >
                {AMENDMENT_TYPES.map((row) => (
                  <option key={row.value} value={row.value}>
                    {row.label}
                  </option>
                ))}
              </select>
            </label>
            
            <label className="text-sm font-medium md:col-span-2">
              Reason
              <input
                className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Why is this amendment required?"
              />
            </label>
          </div>
          
          <AmendmentValueFields
            amendmentType={amendmentType}
            values={fieldValues}
            onChange={(key, value) => setFieldValues((prev) => ({ ...prev, [key]: value }))}
          />
          
          <label className="mt-4 block text-sm font-medium">
            Admin note
            <textarea
              className="mt-2 min-h-24 w-full rounded-xl border border-border bg-background p-3 text-sm"
              value={adminNote}
              onChange={(event) => setAdminNote(event.target.value)}
              placeholder="Optional internal review note"
            />
          </label>
          
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            No generic apply path is created here. Preview-only workflows remain preview-only, and product recontract execution remains evidence-gated.
          </div>
          
          <div className="mt-4 flex flex-wrap gap-3">
            <ActionButton onClick={() => void submit()} disabled={submitting}>
              {submitting ? "Creating..." : "Create amendment"}
            </ActionButton>
            <ActionButton href={`/admin/subscriptions/${subscriptionId}`} variant="outline">
              Cancel
            </ActionButton>
          </div>
        </DetailPanel>
      </div>
    </ERPPageShell>
  );
}
