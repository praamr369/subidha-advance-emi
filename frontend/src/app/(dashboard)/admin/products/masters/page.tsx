"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Layers,
  Box,
  Wrench,
  Shapes,
  RefreshCw,
  ExternalLink,
  Hash,
  Pencil,
  Trash2,
  Plus,
  X,
  Filter,
} from "lucide-react";

import ERPDataToolbar from "@/components/erp/ERPDataToolbar";
import ERPDetailGrid from "@/components/erp/ERPDetailGrid";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { formatRupee } from "@/lib/utils/currency";

import {
  createProductCategoryMaster,
  updateProductCategoryMaster,
  deleteProductCategoryMaster,
  createProductSubcategoryMaster,
  updateProductSubcategoryMaster,
  deleteProductSubcategoryMaster,
  createProductUnitMaster,
  getProductCatalogOptions,
  listProductRegister,
  type ProductCatalogOptions,
  type ProductCategoryMasterRecord,
  type ProductSubcategoryMasterRecord,
  type ProductRecord,
  type ProductItemType,
} from "@/services/products";

import { pimService, type PimCategory } from "@/services/pim";
import { listManufacturingBoms, type ManufacturingBom } from "@/services/manufacturing";

const EMPTY_CATALOG_OPTIONS: ProductCatalogOptions = {
  categories: [],
  subcategories: [],
  unit_of_measure_masters: [],
  unit_of_measure_options: ["PCS"],
  item_type_choices: [],
  stock_type_choices: [],
};

function toErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Unable to complete product master action.";
  const raw = error.message.trim();
  if (!raw) return "Unable to complete product master action.";
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed.detail === "string" && parsed.detail.trim()) return parsed.detail;
    for (const [field, value] of Object.entries(parsed)) {
      if (Array.isArray(value) && value.length > 0) return `${field}: ${String(value[0])}`;
      if (typeof value === "string" && value.trim()) return `${field}: ${value}`;
    }
  } catch {
    return raw;
  }
  return raw;
}

const DATA_TYPE_LABELS: Record<string, string> = {
  TEXT: "Text",
  NUMBER: "Number",
  DECIMAL: "Decimal",
  CHOICE: "Choice",
  MULTI_CHOICE: "Multi Choice",
  BOOLEAN: "Yes/No",
  DATE: "Date",
};

const DATA_TYPE_COLORS: Record<string, string> = {
  TEXT: "bg-gray-100 text-gray-700",
  NUMBER: "bg-blue-50 text-blue-700",
  DECIMAL: "bg-blue-50 text-blue-700",
  CHOICE: "bg-purple-50 text-purple-700",
  MULTI_CHOICE: "bg-purple-50 text-purple-700",
  BOOLEAN: "bg-orange-50 text-orange-700",
  DATE: "bg-green-50 text-green-700",
};

const ITEM_TYPE_CONFIG: Record<
  string,
  { label: string; icon: string; badge: string }
