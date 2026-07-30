"use client";
import { useEffect, useState } from "react";
import { Plus, Trash2, AlertCircle, Pencil, Copy } from "lucide-react";
import {
  getProductRelationships,
  addProductRelationship,
  removeProductRelationship,
  searchProductsForAttachment,
  createProduct,
  updateProduct,
  cloneProductRelationships,
  type ProductRelationship,
  type ProductRelationshipType,
  type ProductSearchResult,
  RELATIONSHIP_TYPE_LABELS,
} from "@/services/products";

interface RelatedProductsSectionProps {
  productId: number;
  productName: string;
  saving: boolean;
}

export default function RelatedProductsSection({
  productId,
  saving,
}: RelatedProductsSectionProps) {
  const [relationships, setRelationships] = useState<ProductRelationship[]>([]);
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
  const [notes, setNotes] = useState("");
  const [adding, setAdding] = useState(false);

  // Create new product state
  const [newProdName, setNewProdName] = useState("");
  const [newProdPrice, setNewProdPrice] = useState("");
  const [newProdItemType, setNewProdItemType] = useState<string>("ACCESSORY");

  // Edit product state
  const [editingRel, setEditingRel] = useState<ProductRelationship | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Remove state
  const [removing, setRemoving] = useState<number | null>(null);

  // Clone state
  const [cloneMode, setCloneMode] = useState(false);
  const [cloneSearch, setCloneSearch] = useState("");
  const [cloneResults, setCloneResults] = useState<ProductSearchResult[]>([]);
  const [cloning, setCloning] = useState(false);
  const [selectedTargets, setSelectedTargets] = useState<Set<number>>(new Set());

  // Load relationships on mount
  useEffect(() => {
    loadRelationships();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  async function loadRelationships() {
    setLoading(true);
    setError(null);
    try {
      const data = await getProductRelationships(productId);
      setRelationships(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load related products.");
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
    setNotes("");
    setNewProdName("");
    setNewProdPrice("");
    setNewProdItemType("ACCESSORY");
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
      await addProductRelationship(
        productId,
        selectedProduct.id,
        relationshipType,
        Number(quantity) || 1,
        notes,
        isPriceIncluded
      );
      await loadRelationships();
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
      // 1. Create the product
      const newProduct = await createProduct({
        name: newProdName.trim(),
        base_price: newProdPrice.trim() || "0.00",
        item_type: newProdItemType,
        stock_type: newProdItemType === "SERVICE" ? "NON_STOCK" : "STOCK_ITEM",
        is_active: true,
        is_emi_enabled: false,
        is_rent_enabled: false,
        is_lease_enabled: false,
        is_direct_sale_enabled: false,
        plan_type_default: "EMI",
      });

      // 2. Attach it
      await addProductRelationship(
        productId,
        newProduct.id,
        newProdItemType as ProductRelationshipType,
        Number(quantity) || 1,
        notes,
        isPriceIncluded
      );
      
      await loadRelationships();
      resetForms();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create and attach product.");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemoveRelationship(relationshipId: number) {
    if (!confirm("Remove this relationship?")) return;
    setRemoving(relationshipId);
    try {
      await removeProductRelationship(productId, relationshipId);
      await loadRelationships();
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
  }

  async function saveEdit() {
    if (!editingRel || savingEdit) return;
    setSavingEdit(true);
    setError(null);
    try {
      await updateProduct(editingRel.related_product, {
        name: editName.trim(),
        ...(editPrice.trim() ? { base_price: editPrice.trim() } : {})
      });
      await loadRelationships();
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
          {relationships.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase">Attached products ({relationships.length})</p>
              <div className="space-y-2">
                {relationships.map((rel) => (
                  <div
                    key={rel.id}
                    className="flex flex-col sm:flex-row items-start justify-between rounded-lg border border-border bg-muted/30 p-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-foreground">{rel.related_product_name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {rel.related_product_code} · {rel.related_product_item_type}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs">
                        <span className="inline-block px-2 py-1 rounded bg-primary/10 text-primary font-medium">
                          {RELATIONSHIP_TYPE_LABELS[rel.relationship_type as ProductRelationshipType]}
                        </span>
                        <span className="text-muted-foreground">Qty: {rel.quantity}</span>
                        {rel.is_price_included_in_parent ? (
                          <span className="text-emerald-600 bg-emerald-50 border border-emerald-100 rounded px-1.5 py-0.5">Included</span>
                        ) : (
                          <span className="text-orange-600 bg-orange-50 border border-orange-100 rounded px-1.5 py-0.5">Extra Cost</span>
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
               <div className="grid gap-4 md:grid-cols-2">
                 <label className="text-xs font-medium text-muted-foreground">
                    Name
                    <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring" />
                 </label>
                 <label className="text-xs font-medium text-muted-foreground">
                    New Base Price (optional)
                    <input type="number" step="0.01" value={editPrice} onChange={e => setEditPrice(e.target.value)} placeholder="Leave blank to keep existing" className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring" />
                 </label>
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
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{searchResults.length} results</p>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {searchResults.map((product) => (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => setSelectedProduct(product)}
                        className="w-full text-left px-3 py-2 rounded-lg border border-border hover:bg-muted text-sm transition"
                      >
                        <div className="font-medium">{product.name}</div>
                        <div className="text-xs text-muted-foreground">{product.product_code} · {product.item_type}</div>
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

                  <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground mt-3">
                    <input
                      type="checkbox"
                      checked={isPriceIncluded}
                      onChange={(e) => setIsPriceIncluded(e.target.checked)}
                      className="rounded border-border"
                    />
                    Cost is already included in base product price
                  </label>

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
                <label className="text-xs font-medium text-foreground">
                  Item Type
                  <select
                    value={newProdItemType}
                    onChange={(e) => setNewProdItemType(e.target.value)}
                    className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring"
                  >
                    <option value="ACCESSORY">Accessory</option>
                    <option value="RAW_MATERIAL">Raw Material</option>
                    <option value="SERVICE">Service</option>
                    <option value="ADD_ON">Add-on</option>
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
                <label className="flex items-center gap-2 text-xs font-medium text-foreground mt-8">
                  <input
                    type="checkbox"
                    checked={isPriceIncluded}
                    onChange={(e) => setIsPriceIncluded(e.target.checked)}
                    className="rounded border-border"
                  />
                  Cost is already included in base product price
                </label>
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
