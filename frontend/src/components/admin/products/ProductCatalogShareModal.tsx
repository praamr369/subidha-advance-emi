"use client";

import { useEffect, useId, useMemo, useState } from "react";
import QRCode from "react-qr-code";
import {
  AlertCircle,
  Boxes,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  Layers,
  Loader2,
  MessageCircle,
  Package,
  Phone,
  Printer,
  QrCode,
  RefreshCw,
  Search,
  Share2,
  Sparkles,
  Star,
  Table as TableIcon,
  Tag,
  User,
  X,
} from "lucide-react";

import {
  pimService,
  type PimProduct,
  type PriceListQuoteResponse,
  type PriceListQuoteItem,
} from "@/services/pim";
import { formatCurrency } from "@/lib/format";

export interface ProductCatalogShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedProducts: PimProduct[];
  allPimProducts: PimProduct[];
}

export type CatalogSchemeType = "direct_sale" | "rent" | "lease" | "sfemi";

export interface ResolvedCatalogItem {
  id: number;
  isChild: boolean;
  parentId: number | null;
  parentCode: string | null;
  parentName: string | null;
  code: string;
  sku: string;
  name: string;
  fullName: string;
  category: string;
  categoryId: number | null;
  categoryName: string;
  subcategoryName: string;
  basePrice: number;
  hasPrice: boolean;
  currentStock: number;
  rentYieldPercent: number;
  leaseYieldPercent: number;
  specs: string[];
  publicUrl: string;
  brand?: string;
  rentMonthly: number;
  rentDeposit: number;
  leaseMonthly: number;
  leaseDeposit: number;
  sfemiMonthly: number;
}

function resolveItemSpecs(p: PimProduct): string[] {
  const specs: string[] = [];
  if (Array.isArray(p.variant_attribute_values) && p.variant_attribute_values.length > 0) {
    for (const va of p.variant_attribute_values) {
      if (va.value_text) {
        specs.push(va.attribute_name ? `${va.attribute_name}: ${va.value_text}` : va.value_text);
      }
    }
  }
  if (Array.isArray(p.attributes) && p.attributes.length > 0) {
    for (const a of p.attributes) {
      const val = a.display_value || a.value_text;
      if (val && !specs.some((s) => s.includes(a.attribute_name))) {
        specs.push(`${a.attribute_name}: ${val}`);
      }
    }
  }
  return specs;
}

const AVAILABLE_RENT_TENURES = [3, 6, 9, 12, 24, 36];
const AVAILABLE_LEASE_TENURES = [12, 18, 24, 36, 48];
const AVAILABLE_SFEMI_TENURES = [12, 15];

