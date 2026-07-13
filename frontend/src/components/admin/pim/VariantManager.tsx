"use client";
import { useState } from "react";
import { Plus, Trash2, Check, X } from "lucide-react";
import { pimService, type PimVariant, type PimCategoryAttribute } from "@/services/pim";
import { formatRupee } from "@/lib/utils/currency";

interface Props {
  productId: number;
  variants: PimVariant[];
  variantAttributes: PimCategoryAttribute[];
  onRefresh: () => void;
}

interface NewVariantForm {
  sku: string;
  price: string;
  cost_price: string;
  quantity_on_hand: string;
  reorder_level: string;
  attrValues: Record<number, string>;
}

const emptyForm = (): NewVariantForm => ({
  sku: "",
  price: "",
  cost_price: "",
  quantity_on_hand: "0",
  reorder_level: "0",
  attrValues: {},
});

export default function VariantManager({ productId, variants, variantAttributes, onRefresh }: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<NewVariantForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [editingStock, setEditingStock] = useState<number | null>(null);
  const [stockQty, setStockQty] = useState("");
  const [editingPrice, setEditingPrice] = useState<number | null>(null);
  const [priceVal, setPriceVal] = useState("");

  const handleCreate = async () => {
    if (!form.sku || !form.price) return;
    setSaving(true);
    try {
      await pimService.createVariant(productId, {
        sku: form.sku,
        price: form.price,
        cost_price: form.cost_price || undefined,
        quantity_on_hand: Number(form.quantity_on_hand),
        reorder_level: Number(form.reorder_level),
        attribute_values: Object.entries(form.attrValues)
          .filter(([, v]) => v)
          .map(([attrId, v]) => ({ attribute: Number(attrId), value_text: v })),
      });
      setForm(emptyForm());
      setShowAdd(false);
      onRefresh();
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this variant?")) return;
    await pimService.deleteVariant(id);
    onRefresh();
  };

  const handleStockSave = async (id: number) => {
    await pimService.updateStock(id, Number(stockQty));
    setEditingStock(null);
    onRefresh();
  };

  const handlePriceSave = async (id: number) => {
    await pimService.updateVariantPricing(id, priceVal);
    setEditingPrice(null);
    onRefresh();
  };

  return (
    <div className="space-y-3">
      {/* Variant list */}
      {variants.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6 border rounded-lg">No variants yet. Add the first SKU.</p>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">SKU</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Attributes</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Price</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Stock</th>
                <th className="px-3 py-2 text-center font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {variants.map((v) => (
                <tr key={v.id} className={`hover:bg-muted/30 ${v.is_low_stock ? "bg-red-50/30" : ""}`}>
                  <td className="px-3 py-2 font-mono text-xs">{v.sku}</td>
                  <td className="px-3 py-2 text-muted-foreground text-xs">{v.variant_label || "—"}</td>

                  {/* Price inline edit */}
                  <td className="px-3 py-2 text-right">
                    {editingPrice === v.id ? (
                      <div className="flex items-center justify-end gap-1">
                        <input
                          type="number"
                          className="w-24 rounded border px-2 py-1 text-xs"
                          value={priceVal}
                          onChange={(e) => setPriceVal(e.target.value)}
                        />
                        <button onClick={() => handlePriceSave(v.id)} className="text-green-600 hover:text-green-700"><Check className="h-3.5 w-3.5" /></button>
                        <button onClick={() => setEditingPrice(null)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    ) : (
                      <button
                        className="tabular-nums hover:underline"
                        onClick={() => { setEditingPrice(v.id); setPriceVal(v.price); }}
                      >
                        {formatRupee(Number(v.price))}
                      </button>
                    )}
                  </td>

                  {/* Stock inline edit */}
                  <td className="px-3 py-2 text-right">
                    {editingStock === v.id ? (
                      <div className="flex items-center justify-end gap-1">
                        <input
                          type="number"
                          className="w-20 rounded border px-2 py-1 text-xs"
                          value={stockQty}
                          onChange={(e) => setStockQty(e.target.value)}
                        />
                        <button onClick={() => handleStockSave(v.id)} className="text-green-600 hover:text-green-700"><Check className="h-3.5 w-3.5" /></button>
                        <button onClick={() => setEditingStock(null)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    ) : (
                      <button
                        className={`tabular-nums hover:underline ${v.is_low_stock ? "text-red-600 font-medium" : ""}`}
                        onClick={() => { setEditingStock(v.id); setStockQty(String(v.quantity_on_hand)); }}
                      >
                        {v.quantity_on_hand}
                        {v.is_low_stock && <span className="ml-1 text-xs">(low)</span>}
                      </button>
                    )}
                  </td>

                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => handleDelete(v.id)}
                      className="text-destructive hover:text-destructive/80"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add variant form */}
      {showAdd ? (
        <div className="rounded-lg border p-4 space-y-4 bg-muted/20">
          <h4 className="text-sm font-semibold">New Variant (SKU)</h4>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <label className="text-xs font-medium">SKU *</label>
              <input
                className="mt-1 w-full rounded-md border px-3 py-1.5 text-sm bg-background"
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                placeholder="PROD-001-RED"
              />
            </div>
            <div>
              <label className="text-xs font-medium">Selling Price *</label>
              <input
                type="number"
                className="mt-1 w-full rounded-md border px-3 py-1.5 text-sm bg-background"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="text-xs font-medium">Cost Price</label>
              <input
                type="number"
                className="mt-1 w-full rounded-md border px-3 py-1.5 text-sm bg-background"
                value={form.cost_price}
                onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="text-xs font-medium">Opening Stock</label>
              <input
                type="number"
                className="mt-1 w-full rounded-md border px-3 py-1.5 text-sm bg-background"
                value={form.quantity_on_hand}
                onChange={(e) => setForm({ ...form, quantity_on_hand: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-medium">Reorder Level</label>
              <input
                type="number"
                className="mt-1 w-full rounded-md border px-3 py-1.5 text-sm bg-background"
                value={form.reorder_level}
                onChange={(e) => setForm({ ...form, reorder_level: e.target.value })}
              />
            </div>
          </div>

          {variantAttributes.length > 0 && (
            <div>
              <p className="text-xs font-medium mb-2 text-muted-foreground">Variant Attributes</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {variantAttributes.map((attr) => (
                  <div key={attr.id}>
                    <label className="text-xs font-medium">{attr.name}</label>
                    {attr.data_type === "CHOICE" ? (
                      <select
                        className="mt-1 w-full rounded-md border px-3 py-1.5 text-sm bg-background"
                        value={form.attrValues[attr.id] ?? ""}
                        onChange={(e) =>
                          setForm({ ...form, attrValues: { ...form.attrValues, [attr.id]: e.target.value } })
                        }
                      >
                        <option value="">— Select —</option>
                        {attr.options.map((opt) => (
                          <option key={opt.id} value={opt.value}>{opt.display_name}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        className="mt-1 w-full rounded-md border px-3 py-1.5 text-sm bg-background"
                        value={form.attrValues[attr.id] ?? ""}
                        onChange={(e) =>
                          setForm({ ...form, attrValues: { ...form.attrValues, [attr.id]: e.target.value } })
                        }
                        placeholder={attr.name}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={saving || !form.sku || !form.price}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {saving ? "Saving…" : "Add Variant"}
            </button>
            <button
              onClick={() => { setShowAdd(false); setForm(emptyForm()); }}
              className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-dashed px-4 py-2 text-sm text-muted-foreground hover:bg-muted w-full justify-center"
        >
          <Plus className="h-4 w-4" /> Add Variant / SKU
        </button>
      )}
    </div>
  );
}
