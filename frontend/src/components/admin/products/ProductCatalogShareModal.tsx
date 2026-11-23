"use client";

import { Fragment, useEffect, useId, useMemo, useState } from "react";
import QRCode from "react-qr-code";
import {
  AlertCircle,
  Boxes,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
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
  ShieldCheck,
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
import { getDocumentPrintSettings } from "@/services/business-setup";
import { formatCurrency } from "@/lib/format";
import { resolveApiMediaUrl } from "@/lib/media";

export interface ProductCatalogShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedProducts: PimProduct[];
  allPimProducts: PimProduct[];
}

export type CatalogSchemeType = "direct_sale" | "rent" | "lease" | "sfemi";
export type PrintLayoutType = "matrix" | "cards" | "showcase";

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
  imageUrl: string | null;
  brand?: string;
  rentMonthly: number;
  rentDeposit: number;
  leaseMonthly: number;
  leaseDeposit: number;
  sfemiMonthly: number;
  dimensions?: string;
  warranty?: string;
}

export interface CategorySubcategoryGroup {
  id: string;
  categoryName: string;
  subcategoryName: string;
  displayCategory: string;
  displaySubcategory: string;
  fullLabel: string;
  icon: string;
  items: ResolvedCatalogItem[];
  itemCount: number;
  minPrice: number;
  maxPrice: number;
  hasPricedItems: boolean;
  minRentMonthly: number;
  minLeaseMonthly: number;
  minSfemiMonthly: number;
}

export interface MainCategoryGroup {
  categoryName: string;
  icon: string;
  totalItems: number;
  subcategories: CategorySubcategoryGroup[];
}

function parseCategoryHierarchy(item: ResolvedCatalogItem): {
  mainCategory: string;
  subcategory: string;
} {
  let main = item.categoryName?.trim() || "";
  let sub = item.subcategoryName?.trim() || "";

  if ((!main || !sub) && item.category) {
    const parts = item.category.split("/").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      main = main || parts[0];
      sub = sub || parts.slice(1).join(" / ");
    } else if (parts.length === 1) {
      if (!main) main = parts[0];
      if (!sub) sub = "General";
    }
  }

  if (!main) main = "General Catalog";
  if (!sub) sub = "All Models";

  return { mainCategory: main, subcategory: sub };
}

function getCategoryIcon(catName: string, subcatName: string = ""): string {
  const text = `${catName} ${subcatName}`.toLowerCase();
  if (text.includes("bed") || text.includes("mattress") || text.includes("cot")) return "🛏️";
  if (text.includes("sofa") || text.includes("couch") || text.includes("recliner") || text.includes("living")) return "🛋️";
  if (text.includes("chair") || text.includes("stool") || text.includes("seating")) return "🪑";
  if (text.includes("table") || text.includes("desk") || text.includes("dining")) return "🍽️";
  if (text.includes("alna") || text.includes("wardrobe") || text.includes("cupboard") || text.includes("closet") || text.includes("storage")) return "🚪";
  if (text.includes("ac") || text.includes("conditioner") || text.includes("cooler") || text.includes("cooling")) return "❄️";
  if (text.includes("tv") || text.includes("television") || text.includes("audio") || text.includes("video")) return "📺";
  if (text.includes("fridge") || text.includes("refrigerator")) return "🧊";
  if (text.includes("wash") || text.includes("laundry")) return "🧺";
  if (text.includes("appliance") || text.includes("electronic") || text.includes("home appliance")) return "⚡";
  if (text.includes("kitchen") || text.includes("cook")) return "🍳";
  if (text.includes("office")) return "💼";
  if (text.includes("furniture")) return "🛋️";
  return "📦";
}

function resolveProductImageUrl(
  p: PimProduct,
  origin: string,
  parent?: PimProduct,
  siblingIndex?: number,
  totalSiblings?: number
): string | null {
  const normalize = (url: string | null | undefined): string | null => {
    if (!url || typeof url !== "string") return null;
    let clean = url.trim();
    if (!clean) return null;
    if (clean.startsWith("data:") || clean.startsWith("blob:") || clean.startsWith("http://") || clean.startsWith("https://")) {
      return clean;
    }
    const resolvedApi = resolveApiMediaUrl(clean);
    if (resolvedApi) return resolvedApi;
    if (!clean.startsWith("/")) {
      clean = `/${clean}`;
    }
    if (!clean.startsWith("/media/") && !clean.startsWith("/brand/") && !clean.startsWith("/images/")) {
      clean = `/media${clean}`;
    }
    return `${origin}${clean}`;
  };

  // 1. Direct p.image or p.image_url or source_product image
  const direct =
    normalize(p.image) ||
    normalize((p as any).image_url) ||
    normalize((p as any).source_product_image) ||
    normalize((p as any).source_product?.image);
  if (direct) return direct;

  // 2. Own media items
  const mediaItems = (p as any).media_items;
  if (Array.isArray(mediaItems) && mediaItems.length > 0) {
    const hero = mediaItems.find((m: any) => m?.is_hero && (m.file || m.file_url));
    if (hero) {
      const u = normalize(hero.file || hero.file_url);
      if (u) return u;
    }
    const firstImg = mediaItems.find((m: any) => (m?.kind === "IMAGE" || !m?.kind) && (m.file || m.file_url));
    if (firstImg) {
      const u = normalize(firstImg.file || firstImg.file_url);
      if (u) return u;
    }
  }

  // 3. If child variant: check parent's ProductVariant matching this SKU code
  let matchingVariant: any = null;
  if (parent) {
    const pCodeClean = (p.code || "").trim().toLowerCase();
    const pSkuClean = (((p as any).sku || "") as string).trim().toLowerCase();
    const pNameClean = (p.name || "").trim().toLowerCase();

    if (Array.isArray(parent.variants) && parent.variants.length > 0) {
      for (const v of parent.variants) {
        const vSkuClean = (v.sku || "").trim().toLowerCase();
        const vNameClean = ((v.variant_name || "") as string).trim().toLowerCase();
        if (
          (vSkuClean && (vSkuClean === pCodeClean || vSkuClean === pSkuClean)) ||
          (v.id && (v.id === (p as any).variant_id || (v as any).child_pim_id === p.id)) ||
          (vSkuClean && pCodeClean && (vSkuClean.includes(pCodeClean) || pCodeClean.includes(vSkuClean))) ||
          (vNameClean && pNameClean && vNameClean === pNameClean)
        ) {
          matchingVariant = v;
          if (v.image) {
            const u = normalize(v.image);
            if (u) return u;
          }
          if ((v as any).operational_product_image) {
            const u = normalize((v as any).operational_product_image);
            if (u) return u;
          }
          if ((v as any).operational_product?.image) {
            const u = normalize((v as any).operational_product.image);
            if (u) return u;
          }
          if ((v as any).image_url) {
            const u = normalize((v as any).image_url);
            if (u) return u;
          }
          break;
        }
      }
    }

    // 4. Check parent media items linked to this variant (FK, SKU code, or distinctive attribute keywords)
    const parentMedia = (parent as any).media_items;
    if (Array.isArray(parentMedia) && parentMedia.length > 0) {
      const parentImages = parentMedia.filter(
        (m: any) => (m.kind === "IMAGE" || !m.kind) && (m.file || m.file_url)
      );

      // 4a. Media item linked to matching variant FK
      if (matchingVariant?.id) {
        const fkMatch = parentImages.find(
          (m: any) =>
            m.variant_id === matchingVariant.id ||
            (m.variant && (m.variant.id === matchingVariant.id || m.variant.sku === matchingVariant.sku))
        );
        if (fkMatch) {
          const u = normalize(fkMatch.file || fkMatch.file_url);
          if (u) return u;
        }
      }

      // 4b. Title or file containing SKU code
      if (p.code) {
        const pCodeLower = p.code.toLowerCase();
        const skuMatch = parentImages.find((m: any) => {
          const t = (m.title || "").toLowerCase();
          const f = (m.file || m.file_url || "").toLowerCase();
          return t.includes(pCodeLower) || f.includes(pCodeLower);
        });
        if (skuMatch) {
          const u = normalize(skuMatch.file || skuMatch.file_url);
          if (u) return u;
        }
      }

      // 4c. Distinctive attribute keyword scoring
      const extractTokens = (str: string) => (str.toLowerCase().match(/[a-z0-9]+/g) || []);
      const pTokens = new Set([...extractTokens(p.name || ""), ...extractTokens(p.code || "")]);
      const commonTokens = new Set(["product", "model", "standard", "item", ...extractTokens(parent.name || "")]);
      const distinctiveTokens = Array.from(pTokens).filter((t) => !commonTokens.has(t) && t.length >= 1);

      if (distinctiveTokens.length > 0) {
        let bestScore = 0;
        let bestM: any = null;
        for (const m of parentImages) {
          const mTokens = new Set(extractTokens(`${m.title || ""} ${m.file || m.file_url || ""}`));
          let score = 0;
          for (const dt of distinctiveTokens) {
            if (mTokens.has(dt)) score += 3;
          }
          for (const pt of pTokens) {
            if (mTokens.has(pt)) score += 1;
          }
          if (score > bestScore) {
            bestScore = score;
            bestM = m;
          }
        }
        if (bestM && bestScore >= 3) {
          const u = normalize(bestM.file || bestM.file_url);
          if (u) return u;
        }
      }

      // 4d. Distribute distinct gallery images across sibling variants by index
      if (parentImages.length > 1 && typeof siblingIndex === "number") {
        const assignedM = parentImages[siblingIndex % parentImages.length];
        if (assignedM) {
          const u = normalize(assignedM.file || assignedM.file_url);
          if (u) return u;
        }
      }
    }
  }

  // 5. If base blueprint: check own variants
  if (Array.isArray(p.variants) && p.variants.length > 0) {
    for (const v of p.variants) {
      const u = normalize(v.image);
      if (u) return u;
    }
  }

  // 6. Assets
  const assets = (p as any).assets;
  if (Array.isArray(assets) && assets.length > 0) {
    const heroA = assets.find((a: any) => a?.is_hero && a.image);
    if (heroA) {
      const u = normalize(heroA.image);
      if (u) return u;
    }
    const firstA = assets.find((a: any) => a?.image);
    if (firstA) {
      const u = normalize(firstA.image);
      if (u) return u;
    }
  }

  // 7. Fallback to parent blueprint hero image
  if (parent) {
    const parentDirect = normalize(parent.image) || normalize((parent as any).image_url);
    if (parentDirect) return parentDirect;

    const parentMedia = (parent as any).media_items;
    if (Array.isArray(parentMedia) && parentMedia.length > 0) {
      const hero = parentMedia.find((m: any) => m?.is_hero && (m.file || m.file_url));
      if (hero) {
        const u = normalize(hero.file || hero.file_url);
        if (u) return u;
      }
      const firstImg = parentMedia.find(
        (m: any) => (m?.kind === "IMAGE" || !m?.kind) && (m.file || m.file_url)
      );
      if (firstImg) {
        const u = normalize(firstImg.file || firstImg.file_url);
        if (u) return u;
      }
    }
  }

  return null;
}

