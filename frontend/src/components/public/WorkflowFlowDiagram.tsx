"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";

export interface FlowNode {
  step: number;
  icon: string;
  title: string;
  subtitle: string;
  description: string;
  systemRule?: string;
}

export interface WorkflowFlow {
  id: string;
  name: string;
  badge: string;
  tagline: string;
  description: string;
  nodes: FlowNode[];
  legalGuardrail: string;
}

export const WORKFLOW_FLOWS: WorkflowFlow[] = [
  {
    id: "doorstep-pod",
    name: "Doorstep POD & Quality Capture",
    badge: "Rule CTRL-RENT-2",
    tagline: "Secure Mobile Handover with Product Quality Photos & Touchscreen Signature",
    description:
      "How Subidha Core coordinates delivery agents and customers at the doorstep using time-limited WhatsApp request links to capture product quality and prevent condition disputes.",
    nodes: [
      {
        step: 1,
        icon: "🔗",
        title: "Generate Handover Link",
        subtitle: "Admin ERP Workbench",
        description:
          "Store admin clicks 'Share Handover Link' in the delivery order. A tamper-proof signed token (valid for 7 days) is generated without exposing admin login.",
        systemRule: "Token-Authenticated URL",
      },
      {
        step: 2,
        icon: "💬",
        title: "Send to Driver / Customer",
        subtitle: "WhatsApp / SMS Dispatch",
        description:
          "The link is shared via WhatsApp. The delivery boy taps it on their phone at the delivery location to open the mobile delivery interface.",
        systemRule: "Zero Password Barrier",
      },
      {
        step: 3,
        icon: "📸",
        title: "Capture Quality Photos",
        subtitle: "Direct Mobile Camera",
        description:
          "Photo 1: Furniture assembled in room (capturing finish, woodwork, upholstery, and serial tag). Photo 2: Customer standing with furniture.",
        systemRule: "Immutable Quality Baseline",
      },
      {
        step: 4,
        icon: "✍️",
        title: "Touchscreen Signature",
        subtitle: "Customer Signs on Phone",
        description:
          "Customer uses their finger or stylus on the interactive screen canvas to sign acknowledgment of delivery and pristine product condition.",
        systemRule: "Digital Canvas Export (PNG)",
      },
      {
        step: 5,
        icon: "📍",
        title: "Auto-GPS & System Lock",
        subtitle: "Delivery Completed",
        description:
          "Browser auto-tags latitude/longitude coordinates and timestamp. Order transitions to DELIVERED, activating asset custody in Customer Portal.",
        systemRule: "Mandatory CTRL-RENT-2 Gate",
      },
      {
        step: 6,
        icon: "🗄️",
        title: "Archive & Future Protection",
        subtitle: "Return Baseline Storage",
        description:
          "All photos and signatures are permanently indexed. During future return inspections, staff compare returned goods against these original delivery photos.",
        systemRule: "Year-End ZIP & Audit Vault",
      },
    ],
    legalGuardrail:
      "Legal Invariant (CTRL-RENT-2): A delivery record cannot transition to DELIVERED status without an attached ProofOfDelivery (POD) containing verified photos, customer signature, and driver identification.",
  },
  {
    id: "lucky-plan",
    name: "Lucky Plan EMI & Draw",
    badge: "BUDS & Prize Chits Compliant",
    tagline: "Deterministic Installments with Cryptographic Commit-then-Reveal Fair Draw",
    description:
      "From showroom product selection through monthly installment discipline, 24-hour pre-draw commitment hashing, public reveal, and future EMI waivers.",
    nodes: [
      {
        step: 1,
        icon: "🛋️",
        title: "Product & Batch Selection",
        subtitle: "Contract Enrollment",
        description:
          "Customer selects furniture at base showroom price. Total is divided into equal tenures (10–15 months) with zero hidden interest.",
        systemRule: "Deterministic EMI Division",
      },
      {
        step: 2,
        icon: "🎟️",
        title: "Lucky ID Allocation",
        subtitle: "Batch Scope (00-99)",
        description:
          "A unique, verifiable Lucky ID is assigned within a controlled 100-member batch. Customer may hold multiple IDs across contracts.",
        systemRule: "Audited Slot Uniqueness",
      },
      {
        step: 3,
        icon: "⚡",
        title: "Advance Delivery Option",
        subtitle: "60%–80% Prepayment",
        description:
          "Customer can prepay 60%–80% upfront to bypass waiting and get Same-Day Delivery under Hire-Purchase title retention.",
        systemRule: "Same-Day Delivery Facility",
      },
      {
        step: 4,
        icon: "🔒",
        title: "Commitment Hash Publication",
        subtitle: "24h Pre-Draw Freeze",
        description:
          "Eligibility is frozen. The system generates a cryptographic secret seed and publishes its SHA-256 hash on the website before the draw.",
        systemRule: "Commit-then-Reveal Security",
      },
      {
        step: 5,
        icon: "🎉",
        title: "Public Draw & Verification",
        subtitle: "Showroom Open Draw",
        description:
          "Winning number is drawn openly. The secret seed is revealed so anyone can verify SHA-256(seed + winner) == commitment hash.",
        systemRule: "Zero Manipulation Guarantee",
      },
      {
        step: 6,
        icon: "🎁",
        title: "100% Future EMI Waiver",
        subtitle: "Winner Benefit Execution",
        description:
          "All remaining future EMIs (20%–40%) are 100% waived. Zero cash refund of already paid EMIs. Full furniture title transferred.",
        systemRule: "Zero Cash Refund Invariant",
      },
    ],
    legalGuardrail:
      "Statutory Invariant: Lucky Plan is a structured retail purchase plan with future installment waivers for winners. Settled payments are never refunded in cash, fully complying with BUDS Act 2019 and Prize Chits Act 1978.",
  },
  {
    id: "rent-lease",
    name: "Rent & Lease Asset Lifecycle",
    badge: "Segregated Security Deposit",
    tagline: "Flexible Furniture Custody, Asset Tagging & Segregated Deposit Protection",
    description:
      "End-to-end rental lifecycle: KYC onboarding, refundable deposit escrow, pre-handover condition score, monthly billing, and 45-day arrears cutoff.",
    nodes: [
      {
        step: 1,
        icon: "📋",
        title: "KYC & Tenancy Verification",
        subtitle: "DPDP-Compliant Screening",
        description:
          "Customer provides identity proof (last 4 digits masked) and premises tenancy deed or residential address agreement.",
        systemRule: "Mandatory Identity Shield",
      },
      {
        step: 2,
        icon: "🛡️",
        title: "Security Deposit Collection",
        subtitle: "Segregated Escrow Ledger",
        description:
          "20%–30% refundable security deposit collected and credited to segregated customer deposit ledger. Cannot be offset against active rent.",
        systemRule: "Segregated Deposit Liability",
      },
      {
        step: 3,
        icon: "🏷️",
        title: "Asset Condition Snapshot",
        subtitle: "Serialized Unit Tagging",
        description:
          "Store staff logs an append-only BEFORE_HANDOVER condition snapshot (Score 1–10, Grade NEW/GOOD) linking the specific asset code.",
        systemRule: "Per-Unit Asset Code",
      },
      {
        step: 4,
        icon: "🚚",
        title: "Doorstep Delivery (POD)",
        subtitle: "Mobile Photo Handover",
        description:
          "Furniture delivered to customer premises with Photo 1 (item quality) and touchscreen signature. Possession custody activated.",
        systemRule: "CTRL-RENT-2 Enforced",
      },
      {
        step: 5,
        icon: "📅",
        title: "Monthly Rent Demands",
        subtitle: "45-Day Arrears Cutoff",
        description:
          "Monthly rent billed separately. If rental arrears reach 45 days, repossession workflow is triggered to protect deposit buffer.",
        systemRule: "45-Day Legal Cutoff Trigger",
      },
      {
        step: 6,
        icon: "🔄",
        title: "Return Inspection & Refund",
        subtitle: "Tier 1–4 Technical Check",
        description:
          "Staff conducts return inspection against baseline delivery photos. Normal wear is accepted; unrecorded damages deducted from deposit.",
        systemRule: "7-Day Electronic Refund SLA",
      },
    ],
    legalGuardrail:
      "Bailment Invariant: Physical assets remain the corporate property of Subidha Furniture. Custody is granted under bailment, and the security deposit is held in trust to cover unrecorded structural damage or default.",
  },
  {
    id: "return-damage",
    name: "Return & Damage Protection",
    badge: "Consumer Protection Act 2019",
    tagline: "Objective Condition Grading, Baseline Photo Comparison & Deposit Deductions",
    description:
      "How Subidha Core compares return condition against original doorstep delivery photos to guarantee fair, dispute-free security deposit settlements.",
    nodes: [
      {
        step: 1,
        icon: "📦",
        title: "Return Initiation",
        subtitle: "Tenure End or Customer Return",
        description:
          "Return request logged on the Service Desk. Scheduled pickup vehicle and logistics team assigned for safe transport.",
        systemRule: "Audited Return Request",
      },
      {
        step: 2,
        icon: "🔍",
        title: "Technical Inspection",
        subtitle: "Staff Physical Evaluation",
        description:
          "Workshop technician inspects woodwork joinery, upholstery tears, polish fading, structural wobble, and hardware completeness.",
        systemRule: "AFTER_RETURN Snapshot Logged",
      },
      {
        step: 3,
        icon: "⚖️",
        title: "Baseline Photo Comparison",
        subtitle: "Handover Photo 1 Evidence",
        description:
          "The system brings up Photo 1 captured at original delivery. Disputed scratches or marks are verified against delivery-day condition.",
        systemRule: "Indisputable Visual Proof",
      },
      {
        step: 4,
        icon: "📊",
        title: "Condition Grading (Tiers 1–4)",
        subtitle: "Standardized Damage Matrix",
        description:
          "Tier 1 (Normal Wear: 0% deduction) → Tier 2 (Minor Polish: 10%) → Tier 3 (Fabric/Joinery: 30%) → Tier 4 (Severe Structural: 60%+).",
        systemRule: "Deterministic Deduction Matrix",
      },
      {
        step: 5,
        icon: "🧾",
        title: "Deposit Settlement & Tax Invoice",
        subtitle: "Rule CTRL-RENT-5",
        description:
          "Deduction is settled against security deposit. Any forfeited deposit raises a GST Deposit Forfeiture Tax Invoice. Remainder refunded.",
        systemRule: "GST Output Tax on Forfeiture",
      },
      {
        step: 6,
        icon: "🛠️",
        title: "Asset Restoration / Restock",
        subtitle: "Inventory Re-Integration",
        description:
          "Unit transitions to UNDER_REPAIR or AVAILABLE in RentalAsset inventory, ready for the next customer rental cycle.",
        systemRule: "Closed-Loop Asset Lifecycle",
      },
    ],
    legalGuardrail:
      "Consumer Fair Trade Invariant: Damage deductions must be justified by comparing returned furniture against the delivery-day POD baseline photos. Normal wear & tear cannot be penalized.",
  },
  {
    id: "payment-ledger",
    name: "Payments & Financial Ledgers",
    badge: "Append-Only Accounting",
    tagline: "Double-Entry Posting, Dynamic COA Rollup & Zero Destructive Mutation",
    description:
      "How collections flow from cash drawer, dynamic UPI QR, or bank transfers into append-only general ledgers with daily shift-close reconciliation.",
    nodes: [
      {
        step: 1,
        icon: "💳",
        title: "Customer Collection",
        subtitle: "Cash / Dynamic UPI / Bank",
        description:
          "Payment received at showroom Cash Counter, official dynamic UPI QR, or registered company bank account. Self-posting is blocked.",
        systemRule: "Authorized Channels Only",
      },
      {
        step: 2,
        icon: "🧾",
        title: "Official Receipt Issued",
        subtitle: "Cryptographic Invoice Link",
        description:
          "A sequentially numbered official receipt is generated immediately. WhatsApp confirmation with PDF receipt link sent to customer.",
        systemRule: "No Receipt = No Payment Recognition",
      },
      {
        step: 3,
        icon: "📖",
        title: "Append-Only Double-Entry",
        subtitle: "Ledger Posting Engine",
        description:
          "System posts balanced debit and credit entries. Database mutations, DELETE, DROP, and silent overwrites are strictly forbidden.",
        systemRule: "Financial History is Immutable",
      },
      {
        step: 4,
        icon: "🏦",
        title: "Dynamic COA Rollup",
        subtitle: "Chart of Accounts Mapping",
        description:
          "FinanceAccount balances dynamically map to parent chart of accounts, rolling up UPI collections and cash into liquid reserves.",
        systemRule: "Dynamic FinanceAccount Mapping",
      },
      {
        step: 5,
        icon: "↩️",
        title: "Reversal & Adjustment",
        subtitle: "Audit Correction Protocol",
        description:
          "Reversals do not delete rows. A contra PAYMENT_REVERSAL entry is posted with original payment ID stored in allocation context.",
        systemRule: "OneToOne Reversal Allocation",
      },
      {
        step: 6,
        icon: "🔒",
        title: "Daily Three-Way Close",
        subtitle: "Cashier Shift-Close Sign-off",
        description:
          "At end of day, cashier drawer physical cash, dynamic bank settlements, and posted payment totals must reconcile to 0.00 delta.",
        systemRule: "Mandatory Daily Close Sign-off",
      },
    ],
    legalGuardrail:
      "Accounting Integrity Invariant: All financial books in Subidha Core are strictly append-only. Auditable contra-entries are used for corrections, ensuring 100% compliance with Indian accounting and tax standards.",
  },
];

