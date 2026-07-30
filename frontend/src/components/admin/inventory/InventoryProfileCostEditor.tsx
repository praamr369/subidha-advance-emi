"use client";
import { useEffect, useState } from "react";
import { AlertCircle, Save, X } from "lucide-react";
import { request } from "@/services/api";

interface InventoryProfileCostEditorProps {
  productId: number;
  productName: string;
  itemType: string;
  onClose: () => void;
  onSave?: () => void;
}

interface CostData {
  purchase_unit_cost: string;
  standard_unit_cost: string;
  manufacturing_raw_material_cost: string;
  manufacturing_labour_cost: string;
  manufacturing_overhead_cost: string;
}

export default function InventoryProfileCostEditor({
  productId,
  productName,
  itemType,
  onClose,
  onSave,
}: InventoryProfileCostEditorProps) {
  const [costs, setCosts] = useState<CostData>({
    purchase_unit_cost: "",
    standard_unit_cost: "",
    manufacturing_raw_material_cost: "",
    manufacturing_labour_cost: "",
    manufacturing_overhead_cost: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadCosts();
  }, [productId]);

  async function loadCosts() {
    setLoading(true);
    setError(null);
    try {
      // Fetch the product to get inventory profile data
      const data = await request<any>(`/admin/products/${productId}/`);
      setCosts({
        purchase_unit_cost: data.purchase_unit_cost || "",
        standard_unit_cost: data.standard_unit_cost || "",
        manufacturing_raw_material_cost: data.manufacturing_raw_material_cost || "",
        manufacturing_labour_cost: data.manufacturing_labour_cost || "",
        manufacturing_overhead_cost: data.manufacturing_overhead_cost || "",
      });
    } catch (err) {
      // Costs might not be available yet, which is okay
      setError(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, number> = {};

      if (costs.purchase_unit_cost) payload.purchase_unit_cost = Number(costs.purchase_unit_cost);
      // standard_unit_cost is now synced from PIM and read-only

      // Manufacturing costs (only for finished goods)
      if (itemType === "FINISHED_GOOD") {
        if (costs.manufacturing_raw_material_cost) {
          payload.manufacturing_raw_material_cost = Number(costs.manufacturing_raw_material_cost);
        }
        if (costs.manufacturing_labour_cost) {
          payload.manufacturing_labour_cost = Number(costs.manufacturing_labour_cost);
        }
        if (costs.manufacturing_overhead_cost) {
          payload.manufacturing_overhead_cost = Number(costs.manufacturing_overhead_cost);
        }
      }

      await request(`/admin/products/${productId}/inventory-costs/`, {
        method: "PATCH",
        body: JSON.stringify(payload),
        retryCount: 0,
      });

      setMessage("Costs saved successfully.");
      onSave?.();
      setTimeout(onClose, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save costs.");
    } finally {
      setSaving(false);
    }
  }

  const isFinishedGood = itemType === "FINISHED_GOOD";
  const isRawMaterialOrAccessory = itemType === "RAW_MATERIAL" || itemType === "ACCESSORY";
  const totalMfgCost =
    (Number(costs.manufacturing_raw_material_cost) || 0) +
    (Number(costs.manufacturing_labour_cost) || 0) +
    (Number(costs.manufacturing_overhead_cost) || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-background shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">{productName}</h2>
            <p className="text-xs text-muted-foreground mt-1">Cost & Pricing Configuration</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 p-6">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {message && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              {message}
            </div>
          )}

          {loading ? (
            <div className="text-center py-8 text-sm text-muted-foreground">Loading costs…</div>
          ) : (
            <>
              {/* Purchase Cost Section */}
              {isRawMaterialOrAccessory && (
                <div className="space-y-4 border-b pb-6">
                  <div>
                    <h3 className="font-medium text-foreground">Purchase Cost</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Cost of purchasing this {itemType.toLowerCase().replace("_", " ")} from suppliers.
                    </p>
                  </div>

                  <label className="text-sm text-muted-foreground">
                    Purchase Price per Unit
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={costs.purchase_unit_cost}
                      onChange={(e) => setCosts({ ...costs, purchase_unit_cost: e.target.value })}
                      disabled={saving}
                      placeholder="0.00"
                      className="mt-2 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-ring disabled:opacity-60"
                    />
                  </label>
                </div>
              )}

              {/* Standard Cost Section */}
              <div className="space-y-4 border-b pb-6">
                <div>
                  <h3 className="font-medium text-foreground">Standard Cost</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    General cost basis for valuation and reporting.
                  </p>
                </div>

                <label className="text-sm text-muted-foreground">
                  <div className="flex items-center justify-between">
                    <span>Standard Unit Cost</span>
                    <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                      Synced from PIM Cost
                    </span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={costs.standard_unit_cost}
                    onChange={(e) => setCosts({ ...costs, standard_unit_cost: e.target.value })}
                    disabled={true}
                    readOnly={true}
                    placeholder="0.00"
                    className="mt-2 h-10 w-full rounded-lg border border-border bg-muted/50 px-3 text-sm outline-none cursor-not-allowed opacity-70"
                  />
                </label>
              </div>

              {/* Manufacturing Cost Section */}
              {isFinishedGood && (
                <div className="space-y-4">
                  <div>
                    <h3 className="font-medium text-foreground">Manufacturing Cost Estimate</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Track raw materials, labor, and overhead costs for this finished good.
                    </p>
                  </div>

                  <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
                    <label className="text-sm text-muted-foreground">
                      Raw Material Cost
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={costs.manufacturing_raw_material_cost}
                        onChange={(e) =>
                          setCosts({ ...costs, manufacturing_raw_material_cost: e.target.value })
                        }
                        disabled={saving}
                        placeholder="0.00"
                        className="mt-2 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-ring disabled:opacity-60"
                      />
                    </label>

                    <label className="text-sm text-muted-foreground">
                      Labour Cost
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={costs.manufacturing_labour_cost}
                        onChange={(e) =>
                          setCosts({ ...costs, manufacturing_labour_cost: e.target.value })
                        }
                        disabled={saving}
                        placeholder="0.00"
                        className="mt-2 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-ring disabled:opacity-60"
                      />
                    </label>

                    <label className="text-sm text-muted-foreground">
                      Overhead Cost
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={costs.manufacturing_overhead_cost}
                        onChange={(e) =>
                          setCosts({ ...costs, manufacturing_overhead_cost: e.target.value })
                        }
                        disabled={saving}
                        placeholder="0.00"
                        className="mt-2 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-ring disabled:opacity-60"
                      />
                    </label>
                  </div>

                  <div className="rounded-lg bg-primary/10 p-4">
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm font-medium text-foreground">Total Manufacturing Cost</span>
                      <span className="text-2xl font-semibold text-primary">
                        ₹{totalMfgCost.toFixed(2)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      This is the estimated cost to manufacture one unit of this product.
                    </p>
                  </div>
                </div>
              )}

              {/* Info Box */}
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <p className="text-xs text-blue-900">
                  <strong>Note:</strong> Purchase costs apply to raw materials & accessories. Manufacturing costs apply to
                  finished goods. Base price in the Product master is your selling price for subscriptions & direct sales.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex gap-2 border-t border-border bg-background px-6 py-4">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 inline-flex h-10 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium transition hover:bg-muted disabled:opacity-60"
          >
            Close
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="flex-1 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving…" : "Save Costs"}
          </button>
        </div>
      </div>
    </div>
  );
}
