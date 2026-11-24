"use client";
import { useEffect, useState } from "react";
import { Plus, Trash2, AlertCircle, Pencil, Copy, Package, RefreshCw, DollarSign } from "lucide-react";
import {
  getProductRelationships,
  addProductRelationship,
  removeProductRelationship,
  updateProductRelationship,
  searchProductsForAttachment,
  createProduct,
  updateProduct,
  cloneProductRelationships,
  getProductVariants,
  type ProductRelationship,
  type ProductRelationshipType,
  type ProductSearchResult,
  type ProductVariantCompact,
  RELATIONSHIP_TYPE_LABELS,
} from "@/services/products";
import { listVendorsLite, type VendorLite } from "@/services/inventory";

interface RelatedProductsSectionProps {
  productId: number;
  productName: string;
  saving: boolean;
  lockedParentVariantSku?: string;
}

const ITEM_TYPE_DEFAULT_CATEGORIES: Record<string, { category: string; subcategories: string[] }> = {
  ACCESSORY: {
    category: "Accessories & Hardware",
    subcategories: [
      "Plywood & Boards",
      "Bed Hardware & Side Rails",
      "Legs, Caps & Buffers",
      "Fasteners, Nuts & Bolts",
      "Handles, Locks & Hinges",
      "Foam, Cushions & Fabric",
      "Mirrors & Glass Tops",
    ],
  },
  RAW_MATERIAL: {
    category: "Raw Materials & Lumber",
    subcategories: [
      "Steel Pipes & Tubes",
      "Timber & Wood Planks",
      "Sheet Metal & Mesh",
      "Paints, Powder & Polish",
      "Adhesives & Chemicals",
    ],
  },
  SERVICE: {
    category: "Services & Labor",
    subcategories: [
      "Installation & Assembly",
      "Transport & Delivery",
      "Maintenance & Repair",
    ],
  },
  ADD_ON: {
    category: "Accessories & Hardware",
    subcategories: [
      "Plywood & Boards",
      "Bed Hardware & Side Rails",
      "Foam, Cushions & Fabric",
      "Mirrors & Glass Tops",
    ],
  },
};