function resolveItemSpecs(p: PimProduct): { specs: string[]; dimensions?: string; warranty?: string } {
  const specs: string[] = [];
  let dimensions: string | undefined;
  let warranty: string | undefined;

  // Real outer dimensions
  if (p.ar_width_cm && p.ar_depth_cm) {
    dimensions = p.ar_height_cm
      ? `Size: ${p.ar_width_cm} × ${p.ar_depth_cm} × ${p.ar_height_cm} cm`
      : `Footprint: ${p.ar_width_cm} × ${p.ar_depth_cm} cm`;
    specs.push(dimensions);
  }

  // Warranty
  if (p.warranty_enabled !== false) {
    const mfg = p.warranty_months_manufacturing ?? 12;
    const str = p.warranty_months_structural ?? 36;
    if (str > 0) {
      warranty = `${Math.round(str / 12)} Yrs Structural · ${mfg} Mo Mfg Warranty`;
    } else if (mfg > 0) {
      warranty = `${mfg} Months Warranty`;
    }
    if (warranty && !specs.some((s) => s.toLowerCase().includes("warranty"))) {
      specs.push(`🛡️ ${warranty}`);
    }
  }

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
  if (Array.isArray(p.inherited_attribute_values) && p.inherited_attribute_values.length > 0) {
    for (const ia of p.inherited_attribute_values) {
      const val = ia.display_value || ia.value_text;
      if (val && !specs.some((s) => s.includes(ia.attribute_name))) {
        specs.push(`${ia.attribute_name}: ${val}`);
      }
    }
  }
  return { specs, dimensions, warranty };
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

  // Commercial Quotation & Proposal Personalization
  const [quotationNumber, setQuotationNumber] = useState<string>(() => {
    const d = new Date();
    const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    return `QT-${dateStr}-${randomSuffix}`;
  });
  const [quotationValidityDays, setQuotationValidityDays] = useState<number>(15);
  const [salesConsultant, setSalesConsultant] = useState<string>("Pradip Roy (Showroom Manager)");
  const [showSignatoryBlock, setShowSignatoryBlock] = useState<boolean>(true);
  const [taxNote, setTaxNote] = useState<string>(
    "All Direct Sale prices are inclusive of applicable GST (18%/12%). Formal GST invoice & HSN breakdown provided on booking."
  );

  // Interactive Print-to-Digital Bridge (Per-Item Micro QR Codes)
  const [showItemQrCodes, setShowItemQrCodes] = useState<boolean>(true);

  // Professional Print Engine & Pagination Controls
  const [pageBreakPerCategory, setPageBreakPerCategory] = useState<boolean>(false);
  const [inkSaverMode, setInkSaverMode] = useState<boolean>(false);

  // Executive Booklet Cover Page
  const [includeCoverPage, setIncludeCoverPage] = useState<boolean>(false);
  // Full-Page Photo Plates Appendix (offline clickable links in PDF)
  const [includePhotoPlates, setIncludePhotoPlates] = useState<boolean>(true);
  // Master Table of Contents & Searchable Product Directory Index
  const [includeIndexPage, setIncludeIndexPage] = useState<boolean>(true);

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
  const [printLayout, setPrintLayout] = useState<PrintLayoutType>("matrix"); // Default matrix for multi-page handover
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

  // Authentic business identity resolved from Business Setup Profile / Document Print Settings
  const [businessInfo, setBusinessInfo] = useState<{
    name: string;
    phone: string;
    address: string;
    email: string;
    website: string;
    logoUrl: string;
  }>({
    name: "Subidha Furniture",
    phone: "+91 94764 90946",
    address: "South Dhadka Sukantapally, Near Rupkatha Cinema Hall, Dakhin Dhadka, Asansol, Paschim Barddhaman, West Bengal 713302, India",
    email: "subidhafurnitureofficial@gmail.com",
    website: "subidhafurnitureasansol.com",
    logoUrl: "/brand/logo.png",
  });

  useEffect(() => {
    let active = true;
    getDocumentPrintSettings()
      .then((settings) => {
        if (!active || !settings) return;
        setBusinessInfo((prev) => ({
          name: settings.business_name?.trim() || prev.name,
          phone: settings.print_phone?.trim() || prev.phone,
          address: settings.print_address?.replace(/\r?\n+/g, ", ").trim() || prev.address,
          email: settings.print_email?.trim() || prev.email,
          website: settings.print_website?.trim() || prev.website,
          logoUrl: settings.business_logo_url?.trim() || prev.logoUrl,
        }));
      })
      .catch(() => {
        // Fallback to authentic defaults
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (serverQuote?.business_name || serverQuote?.business_phone || serverQuote?.business_address) {
      setBusinessInfo((prev) => ({
        name: serverQuote.business_name || prev.name,
        phone: serverQuote.business_phone || prev.phone,
        address: serverQuote.business_address || prev.address,
        email: serverQuote.business_email || prev.email,
        website: prev.website,
        logoUrl: serverQuote.business_logo_url || prev.logoUrl,
      }));
    }
  }, [serverQuote]);

  const resolvedLogoUrl = useMemo(() => {
    if (!businessInfo.logoUrl) return `${origin}/brand/logo.png`;
    return businessInfo.logoUrl.startsWith("http")
      ? businessInfo.logoUrl
      : `${origin}${businessInfo.logoUrl.startsWith("/") ? "" : "/"}${businessInfo.logoUrl}`;
  }, [businessInfo.logoUrl, origin]);

  const webappCatalogUrl = `${origin}/products`;

  const currentDateFormatted = useMemo(() => {
    return new Date().toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }, []);

  const validityEndDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + quotationValidityDays);
    return d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }, [quotationValidityDays]);

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
      const { specs, dimensions, warranty } = resolveItemSpecs(base);
      const baseImg = resolveProductImageUrl(base, origin);
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
        dimensions,
        warranty,
        publicUrl,
        imageUrl: baseImg,
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
        for (let childIdx = 0; childIdx < children.length; childIdx++) {
          const child = children[childIdx];
          if (!addedIds.has(child.id)) {
            const childPrice = Number(child.base_price) || price;
            const childRentYield = Number(child.rent_monthly_yield_percent) || rentYield;
            const childLeaseYield = Number(child.lease_monthly_yield_percent) || leaseYield;
            const { specs: childSpecs, dimensions: childDims, warranty: childWarr } = resolveItemSpecs(child);
            const childImg = resolveProductImageUrl(child, origin, base, childIdx, children.length) || baseImg;
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
              dimensions: childDims || dimensions,
              warranty: childWarr || warranty,
              publicUrl: childUrl,
              imageUrl: childImg,
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
        const { specs: orphanSpecs, dimensions: orphanDims, warranty: orphanWarr } = resolveItemSpecs(item);
        const orphanImg = resolveProductImageUrl(item, origin, parent, 0, 1) || (parent ? resolveProductImageUrl(parent, origin) : null);
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
          specs: orphanSpecs,
          dimensions: orphanDims,
          warranty: orphanWarr,
          publicUrl,
          imageUrl: orphanImg,
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

  // Structured Category Hierarchy: Main Category -> Subcategories -> Items
  const categoryHierarchy = useMemo<MainCategoryGroup[]>(() => {
    const mainMap = new Map<string, Map<string, ResolvedCatalogItem[]>>();

    for (const item of activeItems) {
      const { mainCategory, subcategory } = parseCategoryHierarchy(item);
      if (!mainMap.has(mainCategory)) {
        mainMap.set(mainCategory, new Map<string, ResolvedCatalogItem[]>());
      }
      const subMap = mainMap.get(mainCategory)!;
      if (!subMap.has(subcategory)) {
        subMap.set(subcategory, []);
      }
      subMap.get(subcategory)!.push(item);
    }

    const result: MainCategoryGroup[] = [];

    // Sort main categories
    const sortedMainKeys = Array.from(mainMap.keys()).sort((a, b) => {
      const order = ["Furniture", "Home Appliances", "Electronics", "Office Furniture", "Living Room", "Bedroom"];
      const idxA = order.indexOf(a);
      const idxB = order.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    for (const mainCat of sortedMainKeys) {
      const subMap = mainMap.get(mainCat)!;
      const sortedSubKeys = Array.from(subMap.keys()).sort((a, b) => a.localeCompare(b));
      const subcatGroups: CategorySubcategoryGroup[] = [];
      let totalMainItems = 0;

      for (const subCat of sortedSubKeys) {
        const itemsInSub = subMap.get(subCat)!;
        totalMainItems += itemsInSub.length;

        const pricedItems = itemsInSub.filter((i) => i.hasPrice);
        const prices = pricedItems.map((i) => i.basePrice);
        const minPrice = prices.length ? Math.min(...prices) : 0;
        const maxPrice = prices.length ? Math.max(...prices) : 0;

        const rentMonthlyPrices = pricedItems.map((i) => i.rentMonthly).filter((m) => m > 0);
        const minRent = rentMonthlyPrices.length ? Math.min(...rentMonthlyPrices) : 0;

        const leaseMonthlyPrices = pricedItems.map((i) => i.leaseMonthly).filter((m) => m > 0);
        const minLease = leaseMonthlyPrices.length ? Math.min(...leaseMonthlyPrices) : 0;

        const sfemiMonthlyPrices = pricedItems.map((i) => i.sfemiMonthly).filter((m) => m > 0);
        const minSfemi = sfemiMonthlyPrices.length ? Math.min(...sfemiMonthlyPrices) : 0;

        const slug = `cat-${mainCat.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${subCat.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

        subcatGroups.push({
          id: slug,
          categoryName: mainCat,
          subcategoryName: subCat,
          displayCategory: mainCat,
          displaySubcategory: subCat,
          fullLabel: `${mainCat} / ${subCat}`,
          icon: getCategoryIcon(mainCat, subCat),
          items: itemsInSub,
          itemCount: itemsInSub.length,
          minPrice,
          maxPrice,
          hasPricedItems: pricedItems.length > 0,
          minRentMonthly: minRent,
          minLeaseMonthly: minLease,
          minSfemiMonthly: minSfemi,
        });
      }

      result.push({
        categoryName: mainCat,
        icon: getCategoryIcon(mainCat),
        totalItems: totalMainItems,
        subcategories: subcatGroups,
      });
    }

    return result;
  }, [activeItems]);

  const flatSubcategoryGroups = useMemo<CategorySubcategoryGroup[]>(() => {
    return categoryHierarchy.flatMap((main) => main.subcategories);
  }, [categoryHierarchy]);

  const selectGroupItems = (groupItems: ResolvedCatalogItem[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const item of groupItems) {
        next.add(item.id);
      }
      return next;
    });
  };

  const deselectGroupItems = (groupItems: ResolvedCatalogItem[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const item of groupItems) {
        next.delete(item.id);
      }
      return next;
    });
  };

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

  const totalInteractiveCols =
    5 +
    (schemes.direct_sale ? 1 : 0) +
    (schemes.rent ? selectedRentTenures.length : 0) +
    (schemes.lease ? selectedLeaseTenures.length : 0) +
    (schemes.sfemi ? selectedSfemiTenures.length : 0) +
    1;

  const totalPrintCols =
    (showItemQrCodes ? 1 : 0) +
    4 +
    (schemes.direct_sale ? 1 : 0) +
    (schemes.rent ? selectedRentTenures.length : 0) +
    (schemes.lease ? selectedLeaseTenures.length : 0) +
    (schemes.sfemi ? selectedSfemiTenures.length : 0);

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

    const lines: string[] = [`✨ *${businessInfo.name.toUpperCase()} — PRICE LIST*`];
    if (customerName.trim()) {
      lines.push(`👤 *Prepared for:* ${customerName.trim()}`);
    }
    lines.push(
      `📍 ${businessInfo.address}`,
      `📞 ${businessInfo.phone} · 🌐 ${businessInfo.website || origin}`,
      "------------------------------------------",
      `Hello! Here is the custom price list for your selected ${activeItems.length} product(s):`,
      ""
    );

    if (categoryHierarchy.length > 0) {
      lines.push("📂 *CATALOG CATEGORIES & INDEX:*");
      for (const main of categoryHierarchy) {
        const subList = main.subcategories.map((s) => `${s.displaySubcategory} (${s.itemCount})`).join(", ");
        lines.push(`• ${main.icon} *${main.categoryName}:* ${subList}`);
      }
      lines.push("------------------------------------------", "");
    }

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
    businessInfo,
    categoryHierarchy,
  ]);

  // URL-safe summary message that NEVER triggers ERR_CONNECTION_CLOSED
  const generatedWhatsAppSummaryMessage = useMemo(() => {
    if (serverQuote?.whatsapp_summary_message) {
      return serverQuote.whatsapp_summary_message;
    }

    const lines: string[] = [`✨ *${businessInfo.name.toUpperCase()} — PRICE LIST*`];
    if (customerName.trim()) {
      lines.push(`👤 *Prepared for:* ${customerName.trim()}`);
    }
    lines.push(
      `📍 ${businessInfo.address}`,
      `📞 ${businessInfo.phone} · 🌐 ${businessInfo.website || origin}`,
      "------------------------------------------",
      `Hello! Here is the pricing overview for your selected ${activeItems.length} product(s):`,
      ""
    );

    if (categoryHierarchy.length > 0) {
      lines.push("📂 *CATEGORIES INCLUDED:*");
      for (const main of categoryHierarchy) {
        const subList = main.subcategories.map((s) => `${s.displaySubcategory} (${s.itemCount})`).join(", ");
        lines.push(`• ${main.icon} *${main.categoryName}* [${main.totalItems}]: ${subList}`);
      }
      lines.push("------------------------------------------", "");
    }

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
    businessInfo,
    categoryHierarchy,
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

  // Generate standalone, self-contained HTML document for pixel-perfect multi-page A4 printing
  const generateFullPrintDocumentHtml = (layout: PrintLayoutType): string => {
    const coverEl = document.getElementById("print-sheet-cover");
    const headerEl = document.getElementById("print-sheet-header");
    const indexEl = document.getElementById("catalog-context-index");
    const footerEl = document.getElementById("print-sheet-footer");
    const sectionId =
      layout === "matrix"
        ? "print-matrix-section"
        : layout === "cards"
        ? "print-cards-section"
        : "print-showcase-section";
    const bodyEl = document.getElementById(sectionId);
    const platesEl = document.getElementById("print-photo-plates-section");

    const coverHtml = includeCoverPage && coverEl ? coverEl.outerHTML : "";
    const headerHtml = headerEl ? headerEl.innerHTML : "";
    const indexHtml = includeIndexPage && indexEl ? indexEl.outerHTML : "";
    const bodyHtml = bodyEl ? bodyEl.innerHTML : "";
    const platesHtml = includePhotoPlates && platesEl ? platesEl.innerHTML : "";
    const footerHtml = footerEl ? footerEl.innerHTML : "";

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <base href="${origin}/" />
  <title>${businessInfo.name} - Official Showroom Catalog & Price List (${activeItems.length} Products)</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm 8mm 12mm 8mm;
      @top-left {
        content: "${businessInfo.name} · Official Showroom Handover";
        font-size: 7.5px;
        font-weight: bold;
        color: #4b5563;
      }
      @top-right {
        content: "Ref: ${quotationNumber} · Date: ${currentDateFormatted}";
        font-size: 7.5px;
        color: #6b7280;
      }
      @bottom-left {
        content: "Showroom: ${businessInfo.address.replace(/"/g, "'")} · 📞 ${businessInfo.phone}";
        font-size: 7.5px;
        color: #6b7280;
      }
      @bottom-right {
        content: "Page " counter(page) " of " counter(pages);
        font-size: 8px;
        font-weight: 700;
        color: #111827;
      }
    }
    html {
      scroll-behavior: smooth;
    }
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #000000;
      background: #ffffff;
      padding: 0;
      margin: 0;
      font-size: 10px;
      line-height: 1.35;
    }
    .print-wrapper {
      width: 100%;
      background: #ffffff;
      padding: 4mm 6mm;
    }
    .cover-box {
      page-break-after: always !important;
      break-after: page !important;
    }
    .cover-page-container {
      min-height: 255mm !important;
      page-break-after: always !important;
      break-after: page !important;
      display: flex !important;
      flex-direction: column !important;
      justify-content: space-between !important;
      padding: 16mm 14mm !important;
      border: 3px double #18181b !important;
      background: #ffffff !important;
      margin-bottom: 20px !important;
      box-sizing: border-box !important;
    }
    ${pageBreakPerCategory ? `
      .category-major-group {
        page-break-before: always !important;
        break-before: page !important;
      }
      .category-major-group:first-of-type {
        page-break-before: auto !important;
        break-before: auto !important;
      }
    ` : ""}
    ${inkSaverMode ? `
      body, .print-wrapper {
        background: #ffffff !important;
        color: #000000 !important;
      }
      .category-section-banner,
      tr.category-section-banner td {
        background-color: #ffffff !important;
        color: #000000 !important;
        border: 1.5px solid #000000 !important;
      }
      .bg-black,
      .bg-zinc-900 {
        background-color: #ffffff !important;
        color: #000000 !important;
        border: 1px solid #000000 !important;
      }
      .text-white {
        color: #000000 !important;
      }
      .bg-sky-50, .bg-indigo-50, .bg-amber-50, .bg-emerald-50, .bg-gray-50, .bg-zinc-50 {
        background-color: #ffffff !important;
        border-color: #9ca3af !important;
      }
      .text-sky-800, .text-sky-900, .text-sky-950,
      .text-indigo-800, .text-indigo-900, .text-indigo-950,
      .text-amber-800, .text-amber-900, .text-amber-950,
      .text-emerald-800, .text-emerald-900, .text-emerald-950 {
        color: #000000 !important;
      }
      img {
        filter: grayscale(100%) contrast(105%) !important;
      }
    ` : ""}
    .header-box {
      border-bottom: 2px solid #000000;
      padding-bottom: 10px;
      margin-bottom: 12px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
    }
    .index-box {
      margin-bottom: 14px;
      page-break-after: always !important;
      break-after: page !important;
    }
    .toc-product-row:nth-child(even) {
      background-color: #f8fafc !important;
    }
    .footer-box {
      border-top: 2px solid #000000;
      padding-top: 10px;
      margin-top: 14px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      font-size: 8.5px;
      color: #374151;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    /* Category Section Banner Styling */
    .category-section-banner {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      page-break-after: avoid !important;
      break-after: avoid !important;
      margin-top: 10px !important;
      margin-bottom: 6px !important;
    }
    tr.category-section-banner td {
      background-color: #18181b !important;
      color: #ffffff !important;
    }
    /* Table Styling for Multi-Page Matrix */
    table {
      width: 100%;
      border-collapse: collapse;
      page-break-inside: auto;
      font-size: 9px;
    }
    thead {
      display: table-header-group !important; /* Repeats table header across every page! */
    }
    tr {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    th {
      background-color: #f3f4f6 !important;
      color: #111827 !important;
      font-weight: 800;
      text-transform: uppercase;
      font-size: 8px;
      letter-spacing: 0.05em;
      padding: 5px 6px;
      border: 1px solid #9ca3af;
      vertical-align: middle;
    }
    td {
      padding: 4px 6px;
      border: 1px solid #d1d5db;
      vertical-align: middle;
    }
    /* Cards Grid Styling for Showroom Handover */
    .grid {
      display: grid !important;
      grid-template-columns: repeat(2, 1fr) !important;
      gap: 10px !important;
    }
    .print-card-item {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      border: 1.5px solid #9ca3af !important;
      border-radius: 8px !important;
      padding: 8px 10px !important;
      background: #ffffff !important;
      display: flex !important;
      flex-direction: column !important;
      justify-content: space-between !important;
      min-height: 110px !important;
      margin-bottom: 8px !important;
    }
    /* Brand Advertising Showcase Grid Styling */
    .showcase-grid {
      display: grid !important;
      grid-template-columns: repeat(2, 1fr) !important;
      gap: 12px !important;
    }
    .print-showcase-item {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      border: 1.5px solid #6b7280 !important;
      border-radius: 10px !important;
      padding: 10px !important;
      background: #ffffff !important;
      display: flex !important;
      flex-direction: column !important;
      justify-content: space-between !important;
      margin-bottom: 10px !important;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05) !important;
    }
    /* SVG QR Code crisp vector rendering */
    svg {
      display: block;
      shape-rendering: crispEdges;
    }
    /* Standard layout utilities */
    .flex { display: flex !important; }
    .flex-col { flex-direction: column !important; }
    .flex-wrap { flex-wrap: wrap !important; }
    .items-center { align-items: center !important; }
    .items-start { align-items: flex-start !important; }
    .justify-between { justify-content: space-between !important; }
    .justify-center { justify-content: center !important; }
    .text-right { text-align: right !important; }
    .text-center { text-align: center !important; }
    .text-left { text-align: left !important; }
    .font-bold { font-weight: 700 !important; }
    .font-black { font-weight: 900 !important; }
    .font-semibold { font-weight: 600 !important; }
    .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important; }
    .text-xs { font-size: 11px !important; }
    .text-sm { font-size: 12px !important; }
    .text-base { font-size: 14px !important; }
    .text-xl { font-size: 18px !important; }
    .uppercase { text-transform: uppercase !important; }
    .underline { text-decoration: underline !important; }
    .whitespace-nowrap { white-space: nowrap !important; }
    .text-black { color: #000000 !important; }
    .bg-black { background-color: #000000 !important; color: #ffffff !important; }
    .bg-gray-100 { background-color: #f3f4f6 !important; }
    .bg-gray-50 { background-color: #f9fafb !important; }
    .bg-sky-50 { background-color: #f0f9ff !important; }
    .bg-indigo-50 { background-color: #eef2ff !important; }
    .bg-emerald-50 { background-color: #ecfdf5 !important; }
    .bg-amber-50 { background-color: #fffbeb !important; }
    .text-sky-800 { color: #075985 !important; }
    .text-indigo-800 { color: #3730a3 !important; }
    .text-emerald-800 { color: #065f46 !important; }
    .text-amber-800 { color: #92400e !important; }
    .text-green-800 { color: #166534 !important; }
    .border-gray-300 { border-color: #d1d5db !important; }
    .border-sky-300 { border-color: #7dd3fc !important; }
    .border-indigo-300 { border-color: #a5b4fc !important; }
    .border-emerald-300 { border-color: #6ee7b7 !important; }
    .border-amber-200 { border-color: #fde68a !important; }
    .border { border: 1px solid #d1d5db !important; }
    .rounded { border-radius: 4px !important; }
    .rounded-md { border-radius: 6px !important; }
    .rounded-lg { border-radius: 8px !important; }
    .rounded-xl { border-radius: 10px !important; }
    .p-0\\.5 { padding: 2px !important; }
    .p-1 { padding: 4px !important; }
    .p-1\\.5 { padding: 6px !important; }
    .p-2 { padding: 8px !important; }
    .p-3 { padding: 12px !important; }
    .px-1 { padding-left: 4px !important; padding-right: 4px !important; }
    .px-1\\.5 { padding-left: 6px !important; padding-right: 6px !important; }
    .px-2 { padding-left: 8px !important; padding-right: 8px !important; }
    .px-3 { padding-left: 12px !important; padding-right: 12px !important; }
    .py-0\\.2 { padding-top: 1px !important; padding-bottom: 1px !important; }
    .py-0\\.5 { padding-top: 2px !important; padding-bottom: 2px !important; }
    .py-1 { padding-top: 4px !important; padding-bottom: 4px !important; }
    .py-2 { padding-top: 8px !important; padding-bottom: 8px !important; }
    .gap-1 { gap: 4px !important; }
    .gap-1\\.5 { gap: 6px !important; }
    .gap-2 { gap: 8px !important; }
    .gap-2\\.5 { gap: 10px !important; }
    .gap-3 { gap: 12px !important; }
    .gap-3\\.5 { gap: 14px !important; }
    .gap-4 { gap: 16px !important; }
    .mt-0\\.5 { margin-top: 2px !important; }
    .mt-1 { margin-top: 4px !important; }
    .mt-2 { margin-top: 8px !important; }
    .w-11 { width: 44px !important; }
    .w-12 { width: 48px !important; }
    .w-14 { width: 56px !important; }
    .w-16 { width: 64px !important; }
    .w-20 { width: 80px !important; }
    .w-32 { width: 128px !important; }
    .h-11 { height: 44px !important; }
    .h-12 { height: 48px !important; }
    .h-14 { height: 56px !important; }
    .h-16 { height: 64px !important; }
    .h-20 { height: 80px !important; }
    .h-32 { height: 128px !important; }
    .w-\[115px\] { width: 115px !important; }
    .max-w-\[200px\] { max-width: 200px !important; }
    .max-w-\[220px\] { max-width: 220px !important; }
    .min-w-0 { min-width: 0 !important; }
    .flex-1 { flex: 1 1 0% !important; }
    .shrink-0 { flex-shrink: 0 !important; }
    img {
      max-width: 100%;
      height: auto;
      object-fit: contain;
      display: block;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    a {
      color: #1d4ed8 !important;
      text-decoration: underline !important;
    }
    .bg-zinc-900 { background-color: #18181b !important; color: #ffffff !important; }
    .bg-zinc-50 { background-color: #fafafa !important; }
    .text-blue-700 { color: #1d4ed8 !important; }
    .text-blue-900 { color: #1e3a8a !important; }
    .text-sky-950 { color: #082f49 !important; }
    .text-sky-900 { color: #0c4a6e !important; }
    .text-indigo-950 { color: #1e1b4b !important; }
    .text-indigo-900 { color: #312e81 !important; }
    .text-amber-950 { color: #451a03 !important; }
    .text-amber-900 { color: #78350f !important; }
    .border-amber-300 { border-color: #fcd34d !important; }
    .border-gray-200 { border-color: #e5e7eb !important; }
    .border-sky-200 { border-color: #bae6fd !important; }
    .border-indigo-200 { border-color: #c7d2fe !important; }
    .border-t { border-top-width: 1px !important; }
    .border-b-2 { border-bottom-width: 2px !important; }
    .border-2 { border-width: 2px !important; }
    .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
    .grid-cols-4, .md\:grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)) !important; }
    .space-y-3 > * + * { margin-top: 12px !important; }
    .gap-x-3 { column-gap: 12px !important; }
    .gap-y-0\\.5 { row-gap: 2px !important; }
    .break-all { word-break: break-all !important; }
    .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .inline-flex { display: inline-flex !important; }
    .overflow-hidden { overflow: hidden !important; }
    .shadow-2xs { box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05) !important; }
    .plates-box { width: 100% !important; }
    .photo-plate-item {
      page-break-before: always !important;
      break-before: page !important;
      min-height: 250mm !important;
      display: flex !important;
      flex-direction: column !important;
      justify-content: space-between !important;
      padding: 6mm 4mm !important;
      border-bottom: 1px dashed #cbd5e1 !important;
    }
    button, input, textarea, [role="button"], .no-print {
      display: none !important;
    }
  </style>
</head>
<body>
  <div class="print-wrapper ${inkSaverMode ? "ink-saver-active" : ""}">
    ${coverHtml ? `<div class="cover-box">${coverHtml}</div>` : ""}
    <div class="header-box">${headerHtml}</div>
    ${indexHtml ? `<div class="index-box">${indexHtml}</div>` : ""}
    <div class="body-box">${bodyHtml}</div>
    ${platesHtml ? `<div class="plates-box">${platesHtml}</div>` : ""}
    <div class="footer-box">${footerHtml}</div>
  </div>
  <script>
    function setupOfflineSearch() {
      var searchInput = document.getElementById("offline-catalog-search");
      if (!searchInput) return;
      searchInput.addEventListener("input", function(e) {
        var q = (e.target.value || "").toLowerCase().trim();
        var rows = document.querySelectorAll("tr[id^='row-']");
        var plates = document.querySelectorAll(".photo-plate-item");
        var tocRows = document.querySelectorAll(".toc-product-row");
        
        rows.forEach(function(r) {
          var text = (r.innerText || "").toLowerCase();
          r.style.display = (!q || text.indexOf(q) !== -1) ? "" : "none";
        });
        plates.forEach(function(p) {
          var text = (p.innerText || "").toLowerCase();
          p.style.display = (!q || text.indexOf(q) !== -1) ? "flex" : "none";
        });
        tocRows.forEach(function(tr) {
          var text = (tr.innerText || "").toLowerCase();
          tr.style.display = (!q || text.indexOf(q) !== -1) ? "" : "none";
        });
      });
    }

    async function prepareAndPrint() {
      setupOfflineSearch();
      var images = Array.prototype.slice.call(document.images);
      var imagePromises = images.map(function(img) {
        if (img.complete && img.naturalHeight !== 0) {
          return Promise.resolve();
        }
        return new Promise(function(resolve) {
          var timer = setTimeout(function() {
            resolve();
          }, 2500);
          img.onload = function() {
            clearTimeout(timer);
            resolve();
          };
          img.onerror = function() {
            clearTimeout(timer);
            if (img.src && img.src.indexOf("/media/") !== -1 && img.src.indexOf(":8000") === -1) {
              img.src = img.src.replace(/:3000\\/media\\//, ":8000/media/").replace(/localhost\\/media\\//, "localhost:8000/media/");
              img.onload = function() { resolve(); };
              img.onerror = function() { resolve(); };
            } else {
              resolve();
            }
          };
        });
      });

      try {
        await Promise.all(imagePromises);
      } catch (e) {}

      setTimeout(function() {
        window.focus();
        window.print();
      }, 450);
    }

    if (document.readyState === "complete") {
      prepareAndPrint();
    } else {
      window.addEventListener("load", prepareAndPrint);
    }
  <\/script>
</body>
</html>`;
  };

  // Print helper: prints seamless multi-page sheet across 100, 200, 500+ items
  const handlePrint = (layoutOverride?: PrintLayoutType) => {
    const layout = layoutOverride || printLayout;
    const fullHtml = generateFullPrintDocumentHtml(layout);

    // 1. Try dedicated print window:
    const printWindow = window.open("", "_blank", "width=1024,height=800,menubar=no,toolbar=no,status=no");
    if (printWindow) {
      printWindow.document.open();
      printWindow.document.write(fullHtml);
      printWindow.document.close();
      return;
    }

    // 2. Fallback to hidden iframe (bypasses any browser popup block):
    let frame = document.getElementById("subidha-catalog-print-frame") as HTMLIFrameElement;
    if (!frame) {
      frame = document.createElement("iframe");
      frame.id = "subidha-catalog-print-frame";
      frame.style.position = "fixed";
      frame.style.right = "0";
      frame.style.bottom = "0";
      frame.style.width = "0";
      frame.style.height = "0";
      frame.style.border = "none";
      document.body.appendChild(frame);
    }
    const frameDoc = frame.contentWindow?.document;
    if (frameDoc) {
      frameDoc.open();
      frameDoc.write(fullHtml);
      frameDoc.close();
      setTimeout(() => {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      }, 350);
    }
  };

  // Download complete standalone HTML print sheet
  const handleDownloadHtml = (layoutOverride?: PrintLayoutType) => {
    const layout = layoutOverride || printLayout;
    const fullHtml = generateFullPrintDocumentHtml(layout);
    const blob = new Blob([fullHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.download = `subidha-catalog-${layout}-${activeItems.length}-products.html`;
    a.href = url;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatusNotification(`Downloaded offline printable HTML file (${activeItems.length} products - ${layout.toUpperCase()})!`);
    setTimeout(() => setStatusNotification(null), 4000);
  };

  // Listen for Ctrl+P while modal is open
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        handlePrint();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, printLayout, activeItems]);

  // Helper to find server quote item
  const findServerItem = (id: number): PriceListQuoteItem | undefined => {
    return serverQuote?.items?.find((i) => i.id === id);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto print-modal-overlay">
      <style>{`
        @media print {
          .no-print {
            display: none !important;
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
                    onClick={() => handlePrint("matrix")}
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
                      <th className="px-3 py-2 w-16 text-center">QR</th>
                      <th className="px-3 py-2 w-16 text-center">Photo</th>
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
                    {flatSubcategoryGroups.length === 0 ? (
                      <tr>
                        <td colSpan={totalInteractiveCols} className="px-3 py-8 text-center text-muted-foreground text-xs">
                          No products match the selected criteria.
                        </td>
                      </tr>
                    ) : (
                      flatSubcategoryGroups.map((group) => (
                        <Fragment key={`interactive-${group.id}`}>
                          <tr className="bg-muted/70 border-y border-border">
                            <td colSpan={totalInteractiveCols} className="px-3 py-1.5">
                              <div className="flex items-center justify-between flex-wrap gap-2">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm">{group.icon}</span>
                                  <span className="font-bold text-xs uppercase text-foreground">
                                    {group.categoryName} › {group.subcategoryName}
                                  </span>
                                  <span className="text-[10px] font-mono text-muted-foreground">
                                    ({group.itemCount} {group.itemCount === 1 ? "item" : "items"})
                                  </span>
                                  {group.hasPricedItems && (
                                    <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium">
                                      {schemes.rent && group.minRentMonthly > 0
                                        ? `Rent from ₹${group.minRentMonthly.toLocaleString("en-IN")}/mo`
                                        : `From ${formatCurrency(group.minPrice)}`}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-xs">
                                  <button
                                    type="button"
                                    onClick={() => selectGroupItems(group.items)}
                                    className="text-[11px] text-primary hover:underline font-semibold cursor-pointer"
                                  >
                                    Select All ({group.itemCount})
                                  </button>
                                  <span className="text-muted-foreground/40">·</span>
                                  <button
                                    type="button"
                                    onClick={() => deselectGroupItems(group.items)}
                                    className="text-[11px] text-muted-foreground hover:underline cursor-pointer"
                                  >
                                    Deselect
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                          {group.items.map((item) => {
                            const sItem = findServerItem(item.id);
                            const finalImg = sItem?.image_url || item.imageUrl;
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
                          <td className="px-3 py-2 text-center">
                            <div className="flex flex-col items-center p-1 rounded bg-white border border-slate-200 w-14 shadow-2xs mx-auto">
                              <QRCode
                                value={item.publicUrl}
                                size={44}
                                level="M"
                                style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                              />
                            </div>
                          </td>
                          <td className="px-3 py-2 text-center">
                            {finalImg ? (
                              <div className="w-20 h-20 rounded-xl border border-border bg-white p-1 flex items-center justify-center overflow-hidden shrink-0 shadow-2xs mx-auto relative group">
                                <img
                                  src={finalImg}
                                  alt={item.fullName}
                                  className="w-full h-full object-contain"
                                  loading="lazy"
                                  onError={(e) => {
                                    const currentSrc = (e.currentTarget as HTMLImageElement).src;
                                    if (currentSrc.includes("/media/") && !currentSrc.includes(":8000")) {
                                      (e.currentTarget as HTMLImageElement).src = currentSrc.replace(/:\d+\/media\//, ":8000/media/");
                                    }
                                  }}
                                />
                                {item.isChild && (
                                  <span className="absolute bottom-0 inset-x-0 bg-black/85 text-white text-[7px] font-bold text-center py-0.5 truncate px-1 uppercase tracking-tight">
                                    {item.name.replace(item.parentName || "", "").replace(/^[\s—–-]+/, "") || item.sku}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="w-20 h-20 rounded-xl border border-border/60 bg-muted/40 flex flex-col items-center justify-center text-center p-1 shrink-0 mx-auto">
                                <span className="text-xl">{getCategoryIcon(item.categoryName, item.subcategoryName)}</span>
                                <span className="text-[7.5px] text-muted-foreground font-mono mt-0.5">No photo</span>
                                <span className="text-[7px] font-bold text-muted-foreground font-mono truncate max-w-[70px]">{item.sku}</span>
                              </div>
                            )}
                            <span className="text-[8px] font-bold text-muted-foreground block text-center mt-0.5">
                              Plate #{activeItems.findIndex((x) => x.id === item.id) + 1}
                            </span>
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
                  </Fragment>
                ))
              )}
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
                      Table Matrix (Catalog Photos &amp; Specs)
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
                      🖼️ Full Image Catalog Tiles (Offline Flyer)
                    </button>
                    <button
                      type="button"
                      onClick={() => setPrintLayout("showcase")}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition cursor-pointer ${
                        printLayout === "showcase"
                          ? "bg-card text-foreground shadow-xs font-semibold"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      ⭐ Executive Brand Lookbook (Luxury Showcase)
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleDownloadHtml()}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background hover:bg-muted text-foreground px-3 py-2 text-xs font-semibold shadow-2xs transition cursor-pointer"
                    title="Download standalone HTML file for offline viewing or printing"
                  >
                    <Download className="h-4 w-4 text-primary" />
                    Download HTML Sheet
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePrint()}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2 text-xs font-semibold hover:opacity-90 shadow-sm transition cursor-pointer"
                  >
                    <Printer className="h-4 w-4" />
                    Print / Save as PDF ({activeItems.length} items)
                  </button>
                </div>
              </div>

              {/* Showroom Handover & Customization Suite */}
              <div className="bg-card p-4 rounded-xl border border-border shadow-xs space-y-3.5">
                <div className="flex items-center justify-between border-b border-border pb-2.5 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <span className="text-xs font-bold text-foreground uppercase tracking-wide">
                      Showroom Handover &amp; Quotation Controls
                    </span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    Customized for official client handovers, commercial proposals &amp; multi-page printouts
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  {/* Column 1: Quotation Metadata */}
                  <div className="space-y-2.5 rounded-lg border border-border/80 bg-muted/20 p-3">
                    <span className="font-bold text-foreground text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-primary" />
                      1. Quotation &amp; Proposal Details
                    </span>

                    <div>
                      <label className="text-[10.5px] text-muted-foreground block mb-0.5">Quotation Ref #:</label>
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={quotationNumber}
                          onChange={(e) => setQuotationNumber(e.target.value)}
                          className="w-full h-7 rounded border border-border bg-background px-2 font-mono text-[11px] font-bold text-foreground focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const d = new Date();
                            const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
                            setQuotationNumber(`QT-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`);
                          }}
                          className="h-7 px-1.5 rounded border border-border bg-background hover:bg-muted text-[10px] text-muted-foreground cursor-pointer"
                          title="Regenerate Ref"
                        >
                          <RefreshCw className="h-3 w-3" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10.5px] text-muted-foreground block mb-0.5">Validity:</label>
                        <select
                          value={quotationValidityDays}
                          onChange={(e) => setQuotationValidityDays(Number(e.target.value))}
                          className="w-full h-7 rounded border border-border bg-background px-2 text-[11px] font-medium text-foreground focus:outline-none"
                        >
                          <option value={7}>7 Days</option>
                          <option value={15}>15 Days</option>
                          <option value={30}>30 Days</option>
                          <option value={60}>60 Days</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10.5px] text-muted-foreground block mb-0.5">Expiry Date:</label>
                        <div className="h-7 rounded border border-border/60 bg-muted/40 px-2 flex items-center text-[10.5px] font-semibold text-emerald-700 dark:text-emerald-400">
                          {validityEndDate}
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10.5px] text-muted-foreground block mb-0.5">Showroom Consultant:</label>
                      <input
                        type="text"
                        value={salesConsultant}
                        onChange={(e) => setSalesConsultant(e.target.value)}
                        className="w-full h-7 rounded border border-border bg-background px-2 text-[11px] text-foreground focus:outline-none"
                        placeholder="Consultant name..."
                      />
                    </div>
                  </div>

                  {/* Column 2: Department Filter & Tax Disclosure */}
                  <div className="space-y-2.5 rounded-lg border border-border/80 bg-muted/20 p-3">
                    <span className="font-bold text-foreground text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-primary" />
                      2. Scope &amp; Commercial Terms
                    </span>

                    <div>
                      <label className="text-[10.5px] text-muted-foreground block mb-0.5">Target Department Handover:</label>
                      <select
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className="w-full h-7 rounded border border-border bg-background px-2 text-[11px] font-bold text-foreground focus:outline-none"
                      >
                        <option value="all">
                          All Departments ({resolvedItems.filter((i) => !excludeUnpriced || i.hasPrice).length} products)
                        </option>
                        {availableCategories.map(([cat, count]) => (
                          <option key={cat} value={cat}>
                            {cat} ({count} {count === 1 ? "product" : "products"})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10.5px] text-muted-foreground block mb-0.5">Tax &amp; GST Disclosure:</label>
                      <textarea
                        rows={3}
                        value={taxNote}
                        onChange={(e) => setTaxNote(e.target.value)}
                        className="w-full rounded border border-border bg-background p-1.5 text-[10.5px] text-foreground focus:outline-none leading-tight"
                      />
                    </div>
                  </div>

                  {/* Column 3: Professional Print Switches */}
                  <div className="space-y-2 rounded-lg border border-border/80 bg-muted/20 p-3">
                    <span className="font-bold text-foreground text-[11px] uppercase tracking-wider mb-1 flex items-center gap-1.5">
                      <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                      3. Document Formatting &amp; Engine
                    </span>

                    <label className="flex items-center gap-2 text-[11.5px] text-foreground cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={includeCoverPage}
                        onChange={(e) => setIncludeCoverPage(e.target.checked)}
                        className="rounded border-border text-primary focus:ring-0"
                      />
                      <span className="font-medium">⭐ Include Executive Cover Page</span>
                    </label>

                    <label className="flex items-center gap-2 text-[11.5px] text-foreground cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={includePhotoPlates}
                        onChange={(e) => setIncludePhotoPlates(e.target.checked)}
                        className="rounded border-border text-primary focus:ring-0"
                      />
                      <span className="font-semibold text-primary">
                        🖼️ Offline Full Photo Plates (Click products in PDF to view)
                      </span>
                    </label>

                    <label className="flex items-center gap-2 text-[11.5px] text-foreground cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={includeIndexPage}
                        onChange={(e) => setIncludeIndexPage(e.target.checked)}
                        className="rounded border-border text-primary focus:ring-0"
                      />
                      <span className="font-semibold text-primary">
                        📑 Master Table of Contents &amp; Searchable Directory Index
                      </span>
                    </label>

                    <label className="flex items-center gap-2 text-[11.5px] text-foreground cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={showItemQrCodes}
                        onChange={(e) => setShowItemQrCodes(e.target.checked)}
                        className="rounded border-border text-primary focus:ring-0"
                      />
                      <span>Per-Product Micro QR Codes (Scan-to-View 3D)</span>
                    </label>

                    <label className="flex items-center gap-2 text-[11.5px] text-foreground cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={pageBreakPerCategory}
                        onChange={(e) => setPageBreakPerCategory(e.target.checked)}
                        className="rounded border-border text-primary focus:ring-0"
                      />
                      <span>Department Page Breaks (Clean fresh page per dept)</span>
                    </label>

                    <label className="flex items-center gap-2 text-[11.5px] text-foreground cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={inkSaverMode}
                        onChange={(e) => setInkSaverMode(e.target.checked)}
                        className="rounded border-border text-primary focus:ring-0"
                      />
                      <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                        🌿 Eco Ink-Saver Mode (B&amp;W Laser / Crisp Clean)
                      </span>
                    </label>

                    <label className="flex items-center gap-2 text-[11.5px] text-foreground cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={showSignatoryBlock}
                        onChange={(e) => setShowSignatoryBlock(e.target.checked)}
                        className="rounded border-border text-primary focus:ring-0"
                      />
                      <span>Authorized Signatory &amp; Showroom Seal Block</span>
                    </label>
                  </div>
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
              activeTab === "print" ? "block" : "hidden"
            }`}
          >
            {/* Case 5: Executive Booklet Cover Page (Only when enabled) */}
            {includeCoverPage && (
              <div
                id="print-sheet-cover"
                className="cover-page-container rounded-2xl border-4 border-black p-8 sm:p-12 bg-white text-black flex flex-col justify-between mb-8 shadow-sm"
                style={{ minHeight: "260mm", pageBreakAfter: "always", breakAfter: "page" }}
              >
                {/* Top Brand Header */}
                <div className="text-center space-y-3">
                  <div className="mx-auto w-24 h-24 rounded-2xl border-2 border-black bg-white p-2 flex items-center justify-center overflow-hidden shadow-sm">
                    <img
                      src={resolvedLogoUrl}
                      alt={`${businessInfo.name} Brand Logo`}
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div>
                    <h1 className="text-3xl font-black uppercase tracking-wider text-black">
                      {businessInfo.name}
                    </h1>
                    <p className="text-sm font-bold text-gray-800 uppercase tracking-widest mt-0.5">
                      Premium Furniture &amp; Home Appliances Showroom
                    </p>
                    <p className="text-xs text-gray-600 mt-1 font-medium">
                      Direct Sale · Smart Rent Plans · Corporate Lease · SFEMI Advance EMI
                    </p>
                  </div>
                  <div className="w-24 h-0.5 bg-black mx-auto mt-2"></div>
                </div>

                {/* Center Proposal & Quotation Block */}
                <div className="my-auto py-6 space-y-6">
                  <div className="text-center space-y-2">
                    <span className="inline-block px-4 py-1 rounded-full bg-black text-white text-xs font-black tracking-widest uppercase">
                      Official Showroom Catalog &amp; Price Specification
                    </span>
                    <h2 className="text-xl font-black uppercase text-gray-900 tracking-tight">
                      {selectedCategory === "all" ? "Comprehensive Product Catalog" : `${selectedCategory} Department Handover`}
                    </h2>
                    <p className="text-xs text-gray-600 max-w-lg mx-auto">
                      Detailed product specifications, outer dimensions, warranty coverage, direct showroom pricing, flexible rent tenures, and approved SFEMI monthly promotional schedules.
                    </p>
                  </div>

                  <div className="max-w-xl mx-auto rounded-xl border-2 border-black bg-zinc-50 p-6 space-y-3 shadow-2xs">
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="text-[10px] font-bold uppercase text-gray-500 block">Quotation Reference:</span>
                        <span className="font-mono font-black text-sm text-black">{quotationNumber}</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase text-gray-500 block">Date of Issue:</span>
                        <span className="font-medium text-black">{currentDateFormatted}</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase text-gray-500 block">Quotation Validity:</span>
                        <span className="font-semibold text-emerald-800">{validityEndDate} ({quotationValidityDays} Days)</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase text-gray-500 block">Showroom Consultant:</span>
                        <span className="font-bold text-black">{salesConsultant}</span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-gray-300">
                      <span className="text-[10px] font-bold uppercase text-gray-500 block">Exclusively Prepared For:</span>
                      <div className="text-base font-black text-black mt-0.5">
                        {customerName.trim() || "Valued Showroom Client / Prospective Buyer"}
                      </div>
                      {customerPhone.trim() && (
                        <div className="text-xs text-gray-700 font-medium">Contact: {customerPhone.trim()}</div>
                      )}
                    </div>

                    <div className="pt-2 border-t border-gray-200 flex items-center justify-between text-[11px] font-medium text-gray-700">
                      <span>Scope: <strong>{activeItems.length} Products</strong> Selected</span>
                      <span>Departments: <strong>{categoryHierarchy.length} Categories</strong></span>
                    </div>
                  </div>
                </div>

                {/* Bottom Showroom Identity & Master QR */}
                <div className="pt-6 border-t-2 border-black flex items-center justify-between gap-6">
                  <div className="space-y-1 text-left text-xs">
                    <p className="font-bold text-black">📍 Showroom Address:</p>
                    <p className="text-gray-700 text-[11px] max-w-md leading-relaxed">{businessInfo.address}</p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-800 pt-1">
                      <span>📞 Phone: <strong>{businessInfo.phone}</strong></span>
                      <span>✉️ Email: {businessInfo.email}</span>
                      <span>🌐 Web: <strong>{businessInfo.website}</strong></span>
                    </div>
                    <p className="text-[10px] text-gray-500 font-mono mt-1">
                      Official Showroom Publication · Authorized by {businessInfo.name} Management
                    </p>
                  </div>

                  <div className="flex flex-col items-center justify-center p-2 rounded-xl bg-zinc-50 border-2 border-black text-center shrink-0 w-[125px]">
                    <div className="w-20 h-20 bg-white p-1 rounded-lg border border-gray-300 flex items-center justify-center shadow-2xs">
                      <QRCode
                        value={webappCatalogUrl}
                        size={76}
                        level="M"
                        style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                      />
                    </div>
                    <span className="text-[8px] font-black uppercase text-black mt-1">
                      Scan Online Catalog
                    </span>
                    <span className="text-[7.5px] text-blue-700 font-bold">3D / AR Mobile Store</span>
                  </div>
                </div>
              </div>
            )}

            {/* Header for Print Sheet: Complete Advertising, Marketing & Handover Brand Header */}
            <div id="print-sheet-header" className="border-b-2 border-black pb-3 space-y-3">
              {/* Top Branding Row */}
              <div className="flex flex-wrap items-center justify-between gap-4">
                {/* Brand Identity & Logo */}
                <div className="flex items-center gap-3">
                  <div className="relative shrink-0 w-16 h-16 rounded-xl border border-gray-300 bg-white p-1 flex items-center justify-center overflow-hidden shadow-2xs">
                    <img
                      src={resolvedLogoUrl}
                      alt={`${businessInfo.name} Brand Logo`}
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = `${origin}/brand/logo.png`;
                      }}
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h1 className="text-xl font-black tracking-tight text-black uppercase">
                        {businessInfo.name}
                      </h1>
                      <span className="px-2 py-0.5 rounded bg-black text-white text-[9px] font-black tracking-wider uppercase">
                        {selectedCategory === "all" ? "Official Catalog Handover" : `${selectedCategory} Department Handover`}
                      </span>
                    </div>
                    <p className="text-xs text-gray-800 font-bold mt-0.5">
                      Premium Furniture &amp; Home Appliances · Direct Sale · Smart Rent · Corporate Lease · SFEMI Advance EMI
                    </p>
                    <p className="text-[11px] text-gray-600 mt-0.5">
                      📍 <strong>Showroom:</strong> {businessInfo.address}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10.5px] text-gray-700 mt-0.5">
                      <span>📞 <strong>Phone:</strong> {businessInfo.phone}</span>
                      <span>✉️ <strong>Email:</strong> {businessInfo.email}</span>
                      <span>
                        🌐 <strong>Web:</strong>{" "}
                        <a
                          href={webappCatalogUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-700 font-bold underline hover:text-blue-900"
                        >
                          {businessInfo.website}
                        </a>
                      </span>
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10.5px]">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-amber-50 text-black border border-amber-300 font-bold">
                        👤 Prepared for: <span className="underline">{customerName.trim() || "Showroom Visitor / Client"}</span>{" "}
                        {customerPhone.trim() ? `(${customerPhone.trim()})` : ""}
                      </div>
                      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-100 text-gray-800 border border-gray-300">
                        Assisted by: <strong>{salesConsultant}</strong>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Side: Webapp QR Code & Metadata Card */}
                <div className="flex items-center gap-3 shrink-0 ml-auto">
                  {/* Webapp Online QR Code Box */}
                  <div className="flex flex-col items-center justify-center p-2 rounded-xl bg-zinc-50 border-2 border-black/80 text-center w-[115px] shadow-2xs">
                    <div className="w-16 h-16 bg-white p-1 rounded-md border border-gray-300 flex items-center justify-center">
                      <QRCode
                        value={webappCatalogUrl}
                        size={60}
                        level="M"
                        style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                      />
                    </div>
                    <span className="text-[8px] font-black uppercase text-black mt-1 tracking-tight">
                      Webapp Catalog QR
                    </span>
                    <a
                      href={webappCatalogUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[8px] text-blue-700 font-bold hover:underline truncate max-w-full block"
                      title="Open Online Webapp"
                    >
                      Open Webapp ↗
                    </a>
                  </div>

                  <div className="text-right text-xs">
                    <span className="inline-block px-3 py-1 rounded bg-black text-white font-bold tracking-wider text-[11px]">
                      OFFICIAL PRICE LIST
                    </span>
                    <p className="text-[11px] text-gray-900 mt-1 font-mono font-bold">
                      Ref: {quotationNumber}
                    </p>
                    <p className="text-[10px] text-gray-600 mt-0.5">
                      Date: {currentDateFormatted}
                    </p>
                    <p className="text-[9.5px] text-emerald-800 font-semibold mt-0.5">
                      Valid till: {validityEndDate} ({quotationValidityDays}d)
                    </p>
                    <p className="text-[10px] text-gray-500 mt-0.5 font-mono">
                      {activeItems.length} Products Selected
                    </p>
                  </div>
                </div>
              </div>

              {/* Full Advertising Marketing Highlights Banner */}
              <div className="pt-2.5 border-t border-gray-200">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-left">
                  {/* Direct Sale */}
                  <div className="p-2 rounded-lg bg-gray-50 border border-gray-200">
                    <div className="font-black text-[10px] text-black uppercase">
                      🛋️ Direct Sale (MRP)
                    </div>
                    <p className="text-[9px] text-gray-600 mt-0.5 leading-snug">
                      100% Genuine brand quality, manufacturer warranty, instant delivery &amp; best showroom pricing.
                    </p>
                  </div>

                  {/* Smart Rent */}
                  <div className="p-2 rounded-lg bg-sky-50/80 border border-sky-200">
                    <div className="font-black text-[10px] text-sky-950 uppercase">
                      🏠 Smart Rent Plans
                    </div>
                    <p className="text-[9px] text-sky-900 mt-0.5 leading-snug">
                      Tenures: 3, 6, 9, 12, 24 Months. Zero long-term commitment, free maintenance &amp; easy relocation.
                    </p>
                  </div>

                  {/* Commercial Lease */}
                  <div className="p-2 rounded-lg bg-indigo-50/80 border border-indigo-200">
                    <div className="font-black text-[10px] text-indigo-950 uppercase">
                      🏢 Commercial Lease
                    </div>
                    <p className="text-[9px] text-indigo-900 mt-0.5 leading-snug">
                      12, 18, 24, 36, 48 Months. Complete home &amp; office furnishing with tax-efficient operating expense.
                    </p>
                  </div>

                  {/* SFEMI Promotion */}
                  <div className="p-2 rounded-lg bg-amber-50/80 border border-amber-300">
                    <div className="font-black text-[10px] text-amber-950 uppercase">
                      ⭐ SFEMI 15m Promo
                    </div>
                    <p className="text-[9px] text-amber-900 mt-0.5 leading-snug">
                      Transparent advance EMI. Under the 15-Month Promotion, remaining future EMIs are waived for beneficiaries!
                    </p>
                  </div>
                </div>

                {/* Trust & Guarantee Strip */}
                <div className="mt-2 py-1 px-2.5 rounded-md bg-zinc-900 text-white flex flex-wrap items-center justify-between text-[9px] font-medium gap-2">
                  <span>🚚 <strong>Showroom Setup &amp; Delivery:</strong> Prompt delivery in Asansol &amp; Raniganj region</span>
                  <span>🛡️ <strong>100% Refundable</strong> Security Deposit</span>
                  <span>⚡ <strong>Paperless Verification:</strong> Fast Digital KYC</span>
                  <span>📞 <strong>WhatsApp Orders:</strong> {businessInfo.phone}</span>
                </div>
              </div>
            </div>

            {/* Catalog Context & Category Index Page / Table of Contents */}
            {categoryHierarchy.length > 0 && (
              <div
                id="catalog-context-index"
                className="rounded-xl border-2 border-black bg-zinc-50 p-3 space-y-2.5 break-inside-avoid shadow-2xs"
              >
                <div className="flex items-center justify-between border-b border-gray-300 pb-1.5 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base">📑</span>
                    <div>
                      <h2 className="text-xs font-black uppercase tracking-wider text-black">
                        Catalog Context &amp; Category Index
                      </h2>
                      <p className="text-[9px] text-gray-600">
                        Table of contents by Department &amp; Subcategory with product counts and starting rates. Click any link to jump directly to that section.
                      </p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-black text-white text-[8.5px] font-bold">
                    {categoryHierarchy.length} Main Categories · {flatSubcategoryGroups.length} Subcategories
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {categoryHierarchy.map((main) => (
                    <div
                      key={main.categoryName}
                      className="rounded-lg border border-gray-300 bg-white p-2 flex flex-col justify-between"
                    >
                      <div className="flex items-center justify-between border-b border-gray-200 pb-1 mb-1.5">
                        <span className="font-black text-[10px] text-black uppercase flex items-center gap-1">
                          <span>{main.icon}</span>
                          <span>{main.categoryName}</span>
                        </span>
                        <span className="text-[8.5px] font-bold px-1.5 py-0.2 rounded bg-gray-100 text-gray-800 border border-gray-200">
                          {main.totalItems} items
                        </span>
                      </div>

                      <div className="space-y-1">
                        {main.subcategories.map((sub) => {
                          const anchorTarget =
                            printLayout === "showcase"
                              ? `#showcase-${sub.id}`
                              : printLayout === "cards"
                              ? `#cards-${sub.id}`
                              : `#${sub.id}`;
                          return (
                            <div
                              key={sub.id}
                              className="flex items-center justify-between text-[9px] py-0.5 px-1 rounded hover:bg-gray-50 border border-transparent hover:border-gray-200 transition"
                            >
                              <a
                                href={anchorTarget}
                                className="font-bold text-blue-700 hover:text-blue-900 hover:underline flex items-center gap-1 truncate max-w-[150px]"
                                title={`Jump to ${sub.displaySubcategory}`}
                              >
                                <span>›</span>
                                <span className="truncate">{sub.displaySubcategory}</span>
                              </a>
                              <div className="flex items-center gap-1.5 text-right shrink-0">
                                <span className="font-mono text-[8px] text-gray-500">
                                  {sub.itemCount} {sub.itemCount === 1 ? "item" : "items"}
                                </span>
                                {sub.hasPricedItems ? (
                                  <span className="text-[8px] font-semibold text-emerald-800 bg-emerald-50 px-1 rounded border border-emerald-200">
                                    {schemes.rent && sub.minRentMonthly > 0
                                      ? `₹${sub.minRentMonthly.toLocaleString("en-IN")}/mo`
                                      : formatCurrency(sub.minPrice)}
                                  </span>
                                ) : (
                                  <span className="text-[7.5px] text-gray-400">On req</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Searchable Master Product Directory (Table of Contents) */}
                <div className="pt-2.5 border-t-2 border-black space-y-2">
                  <div className="flex items-center justify-between pb-1 flex-wrap gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">📋</span>
                      <div>
                        <h3 className="text-[11px] font-black uppercase tracking-wider text-black">
                          Master Product Directory &amp; Quick Jump Index ({activeItems.length} Products)
                        </h3>
                        <p className="text-[8.5px] text-gray-600">
                          Searchable master index. Click any product name, SKU, or plate number to jump directly to its price row or full-page photo plate.
                        </p>
                      </div>
                    </div>

                    {/* Interactive Live Search Bar for Screen / Offline HTML */}
                    <div className="no-print flex items-center gap-2">
                      <input
                        id="offline-catalog-search"
                        type="text"
                        placeholder="🔍 Type to filter products, SKUs, sizes..."
                        className="h-7 w-64 rounded-md border border-gray-400 bg-white px-2.5 text-[10.5px] font-medium text-black placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-black"
                      />
                    </div>
                  </div>

                  {/* Print-only PDF Search Guide Notice */}
                  <div className="hidden print:flex items-center justify-between p-1.5 rounded-lg border border-gray-400 bg-white text-[8px] text-gray-700">
                    <span>
                      🔍 <strong>Search in PDF:</strong> Press <strong className="font-mono text-black font-bold">Ctrl + F</strong> (or <strong className="font-mono text-black font-bold">⌘ + F</strong>) to instantly find any product, SKU, size, or material in this document.
                    </span>
                    <span className="font-mono font-bold text-gray-600">
                      Indexed {activeItems.length} Items · Direct Offline Anchor Links
                    </span>
                  </div>

                  {/* Dense, Clean, Searchable Table of Contents Grid */}
                  <div className="overflow-x-auto rounded-lg border border-gray-300 bg-white">
                    <table className="w-full text-left border-collapse text-[9px]">
                      <thead className="bg-gray-100 border-b border-gray-300 text-gray-800 font-bold uppercase tracking-wider text-[8px]">
                        <tr>
                          <th className="px-2 py-1.5 w-14 text-center">Plate #</th>
                          <th className="px-2 py-1.5">Product Title &amp; Configuration</th>
                          <th className="px-2 py-1.5 w-28">SKU Code</th>
                          <th className="px-2 py-1.5 w-32">Department</th>
                          <th className="px-2 py-1.5 text-right w-24">Direct Sale</th>
                          <th className="px-2 py-1.5 text-right w-24">SFEMI (15m)</th>
                          <th className="px-2 py-1.5 text-center w-28">Quick Jump</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {activeItems.map((item, idx) => {
                          const plateNumber = idx + 1;
                          const price = item.basePrice;

                          return (
                            <tr
                              key={`toc-${item.id}`}
                              className="toc-product-row hover:bg-gray-50 transition"
                            >
                              <td className="px-2 py-1 text-center font-mono font-bold text-black whitespace-nowrap">
                                <a
                                  href={`#photo-plate-${item.id}`}
                                  className="text-indigo-800 hover:underline inline-block px-1 py-0.2 rounded bg-indigo-50 border border-indigo-200"
                                  title="Jump to Photo Plate in PDF"
                                >
                                  #{plateNumber}
                                </a>
                              </td>
                              <td className="px-2 py-1 font-semibold text-gray-900">
                                <a
                                  href={`#row-${item.id}`}
                                  className="hover:text-blue-700 hover:underline"
                                  title="Jump to Price Table Row"
                                >
                                  {item.fullName}
                                </a>
                                {item.dimensions && (
                                  <span className="text-[7.5px] text-gray-500 block">
                                    📏 {item.dimensions}
                                  </span>
                                )}
                              </td>
                              <td className="px-2 py-1 font-mono font-bold text-gray-700 whitespace-nowrap">
                                <a
                                  href={`#photo-plate-${item.id}`}
                                  className="hover:text-indigo-800 hover:underline"
                                  title="Jump to Photo Plate in PDF"
                                >
                                  {item.sku}
                                </a>
                              </td>
                              <td className="px-2 py-1 text-gray-600 truncate max-w-[120px]">
                                {item.category}
                              </td>
                              <td className="px-2 py-1 text-right font-black text-black whitespace-nowrap">
                                {item.hasPrice ? formatCurrency(price) : "On Request"}
                              </td>
                              <td className="px-2 py-1 text-right font-bold text-emerald-800 whitespace-nowrap">
                                {item.sfemiMonthly > 0 ? `₹${item.sfemiMonthly.toLocaleString("en-IN")}/mo` : "—"}
                              </td>
                              <td className="px-2 py-1 text-center whitespace-nowrap space-x-1.5">
                                <a
                                  href={`#row-${item.id}`}
                                  className="font-bold text-blue-700 hover:underline"
                                  title="Jump to Price Row"
                                >
                                  📊 Table
                                </a>
                                <span className="text-gray-300">·</span>
                                <a
                                  href={`#photo-plate-${item.id}`}
                                  className="font-bold text-indigo-700 hover:underline"
                                  title="Jump to Photo Plate"
                                >
                                  📸 Plate #{plateNumber}
                                </a>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Matrix Table Section (Always present in DOM so SVGs and table can be printed) */}
            <div
              id="print-matrix-section"
              className="overflow-visible"
              style={{ display: printLayout === "matrix" ? "block" : "none" }}
            >
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-gray-100 border-b-2 border-gray-400 text-[10px] font-bold text-black uppercase tracking-wider">
                  <tr>
                    {showItemQrCodes && <th className="px-2 py-2 w-12 text-center">QR Code</th>}
                    <th className="px-2 py-2 w-24 text-center">Catalog Photo</th>
                    <th className="px-2 py-2 min-w-[180px]">Product &amp; Variant SKU</th>
                    <th className="px-2 py-2 min-w-[150px]">Specifications &amp; Warranty</th>
                    <th className="px-2 py-2 text-center w-20">Showroom Stock</th>
                    {schemes.direct_sale && <th className="px-2 py-2 text-right">Direct Sale (MRP)</th>}
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
                  {categoryHierarchy.map((mainGroup) => (
                    <Fragment key={`print-major-${mainGroup.categoryName}`}>
                      {mainGroup.subcategories.map((group, groupIdx) => (
                        <Fragment key={`print-${group.id}`}>
                          <tr
                            id={group.id}
                            className={`category-section-banner break-inside-avoid bg-zinc-900 text-white ${
                              pageBreakPerCategory && groupIdx === 0 ? "category-major-group" : ""
                            }`}
                          >
                            <td colSpan={totalPrintCols} className="px-2.5 py-1.5 font-bold">
                              <div className="flex items-center justify-between flex-wrap gap-2 text-white">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm">{group.icon}</span>
                                  <span className="text-[10px] font-black uppercase tracking-wider text-white">
                                    {group.categoryName} › {group.subcategoryName}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 text-[9px]">
                                  <span className="px-1.5 py-0.2 rounded bg-white/20 text-white font-mono">
                                    {group.itemCount} {group.itemCount === 1 ? "Product" : "Products"}
                                  </span>
                                  {group.hasPricedItems && (
                                    <span className="text-emerald-300 font-semibold">
                                      {schemes.rent && group.minRentMonthly > 0
                                        ? `Rent from ₹${group.minRentMonthly.toLocaleString("en-IN")}/mo`
                                        : `From ${formatCurrency(group.minPrice)}`}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                          {group.items.map((item) => {
                            const sItem = findServerItem(item.id);
                            const finalImg = sItem?.image_url || item.imageUrl;
                            const price = item.basePrice;

                            return (
                              <tr key={item.id} id={`row-${item.id}`} className="break-inside-avoid">
                                {showItemQrCodes && (
                                  <td className="px-2 py-2 align-middle text-center">
                                    <div className="flex flex-col items-center p-0.5 rounded bg-white border border-gray-300 w-11 shrink-0 mx-auto">
                                      <QRCode
                                        value={item.publicUrl}
                                        size={38}
                                        level="M"
                                        style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                                      />
                                      <a
                                        href={item.publicUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[6px] text-blue-700 font-bold mt-0.5 hover:underline"
                                      >
                                        Scan / Open
                                      </a>
                                    </div>
                                  </td>
                                )}
                        <td className="px-2 py-2 align-middle text-center">
                          {finalImg ? (
                            <a
                              href={`#photo-plate-${item.id}`}
                              title="Click to view full photo plate in PDF"
                              className="cursor-pointer group block"
                            >
                              <div className="w-20 h-20 rounded-lg border border-gray-300 bg-white p-1 flex items-center justify-center overflow-hidden shrink-0 mx-auto shadow-2xs relative group-hover:border-primary transition">
                                <img
                                  src={finalImg}
                                  alt={item.fullName}
                                  className="w-full h-full object-contain"
                                  loading="eager"
                                  onError={(e) => {
                                    const currentSrc = (e.currentTarget as HTMLImageElement).src;
                                    if (currentSrc.includes("/media/") && !currentSrc.includes(":8000")) {
                                      (e.currentTarget as HTMLImageElement).src = currentSrc.replace(/:\d+\/media\//, ":8000/media/");
                                    }
                                  }}
                                />
                                {item.isChild && (
                                  <span className="absolute bottom-0 inset-x-0 bg-black/85 text-white text-[6.5px] font-bold text-center py-0.5 truncate px-0.5 uppercase tracking-tight">
                                    {item.name.replace(item.parentName || "", "").replace(/^[\s—–-]+/, "") || item.sku}
                                  </span>
                                )}
                              </div>
                              <span className="text-[7px] text-blue-700 font-bold hover:underline block text-center mt-0.5">
                                📸 Plate #{activeItems.findIndex((x) => x.id === item.id) + 1}
                              </span>
                            </a>
                          ) : (
                            <a
                              href={`#photo-plate-${item.id}`}
                              title="Click to view full photo plate in PDF"
                              className="cursor-pointer group block"
                            >
                              <div className="w-20 h-20 rounded-lg border border-gray-200 bg-gray-50 flex flex-col items-center justify-center text-center p-1 shrink-0 mx-auto">
                                <span className="text-lg">{getCategoryIcon(item.categoryName, item.subcategoryName)}</span>
                                <span className="text-[6.5px] text-gray-400 font-mono mt-0.5">No photo</span>
                                <span className="text-[6.5px] font-bold text-gray-500 font-mono truncate max-w-[70px]">{item.sku}</span>
                              </div>
                              <span className="text-[7px] text-gray-500 font-mono block text-center mt-0.5">
                                Plate #{activeItems.findIndex((x) => x.id === item.id) + 1}
                              </span>
                            </a>
                          )}
                        </td>
                        <td className="px-2 py-2 align-middle">
                          <div className="font-extrabold text-black text-xs leading-snug">
                            <a
                              href={`#photo-plate-${item.id}`}
                              className="hover:text-primary transition"
                              title="Click to view full photo plate in PDF"
                            >
                              {item.fullName}
                            </a>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                            <span className="font-mono text-[8.5px] font-bold px-1.5 py-0.2 rounded bg-gray-100 text-gray-800 border border-gray-300">
                              SKU: {item.sku}
                            </span>
                            {item.brand && (
                              <span className="text-[8.5px] font-semibold text-gray-600">Brand: {item.brand}</span>
                            )}
                            <a
                              href={`#photo-plate-${item.id}`}
                              className="text-[7.5px] font-bold text-indigo-700 hover:underline inline-flex items-center gap-0.5 ml-1"
                              title="Click to view full photo plate in PDF"
                            >
                              📸 View Plate #{activeItems.findIndex((x) => x.id === item.id) + 1}
                            </a>
                          </div>
                          <div className="text-[8.5px] text-gray-500 mt-0.5">{item.category}</div>
                          <div className="mt-0.5 text-[8px] font-semibold text-blue-800">
                            🏷️ subidhafurnitureasansol.com › <span className="font-mono font-bold">{item.sku}</span>
                          </div>
                        </td>
                        <td className="px-2 py-2 align-middle">
                          {item.specs.length > 0 ? (
                            <div className="flex flex-col gap-0.5 text-[9px] text-gray-800">
                              {item.dimensions && (
                                <div className="font-bold text-gray-900">📏 {item.dimensions}</div>
                              )}
                              {item.warranty && (
                                <div className="font-semibold text-gray-700">🛡️ {item.warranty}</div>
                              )}
                              {item.specs.filter((s) => s !== item.dimensions && s !== item.warranty && !s.includes("🛡️")).length > 0 && (
                                <div className="text-gray-600 text-[8.5px] leading-tight">
                                  {item.specs.filter((s) => s !== item.dimensions && s !== item.warranty && !s.includes("🛡️")).join(" · ")}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-[9px] text-gray-500">Standard showroom model</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-center align-middle whitespace-nowrap">
                          {item.currentStock > 0 ? (
                            <div className="inline-flex flex-col items-center px-1.5 py-0.5 rounded bg-green-50 border border-green-300">
                              <span className="text-[9px] font-black text-green-900">{item.currentStock} Ready</span>
                              <span className="text-[6.5px] font-bold text-green-700 uppercase">Showroom Dispatch</span>
                            </div>
                          ) : (
                            <div className="inline-flex flex-col items-center px-1.5 py-0.5 rounded bg-gray-50 border border-gray-200">
                              <span className="text-[9px] font-bold text-gray-700">Order</span>
                              <span className="text-[6.5px] text-gray-500">Custom Built</span>
                            </div>
                          )}
                        </td>
                        {schemes.direct_sale && (
                          <td className="px-2 py-2 text-right align-middle whitespace-nowrap">
                            <div className="font-black text-black text-xs">
                              {item.hasPrice ? formatCurrency(price) : "Contact"}
                            </div>
                            <div className="text-[7px] font-bold text-gray-500 uppercase tracking-tight">Showroom MRP</div>
                          </td>
                        )}
                        {schemes.rent &&
                          selectedRentTenures.map((t) => {
                            if (!item.hasPrice) {
                              return <td key={t} className="px-2 py-2 text-right text-gray-400 align-middle">-</td>;
                            }
                            const sRent = sItem?.quotes?.rent?.tenures?.[String(t)];
                            const m = sRent ? Number(sRent.monthly_amount) : Math.round((price * item.rentYieldPercent * 12) / t / 100);
                            const dep = sRent ? Number(sRent.deposit_amount) : Math.round((price * (depositPercent ?? 20)) / 100);
                            return (
                              <td key={t} className="px-2 py-2 text-right align-middle whitespace-nowrap">
                                <div className="font-black text-sky-950 text-xs">₹{m.toLocaleString("en-IN")}/mo</div>
                                <div className="text-[7px] text-sky-700 font-bold">{t}m · Dep: ₹{dep}</div>
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
                                <div className="font-black text-indigo-950 text-xs">₹{m.toLocaleString("en-IN")}/mo</div>
                                <div className="text-[7px] text-indigo-700 font-bold">{t}m · Tax OpEx</div>
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
                                {t === 15 ? (
                                  <div className="rounded p-1 bg-emerald-50 border border-emerald-400 text-right">
                                    <div className="font-black text-black text-xs">⭐ ₹{m.toLocaleString("en-IN")}/mo</div>
                                    <div className="text-[7px] font-black text-emerald-800 uppercase tracking-tight">15M Special Promotion</div>
                                    <div className="text-[6.5px] font-bold text-emerald-900 leading-tight">Remaining Future EMIs Waived</div>
                                  </div>
                                ) : (
                                  <div>
                                    <div className="font-black text-black text-xs">₹{m.toLocaleString("en-IN")}/mo</div>
                                    <div className="text-[7px] text-emerald-700 font-bold">{t}m Advance EMI</div>
                                  </div>
                                )}
                              </td>
                            );
                          })}
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </Fragment>
          ))}
        </tbody>
              </table>
            </div>

            {/* Cards Grid Section (Always present in DOM so SVGs and cards can be printed) */}
            <div
              id="print-cards-section"
              className="space-y-4"
              style={{ display: printLayout === "cards" ? "block" : "none" }}
            >
              {categoryHierarchy.map((mainGroup) => (
                <div
                  key={`cards-major-${mainGroup.categoryName}`}
                  className={`space-y-4 ${pageBreakPerCategory ? "category-major-group" : ""}`}
                >
                  {mainGroup.subcategories.map((group) => (
                    <div key={group.id} id={`cards-${group.id}`} className="space-y-2.5 break-inside-avoid">
                      <div className="category-section-banner rounded-lg bg-zinc-900 text-white px-3 py-1.5 flex items-center justify-between break-inside-avoid">
                        <div className="flex items-center gap-2">
                          <span>{group.icon}</span>
                          <span className="text-xs font-black uppercase tracking-wide">
                            {group.categoryName} › {group.subcategoryName}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[9px]">
                          <span className="font-mono px-2 py-0.5 rounded bg-white/20 text-white font-bold">
                            {group.itemCount} {group.itemCount === 1 ? "Item" : "Items"}
                          </span>
                          {group.hasPricedItems && (
                            <span className="text-emerald-300 font-semibold">
                              {schemes.rent && group.minRentMonthly > 0
                                ? `Rent from ₹${group.minRentMonthly.toLocaleString("en-IN")}/mo`
                                : `From ${formatCurrency(group.minPrice)}`}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {group.items.map((item) => {
                          const sItem = findServerItem(item.id);
                          const finalImg = sItem?.image_url || item.imageUrl;
                          const price = item.basePrice;

                          return (
                            <div
                              key={item.id}
                              className="print-card-item rounded-xl border-2 border-gray-400 p-3 bg-white flex flex-col justify-between gap-2.5 break-inside-avoid shadow-xs"
                            >
                              {/* Card Top: Department & Stock Header */}
                              <div className="flex items-center justify-between gap-2 pb-1 border-b border-gray-200 text-[9px]">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-gray-800 uppercase tracking-wider">{item.category}</span>
                                  {item.isChild && (
                                    <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 border border-amber-300 font-extrabold text-[7.5px] uppercase">
                                      {item.name.replace(item.parentName || "", "").replace(/^[\s—–-]+/, "") || "Variant"}
                                    </span>
                                  )}
                                </div>
                                {item.currentStock > 0 ? (
                                  <span className="px-2 py-0.5 rounded-full font-bold text-green-900 bg-green-100 border border-green-300 text-[7.5px]">
                                    🟢 {item.currentStock} Ready in Showroom
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full font-bold text-gray-700 bg-gray-100 border border-gray-300 text-[7.5px]">
                                    🟡 Made to Order
                                  </span>
                                )}
                              </div>

                              {/* Full Image Catalog Tile */}
                              <div className="relative w-full h-44 rounded-xl border border-gray-300 bg-gradient-to-b from-white to-gray-50/50 p-2 flex items-center justify-center overflow-hidden shrink-0 shadow-2xs">
                                {finalImg ? (
                                  <img
                                    src={finalImg}
                                    alt={item.fullName}
                                    className="w-full h-full object-contain"
                                    loading="eager"
                                  />
                                ) : (
                                  <div className="w-full h-full bg-gray-50 flex flex-col items-center justify-center text-center p-2">
                                    <span className="text-3xl">{getCategoryIcon(item.categoryName, item.subcategoryName)}</span>
                                    <span className="text-[8.5px] text-gray-500 font-bold mt-1 uppercase tracking-wider">Showroom Catalog</span>
                                    <span className="text-[7.5px] text-gray-400 font-mono">SKU: {item.sku}</span>
                                  </div>
                                )}

                                {/* Top Left SKU badge */}
                                <div className="absolute top-2 left-2 flex items-center gap-1">
                                  <span className="px-2 py-0.5 rounded-md bg-black/85 text-white font-mono text-[8.5px] font-bold shadow-xs">
                                    {item.sku}
                                  </span>
                                </div>

                                {/* Top Right Micro QR Code */}
                                {showItemQrCodes && (
                                  <div className="absolute top-2 right-2 p-1 rounded-lg bg-white/95 border border-gray-300 shadow-xs flex flex-col items-center w-12">
                                    <QRCode value={item.publicUrl} size={36} level="M" style={{ height: "auto", width: "100%" }} />
                                    <span className="text-[5.5px] text-blue-700 font-black mt-0.5">3D / AR ↗</span>
                                  </div>
                                )}

                                {/* Bottom spec quick banner */}
                                {item.dimensions && (
                                  <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/75 text-white text-[7.5px] font-semibold backdrop-blur-xs">
                                    📏 {item.dimensions}
                                  </div>
                                )}
                              </div>

                              {/* Title & Detailed Specs */}
                              <div>
                                <div className="font-extrabold text-xs text-black leading-snug">{item.fullName}</div>
                                <div className="flex items-center gap-2 text-[8.5px] text-gray-600 mt-0.5">
                                  <span>Model: <strong>{item.code}</strong></span>
                                  {item.brand && <span>· Brand: <strong>{item.brand}</strong></span>}
                                </div>

                                {item.specs.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {item.specs.map((s, idx) => (
                                      <span
                                        key={idx}
                                        className="text-[8px] font-semibold bg-gray-100 px-1.5 py-0.2 rounded border border-gray-300 text-gray-800"
                                      >
                                        {s}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Advertising Pricing Matrix */}
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-2 border-t border-gray-300 text-xs">
                                {schemes.direct_sale && (
                                  <div className="p-1.5 rounded-lg bg-gray-50 border border-gray-300 flex flex-col justify-between">
                                    <span className="block text-[7.5px] font-bold text-gray-600 uppercase tracking-tight">Direct Sale (MRP)</span>
                                    <span className="text-xs font-black text-black">
                                      {item.hasPrice ? formatCurrency(item.basePrice) : "On Request"}
                                    </span>
                                    <span className="text-[6.5px] text-gray-500 font-medium">Showroom Best Offer</span>
                                  </div>
                                )}

                                {schemes.rent && (
                                  <div className="p-1.5 rounded-lg bg-sky-50 border border-sky-300 flex flex-col justify-between">
                                    <span className="block text-[7.5px] font-bold text-sky-800 uppercase tracking-tight">Smart Rent</span>
                                    {selectedRentTenures.slice(0, 2).map((t) => {
                                      const m = Math.round((item.basePrice * item.rentYieldPercent * 12) / t / 100);
                                      return (
                                        <div key={t} className="text-[10px] font-black text-sky-950">
                                          {t}m: ₹{m.toLocaleString("en-IN")}/mo
                                        </div>
                                      );
                                    })}
                                    <span className="text-[6.5px] text-sky-700 font-medium">Refundable Deposit</span>
                                  </div>
                                )}

                                {schemes.lease && (
                                  <div className="p-1.5 rounded-lg bg-indigo-50 border border-indigo-300 flex flex-col justify-between">
                                    <span className="block text-[7.5px] font-bold text-indigo-800 uppercase tracking-tight">Commercial Lease</span>
                                    {selectedLeaseTenures.slice(0, 2).map((t) => {
                                      const m = Math.round((item.basePrice * item.leaseYieldPercent * 12) / t / 100);
                                      return (
                                        <div key={t} className="text-[10px] font-black text-indigo-950">
                                          {t}m: ₹{m.toLocaleString("en-IN")}/mo
                                        </div>
                                      );
                                    })}
                                    <span className="text-[6.5px] text-indigo-700 font-medium">Tax-Deductible OpEx</span>
                                  </div>
                                )}

                                {schemes.sfemi && (
                                  <div className="p-1.5 rounded-lg bg-emerald-50 border border-emerald-400 flex flex-col justify-between shadow-2xs">
                                    <span className="block text-[7.5px] font-black text-emerald-900 uppercase tracking-tight">⭐ SFEMI Plan</span>
                                    {selectedSfemiTenures.map((t) => {
                                      const m = Math.round(item.basePrice / t);
                                      return (
                                        <div key={t} className="text-[10px] font-black text-emerald-950">
                                          {t === 15 ? "15m: " : `${t}m: `}₹{m.toLocaleString("en-IN")}/mo
                                        </div>
                                      );
                                    })}
                                    <span className="text-[6.5px] text-emerald-800 font-bold leading-tight">Remaining Future EMIs Waived</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* Brand Advertising Showcase Section (Always present in DOM so SVGs and cards can be printed) */}
            <div
              id="print-showcase-section"
              className="space-y-4"
              style={{ display: printLayout === "showcase" ? "block" : "none" }}
            >
              {categoryHierarchy.map((mainGroup) => (
                <div
                  key={`showcase-major-${mainGroup.categoryName}`}
                  className={`space-y-4 ${pageBreakPerCategory ? "category-major-group" : ""}`}
                >
                  {mainGroup.subcategories.map((group) => (
                    <div key={group.id} id={`showcase-${group.id}`} className="space-y-3 break-inside-avoid">
                      <div className="category-section-banner rounded-lg bg-zinc-900 text-white px-3 py-1.5 flex items-center justify-between break-inside-avoid">
                        <div className="flex items-center gap-2">
                          <span>{group.icon}</span>
                          <span className="text-xs font-black uppercase tracking-wide">
                            {group.categoryName} › {group.subcategoryName}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[9px]">
                          <span className="font-mono px-2 py-0.5 rounded bg-white/20 text-white font-bold">
                            {group.itemCount} {group.itemCount === 1 ? "Item" : "Items"}
                          </span>
                          {group.hasPricedItems && (
                            <span className="text-emerald-300 font-semibold">
                              {schemes.rent && group.minRentMonthly > 0
                                ? `Rent from ₹${group.minRentMonthly.toLocaleString("en-IN")}/mo`
                                : `From ${formatCurrency(group.minPrice)}`}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="showcase-grid grid grid-cols-1 md:grid-cols-2 gap-3.5">
                        {group.items.map((item) => {
                          const sItem = findServerItem(item.id);
                          const finalImg = sItem?.image_url || item.imageUrl;
                          const price = item.basePrice;

                          return (
                            <div
                              key={item.id}
                              className="print-showcase-item rounded-xl border-2 border-gray-400 p-3 bg-white flex flex-col justify-between gap-2.5 break-inside-avoid shadow-sm"
                            >
                              {/* Top Hero: Large Photo + QR & Identity */}
                              <div className="flex items-start gap-3">
                                {/* Large Photo */}
                                <div className="relative w-36 h-36 rounded-xl border border-gray-300 bg-slate-50 p-1 flex items-center justify-center overflow-hidden shrink-0 shadow-2xs">
                                  {finalImg ? (
                                    <img
                                      src={finalImg}
                                      alt={item.fullName}
                                      className="w-full h-full object-contain"
                                      loading="eager"
                                    />
                                  ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center text-center p-1">
                                      <span className="text-3xl">{getCategoryIcon(item.categoryName, item.subcategoryName)}</span>
                                      <span className="text-[7.5px] text-gray-400 font-mono mt-1">Official Showroom Collection</span>
                                    </div>
                                  )}
                                  <span className="absolute top-1 left-1 bg-black/85 text-white font-mono text-[7px] font-bold px-1.5 py-0.2 rounded">
                                    {item.sku}
                                  </span>
                                  {item.isChild && (
                                    <span className="absolute bottom-1 inset-x-1 bg-amber-500 text-black text-[6.5px] font-extrabold px-1 py-0.2 rounded text-center truncate uppercase tracking-tight shadow-xs">
                                      {item.name.replace(item.parentName || "", "").replace(/^[\s—–-]+/, "") || "Variant"}
                                    </span>
                                  )}
                                </div>

                                {/* Identity & QR */}
                                <div className="min-w-0 flex-1 flex flex-col justify-between h-36">
                                  <div>
                                    <div className="flex items-center justify-between gap-1">
                                      <span className="text-[8px] font-bold uppercase tracking-wider text-gray-500">
                                        {item.categoryName} › {item.subcategoryName}
                                      </span>
                                      {item.currentStock > 0 ? (
                                        <span className="px-1.5 py-0.2 rounded text-[7.5px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-300">
                                          ✓ {item.currentStock} Ready
                                        </span>
                                      ) : (
                                        <span className="text-[7.5px] text-gray-500 font-medium">Available on Order</span>
                                      )}
                                    </div>

                                    <h3 className="font-black text-xs text-black uppercase tracking-tight mt-0.5 line-clamp-2">
                                      {item.fullName}
                                    </h3>

                                    <div className="font-mono text-[8.5px] text-gray-600 mt-0.5">
                                      Model: <strong>{item.code}</strong> {item.brand ? `· Brand: ${item.brand}` : ""}
                                    </div>
                                    <div className="text-[8px] text-blue-800 font-semibold mt-0.5">
                                      🏷️ subidhafurnitureasansol.com › <span className="font-mono font-bold">{item.sku}</span>
                                    </div>
                                  </div>

                                  {/* QR Code Bar */}
                                  {showItemQrCodes && (
                                    <div className="flex items-center gap-2 pt-1 border-t border-gray-200">
                                      <div className="w-11 h-11 bg-white p-0.5 rounded border border-gray-300 shrink-0 flex items-center justify-center">
                                        <QRCode
                                          value={item.publicUrl}
                                          size={40}
                                          level="M"
                                          style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                                        />
                                      </div>
                                      <div className="min-w-0 text-[8px] text-gray-600 leading-tight">
                                        <span className="font-bold text-black block">Scan for 360° View &amp; Booking:</span>
                                        <span className="text-[7px] text-gray-500 font-mono">Mobile Instant Verification</span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>

                          {/* Spec Pills */}
                          {item.specs.length > 0 && (
                            <div className="flex flex-wrap gap-1 py-1 border-y border-gray-200">
                              {item.specs.map((s, idx) => (
                                <span
                                  key={idx}
                                  className="text-[8.5px] font-medium bg-gray-100 text-gray-800 px-1.5 py-0.2 rounded border border-gray-300"
                                >
                                  {s}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Promotional Pricing Strip */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-xs bg-gray-50 p-2 rounded-lg border border-gray-200">
                            {/* Direct Sale */}
                            {schemes.direct_sale && (
                              <div className="p-1 rounded bg-white border border-gray-300">
                                <span className="block text-[8px] font-bold text-gray-600 uppercase">Direct Sale MRP</span>
                                <span className="text-xs font-black text-black">
                                  {item.hasPrice ? formatCurrency(item.basePrice) : "On Request"}
                                </span>
                              </div>
                            )}

                            {/* Smart Rent */}
                            {schemes.rent && (
                              <div className="p-1 rounded bg-sky-50 border border-sky-300">
                                <span className="block text-[8px] font-bold text-sky-900 uppercase">Smart Rent</span>
                                {selectedRentTenures.slice(0, 2).map((t) => {
                                  const m = Math.round((item.basePrice * item.rentYieldPercent * 12) / t / 100);
                                  return (
                                    <div key={t} className="text-[9.5px] font-bold text-sky-950">
                                      {t}m: ₹{m.toLocaleString("en-IN")}/mo
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* Commercial Lease */}
                            {schemes.lease && (
                              <div className="p-1 rounded bg-indigo-50 border border-indigo-300">
                                <span className="block text-[8px] font-bold text-indigo-900 uppercase">Comm. Lease</span>
                                {selectedLeaseTenures.slice(0, 2).map((t) => {
                                  const m = Math.round((item.basePrice * item.leaseYieldPercent * 12) / t / 100);
                                  return (
                                    <div key={t} className="text-[9.5px] font-bold text-indigo-950">
                                      {t}m: ₹{m.toLocaleString("en-IN")}/mo
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* SFEMI Promotion */}
                            {schemes.sfemi && (
                              <div className="p-1 rounded bg-amber-50 border border-amber-300">
                                <span className="block text-[8px] font-bold text-amber-900 uppercase">⭐ SFEMI Promo</span>
                                {selectedSfemiTenures.map((t) => {
                                  const m = Math.round(item.basePrice / t);
                                  return (
                                    <div key={t} className="text-[9.5px] font-black text-amber-950">
                                      {t === 15 ? "15m Promo: " : `${t}m: `}₹{m.toLocaleString("en-IN")}/mo
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* Full-Page Photo Plates Appendix (Offline Interactive PDF Links) */}
            <div
              id="print-photo-plates-section"
              className="space-y-4"
              style={{ display: includePhotoPlates ? "block" : "none" }}
            >
              {activeItems.map((item, idx) => {
                const sItem = findServerItem(item.id);
                const finalImg = sItem?.image_url || item.imageUrl;
                const plateNumber = idx + 1;
                const price = item.basePrice;

                return (
                  <div
                    key={`plate-${item.id}`}
                    id={`photo-plate-${item.id}`}
                    className="photo-plate-item rounded-xl border border-gray-300 p-4 bg-white"
                    style={{
                      pageBreakBefore: "always",
                      breakBefore: "page",
                      minHeight: "260mm",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                    }}
                  >
                    {/* Plate Top Navigation & Header */}
                    <div className="border-b-2 border-black pb-2 flex items-center justify-between">
                      <div>
                        <span className="text-[9px] font-bold tracking-widest uppercase text-gray-500">
                          {businessInfo.name} · Official Showroom Collection
                        </span>
                        <div className="text-[11px] font-black text-gray-800">
                          {item.category}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="inline-block bg-black text-white px-2.5 py-0.5 rounded font-mono text-[11px] font-bold tracking-wider">
                          PHOTO PLATE #{plateNumber} / {activeItems.length}
                        </span>
                        <div>
                          <a
                            href={`#row-${item.id}`}
                            className="text-[9.5px] font-bold text-blue-700 hover:underline block mt-0.5"
                          >
                            ↩ Back to Price Table (Row #{plateNumber})
                          </a>
                        </div>
                      </div>
                    </div>

                    {/* Plate Product Identity */}
                    <div className="pt-2">
                      <h2 className="text-lg font-black text-black leading-tight">
                        {item.fullName}
                      </h2>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-gray-100 text-gray-900 border border-gray-400">
                          SKU: {item.sku}
                        </span>
                        {item.brand && (
                          <span className="text-xs font-semibold text-gray-700">
                            Brand: {item.brand}
                          </span>
                        )}
                        {item.currentStock > 0 ? (
                          <span className="px-2 py-0.5 rounded-full font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 text-[10px]">
                            🟢 Ready in Stock ({item.currentStock} Units)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full font-bold text-amber-800 bg-amber-50 border border-amber-300 text-[10px]">
                            🟡 Built to Order / Workshop Handcrafted
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Large High-Resolution Center Image Canvas */}
                    <div
                      className="w-full my-auto rounded-2xl border-2 border-gray-300 bg-white p-3 flex items-center justify-center overflow-hidden shadow-xs relative"
                      style={{ height: "135mm", maxHeight: "145mm" }}
                    >
                      {finalImg ? (
                        <img
                          src={finalImg}
                          alt={item.fullName}
                          className="w-full h-full object-contain"
                          loading="eager"
                          onError={(e) => {
                            const currentSrc = (e.currentTarget as HTMLImageElement).src;
                            if (currentSrc.includes("/media/") && !currentSrc.includes(":8000")) {
                              (e.currentTarget as HTMLImageElement).src = currentSrc.replace(/:\d+\/media\//, ":8000/media/");
                            }
                          }}
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-center p-6 text-gray-400">
                          <span className="text-6xl">{getCategoryIcon(item.categoryName, item.subcategoryName)}</span>
                          <span className="text-sm font-bold mt-2 text-gray-700 uppercase tracking-wide">
                            Official Showroom Product Blueprint
                          </span>
                          <span className="text-xs font-mono text-gray-500 mt-0.5">SKU: {item.sku}</span>
                        </div>
                      )}
                    </div>

                    {/* Specifications & Dimensions Strip */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-2.5 rounded-xl border border-gray-300 bg-gray-50 text-[9.5px]">
                      <div>
                        <span className="font-bold text-gray-500 block uppercase text-[8px]">Dimensions &amp; Footprint:</span>
                        <span className="font-semibold text-gray-900">{item.dimensions || "Standard Ergonomic Size"}</span>
                      </div>
                      <div>
                        <span className="font-bold text-gray-500 block uppercase text-[8px]">Warranty Coverage:</span>
                        <span className="font-semibold text-gray-900">{item.warranty || "Standard 12 Months Mfg Warranty"}</span>
                      </div>
                      <div>
                        <span className="font-bold text-gray-500 block uppercase text-[8px]">Fulfillment Mode:</span>
                        <span className="font-semibold text-gray-900">Showroom Inspection / Doorstep Delivery</span>
                      </div>
                      <div>
                        <span className="font-bold text-gray-500 block uppercase text-[8px]">Origin &amp; Quality:</span>
                        <span className="font-semibold text-gray-900">100% Genuine Certified Quality</span>
                      </div>
                    </div>

                    {/* Commercial Rates Summary (Direct Sale, Rent, Lease, SFEMI) */}
                    <div className="mt-2 p-2.5 rounded-xl border-2 border-black bg-white">
                      <div className="text-[9px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                        Flexible Store Acquisition Schemes (Choose Direct Sale, Rent, Lease, or SFEMI)
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-center divide-x divide-gray-300">
                        <div className="px-1">
                          <span className="text-[8px] font-bold text-gray-600 uppercase block">Direct Sale MRP</span>
                          <span className="text-sm font-black text-black">
                            {item.hasPrice ? formatCurrency(price) : "Custom Quote"}
                          </span>
                          <span className="text-[7.5px] text-gray-500 block">GST Inclusive</span>
                        </div>

                        <div className="px-1">
                          <span className="text-[8px] font-bold text-blue-700 uppercase block">Rental Plan</span>
                          <span className="text-xs font-black text-blue-900">
                            {item.rentMonthly > 0 ? `₹${item.rentMonthly.toLocaleString("en-IN")}/mo` : "Available on Request"}
                          </span>
                          <span className="text-[7.5px] text-gray-500 block">
                            {item.rentDeposit > 0 ? `Dep: ₹${item.rentDeposit.toLocaleString("en-IN")} (Refundable)` : "Zero Security Band"}
                          </span>
                        </div>

                        <div className="px-1">
                          <span className="text-[8px] font-bold text-purple-700 uppercase block">Leasing Plan</span>
                          <span className="text-xs font-black text-purple-900">
                            {item.leaseMonthly > 0 ? `₹${item.leaseMonthly.toLocaleString("en-IN")}/mo` : "Available on Request"}
                          </span>
                          <span className="text-[7.5px] text-gray-500 block">
                            {item.leaseDeposit > 0 ? `Dep: ₹${item.leaseDeposit.toLocaleString("en-IN")} (Refundable)` : "Zero Security Band"}
                          </span>
                        </div>

                        <div className="px-1">
                          <span className="text-[8px] font-bold text-emerald-700 uppercase block">SFEMI (15m Promo)</span>
                          <span className="text-xs font-black text-emerald-900">
                            {item.sfemiMonthly > 0 ? `₹${item.sfemiMonthly.toLocaleString("en-IN")}/mo` : "Available on Request"}
                          </span>
                          <span className="text-[7.5px] text-emerald-800 font-semibold block">
                            Remaining Future EMIs Waived
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Plate Footer: Micro QR & Brand Identity */}
                    <div className="mt-2 pt-2 border-t border-gray-300 flex items-center justify-between text-[8px] text-gray-600">
                      <div className="flex items-center gap-2">
                        <div className="w-9 h-9 p-0.5 bg-white border border-gray-300 rounded shrink-0">
                          <QRCode
                            value={item.publicUrl}
                            size={32}
                            level="M"
                            style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                          />
                        </div>
                        <div>
                          <div className="font-bold text-black">{businessInfo.name} · Official Catalog Plate #{plateNumber}</div>
                          <div>📍 {businessInfo.address} · 📞 {businessInfo.phone}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <a
                          href={`#row-${item.id}`}
                          className="text-[9px] font-bold text-blue-700 hover:underline"
                        >
                          ↩ Back to Price Table (Row #{plateNumber})
                        </a>
                        <div className="text-[7.5px] text-gray-500 font-mono">
                          {quotationNumber} · Valid till {validityEndDate}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Print Footer */}
            <div id="print-sheet-footer" className="pt-3 border-t-2 border-black text-[9px] text-gray-700 leading-normal space-y-3 break-inside-avoid">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <p>
                    <strong>Commercial Terms &amp; Tax:</strong> {taxNote}
                  </p>
                  <p>
                    <strong>Terms &amp; Notes:</strong> Indicative pricing based on current showroom catalog. Rent &amp; Lease agreements require identity &amp; address verification (KYC). Security deposit is 100% refundable upon product return in good order. SFEMI Advance EMI operates under approved transparent promotional benefits (Remaining Future EMIs Waived for Beneficiaries under the 15-Month Promotion).
                  </p>
                  <p className="mt-0.5">
                    {businessInfo.name} · Showroom: {businessInfo.address} · 📞 {businessInfo.phone} · 🌐{" "}
                    <a
                      href={webappCatalogUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-700 font-bold underline hover:text-blue-900"
                    >
                      {businessInfo.website}
                    </a>
                  </p>
                </div>
                <div className="shrink-0 text-right font-mono text-[9px] text-gray-500 space-y-0.5">
                  <div>Quotation: <strong>{quotationNumber}</strong></div>
                  <div>Valid: {validityEndDate}</div>
                  <div className="text-[8px] text-gray-400">Page Reference Sheet</div>
                </div>
              </div>

              {/* Dual Authorized Signatory & Seal Block */}
              {showSignatoryBlock && (
                <div className="pt-2 border-t border-gray-300 grid grid-cols-2 gap-6 break-inside-avoid">
                  <div className="p-2.5 rounded-lg border border-gray-400 bg-gray-50/50 text-center">
                    <div className="h-8 border-b border-dashed border-gray-400 mb-1"></div>
                    <div className="text-[9px] font-bold uppercase text-gray-800">Customer Acceptance &amp; Signature</div>
                    <div className="text-[8px] text-gray-500">
                      Client: {customerName.trim() || "________________________"} · Date: ____/____/2026
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg border border-gray-400 bg-gray-50/50 text-center">
                    <div className="h-8 border-b border-dashed border-gray-400 mb-1 flex items-end justify-center">
                      <span className="text-[8px] text-gray-400 italic font-mono">[ Official Seal / Authorized Signature ]</span>
                    </div>
                    <div className="text-[9px] font-bold uppercase text-gray-800">For {businessInfo.name}</div>
                    <div className="text-[8px] text-gray-500">Authorized Signatory · {salesConsultant}</div>
                  </div>
                </div>
              )}
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
              onClick={() => handleDownloadHtml()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background hover:bg-muted text-foreground px-3 py-2 text-xs font-medium transition cursor-pointer"
              title="Save complete price list as standalone offline HTML file"
            >
              <Download className="h-3.5 w-3.5 text-primary" />
              Download HTML
            </button>
            <button
              type="button"
              onClick={() => handlePrint()}
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
