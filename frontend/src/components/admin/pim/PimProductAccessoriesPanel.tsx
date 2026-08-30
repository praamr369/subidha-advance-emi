"use client";
import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, Search, Link2 } from "lucide-react";
import {
  listPimProductAccessories,
  addPimProductAccessory,
  removePimProductAccessory,
  type PimProductAccessory,
} from "@/services/product-pim";
import { pimService, type PimProduct } from "@/services/pim";
import ERPLoadingState from "@/components/erp/ERPLoadingState";

interface Props {
  productId: number;
}

export default function PimProductAccessoriesPanel({ productId }: Props) {
  const [accessories, setAccessories] = useState<PimProductAccessory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PimProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<PimProduct | null>(null);
  
  const [adding, setAdding] = useState(false);

  const loadAccessories = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await listPimProductAccessories(productId);
      setAccessories(data);
    } catch (err: any) {
      if (err.message && err.message.includes("not published")) {
        // It's expected if it's draft, just show empty
        setAccessories([]);
      } else {
        setError(err.message || "Failed to load accessories");
      }
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    loadAccessories();
  }, [loadAccessories]);

  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await pimService.getProducts({ search: searchQuery, is_published: true });
        setSearchResults(res.results.filter((r: PimProduct) => r.id !== productId));
      } catch (err) {
        // ignore
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery, productId]);

  const handleAdd = async () => {
    if (!selectedProduct) return;
    setAdding(true);
    try {
      await addPimProductAccessory(productId, selectedProduct.id);
      setSelectedProduct(null);
      setSearchQuery("");
      await loadAccessories();
    } catch (err: any) {
      alert(err.message || "Failed to add accessory");
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (id: number) => {
    if (!confirm("Remove this accessory link?")) return;
    try {
      await removePimProductAccessory(productId, id);
      await loadAccessories();
    } catch (err: any) {
      alert(err.message || "Failed to remove accessory");
    }
  };

  if (loading) return <div className="p-4"><ERPLoadingState label="Loading accessories..." /></div>;

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Add new */}
      <div className="flex items-start gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            className="w-full pl-9 pr-4 py-2 border rounded-xl text-sm"
            placeholder="Search published PIM products to attach as accessory..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSelectedProduct(null);
            }}
          />
          
          {/* Autocomplete dropdown */}
          {searchQuery.length >= 2 && !selectedProduct && (
            <div className="absolute top-full left-0 right-0 mt-1 z-10 overflow-y-auto rounded-xl border-2 border-slate-300 dark:border-slate-600 shadow-[0_8px_32px_rgba(0,0,0,0.22)]" style={{ maxHeight: "15rem" }}>
              <div className="rounded-xl overflow-hidden bg-white dark:bg-slate-900">
              {searching ? (
                <div className="flex items-center gap-2.5 px-4 py-3 text-[13px] text-slate-500 dark:text-slate-400">
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />Searching…
                </div>
              ) : searchResults.length === 0 ? (
                <div className="px-4 py-3 text-[13px] text-slate-500 dark:text-slate-400">No published products found</div>
              ) : (
                <div className="divide-y-2 divide-slate-100 dark:divide-slate-800">
                  {searchResults.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      className="w-full px-4 py-2.5 text-left flex items-center gap-2 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
                      onClick={() => {
                        setSelectedProduct(p);
                        setSearchQuery(p.name);
                      }}
                    >
                      <span className="shrink-0 rounded border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] font-bold text-slate-700 dark:text-slate-200">{p.code}</span>
                      <span className="flex-1 text-[13px] font-semibold text-slate-900 dark:text-slate-100 truncate">{p.name}</span>
                    </button>
                  ))}
                </div>
              )}
              </div>
            </div>
          )}
        </div>
        
        <button
          type="button"
          onClick={handleAdd}
          disabled={!selectedProduct || adding}
          className="shrink-0 flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
        >
          {adding ? "Adding..." : <><Plus className="h-4 w-4" /> Add</>}
        </button>
      </div>

      {/* List */}
      {accessories.length > 0 ? (
        <div className="rounded-xl border bg-card overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-4 py-2.5 font-medium text-muted-foreground w-[120px]">SKU</th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground">Product</th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground w-[100px] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {accessories.map((acc) => (
                <tr key={acc.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs">{acc.related_pim_product_code}</td>
                  <td className="px-4 py-3 font-medium flex items-center gap-2">
                    <Link2 className="h-3 w-3 text-muted-foreground" />
                    {acc.related_pim_product_name}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleRemove(acc.id)}
                      className="text-red-500 hover:text-red-700 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                      title="Remove Link"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          No accessories linked to this product.
        </div>
      )}
    </div>
  );
}
