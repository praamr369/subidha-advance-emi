"use client";
import { useEffect, useState } from "react";
import { Plus, Trash2, AlertCircle } from "lucide-react";
import {
  getProductRelationships,
  addProductRelationship,
  removeProductRelationship,
  searchProductsForAttachment,
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

  // Add form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProductSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductSearchResult | null>(null);
  const [relationshipType, setRelationshipType] = useState<ProductRelationshipType>("ACCESSORY");
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");
  const [adding, setAdding] = useState(false);

  // Remove state
  const [removing, setRemoving] = useState<number | null>(null);

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

  async function handleAddRelationship() {
    if (!selectedProduct || adding) return;
    setAdding(true);
    setError(null);
    try {
      await addProductRelationship(
        productId,
        selectedProduct.id,
        relationshipType,
        Number(quantity) || 1,
        notes
      );
      await loadRelationships();
      setShowAddForm(false);
      setSearchQuery("");
      setSearchResults([]);
      setSelectedProduct(null);
      setQuantity("1");
      setNotes("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add relationship.");
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
                    className="flex items-start justify-between rounded-lg border border-border bg-muted/30 p-3"
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
                      </div>
                      {rel.notes && (
                        <div className="text-xs text-muted-foreground mt-1">{rel.notes}</div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveRelationship(rel.id)}
                      disabled={removing === rel.id || saving}
                      className="ml-3 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 transition hover:bg-red-100 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add form */}
          {!showAddForm && (
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              disabled={saving}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm font-medium transition hover:bg-muted disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              Attach Product
            </button>
          )}

          {showAddForm && (
            <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Search product to attach</label>
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
                <div className="space-y-3">
                  <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                    <div className="font-medium text-sm text-green-900">{selectedProduct.name}</div>
                    <div className="text-xs text-green-800 mt-1">{selectedProduct.product_code}</div>
                  </div>

                  <div className="grid gap-2">
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
                  </div>

                  <div className="grid gap-2 grid-cols-2">
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

                  <label className="text-xs font-medium text-muted-foreground">
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
                      onClick={handleAddRelationship}
                      disabled={adding}
                      className="flex-1 inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:opacity-60"
                    >
                      {adding ? "Adding…" : "Add Relationship"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddForm(false);
                        setSelectedProduct(null);
                        setSearchQuery("");
                        setSearchResults([]);
                        setQuantity("1");
                        setNotes("");
                      }}
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
        </>
      )}
    </div>
  );
}
