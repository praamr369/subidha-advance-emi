"use client";

import { useEffect, useId, useMemo, useState } from "react";
import QRCode from "react-qr-code";
import {
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
  basePrice: number;
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

  // Configuration State
  const [includeVariants, setIncludeVariants] = useState<boolean>(true);
  const [selectedRentTenures, setSelectedRentTenures] = useState<number[]>([6, 9, 12, 24]);
  const [selectedLeaseTenures, setSelectedLeaseTenures] = useState<number[]>([12, 24, 36]);
  const [selectedSfemiTenures, setSelectedSfemiTenures] = useState<number[]>([12, 15]);
  const [depositPercent, setDepositPercent] = useState<number | null>(null); // null = auto band

  // Scheme inclusions
  const [schemes, setSchemes] = useState<Record<CatalogSchemeType, boolean>>({
    direct_sale: true,
    rent: true,
    lease: true,
    sfemi: true,
  });

  // Modal active tabs
  const [activeTab, setActiveTab] = useState<"matrix" | "whatsapp" | "print" | "links" | "text">("matrix");
  const [printLayout, setPrintLayout] = useState<"cards" | "matrix">("matrix");
  const [searchFilter, setSearchFilter] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => {
    return new Set(selectedProducts.map((p) => p.id));
  });

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [serverQuote, setServerQuote] = useState<PriceListQuoteResponse | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState<boolean>(false);

  // Origin for public links
  const origin =
    typeof window !== "undefined" && window.location.origin
      ? window.location.origin
      : "https://subidhafurnitureasansol.com";

  // Build resolved items hierarchy (Base Blueprint + Child Variants) locally as optimistic data
  const resolvedItems = useMemo<ResolvedCatalogItem[]>(() => {
    const items: ResolvedCatalogItem[] = [];
    const addedIds = new Set<number>();

    // Index all available products by id and parent_id
    const childrenByParent = new Map<number, PimProduct[]>();
    for (const p of allPimProducts) {
      if (p.parent_id) {
        const list = childrenByParent.get(p.parent_id) ?? [];
        list.push(p);
        childrenByParent.set(p.parent_id, list);
      }
    }

    const baseProductsToProcess: PimProduct[] = [];
    const standaloneOrChildren: PimProduct[] = [];

    for (const p of selectedProducts) {
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
        category: [base.category_name, base.subcategory_name].filter(Boolean).join(" / "),
        basePrice: price,
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
              category: [child.category_name || base.category_name, child.subcategory_name || base.subcategory_name]
                .filter(Boolean)
                .join(" / "),
              basePrice: childPrice,
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
        const parent = allPimProducts.find((p) => p.id === item.parent_id);
        const parentCode = parent?.code || item.parent_code || item.code;
        const price = Number(item.base_price) || 0;
        const rentYield = Number(item.rent_monthly_yield_percent) || 5.0;
        const leaseYield = Number(item.lease_monthly_yield_percent) || 3.5;
        const specs = resolveItemSpecs(item);
        const childSku = item.code;
        const publicUrl = `${origin}/products/${encodeURIComponent(parentCode)}?sku=${encodeURIComponent(childSku)}`;

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
          category: [item.category_name, item.subcategory_name].filter(Boolean).join(" / "),
          basePrice: price,
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
    selectedProducts,
    allPimProducts,
    includeVariants,
    selectedRentTenures,
    selectedLeaseTenures,
    selectedSfemiTenures,
    depositPercent,
    origin,
  ]);

  // Sync selectedIds with resolved items whenever product selections change
  useEffect(() => {
    setSelectedIds(new Set(resolvedItems.map((i) => i.id)));
  }, [resolvedItems]);

  // Call authoritative backend API for price list quote with debounce
  useEffect(() => {
    if (!isOpen || selectedProducts.length === 0) return;

    const timeout = setTimeout(async () => {
      try {
        setIsLoadingQuote(true);
        const activeSchemes = Object.entries(schemes)
          .filter(([, v]) => v)
          .map(([k]) => k.toUpperCase());

        const quote = await pimService.getPriceListQuote({
          product_ids: selectedProducts.map((p) => p.id),
          include_variants: includeVariants,
          schemes: activeSchemes.length > 0 ? activeSchemes : ["DIRECT_SALE", "RENT", "LEASE", "SFEMI"],
          rent_tenures: selectedRentTenures,
          lease_tenures: selectedLeaseTenures,
          sfemi_tenures: selectedSfemiTenures,
          deposit_percent: depositPercent,
          customer_name: customerName,
          customer_phone: customerPhone,
          public_origin: origin,
        });
        setServerQuote(quote);
      } catch (err) {
        console.error("Failed to fetch price list quote from server:", err);
      } finally {
        setIsLoadingQuote(false);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [
    isOpen,
    selectedProducts,
    includeVariants,
    schemes,
    selectedRentTenures,
    selectedLeaseTenures,
    selectedSfemiTenures,
    depositPercent,
    customerName,
    customerPhone,
    origin,
  ]);

  // Filter active items
  const activeItems = useMemo(() => {
    return resolvedItems.filter((item) => {
      if (!selectedIds.has(item.id)) return false;
      if (!searchFilter.trim()) return true;
      const q = searchFilter.toLowerCase();
      return (
        item.fullName.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
      );
    });
  }, [resolvedItems, selectedIds, searchFilter]);

  const baseCount = resolvedItems.filter((i) => !i.isChild).length;
  const variantCount = resolvedItems.filter((i) => i.isChild).length;

  // Toggle item selection
  const toggleItemSelection = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(resolvedItems.map((i) => i.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  // Toggle tenure helper
  const toggleRentTenure = (t: number) => {
    setSelectedRentTenures((prev) => {
      if (prev.includes(t)) {
        if (prev.length === 1) return prev; // keep at least one
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

  // Authoritative WhatsApp message from server quote, or fallback
  const generatedWhatsAppMessage = useMemo(() => {
    if (serverQuote?.whatsapp_message) {
      return serverQuote.whatsapp_message;
    }

    if (activeItems.length === 0) return "No products selected.";

    const lines: string[] = [
      "✨ *SUBIDHA FURNITURE & APPLIANCES — PRICE LIST*",
    ];
    if (customerName.trim()) {
      lines.push(`👤 *Prepared for:* ${customerName.trim()}`);
    }
    lines.push(
      "📍 Asansol, West Bengal · 📞 +91 7602283000",
      `🌐 ${origin}`,
      "------------------------------------------",
      "Hello! Here is the tailored price list with tenure breakdowns for your selected products:",
      ""
    );

    const roots = activeItems.filter((i) => !i.isChild);
    const orphans = activeItems.filter((i) => i.isChild && !roots.some((r) => r.id === i.parentId));

    const renderSchemePricing = (item: ResolvedCatalogItem, prefix = ""): string[] => {
      const pLines: string[] = [];
      const price = item.basePrice;

      if (schemes.direct_sale && price > 0) {
        pLines.push(`${prefix}💰 *Direct Sale (MRP):* ${formatCurrency(price)}`);
      }
      if (schemes.rent && price > 0) {
        pLines.push(`${prefix}🏠 *Monthly Rent:*`);
        for (const t of selectedRentTenures) {
          const m = Math.round((price * item.rentYieldPercent * 12) / t / 100);
          pLines.push(`${prefix}   • ${t} Months Tenure: *₹${m.toLocaleString("en-IN")}/mo*`);
        }
      }
      if (schemes.lease && price > 0) {
        pLines.push(`${prefix}🏢 *Monthly Lease:*`);
        for (const t of selectedLeaseTenures) {
          const m = Math.round((price * item.leaseYieldPercent * 12) / t / 100);
          pLines.push(`${prefix}   • ${t} Months Tenure: *₹${m.toLocaleString("en-IN")}/mo*`);
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
      lines.push(`${idx}. 📌 *${root.name}* (Code: ${root.code})`);
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

  // Copy helper
  const handleCopy = (text: string, key: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  // WhatsApp Send helper
  const handleSendWhatsApp = () => {
    const encoded = encodeURIComponent(generatedWhatsAppMessage);
    const targetPhone = customerPhone.trim() || "";
    const cleanNumber = targetPhone.replace(/[^0-9]/g, "");
    let url = "";
    if (cleanNumber.length >= 10) {
      const formatted = cleanNumber.length === 10 ? `91${cleanNumber}` : cleanNumber;
      url = `https://wa.me/${formatted}?text=${encoded}`;
    } else {
      url = `https://wa.me/?text=${encoded}`;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // Print helper
  const handlePrint = () => {
    window.print();
  };

  // Helper to find server quote item
  const findServerItem = (id: number): PriceListQuoteItem | undefined => {
    return serverQuote?.items?.find((i) => i.id === id);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 md:p-6 overflow-y-auto">
      {/* Dynamic print-only CSS injection to isolate catalog print sheet */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #${printContainerId}, #${printContainerId} * {
            visibility: visible;
          }
          #${printContainerId} {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 12mm 15mm;
            background: white !important;
            color: black !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="relative w-full max-w-7xl max-h-[94vh] flex flex-col rounded-2xl bg-card border border-border shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-muted/30">
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
                  {baseCount} Blueprints · {variantCount} Variant SKUs
                </span>
                {isLoadingQuote && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground animate-pulse">
                    <Loader2 className="h-3 w-3 animate-spin text-primary" /> Calculating pricing...
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Generate pure, tailored price lists for customers across Direct Sale, Rent, Lease, & SFEMI (15m Promotion) with QR codes.
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

        {/* Customer Target Setup & Global Options */}
        <div className="border-b border-border bg-background/95 px-6 py-3.5 space-y-3">
          {/* Row 1: Customer details & Variant Toggle */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
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

            <div className="md:col-span-4 flex items-center justify-end gap-2">
              <label className="flex items-center gap-2 font-medium cursor-pointer bg-muted/40 hover:bg-muted px-3 py-1.5 rounded-lg border border-border transition text-xs">
                <input
                  type="checkbox"
                  checked={includeVariants}
                  onChange={(e) => setIncludeVariants(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
                />
                <span className="text-foreground font-semibold">Include Child Variant SKUs</span>
              </label>
            </div>
          </div>

          {/* Row 2: Price Categories / Schemes Selection */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-1 border-t border-border/40">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-foreground uppercase text-[11px] tracking-wider">
                Price Categories to Send:
              </span>
              <label className="flex items-center gap-1.5 cursor-pointer bg-muted/40 hover:bg-muted px-2.5 py-1 rounded-md border border-border">
                <input
                  type="checkbox"
                  checked={schemes.direct_sale}
                  onChange={(e) => setSchemes((p) => ({ ...p, direct_sale: e.target.checked }))}
                  className="rounded border-border text-primary"
                />
                <span className="font-medium text-foreground">Direct Sale (MRP)</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-300 px-2.5 py-1 rounded-md border border-sky-200 dark:border-sky-800 font-medium">
                <input
                  type="checkbox"
                  checked={schemes.rent}
                  onChange={(e) => setSchemes((p) => ({ ...p, rent: e.target.checked }))}
                  className="rounded border-sky-400 text-sky-600"
                />
                <span>Rent</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-300 px-2.5 py-1 rounded-md border border-indigo-200 dark:border-indigo-800 font-medium">
                <input
                  type="checkbox"
                  checked={schemes.lease}
                  onChange={(e) => setSchemes((p) => ({ ...p, lease: e.target.checked }))}
                  className="rounded border-indigo-400 text-indigo-600"
                />
                <span>Lease</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 px-2.5 py-1 rounded-md border border-emerald-200 dark:border-emerald-800 font-medium">
                <input
                  type="checkbox"
                  checked={schemes.sfemi}
                  onChange={(e) => setSchemes((p) => ({ ...p, sfemi: e.target.checked }))}
                  className="rounded border-emerald-400 text-emerald-600"
                />
                <span>SFEMI Advance EMI</span>
              </label>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Deposit Override:</span>
              <select
                value={depositPercent ?? "auto"}
                onChange={(e) => setDepositPercent(e.target.value === "auto" ? null : Number(e.target.value))}
                className="h-7 rounded border border-border bg-card px-2 text-xs font-semibold"
              >
                <option value="auto">Auto Band (20–30%)</option>
                <option value={15}>15% Refundable</option>
                <option value={20}>20% Refundable</option>
                <option value={25}>25% Refundable</option>
                <option value={30}>30% Refundable</option>
              </select>
            </div>
          </div>

          {/* Row 3: Multi-Tenure Chips Setup */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-border/40 text-xs">
            {/* Rent Tenures */}
            <div className={`p-2.5 rounded-xl border transition ${schemes.rent ? "bg-sky-50/40 dark:bg-sky-950/20 border-sky-200 dark:border-sky-800" : "bg-muted/20 border-border opacity-50"}`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold text-sky-800 dark:text-sky-300 flex items-center gap-1">
                  🏠 Rent Tenures (Monthly Value):
                </span>
                <span className="text-[10px] text-muted-foreground">{selectedRentTenures.length} selected</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {AVAILABLE_RENT_TENURES.map((t) => {
                  const isSel = selectedRentTenures.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      disabled={!schemes.rent}
                      onClick={() => toggleRentTenure(t)}
                      className={`px-2 py-0.5 rounded-md font-semibold text-[11px] border transition cursor-pointer ${
                        isSel
                          ? "bg-sky-600 text-white border-sky-600 shadow-2xs"
                          : "bg-card text-muted-foreground border-border hover:text-foreground"
                      }`}
                    >
                      {t}m
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Lease Tenures */}
            <div className={`p-2.5 rounded-xl border transition ${schemes.lease ? "bg-indigo-50/40 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-800" : "bg-muted/20 border-border opacity-50"}`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold text-indigo-800 dark:text-indigo-300 flex items-center gap-1">
                  🏢 Lease Tenures:
                </span>
                <span className="text-[10px] text-muted-foreground">{selectedLeaseTenures.length} selected</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {AVAILABLE_LEASE_TENURES.map((t) => {
                  const isSel = selectedLeaseTenures.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      disabled={!schemes.lease}
                      onClick={() => toggleLeaseTenure(t)}
                      className={`px-2 py-0.5 rounded-md font-semibold text-[11px] border transition cursor-pointer ${
                        isSel
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-2xs"
                          : "bg-card text-muted-foreground border-border hover:text-foreground"
                      }`}
                    >
                      {t}m
                    </button>
                  );
                })}
              </div>
            </div>

            {/* SFEMI Tenures & 15m Promotion */}
            <div className={`p-2.5 rounded-xl border transition ${schemes.sfemi ? "bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800" : "bg-muted/20 border-border opacity-50"}`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                  ⭐ SFEMI Promotion Plans:
                </span>
                <span className="text-[10px] text-muted-foreground">{selectedSfemiTenures.length} selected</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  disabled={!schemes.sfemi}
                  onClick={() => toggleSfemiTenure(12)}
                  className={`px-2 py-0.5 rounded-md font-semibold text-[11px] border transition cursor-pointer ${
                    selectedSfemiTenures.includes(12)
                      ? "bg-emerald-600 text-white border-emerald-600 shadow-2xs"
                      : "bg-card text-muted-foreground border-border hover:text-foreground"
                  }`}
                >
                  12m Standard
                </button>
                <button
                  type="button"
                  disabled={!schemes.sfemi}
                  onClick={() => toggleSfemiTenure(15)}
                  className={`px-2 py-0.5 rounded-md font-semibold text-[11px] border transition cursor-pointer ${
                    selectedSfemiTenures.includes(15)
                      ? "bg-amber-500 text-white border-amber-600 shadow-2xs ring-1 ring-amber-400"
                      : "bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700"
                  }`}
                  title="SFEMI Monthly Promotional Benefit: Remaining Future EMIs Waived!"
                >
                  ⭐ 15m Special Promotion
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="flex items-center border-b border-border bg-muted/20 px-6 gap-2 pt-2">
          <button
            type="button"
            onClick={() => setActiveTab("matrix")}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition cursor-pointer ${
              activeTab === "matrix"
                ? "border-primary text-primary bg-background rounded-t-lg"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <TableIcon className="h-4 w-4" />
            Tailored Price Matrix Table ({activeItems.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("whatsapp")}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition cursor-pointer ${
              activeTab === "whatsapp"
                ? "border-emerald-600 text-emerald-700 dark:text-emerald-400 bg-background rounded-t-lg"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <MessageCircle className="h-4 w-4 text-emerald-600" />
            WhatsApp Share Message
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("print")}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition cursor-pointer ${
              activeTab === "print"
                ? "border-primary text-primary bg-background rounded-t-lg"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Printer className="h-4 w-4" />
            Printable / PDF Price List Sheet with QR Codes
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("links")}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition cursor-pointer ${
              activeTab === "links"
                ? "border-sky-600 text-sky-700 dark:text-sky-400 bg-background rounded-t-lg"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <QrCode className="h-4 w-4 text-sky-600" />
            Digital Showcase & QR Links
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("text")}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition cursor-pointer ${
              activeTab === "text"
                ? "border-violet-600 text-violet-700 dark:text-violet-400 bg-background rounded-t-lg"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileText className="h-4 w-4 text-violet-600" />
            Plain Text / Email Summary
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-muted/10 space-y-6">
          {/* TAB 0: Interactive Dynamic Price Matrix Table */}
          {activeTab === "matrix" && (
            <div className="space-y-4">
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
                    className="h-7 w-48 sm:w-64 rounded-md border border-border bg-background px-2.5 text-xs"
                  />
                  <button
                    type="button"
                    onClick={selectAll}
                    className="text-[11px] text-primary hover:underline font-semibold ml-2 cursor-pointer"
                  >
                    Select All
                  </button>
                  <span className="text-muted-foreground/40">·</span>
                  <button
                    type="button"
                    onClick={deselectAll}
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
                    Send to Customer via WhatsApp
                  </button>
                  <button
                    type="button"
                    onClick={handlePrint}
                    className="inline-flex items-center gap-1.5 h-8 rounded-lg bg-primary text-primary-foreground px-3 text-xs font-semibold hover:opacity-90 shadow-2xs transition cursor-pointer"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Print Matrix Sheet
                  </button>
                </div>
              </div>

              {/* Dynamic Table */}
              <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-muted/60 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase">
                    <tr>
                      <th className="px-3 py-2.5 text-center w-12">Select</th>
                      <th className="px-3 py-2.5 w-20">QR</th>
                      <th className="px-3 py-2.5 min-w-[200px]">Product & Variant SKU</th>
                      <th className="px-3 py-2.5 text-center">Stock</th>
                      {schemes.direct_sale && (
                        <th className="px-3 py-2.5 text-right whitespace-nowrap bg-muted/40 font-bold text-foreground">
                          Direct Sale (MRP)
                        </th>
                      )}
                      {schemes.rent &&
                        selectedRentTenures.map((t) => (
                          <th
                            key={`rent_${t}`}
                            className="px-3 py-2.5 text-right whitespace-nowrap bg-sky-50/50 dark:bg-sky-950/30 text-sky-800 dark:text-sky-300 font-bold"
                          >
                            Rent {t}m
                          </th>
                        ))}
                      {schemes.lease &&
                        selectedLeaseTenures.map((t) => (
                          <th
                            key={`lease_${t}`}
                            className="px-3 py-2.5 text-right whitespace-nowrap bg-indigo-50/50 dark:bg-indigo-950/30 text-indigo-800 dark:text-indigo-300 font-bold"
                          >
                            Lease {t}m
                          </th>
                        ))}
                      {schemes.sfemi &&
                        selectedSfemiTenures.map((t) => (
                          <th
                            key={`sfemi_${t}`}
                            className={`px-3 py-2.5 text-right whitespace-nowrap font-bold ${
                              t === 15
                                ? "bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 border-x border-amber-300 dark:border-amber-700"
                                : "bg-emerald-50/50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300"
                            }`}
                          >
                            {t === 15 ? "⭐ SFEMI 15m (Promo)" : `SFEMI ${t}m`}
                          </th>
                        ))}
                      <th className="px-3 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {activeItems.map((item) => {
                      const sItem = findServerItem(item.id);
                      const price = item.basePrice;

                      return (
                        <tr
                          key={item.id}
                          className={`hover:bg-muted/30 transition ${item.isChild ? "bg-muted/5" : ""}`}
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
                            </div>
                            <div className="font-mono text-[10px] text-muted-foreground mt-0.5">
                              SKU: {item.sku} {item.brand ? `· ${item.brand}` : ""}
                            </div>
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
                              {formatCurrency(price)}
                            </td>
                          )}

                          {/* Rent Columns */}
                          {schemes.rent &&
                            selectedRentTenures.map((t) => {
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
            <div className="space-y-4 max-w-4xl mx-auto">
              <div className="flex flex-wrap items-center justify-between gap-3 bg-card p-4 rounded-xl border border-border shadow-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-foreground">
                    Prepared for: {customerName.trim() || "Valued Customer"}
                  </span>
                  {customerPhone && (
                    <span className="text-xs text-muted-foreground">({customerPhone})</span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSendWhatsApp}
                    className="inline-flex items-center gap-1.5 h-9 rounded-xl bg-[#25D366] hover:bg-[#20ba59] text-white px-4 text-xs font-semibold shadow-sm transition cursor-pointer"
                  >
                    <MessageCircle className="h-4 w-4" />
                    {customerPhone.trim() ? `Send to WhatsApp (+91 ${customerPhone.trim()})` : "Share via WhatsApp"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopy(generatedWhatsAppMessage, "whatsapp_msg")}
                    className="inline-flex items-center gap-1.5 h-9 rounded-xl border border-border bg-background hover:bg-muted text-foreground px-3 text-xs font-medium transition cursor-pointer"
                  >
                    {copiedKey === "whatsapp_msg" ? (
                      <>
                        <Check className="h-4 w-4 text-green-600" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        Copy Message
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Message Preview Box */}
              <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/30 dark:bg-emerald-950/20 p-5">
                <div className="flex items-center justify-between mb-3 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                  <span className="flex items-center gap-1.5">
                    <MessageCircle className="h-4 w-4 text-emerald-600" /> WhatsApp Ready-to-Send Message
                  </span>
                  <span>{activeItems.length} Products & Variations Included</span>
                </div>
                <pre className="whitespace-pre-wrap font-sans text-xs text-foreground leading-relaxed bg-card p-4 rounded-xl border border-border/80 shadow-xs max-h-[500px] overflow-y-auto">
                  {generatedWhatsAppMessage}
                </pre>
              </div>
            </div>
          )}

          {/* TAB 2: Printable / PDF Catalog & Price List Sheet */}
          {activeTab === "print" && (
            <div className="space-y-4">
              <div className="no-print flex flex-wrap items-center justify-between gap-3 bg-card p-4 rounded-xl border border-border shadow-xs">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-muted-foreground">Sheet Layout:</span>
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
                      Price Matrix Table
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
                      Product Cards Grid
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
                    Print / Save as PDF
                  </button>
                </div>
              </div>

              {/* Printable Catalog Container */}
              <div
                id={printContainerId}
                className="bg-card text-foreground border border-border rounded-2xl p-6 shadow-sm space-y-6"
              >
                {/* Header for Print Sheet */}
                <div className="border-b border-border pb-5 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h1 className="text-xl font-bold tracking-tight text-foreground uppercase">
                      Subidha Furniture & Appliances
                    </h1>
                    <p className="text-xs text-muted-foreground mt-0.5 font-medium">
                      Multi-Scheme Product Catalog & Scheme Price List · Direct Sale · Rent · Lease · SFEMI Advance EMI
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Showroom: G.T. Road, Asansol, West Bengal · Phone: +91 7602283000 · Web: subidhafurnitureasansol.com
                    </p>
                    {customerName.trim() && (
                      <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-muted text-xs font-bold text-foreground border border-border">
                        👤 Prepared for: <span className="text-primary">{customerName.trim()}</span>{" "}
                        {customerPhone.trim() ? `(${customerPhone.trim()})` : ""}
                      </div>
                    )}
                  </div>
                  <div className="text-right text-xs">
                    <span className="inline-block px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 font-bold">
                      OFFICIAL PRICE LIST
                    </span>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Date: {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                </div>

                {/* Print Layout: Matrix or Cards */}
                {printLayout === "matrix" ? (
                  <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-muted/50 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase">
                        <tr>
                          <th className="px-3 py-2.5">QR Code</th>
                          <th className="px-3 py-2.5">Product & Variant</th>
                          <th className="px-3 py-2.5">Specifications</th>
                          <th className="px-3 py-2.5 text-center">Stock</th>
                          {schemes.direct_sale && <th className="px-3 py-2.5 text-right">Direct Sale</th>}
                          {schemes.rent &&
                            selectedRentTenures.map((t) => (
                              <th key={t} className="px-3 py-2.5 text-right">
                                Rent {t}m
                              </th>
                            ))}
                          {schemes.lease &&
                            selectedLeaseTenures.map((t) => (
                              <th key={t} className="px-3 py-2.5 text-right">
                                Lease {t}m
                              </th>
                            ))}
                          {schemes.sfemi &&
                            selectedSfemiTenures.map((t) => (
                              <th key={t} className="px-3 py-2.5 text-right">
                                {t === 15 ? "SFEMI 15m (Promo)" : `SFEMI ${t}m`}
                              </th>
                            ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {activeItems.map((item) => {
                          const sItem = findServerItem(item.id);
                          const price = item.basePrice;

                          return (
                            <tr key={item.id} className="hover:bg-muted/20 break-inside-avoid">
                              <td className="px-3 py-2">
                                <div className="flex flex-col items-center p-1 rounded bg-white border border-slate-200 w-16">
                                  <QRCode
                                    value={item.publicUrl}
                                    size={52}
                                    level="M"
                                    style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                                  />
                                  <span className="text-[7px] text-slate-500 font-bold mt-0.5">Scan</span>
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                <div className="font-bold text-foreground text-xs">{item.fullName}</div>
                                <div className="font-mono text-[10px] text-muted-foreground">SKU: {item.sku}</div>
                                <div className="text-[10px] text-muted-foreground">{item.category}</div>
                              </td>
                              <td className="px-3 py-2">
                                <div className="text-[11px] text-foreground">
                                  {item.specs.length > 0 ? item.specs.join(" · ") : "Standard model"}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-center">
                                {item.currentStock > 0 ? (
                                  <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200">
                                    {item.currentStock} Ready
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-muted-foreground">Order</span>
                                )}
                              </td>
                              {schemes.direct_sale && (
                                <td className="px-3 py-2 text-right font-bold text-foreground">
                                  {formatCurrency(price)}
                                </td>
                              )}
                              {schemes.rent &&
                                selectedRentTenures.map((t) => {
                                  const sRent = sItem?.quotes?.rent?.tenures?.[String(t)];
                                  const m = sRent ? Number(sRent.monthly_amount) : Math.round((price * item.rentYieldPercent * 12) / t / 100);
                                  return (
                                    <td key={t} className="px-3 py-2 text-right">
                                      <div className="font-bold text-sky-700">₹{m.toLocaleString("en-IN")}/mo</div>
                                    </td>
                                  );
                                })}
                              {schemes.lease &&
                                selectedLeaseTenures.map((t) => {
                                  const sLease = sItem?.quotes?.lease?.tenures?.[String(t)];
                                  const m = sLease ? Number(sLease.monthly_amount) : Math.round((price * item.leaseYieldPercent * 12) / t / 100);
                                  return (
                                    <td key={t} className="px-3 py-2 text-right">
                                      <div className="font-bold text-indigo-700">₹{m.toLocaleString("en-IN")}/mo</div>
                                    </td>
                                  );
                                })}
                              {schemes.sfemi &&
                                selectedSfemiTenures.map((t) => {
                                  const sSfemi = sItem?.quotes?.sfemi?.tenures?.[String(t)];
                                  const m = sSfemi ? Number(sSfemi.monthly_amount) : Math.round(price / t);
                                  return (
                                    <td key={t} className="px-3 py-2 text-right">
                                      <div className={`font-bold ${t === 15 ? "text-amber-800" : "text-emerald-700"}`}>
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {activeItems.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-xl border border-border p-4 bg-muted/10 flex flex-col justify-between gap-3 break-inside-avoid shadow-2xs"
                      >
                        <div className="flex items-start gap-4">
                          <div className="flex flex-col items-center justify-center p-2 rounded-lg bg-white border border-slate-200 shrink-0 shadow-2xs">
                            <QRCode
                              value={item.publicUrl}
                              size={84}
                              level="M"
                              style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                            />
                            <span className="text-[9px] text-slate-600 font-bold mt-1 text-center leading-tight">
                              Scan to Enquire
                            </span>
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-sm text-foreground">{item.fullName}</span>
                              {item.isChild ? (
                                <span className="text-[9px] font-semibold text-violet-700 bg-violet-50 border border-violet-200 rounded px-1.5 py-0.2">
                                  Variant SKU
                                </span>
                              ) : (
                                <span className="text-[9px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.2">
                                  Base Blueprint
                                </span>
                              )}
                            </div>
                            <p className="font-mono text-[11px] text-muted-foreground mt-0.5">
                              Code: <strong>{item.code}</strong> {item.brand ? `· Brand: ${item.brand}` : ""}
                            </p>
                            <p className="text-[11px] text-muted-foreground">{item.category}</p>

                            {item.specs.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {item.specs.map((s, idx) => (
                                  <span
                                    key={idx}
                                    className="text-[10px] font-medium bg-muted px-1.5 py-0.5 rounded border border-border"
                                  >
                                    {s}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Pricing details */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-border/80 text-xs">
                          {schemes.direct_sale && (
                            <div className="p-2 rounded-lg bg-card border border-border">
                              <span className="block text-[10px] font-semibold text-muted-foreground uppercase">
                                Direct Sale
                              </span>
                              <span className="text-sm font-bold text-foreground">
                                {formatCurrency(item.basePrice)}
                              </span>
                            </div>
                          )}

                          {schemes.rent && (
                            <div className="p-2 rounded-lg bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800">
                              <span className="block text-[10px] font-semibold text-sky-800 dark:text-sky-300 uppercase">
                                Rent
                              </span>
                              {selectedRentTenures.map((t) => {
                                const m = Math.round((item.basePrice * item.rentYieldPercent * 12) / t / 100);
                                return (
                                  <div key={t} className="text-xs font-bold text-sky-700">
                                    {t}m: ₹{m.toLocaleString("en-IN")}/mo
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {schemes.lease && (
                            <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800">
                              <span className="block text-[10px] font-semibold text-indigo-800 dark:text-indigo-300 uppercase">
                                Lease
                              </span>
                              {selectedLeaseTenures.map((t) => {
                                const m = Math.round((item.basePrice * item.leaseYieldPercent * 12) / t / 100);
                                return (
                                  <div key={t} className="text-xs font-bold text-indigo-700">
                                    {t}m: ₹{m.toLocaleString("en-IN")}/mo
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {schemes.sfemi && (
                            <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                              <span className="block text-[10px] font-semibold text-emerald-800 dark:text-emerald-300 uppercase">
                                SFEMI Promotion
                              </span>
                              {selectedSfemiTenures.map((t) => {
                                const m = Math.round(item.basePrice / t);
                                return (
                                  <div key={t} className={`text-xs font-bold ${t === 15 ? "text-amber-800" : "text-emerald-700"}`}>
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

                {/* Footer notes */}
                <div className="pt-4 border-t border-border text-[10px] text-muted-foreground leading-relaxed">
                  <p>
                    <strong>Terms & Notes:</strong> Indicative pricing based on current showroom catalog. Rent and Lease agreements require identity & address verification (KYC). Security deposit is 100% refundable upon product return in good order. SFEMI Advance EMI operates under approved transparent promotional benefits (Remaining Future EMIs Waived for Beneficiaries under the 15-Month Promotion). Delivery, installation, and applicable GST confirmed upon final booking.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Digital Showcase & QR Links */}
          {activeTab === "links" && (
            <div className="space-y-4 max-w-5xl mx-auto">
              <div className="bg-card p-4 rounded-xl border border-border shadow-xs flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-bold text-foreground">Public Interactive Product Links & QR Codes</h3>
                  <p className="text-[11px] text-muted-foreground">
                    Public users who receive these links or scan the QR codes will land on the exact product and variant page with pre-selected attributes.
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
                        SKU: {item.sku} · {formatCurrency(item.basePrice)}
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
            <div className="space-y-4 max-w-4xl mx-auto">
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
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-border px-6 py-3.5 bg-muted/20">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              Selected <strong>{activeItems.length}</strong> items for price list generation
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border px-4 py-2 text-xs font-medium hover:bg-muted text-foreground transition cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleSendWhatsApp}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#25D366] hover:bg-[#20ba59] text-white px-4 py-2 text-xs font-semibold shadow-sm transition cursor-pointer"
            >
              <MessageCircle className="h-4 w-4" />
              {customerPhone.trim() ? `Send to Customer (+91 ${customerPhone.trim()})` : "Share on WhatsApp"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
