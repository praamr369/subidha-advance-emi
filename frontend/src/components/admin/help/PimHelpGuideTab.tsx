"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleHelp,
  Copy,
  ExternalLink,
  GitBranch,
  Layers,
  Lightbulb,
  Package,
  Receipt,
  ShoppingBag,
  Sparkles,
} from "lucide-react";

import { openAdminHelp } from "@/components/admin/help/AdminHelpDrawer";

export default function PimHelpGuideTab() {
  const [copiedFeed, setCopiedFeed] = useState(false);
  const feedUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/v1/public/catalog/whatsapp-feed.csv`
      : "https://subidhafurnitureasansol.com/api/v1/public/catalog/whatsapp-feed.csv";

  const handleCopyFeed = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(feedUrl).then(() => {
        setCopiedFeed(true);
        setTimeout(() => setCopiedFeed(false), 2500);
      });
    }
  };
  return (
    <div className="space-y-6">
      {/* Hero Explainer Banner */}
      <div className="rounded-2xl border border-primary/25 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--primary)_10%,transparent),transparent)] p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
              <Layers className="size-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-foreground">
                  PIM (Product Information Management) Master Guide
                </h3>
                <span className="rounded-full bg-primary/15 border border-primary/30 px-2.5 py-0.5 text-xs font-semibold text-primary">
                  Core Catalog Architecture
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground leading-relaxed max-w-3xl">
                Why PIM is indispensable for modern furniture retail, how product blueprints govern variant SKUs,
                and how the catalog feeds into Advance EMI subscriptions, direct retail sales, and manufacturing BOMs.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => openAdminHelp("pim-products")}
              className="inline-flex items-center gap-2 rounded-xl border border-primary bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition shadow-xs"
            >
              <CircleHelp className="size-4" />
              <span>Full Workflows Drawer</span>
            </button>
            <Link
              href="/admin/products/create"
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-muted transition"
            >
              <span>Create Product</span>
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>

        {/* Key Pillars */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
          <div className="rounded-xl border border-border bg-card/80 p-3.5 space-y-1">
            <div className="font-bold text-xs text-foreground flex items-center gap-1.5">
              <Lightbulb className="size-3.5 text-amber-500" />
              <span>Why PIM is Needed</span>
            </div>
            <p className="text-xs text-muted-foreground leading-5">
              Prevents duplicate product creation. One conceptual blueprint (e.g. &apos;Royal Teak Bed&apos;) manages King/Queen sizes and Walnut/Honey finishes under one roof.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card/80 p-3.5 space-y-1">
            <div className="font-bold text-xs text-foreground flex items-center gap-1.5">
              <GitBranch className="size-3.5 text-blue-500" />
              <span>How Blueprints &amp; SKUs Work</span>
            </div>
            <p className="text-xs text-muted-foreground leading-5">
              Parent Blueprint defines category, HSN tax code, and base specs. Child Variant SKUs represent physical inventory units with distinct barcodes.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card/80 p-3.5 space-y-1">
            <div className="font-bold text-xs text-foreground flex items-center gap-1.5">
              <Receipt className="size-3.5 text-emerald-500" />
              <span>Multi-Channel Selling</span>
            </div>
            <p className="text-xs text-muted-foreground leading-5">
              Publishing a blueprint unlocks the product for Lucky Plan EMI contracts, POS Direct Sales invoices, Furniture Rentals, and Workshop BOMs.
            </p>
          </div>
        </div>
      </div>

      {/* 5-Stage PIM Lifecycle Visual Stepper */}
      <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div>
            <h4 className="text-sm sm:text-base font-bold text-foreground">
              End-to-End PIM Workflow Lifecycle
            </h4>
            <p className="text-xs text-muted-foreground">
              From product blueprint conception to sales invoice fulfillment.
            </p>
          </div>
          <span className="text-xs font-semibold text-primary">5 Progressive Stages</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {[
            {
              num: 1,
              title: "Create Blueprint",
              desc: "Enter base name, category, HSN code (e.g. 9403), base cost, and item type (Finished Good, Raw Material).",
              action: "/admin/products/create",
              actionLabel: "Create Product",
            },
            {
              num: 2,
              title: "Define Attributes",
              desc: "Configure attributes: dimensions, wood species (Sheesham, Teak, Mango), and finish color.",
              action: "/admin/products/masters",
              actionLabel: "Manage Masters",
            },
            {
              num: 3,
              title: "Generate Variant SKUs",
              desc: "In PIM tab, generate SKUs for each size and finish permutation. Assign distinct SKU codes.",
              action: "#",
              actionLabel: "PIM Blueprints Tab",
            },
            {
              num: 4,
              title: "Stock & Valuation",
              desc: "Link each SKU to inventory profile: track physical count, warehouse location, and reorder levels.",
              action: "/admin/inventory/readiness",
              actionLabel: "Stock Profile",
            },
            {
              num: 5,
              title: "Channel Activation",
              desc: "Enroll in Lucky Plan batches or sell directly on POS Direct Sale invoices.",
              action: "/admin/subscriptions/advance-emi/create",
              actionLabel: "New Contract",
            },
          ].map((stage) => (
            <div
              key={stage.num}
              className="rounded-xl border border-border/70 bg-muted/20 p-4 space-y-2 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs">
                    {stage.num}
                  </span>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">
                    Stage {stage.num}
                  </span>
                </div>
                <h5 className="mt-2 font-bold text-xs text-foreground">{stage.title}</h5>
                <p className="mt-1 text-[11px] text-muted-foreground leading-4">{stage.desc}</p>
              </div>

              {stage.action !== "#" ? (
                <Link
                  href={stage.action}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline pt-2"
                >
                  <span>{stage.actionLabel}</span>
                  <ExternalLink className="size-2.5" />
                </Link>
              ) : (
                <span className="text-[11px] font-semibold text-muted-foreground pt-2">
                  {stage.actionLabel}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Live Meta & WhatsApp Catalog Auto-Sync (100% Free ₹0) */}
      <div className="rounded-2xl border-2 border-emerald-500/30 bg-gradient-to-br from-emerald-500/[0.07] via-card to-blue-500/[0.04] p-6 space-y-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/60 pb-4">
          <div className="flex items-start gap-3.5">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-xs">
              <ShoppingBag className="size-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-base font-bold text-foreground">
                  Meta &amp; WhatsApp Business Catalog Auto-Sync
                </h4>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  <Sparkles className="size-3" />
                  100% Completely Free (₹0)
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed max-w-2xl">
                Meta does not charge any money for catalog management or product synchronization. Your PIM catalog
                automatically syncs to WhatsApp Business, Facebook Shop, and Instagram Shopping via native scheduled feeds.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Link
              href="/admin/settings/business-setup/brand-data-center"
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-muted transition"
            >
              <span>Brand Data Center</span>
              <ArrowRight className="size-3.5" />
            </Link>
            <a
              href="https://business.facebook.com/commerce/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-primary bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition shadow-xs"
            >
              <span>Meta Commerce Manager</span>
              <ExternalLink className="size-3.5" />
            </a>
          </div>
        </div>

        {/* Live Scheduled Feed URL Box */}
        <div className="rounded-xl border border-emerald-500/25 bg-background/90 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <span>Live Scheduled Data Feed Endpoint (Official Meta Commerce Format)</span>
            </label>
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live &amp; Auto-Generated
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <code className="flex-1 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs font-mono text-foreground break-all select-all">
              {feedUrl}
            </code>
            <button
              type="button"
              onClick={handleCopyFeed}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-xs font-semibold transition"
            >
              {copiedFeed ? (
                <>
                  <Check className="size-3.5" />
                  <span>✓ Copied Feed URL!</span>
                </>
              ) : (
                <>
                  <Copy className="size-3.5" />
                  <span>📋 Copy Feed URL</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* 4-Step Free Setup Guide */}
        <div className="space-y-3">
          <h5 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            3-Minute Zero-Cost Setup Guide (Do This Once)
          </h5>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {[
              {
                step: "1",
                title: "Copy Feed URL",
                desc: "Copy the Live Feed URL above or from Brand Data Center. Products with photos and prices are exported in Meta CSV format.",
              },
              {
                step: "2",
                title: "Add to Meta Commerce",
                desc: "In Meta Commerce Manager, go to Catalogue > Data Sources > Add Items > Data Feed. Paste URL, schedule Daily at 06:00 AM, Currency INR.",
              },
              {
                step: "3",
                title: "Link WhatsApp Business",
                desc: "In Commerce Manager under Connected Channels, link your WhatsApp Business phone number. In-chat Shopping Bag (🛍️) appears immediately.",
              },
              {
                step: "4",
                title: "Facebook & Instagram",
                desc: "Optionally link Facebook Page Shop and Instagram Shopping for one-click product tags on social posts. ₹0 forever.",
              },
            ].map((s) => (
              <div
                key={s.step}
                className="rounded-xl border border-border/80 bg-card p-3.5 space-y-1.5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                      {s.step}
                    </span>
                    <h6 className="font-bold text-xs text-foreground">{s.title}</h6>
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed">
                    {s.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 3 Operational Guarantees */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1 border-t border-border/50">
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="size-4 text-emerald-500 shrink-0 mt-0.5" />
            <span>
              <strong className="text-foreground">Zero Manual Work:</strong> Store staff never re-type details, re-upload photos, or copy-paste prices into WhatsApp manually.
            </span>
          </div>
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="size-4 text-emerald-500 shrink-0 mt-0.5" />
            <span>
              <strong className="text-foreground">Always in Sync:</strong> Modifying a price or publishing in PIM updates WhatsApp &amp; Facebook automatically on the next fetch.
            </span>
          </div>
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="size-4 text-emerald-500 shrink-0 mt-0.5" />
            <span>
              <strong className="text-foreground">₹0 Cost Forever:</strong> Official native Meta Commerce scheduled feeds are 100% free with no third-party Shopify apps needed.
            </span>
          </div>
        </div>
      </div>

      {/* Comparison: Legacy Subscription Product vs PIM Architecture */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Package className="size-4 text-primary" />
            Product Register vs PIM Blueprints (Coexistence)
          </h4>
          <p className="text-xs text-muted-foreground leading-relaxed">
            SUBIDHA CORE strictly maintains backward compatibility for existing Lucky Plan subscriptions:
          </p>
          <ul className="space-y-2 text-xs text-muted-foreground">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
              <span>
                <strong className="text-foreground">Product Register Tab:</strong> The operational list of every sellable product record, displaying filtered counts, stock readiness, and direct sale capability.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
              <span>
                <strong className="text-foreground">PIM Blueprints Tab:</strong> The hierarchical designer workspace for parent models, media photography, and variant SKU trees.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
              <span>
                <strong className="text-foreground">Zero Data Loss:</strong> Both tabs access the shared backend catalog. No migration is breaking or destructive.
              </span>
            </li>
          </ul>
        </div>

        {/* Strict Business Invariants */}
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-5 space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
            <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
            Catalog Governance &amp; Safety Invariants
          </h4>
          <ul className="space-y-2 text-xs text-amber-950/90 dark:text-amber-200/90">
            <li className="flex items-start gap-2">
              <span className="font-bold">•</span>
              <span><strong>Never delete:</strong> A product that has any subscription contract, billing invoice, or stock ledger history cannot be deleted. Deactivate or archive it instead.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold">•</span>
              <span><strong>HSN Code Requirement:</strong> Every sellable product must have a valid HSN/SAC code (e.g. 9403 for furniture) to ensure compliant GST tax invoice generation.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold">•</span>
              <span><strong>Inventory Readiness:</strong> Items marked &quot;Stock pending&quot; must be given an inventory item profile before stock can be received via GRN or issued on delivery challans.</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

