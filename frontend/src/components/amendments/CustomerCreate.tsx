"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import AmendmentSafetyNotice from "@/components/amendments/SafetyNotice";
import AmendmentValueFields from "@/components/amendments/AmendmentValueFields";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ActionButton from "@/components/ui/ActionButton";
import { DetailPanel } from "@/components/ui/operations";
import { buildRequestedValues, validateRequestedValues } from "@/services/amendment-fields";
import { AMENDMENT_TYPES, createCustomerAmendment, type AmendmentContractType, type AmendmentType } from "@/services/amendments";
import { getCustomerSubscription, type CustomerContractItem, type CustomerSubscription } from "@/services/customer";
import { listCustomerSubscriptionsRegister } from "@/services/customer/paginated-subscriptions";

type Option = { id: number; label: string; planType: string };

type ItemActionState = {
  action: "KEEP" | "RETURN" | "CLOSE" | "UPGRADE";
  returnQuantity: number;
  newProductName: string;
  newProductCode: string;
  reason: string;
};

function optionFromSubscription(row: CustomerSubscription): Option {
  return {
    id: row.id,
    planType: (row.plan_type || "EMI").toUpperCase(),
    label: `${row.subscription_number || `SUB-${row.id}`} / ${row.product_name || "Contract"} / ${(row.plan_type || "EMI").toUpperCase()}`,
  };
}