export default function ProductCatalogShareModal({
  isOpen,
  onClose,
  selectedProducts,
  allPimProducts,
}: ProductCatalogShareModalProps) {
  const printContainerId = useId().replace(/:/g, "_");

  // Customer Target Information
  const [customerName, setCustomerName] = useState<string>("");
  const [customerPhone, setCustomerPhone] = useState<string>("");

  // Product Scope: selected products vs all available products
  const [productScope, setProductScope] = useState<"selected" | "all_pim">(
    selectedProducts.length > 0 ? "selected" : "all_pim"
  );
  const [extraLoadedProducts, setExtraLoadedProducts] = useState<PimProduct[]>([]);
  const [isLoadingAllCatalog, setIsLoadingAllCatalog] = useState<boolean>(false);

  // Configuration State
  const [includeVariants, setIncludeVariants] = useState<boolean>(true);
  const [selectedRentTenures, setSelectedRentTenures] = useState<number[]>([6, 9, 12, 24]);
  const [selectedLeaseTenures, setSelectedLeaseTenures] = useState<number[]>([12, 24, 36]);
  const [selectedSfemiTenures, setSelectedSfemiTenures] = useState<number[]>([12, 15]);
  const [depositPercent, setDepositPercent] = useState<number | null>(null); // null = auto band (20-30%)

  // Filter Options
  const [excludeUnpriced, setExcludeUnpriced] = useState<boolean>(true); // Hide ₹0 items by default
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [stockFilter, setStockFilter] = useState<"all" | "in_stock" | "out_of_stock">("all");
  const [itemTypeFilter, setItemTypeFilter] = useState<"all" | "base_only" | "variants_only">("all");
  const [searchFilter, setSearchFilter] = useState<string>("");

  // Scheme inclusions
  const [schemes, setSchemes] = useState<Record<CatalogSchemeType, boolean>>({
    direct_sale: true,
    rent: true,
    lease: true,
    sfemi: true,
  });

  // Modal active tabs
  const [activeTab, setActiveTab] = useState<"matrix" | "whatsapp" | "print" | "links" | "text">("matrix");
  const [printLayout, setPrintLayout] = useState<"matrix" | "cards">("matrix"); // Default matrix for multi-page handover
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [statusNotification, setStatusNotification] = useState<string | null>(null);
  const [serverQuote, setServerQuote] = useState<PriceListQuoteResponse | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState<boolean>(false);

  // Origin for public links
  const origin =
    typeof window !== "undefined" && window.location.origin
      ? window.location.origin
      : "https://subidhafurnitureasansol.com";

  // Combine products based on scope and extra loaded
  const effectiveSourceProducts = useMemo<PimProduct[]>(() => {
    if (extraLoadedProducts.length > 0) {
      return extraLoadedProducts;
    }
    if (productScope === "all_pim" && allPimProducts.length > 0) {
      return allPimProducts;
    }
    return selectedProducts.length > 0 ? selectedProducts : allPimProducts;
  }, [productScope, selectedProducts, allPimProducts, extraLoadedProducts]);

  // Build resolved items hierarchy (Base Blueprint + Child Variants)
  const resolvedItems = useMemo<ResolvedCatalogItem[]>(() => {
    const items: ResolvedCatalogItem[] = [];
    const addedIds = new Set<number>();

    // Index all available products by id and parent_id
    const pool = extraLoadedProducts.length > 0 ? extraLoadedProducts : allPimProducts;
    const childrenByParent = new Map<number, PimProduct[]>();
    for (const p of pool) {
      if (p.parent_id) {
        const list = childrenByParent.get(p.parent_id) ?? [];
        list.push(p);
        childrenByParent.set(p.parent_id, list);
      }
    }

    const baseProductsToProcess: PimProduct[] = [];
    const standaloneOrChildren: PimProduct[] = [];

    for (const p of effectiveSourceProducts) {
      if (!p.parent_id) {
        baseProductsToProcess.push(p);
      } else {
        standaloneOrChildren.push(p);
      }
    }

    const primaryRentTenure = selectedRentTenures[0] || 12;
    const primaryLeaseTenure = selectedLeaseTenures[0] || 24;
    const primarySfemiTenure = selectedSfemiTenures[0] || 15;
    const depPct = depositPercent ?? 20;

    // Process base products and their child variants
    for (const base of baseProductsToProcess) {
      const price = Number(base.base_price) || 0;
      const rentYield = Number(base.rent_monthly_yield_percent) || 5.0;
      const leaseYield = Number(base.lease_monthly_yield_percent) || 3.5;
      const specs = resolveItemSpecs(base);
      const publicUrl = `${origin}/products/${encodeURIComponent(base.code)}`;
      const catName = base.category_name || "";
      const subcatName = base.subcategory_name || "";
      const catLabel = [catName, subcatName].filter(Boolean).join(" / ");

      const baseItem: ResolvedCatalogItem = {
        id: base.id,
        isChild: false,
        parentId: null,
        parentCode: null,
        parentName: null,
        code: base.code,
        sku: base.code,
        name: base.name,
        fullName: base.full_name || base.name,
        category: catLabel,
        categoryId: base.category ?? null,
        categoryName: catName,
        subcategoryName: subcatName,
        basePrice: price,
        hasPrice: price > 0,
        currentStock: base.current_stock_qty ?? 0,
        rentYieldPercent: rentYield,
        leaseYieldPercent: leaseYield,
        specs,
        publicUrl,
        brand: base.brand,
        rentMonthly: Math.round((price * rentYield * 12) / primaryRentTenure / 100),
        rentDeposit: Math.round((price * depPct) / 100),
        leaseMonthly: Math.round((price * leaseYield * 12) / primaryLeaseTenure / 100),
        leaseDeposit: Math.round((price * depPct) / 100),
        sfemiMonthly: Math.round(price / primarySfemiTenure),
      };

      if (!addedIds.has(base.id)) {
        items.push(baseItem);
        addedIds.add(base.id);
      }

      // If including variants, add children under this base
      if (includeVariants) {
        const children = childrenByParent.get(base.id) ?? [];
        for (const child of children) {
          if (!addedIds.has(child.id)) {
            const childPrice = Number(child.base_price) || price;
            const childRentYield = Number(child.rent_monthly_yield_percent) || rentYield;
            const childLeaseYield = Number(child.lease_monthly_yield_percent) || leaseYield;
            const childSpecs = resolveItemSpecs(child);
            const childSku = child.code;
            const childUrl = `${origin}/products/${encodeURIComponent(base.code)}?sku=${encodeURIComponent(childSku)}`;
            const childCatName = child.category_name || catName;
            const childSubcatName = child.subcategory_name || subcatName;
            const childCatLabel = [childCatName, childSubcatName].filter(Boolean).join(" / ");

            items.push({
              id: child.id,
              isChild: true,
              parentId: base.id,
              parentCode: base.code,
              parentName: base.name,
              code: child.code,
              sku: childSku,
              name: child.name,
              fullName: child.full_name || `${base.name} — ${child.name}`,
              category: childCatLabel,
              categoryId: child.category ?? base.category ?? null,
              categoryName: childCatName,
              subcategoryName: childSubcatName,
              basePrice: childPrice,
              hasPrice: childPrice > 0,
              currentStock: child.current_stock_qty ?? 0,
              rentYieldPercent: childRentYield,
              leaseYieldPercent: childLeaseYield,
              specs: childSpecs,
              publicUrl: childUrl,
              brand: child.brand || base.brand,
              rentMonthly: Math.round((childPrice * childRentYield * 12) / primaryRentTenure / 100),
              rentDeposit: Math.round((childPrice * depPct) / 100),
              leaseMonthly: Math.round((childPrice * childLeaseYield * 12) / primaryLeaseTenure / 100),
              leaseDeposit: Math.round((childPrice * depPct) / 100),
              sfemiMonthly: Math.round(childPrice / primarySfemiTenure),
            });
            addedIds.add(child.id);
          }
        }
      }
    }

    // Add any individually selected children that weren't under processed bases
    for (const item of standaloneOrChildren) {
      if (!addedIds.has(item.id)) {
        const parent = pool.find((p) => p.id === item.parent_id);
        const parentCode = parent?.code || item.parent_code || item.code;
        const price = Number(item.base_price) || 0;
        const rentYield = Number(item.rent_monthly_yield_percent) || 5.0;
        const leaseYield = Number(item.lease_monthly_yield_percent) || 3.5;
        const specs = resolveItemSpecs(item);
        const childSku = item.code;
        const publicUrl = `${origin}/products/${encodeURIComponent(parentCode)}?sku=${encodeURIComponent(childSku)}`;
        const catName = item.category_name || parent?.category_name || "";
        const subcatName = item.subcategory_name || parent?.subcategory_name || "";
        const catLabel = [catName, subcatName].filter(Boolean).join(" / ");

        items.push({
          id: item.id,
          isChild: true,
          parentId: item.parent_id || null,
          parentCode,
          parentName: parent?.name || item.parent_name || null,
          code: item.code,
          sku: childSku,
          name: item.name,
          fullName: item.full_name || item.name,
          category: catLabel,
          categoryId: item.category ?? parent?.category ?? null,
          categoryName: catName,
          subcategoryName: subcatName,
          basePrice: price,
          hasPrice: price > 0,
          currentStock: item.current_stock_qty ?? 0,
          rentYieldPercent: rentYield,
          leaseYieldPercent: leaseYield,
          specs,
          publicUrl,
          brand: item.brand,
          rentMonthly: Math.round((price * rentYield * 12) / primaryRentTenure / 100),
          rentDeposit: Math.round((price * depPct) / 100),
          leaseMonthly: Math.round((price * leaseYield * 12) / primaryLeaseTenure / 100),
          leaseDeposit: Math.round((price * depPct) / 100),
          sfemiMonthly: Math.round(price / primarySfemiTenure),
        });
        addedIds.add(item.id);
      }
    }

    return items;
  }, [
    effectiveSourceProducts,
    allPimProducts,
    extraLoadedProducts,
    includeVariants,
    selectedRentTenures,
    selectedLeaseTenures,
    selectedSfemiTenures,
    depositPercent,
    origin,
  ]);

  // Unique categories for filtering
  const availableCategories = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of resolvedItems) {
      if (excludeUnpriced && !item.hasPrice) continue;
      const cat = item.category || "Uncategorized";
      map.set(cat, (map.get(cat) || 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [resolvedItems, excludeUnpriced]);

  // Filter active items based on: excludeUnpriced, category, stock, item type, and search query
  const activeItems = useMemo(() => {
    return resolvedItems.filter((item) => {
      // 1. Unpriced filter: Hide base_price <= 0 if requested
      if (excludeUnpriced && !item.hasPrice) {
        return false;
      }

      // 2. Category filter
      if (selectedCategory !== "all") {
        const itemCat = item.category || "Uncategorized";
        if (itemCat !== selectedCategory) return false;
      }

      // 3. Stock filter
      if (stockFilter === "in_stock" && item.currentStock <= 0) return false;
      if (stockFilter === "out_of_stock" && item.currentStock > 0) return false;

      // 4. Item Type filter
      if (itemTypeFilter === "base_only" && item.isChild) return false;
      if (itemTypeFilter === "variants_only" && !item.isChild) return false;

      // 5. Search text filter
      if (searchFilter.trim()) {
        const q = searchFilter.toLowerCase();
        const matches =
          item.fullName.toLowerCase().includes(q) ||
          item.sku.toLowerCase().includes(q) ||
          item.code.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q) ||
          (item.brand && item.brand.toLowerCase().includes(q)) ||
          item.specs.some((s) => s.toLowerCase().includes(q));
        if (!matches) return false;
      }

      // 6. Selected IDs
      return selectedIds.has(item.id);
    });
  }, [
    resolvedItems,
    selectedIds,
    excludeUnpriced,
    selectedCategory,
    stockFilter,
    itemTypeFilter,
    searchFilter,
  ]);

  // Initialize selectedIds with priced items (or all items if excludeUnpriced is off)
  useEffect(() => {
    const validIds = new Set<number>();
    for (const item of resolvedItems) {
      if (excludeUnpriced && !item.hasPrice) continue;
      validIds.add(item.id);
    }
    setSelectedIds(validIds);
  }, [resolvedItems, excludeUnpriced]);

  // Call authoritative backend API for price list quote with debounce
  useEffect(() => {
    if (!isOpen || activeItems.length === 0) return;

    const timeout = setTimeout(async () => {
      try {
        setIsLoadingQuote(true);
        const activeSchemes = Object.entries(schemes)
          .filter(([, v]) => v)
          .map(([k]) => k.toUpperCase());

        const targetIds = activeItems.map((i) => i.id).slice(0, 1000);
        const quote = await pimService.getPriceListQuote({
          product_ids: targetIds,
          include_variants: includeVariants,
          schemes: activeSchemes.length > 0 ? activeSchemes : ["DIRECT_SALE", "RENT", "LEASE", "SFEMI"],
          rent_tenures: selectedRentTenures,
          lease_tenures: selectedLeaseTenures,
          sfemi_tenures: selectedSfemiTenures,
          deposit_percent: depositPercent,
          customer_name: customerName,
          customer_phone: customerPhone,
          public_origin: origin,
          exclude_unpriced: excludeUnpriced,
        });
        setServerQuote(quote);
      } catch (err) {
        console.error("Failed to fetch price list quote from server:", err);
      } finally {
        setIsLoadingQuote(false);
      }
    }, 350);

    return () => clearTimeout(timeout);
  }, [
    isOpen,
    activeItems,
    includeVariants,
    schemes,
    selectedRentTenures,
    selectedLeaseTenures,
    selectedSfemiTenures,
    depositPercent,
    customerName,
    customerPhone,
    excludeUnpriced,
    origin,
  ]);

  // Counts
  const totalBaseCount = resolvedItems.filter((i) => !i.isChild).length;
  const totalVariantCount = resolvedItems.filter((i) => i.isChild).length;
  const pricedCount = resolvedItems.filter((i) => i.hasPrice).length;

  // Selection actions
  const selectAllPriced = () => {
    const ids = new Set<number>();
    for (const item of resolvedItems) {
      if (item.hasPrice) ids.add(item.id);
    }
    setSelectedIds(ids);
  };

  const selectAllIncludingUnpriced = () => {
    setSelectedIds(new Set(resolvedItems.map((i) => i.id)));
  };

  const clearAllSelections = () => {
    setSelectedIds(new Set());
  };

  const toggleItemSelection = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Toggle tenure helpers
  const toggleRentTenure = (t: number) => {
    setSelectedRentTenures((prev) => {
      if (prev.includes(t)) {
        if (prev.length === 1) return prev;
        return prev.filter((x) => x !== t);
      }
      return [...prev, t].sort((a, b) => a - b);
    });
  };

  const toggleLeaseTenure = (t: number) => {
    setSelectedLeaseTenures((prev) => {
      if (prev.includes(t)) {
        if (prev.length === 1) return prev;
        return prev.filter((x) => x !== t);
      }
      return [...prev, t].sort((a, b) => a - b);
    });
  };

  const toggleSfemiTenure = (t: number) => {
    setSelectedSfemiTenures((prev) => {
      if (prev.includes(t)) {
        if (prev.length === 1) return prev;
        return prev.filter((x) => x !== t);
      }
      return [...prev, t].sort((a, b) => a - b);
    });
  };

  // Helper to load entire catalog (up to 500 blueprints and all their variants)
  const handleLoadFullDatabaseCatalog = async () => {
    try {
      setIsLoadingAllCatalog(true);
      setStatusNotification("Fetching complete catalog blueprints and variants...");
      const bpRes = await pimService.getProducts({ roots_only: true, page_size: 500 });
      const parentIds = bpRes.results.map((p) => p.id);

      // Fetch all variant SKUs
      const skus: PimProduct[] = [];
      for (let p = 1; ; p += 1) {
        const skuPage = await pimService.getProducts({ parent: parentIds, page: p, page_size: 100 });
        skus.push(...skuPage.results);
        if (skus.length >= skuPage.count || skuPage.results.length === 0) break;
      }

      const combined = [...bpRes.results, ...skus];
      setExtraLoadedProducts(combined);
      setProductScope("all_pim");
      setStatusNotification(`Loaded ${combined.length} products (${bpRes.results.length} blueprints + ${skus.length} variant SKUs)!`);
      setTimeout(() => setStatusNotification(null), 4000);
    } catch (err) {
      console.error("Failed to load full catalog:", err);
      setStatusNotification("Error loading full catalog.");
      setTimeout(() => setStatusNotification(null), 3000);
    } finally {
      setIsLoadingAllCatalog(false);
    }
  };

  // Full itemized message for clipboard / detailed view
  const generatedWhatsAppMessage = useMemo(() => {
    if (serverQuote?.whatsapp_message) {
      return serverQuote.whatsapp_message;
    }

    if (activeItems.length === 0) return "No products selected.";

    const lines: string[] = ["✨ *SUBIDHA FURNITURE & APPLIANCES — PRICE LIST*"];
    if (customerName.trim()) {
      lines.push(`👤 *Prepared for:* ${customerName.trim()}`);
    }
    lines.push(
      "📍 Asansol, West Bengal · 📞 +91 7602283000",
      `🌐 ${origin}`,
      "------------------------------------------",
      `Hello! Here is the custom price list for your selected ${activeItems.length} product(s):`,
      ""
    );

    const roots = activeItems.filter((i) => !i.isChild);
    const orphans = activeItems.filter((i) => i.isChild && !roots.some((r) => r.id === i.parentId));

    const renderSchemePricing = (item: ResolvedCatalogItem, prefix = ""): string[] => {
      const pLines: string[] = [];
      const price = item.basePrice;

      if (!item.hasPrice) {
        pLines.push(`${prefix}ℹ️ *Price:* On Request / Contact Showroom`);
        return pLines;
      }

      if (schemes.direct_sale && price > 0) {
        pLines.push(`${prefix}💰 *Direct Sale (MRP):* ${formatCurrency(price)}`);
      }
      if (schemes.rent && price > 0) {
        pLines.push(`${prefix}🏠 *Monthly Rent:*`);
        for (const t of selectedRentTenures) {
          const m = Math.round((price * item.rentYieldPercent * 12) / t / 100);
          pLines.push(`${prefix}   • ${t} Months: *₹${m.toLocaleString("en-IN")}/mo*`);
        }
      }
      if (schemes.lease && price > 0) {
        pLines.push(`${prefix}🏢 *Monthly Lease:*`);
        for (const t of selectedLeaseTenures) {
          const m = Math.round((price * item.leaseYieldPercent * 12) / t / 100);
          pLines.push(`${prefix}   • ${t} Months: *₹${m.toLocaleString("en-IN")}/mo*`);
        }
      }
      if (schemes.sfemi && price > 0) {
        for (const t of selectedSfemiTenures) {
          const m = Math.round(price / t);
          if (t === 15) {
            pLines.push(
              `${prefix}⭐ *SFEMI 15-Month Special Promotion:* *₹${m.toLocaleString("en-IN")}/mo* (15 mos · Remaining Future EMIs Waived!)`
            );
          } else {
            pLines.push(`${prefix}⭐ *SFEMI ${t}-Month Plan:* *₹${m.toLocaleString("en-IN")}/mo*`);
          }
        }
      }
      return pLines;
    };

    let idx = 1;
    for (const root of roots) {
      lines.push(`${idx}. 📌 *${root.name}* (Code: \`${root.code}\`)`);
      if (root.category) lines.push(`   📁 Category: ${root.category}`);
      if (root.specs.length > 0) lines.push(`   ℹ️ Specs: ${root.specs.join(" | ")}`);

      const children = activeItems.filter((i) => i.parentId === root.id);
      if (children.length === 0) {
        lines.push(...renderSchemePricing(root, "   "));
        lines.push(`   🔗 *View & Enquire:* ${root.publicUrl}`);
      } else {
        lines.push(`   📦 *Available Variations & Models (${children.length}):*`);
        for (const child of children) {
          lines.push(`\n   🔹 *${child.fullName}* (SKU: \`${child.sku}\`)`);
          if (child.specs.length > 0) lines.push(`      Specs: ${child.specs.join(" | ")}`);
          lines.push(...renderSchemePricing(child, "      "));
          lines.push(`      🔗 *Open Link / Scan QR:* ${child.publicUrl}`);
        }
      }
      lines.push("");
      idx++;
    }

    for (const orphan of orphans) {
      lines.push(`${idx}. 🔹 *${orphan.fullName}* (SKU: \`${orphan.sku}\`)`);
      if (orphan.category) lines.push(`   📁 Category: ${orphan.category}`);
      if (orphan.specs.length > 0) lines.push(`   ℹ️ Specs: ${orphan.specs.join(" | ")}`);
      lines.push(...renderSchemePricing(orphan, "   "));
      lines.push(`   🔗 *View & Enquire:* ${orphan.publicUrl}`);
      lines.push("");
      idx++;
    }

    lines.push("------------------------------------------");
    lines.push("📲 *Scan QR codes or open any product link above to view photos, specs, and confirm terms.*");
    lines.push("✅ Transparent terms · Doorstep delivery · Quick approval");

    return lines.join("\n");
  }, [
    serverQuote,
    activeItems,
    customerName,
    schemes,
    selectedRentTenures,
    selectedLeaseTenures,
    selectedSfemiTenures,
    origin,
  ]);

  // URL-safe summary message that NEVER triggers ERR_CONNECTION_CLOSED
  const generatedWhatsAppSummaryMessage = useMemo(() => {
    if (serverQuote?.whatsapp_summary_message) {
      return serverQuote.whatsapp_summary_message;
    }

    const lines: string[] = ["✨ *SUBIDHA FURNITURE & APPLIANCES — PRICE LIST*"];
    if (customerName.trim()) {
      lines.push(`👤 *Prepared for:* ${customerName.trim()}`);
    }
    lines.push(
      "📍 Asansol, West Bengal · 📞 +91 7602283000",
      `🌐 ${origin}`,
      "------------------------------------------",
      `Hello! Here is the pricing overview for your selected ${activeItems.length} product(s):`,
      ""
    );

    const sample = activeItems.slice(0, 3);
    sample.forEach((item, i) => {
      lines.push(`${i + 1}. 📌 *${item.fullName}* (SKU: \`${item.sku}\`)`);
      if (item.hasPrice) {
        if (schemes.direct_sale) lines.push(`   💰 Direct Sale: ${formatCurrency(item.basePrice)}`);
        if (schemes.rent) {
          const t1 = selectedRentTenures[0] || 12;
          const m = Math.round((item.basePrice * item.rentYieldPercent * 12) / t1 / 100);
          lines.push(`   🏠 Rent (${t1}m): ₹${m.toLocaleString("en-IN")}/mo`);
        }
        if (schemes.sfemi && selectedSfemiTenures.includes(15)) {
          const m15 = Math.round(item.basePrice / 15);
          lines.push(`   ⭐ SFEMI 15m Promo: ₹${m15.toLocaleString("en-IN")}/mo (Future EMIs Waived!)`);
        }
      } else {
        lines.push("   ℹ️ Price on Request");
      }
      lines.push("");
    });

    if (activeItems.length > 3) {
      lines.push(`*(+ ${activeItems.length - 3} more products in your complete quotation)*`);
      lines.push("📋 *Full detailed itemized list copied to clipboard! Paste below to view all items.*");
      lines.push("");
    }

    lines.push(
      `🔗 *Browse Online Catalog:* ${origin}/products`,
      "------------------------------------------",
      "✅ Transparent terms · Doorstep delivery · Quick approval"
    );

    return lines.join("\n");
  }, [
    serverQuote,
    activeItems,
    customerName,
    schemes,
    selectedRentTenures,
    selectedSfemiTenures,
    origin,
  ]);

  // Copy helper
  const handleCopy = (text: string, key: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  // WhatsApp Send helper: Guaranteed to never fail with ERR_CONNECTION_CLOSED
  const handleSendWhatsApp = () => {
    // 1. Always copy the FULL detailed itemized list to clipboard first!
    void navigator.clipboard.writeText(generatedWhatsAppMessage);

    // 2. Determine URL text: if full text is short (< 1800 chars), send full text; otherwise send summary
    const fullEncoded = encodeURIComponent(generatedWhatsAppMessage);
    const isMassive = fullEncoded.length > 1800;
    const messageToSend = isMassive ? generatedWhatsAppSummaryMessage : generatedWhatsAppMessage;
    const finalEncoded = encodeURIComponent(messageToSend);

    if (isMassive) {
      setStatusNotification(
        `📋 Full ${activeItems.length}-item price list copied to clipboard! Opening WhatsApp with overview summary...`
      );
      setTimeout(() => setStatusNotification(null), 5000);
    }

    const cleanNumber = customerPhone.replace(/[^0-9]/g, "");
    let url = "";
    if (cleanNumber.length >= 10) {
      const formatted = cleanNumber.length === 10 ? `91${cleanNumber}` : cleanNumber;
      url = `https://wa.me/${formatted}?text=${finalEncoded}`;
    } else {
      url = `https://wa.me/?text=${finalEncoded}`;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // Print helper: prints seamless multi-page sheet across 100, 200, 500+ items
  const handlePrint = () => {
    window.print();
  };

  // Helper to find server quote item
  const findServerItem = (id: number): PriceListQuoteItem | undefined => {
    return serverQuote?.items?.find((i) => i.id === id);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto print-modal-overlay">
      {/* BULLETPROOF MULTI-PAGE PRINT STYLES */}
      <style>{`
        @media print {
          /* 1. Unclamp document roots for infinite multi-page pagination */
          html, body {
            overflow: visible !important;
            height: auto !important;
            min-height: auto !important;
            background: white !important;
            color: black !important;
          }

          /* 2. Hide all regular app and modal chrome */
          body * {
            visibility: hidden;
          }

          /* 3. Unclamp modal parents so content is never restricted to 1 viewport height */
          .print-modal-overlay,
          .print-modal-card,
          .print-modal-body {
            position: static !important;
            overflow: visible !important;
            max-height: none !important;
            height: auto !important;
            width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            border: none !important;
            box-shadow: none !important;
            background: white !important;
            transform: none !important;
          }

          .no-print,
          .screen-only {
            display: none !important;
          }

          /* 4. Display the catalog print sheet clearly across all pages */
          .catalog-print-sheet,
          .catalog-print-sheet * {
            visibility: visible !important;
          }

          .catalog-print-sheet {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 8mm 10mm !important;
            background: white !important;
            color: black !important;
          }

          /* 5. Clean, repeating table headers across every page */
          table {
            width: 100% !important;
            page-break-inside: auto !important;
            border-collapse: collapse !important;
          }

          thead {
            display: table-header-group !important; /* Repeats table header on every printed page! */
          }

          tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          .print-card-item {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            margin-bottom: 12px !important;
          }
        }
      `}</style>

      <div className="relative w-full max-w-7xl max-h-[96vh] flex flex-col rounded-2xl bg-card border border-border shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200 print-modal-card">
        {/* Modal Header */}
        <div className="no-print flex items-center justify-between border-b border-border px-5 py-3.5 bg-muted/30">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
              <Share2 className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-foreground">
                  Product Catalog & Price List Generator
                </h2>
                <span className="rounded-full bg-primary/15 text-primary border border-primary/30 px-2.5 py-0.5 text-xs font-semibold">
                  {totalBaseCount} Blueprints · {totalVariantCount} SKUs ({pricedCount} Priced)
                </span>
                {isLoadingQuote && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground animate-pulse">
                    <Loader2 className="h-3 w-3 animate-spin text-primary" /> Calculating pricing...
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Multi-scheme price lists across Direct Sale, Rent, Lease, & SFEMI (15m Promotion) with QR codes for direct handover & WhatsApp.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Global Toolbar: Customer & Scope */}
        <div className="no-print border-b border-border bg-background/95 px-5 py-3 space-y-2.5">
          {/* Row 1: Customer details & Scope */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center">
            <div className="md:col-span-4 flex items-center gap-2">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5 shrink-0">
                <User className="h-3.5 w-3.5 text-primary" /> Customer Name:
              </span>
              <input
                type="text"
                placeholder="e.g. Ramesh Sen"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="h-8 flex-1 rounded-lg border border-border bg-card px-2.5 text-xs font-medium placeholder:text-muted-foreground focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="md:col-span-4 flex items-center gap-2">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5 shrink-0">
                <Phone className="h-3.5 w-3.5 text-emerald-600" /> WhatsApp / Phone:
              </span>
              <input
                type="tel"
                placeholder="e.g. 9876543210"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="h-8 flex-1 rounded-lg border border-border bg-card px-2.5 text-xs font-medium placeholder:text-muted-foreground focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="md:col-span-4 flex items-center justify-end gap-2 flex-wrap">
              {/* Load Full Database Button */}
              {extraLoadedProducts.length === 0 && (
                <button
                  type="button"
                  disabled={isLoadingAllCatalog}
                  onClick={handleLoadFullDatabaseCatalog}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 px-2.5 py-1 text-xs font-semibold hover:bg-indigo-100 transition cursor-pointer"
                  title="Load all products from database for printing 100-500+ items"
                >
                  <RefreshCw className={`h-3 w-3 ${isLoadingAllCatalog ? "animate-spin" : ""}`} />
                  Load Entire Catalog (500 prods)
                </button>
              )}

              {/* Include Variants Toggle */}
              <label className="flex items-center gap-1.5 font-medium cursor-pointer bg-muted/40 hover:bg-muted px-2.5 py-1 rounded-lg border border-border transition text-xs">
                <input
                  type="checkbox"
                  checked={includeVariants}
                  onChange={(e) => setIncludeVariants(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
                />
                <span className="text-foreground font-semibold">Variants</span>
              </label>
            </div>
          </div>

          {/* Row 2: Filters Bar (Unpriced Filter, Category Filter, Stock Filter, Type Filter) */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-border/40 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-foreground flex items-center gap-1 uppercase text-[10px] tracking-wider text-muted-foreground">
                <Filter className="h-3 w-3" /> Filters:
              </span>

              {/* 1. Only Priced Products Filter (Requested by user) */}
              <label className="flex items-center gap-1.5 font-semibold cursor-pointer bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 px-2.5 py-1 rounded-md border border-emerald-200 dark:border-emerald-800 transition">
                <input
                  type="checkbox"
                  checked={excludeUnpriced}
                  onChange={(e) => setExcludeUnpriced(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span>Only Priced Items (Hide ₹0)</span>
              </label>

              {/* 2. Category Filter (Requested by user) */}
              <div className="flex items-center gap-1">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="h-7 rounded-md border border-border bg-card px-2 text-xs font-semibold text-foreground max-w-[200px]"
                >
                  <option value="all">All Categories ({resolvedItems.length})</option>
                  {availableCategories.map(([cat, count]) => (
                    <option key={cat} value={cat}>
                      {cat} ({count})
                    </option>
                  ))}
                </select>
              </div>

              {/* 3. Stock Filter */}
              <select
                value={stockFilter}
                onChange={(e) => setStockFilter(e.target.value as any)}
                className="h-7 rounded-md border border-border bg-card px-2 text-xs font-medium text-foreground"
              >
                <option value="all">All Stock Status</option>
                <option value="in_stock">In-Stock Only</option>
                <option value="out_of_stock">Made to Order / Available</option>
              </select>

              {/* 4. Item Type Filter */}
              <select
                value={itemTypeFilter}
                onChange={(e) => setItemTypeFilter(e.target.value as any)}
                className="h-7 rounded-md border border-border bg-card px-2 text-xs font-medium text-foreground"
              >
                <option value="all">Blueprints & Variants</option>
                <option value="base_only">Base Blueprints Only</option>
                <option value="variants_only">Variant SKUs Only</option>
              </select>
            </div>

            {/* Quick Category Pills */}
            <div className="hidden lg:flex items-center gap-1 text-[11px]">
              <span className="text-muted-foreground text-[10px]">Quick:</span>
              <button
                type="button"
                onClick={() => setSelectedCategory("all")}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
                  selectedCategory === "all"
                    ? "bg-primary text-primary-foreground font-bold"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                All
              </button>
              {availableCategories.slice(0, 3).map(([cat, count]) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer truncate max-w-[140px] ${
                    selectedCategory === cat
                      ? "bg-primary text-primary-foreground font-bold"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                  title={`${cat} (${count})`}
                >
                  {cat.split("/").pop()?.trim()} ({count})
                </button>
              ))}
            </div>
          </div>

          {/* Row 3: Schemes & Tenure Selectors */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border/40 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-foreground uppercase text-[10px] tracking-wider text-muted-foreground">
                Schemes:
              </span>
              <label className="flex items-center gap-1 cursor-pointer bg-muted/40 hover:bg-muted px-2 py-0.5 rounded border border-border">
                <input
                  type="checkbox"
                  checked={schemes.direct_sale}
                  onChange={(e) => setSchemes((p) => ({ ...p, direct_sale: e.target.checked }))}
                  className="rounded border-border text-primary"
                />
                <span className="font-semibold text-foreground">Direct Sale (MRP)</span>
              </label>

              {/* Rent Chips */}
              <div className="flex items-center gap-1 bg-sky-50/70 dark:bg-sky-950/30 px-2 py-0.5 rounded border border-sky-200 dark:border-sky-800">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={schemes.rent}
                    onChange={(e) => setSchemes((p) => ({ ...p, rent: e.target.checked }))}
                    className="rounded border-sky-400 text-sky-600"
                  />
                  <span className="font-bold text-sky-800 dark:text-sky-300">Rent:</span>
                </label>
                {AVAILABLE_RENT_TENURES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    disabled={!schemes.rent}
                    onClick={() => toggleRentTenure(t)}
                    className={`px-1.5 py-0.2 rounded text-[10px] font-bold border transition cursor-pointer ${
                      selectedRentTenures.includes(t) && schemes.rent
                        ? "bg-sky-600 text-white border-sky-600"
                        : "bg-card text-muted-foreground border-border"
                    }`}
                  >
                    {t}m
                  </button>
                ))}
              </div>

              {/* Lease Chips */}
              <div className="flex items-center gap-1 bg-indigo-50/70 dark:bg-indigo-950/30 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={schemes.lease}
                    onChange={(e) => setSchemes((p) => ({ ...p, lease: e.target.checked }))}
                    className="rounded border-indigo-400 text-indigo-600"
                  />
                  <span className="font-bold text-indigo-800 dark:text-indigo-300">Lease:</span>
                </label>
                {AVAILABLE_LEASE_TENURES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    disabled={!schemes.lease}
                    onClick={() => toggleLeaseTenure(t)}
                    className={`px-1.5 py-0.2 rounded text-[10px] font-bold border transition cursor-pointer ${
                      selectedLeaseTenures.includes(t) && schemes.lease
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-card text-muted-foreground border-border"
                    }`}
                  >
                    {t}m
                  </button>
                ))}
              </div>

              {/* SFEMI Promotion Chips */}
              <div className="flex items-center gap-1 bg-emerald-50/70 dark:bg-emerald-950/30 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={schemes.sfemi}
                    onChange={(e) => setSchemes((p) => ({ ...p, sfemi: e.target.checked }))}
                    className="rounded border-emerald-400 text-emerald-600"
                  />
                  <span className="font-bold text-emerald-800 dark:text-emerald-300">SFEMI:</span>
                </label>
                <button
                  type="button"
                  disabled={!schemes.sfemi}
                  onClick={() => toggleSfemiTenure(12)}
                  className={`px-1.5 py-0.2 rounded text-[10px] font-bold border transition cursor-pointer ${
                    selectedSfemiTenures.includes(12) && schemes.sfemi
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-card text-muted-foreground border-border"
                  }`}
                >
                  12m
                </button>
                <button
                  type="button"
                  disabled={!schemes.sfemi}
                  onClick={() => toggleSfemiTenure(15)}
                  className={`px-1.5 py-0.2 rounded text-[10px] font-bold border transition cursor-pointer ${
                    selectedSfemiTenures.includes(15) && schemes.sfemi
                      ? "bg-amber-500 text-white border-amber-600 ring-1 ring-amber-400"
                      : "bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border-amber-300"
                  }`}
                  title="15-Month SFEMI Special Promotional Plan: Remaining Future EMIs Waived!"
                >
                  ⭐ 15m Promo
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-[11px]">Deposit:</span>
              <select
                value={depositPercent ?? "auto"}
                onChange={(e) => setDepositPercent(e.target.value === "auto" ? null : Number(e.target.value))}
                className="h-6 rounded border border-border bg-card px-1.5 text-[11px] font-semibold"
              >
                <option value="auto">Auto Band (20–30%)</option>
                <option value={15}>15% Refundable</option>
                <option value={20}>20% Refundable</option>
                <option value={25}>25% Refundable</option>
                <option value={30}>30% Refundable</option>
              </select>
            </div>
          </div>
        </div>

        {/* Modal Navigation Tabs & Notifications */}
        <div className="no-print flex items-center justify-between border-b border-border bg-muted/20 px-5 pt-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTab("matrix")}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition cursor-pointer ${
                activeTab === "matrix"
                  ? "border-primary text-primary bg-background rounded-t-lg shadow-2xs"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <TableIcon className="h-3.5 w-3.5" />
              Tailored Price Matrix ({activeItems.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("whatsapp")}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition cursor-pointer ${
                activeTab === "whatsapp"
                  ? "border-emerald-600 text-emerald-700 dark:text-emerald-400 bg-background rounded-t-lg shadow-2xs"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
              WhatsApp Share Message
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("print")}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition cursor-pointer ${
                activeTab === "print"
                  ? "border-primary text-primary bg-background rounded-t-lg shadow-2xs"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Printer className="h-3.5 w-3.5" />
              Printable / Offline Handover Sheet
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("links")}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition cursor-pointer ${
                activeTab === "links"
                  ? "border-sky-600 text-sky-700 dark:text-sky-400 bg-background rounded-t-lg shadow-2xs"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <QrCode className="h-3.5 w-3.5 text-sky-600" />
              Digital QR Links
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("text")}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition cursor-pointer ${
                activeTab === "text"
                  ? "border-violet-600 text-violet-700 dark:text-violet-400 bg-background rounded-t-lg shadow-2xs"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <FileText className="h-3.5 w-3.5 text-violet-600" />
              Summary Text
            </button>
          </div>

          {/* Status Toast Banner */}
          {statusNotification && (
            <div className="animate-in fade-in flex items-center gap-1.5 text-xs font-semibold text-emerald-800 bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 px-3 py-1 rounded-full border border-emerald-300 dark:border-emerald-800 shadow-2xs">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              {statusNotification}
            </div>
          )}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 bg-muted/10 space-y-4 print-modal-body">
          {/* TAB 0: Interactive Dynamic Price Matrix Table */}
          {activeTab === "matrix" && (
            <div className="no-print space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 bg-card p-3 rounded-xl border border-border shadow-xs">
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="text-muted-foreground">
                    Showing <strong>{activeItems.length}</strong> items:
                  </span>
                  <input
                    type="text"
                    placeholder="Search by code, SKU, or name..."
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    className="h-7 w-48 sm:w-60 rounded-md border border-border bg-background px-2.5 text-xs"
                  />
                  <button
                    type="button"
                    onClick={selectAllPriced}
                    className="text-[11px] text-emerald-600 hover:underline font-bold ml-1 cursor-pointer"
                  >
                    Select Priced ({pricedCount})
                  </button>
                  <span className="text-muted-foreground/40">·</span>
                  <button
                    type="button"
                    onClick={selectAllIncludingUnpriced}
                    className="text-[11px] text-primary hover:underline font-semibold cursor-pointer"
                  >
                    Select All ({resolvedItems.length})
                  </button>
                  <span className="text-muted-foreground/40">·</span>
                  <button
                    type="button"
                    onClick={clearAllSelections}
                    className="text-[11px] text-muted-foreground hover:underline cursor-pointer"
                  >
                    Clear All
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSendWhatsApp}
                    className="inline-flex items-center gap-1.5 h-8 rounded-lg bg-[#25D366] hover:bg-[#20ba59] text-white px-3 text-xs font-semibold shadow-2xs transition cursor-pointer"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    Send via WhatsApp
                  </button>
                  <button
                    type="button"
                    onClick={handlePrint}
                    className="inline-flex items-center gap-1.5 h-8 rounded-lg bg-primary text-primary-foreground px-3 text-xs font-semibold hover:opacity-90 shadow-2xs transition cursor-pointer"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Print Multi-Page Sheet ({activeItems.length})
                  </button>
                </div>
              </div>

              {/* Dynamic Table */}
              <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-muted/60 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase">
                    <tr>
                      <th className="px-3 py-2 text-center w-10">Select</th>
                      <th className="px-3 py-2 w-16">QR</th>
                      <th className="px-3 py-2 min-w-[200px]">Product & Variant SKU</th>
                      <th className="px-3 py-2 text-center">Stock</th>
                      {schemes.direct_sale && (
                        <th className="px-3 py-2 text-right whitespace-nowrap bg-muted/40 font-bold text-foreground">
                          Direct Sale (MRP)
                        </th>
                      )}
                      {schemes.rent &&
                        selectedRentTenures.map((t) => (
                          <th
                            key={`rent_${t}`}
                            className="px-3 py-2 text-right whitespace-nowrap bg-sky-50/50 dark:bg-sky-950/30 text-sky-800 dark:text-sky-300 font-bold"
                          >
                            Rent {t}m
                          </th>
                        ))}
                      {schemes.lease &&
                        selectedLeaseTenures.map((t) => (
                          <th
                            key={`lease_${t}`}
                            className="px-3 py-2 text-right whitespace-nowrap bg-indigo-50/50 dark:bg-indigo-950/30 text-indigo-800 dark:text-indigo-300 font-bold"
                          >
                            Lease {t}m
                          </th>
                        ))}
                      {schemes.sfemi &&
                        selectedSfemiTenures.map((t) => (
                          <th
                            key={`sfemi_${t}`}
                            className={`px-3 py-2 text-right whitespace-nowrap font-bold ${
                              t === 15
                                ? "bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 border-x border-amber-300 dark:border-amber-700"
                                : "bg-emerald-50/50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300"
                            }`}
                          >
                            {t === 15 ? "⭐ SFEMI 15m (Promo)" : `SFEMI ${t}m`}
                          </th>
                        ))}
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {activeItems.map((item) => {
                      const sItem = findServerItem(item.id);
                      const price = item.basePrice;

                      return (
                        <tr
                          key={item.id}
                          className={`hover:bg-muted/30 transition ${item.isChild ? "bg-muted/5" : ""} ${!item.hasPrice ? "opacity-75" : ""}`}
                        >
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(item.id)}
                              onChange={() => toggleItemSelection(item.id)}
                              className="rounded border-border text-primary cursor-pointer"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-col items-center p-1 rounded bg-white border border-slate-200 w-14 shadow-2xs">
                              <QRCode
                                value={item.publicUrl}
                                size={44}
                                level="M"
                                style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                              />
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-foreground text-xs">{item.fullName}</span>
                              {item.isChild ? (
                                <span className="text-[9px] font-semibold text-violet-700 bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800 rounded px-1.5 py-0.2">
                                  Variant SKU
                                </span>
                              ) : (
                                <span className="text-[9px] font-semibold text-blue-700 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded px-1.5 py-0.2">
                                  Base Blueprint
                                </span>
                              )}
                              {!item.hasPrice && (
                                <span className="text-[9px] font-semibold text-amber-800 bg-amber-100 dark:bg-amber-950/40 border border-amber-300 rounded px-1.5 py-0.2">
                                  Price Pending
                                </span>
                              )}
                            </div>
                            <div className="font-mono text-[10px] text-muted-foreground mt-0.5">
                              SKU: {item.sku} {item.brand ? `· ${item.brand}` : ""}
                            </div>
                            <div className="text-[10px] text-muted-foreground">{item.category}</div>
                            {item.specs.length > 0 && (
                              <div className="text-[10px] text-muted-foreground mt-0.5">
                                {item.specs.join(" · ")}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center whitespace-nowrap">
                            {item.currentStock > 0 ? (
                              <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200">
                                {item.currentStock} Ready
                              </span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">Order</span>
                            )}
                          </td>

                          {/* Direct Sale Column */}
                          {schemes.direct_sale && (
                            <td className="px-3 py-2 text-right font-bold text-foreground bg-muted/10 whitespace-nowrap">
                              {item.hasPrice ? formatCurrency(price) : <span className="text-muted-foreground font-normal">Contact store</span>}
                            </td>
                          )}

                          {/* Rent Columns */}
                          {schemes.rent &&
                            selectedRentTenures.map((t) => {
                              if (!item.hasPrice) {
                                return (
                                  <td key={`rent_${item.id}_${t}`} className="px-3 py-2 text-right text-muted-foreground">
                                    -
                                  </td>
                                );
                              }
                              const sRent = sItem?.quotes?.rent?.tenures?.[String(t)];
                              const monthly = sRent
                                ? Number(sRent.monthly_amount)
                                : Math.round((price * item.rentYieldPercent * 12) / t / 100);
                              const deposit = sRent
                                ? Number(sRent.deposit_amount)
                                : Math.round((price * (depositPercent ?? 20)) / 100);

                              return (
                                <td
                                  key={`rent_${item.id}_${t}`}
                                  className="px-3 py-2 text-right bg-sky-50/20 dark:bg-sky-950/10 whitespace-nowrap"
                                >
                                  <div className="font-bold text-sky-700 dark:text-sky-400">
                                    ₹{monthly.toLocaleString("en-IN")}/mo
                                  </div>
                                  <div className="text-[9px] text-muted-foreground">
                                    Dep: ₹{deposit.toLocaleString("en-IN")}
                                  </div>
                                </td>
                              );
                            })}

                          {/* Lease Columns */}
                          {schemes.lease &&
                            selectedLeaseTenures.map((t) => {
                              if (!item.hasPrice) {
                                return (
                                  <td key={`lease_${item.id}_${t}`} className="px-3 py-2 text-right text-muted-foreground">
                                    -
                                  </td>
                                );
                              }
                              const sLease = sItem?.quotes?.lease?.tenures?.[String(t)];
                              const monthly = sLease
                                ? Number(sLease.monthly_amount)
                                : Math.round((price * item.leaseYieldPercent * 12) / t / 100);
                              const deposit = sLease
                                ? Number(sLease.deposit_amount)
                                : Math.round((price * (depositPercent ?? 20)) / 100);

                              return (
                                <td
                                  key={`lease_${item.id}_${t}`}
                                  className="px-3 py-2 text-right bg-indigo-50/20 dark:bg-indigo-950/10 whitespace-nowrap"
                                >
                                  <div className="font-bold text-indigo-700 dark:text-indigo-400">
                                    ₹{monthly.toLocaleString("en-IN")}/mo
                                  </div>
                                  <div className="text-[9px] text-muted-foreground">
                                    Dep: ₹{deposit.toLocaleString("en-IN")}
                                  </div>
                                </td>
                              );
                            })}

                          {/* SFEMI Columns */}
                          {schemes.sfemi &&
                            selectedSfemiTenures.map((t) => {
                              if (!item.hasPrice) {
                                return (
                                  <td key={`sfemi_${item.id}_${t}`} className="px-3 py-2 text-right text-muted-foreground">
                                    -
                                  </td>
                                );
                              }
                              const sSfemi = sItem?.quotes?.sfemi?.tenures?.[String(t)];
                              const monthly = sSfemi ? Number(sSfemi.monthly_amount) : Math.round(price / t);
                              const isPromo = t === 15;

                              return (
                                <td
                                  key={`sfemi_${item.id}_${t}`}
                                  className={`px-3 py-2 text-right whitespace-nowrap ${
                                    isPromo
                                      ? "bg-amber-50/60 dark:bg-amber-950/20 border-x border-amber-200 dark:border-amber-800"
                                      : "bg-emerald-50/20 dark:bg-emerald-950/10"
                                  }`}
                                >
                                  <div
                                    className={`font-bold ${isPromo ? "text-amber-800 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-400"}`}
                                  >
                                    ₹{monthly.toLocaleString("en-IN")}/mo
                                  </div>
                                  <div className="text-[9px] text-muted-foreground">
                                    {isPromo ? (
                                      <span className="font-semibold text-amber-700 dark:text-amber-400">
                                        Future EMIs Waived
                                      </span>
                                    ) : (
                                      "Advance EMI"
                                    )}
                                  </div>
                                </td>
                              );
                            })}

                          {/* Actions */}
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleCopy(item.publicUrl, `matrix_url_${item.id}`)}
                                className="p-1.5 rounded-md border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition cursor-pointer"
                                title="Copy public link"
                              >
                                {copiedKey === `matrix_url_${item.id}` ? (
                                  <Check className="h-3.5 w-3.5 text-green-600" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" />
                                )}
                              </button>
                              <a
                                href={item.publicUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 rounded-md border border-border hover:bg-muted text-primary transition"
                                title="Open in Public Catalog"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 1: WhatsApp Broadcast Message */}
          {activeTab === "whatsapp" && (
            <div className="no-print space-y-4 max-w-4xl mx-auto">
              <div className="flex flex-wrap items-center justify-between gap-3 bg-card p-4 rounded-xl border border-border shadow-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-foreground">
                    Prepared for: {customerName.trim() || "Valued Customer"}
                  </span>
                  {customerPhone && <span className="text-xs text-muted-foreground">({customerPhone})</span>}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSendWhatsApp}
                    className="inline-flex items-center gap-1.5 h-9 rounded-xl bg-[#25D366] hover:bg-[#20ba59] text-white px-4 text-xs font-semibold shadow-sm transition cursor-pointer"
                  >
                    <MessageCircle className="h-4 w-4" />
                    {customerPhone.trim() ? `Send via WhatsApp (+91 ${customerPhone.trim()})` : "Share via WhatsApp"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopy(generatedWhatsAppMessage, "whatsapp_msg")}
                    className="inline-flex items-center gap-1.5 h-9 rounded-xl border border-border bg-background hover:bg-muted text-foreground px-3 text-xs font-medium transition cursor-pointer"
                  >
                    {copiedKey === "whatsapp_msg" ? (
                      <>
                        <Check className="h-4 w-4 text-green-600" />
                        Copied Complete Message!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        Copy Full Message
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Message Preview Box */}
              <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/30 dark:bg-emerald-950/20 p-5">
                <div className="flex items-center justify-between mb-3 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                  <span className="flex items-center gap-1.5">
                    <MessageCircle className="h-4 w-4 text-emerald-600" /> WhatsApp Message Preview
                  </span>
                  <span>{activeItems.length} Products & Variations Included</span>
                </div>
                <pre className="whitespace-pre-wrap font-sans text-xs text-foreground leading-relaxed bg-card p-4 rounded-xl border border-border/80 shadow-xs max-h-[500px] overflow-y-auto">
                  {generatedWhatsAppMessage}
                </pre>
              </div>
            </div>
          )}

          {/* TAB 2: On-screen preview of Printable Sheet */}
          {activeTab === "print" && (
            <div className="no-print space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 bg-card p-4 rounded-xl border border-border shadow-xs">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-muted-foreground">Print Layout:</span>
                  <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/30">
                    <button
                      type="button"
                      onClick={() => setPrintLayout("matrix")}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition cursor-pointer ${
                        printLayout === "matrix"
                          ? "bg-card text-foreground shadow-xs font-semibold"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Compact Table Matrix (Best for 50–500 products handover)
                    </button>
                    <button
                      type="button"
                      onClick={() => setPrintLayout("cards")}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition cursor-pointer ${
                        printLayout === "cards"
                          ? "bg-card text-foreground shadow-xs font-semibold"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Showroom Visual Cards
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePrint}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2 text-xs font-semibold hover:opacity-90 shadow-sm transition cursor-pointer"
                  >
                    <Printer className="h-4 w-4" />
                    Print / Save as PDF ({activeItems.length} items)
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Digital Showcase & QR Links */}
          {activeTab === "links" && (
            <div className="no-print space-y-4 max-w-5xl mx-auto">
              <div className="bg-card p-4 rounded-xl border border-border shadow-xs flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-bold text-foreground">Public Interactive Product Links & QR Codes</h3>
                  <p className="text-[11px] text-muted-foreground">
                    Public users who receive these links or scan QR codes land on the exact product and variant page.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const allUrls = activeItems.map((i) => `${i.fullName}: ${i.publicUrl}`).join("\n");
                      handleCopy(allUrls, "all_urls");
                    }}
                    className="inline-flex items-center gap-1.5 h-8 rounded-lg border border-border bg-background hover:bg-muted text-xs font-medium px-3 transition cursor-pointer"
                  >
                    {copiedKey === "all_urls" ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                    Copy All Links
                  </button>
                  <a
                    href={`${origin}/products`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 h-8 rounded-lg bg-primary text-primary-foreground text-xs font-semibold px-3 transition"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open Public Catalogue
                  </a>
                </div>
              </div>

              {/* Items List with Live QR and Link Copy */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {activeItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 p-3.5 rounded-xl border border-border bg-card shadow-2xs"
                  >
                    <div className="p-1.5 rounded-lg bg-white border border-slate-200 shrink-0">
                      <QRCode
                        value={item.publicUrl}
                        size={64}
                        level="M"
                        style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-xs text-foreground truncate">{item.fullName}</span>
                      </div>
                      <div className="font-mono text-[10px] text-muted-foreground mt-0.5">
                        SKU: {item.sku} · {item.hasPrice ? formatCurrency(item.basePrice) : "Price on Request"}
                      </div>
                      <a
                        href={item.publicUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-primary hover:underline truncate block mt-1"
                      >
                        {item.publicUrl}
                      </a>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(item.publicUrl, `url_${item.id}`)}
                      className="p-2 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground shrink-0 transition cursor-pointer"
                      title="Copy Public URL"
                    >
                      {copiedKey === `url_${item.id}` ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: Plain Text / Email Summary */}
          {activeTab === "text" && (
            <div className="no-print space-y-4 max-w-4xl mx-auto">
              <div className="flex items-center justify-between bg-card p-4 rounded-xl border border-border shadow-xs">
                <div>
                  <h3 className="text-xs font-bold text-foreground">Plain Text & Email Summary</h3>
                  <p className="text-[11px] text-muted-foreground">
                    Formatted text table ready to copy into customer quotation emails, invoices, or SMS.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(generatedWhatsAppMessage, "plain_text_summary")}
                  className="inline-flex items-center gap-1.5 h-9 rounded-xl bg-primary text-primary-foreground px-4 text-xs font-semibold hover:opacity-90 shadow-sm transition cursor-pointer"
                >
                  {copiedKey === "plain_text_summary" ? (
                    <>
                      <Check className="h-4 w-4" />
                      Copied Summary!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copy Text Summary
                    </>
                  )}
                </button>
              </div>

              <textarea
                readOnly
                value={generatedWhatsAppMessage}
                rows={18}
                className="w-full rounded-2xl border border-border bg-card p-4 font-mono text-xs text-foreground leading-relaxed focus:outline-none shadow-xs"
              />
            </div>
          )}

          {/* THE BULLETPROOF PRINT SHEET: ALWAYS MOUNTED IN DOM SO PRINT IS NEVER BLANK! */}
          <div
            id={printContainerId}
            className={`catalog-print-sheet bg-white text-black p-6 rounded-2xl border border-border shadow-sm space-y-5 ${
              activeTab === "print" ? "block" : "hidden print:block"
            }`}
          >
            {/* Header for Print Sheet */}
            <div className="border-b-2 border-black pb-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-black tracking-tight text-black uppercase">
                  Subidha Furniture & Appliances
                </h1>
                <p className="text-xs text-gray-700 font-semibold mt-0.5">
                  Official Showroom Price List · Direct Sale · Rent · Lease · SFEMI Advance EMI
                </p>
                <p className="text-[11px] text-gray-600 mt-1">
                  Showroom: G.T. Road, Asansol, West Bengal · Phone: +91 7602283000 · Web: subidhafurnitureasansol.com
                </p>
                {customerName.trim() && (
                  <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-gray-100 text-xs font-bold text-black border border-gray-300">
                    👤 Prepared for: <span className="underline">{customerName.trim()}</span>{" "}
                    {customerPhone.trim() ? `(${customerPhone.trim()})` : ""}
                  </div>
                )}
              </div>
              <div className="text-right text-xs">
                <span className="inline-block px-3 py-1 rounded bg-black text-white font-bold tracking-wider text-[11px]">
                  OFFICIAL PRICE LIST
                </span>
                <p className="text-[11px] text-gray-600 mt-1 font-medium">
                  Date: {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </p>
                <p className="text-[10px] text-gray-500 mt-0.5 font-mono">
                  {activeItems.length} Products & Variations
                </p>
              </div>
            </div>

            {/* Print Layout: Matrix or Cards */}
            {printLayout === "matrix" ? (
              <div className="overflow-visible">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-gray-100 border-b-2 border-gray-400 text-[10px] font-bold text-black uppercase tracking-wider">
                    <tr>
                      <th className="px-2 py-2 w-14">QR Code</th>
                      <th className="px-2 py-2">Product & Variant Details</th>
                      <th className="px-2 py-2">Specifications</th>
                      <th className="px-2 py-2 text-center w-16">Stock</th>
                      {schemes.direct_sale && <th className="px-2 py-2 text-right">Direct Sale</th>}
                      {schemes.rent &&
                        selectedRentTenures.map((t) => (
                          <th key={t} className="px-2 py-2 text-right">
                            Rent {t}m
                          </th>
                        ))}
                      {schemes.lease &&
                        selectedLeaseTenures.map((t) => (
                          <th key={t} className="px-2 py-2 text-right">
                            Lease {t}m
                          </th>
                        ))}
                      {schemes.sfemi &&
                        selectedSfemiTenures.map((t) => (
                          <th key={t} className="px-2 py-2 text-right font-black">
                            {t === 15 ? "SFEMI 15m (Promo)" : `SFEMI ${t}m`}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-300">
                    {activeItems.map((item) => {
                      const sItem = findServerItem(item.id);
                      const price = item.basePrice;

                      return (
                        <tr key={item.id} className="break-inside-avoid">
                          <td className="px-2 py-2 align-middle">
                            <div className="flex flex-col items-center p-0.5 rounded bg-white border border-gray-300 w-12">
                              <QRCode
                                value={item.publicUrl}
                                size={40}
                                level="M"
                                style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                              />
                              <span className="text-[6px] text-gray-600 font-bold mt-0.5">Scan</span>
                            </div>
                          </td>
                          <td className="px-2 py-2 align-middle">
                            <div className="font-bold text-black text-xs leading-snug">{item.fullName}</div>
                            <div className="font-mono text-[9px] text-gray-600">
                              SKU: {item.sku} {item.brand ? `· ${item.brand}` : ""}
                            </div>
                            <div className="text-[9px] text-gray-500">{item.category}</div>
                          </td>
                          <td className="px-2 py-2 align-middle">
                            <div className="text-[10px] text-gray-800">
                              {item.specs.length > 0 ? item.specs.join(" · ") : "Standard model"}
                            </div>
                          </td>
                          <td className="px-2 py-2 text-center align-middle whitespace-nowrap">
                            {item.currentStock > 0 ? (
                              <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold text-green-800 bg-green-50 border border-green-300">
                                {item.currentStock} Ready
                              </span>
                            ) : (
                              <span className="text-[9px] text-gray-500">Order</span>
                            )}
                          </td>
                          {schemes.direct_sale && (
                            <td className="px-2 py-2 text-right font-bold text-black align-middle whitespace-nowrap">
                              {item.hasPrice ? formatCurrency(price) : "Contact"}
                            </td>
                          )}
                          {schemes.rent &&
                            selectedRentTenures.map((t) => {
                              if (!item.hasPrice) {
                                return <td key={t} className="px-2 py-2 text-right text-gray-400 align-middle">-</td>;
                              }
                              const sRent = sItem?.quotes?.rent?.tenures?.[String(t)];
                              const m = sRent ? Number(sRent.monthly_amount) : Math.round((price * item.rentYieldPercent * 12) / t / 100);
                              return (
                                <td key={t} className="px-2 py-2 text-right align-middle whitespace-nowrap">
                                  <div className="font-bold text-black">₹{m.toLocaleString("en-IN")}/mo</div>
                                </td>
                              );
                            })}
                          {schemes.lease &&
                            selectedLeaseTenures.map((t) => {
                              if (!item.hasPrice) {
                                return <td key={t} className="px-2 py-2 text-right text-gray-400 align-middle">-</td>;
                              }
                              const sLease = sItem?.quotes?.lease?.tenures?.[String(t)];
                              const m = sLease ? Number(sLease.monthly_amount) : Math.round((price * item.leaseYieldPercent * 12) / t / 100);
                              return (
                                <td key={t} className="px-2 py-2 text-right align-middle whitespace-nowrap">
                                  <div className="font-bold text-black">₹{m.toLocaleString("en-IN")}/mo</div>
                                </td>
                              );
                            })}
                          {schemes.sfemi &&
                            selectedSfemiTenures.map((t) => {
                              if (!item.hasPrice) {
                                return <td key={t} className="px-2 py-2 text-right text-gray-400 align-middle">-</td>;
                              }
                              const sSfemi = sItem?.quotes?.sfemi?.tenures?.[String(t)];
                              const m = sSfemi ? Number(sSfemi.monthly_amount) : Math.round(price / t);
                              return (
                                <td key={t} className="px-2 py-2 text-right align-middle whitespace-nowrap font-black">
                                  <div className={t === 15 ? "text-black underline font-black" : "text-black font-bold"}>
                                    ₹{m.toLocaleString("en-IN")}/mo
                                  </div>
                                </td>
                              );
                            })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {activeItems.map((item) => (
                  <div
                    key={item.id}
                    className="print-card-item rounded-xl border border-gray-300 p-3 bg-white flex flex-col justify-between gap-2.5 break-inside-avoid shadow-2xs"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-white border border-gray-300 shrink-0">
                        <QRCode
                          value={item.publicUrl}
                          size={70}
                          level="M"
                          style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                        />
                        <span className="text-[8px] text-gray-600 font-bold mt-1 text-center">
                          Scan to View
                        </span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-xs text-black">{item.fullName}</div>
                        <p className="font-mono text-[10px] text-gray-600 mt-0.5">
                          Code: <strong>{item.code}</strong> {item.brand ? `· Brand: ${item.brand}` : ""}
                        </p>
                        <p className="text-[10px] text-gray-500">{item.category}</p>

                        {item.specs.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {item.specs.map((s, idx) => (
                              <span
                                key={idx}
                                className="text-[9px] font-medium bg-gray-100 px-1 py-0.2 rounded border border-gray-300 text-black"
                              >
                                {s}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Pricing Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-2 border-t border-gray-300 text-xs">
                      {schemes.direct_sale && (
                        <div className="p-1.5 rounded bg-gray-50 border border-gray-300">
                          <span className="block text-[9px] font-bold text-gray-600 uppercase">
                            Direct Sale
                          </span>
                          <span className="text-xs font-bold text-black">
                            {item.hasPrice ? formatCurrency(item.basePrice) : "On Request"}
                          </span>
                        </div>
                      )}

                      {schemes.rent && (
                        <div className="p-1.5 rounded bg-sky-50 border border-sky-300">
                          <span className="block text-[9px] font-bold text-sky-800 uppercase">
                            Rent
                          </span>
                          {selectedRentTenures.map((t) => {
                            const m = Math.round((item.basePrice * item.rentYieldPercent * 12) / t / 100);
                            return (
                              <div key={t} className="text-[10px] font-bold text-black">
                                {t}m: ₹{m.toLocaleString("en-IN")}/mo
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {schemes.lease && (
                        <div className="p-1.5 rounded bg-indigo-50 border border-indigo-300">
                          <span className="block text-[9px] font-bold text-indigo-800 uppercase">
                            Lease
                          </span>
                          {selectedLeaseTenures.map((t) => {
                            const m = Math.round((item.basePrice * item.leaseYieldPercent * 12) / t / 100);
                            return (
                              <div key={t} className="text-[10px] font-bold text-black">
                                {t}m: ₹{m.toLocaleString("en-IN")}/mo
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {schemes.sfemi && (
                        <div className="p-1.5 rounded bg-emerald-50 border border-emerald-300">
                          <span className="block text-[9px] font-bold text-emerald-800 uppercase">
                            SFEMI
                          </span>
                          {selectedSfemiTenures.map((t) => {
                            const m = Math.round(item.basePrice / t);
                            return (
                              <div key={t} className="text-[10px] font-black text-black">
                                {t === 15 ? "⭐ 15m Promo: " : `${t}m: `}₹{m.toLocaleString("en-IN")}/mo
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Print Footer */}
            <div className="pt-3 border-t-2 border-black text-[9px] text-gray-700 leading-normal flex items-start justify-between gap-4">
              <div>
                <p>
                  <strong>Terms & Notes:</strong> Indicative pricing based on current showroom catalog. Rent & Lease agreements require identity & address verification (KYC). Security deposit is 100% refundable upon product return in good order. SFEMI Advance EMI operates under approved transparent promotional benefits (Remaining Future EMIs Waived for Beneficiaries under the 15-Month Promotion).
                </p>
                <p className="mt-0.5">
                  Subidha Furniture & Appliances · Showroom: G.T. Road, Asansol, West Bengal · 📞 +91 7602283000 · 🌐 subidhafurnitureasansol.com
                </p>
              </div>
              <div className="shrink-0 text-right font-mono text-[9px] text-gray-500">
                Official Price List Sheet
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="no-print flex items-center justify-between border-t border-border px-5 py-3 bg-muted/20">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              Selected <strong>{activeItems.length}</strong> items for price list generation
            </span>
            {excludeUnpriced && (
              <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                (Unpriced items excluded)
              </span>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border px-4 py-2 text-xs font-medium hover:bg-muted text-foreground transition cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 text-primary px-4 py-2 text-xs font-semibold hover:bg-primary/20 transition cursor-pointer"
            >
              <Printer className="h-4 w-4" />
              Print Offline Handover Sheet
            </button>
            <button
              type="button"
              onClick={handleSendWhatsApp}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#25D366] hover:bg-[#20ba59] text-white px-4 py-2 text-xs font-semibold shadow-sm transition cursor-pointer"
            >
              <MessageCircle className="h-4 w-4" />
              {customerPhone.trim() ? `Send via WhatsApp (+91 ${customerPhone.trim()})` : "Share on WhatsApp"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