> = {
  FINISHED_GOOD: {
    label: "Finished Good",
    icon: "🛋️",
    badge: "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  },
  ACCESSORY: {
    label: "Accessory / Hardware",
    icon: "🔩",
    badge: "border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-700 dark:bg-purple-950/40 dark:text-purple-300",
  },
  RAW_MATERIAL: {
    label: "Raw Material",
    icon: "🪵",
    badge: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  },
  SERVICE: {
    label: "Service / Labor",
    icon: "🛠️",
    badge: "border-teal-300 bg-teal-50 text-teal-700 dark:border-teal-700 dark:bg-teal-950/40 dark:text-teal-300",
  },
};

function CatalogTab({ catalogOptions, loadPage, saving, setSaving, error, setError, message, setMessage }: any) {
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>("ALL");

  // Category form state
  const [editingCategory, setEditingCategory] = useState<ProductCategoryMasterRecord | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [categoryItemType, setCategoryItemType] = useState<"FINISHED_GOOD" | "ACCESSORY" | "RAW_MATERIAL" | "SERVICE">("FINISHED_GOOD");
  const [categoryDescription, setCategoryDescription] = useState("");

  // Subcategory form state
  const [editingSubcategory, setEditingSubcategory] = useState<ProductSubcategoryMasterRecord | null>(null);
  const [subcategoryCategoryId, setSubcategoryCategoryId] = useState("");
  const [subcategoryName, setSubcategoryName] = useState("");
  const [subcategoryDescription, setSubcategoryDescription] = useState("");
  const [filterSubcategoryCategory, setFilterSubcategoryCategory] = useState("");

  // UOM form state
  const [unitCode, setUnitCode] = useState("PCS");
  const [unitName, setUnitName] = useState("Pieces");
  const [unitDescription, setUnitDescription] = useState("");

  const categoriesByType = useMemo(() => {
    const groups: Record<string, ProductCategoryMasterRecord[]> = {
      FINISHED_GOOD: [],
      ACCESSORY: [],
      RAW_MATERIAL: [],
      SERVICE: [],
    };
    for (const cat of catalogOptions.categories || []) {
      const t = (cat.item_type || "FINISHED_GOOD") as string;
      if (!groups[t]) groups[t] = [];
      groups[t].push(cat);
    }
    return groups;
  }, [catalogOptions.categories]);

  const subcategoryRows = useMemo(
    () =>
      [...(catalogOptions.subcategories || [])].sort(
        (a: any, b: any) =>
          (a.category_name || "").localeCompare(b.category_name || "") ||
          (a.name || "").localeCompare(b.name || "")
      ),
    [catalogOptions.subcategories]
  );

  const filteredCategories = useMemo(() => {
    return (catalogOptions.categories || []).filter((cat: any) => {
      if (selectedTypeFilter === "ALL") return true;
      const t = cat.item_type || "FINISHED_GOOD";
      return t === selectedTypeFilter;
    });
  }, [catalogOptions.categories, selectedTypeFilter]);

  const filteredSubcategories = useMemo(() => {
    return subcategoryRows.filter((sub: any) => {
      const catType = sub.category_item_type || sub.product_type || "FINISHED_GOOD";
      if (selectedTypeFilter !== "ALL" && catType !== selectedTypeFilter) return false;
      if (filterSubcategoryCategory) {
        const subCatId = String(sub.category || sub.category_id);
        if (subCatId !== filterSubcategoryCategory) return false;
      }
      return true;
    });
  }, [subcategoryRows, selectedTypeFilter, filterSubcategoryCategory]);

  function handleStartEditCategory(cat: ProductCategoryMasterRecord) {
    setEditingCategory(cat);
    setCategoryName(cat.name);
    setCategoryItemType((cat.item_type as "FINISHED_GOOD" | "ACCESSORY" | "RAW_MATERIAL" | "SERVICE") || "FINISHED_GOOD");
    setCategoryDescription(cat.description || "");
    setError(null);
    setMessage(null);
  }

  function handleCancelEditCategory() {
    setEditingCategory(null);
    setCategoryName("");
    setCategoryItemType(selectedTypeFilter !== "ALL" ? (selectedTypeFilter as "FINISHED_GOOD" | "ACCESSORY" | "RAW_MATERIAL" | "SERVICE") : "FINISHED_GOOD");
    setCategoryDescription("");
  }

  async function handleSaveCategory() {
    if (!categoryName.trim()) return;
    setSaving("category");
    setError(null);
    setMessage(null);
    try {
      if (editingCategory) {
        await updateProductCategoryMaster(editingCategory.id, {
          name: categoryName.trim(),
          item_type: categoryItemType,
          description: categoryDescription.trim() || undefined,
        });
        setMessage(`Category "${categoryName.trim()}" updated successfully.`);
      } else {
        await createProductCategoryMaster({
          name: categoryName.trim(),
          item_type: categoryItemType,
          description: categoryDescription.trim() || undefined,
          is_active: true,
        });
        setMessage(`Category "${categoryName.trim()}" created successfully.`);
      }
      handleCancelEditCategory();
      await loadPage();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(null);
    }
  }

  async function handleDeleteCategory(cat: ProductCategoryMasterRecord) {
    if (!window.confirm(`Are you sure you want to delete category "${cat.name}"?`)) return;
    setSaving("category");
    setError(null);
    setMessage(null);
    try {
      await deleteProductCategoryMaster(cat.id);
      setMessage(`Category "${cat.name}" deleted successfully.`);
      if (editingCategory?.id === cat.id) {
        handleCancelEditCategory();
      }
      await loadPage();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(null);
    }
  }

  function handleStartEditSubcategory(sub: ProductSubcategoryMasterRecord) {
    setEditingSubcategory(sub);
    setSubcategoryCategoryId(String(sub.category ?? sub.category_id ?? ""));
    setSubcategoryName(sub.name);
    setSubcategoryDescription(sub.description || "");
    setError(null);
    setMessage(null);
  }

  function handleCancelEditSubcategory() {
    setEditingSubcategory(null);
    setSubcategoryName("");
    setSubcategoryDescription("");
  }

  async function handleSaveSubcategory() {
    if (!subcategoryCategoryId || !subcategoryName.trim()) return;
    setSaving("subcategory");
    setError(null);
    setMessage(null);
    try {
      if (editingSubcategory) {
        await updateProductSubcategoryMaster(editingSubcategory.id, {
          category: Number(subcategoryCategoryId),
          name: subcategoryName.trim(),
          description: subcategoryDescription.trim() || undefined,
        });
        setMessage(`Subcategory "${subcategoryName.trim()}" updated successfully.`);
      } else {
        await createProductSubcategoryMaster({
          category: Number(subcategoryCategoryId),
          name: subcategoryName.trim(),
          description: subcategoryDescription.trim() || undefined,
          is_active: true,
        });
        setMessage(`Subcategory "${subcategoryName.trim()}" created successfully.`);
      }
      handleCancelEditSubcategory();
      await loadPage();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(null);
    }
  }

  async function handleDeleteSubcategory(sub: ProductSubcategoryMasterRecord) {
    if (!window.confirm(`Are you sure you want to delete subcategory "${sub.name}"?`)) return;
    setSaving("subcategory");
    setError(null);
    setMessage(null);
    try {
      await deleteProductSubcategoryMaster(sub.id);
      setMessage(`Subcategory "${sub.name}" deleted successfully.`);
      if (editingSubcategory?.id === sub.id) {
        handleCancelEditSubcategory();
      }
      await loadPage();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(null);
    }
  }

  async function handleCreateUnit() {
    if (!unitCode.trim() || !unitName.trim()) return;
    setSaving("unit");
    setError(null);
    setMessage(null);
    try {
      await createProductUnitMaster({
        code: unitCode.trim().toUpperCase(),
        name: unitName.trim(),
        description: unitDescription.trim() || undefined,
        is_active: true,
      });
      setUnitCode("PCS");
      setUnitName("Pieces");
      setUnitDescription("");
      setMessage("Unit master created.");
      await loadPage();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(null);
    }
  }

  return (
    <>
      <ERPSectionShell
        title="Master-data rule"
        description="Categories, subcategories, and units are shared catalog masters. Product code and SKU stay at the individual product level."
      >
        <ERPDetailGrid
          columns={4}
          items={[
            { label: "Category Owner", value: "Shared product master" },
            { label: "Subcategory Owner", value: "Shared product master" },
            { label: "Unit Owner", value: "Shared product master" },
            { label: "SKU / Code", value: "Managed per product record" },
          ]}
        />
      </ERPSectionShell>

      {/* Classification Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl border border-border bg-card/60">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mr-1.5">
            Filter View:
          </span>
          {[
            { id: "ALL", label: "All Types", icon: "🌐" },
            { id: "FINISHED_GOOD", label: "Finished Goods", icon: "🛋️" },
            { id: "ACCESSORY", label: "Accessories & Hardware", icon: "🔩" },
            { id: "RAW_MATERIAL", label: "Raw Materials", icon: "🪵" },
            { id: "SERVICE", label: "Services & Labor", icon: "🛠️" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setSelectedTypeFilter(tab.id);
                if (tab.id !== "ALL" && !editingCategory) {
                  setCategoryItemType(tab.id as "FINISHED_GOOD" | "ACCESSORY" | "RAW_MATERIAL" | "SERVICE");
                }
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                selectedTypeFilter === tab.id
                  ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
        <div className="text-xs text-muted-foreground font-mono">
          {filteredCategories.length} Categories · {filteredSubcategories.length} Subcategories
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* Categories Column */}
        <ERPSectionShell
          title={editingCategory ? `Edit: ${editingCategory.name}` : "Categories"}
          description="Create and govern top-level classification groups."
        >
          <div className="space-y-4">
            <div className="space-y-3 rounded-xl border border-border p-3.5 bg-background">
              <div className="flex items-center justify-between text-xs font-semibold uppercase text-muted-foreground">
                <span>{editingCategory ? "Update Category" : "New Category"}</span>
                {editingCategory && (
                  <button
                    type="button"
                    onClick={handleCancelEditCategory}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" /> Cancel
                  </button>
                )}
              </div>

              <div>
                <label className="text-[11px] font-medium text-muted-foreground">Classification Type</label>
                <select
                  value={categoryItemType}
                  onChange={(e) => setCategoryItemType(e.target.value as "FINISHED_GOOD" | "ACCESSORY" | "RAW_MATERIAL" | "SERVICE")}
                  disabled={saving !== null}
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs outline-none transition focus:border-ring"
                >
                  <option value="FINISHED_GOOD">🛋️ Finished Good</option>
                  <option value="ACCESSORY">🔩 Accessory / Hardware</option>
                  <option value="RAW_MATERIAL">🪵 Raw Material</option>
                  <option value="SERVICE">🛠️ Service / Labor</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-medium text-muted-foreground">Category Name</label>
                <input
                  type="text"
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  placeholder="e.g. Bed Hardware, Plywood, Sofa"
                  disabled={saving !== null}
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-muted-foreground">Description (optional)</label>
                <textarea
                  value={categoryDescription}
                  onChange={(e) => setCategoryDescription(e.target.value)}
                  placeholder="Category scope or notes"
                  rows={2}
                  disabled={saving !== null}
                  className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none transition focus:border-ring"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => void handleSaveCategory()}
                  disabled={saving !== null || !categoryName.trim()}
                  className="inline-flex flex-1 h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {saving === "category" ? "Saving..." : editingCategory ? "Update Category" : "Add Category"}
                </button>
                {editingCategory && (
                  <button
                    type="button"
                    onClick={handleCancelEditCategory}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-border px-4 text-sm font-medium hover:bg-muted"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
              {filteredCategories.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground border border-dashed rounded-xl">
                  No categories found for selected filter.
                </div>
              ) : (
                filteredCategories.map((row: any) => {
                  const itemType = row.item_type || "FINISHED_GOOD";
                  const cfg = ITEM_TYPE_CONFIG[itemType] || ITEM_TYPE_CONFIG.FINISHED_GOOD;
                  const isEditingThis = editingCategory?.id === row.id;

                  return (
                    <div
                      key={row.id}
                      className={`rounded-xl border p-3.5 text-sm transition-all ${
                        isEditingThis
                          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                          : "border-border bg-card/60 hover:border-border hover:bg-muted/20"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-foreground text-sm">{row.name}</span>
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${cfg.badge}`}
                            >
                              <span>{cfg.icon}</span>
                              <span>{cfg.label}</span>
                            </span>
                          </div>
                          {row.description?.trim() ? (
                            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{row.description}</p>
                          ) : (
                            <p className="mt-1 text-xs text-muted-foreground italic">No description</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            title="Edit Category"
                            onClick={() => handleStartEditCategory(row)}
                            className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Delete Category"
                            onClick={() => void handleDeleteCategory(row)}
                            disabled={saving !== null}
                            className="p-1.5 text-muted-foreground hover:text-destructive rounded-lg hover:bg-destructive/10 transition"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </ERPSectionShell>

        {/* Subcategories Column */}
        <ERPSectionShell
          title={editingSubcategory ? `Edit: ${editingSubcategory.name}` : "Subcategories"}
          description="Subcategories stay attached to one parent category."
        >
          <div className="space-y-4">
            <div className="space-y-3 rounded-xl border border-border p-3.5 bg-background">
              <div className="flex items-center justify-between text-xs font-semibold uppercase text-muted-foreground">
                <span>{editingSubcategory ? "Update Subcategory" : "New Subcategory"}</span>
                {editingSubcategory && (
                  <button
                    type="button"
                    onClick={handleCancelEditSubcategory}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" /> Cancel
                  </button>
                )}
              </div>

              <div>
                <label className="text-[11px] font-medium text-muted-foreground">Parent Category</label>
                <select
                  value={subcategoryCategoryId}
                  onChange={(e) => setSubcategoryCategoryId(e.target.value)}
                  disabled={saving !== null}
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs outline-none transition focus:border-ring"
                >
                  <option value="">-- Select Parent Category --</option>
                  {Object.entries(categoriesByType).map(([typeKey, cats]) => {
                    if (cats.length === 0) return null;
                    const cfg = ITEM_TYPE_CONFIG[typeKey] || { label: typeKey, icon: "📁" };
                    return (
                      <optgroup key={typeKey} label={`${cfg.icon} ${cfg.label}`}>
                        {cats.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-medium text-muted-foreground">Subcategory Name</label>
                <input
                  type="text"
                  value={subcategoryName}
                  onChange={(e) => setSubcategoryName(e.target.value)}
                  placeholder="e.g. Side Rails, Bed Fitting Set, Plywood 16mm"
                  disabled={saving !== null}
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-muted-foreground">Description (optional)</label>
                <textarea
                  value={subcategoryDescription}
                  onChange={(e) => setSubcategoryDescription(e.target.value)}
                  placeholder="Subcategory scope or specs"
                  rows={2}
                  disabled={saving !== null}
                  className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none transition focus:border-ring"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => void handleSaveSubcategory()}
                  disabled={saving !== null || !subcategoryCategoryId || !subcategoryName.trim()}
                  className="inline-flex flex-1 h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {saving === "subcategory" ? "Saving..." : editingSubcategory ? "Update Subcategory" : "Add Subcategory"}
                </button>
                {editingSubcategory && (
                  <button
                    type="button"
                    onClick={handleCancelEditSubcategory}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-border px-4 text-sm font-medium hover:bg-muted"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>

            {/* Subcategory Filter Selector */}
            <div className="flex items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <select
                value={filterSubcategoryCategory}
                onChange={(e) => setFilterSubcategoryCategory(e.target.value)}
                className="h-8 flex-1 rounded-lg border border-border bg-background px-2 text-xs outline-none transition focus:border-ring"
              >
                <option value="">All Categories ({subcategoryRows.length})</option>
                {catalogOptions.categories.map((c: any) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
              {filteredSubcategories.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground border border-dashed rounded-xl">
                  No subcategories found for selected filter.
                </div>
              ) : (
                filteredSubcategories.map((row: any) => {
                  const parentCatType = row.category_item_type || row.product_type || "FINISHED_GOOD";
                  const cfg = ITEM_TYPE_CONFIG[parentCatType] || ITEM_TYPE_CONFIG.FINISHED_GOOD;
                  const isEditingThis = editingSubcategory?.id === row.id;

                  return (
                    <div
                      key={row.id}
                      className={`rounded-xl border p-3.5 text-sm transition-all ${
                        isEditingThis
                          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                          : "border-border bg-card/60 hover:border-border hover:bg-muted/20"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-foreground text-sm">{row.name}</span>
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${cfg.badge}`}
                            >
                              <span>{cfg.icon}</span>
                              <span>{row.category_name}</span>
                            </span>
                          </div>
                          {row.description?.trim() ? (
                            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{row.description}</p>
                          ) : (
                            <p className="mt-1 text-xs text-muted-foreground italic">No description</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            title="Edit Subcategory"
                            onClick={() => handleStartEditSubcategory(row)}
                            className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Delete Subcategory"
                            onClick={() => void handleDeleteSubcategory(row)}
                            disabled={saving !== null}
                            className="p-1.5 text-muted-foreground hover:text-destructive rounded-lg hover:bg-destructive/10 transition"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </ERPSectionShell>

        {/* Units of Measure Column */}
        <ERPSectionShell title="Units of measure" description="Manage approved UOM codes.">
          <div className="space-y-4">
            <div className="space-y-3 rounded-xl border border-border p-3.5 bg-background">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground">Unit Code</label>
                <input
                  type="text"
                  value={unitCode}
                  onChange={(e) => setUnitCode(e.target.value.toUpperCase())}
                  placeholder="Code (e.g. PCS, SET, KG, MTR)"
                  disabled={saving !== null}
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-4 text-sm uppercase outline-none transition focus:border-ring"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-muted-foreground">Display Name</label>
                <input
                  type="text"
                  value={unitName}
                  onChange={(e) => setUnitName(e.target.value)}
                  placeholder="Display name (e.g. Pieces, Sets)"
                  disabled={saving !== null}
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-muted-foreground">Description (optional)</label>
                <textarea
                  value={unitDescription}
                  onChange={(e) => setUnitDescription(e.target.value)}
                  placeholder="Unit description"
                  rows={2}
                  disabled={saving !== null}
                  className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none transition focus:border-ring"
                />
              </div>

              <button
                type="button"
                onClick={() => void handleCreateUnit()}
                disabled={saving !== null || !unitCode.trim() || !unitName.trim()}
                className="inline-flex w-full h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {saving === "unit" ? "Saving..." : "Add Unit"}
              </button>
            </div>

            <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
              {catalogOptions.unit_of_measure_masters.map((row: any) => (
                <div key={row.id} className="rounded-xl border border-border bg-card/60 px-4 py-3 text-sm">
                  <div className="font-medium text-foreground">
                    <span className="font-mono font-semibold">{row.code}</span> · {row.name}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </ERPSectionShell>
      </div>
    </>
  );
}

function PimTab() {
  const [categories, setCategories] = useState<PimCategory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    pimService.getCategories().then(res => setCategories(Array.isArray(res) ? res : [])).finally(() => setLoading(false));
  }, []);

  if (loading) return <ERPLoadingState label="Loading PIM categories..." />;

  return (
    <div className="space-y-6">
      <ERPSectionShell title="PIM Categories & Attributes" description="Define structured attributes for variants and catalog specs.">
        <div className="flex justify-end mb-4">
          <Link href="/admin/pim/categories" className="inline-flex h-10 items-center justify-center rounded-xl border border-border px-4 text-sm font-medium hover:bg-muted">
            Manage PIM Categories →
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {categories.map(category => (
            <div key={category.id} className="rounded-xl border border-border p-4 bg-background">
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium flex items-center gap-2"><span className="text-xl">{category.icon}</span> {category.name}</div>
              </div>
              <div className="text-xs text-muted-foreground mb-4">{category.subcategories.length} Subcategories · {category.attributes.length} Base Attributes</div>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                {category.attributes.map(attr => (
                   <div key={attr.id} className="flex items-center gap-2 text-xs border border-border rounded-md p-2 bg-muted/20">
                     <Hash className="h-3 w-3 text-muted-foreground" />
                     <span className="font-medium flex-1 truncate">{attr.name}</span>
                     <span className={`px-1.5 py-0.5 rounded-full ${DATA_TYPE_COLORS[attr.data_type] || "bg-muted"}`}>{DATA_TYPE_LABELS[attr.data_type] || attr.data_type}</span>
                     {attr.is_variant_defining && <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">Variant</span>}
                   </div>
                ))}
              </div>
            </div>
          ))}
          {categories.length === 0 && <div className="col-span-2 text-center text-sm text-muted-foreground p-8">No PIM categories found.</div>}
        </div>
      </ERPSectionShell>
    </div>
  );
}

function BomTab() {
  const [boms, setBoms] = useState<ManufacturingBom[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listManufacturingBoms().then(res => setBoms(res.results)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <ERPLoadingState label="Loading BOMs..." />;

  return (
    <div className="space-y-6">
      <ERPSectionShell title="Bill of Materials" description="Manufacturing structures mapping finished goods to raw materials.">
        <div className="flex justify-end mb-4">
          <Link href="/admin/manufacturing/boms" className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Manage BOMs
          </Link>
        </div>
        <div className="rounded-xl border border-border overflow-x-auto bg-background">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">BOM No</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Finished Good</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Revision</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {boms.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No BOMs found.</td></tr>
              ) : boms.map(bom => (
                <tr key={bom.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs">{bom.bom_no}</td>
                  <td className="px-4 py-3 font-medium">{bom.finished_good_product_name || `Item #${bom.finished_good_inventory_item}`}</td>
                  <td className="px-4 py-3 text-center">{bom.revision_no}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${bom.status === "ACTIVE" ? "bg-green-50 text-green-700 border border-green-200" : "bg-muted text-muted-foreground border border-border"}`}>
                      {bom.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href="/admin/manufacturing/boms" className="text-primary text-xs hover:underline inline-flex items-center gap-1">
                      View <ExternalLink className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ERPSectionShell>
    </div>
  );
}

function MaterialsTab() {
  const [materials, setMaterials] = useState<ProductRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      listProductRegister({ item_type: "RAW_MATERIAL", page_size: 20 }),
      listProductRegister({ item_type: "FINISHED_GOOD", page_size: 20 })
    ]).then(([rawRes, fgRes]) => {
      setMaterials([...rawRes.results, ...fgRes.results].sort((a, b) => b.id - a.id));
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <ERPLoadingState label="Loading Materials..." />;

  return (
    <div className="space-y-6">
      <ERPSectionShell title="Raw Materials & Finished Goods" description="Quick view of physical items in the product register.">
        <div className="flex justify-end gap-2 mb-4">
          <Link href="/admin/products/create" className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium hover:bg-muted">
            Create Product
          </Link>
        </div>
        <div className="rounded-xl border border-border overflow-x-auto bg-background">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">ID</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Base Price</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">PIM Sync</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {materials.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No items found.</td></tr>
              ) : materials.map(item => (
                <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{item.product_code || item.id}</td>
                  <td className="px-4 py-3 font-medium">{item.name}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 text-xs rounded-full border ${item.item_type === "FINISHED_GOOD" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                      {item.item_type === "FINISHED_GOOD" ? "Finished Good" : "Raw Material"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatRupee(item.base_price || "0")}</td>
                  <td className="px-4 py-3 text-center">
                    {item.item_type === "FINISHED_GOOD" ? (
                      <span className="text-xs text-muted-foreground">Ready</span>
                    ) : (
                      <span className="text-xs text-muted-foreground opacity-50">N/A</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/admin/products/${item.id}/edit`} className="text-primary text-xs hover:underline inline-flex items-center gap-1">
                      Edit <ExternalLink className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ERPSectionShell>
    </div>
  );
}

export default function AdminProductMastersPage() {
  const [currentTab, setCurrentTab] = useState<"catalog" | "pim" | "bom" | "materials">("catalog");
  const [catalogOptions, setCatalogOptions] = useState<ProductCatalogOptions>(EMPTY_CATALOG_OPTIONS);
  const [saving, setSaving] = useState<null | "category" | "subcategory" | "unit">(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["admin_product_masters"],
    queryFn: async () => {
      return await getProductCatalogOptions();
    },
  });

  useEffect(() => {
    if (query.data) {
      setCatalogOptions(query.data);
      setError(null);
    } else if (query.isError) {
      setCatalogOptions(EMPTY_CATALOG_OPTIONS);
      setError(toErrorMessage(query.error));
    }
  }, [query.data, query.isError, query.error]);

  const loading = query.isLoading;
  const refreshing = query.isFetching && !query.isLoading;
  const loadPage = useCallback(async (_mode: "initial" | "refresh" = "initial") => {
    await query.refetch();
  }, [query]);

  const tabs = [
    { id: "catalog", label: "Catalog Masters", icon: <Layers className="h-4 w-4" /> },
    { id: "pim", label: "PIM Definitions", icon: <Shapes className="h-4 w-4" /> },
    { id: "bom", label: "BOM Masters", icon: <Wrench className="h-4 w-4" /> },
    { id: "materials", label: "Materials & Goods", icon: <Box className="h-4 w-4" /> },
  ] as const;

  return (
    <ERPPageShell
      eyebrow="Inventory"
      title="Unified Product Masters"
      subtitle="Govern shared catalog masters, PIM attributes, BOMs, and materials from one central hub."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Products", href: "/admin/products" },
        { label: "Masters" },
      ]}
      actions={[
        { href: "/admin/products", label: "Back to Register", variant: "secondary" },
        { href: "/admin/products/create", label: "Create Product", variant: "primary" },
      ]}
      statusBadge={{ label: "Data Governance", tone: "info" }}
    >
      <div className="space-y-6">
        <ERPDataToolbar
          left={
            <div className="flex gap-1 bg-muted/40 p-1 rounded-xl border border-border overflow-x-auto w-full max-w-full">
              {tabs.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setCurrentTab(t.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${currentTab === t.id ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          }
          right={
            <button type="button" onClick={() => void loadPage()} disabled={refreshing || loading} className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium transition hover:bg-muted disabled:opacity-60 shrink-0">
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
            </button>
          }
        />

        {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div>}
        {error && <ERPErrorState title="Error" description={error} onRetry={() => void loadPage()} />}

        {loading ? (
          <ERPLoadingState label="Loading masters hub..." />
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            {currentTab === "catalog" && (
              <CatalogTab catalogOptions={catalogOptions} loadPage={loadPage} saving={saving} setSaving={setSaving} error={error} setError={setError} message={message} setMessage={setMessage} />
            )}
            {currentTab === "pim" && <PimTab />}
            {currentTab === "bom" && <BomTab />}
            {currentTab === "materials" && <MaterialsTab />}
          </div>
        )}
      </div>
    </ERPPageShell>
  );
}