export default function CustomerAmendmentCreate() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramSourceId = searchParams?.get("source_id") || searchParams?.get("subscription_id") || "";
  const paramContractType = (searchParams?.get("contract_type") || "").toUpperCase() as AmendmentContractType;
  const paramAmendmentType = (searchParams?.get("amendment_type") || "").toUpperCase() as AmendmentType;

  const [contracts, setContracts] = useState<Option[]>([]);
  const [loadingContracts, setLoadingContracts] = useState(true);
  const [contractType, setContractType] = useState<AmendmentContractType>(
    paramContractType === "RENT_LEASE" ? "RENT_LEASE" : "EMI_SUBSCRIPTION"
  );
  const [sourceId, setSourceId] = useState(paramSourceId);
  const [amendmentType, setAmendmentType] = useState<AmendmentType>(
    paramAmendmentType || "ADDRESS_CHANGE"
  );
  const [reason, setReason] = useState(
    paramAmendmentType === "TENURE_EXTENSION"
      ? "Requesting extension of active rental / lease contract tenure."
      : ""
  );
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Rent/Lease contract items state
  const [loadingItems, setLoadingItems] = useState(false);
  const [contractItems, setContractItems] = useState<CustomerContractItem[]>([]);
  const [itemActions, setItemActions] = useState<Record<number, ItemActionState>>({});

  useEffect(() => {
    let alive = true;
    async function loadContracts() {
      setLoadingContracts(true);
      try {
        const payload = await listCustomerSubscriptionsRegister({ pageSize: 100 });
        if (alive) {
          const list = payload.results.map(optionFromSubscription).filter((row) => ["EMI", "RENT", "LEASE"].includes(row.planType));
          setContracts(list);
          if (paramSourceId) {
            const matched = list.find((c) => String(c.id) === paramSourceId);
            if (matched) {
              setSourceId(String(matched.id));
              if (matched.planType === "RENT" || matched.planType === "LEASE") {
                setContractType("RENT_LEASE");
              } else {
                setContractType("EMI_SUBSCRIPTION");
              }
            }
          }
        }
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "Failed to load eligible contracts.");
      } finally {
        if (alive) setLoadingContracts(false);
      }
    }
    void loadContracts();
    return () => {
      alive = false;
    };
  }, [paramSourceId]);

  // Load contract items when a Rent/Lease contract is selected
  useEffect(() => {
    let alive = true;
    if (contractType !== "RENT_LEASE" || !sourceId) {
      setContractItems([]);
      setItemActions({});
      return;
    }

    async function loadContractItems() {
      setLoadingItems(true);
      try {
        const sub = await getCustomerSubscription(sourceId);
        if (alive) {
          const items = (sub.contract_items || []).filter((it) => it.status !== "RETURNED" && it.status !== "CLOSED");
          setContractItems(items);
          const initialActions: Record<number, ItemActionState> = {};
          items.forEach((it) => {
            initialActions[it.id] = {
              action: "KEEP",
              returnQuantity: it.quantity || 1,
              newProductName: "",
              newProductCode: "",
              reason: "",
            };
          });
          setItemActions(initialActions);
        }
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "Failed to load contract items.");
      } finally {
        if (alive) setLoadingItems(false);
      }
    }

    void loadContractItems();
    return () => {
      alive = false;
    };
  }, [contractType, sourceId]);

  const eligibleContracts = useMemo(
    () =>
      contracts.filter((row) =>
        contractType === "EMI_SUBSCRIPTION" ? row.planType === "EMI" : row.planType === "RENT" || row.planType === "LEASE"
      ),
    [contracts, contractType]
  );

  const isRentLeaseProductChange = contractType === "RENT_LEASE" && amendmentType === "PRODUCT_CHANGE";

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const id = Number(sourceId);
      if (!Number.isFinite(id) || id <= 0) throw new Error("Select a source contract.");
      if (!reason.trim()) throw new Error("Reason is required.");

      let requestedPayload: Record<string, unknown> = {};

      if (isRentLeaseProductChange) {
        // Collect active item actions
        const actionsToSend: Array<Record<string, unknown>> = [];
        let survivingCount = 0;

        contractItems.forEach((it) => {
          const state = itemActions[it.id];
          if (!state || state.action === "KEEP") {
            survivingCount += 1;
            return;
          }
          if (state.action === "RETURN") {
            const retQty = Number(state.returnQuantity);
            if (!Number.isFinite(retQty) || retQty < 1 || retQty > it.quantity) {
              throw new Error(`Return quantity for ${it.product_name} must be between 1 and ${it.quantity}.`);
            }
            if (retQty < it.quantity) {
              survivingCount += 1;
            }
            actionsToSend.push({
              contract_item_id: it.id,
              action: "RETURN",
              quantity: retQty,
              reason: state.reason || "Customer requested product return",
            });
          } else if (state.action === "CLOSE") {
            actionsToSend.push({
              contract_item_id: it.id,
              action: "CLOSE",
              reason: state.reason || "Customer requested line closure",
            });
          } else if (state.action === "UPGRADE") {
            if (!state.newProductName.trim()) {
              throw new Error(`Specify target upgraded product for ${it.product_name}.`);
            }
            survivingCount += 1;
            actionsToSend.push({
              contract_item_id: it.id,
              action: "UPGRADE",
              product_name: state.newProductName.trim(),
              product_code: state.newProductCode.trim() || undefined,
              reason: state.reason || "Customer requested product upgrade",
            });
          }
        });

        if (actionsToSend.length === 0) {
          throw new Error("Select at least one product action (Return, Close, or Upgrade) to submit an amendment.");
        }
        if (survivingCount === 0) {
          throw new Error("You cannot return or close all products. At least one furniture item must remain active on the contract.");
        }

        requestedPayload = {
          action: "MULTI_ACTION",
          item_actions: actionsToSend,
          note: reason.trim(),
        };
      } else {
        const fieldError = validateRequestedValues(amendmentType, fieldValues);
        if (fieldError) throw new Error(fieldError);
        requestedPayload = buildRequestedValues(amendmentType, fieldValues);
      }

      const created = await createCustomerAmendment({
        contract_type: contractType,
        subscription: contractType === "EMI_SUBSCRIPTION" ? id : null,
        rent_lease_contract: contractType === "RENT_LEASE" ? id : null,
        amendment_type: amendmentType,
        requested_values: requestedPayload,
        reason: reason.trim(),
        metadata: {
          ui_phase: "PHASE_2_REQUEST_ONLY",
          is_multi_product_amendment: isRentLeaseProductChange,
        },
      });
      router.push(`/customer/contract-amendments/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit amendment request.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ERPPageShell
      eyebrow="Customer amendment"
      title="New amendment request"
      subtitle="Submit a request for admin review. This page does not change your contract."
      breadcrumbs={[
        { label: "Customer", href: "/customer" },
        { label: "Contract Amendments", href: "/customer/contract-amendments" },
        { label: "New" },
      ]}
      statusBadge={{ label: "Request only", tone: "warning" }}
    >
      <div className="space-y-5">
        <AmendmentSafetyNotice />
        {error ? <ERPErrorState title="Unable to submit request" description={error} /> : null}
        <DetailPanel title="Request details" description="Select one of your eligible EMI or rent/lease contracts and describe the requested change.">
          {loadingContracts ? <ERPLoadingState label="Loading eligible contracts..." /> : null}
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium">
              Contract type
              <select
                className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3"
                value={contractType}
                onChange={(event) => {
                  setContractType(event.target.value as AmendmentContractType);
                  setSourceId("");
                }}
              >
                <option value="EMI_SUBSCRIPTION">EMI Subscription (Advance EMI)</option>
                <option value="RENT_LEASE">Rent / Lease (Furniture Contract)</option>
              </select>
            </label>
            <label className="text-sm font-medium">
              Source contract
              <select
                className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3"
                value={sourceId}
                onChange={(event) => setSourceId(event.target.value)}
              >
                <option value="">Select contract</option>
                {eligibleContracts.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.label}
                  </option>
                ))}
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
            <label className="text-sm font-medium">
              Reason
              <input
                className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Why is this amendment required?"
              />
            </label>
          </div>

          {/* Flexible Multi-product Rent/Lease item actions */}
          {isRentLeaseProductChange ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <div className="font-semibold text-sm text-foreground">Flexible Rent & Lease Product Amendment</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Your contract can hold multiple furniture products. You can return some items, close line items, or upgrade items below.
                  Admin will review and execute the amendment upon inspection.
                </p>
              </div>

              {loadingItems ? (
                <ERPLoadingState label="Loading furniture items on contract..." />
              ) : contractItems.length > 0 ? (
                <div className="space-y-3">
                  <div className="text-sm font-medium text-foreground">Contracted Furniture Assets</div>
                  <div className="divide-y divide-border rounded-xl border border-border bg-card">
                    {contractItems.map((item) => {
                      const state = itemActions[item.id] || {
                        action: "KEEP",
                        returnQuantity: item.quantity,
                        newProductName: "",
                        newProductCode: "",
                        reason: "",
                      };

                      return (
                        <div key={item.id} className="p-4 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <div className="font-medium text-sm text-foreground">{item.product_name}</div>
                              <div className="text-xs text-muted-foreground">
                                Current Qty: <span className="font-semibold">{item.quantity}</span>
                                {item.product_code ? ` · ${item.product_code}` : ""}
                                {item.monthly_amount ? ` · ₹${item.monthly_amount}/mo` : ""}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <label className="text-xs font-medium text-muted-foreground">Action:</label>
                              <select
                                className="h-9 rounded-lg border border-border bg-background px-2.5 text-xs font-medium"
                                value={state.action}
                                onChange={(e) => {
                                  const nextAction = e.target.value as ItemActionState["action"];
                                  setItemActions((prev) => ({
                                    ...prev,
                                    [item.id]: {
                                      ...state,
                                      action: nextAction,
                                    },
                                  }));
                                }}
                              >
                                <option value="KEEP">Keep item as is</option>
                                <option value="RETURN">Return product (Full or Partial)</option>
                                <option value="CLOSE">Close line item</option>
                                <option value="UPGRADE">Upgrade to different product</option>
                              </select>
                            </div>
                          </div>

                          {/* Extra fields if returning */}
                          {state.action === "RETURN" && (
                            <div className="grid gap-3 sm:grid-cols-2 rounded-lg bg-muted/30 p-3 text-xs">
                              <label className="font-medium">
                                Return Quantity (Max: {item.quantity})
                                <input
                                  type="number"
                                  min={1}
                                  max={item.quantity}
                                  className="mt-1 h-8 w-full rounded border border-border bg-background px-2"
                                  value={state.returnQuantity}
                                  onChange={(e) => {
                                    const qty = Math.min(Math.max(1, Number(e.target.value) || 1), item.quantity);
                                    setItemActions((prev) => ({
                                      ...prev,
                                      [item.id]: { ...state, returnQuantity: qty },
                                    }));
                                  }}
                                />
                              </label>
                              <label className="font-medium">
                                Reason for returning
                                <input
                                  type="text"
                                  className="mt-1 h-8 w-full rounded border border-border bg-background px-2"
                                  placeholder="e.g. No longer needed, shifting rooms"
                                  value={state.reason}
                                  onChange={(e) => {
                                    setItemActions((prev) => ({
                                      ...prev,
                                      [item.id]: { ...state, reason: e.target.value },
                                    }));
                                  }}
                                />
                              </label>
                            </div>
                          )}

                          {/* Extra fields if upgrading */}
                          {state.action === "UPGRADE" && (
                            <div className="grid gap-3 sm:grid-cols-2 rounded-lg bg-muted/30 p-3 text-xs">
                              <label className="font-medium">
                                Target / Upgraded Product Name
                                <input
                                  type="text"
                                  className="mt-1 h-8 w-full rounded border border-border bg-background px-2"
                                  placeholder="e.g. King Size Luxury Teak Bed"
                                  value={state.newProductName}
                                  onChange={(e) => {
                                    setItemActions((prev) => ({
                                      ...prev,
                                      [item.id]: { ...state, newProductName: e.target.value },
                                    }));
                                  }}
                                />
                              </label>
                              <label className="font-medium">
                                Upgrade notes / specs
                                <input
                                  type="text"
                                  className="mt-1 h-8 w-full rounded border border-border bg-background px-2"
                                  placeholder="Preferred color, model, or variant"
                                  value={state.reason}
                                  onChange={(e) => {
                                    setItemActions((prev) => ({
                                      ...prev,
                                      [item.id]: { ...state, reason: e.target.value },
                                    }));
                                  }}
                                />
                              </label>
                            </div>
                          )}

                          {/* Reason if closing */}
                          {state.action === "CLOSE" && (
                            <div className="rounded-lg bg-muted/30 p-3 text-xs">
                              <label className="font-medium">
                                Reason for closing line item
                                <input
                                  type="text"
                                  className="mt-1 h-8 w-full rounded border border-border bg-background px-2"
                                  placeholder="Reason to terminate this item"
                                  value={state.reason}
                                  onChange={(e) => {
                                    setItemActions((prev) => ({
                                      ...prev,
                                      [item.id]: { ...state, reason: e.target.value },
                                    }));
                                  }}
                                />
                              </label>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                  No active furniture items found on selected contract.
                </div>
              )}
            </div>
          ) : (
            <AmendmentValueFields
              amendmentType={amendmentType}
              values={fieldValues}
              onChange={(key, value) => setFieldValues((prev) => ({ ...prev, [key]: value }))}
            />
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <ActionButton onClick={() => void submit()} disabled={submitting}>
              {submitting ? "Submitting..." : "Submit request"}
            </ActionButton>
            <ActionButton href="/customer/contract-amendments" variant="outline">
              Cancel
            </ActionButton>
          </div>
        </DetailPanel>
      </div>
    </ERPPageShell>
  );
}