export default function WorkflowFlowDiagram() {
  const [activeWorkflowId, setActiveWorkflowId] = useState<string>("doorstep-pod");

  const currentWorkflow =
    WORKFLOW_FLOWS.find((w) => w.id === activeWorkflowId) || WORKFLOW_FLOWS[0];

  return (
    <section className="rounded-[2rem] border border-border bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] dark:bg-[linear-gradient(180deg,rgba(30,41,59,0.5),rgba(15,23,42,0.8))] p-6 shadow-[0_24px_70px_-50px_rgba(15,23,42,0.62)] dark:shadow-none space-y-6">
      {/* Workflow Navigation Switcher */}
      <div>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <span className="text-xs font-bold uppercase tracking-wider text-primary">
            Interactive System Flow Diagrams
          </span>
          <span className="text-[11px] font-semibold text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
            5 Core Business Lifecycles
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {WORKFLOW_FLOWS.map((flow) => {
            const isActive = flow.id === activeWorkflowId;
            return (
              <button
                key={flow.id}
                type="button"
                onClick={() => setActiveWorkflowId(flow.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all text-left",
                  isActive
                    ? "bg-slate-900 text-white shadow-sm dark:bg-primary dark:text-primary-foreground"
                    : "bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/50"
                )}
              >
                <span>{flow.name}</span>
                {flow.id === "doorstep-pod" && (
                  <span className="ml-1 px-1.5 py-0.2 rounded text-[10px] bg-emerald-500/20 text-emerald-300 font-bold">
                    NEW
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Flow Header */}
      <div className="rounded-2xl border border-border/70 bg-card p-5 space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-lg font-bold text-foreground">
            {currentWorkflow.name} Flow Diagram
          </h3>
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-primary/10 text-primary border border-primary/20">
            {currentWorkflow.badge}
          </span>
        </div>
        <p className="text-xs font-semibold text-primary">{currentWorkflow.tagline}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {currentWorkflow.description}
        </p>
      </div>

      {/* Visual Flow Nodes (Cards with Flow Connectors) */}
      <div className="relative">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {currentWorkflow.nodes.map((node, index) => (
            <div
              key={node.step}
              className="relative rounded-2xl border border-border bg-card p-4 shadow-sm hover:border-primary/50 transition-all flex flex-col justify-between space-y-3 group"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white dark:bg-primary dark:text-primary-foreground text-xs font-bold">
                    {node.step}
                  </span>
                  <span className="text-2xl">{node.icon}</span>
                </div>
                {node.systemRule && (
                  <span className="text-[10px] font-semibold text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md border border-border/40">
                    {node.systemRule}
                  </span>
                )}
              </div>

              <div>
                <h4 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                  {node.title}
                </h4>
                <p className="text-[11px] font-medium text-primary mt-0.5">
                  {node.subtitle}
                </p>
                <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                  {node.description}
                </p>
              </div>

              <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                <span>Phase {node.step} of {currentWorkflow.nodes.length}</span>
                {index < currentWorkflow.nodes.length - 1 && (
                  <span className="text-primary font-bold">Next →</span>
                )}
                {index === currentWorkflow.nodes.length - 1 && (
                  <span className="text-emerald-600 font-bold">✓ Verified</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Legal & System Guardrail Alert Callout */}
      <div className="rounded-xl border border-indigo-200/70 bg-indigo-50/60 p-4 text-xs text-indigo-900 dark:border-indigo-900/40 dark:bg-indigo-950/30 dark:text-indigo-200 flex items-start gap-3">
        <span className="text-base shrink-0">🛡️</span>
        <div>
          <strong className="font-semibold">System Rule & Enforced Guardrail:</strong>{" "}
          {currentWorkflow.legalGuardrail}
        </div>
      </div>
    </section>
  );
}