export default function RelatedProductsSection({
  productId,
  saving,
  lockedParentVariantSku,
}: RelatedProductsSectionProps) {
  const [relationships, setRelationships] = useState<ProductRelationship[]>([]);
  const [variants, setVariants] = useState<ProductVariantCompact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // General add mode
  const [addMode, setAddMode] = useState<"SEARCH" | "CREATE" | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProductSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductSearchResult | null>(null);
  
  // Relationship form state
  const [relationshipType, setRelationshipType] = useState<ProductRelationshipType>("ACCESSORY");
  const [quantity, setQuantity] = useState("1");
  const [isPriceIncluded, setIsPriceIncluded] = useState(true);
  const [chargeMode, setChargeMode] = useState<"FREE" | "CHARGEABLE">("FREE");
  const [salePrice, setSalePrice] = useState("0.00");
  const [sourcingType, setSourcingType] = useState<"SUPPLIED_WITH_PARENT" | "OUTSOURCED_SEPARATE" | "INTERNAL_STOCK">("SUPPLIED_WITH_PARENT");
  const [sourcingVendorId, setSourcingVendorId] = useState<number | "">("");
  const [isolationMode, setIsolationMode] = useState<"SHARED_POOL" | "DEDICATED_KIT">("SHARED_POOL");
  const [vendors, setVendors] = useState<VendorLite[]>([]);
  const [notes, setNotes] = useState("");
  const [selectedParentVariantId, setSelectedParentVariantId] = useState<number | "">("");
  const [selectedRelatedVariantId, setSelectedRelatedVariantId] = useState<number | "">("");
  const [relatedProductVariants, setRelatedProductVariants] = useState<ProductVariantCompact[]>([]);
  const [fetchingRelatedVariants, setFetchingRelatedVariants] = useState(false);
  const [adding, setAdding] = useState(false);

  // Create new product state
  const [newProdName, setNewProdName] = useState("");
  const [newProdPrice, setNewProdPrice] = useState("");
  const [newProdItemType, setNewProdItemType] = useState<string>("ACCESSORY");
  const [newProdSubcategory, setNewProdSubcategory] = useState<string>("Plywood & Boards");
  const [newProdParentVariantId, setNewProdParentVariantId] = useState<number | "">("");

  // Edit product state
  const [editingRel, setEditingRel] = useState<ProductRelationship | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editQuantity, setEditQuantity] = useState("1");
  const [editChargeMode, setEditChargeMode] = useState<"FREE" | "CHARGEABLE">("FREE");
  const [editSalePrice, setEditSalePrice] = useState("0.00");
  const [editSourcingType, setEditSourcingType] = useState<"SUPPLIED_WITH_PARENT" | "OUTSOURCED_SEPARATE" | "INTERNAL_STOCK">("SUPPLIED_WITH_PARENT");
  const [editSourcingVendorId, setEditSourcingVendorId] = useState<number | "">("");
  const [editIsolationMode, setEditIsolationMode] = useState<"SHARED_POOL" | "DEDICATED_KIT">("SHARED_POOL");
  const [savingEdit, setSavingEdit] = useState(false);

  // Remove state
  const [removing, setRemoving] = useState<number | null>(null);

  // Clone state
  const [cloneMode, setCloneMode] = useState(false);
  const [cloneSearch, setCloneSearch] = useState("");
  const [cloneResults, setCloneResults] = useState<ProductSearchResult[]>([]);
  const [cloning, setCloning] = useState(false);
  const [selectedTargets, setSelectedTargets] = useState<Set<number>>(new Set());

  useEffect(() => {
    listVendorsLite({ is_active: true, page_size: 200 })
      .then((res) => setVendors(res.results || []))
      .catch((err) => console.error("Failed to load vendors", err));
  }, []);

  useEffect(() => {
    loadRelationshipsAndVariants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  useEffect(() => {
    if (selectedProduct) {
      setFetchingRelatedVariants(true);
      getProductVariants(selectedProduct.id)
        .then(data => setRelatedProductVariants(data || []))
        .catch(err => console.error("Failed to fetch related variants", err))
        .finally(() => setFetchingRelatedVariants(false));
    } else {
      setRelatedProductVariants([]);
      setSelectedRelatedVariantId("");
    }
  }, [selectedProduct]);

  async function loadRelationshipsAndVariants() {
    setLoading(true);
    setError(null);
    try {
      const [relData, varData] = await Promise.all([
        getProductRelationships(productId),
        getProductVariants(productId)
      ]);
      setRelationships(relData || []);
      setVariants(varData || []);

      if (lockedParentVariantSku && varData) {
        const matchingVariant = varData.find(v => v.sku === lockedParentVariantSku);
        if (matchingVariant) {
          setSelectedParentVariantId(matchingVariant.id);
          setNewProdParentVariantId(matchingVariant.id);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch() {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const results = await searchProductsForAttachment(searchQuery, productId);
      setSearchResults(results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  function resetForms() {
    setAddMode(null);
    setSearchQuery("");
    setSearchResults([]);
    setSelectedProduct(null);
    setQuantity("1");
    setIsPriceIncluded(true);
    setChargeMode("FREE");
    setSalePrice("0.00");
    setSourcingType("SUPPLIED_WITH_PARENT");
    setSourcingVendorId("");
    setIsolationMode("SHARED_POOL");
    setNotes("");
    setNewProdName("");
    setNewProdPrice("");
    setNewProdItemType("ACCESSORY");
    setNewProdSubcategory("Plywood & Boards");
    setRelationshipType("ACCESSORY");
    setCloneMode(false);
    setCloneSearch("");
    setCloneResults([]);
    setSelectedTargets(new Set());
  }

  async function handleAddExisting() {
    if (!selectedProduct || adding) return;
    setAdding(true);
    setError(null);
    try {
      const parentSku = selectedParentVariantId === "" ? undefined : variants.find(v => v.id === selectedParentVariantId)?.sku;
      const relatedSku = selectedRelatedVariantId === "" ? undefined : relatedProductVariants.find(v => v.id === selectedRelatedVariantId)?.sku;

      await addProductRelationship(
        productId,
        selectedProduct.id,
        relationshipType,
        Number(quantity) || 1,
        notes,
        chargeMode === "FREE",
        parentSku,
        relatedSku,
        {
          chargeMode,
          salePrice: chargeMode === "CHARGEABLE" ? salePrice : "0.00",
          sourcingType,
          sourcingVendorId: sourcingType === "OUTSOURCED_SEPARATE" && sourcingVendorId !== "" ? Number(sourcingVendorId) : null,
          isolationMode,
        }
      );
      await loadRelationshipsAndVariants();
      resetForms();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add relationship.");
    } finally {
      setAdding(false);
    }
  }

  async function handleCreateNewAndAttach() {
    if (!newProdName.trim() || adding) return;
    setAdding(true);
    setError(null);
    try {
      const typeConfig = ITEM_TYPE_DEFAULT_CATEGORIES[newProdItemType];
      const categoryName = typeConfig?.category || "Accessories & Hardware";
      const subcategoryName = newProdSubcategory || typeConfig?.subcategories?.[0] || "";

      // 1. Create the product
      const newProduct = await createProduct({
        name: newProdName.trim(),
        base_price: newProdPrice.trim() || "0.00",
        category: categoryName,
        subcategory: subcategoryName,
        item_type: newProdItemType,
        stock_type: newProdItemType === "SERVICE" ? "NON_STOCK" : "STOCK_ITEM",
        is_active: true,
        is_emi_enabled: false,
        is_rent_enabled: false,
        is_lease_enabled: false,
        is_direct_sale_enabled: true,
        plan_type_default: "EMI",
      });

      const parentSku = newProdParentVariantId === "" ? undefined : variants.find(v => v.id === newProdParentVariantId)?.sku;

      // 2. Attach it
      await addProductRelationship(
        productId,
        newProduct.id,
        newProdItemType as ProductRelationshipType,
        Number(quantity) || 1,
        notes,
        chargeMode === "FREE",
        parentSku,
        undefined,
        {
          chargeMode,
          salePrice: chargeMode === "CHARGEABLE" ? salePrice : "0.00",
          sourcingType,
          sourcingVendorId: sourcingType === "OUTSOURCED_SEPARATE" && sourcingVendorId !== "" ? Number(sourcingVendorId) : null,
          isolationMode,
        }
      );
      
      await loadRelationshipsAndVariants();
      resetForms();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || (typeof err === 'string' ? err : "Failed to create and attach product."));
    } finally {
      setAdding(false);
    }
  }

  async function handleRemoveRelationship(relationshipId: number) {
    if (!confirm("Remove this relationship?")) return;
    setRemoving(relationshipId);
    try {
      await removeProductRelationship(productId, relationshipId);
      await loadRelationshipsAndVariants();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove relationship.");
    } finally {
      setRemoving(null);
    }
  }

  function openEdit(rel: ProductRelationship) {
    setEditingRel(rel);
    setEditName(rel.related_product_name);
    setEditPrice(""); // Quick edit for name/code
    setEditQuantity(String(rel.quantity || "1"));
    setEditChargeMode(rel.charge_mode || (rel.is_price_included_in_parent ? "FREE" : "CHARGEABLE"));
    setEditSalePrice(rel.sale_price ? String(rel.sale_price) : "0.00");
    setEditSourcingType(rel.sourcing_type || "SUPPLIED_WITH_PARENT");
    setEditSourcingVendorId(rel.sourcing_vendor || "");
    setEditIsolationMode(rel.isolation_mode || "SHARED_POOL");
  }

  async function saveEdit() {
    if (!editingRel || savingEdit) return;
    setSavingEdit(true);
    setError(null);
    try {
      if (editName.trim() || editPrice.trim()) {
        await updateProduct(editingRel.related_product, {
          ...(editName.trim() ? { name: editName.trim() } : {}),
          ...(editPrice.trim() ? { base_price: editPrice.trim() } : {})
        });
      }
      const newQty = Number(editQuantity);
      await updateProductRelationship(productId, editingRel.id, {
        quantity: !isNaN(newQty) && newQty > 0 ? newQty : Number(editingRel.quantity),
        charge_mode: editChargeMode,
        is_price_included_in_parent: editChargeMode === "FREE",
        sale_price: editChargeMode === "CHARGEABLE" ? editSalePrice : "0.00",
        sourcing_type: editSourcingType,
        sourcing_vendor_id: editSourcingType === "OUTSOURCED_SEPARATE" && editSourcingVendorId !== "" ? Number(editSourcingVendorId) : null,
        isolation_mode: editIsolationMode,
      });
      await loadRelationshipsAndVariants();
      setEditingRel(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update product.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleCloneSearch() {
    if (!cloneSearch.trim()) return;
    setCloning(true);
    setError(null);
    try {
      const results = await searchProductsForAttachment(cloneSearch, productId);
      setCloneResults(results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
      setCloneResults([]);
    } finally {
      setCloning(false);
    }
  }

  function toggleTarget(id: number) {
    const next = new Set(selectedTargets);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedTargets(next);
  }

  async function performClone() {
    if (selectedTargets.size === 0 || cloning) return;
    setCloning(true);
    setError(null);
    try {
      const res = await cloneProductRelationships(productId, Array.from(selectedTargets));
      alert(res.cloned_records_count > 0 ? `Successfully copied ${res.cloned_records_count} attachments to selected product(s).` : "No new attachments were copied (maybe they were already attached).");
      setCloneMode(false);
      setSelectedTargets(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clone.");
    } finally {
      setCloning(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="text-center py-6 text-sm text-muted-foreground">Loading related products…</div>
      ) : (
        <>
          {/* Existing relationships */}
          {relationships.filter(r => 
            !lockedParentVariantSku || 
            r.parent_variant === selectedParentVariantId || 
            r.parent_variant_sku === lockedParentVariantSku ||
            (!r.parent_variant && !r.parent_variant_sku)
          ).length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase">Attached products ({relationships.filter(r => !lockedParentVariantSku || r.parent_variant === selectedParentVariantId || r.parent_variant_sku === lockedParentVariantSku || (!r.parent_variant && !r.parent_variant_sku)).length})</p>
              <div className="space-y-2">
                {relationships.filter(r => 
                  !lockedParentVariantSku || 
                  r.parent_variant === selectedParentVariantId || 
                  r.parent_variant_sku === lockedParentVariantSku ||
                  (!r.parent_variant && !r.parent_variant_sku)
                ).map((rel) => (
                  <div
                    key={rel.id}
                    className="flex flex-col sm:flex-row items-start justify-between rounded-lg border border-border bg-muted/30 p-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-foreground">{rel.related_product_name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span>{rel.related_product_code} · {rel.related_product_item_type}</span>
                        {(rel.related_product_category || rel.related_product_subcategory) && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 text-[11px] font-medium">
                            {rel.related_product_category} {rel.related_product_subcategory ? `· ${rel.related_product_subcategory}` : ""}
                          </span>
                        )}
                      </div>
                      {(rel.parent_variant_name || rel.parent_variant_sku || rel.related_variant_name || rel.related_variant_sku) && (
                        <div className="flex items-center gap-1.5 mt-1.5 text-xs">
                          {(rel.parent_variant_name || rel.parent_variant_sku) && (
                            <span className="inline-block px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium border border-blue-200">
                              For: {rel.parent_variant_name || rel.parent_variant_sku}
                            </span>
                          )}
                          {(rel.parent_variant_name || rel.parent_variant_sku) && (rel.related_variant_name || rel.related_variant_sku) && (
                            <span className="text-muted-foreground">→</span>
                          )}
                          {(rel.related_variant_name || rel.related_variant_sku) && (
                            <span className="inline-block px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium border border-green-200">
                              Spec: {rel.related_variant_name || rel.related_variant_sku}
                            </span>
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-2 mt-1.5 text-xs flex-wrap">
                        <span className="inline-block px-2 py-0.5 rounded bg-primary/10 text-primary font-medium">
                          {RELATIONSHIP_TYPE_LABELS[rel.relationship_type as ProductRelationshipType]}
                        </span>
                        <span className="text-muted-foreground font-mono">Qty: {rel.quantity}</span>
                        {/* Customer Pricing Mode */}
                        {(rel.charge_mode === "FREE" || rel.is_price_included_in_parent) ? (
                          <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 font-medium">
                            ✨ Free / Included with Product
                          </span>
                        ) : (
                          <span className="text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5 font-medium">
                            💰 Paid Add-on (₹{Number(rel.sale_price || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })})
                          </span>
                        )}
                        {/* Vendor Sourcing Mode */}
                        {rel.sourcing_type === "OUTSOURCED_SEPARATE" ? (
                          <span className="text-amber-800 bg-amber-50 border border-amber-300 rounded px-1.5 py-0.5 font-medium">
                            🔄 Outsourced: {rel.sourcing_vendor_name || "Separate Vendor"}
                          </span>
                        ) : (
                          <span className="text-teal-800 bg-teal-50 border border-teal-200 rounded px-1.5 py-0.5 font-medium">
                            📦 Supplied with Parent by Vendor
                          </span>
                        )}
                        {/* Hybrid Stock Isolation Mode */}
                        {rel.isolation_mode === "DEDICATED_KIT" ? (
                          <span className="text-purple-800 bg-purple-50 border border-purple-200 rounded px-1.5 py-0.5 font-medium">
                            🔒 Dedicated Kit Reserve
                          </span>
                        ) : (
                          <span className="text-slate-700 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 font-medium">
                            📦 Shared Stock Pool
                          </span>
                        )}
                        {/* Live Stock Badge */}
                        {rel.related_product_stock_status && (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium text-[11px] border ${
                            rel.related_product_stock_status === "IN_STOCK"
                              ? "bg-green-50 text-green-700 border-green-200"
                              : rel.related_product_stock_status === "LOW_STOCK"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-red-50 text-red-700 border-red-200"
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              rel.related_product_stock_status === "IN_STOCK" ? "bg-green-500" : rel.related_product_stock_status === "LOW_STOCK" ? "bg-amber-500" : "bg-red-500"
                            }`} />
                            {rel.related_product_stock_status === "IN_STOCK"
                              ? `Stock: ${parseFloat(rel.related_product_stock_qty || "0").toFixed(1)}`
                              : rel.related_product_stock_status === "LOW_STOCK"
                              ? `Low Stock: ${parseFloat(rel.related_product_stock_qty || "0").toFixed(1)}`
                              : "Out of Stock"}
                          </span>
                        )}
                        {/* Unit & Total Cost */}
                        {Number(rel.related_product_unit_cost || 0) > 0 && (
                          <span className="text-slate-600 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 text-[11px]">
                            Avg Cost: ₹{Number(rel.related_product_unit_cost).toLocaleString("en-IN", { minimumFractionDigits: 2 })} (Total: ₹{Number(rel.related_product_total_cost || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })})
                          </span>
                        )}
                      </div>
                      {rel.notes && (
                        <div className="text-xs text-muted-foreground mt-1">{rel.notes}</div>
                      )}
                    </div>
                    <div className="mt-3 sm:mt-0 ml-0 sm:ml-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(rel)}
                        disabled={removing === rel.id || saving}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-foreground transition hover:bg-muted disabled:opacity-50"
                        title="Edit Product Details"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveRelationship(rel.id)}
                        disabled={removing === rel.id || saving}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 transition hover:bg-red-100 disabled:opacity-50"
                        title="Remove Attachment"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Edit Modal (Inline) */}
          {editingRel && (
            <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
               <div className="flex justify-between items-center mb-2">
                 <h4 className="font-semibold text-sm">Quick Edit: {editingRel.related_product_code}</h4>
               </div>
               <div className="grid gap-4 md:grid-cols-3">
                 <label className="text-xs font-medium text-muted-foreground">
                    Name
                    <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring" />
                 </label>
                 <label className="text-xs font-medium text-muted-foreground">
                    Quantity per Unit
                    <input type="number" step="0.01" min="0.001" value={editQuantity} onChange={e => setEditQuantity(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring font-mono" />
                 </label>
                 <label className="text-xs font-medium text-muted-foreground">
                    New Base Price (optional)
                    <input type="number" step="0.01" value={editPrice} onChange={e => setEditPrice(e.target.value)} placeholder="Leave blank to keep existing" className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring" />
                 </label>
               </div>

               <div className="grid gap-4 md:grid-cols-2 pt-2 border-t border-border/60">
                 <div>
                   <label className="text-xs font-medium text-muted-foreground block mb-1">
                     Customer Pricing (SFEMI / Direct Sale / Rent / Lease)
                   </label>
                   <div className="flex gap-2">
                     <button
                       type="button"
                       onClick={() => setEditChargeMode("FREE")}
                       className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium border transition-colors ${
                         editChargeMode === "FREE"
                           ? "bg-emerald-50 border-emerald-300 text-emerald-800 font-semibold"
                           : "bg-background border-border text-muted-foreground hover:bg-muted"
                       }`}
                     >
                       ✨ Free (Included)
                     </button>
                     <button
                       type="button"
                       onClick={() => setEditChargeMode("CHARGEABLE")}
                       className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium border transition-colors ${
                         editChargeMode === "CHARGEABLE"
                           ? "bg-blue-50 border-blue-300 text-blue-800 font-semibold"
                           : "bg-background border-border text-muted-foreground hover:bg-muted"
                       }`}
                     >
                       💰 Paid Add-on
                     </button>
                   </div>
                   {editChargeMode === "CHARGEABLE" && (
                     <div className="mt-2">
                       <label className="text-[11px] font-medium text-muted-foreground block mb-0.5">Add-on Sale Price (₹)</label>
                       <input
                         type="number"
                         step="0.01"
                         min="0"
                         value={editSalePrice}
                         onChange={(e) => setEditSalePrice(e.target.value)}
                         className="h-8 w-full rounded-lg border border-border bg-background px-2.5 text-xs outline-none focus:border-ring font-mono"
                         placeholder="e.g. 500.00"
                       />
                     </div>
                   )}
                 </div>

                 <div>
                   <label className="text-xs font-medium text-muted-foreground block mb-1">
                     Supplier Sourcing (Purchases & Inventory)
                   </label>
                   <div className="flex gap-2">
                     <button
                       type="button"
                       onClick={() => {
                         setEditSourcingType("SUPPLIED_WITH_PARENT");
                         setEditSourcingVendorId("");
                       }}
                       className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium border transition-colors ${
                         editSourcingType === "SUPPLIED_WITH_PARENT"
                           ? "bg-teal-50 border-teal-300 text-teal-800 font-semibold"
                           : "bg-background border-border text-muted-foreground hover:bg-muted"
                       }`}
                     >
                       📦 Supplied with Parent
                     </button>
                     <button
                       type="button"
                       onClick={() => setEditSourcingType("OUTSOURCED_SEPARATE")}
                       className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium border transition-colors ${
                         editSourcingType === "OUTSOURCED_SEPARATE"
                           ? "bg-amber-50 border-amber-300 text-amber-800 font-semibold"
                           : "bg-background border-border text-muted-foreground hover:bg-muted"
                       }`}
                     >
                       🔄 Outsourced Vendor
                     </button>
                   </div>
                   {editSourcingType === "OUTSOURCED_SEPARATE" && (
                     <div className="mt-2">
                       <label className="text-[11px] font-medium text-muted-foreground block mb-0.5">Select Outsourced Vendor</label>
                       <select
                         value={editSourcingVendorId}
                         onChange={(e) => setEditSourcingVendorId(e.target.value === "" ? "" : Number(e.target.value))}
                         className="h-8 w-full rounded-lg border border-border bg-background px-2.5 text-xs outline-none focus:border-ring"
                       >
                         <option value="">— Select Vendor —</option>
                         {vendors.map((v) => (
                           <option key={v.id} value={v.id}>{v.name}</option>
                         ))}
                       </select>
                     </div>
                   )}
                 </div>

                 <div>
                   <label className="text-xs font-medium text-muted-foreground block mb-1">
                     Inventory Valuation & Stock Mode (Hybrid Isolation)
                   </label>
                   <div className="flex gap-2">
                     <button
                       type="button"
                       onClick={() => setEditIsolationMode("SHARED_POOL")}
                       className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium border transition-colors ${
                         editIsolationMode === "SHARED_POOL"
                           ? "bg-slate-100 border-slate-300 text-slate-800 font-semibold dark:bg-slate-800 dark:text-slate-200"
                           : "bg-background border-border text-muted-foreground hover:bg-muted"
                       }`}
                     >
                       📦 Shared Stock Pool
                     </button>
                     <button
                       type="button"
                       onClick={() => setEditIsolationMode("DEDICATED_KIT")}
                       className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium border transition-colors ${
                         editIsolationMode === "DEDICATED_KIT"
                           ? "bg-purple-50 border-purple-300 text-purple-800 font-semibold dark:bg-purple-900/30 dark:text-purple-300"
                           : "bg-background border-border text-muted-foreground hover:bg-muted"
                       }`}
                     >
                       🔒 Dedicated Kit Reserve
                     </button>
                   </div>
                 </div>
               </div>
               <div className="flex gap-2 pt-2">
                  <button type="button" onClick={saveEdit} disabled={savingEdit} className="flex-1 inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:opacity-60">
                    {savingEdit ? "Saving…" : "Save Changes"}
                  </button>
                  <button type="button" onClick={() => setEditingRel(null)} disabled={savingEdit} className="inline-flex h-9 items-center justify-center rounded-lg border border-border px-3 text-sm font-medium transition hover:bg-muted disabled:opacity-60">
                    Cancel
                  </button>
               </div>
            </div>
          )}

          {/* Add form */}
          {!addMode && !editingRel && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAddMode("SEARCH")}
                disabled={saving}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm font-medium transition hover:bg-muted disabled:opacity-60"
              >
                <Plus className="h-4 w-4" />
                Attach Existing
              </button>
              <button
                type="button"
                onClick={() => setAddMode("CREATE")}
                disabled={saving}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 text-sm font-medium text-primary transition hover:bg-primary/10 disabled:opacity-60"
              >
                <Plus className="h-4 w-4" />
                Create New
              </button>
              {relationships.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCloneMode(true)}
                  disabled={saving}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 text-sm font-medium text-blue-700 transition hover:bg-blue-100 ml-auto disabled:opacity-60"
                  title="Copy these attachments to another product"
                >
                  <Copy className="h-4 w-4" />
                  Copy to other Products
                </button>
              )}
            </div>
          )}

          {/* Clone Modal (Inline) */}
          {cloneMode && (
            <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex justify-between items-center mb-1">
                <h4 className="text-sm font-medium">Apply Setup to Other Products</h4>
                <button type="button" onClick={resetForms} className="text-xs text-muted-foreground hover:underline">Cancel</button>
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                This will bulk-copy all {relationships.length} attachments from this product to the products you select below.
              </p>
              
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={cloneSearch}
                    onChange={(e) => setCloneSearch(e.target.value)}
                    onKeyUp={(e) => {
                      if (e.key === "Enter") handleCloneSearch();
                    }}
                    placeholder="Search for target product (e.g. bed without storage)…"
                    disabled={cloning}
                    className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-ring disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={handleCloneSearch}
                    disabled={cloning || !cloneSearch.trim()}
                    className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:opacity-60"
                  >
                    Search
                  </button>
                </div>
              </div>

              {cloneResults.length > 0 && (
                <div className="space-y-2 mt-2">
                  <p className="text-xs font-medium text-muted-foreground">Select targets:</p>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {cloneResults.map(p => (
                      <label key={p.id} className="flex items-center gap-3 p-2 hover:bg-muted/50 rounded-lg cursor-pointer border border-transparent hover:border-border transition-colors">
                        <input
                          type="checkbox"
                          checked={selectedTargets.has(p.id)}
                          onChange={() => toggleTarget(p.id)}
                          disabled={cloning}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-medium text-foreground truncate">{p.name}</span>
                          <span className="text-xs text-muted-foreground truncate">{p.product_code}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={performClone}
                      disabled={cloning || selectedTargets.size === 0}
                      className="w-full inline-flex h-9 items-center justify-center rounded-lg bg-blue-600 px-3 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
                    >
                      {cloning ? "Copying..." : `Apply to ${selectedTargets.size} product(s)`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {addMode === "SEARCH" && (
            <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex justify-between items-center mb-1">
                <h4 className="text-sm font-medium">Search & Attach Existing Product</h4>
                <button type="button" onClick={resetForms} className="text-xs text-muted-foreground hover:underline">Cancel</button>
              </div>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyUp={(e) => {
                      if (e.key === "Enter") handleSearch();
                    }}
                    placeholder="Product name, code, or SKU…"
                    disabled={searching}
                    className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-ring disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={handleSearch}
                    disabled={searching || !searchQuery.trim()}
                    className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:opacity-60"
                  >
                    {searching ? "Searching…" : "Search"}
                  </button>
                </div>
              </div>

              {searchResults.length > 0 && !selectedProduct && (
                <div className="overflow-y-auto rounded-xl border-2 border-slate-300 dark:border-slate-600 shadow-[0_4px_16px_rgba(0,0,0,0.18)]" style={{ maxHeight: "14rem" }}>
                  <div className="rounded-xl overflow-hidden bg-white dark:bg-slate-900 divide-y-2 divide-slate-100 dark:divide-slate-800">
                    {searchResults.map((product) => (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => setSelectedProduct(product)}
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
                      >
                        <span className="shrink-0 rounded border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] font-bold text-slate-700 dark:text-slate-200">{product.product_code}</span>
                        <span className="flex-1 text-[13px] font-semibold text-slate-900 dark:text-slate-100">{product.name}</span>
                        {(product.category || product.subcategory) && (
                          <span className="shrink-0 rounded border border-purple-200 bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">
                            {product.subcategory || product.category}
                          </span>
                        )}
                        <span className="shrink-0 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">{product.item_type}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selectedProduct && (
                <div className="space-y-3 pt-2">
                  <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                    <div className="font-medium text-sm text-green-900">{selectedProduct.name}</div>
                    <div className="text-xs text-green-800 mt-1">{selectedProduct.product_code}</div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    {variants.length > 0 && (
                      <label className="text-xs font-medium text-muted-foreground">
                        Applies to Variant (Parent Product)
                        <select
                          value={selectedParentVariantId}
                          onChange={(e) => setSelectedParentVariantId(e.target.value === "" ? "" : Number(e.target.value))}
                          className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring disabled:opacity-50"
                          disabled={!!lockedParentVariantSku}
                        >
                          <option value="">All Variants (Base Product)</option>
                          {variants.map(v => (
                            <option key={v.id} value={v.id}>{v.variant_label}</option>
                          ))}
                        </select>
                      </label>
                    )}
                    {relatedProductVariants.length > 0 && (
                      <label className="text-xs font-medium text-muted-foreground">
                        Attach Specific Variant (Related Item)
                        <select
                          value={selectedRelatedVariantId}
                          onChange={(e) => setSelectedRelatedVariantId(e.target.value === "" ? "" : Number(e.target.value))}
                          className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring"
                          disabled={fetchingRelatedVariants}
                        >
                          <option value="">Base Product (Any Variant)</option>
                          {relatedProductVariants.map(v => (
                            <option key={v.id} value={v.id}>{v.variant_label}</option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 mt-3">
                    <label className="text-xs font-medium text-muted-foreground">
                      Relationship type
                      <select
                        value={relationshipType}
                        onChange={(e) => setRelationshipType(e.target.value as ProductRelationshipType)}
                        className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring"
                      >
                        <option value="ACCESSORY">Accessory</option>
                        <option value="RAW_MATERIAL">Raw Material</option>
                        <option value="SERVICE">Service</option>
                        <option value="ADD_ON">Add-on</option>
                      </select>
                    </label>
                    <label className="text-xs font-medium text-muted-foreground">
                      Quantity
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring"
                      />
                    </label>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 pt-2 border-t border-border/60 mt-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1">
                        Customer Pricing (SFEMI / Direct Sale / Rent / Lease)
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setChargeMode("FREE");
                            setIsPriceIncluded(true);
                          }}
                          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium border transition-colors ${
                            chargeMode === "FREE"
                              ? "bg-emerald-50 border-emerald-300 text-emerald-800 font-semibold"
                              : "bg-background border-border text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          ✨ Free (Included)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setChargeMode("CHARGEABLE");
                            setIsPriceIncluded(false);
                          }}
                          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium border transition-colors ${
                            chargeMode === "CHARGEABLE"
                              ? "bg-blue-50 border-blue-300 text-blue-800 font-semibold"
                              : "bg-background border-border text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          💰 Paid Add-on
                        </button>
                      </div>
                      {chargeMode === "CHARGEABLE" && (
                        <div className="mt-2">
                          <label className="text-[11px] font-medium text-muted-foreground block mb-0.5">Add-on Sale Price (₹)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={salePrice}
                            onChange={(e) => setSalePrice(e.target.value)}
                            className="h-8 w-full rounded-lg border border-border bg-background px-2.5 text-xs outline-none focus:border-ring font-mono"
                            placeholder="e.g. 500.00"
                          />
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1">
                        Supplier Sourcing (Purchases & Inventory)
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSourcingType("SUPPLIED_WITH_PARENT");
                            setSourcingVendorId("");
                          }}
                          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium border transition-colors ${
                            sourcingType === "SUPPLIED_WITH_PARENT"
                              ? "bg-teal-50 border-teal-300 text-teal-800 font-semibold"
                              : "bg-background border-border text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          📦 Supplied with Parent
                        </button>
                        <button
                          type="button"
                          onClick={() => setSourcingType("OUTSOURCED_SEPARATE")}
                          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium border transition-colors ${
                            sourcingType === "OUTSOURCED_SEPARATE"
                              ? "bg-amber-50 border-amber-300 text-amber-800 font-semibold"
                              : "bg-background border-border text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          🔄 Outsourced Vendor
                        </button>
                      </div>
                      {sourcingType === "OUTSOURCED_SEPARATE" && (
                        <div className="mt-2">
                          <label className="text-[11px] font-medium text-muted-foreground block mb-0.5">Select Outsourced Vendor</label>
                          <select
                            value={sourcingVendorId}
                            onChange={(e) => setSourcingVendorId(e.target.value === "" ? "" : Number(e.target.value))}
                            className="h-8 w-full rounded-lg border border-border bg-background px-2.5 text-xs outline-none focus:border-ring"
                          >
                            <option value="">— Select Vendor —</option>
                            {vendors.map((v) => (
                              <option key={v.id} value={v.id}>{v.name}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1">
                        Inventory Valuation & Stock Mode (Hybrid Isolation)
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setIsolationMode("SHARED_POOL")}
                          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium border transition-colors ${
                            isolationMode === "SHARED_POOL"
                              ? "bg-slate-100 border-slate-300 text-slate-800 font-semibold dark:bg-slate-800 dark:text-slate-200"
                              : "bg-background border-border text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          📦 Shared Stock Pool
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsolationMode("DEDICATED_KIT")}
                          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium border transition-colors ${
                            isolationMode === "DEDICATED_KIT"
                              ? "bg-purple-50 border-purple-300 text-purple-800 font-semibold dark:bg-purple-900/30 dark:text-purple-300"
                              : "bg-background border-border text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          🔒 Dedicated Kit Reserve
                        </button>
                      </div>
                    </div>
                  </div>

                  <label className="text-xs font-medium text-muted-foreground block">
                    Notes (optional)
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="e.g., specific variant, installation instructions…"
                      rows={2}
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring resize-none"
                    />
                  </label>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleAddExisting}
                      disabled={adding}
                      className="flex-1 inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:opacity-60"
                    >
                      {adding ? "Adding…" : "Add Relationship"}
                    </button>
                    <button
                      type="button"
                      onClick={resetForms}
                      disabled={adding}
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-border px-3 text-sm font-medium transition hover:bg-muted disabled:opacity-60"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {addMode === "CREATE" && (
            <div className="space-y-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
              <div className="flex justify-between items-center mb-1">
                <h4 className="text-sm font-medium text-primary">Create & Attach New Item</h4>
                <button type="button" onClick={resetForms} className="text-xs text-muted-foreground hover:underline">Cancel</button>
              </div>
              
              <div className="grid gap-4 md:grid-cols-2">
                {variants.length > 0 && (
                  <label className="text-xs font-medium text-muted-foreground block mb-1">
                    Applies to Variant (Parent Product)
                    <select
                      value={newProdParentVariantId}
                      onChange={(e) => setNewProdParentVariantId(e.target.value === "" ? "" : Number(e.target.value))}
                      className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring disabled:opacity-50"
                      disabled={!!lockedParentVariantSku}
                    >
                      <option value="">All Variants (Base Product)</option>
                      {variants.map(v => (
                        <option key={v.id} value={v.id}>{v.variant_label}</option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="text-xs font-medium text-foreground">
                  Item Type
                  <select
                    value={newProdItemType}
                    onChange={(e) => {
                      const val = e.target.value;
                      setNewProdItemType(val);
                      const def = ITEM_TYPE_DEFAULT_CATEGORIES[val]?.subcategories?.[0] || "";
                      setNewProdSubcategory(def);
                    }}
                    className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring"
                  >
                    <option value="ACCESSORY">Accessory</option>
                    <option value="RAW_MATERIAL">Raw Material</option>
                    <option value="SERVICE">Service</option>
                    <option value="ADD_ON">Add-on</option>
                  </select>
                </label>
                <label className="text-xs font-medium text-foreground">
                  Subcategory
                  <select
                    value={newProdSubcategory}
                    onChange={(e) => setNewProdSubcategory(e.target.value)}
                    className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring font-medium"
                  >
                    {(ITEM_TYPE_DEFAULT_CATEGORIES[newProdItemType]?.subcategories || []).map((sub) => (
                      <option key={sub} value={sub}>{sub}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-medium text-foreground">
                  Name
                  <input
                    type="text"
                    value={newProdName}
                    onChange={(e) => setNewProdName(e.target.value)}
                    placeholder="e.g. Standard Installation Service"
                    className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring"
                  />
                </label>
                <label className="text-xs font-medium text-foreground">
                  Base Price
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newProdPrice}
                    onChange={(e) => setNewProdPrice(e.target.value)}
                    placeholder="0.00"
                    className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring"
                  />
                </label>
                <label className="text-xs font-medium text-foreground">
                  Quantity to attach
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring"
                  />
                </label>
                <div className="grid gap-4 md:grid-cols-2 pt-2 border-t border-border/60 md:col-span-2">
                  <div>
                    <label className="text-xs font-medium text-foreground block mb-1">
                      Customer Pricing (SFEMI / Direct Sale / Rent / Lease)
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setChargeMode("FREE");
                          setIsPriceIncluded(true);
                        }}
                        className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium border transition-colors ${
                          chargeMode === "FREE"
                            ? "bg-emerald-50 border-emerald-300 text-emerald-800 font-semibold"
                            : "bg-background border-border text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        ✨ Free (Included)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setChargeMode("CHARGEABLE");
                          setIsPriceIncluded(false);
                        }}
                        className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium border transition-colors ${
                          chargeMode === "CHARGEABLE"
                            ? "bg-blue-50 border-blue-300 text-blue-800 font-semibold"
                            : "bg-background border-border text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        💰 Paid Add-on
                      </button>
                    </div>
                    {chargeMode === "CHARGEABLE" && (
                      <div className="mt-2">
                        <label className="text-[11px] font-medium text-muted-foreground block mb-0.5">Add-on Sale Price (₹)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={salePrice}
                          onChange={(e) => setSalePrice(e.target.value)}
                          className="h-8 w-full rounded-lg border border-border bg-background px-2.5 text-xs outline-none focus:border-ring font-mono"
                          placeholder="e.g. 500.00"
                        />
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-medium text-foreground block mb-1">
                      Supplier Sourcing (Purchases & Inventory)
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSourcingType("SUPPLIED_WITH_PARENT");
                          setSourcingVendorId("");
                        }}
                        className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium border transition-colors ${
                          sourcingType === "SUPPLIED_WITH_PARENT"
                            ? "bg-teal-50 border-teal-300 text-teal-800 font-semibold"
                            : "bg-background border-border text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        📦 Supplied with Parent
                      </button>
                      <button
                        type="button"
                        onClick={() => setSourcingType("OUTSOURCED_SEPARATE")}
                        className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium border transition-colors ${
                          sourcingType === "OUTSOURCED_SEPARATE"
                            ? "bg-amber-50 border-amber-300 text-amber-800 font-semibold"
                            : "bg-background border-border text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        🔄 Outsourced Vendor
                      </button>
                    </div>
                    {sourcingType === "OUTSOURCED_SEPARATE" && (
                      <div className="mt-2">
                        <label className="text-[11px] font-medium text-muted-foreground block mb-0.5">Select Outsourced Vendor</label>
                        <select
                          value={sourcingVendorId}
                          onChange={(e) => setSourcingVendorId(e.target.value === "" ? "" : Number(e.target.value))}
                          className="h-8 w-full rounded-lg border border-border bg-background px-2.5 text-xs outline-none focus:border-ring"
                        >
                          <option value="">— Select Vendor —</option>
                          {vendors.map((v) => (
                            <option key={v.id} value={v.id}>{v.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">
                      Inventory Valuation & Stock Mode (Hybrid Isolation)
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setIsolationMode("SHARED_POOL")}
                        className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium border transition-colors ${
                          isolationMode === "SHARED_POOL"
                            ? "bg-slate-100 border-slate-300 text-slate-800 font-semibold dark:bg-slate-800 dark:text-slate-200"
                            : "bg-background border-border text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        📦 Shared Stock Pool
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsolationMode("DEDICATED_KIT")}
                        className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium border transition-colors ${
                          isolationMode === "DEDICATED_KIT"
                            ? "bg-purple-50 border-purple-300 text-purple-800 font-semibold dark:bg-purple-900/30 dark:text-purple-300"
                            : "bg-background border-border text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        🔒 Dedicated Kit Reserve
                      </button>
                    </div>
                  </div>
                </div>
                <label className="text-xs font-medium text-foreground md:col-span-2">
                  Notes (optional)
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g., installation instructions…"
                    rows={2}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring resize-none"
                  />
                </label>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleCreateNewAndAttach}
                  disabled={adding || !newProdName.trim()}
                  className="flex-1 inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:opacity-60"
                >
                  {adding ? "Creating…" : "Create & Attach"}
                </button>
                <button
                  type="button"
                  onClick={resetForms}
                  disabled={adding}
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-border px-3 text-sm font-medium transition hover:bg-muted disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
