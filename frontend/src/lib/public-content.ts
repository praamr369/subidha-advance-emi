import type { FaqItem } from "@/components/public/FaqBlock";
import type { TimelineStep } from "@/components/public/ProcessTimeline";

export const LUCKY_PLAN_FAQ: FaqItem[] = [
  {
    question: "How do batches work?",
    answer:
      "A batch is an operational subscriber cycle comprising up to 100 customer slots (numbered 00 to 99). Batches maintain clean enrollment, financial tracking, and transparent SFEMI benefit records.",
  },
  {
    question: "How are SFEMI IDs assigned?",
    answer:
      "SFEMI IDs (00–99) are allocated within an active batch upon initial enrollment and verified installment receipt. Assignment is controlled by the branch system and does not guarantee a promotional benefit.",
  },
  {
    question: "How do monthly payments work?",
    answer:
      "You pay scheduled monthly advance EMIs according to your contract. Payment entries are posted to append-only ledgers and generate official, tamper-evident system receipts.",
  },
  {
    question: "What happens when a promotional benefit is approved?",
    answer:
      "When an SFEMI promotional benefit is approved under the published terms, any remaining future EMI treatment follows those terms. Previously paid EMIs remain settled and valid.",
  },
  {
    question: "Is previously paid EMI refunded if I win?",
    answer:
      "No. Under our strict financial invariants, winning waives future remaining installments only. Settled past EMIs and advance down payments are never refunded in cash or bank transfer.",
  },
] as const;

export const HOW_IT_WORKS_STEPS: TimelineStep[] = [
  {
    title: "1. Select Furniture Product",
    description:
      "Browse our showroom or online catalog. Product showroom base price establishes the total contract value.",
  },
  {
    title: "2. Enroll & Complete KYC",
    description:
      "Provide identity proof under DPDP privacy standards. The branch registers your subscription and generates an approved contract.",
  },
  {
    title: "3. Receive Batch Lucky ID (00–99)",
    description:
      "An exclusive Lucky ID is allocated within your batch and permanently linked to your contract reference.",
  },
  {
    title: "4. Pay Monthly Advance Installments",
    description:
      "Remit scheduled payments via Cash Counter, authorized UPI, or Bank Transfer. Every transaction generates an instant official receipt.",
  },
  {
    title: "5. Transparent Fair Draw (Commit-then-Reveal)",
    description:
      "Monthly draws use cryptographic SHA-256 commitment hashes published prior to the draw, proving outcomes cannot be retrospectively altered.",
  },
  {
    title: "6. Future EMI Waiver or Ownership Completion",
    description:
      "Winners receive 100% waiver of remaining future EMIs. Non-winning subscribers complete their tenure and receive full ownership upon final installment.",
  },
] as const;

export const PUBLIC_MULTILINGUAL_COPY = {
  en: {
    hero: "Bring Home Furniture, Electronics, and Home Appliances with Easy Monthly Plans.",
    subtitle:
      "Choose your product, join the plan, and enjoy a simple, transparent path to ownership.",
  },
  hi: {
    hero: "फर्नीचर, इलेक्ट्रॉनिक्स और होम अप्लायंसेज़ अब आसान मासिक योजना के साथ घर लाएँ।",
    subtitle:
      "अपना पसंदीदा सामान चुनें, योजना में शामिल हों और आसान किस्तों में खरीदारी करें।",
  },
  bn: {
    hero: "সহজ মাসিক পরিকল্পনায় ফার্নিচার, ইলেকট্রনিক্স ও হোম অ্যাপ্লায়েন্সস ঘরে আনুন।",
    subtitle:
      "আপনার পছন্দের পণ্য বেছে নিন, পরিকল্পনায় যুক্ত হন, আর সহজ কিস্তিতে ঘরে তুলুন।",
  },
} as const;

export const PUBLIC_PURPOSE_BADGES = [
  {
    title: "Furniture-First Local Business",
    description: "Subidha Furniture is an MSME-registered enterprise dedicated to quality household and commercial furnishings in Asansol and Paschim Barddhaman.",
  },
  {
    title: "DPDP-Compliant Privacy Vault",
    description: "Customer KYC records are securely encapsulated with masked Aadhaar/PAN handling in access-controlled media vaults.",
  },
  {
    title: "Mandatory Receipt-Led Billing",
    description: "No monetary payment is recognized without an official system-generated digital receipt carrying unique verification codes.",
  },
  {
    title: "Audit-Preserving Append-Only History",
    description: "Financial ledgers, contracts, and delivery documents are strictly append-only, prohibiting silent mutations or deletions.",
  },
  {
    title: "Stock-on-Hand Verification",
    description: "Physical goods must exist in the Stock Ledger before delivery dispatch or rent/lease custody handover.",
  },
  {
    title: "Customer 360 Portal Transparency",
    description: "Customers maintain 24/7 self-service visibility over active contracts, receipts, delivery milestones, and service tickets.",
  },
] as const;

export const PUBLIC_LEGAL_DISCLAIMER_POINTS = [
  "This website is published by Subidha Furniture for informational, product catalog, and operational guidance purposes.",
  "Final legal rights and obligations are governed strictly by system-generated approved contracts, tax invoices, official receipts, delivery notes, and return inspection reports.",
      "SFEMI Advance EMI participation does not guarantee a promotional benefit. The plan is a product purchase installment arrangement subject to applicable law and the signed terms.",
  "Winning a lucky draw waives remaining future EMI installments only. Settled installments and advance down payments are strictly non-refundable in cash or bank transfer.",
  "Under Hire-Purchase terms, legal title to goods delivered under advance prepayment remains with Subidha Furniture until 100% of the contract value is settled.",
  "Rent and Lease security deposits are refundable liabilities subject to technical condition inspection, 45-day arrears limits, and verified deductions.",
  "Warranty and after-sales service are subject to manufacturer terms, craftsmanship guidelines, and explicit exclusions including water, pest, and misuse damage.",
  "Subidha Furniture operates under valid municipal trade licensing and statutory MSME/Udyam registration in Asansol, West Bengal.",
] as const;

export const READ_BEFORE_APPLY = {
  advanceEmi: [
    "Lucky ID allocation (00–99) gives draw eligibility but does NOT guarantee winning in any draw cycle.",
    "Advance Delivery (60% to 80% down payment) unlocks immediate same-day delivery under Hire-Purchase title retention.",
    "If an advance-delivery customer wins a draw, remaining future EMIs (20% to 40%) are 100% waived; ZERO cash refund is given for settled down payments.",
    "Subidha Furniture retains legal title until 100% settled and reserves enforceable 30-day default repossession rights.",
    "All payments must generate an official system receipt to be recognized as valid.",
  ],
  rent: [
    "Rent grants temporary possessory custody only; physical furniture remains Subidha Furniture's corporate property.",
    "Mandatory KYC (Masked ID + Address Proof) and Premises Tenancy Deed / Rent Agreement are required before contract activation.",
    "A refundable security deposit of 20% to 30% is mandatory and held in a segregated deposit ledger.",
    "Monthly rent demands must be paid by due date. If rent arrears reach 45 days, mandatory repossession pickup is initiated.",
    "Deposit refund is remitted electronically within 7 banking days following Return Damage Inspection sign-off.",
  ],
  lease: [
    "Lease is a structured long-term custody contract (6 to 24 months) with fixed periodic demands.",
    "Activation strictly requires verified identity KYC, residential address proof, and premises ownership/tenancy documentation.",
    "A 20% to 30% security deposit is maintained as a balance-sheet liability; renewals and upgrades require managerial approval.",
    "Arrears exceeding 45 days trigger default notices and asset repossession to protect the security deposit buffer.",
    "Final deposit refund depends on condition inspection, with itemized deductions for unreturned components or structural damage.",
  ],
  directSale: [
    "Direct showroom and online sales transfer legal ownership only upon 100% payment receipt and physical delivery handover.",
    "Partial advance payments establish order reservations, with title retained by Subidha Furniture until full settlement.",
    "Returns are accepted within three (3) calendar days solely for verified manufacturing defects, generating an audited Credit Note.",
    "Undamaged returns restock to sellable warehouse inventory; damaged returns route strictly to non-sellable quarantine stock.",
    "Refund payouts follow a three-stage audit workflow (Draft Request -> Manager Approval -> Bank Disbursement).",
  ],
} as const;

export const POLICY_TIMELINE = [
  {
    title: "1. Consultation & Product Selection",
    description: "Customer selects verified furniture units across Direct Sale, Lucky Plan EMI, Rent, or Lease pathways.",
  },
  {
    title: "2. KYC Verification & Activation Gating",
    description: "Staff verify identity and premises documentation under DPDP privacy standards before contract activation.",
  },
  {
    title: "3. Contract Invoicing & Deposit Ledgering",
    description: "System generates tamper-evident contract references, tax invoices, and segregated security deposit demands.",
  },
  {
    title: "4. Stock Verification & Delivery Handover",
    description: "Goods physically verified in Stock Ledger and dispatched with co-signed physical Proof of Delivery (POD) and photos.",
  },
  {
    title: "5. Ledger Accounting & Daily Reconciliation",
    description: "Payments reconcile daily across physical drawers, dynamic COA mapping, and append-only financial ledgers.",
  },
  {
    title: "6. Warranty, Service & Asset Return",
    description: "Audited ServiceDesk ticketing, technical triage, condition-graded return inspections, and electronic deposit refunds.",
  },
] as const;

export const ADVANCE_EMI_POLICY = {
  title: "SFEMI Advance EMI Rules & Invariants",
  intro:
    "SFEMI is an advance installment purchase program backed by tangible furniture products, disciplined monthly advance schedules, and documented promotional benefits.",
  cards: [
    {
      title: "Contract Valuation & Deterministic EMI",
      points: [
        "Product showroom base price constitutes the total contract value without inflated financing markups.",
        "Monthly advance EMI is deterministically computed by dividing total contract value by the batch tenure (10 to 15 months).",
        "Contract reference codes, product snapshots, and EMI schedules are permanently locked upon activation.",
      ],
    },
    {
      title: "Batch Structure & SFEMI ID (00–99)",
      points: [
        "Subscriptions are organized into controlled batches of up to 100 slots (numbered 00 to 99).",
        "A customer may hold multiple independent subscriptions and SFEMI IDs across same or different batches.",
        "SFEMI ID allocation records enrollment eligibility but creates no guarantee of a promotional benefit.",
      ],
    },
    {
      title: "Advance Delivery Prepayment Provision (60%–80%)",
      points: [
        "Customers remitting an advance prepayment threshold (60% to 80% upfront) qualify for Same-Day Enrollment & Same-Day Delivery.",
        "Physical handover requires verified customer ID, co-signed Delivery Handover Note, room photo, and GPS-tagged driver confirmation.",
        "Subscriptions with advance delivery operate under Hire-Purchase principles with legal title retained by Subidha Furniture until full settlement.",
      ],
    },
    {
      title: "Winner Benefit: Future EMI Waiver Only",
      points: [
        "Verified draw winners receive 100% waiver of all remaining future unpaid EMIs from the winning month onward.",
        "Zero Cash Refund Invariant: Settled EMIs and advance down payments are non-refundable in cash, credit, or bank transfer.",
        "Upon winning, the contract status transitions to WON, remaining receivables are extinguished, and full ownership title vests unconditionally in the customer.",
      ],
    },
    {
      title: "Hire-Purchase Title Retention & Repossession",
      points: [
        "For advance-delivered goods, legal property and ownership remain strictly with Subidha Furniture until 100% settlement.",
        "The customer maintains possessory custody as a bailee and must properly protect and maintain the furniture.",
        "If installment default exceeds thirty (30) days following formal notice, Subidha Furniture reserves the enforceable legal right to repossess the goods.",
      ],
    },
    {
      title: "Cancellation & Lucky ID Release Policy",
      points: [
        "Subscription cancellation is audit-preserving; cancelled records are permanently retained.",
        "If cancelled while batch is in OPEN status, the Lucky ID is released back to AVAILABLE status.",
        "If cancelled after batch is LOCKED or DRAW_COMMITTED, the Lucky ID remains permanently linked to preserve legal draw auditability.",
      ],
    },
  ],
} as const;

export const RENT_POLICY = {
  title: "Furniture Rental Policy & Custody Invariants",
  intro:
    "Rental plans provide flexible, short-term furniture access for domestic and commercial use, backed by mandatory KYC gating and segregated deposit accounting.",
  cards: [
    {
      title: "Stock-on-Hand Prerequisite",
      points: [
        "No rental contract may be activated unless the specific furniture units physically exist in showroom/warehouse stock.",
        "Stock is received via Purchase Orders from approved vendors and formally verified in the Stock Ledger.",
        "Active rental custody locks the inventory item, preventing direct-sale allocation of units currently on hire.",
      ],
    },
    {
      title: "Mandatory KYC & Premises Activation Gate",
      points: [
        "Contract activation is strictly blocked until primary ID proof (Masked Aadhaar/PAN/Voter ID/DL) and address proof are verified.",
        "Customer must provide a verified Rent Agreement or premises ownership deed confirming where furniture will reside.",
        "Staff may save contracts as DRAFT while documents are gathered, but physical dispatch is strictly prohibited prior to activation.",
      ],
    },
    {
      title: "Security Deposit Accounting (20%–30%)",
      points: [
        "A refundable security deposit of 20.00% to 30.00% of retail asset value is mandatory prior to dispatch.",
        "Deposits are maintained in a segregated deposit ledger (RentLeaseDepositTransaction) as refundable customer liabilities.",
        "Deposits are completely separate from monthly rent and cannot be casually offset against monthly dues during active tenure.",
      ],
    },
    {
      title: "45-Day Arrears Cutoff & Repossession",
      points: [
        "The 20%–30% deposit provides a finite financial buffer covering roughly 4 to 6 months of rental liability.",
        "Staff are legally mandated to issue a Notice of Default and initiate repossession pickup if rent arrears reach 45 days.",
        "This cutoff protects the customer deposit buffer, ensuring residual funds cover unpaid rent, recovery transit, and refurbishment.",
      ],
    },
    {
      title: "Return Inspection & Deduction Standards",
      points: [
        "Returned furniture undergoes technical assessment classifying condition into Grades A (Normal Wear) through D (Severe Damage).",
        "Normal wear is not penalized; documented repairs, missing parts, or excessive stains are deducted at published workshop rates.",
        "Remaining deposit balance is refunded electronically via bank transfer within seven (7) banking days of inspection sign-off.",
      ],
    },
    {
      title: "Prohibition of Relocation & Sub-Leasing",
      points: [
        "Rented assets remain the exclusive corporate property of Subidha Furniture.",
        "Customer cannot sub-lease, mortgage, pledge, sell, or relocate the furniture without prior written administrative authorization.",
      ],
    },
  ],
} as const;

export const LEASE_POLICY = {
  title: "Furniture Leasing Policy & Asset Governance",
  intro:
    "Leasing arrangements provide structured, long-term furniture solutions (6 to 24 months) with fixed periodic demands, renewal options, and fiduciary deposit governance.",
  cards: [
    {
      title: "Long-Term Contract Architecture",
      points: [
        "Lease tenures are established for 6, 9, 12, or 24 months with structured periodic demands.",
        "Custody transfers under bailment; legal title and asset ownership remain strictly with Subidha Furniture.",
        "Contract references, asset serials, and customer profile records are immutable once activated.",
      ],
    },
    {
      title: "KYC & Premises Verification Gating",
      points: [
        "Activation strictly requires verified identity KYC, residential address proof, and legal premises tenancy documentation.",
        "Commercial corporate leases require verified GSTIN, Certificate of Incorporation, and Board Authorization.",
      ],
    },
    {
      title: "Security Deposit Management",
      points: [
        "A refundable security deposit (20%–30%) is collected and held in the deposit liability ledger.",
        "Deposits are preserved throughout the lease tenure and cannot be depleted to cover routine monthly demands.",
      ],
    },
    {
      title: "Renewal, Upgrade & Transfer Protocols",
      points: [
        "Lease extension, renewal, or product upgrade requires formal managerial review.",
        "Approval depends on verified payment discipline, pristine asset condition report, and updated KYC records.",
      ],
    },
    {
      title: "45-Day Default Repossession Invariant",
      points: [
        "If periodic lease charges remain unpaid past 45 calendar days, default procedures are triggered immediately.",
        "Staff initiate repossession recovery to retrieve the assets before the security deposit is exhausted.",
      ],
    },
    {
      title: "Asset Handover & Settlement Timeline",
      points: [
        "Physical return triggers joint technical inspection evaluating structural frames, veneers, and mechanism integrity.",
        "Itemized settlement advice details gross deposit, authorized deductions, and net electronic refund remitted within 7 banking days.",
      ],
    },
  ],
} as const;

export const DIRECT_SALE_POLICY = {
  title: "Direct Sale Policy & Retail Standards",
  intro:
    "Direct showroom and digital sales govern immediate merchandise purchases, transparent tax invoicing, title transfer rules, returns, and credit note issuance.",
  cards: [
    {
      title: "Commercial Quotations & Sales Orders",
      points: [
        "Sales desk quotations reflect real-time inventory valuation and remain valid for seven (7) calendar days.",
        "Sales orders confirm product SKU, finish, dimensions, tax rates, and delivery addresses prior to invoice generation.",
      ],
    },
    {
      title: "Invoicing & Ownership Transfer",
      points: [
        "Every confirmed sale generates a sequential tax invoice logged in the sales ledger.",
        "Legal ownership transfers to the customer only upon 100% invoice settlement and signed delivery handover.",
        "Partial advance payments establish booking reservations; title and lien remain with Subidha Furniture until fully paid.",
      ],
    },
    {
      title: "Pre-Invoice vs Post-Invoice Cancellation",
      points: [
        "Pre-invoice cancellations are processed with immediate full refund/credit of advances.",
        "Post-invoice pre-dispatch cancellations generate an audited Credit Note and return stock reservations to Available-to-Promise (ATP).",
        "Post-delivery cancellations are governed by the Delivered Return rules below.",
      ],
    },
    {
      title: "Delivered Returns Within 3-Day Window",
      points: [
        "Delivered furniture may be returned within three (3) calendar days solely for verified manufacturing defects or specification mismatch.",
        "Customized, bespoke, assembled modular units, and unsealed mattresses are strictly non-returnable.",
        "Undamaged returns restock to sellable stock via SALE_RETURN_IN; defective returns route strictly to non-sellable quarantine stock.",
      ],
    },
    {
      title: "Credit Notes & Three-Stage Refund Workflow",
      points: [
        "Returns and overpayments generate system-verified Credit Notes recorded in the customer credit ledger.",
        "Refund payouts are never disbursed in unrecorded cash; they require Draft Request -> Manager Approval -> Bank Remittance.",
        "Customers may elect to retain credit balances for future purchases or installment offsets.",
      ],
    },
    {
      title: "Product Exchanges & Price Differentials",
      points: [
        "Exchanges requested within three (3) days require technical inspection of the original unit.",
        "Higher-value replacements require balance settlement prior to dispatch.",
        "Lower-value replacements generate customer credit once the returned unit clears warehouse check-in.",
      ],
    },
  ],
} as const;

export const GENERIC_POLICIES = {
  delivery: {
    title: "Delivery, Transit, and Proof of Delivery Policy",
    points: [
      "Stock-on-Hand Invariant: Deliveries are scheduled only after goods physically exist in the Stock Ledger.",
      "Lucky Plan Delivery Eligibility: Customer must be (1) Draw Winner, OR (2) Completed Tenure, OR (3) Paid 60%–80% Advance Prepayment threshold.",
      "Admin Override Protocol: Force-release deliveries for ineligible subscriptions require explicit administrative sign-off and permanently carry a visible Admin Override audit badge.",
      "Mandatory Proof of Delivery (POD): Physical handover requires co-signed handover note, room photo, and driver GPS confirmation.",
      "Customer Site Access: Customers must ensure doorways, stairwells, and passages accommodate assembled furniture.",
      "Transit Damage Exception: Any damage visible at delivery must be recorded on the delivery note prior to signing.",
    ],
  },
  returnInspection: {
    title: "Return Damage Assessment and Condition Policy",
    points: [
      "Technical Triage: All returned units enter Return Quarantine for comprehensive carpentry and structural evaluation.",
      "Condition Tiers: Classifies assets into Tier 1 (Normal Wear), Tier 2 (Minor Cleaning), Tier 3 (Repairable Damage), and Tier 4 (Structural Failure).",
      "Itemized Deductions: Workshop repairs, replacement hardware, or cleaning fees are deducted based on published schedules.",
      "Non-Sellable Stock Routing: Defective or damaged returns are barred from automatic sellable stock and routed to inspection locations.",
      "Audit Trail: High-resolution photographs and technician reports are permanently archived in the contract vault.",
    ],
  },
  warrantyService: {
    title: "Warranty Coverage and Service Desk Policy",
    points: [
      "Dual Warranty Framework: Branded OEM manufacturer pass-through plus 12-month Subidha showroom structural woodwork warranty.",
      "Hardware Coverage: 6-month replacement warranty on hinges, drawer channels, and hydraulic bed mechanisms.",
      "Strict Exclusions: Damage caused by transit post-handover, customer abuse, water/liquid pooling, fire, termites/pests, or unauthorized repairs.",
      "ServiceDesk Ticketing: All service requests generate an auditable ticket (ServiceDeskCase) with formal triage and resolution milestones.",
      "Spare Parts Commitment: Functional hardware components maintained for a minimum of 24 months post-sale.",
    ],
  },
  paymentAccount: {
    title: "Payment Receipts, Ledgers, and Reversals Policy",
    points: [
      "Approved Channels: Cash Counter, authorized dynamic UPI QR, and designated Company Bank Transfer accounts.",
      "Mandatory System Receipt: Unreceipted payments are strictly invalid; every valid payment generates a sequential receipt number.",
      "Append-Only Ledgers: Zero tolerance for silent database edits; financial records are strictly append-only.",
      "Reversal Protocol: Payment reversals use FinancialLedger entries with payment=None and store the reversed ID in allocation_context.",
      "Cashier Day-Close: Mandatory shift-end three-way reconciliation of cash drawers, UPI settlement slips, and billing totals.",
      "Customer Advances: Unallocated overpayments are recognized as balance-sheet liabilities until formally applied.",
    ],
  },
  kycVerification: {
    title: "Customer KYC and Identity Privacy Policy",
    points: [
      "DPDP Act 2023 Compliance: Identity documents are captured solely for contract execution, asset security, and statutory compliance.",
      "Masked Aadhaar Invariant: Full 12-digit Aadhaar numbers are never stored in plaintext; only masked versions showing the last 4 digits are retained.",
      "Verification Scope: Primary ID (Aadhaar/PAN/Voter ID/Passport/DL), residential address proof, and premises tenancy proof for rent/lease.",
      "Zero Data Commercialization: Customer personal records are never sold, traded, or shared with third-party marketing networks.",
      "Secure Media Vault: Uploaded KYC documents are stored in access-controlled, isolated media directories.",
    ],
  },
  vendorPurchase: {
    title: "Vendor Procurement and Purchase Return Policy",
    points: [
      "Mandatory Purchase Orders: No inventory unit may enter stock without a system-generated Purchase Order and verified Goods Receipt Note (GRN).",
      "Stock Ledger Movement: Incoming goods post immutable PURCHASE_IN movements, updating inventory valuation.",
      "Purchase Return Eligibility: Returns to vendors are linked to posted purchase bills; return quantity cannot exceed purchased minus returned.",
      "Inventory Effect: Vendor returns post PURCHASE_RETURN_OUT movements and generate an audited Vendor Debit Note.",
      "Warranty Pass-Through: Suppliers must honor agreed warranty terms and provide replacement units within 14 business days for defects.",
    ],
  },
  reconciliationAccounting: {
    title: "Financial Reconciliation and General Ledger Policy",
    points: [
      "Daily Three-Way Reconciliation: Physical drawer collections vs finance accounts vs expected contractual schedules.",
      "Dynamic COA Mapping: Payment channels dynamically map through FinanceAccountCoaMapping to general ledger asset accounts.",
      "No Silent Auto-Repair: Discrepancies are queued into the Admin Reconciliation Workbench for human review and auditable adjustment.",
      "Net Reporting Posture: Executive dashboards and balance sheets reflect net active transactions, excluding voided or reversed entries.",
    ],
  },
  partnerGovernance: {
    title: "Partner Referral and Commission Policy",
    points: [
      "Facilitator Status: Partners act as customer liaisons and lead generators; registration creates no legal agency or employment.",
      "Internal Automated Calculation: Commission calculations are automated backend workflows based on approved partnership agreements.",
      "Prohibition of Self-Approval: Partners cannot self-approve or self-post commission payouts; all payouts require administrative authorization.",
      "Commission Clawback: Cancelled subscriptions or reversed payments trigger an automatic clawback debited from accrued commissions.",
      "No Promise Authority: Partners have no authority to promise waivers, lucky draw wins, discounts, or delivery dates outside signed contracts.",
    ],
  },
} as const;

export const FULL_PUBLIC_FAQ = [
  {
    question: "What is Subidha Core and the Lucky Plan Advance EMI?",
    answer:
      "Subidha Core is the digital operating and financial ledger system powering Subidha Furniture. The Lucky Plan Advance EMI is an installment program allowing customers to acquire quality furniture through structured monthly advance installments. Every enrolled customer is allocated a Lucky ID (00–99) within a batch and participates in monthly fair draws. If selected, remaining future EMIs are 100% waived.",
  },
  {
    question: "Is winning the Lucky Plan monthly draw guaranteed?",
    answer:
      "No. Winning is never guaranteed. Every active Lucky ID in the batch participates equally, and outcomes are determined through an auditable, transparent draw. Participation constitutes an installment purchase agreement, not an investment or prize entitlement.",
  },
  {
    question: "Do I receive a refund of already-paid EMIs if I win?",
    answer:
      "No. Winning waives 100% of future unpaid EMI installments from the winning month onward. Under our core append-only financial invariants, EMIs or advance down payments settled prior to the winning draw are non-refundable in cash, bank transfer, or credit. The customer receives full ownership title to the furniture without paying the remaining balance.",
  },
  {
    question: "What is the Advance Delivery facility (60% to 80% prepayment)?",
    answer:
      "Customers who prefer immediate furniture possession at enrollment may pay an advance prepayment threshold (between 60% and 80% of total contract value upfront). This unlocks Same-Day Enrollment & Same-Day Delivery under Hire-Purchase title retention. If this customer subsequently wins a draw, the remaining 20% to 40% unpaid installments are waived, with zero cash refund on settled advance payments.",
  },
  {
    question: "What is Hire-Purchase Title Retention and Repossession?",
    answer:
      "For products delivered under advance prepayment, legal title and ownership remain strictly with Subidha Furniture until 100% of the contract value is settled (either by completing remaining installments or via an audited draw waiver). In case of payment default exceeding thirty (30) days following formal notice, Subidha Furniture reserves the enforceable legal right to repossess the goods.",
  },
  {
    question: "How is the monthly fair draw conducted transparently?",
    answer:
      "Draws use a cryptographic SHA-256 commit-then-reveal protocol. Prior to the draw, a commitment hash is published on our public website. Following the open physical draw, the secret seed and winning number are revealed. Anyone can verify that the revealed values match the pre-published hash, mathematically proving that results were not altered retrospectively.",
  },
  {
    question: "What is the Rent and Lease 45-Day Arrears Cutoff?",
    answer:
      "The 20% to 30% security deposit collected on rental and lease contracts covers roughly 4 to 6 months of rental liability. To prevent the deposit from being completely exhausted by unpaid rent, staff are legally mandated to issue a Notice of Default and initiate repossession pickup if arrears reach 45 days. Remaining deposit funds cover unpaid rent, recovery transit, and refurbishment.",
  },
  {
    question: "What proof do I receive when I make a payment?",
    answer:
      "Every valid payment generates an immediate, official system-generated digital receipt displaying date, amount, payment method, transaction reference, and cashier trace. Receipts are accessible 24/7 in your customer portal. Never accept or make a payment without receiving an official system receipt.",
  },
  {
    question: "What are the rules for Direct Sale returns and cancellations?",
    answer:
      "Retail direct sales may be returned within three (3) calendar days of delivery solely for verifiable manufacturing defects or specification mismatch. Undamaged returns restock to sellable warehouse stock via SALE_RETURN_IN, while defective returns route to non-sellable quarantine stock. Refunds are disbursed via bank transfer following a three-stage audit approval workflow.",
  },
  {
    question: "Can a Partner promise waivers or approve their own payout?",
    answer:
      "No. Partners act strictly as customer liaisons and lead facilitators. Partners have no authority to promise discounts, waivers, or delivery dates outside signed contracts. Partner commission calculations and payouts are internal controlled workflows; partners cannot self-approve payouts, and commissions are automatically clawed back if a subscription is cancelled or reversed.",
  },
  {
    question: "What is covered under the Furniture Warranty?",
    answer:
      "Subidha Furniture provides a 12-month structural woodwork warranty covering timber joints, frame integrity, and structural stability, along with a 6-month warranty on drawer channels, hydraulic lifts, and hinges. Exclusions include transit damage post-handover, customer abuse, water/liquid pooling, fire, termite/pest infestation, unauthorized modifications, and normal wear and tear.",
  },
  {
    question: "How do I lodge a formal grievance or complaint?",
    answer:
      "Complaints can be submitted through the Customer Portal Service Desk, via email, or in person at the Asansol showroom. If unresolved within five (5) business days, disputes escalate to the designated Grievance Officer, Pradip Roy (Proprietor), who provides formal written resolution within seven (7) business days.",
  },
] as const;

export const RULEBOOK_SECTIONS = [
  {
    id: "lucky-plan-structure",
    title: "1. Lucky Plan Structure & Deterministic EMI",
    rules: [
      "Lucky Plan (Advance EMI) is a structured monthly installment purchase agreement for durable home and commercial furniture.",
      "The product showroom base price represents the total contract value, without hidden financing charges or inflated interest rates.",
      "Default monthly EMI is deterministically derived by dividing total contract value by the batch tenure (e.g., 10 to 15 months).",
      "Subscriptions are organized into controlled batches of up to 100 slots (numbered 00 to 99).",
      "A customer may hold multiple Lucky IDs across multiple independent contracts.",
      "Lucky ID allocation provides fair draw eligibility but does NOT guarantee winning.",
      "Lucky Plan is compliant with the Prize Chits Act, 1978, and BUDS Act, 2019, representing a genuine retail purchase plan.",
    ],
  },
  {
    id: "fair-draw-cryptography",
    title: "2. Cryptographic Fair Draw Procedure (Commit-then-Reveal)",
    rules: [
      "Batch eligibility is locked 24 hours prior to draw execution, generating an immutable DrawEligibilitySnapshot.",
      "Prior to the draw, the system generates a secret cryptographic seed and publishes its SHA-256 commitment hash publicly.",
      "The draw is conducted openly at the showroom in the presence of customers.",
      "Following draw selection, the secret seed is revealed, allowing public verification that Hash == SHA256(seed + winning_number).",
      "Public winner displays mask personal customer names to comply with the DPDP Act, 2023.",
      "No customer or administrative action can alter or manipulate a revealed draw outcome.",
    ],
  },
  {
    id: "advance-delivery-winner-waiver",
    title: "3. Advance Delivery & Winner Benefit Invariants",
    rules: [
      "Customers paying an advance prepayment threshold (60% to 80% upfront) qualify for Same-Day Enrollment & Same-Day Delivery.",
      "Physical handover requires verified customer ID, co-signed Delivery Handover Note, room photo, and driver GPS confirmation.",
      "Winner Benefit: If an advance-delivery customer is selected in any monthly draw, 100% of remaining future EMIs (20% to 40%) are waived.",
      "Zero Cash Refund Invariant: Under no circumstances is any settled EMI or advance down payment refunded in cash or bank transfer.",
      "The customer retains full, unencumbered ownership of the already-delivered furniture once the waiver is executed.",
    ],
  },
  {
    id: "hire-purchase-repossession",
    title: "4. Hire-Purchase Title Retention & Repossession",
    rules: [
      "Contracts featuring advance delivery are legally classified under Hire-Purchase principles with title retention.",
      "Legal ownership remains strictly with Subidha Furniture until 100% of the contract value is settled (via payments or audited waiver).",
      "The customer maintains possessory custody as a bailee and must protect the asset against damage or unauthorized transfer.",
      "In the event of installment default exceeding thirty (30) days following formal notice, Subidha Furniture reserves the enforceable legal right to repossess the goods.",
    ],
  },
  {
    id: "direct-sales-invoicing",
    title: "5. Direct Sales, Invoicing & Title Transfer",
    rules: [
      "Quotation validity is standard seven (7) calendar days based on real-time stock valuation.",
      "Confirmed sales generate sequential tax invoices logged in the sales ledger.",
      "Legal ownership transfers to the customer only upon 100% payment receipt and physical delivery handover.",
      "Partial advance payments establish booking reservations; title and lien remain with Subidha Furniture until fully settled.",
      "Pre-invoice cancellations result in full advance refund; post-invoice pre-dispatch cancellations generate an audited Credit Note.",
    ],
  },
  {
    id: "vendor-procurement-returns",
    title: "6. Vendor Procurement, GRN & Purchase Returns",
    rules: [
      "Stock-on-Hand Invariant: All furniture must physically exist in the Stock Ledger before customer delivery or rental custody.",
      "Shipments must be backed by an approved Purchase Order (PO) and Goods Receipt Note (GRN) posting a PURCHASE_IN movement.",
      "Purchase returns to vendors require a mandatory return reason and cannot exceed purchased quantity minus prior returns.",
      "Vendor returns post PURCHASE_RETURN_OUT movements and generate an audited Vendor Debit Note adjusting accounts payable.",
      "Suppliers must honor warranty terms and provide replacement units within 14 business days for manufacturing defects.",
    ],
  },
  {
    id: "rent-lease-governance",
    title: "7. Rent and Lease Custody & 45-Day Arrears Cutoff",
    rules: [
      "Rent and Lease grant possessory custody under bailment; physical assets remain Subidha Furniture's corporate property.",
      "Mandatory KYC (Masked ID + Address Proof) and Premises Tenancy Deed / Rent Agreement are required before contract activation.",
      "A 20% to 30% refundable security deposit is maintained in a segregated deposit ledger as a customer liability.",
      "Monthly rental demands are billed separately and cannot be casually offset against the deposit during active tenure.",
      "Mandatory 45-Day Arrears Cutoff: Staff must initiate repossession pickup if arrears reach 45 days, preventing deposit exhaustion.",
      "Technical return inspection grades condition into Tiers 1 through 4, with itemized deductions and electronic refund within 7 banking days.",
    ],
  },
  {
    id: "delivery-handover-pod",
    title: "8. Delivery Window Eligibility & Proof of Delivery (POD)",
    rules: [
      "Delivery window unlocks ONLY upon: (1) Draw Winner, OR (2) Completed Tenure, OR (3) 60%–80% Advance Prepayment threshold.",
      "Admin Override deliveries for ineligible subscriptions require executive sign-off and permanently carry a visible Admin Override audit badge.",
      "Secure Mobile Handover Link: Store admin generates a tamper-proof, time-limited request link (valid 7 days) sent to the delivery driver or customer via WhatsApp/SMS without sharing admin credentials.",
      "Mandatory Quality Proof (Rule CTRL-RENT-2): Delivery cannot transition to DELIVERED status without an attached Proof of Delivery (POD) record.",
      "Photo 1 (Product Quality Capture): Driver must take an in-room photo of the assembled furniture displaying finish, woodwork, upholstery, and serial tag to establish baseline quality.",
      "Photo 2 (Recipient Handover Photo): Delivery crew takes a photo of the customer/recipient standing with the furniture at their premises.",
      "Digital Touchscreen Signature: Recipient signs directly on the smartphone screen using an interactive digital signature pad.",
      "Geotagged Delivery GPS: Exact GPS coordinates (latitude/longitude) and timestamp are recorded automatically to verify the physical delivery address.",
      "Return & Deposit Protection: For rent and lease, this handover photo evidence serves as the legal baseline during end-of-tenure return inspections to distinguish pre-existing condition from customer damage.",
      "Customers must verify that building doorways, stairwells, and passages permit passage of assembled furniture.",
    ],
  },
  {
    id: "payment-reversals-reconciliation",
    title: "9. Payment Receipts, Ledgers & Reversals",
    rules: [
      "Approved payment channels: Cash Counter, authorized dynamic UPI QR, and designated Company Bank Transfer accounts.",
      "A payment is legally recognized ONLY when backed by an official system-generated receipt.",
      "Financial ledgers are append-only; silent database mutations, deletes, or truncates are strictly prohibited.",
      "Payment reversal generates a PAYMENT_REVERSAL entry using payment=None and stores the reversed ID in allocation_context.",
      "Daily three-way reconciliation compares physical drawers, dynamic COA mapping, and expected installment schedules.",
    ],
  },
  {
    id: "warranty-service-desk",
    title: "10. Warranty Scopes & ServiceDesk Lifecycle",
    rules: [
      "Dual warranty framework: OEM branded warranty pass-through plus 12-month Subidha structural woodwork warranty and 6-month hardware warranty.",
      "Exclusions strictly cover transit damage post-handover, customer abuse, water pooling, fire, termites/pests, and unauthorized repairs.",
      "All service requests generate an auditable ticket (ServiceDeskCase) with formal triage, inspection, estimate, and completion sign-off.",
      "Genuine hardware components maintained for a minimum of 24 months post-sale.",
    ],
  },
  {
    id: "partner-commission-governance",
    title: "11. Partner Referral & Commission Governance",
    rules: [
      "Partners act as customer liaisons and lead facilitators; registration creates no legal agency or employment.",
      "Commission calculations are automated internal workflows; partners cannot self-approve or self-post commission payouts.",
      "Commission Clawback Invariant: Cancelled subscriptions or reversed payments trigger an automatic clawback debited from accrued commissions.",
      "Partners have no authority to promise waivers, lucky draw wins, discounts, or delivery dates outside signed contracts.",
    ],
  },
  {
    id: "grievance-escalation",
    title: "12. Customer Grievance Redressal & DPDP Privacy",
    rules: [
      "Structured 3-Tier Grievance Framework: Tier 1 (Showroom Desk), Tier 2 (Grievance Officer Pradip Roy), Tier 3 (Executive / Arbitration).",
      "Statutory compliance with Consumer Protection Act, 2019, and DPDP Act, 2023.",
      "Aadhaar numbers are masked (last 4 digits only); customer data is never commercialized or sold to third parties.",
      "Jurisdiction for all disputes is seated exclusively in the competent civil courts at Asansol, Paschim Barddhaman, West Bengal.",
    ],
  },
] as const;

export const CUSTOMERS_PAGE_CONTENT = {
  registrationSteps: [
    {
      title: "1. Select Product & Plan Pathway",
      description:
        "Visit our Asansol showroom or browse online. Choose your preferred pathway: Direct Sale, Lucky Plan Advance EMI, Rent, or Lease.",
    },
    {
      title: "2. KYC Verification & Privacy Gating",
      description:
        "Submit required identity proof (Masked Aadhaar, PAN, Voter ID, or DL) and address proof under DPDP privacy protections. Rent and lease require premises tenancy proof.",
    },
    {
      title: "3. Contract Approval & Invoicing",
      description:
        "Review your system-generated contract, installment schedule, and terms. Receive an official contract reference code and payment schedule.",
    },
    {
      title: "4. Lucky ID Allocation (Lucky Plan Only)",
      description:
        "For Lucky Plan enrollments, receive an exclusive Lucky ID (00–99) within your batch for monthly fair draw participation.",
    },
    {
      title: "5. Digital Payment & Instant Receipting",
      description:
        "Pay scheduled installments via Cash Counter, authorized UPI, or Bank Transfer. Instant official digital receipts are issued to your portal.",
    },
  ],
  whatCustomerPortalProvides: [
    "24/7 visibility into active contracts, installment schedules, and Lucky ID allocations",
    "Instant download of official sequential payment receipts and tax invoices",
    "Real-time tracking of delivery dispatch milestones, handover notes, and POD proofs",
    "Interactive tracking of service desk tickets and warranty maintenance requests",
    "Verification of KYC approval status and registered contact details",
    "Security deposit tracking, itemized deduction statements, and refund statuses",
    "Access to monthly Fair Draw commitment hashes, reveal proofs, and winner showcases",
  ],
  documentsToKeep: [
    "Approved and signed Contract Document (Subscription, Rent, or Lease)",
    "System-generated sequential Payment Receipts (digital and printed copies)",
    "Co-signed Delivery Handover Note with Proof of Delivery (POD) record",
    "Official Draw Winner Certificate (for Lucky Plan draw winners)",
    "Deposit Refund Settlement Advice and Return Damage Inspection Report",
    "Service Completion Certificates for maintenance or warranty repairs",
  ],
} as const;

export const PARTNERS_PAGE_CONTENT = {
  roleExplanation:
    "Subidha Furniture Partners support community retail outreach by introducing prospective customers to our furniture offerings, Lucky Plan subscriptions, and rental programs. All contracts, collection accounting, and payouts remain strictly managed inside our core system.",
  keyPoints: [
    {
      title: "Facilitator Role Without Agency",
      description:
        "Partners act as customer liaisons and lead generators. Registration creates no employment, partnership, or legal agency relationship.",
    },
    {
      title: "Internal Automated Commission Workflows",
      description:
        "Commission calculations and accruals are automated backend workflows governed by approved partnership terms. Partners cannot self-approve or self-post payouts.",
    },
    {
      title: "Strict Commission Clawback Invariant",
      description:
        "If an introduced subscription is subsequently cancelled due to customer default, fraud, or payment reversal, accrued commissions are automatically clawed back.",
    },
    {
      title: "Zero Promise Authority",
      description:
        "Partners have no legal authority to promise waivers, lucky draw wins, discounts, or delivery timelines outside official system-generated contracts.",
    },
  ],
  disclaimer:
    "Partner registration and activation require administrative verification. This page explains partner governance for informational purposes. Final terms are governed by the formal Partner Agreement and the Partner Referral and Commission Policy.",
} as const;

export const HOW_IT_WORKS_JOURNEY_A = [
  {
    title: "1. Select Furniture Product",
    description: "Browse the showroom or online catalog. Showroom base price establishes the total contract value.",
  },
  {
    title: "2. Register & Verify KYC",
    description: "Provide identity proof under DPDP privacy standards. The branch registers your subscription.",
  },
  {
    title: "3. Join Active Batch & Receive Lucky ID",
    description: "An exclusive Lucky ID (00–99) is allocated within your batch and permanently linked to your contract.",
  },
  {
    title: "4. Optional Advance Delivery Provision (60%–80%)",
    description: "Pay 60%–80% upfront to unlock immediate Same-Day Delivery under Hire-Purchase title retention.",
  },
  {
    title: "5. Pay Monthly Advance EMIs",
    description: "Remit scheduled advance EMIs via Cash Counter, authorized UPI, or Bank Transfer, receiving instant receipts.",
  },
  {
    title: "6. Transparent Fair Draw (Commit-then-Reveal)",
    description: "Monthly draws use cryptographic SHA-256 commitment hashes published prior to the open draw.",
  },
  {
    title: "7. Winner Benefit (100% Future EMI Waiver)",
    description: "Winners have all remaining future EMIs waived 100% with zero cash refund on settled payments.",
  },
  {
    title: "8. Tenure Completion & Ownership Title",
    description: "Non-winning subscribers complete scheduled tenure and receive full unencumbered ownership.",
  },
] as const;

export const HOW_IT_WORKS_JOURNEY_B = [
  {
    title: "1. Select Rental Furniture",
    description: "Choose eligible furniture units carrying verified stock-on-hand in the warehouse.",
  },
  {
    title: "2. Mandatory KYC & Tenancy Deed Verification",
    description: "Submit identity proof, address proof, and Rent Agreement / premises deed prior to contract activation.",
  },
  {
    title: "3. Deposit Remittance & Contract Invoicing",
    description: "Remit refundable security deposit (20%–30%) into the segregated deposit liability ledger.",
  },
  {
    title: "4. Physical Delivery & Handover Inspection",
    description: "Delivery crew and customer execute joint inspection and co-sign physical Handover Note with room photos.",
  },
  {
    title: "5. Monthly Rent Demands & 45-Day Arrears Cutoff",
    description: "Pay periodic rent demands on time. Arrears exceeding 45 days trigger mandatory repossession pickup.",
  },
  {
    title: "6. Return Inspection & Electronic Deposit Refund",
    description: "Asset condition evaluated into Grades A through D. Net refundable balance remitted within 7 banking days.",
  },
] as const;

export const HOW_IT_WORKS_JOURNEY_C = [
  {
    title: "1. Select Long-Term Lease Units",
    description: "Identify residential or corporate furniture packages for extended tenures (6 to 24 months).",
  },
  {
    title: "2. Corporate / Residential KYC Gating",
    description: "Complete full identity, address, and premises occupancy verification before lease activation.",
  },
  {
    title: "3. Security Deposit Accounting",
    description: "Deposit remitted and recorded in the deposit ledger as an auditable balance-sheet liability.",
  },
  {
    title: "4. Dispatch & Proof of Delivery (POD)",
    description: "Goods dispatched from verified stock-on-hand with complete POD documentation.",
  },
  {
    title: "5. Periodic Demand Settlement & Upgrades",
    description: "Settle periodic lease demands. Upgrades and extensions evaluated based on payment discipline.",
  },
  {
    title: "6. Tenure Closeout & Asset Settlement",
    description: "Joint return inspection, itemized condition report, and electronic refund of net deposit balance.",
  },
] as const;

export const HOW_IT_WORKS_JOURNEY_D = [
  {
    title: "1. Approved Payment Channel Selection",
    description: "Remit funds solely via Showroom Cash Counter, authorized dynamic UPI QR, or Company Bank Transfer.",
  },
  {
    title: "2. System Payment Ingestion",
    description: "Payment recorded in the core billing engine against your specific contract reference or invoice.",
  },
  {
    title: "3. Instant Sequential Receipt Issuance",
    description: "A sequential receipt is generated displaying amount, date, payment mode, transaction reference, and cashier trace.",
  },
  {
    title: "4. Customer Portal Availability",
    description: "Receipt immediately syncs to your authenticated customer portal for 24/7 download and inspection.",
  },
  {
    title: "5. Append-Only Ledger Reconciliation",
    description: "Payment posts to immutable double-entry ledgers and reconciles daily during cashier shift-close.",
  },
] as const;

export const HOW_IT_WORKS_JOURNEY_E = [
  {
    title: "1. Identity & Premises Verification",
    description: "Customer KYC and premises tenancy documentation verified under DPDP privacy standards.",
  },
  {
    title: "2. Contract State Activation",
    description: "Contract transitions from DRAFT to ACTIVE with locked product references, tenures, and totals.",
  },
  {
    title: "3. Milestone Payment Verification",
    description: "Billing desk confirms required threshold: Winner status, Completed status, or 60%–80% Advance Prepayment.",
  },
  {
    title: "4. Stock-on-Hand Allocation",
    description: "Physical goods verified in warehouse Stock Ledger and allocated to the dispatch manifest.",
  },
  {
    title: "5. Mobile Handover Link & Quality Photos",
    description: "Admin shares secure WhatsApp link. Driver opens mobile screen and snaps Photo 1 (furniture assembly & finish) and Photo 2 (customer with item).",
  },
  {
    title: "6. On-Screen Touchscreen Signature & GPS Tag",
    description: "Customer draws their signature directly on the phone screen. Exact delivery GPS coordinates and timestamp are tagged automatically.",
  },
  {
    title: "7. Fulfillment Closure & Asset Custody",
    description: "System verifies POD, updates delivery to DELIVERED (Rule CTRL-RENT-2), and activates custody in Customer Portal.",
  },
] as const;

export const PHASE10C_FAQ = [
  {
    question: "What is Subidha Core?",
    answer:
      "Subidha Core is the enterprise ERP and financial ledger system powering Subidha Furniture. It manages retail sales, Lucky Plan EMI subscriptions, rent, lease, stock movements, and double-entry accounting with strict append-only auditability.",
  },
  {
    question: "What is the Advance Delivery threshold for Lucky Plan?",
    answer:
      "Customers who pay an advance prepayment threshold of 60% to 80% upfront qualify for Same-Day Enrollment & Same-Day Delivery under Hire-Purchase title retention.",
  },
  {
    question: "Is there any cash refund if an advance-delivery customer wins?",
    answer:
      "No. Winning waives 100% of remaining future installments (20% to 40%). Settled advance payments are non-refundable in cash or bank transfer.",
  },
  {
    question: "What happens if rent arrears exceed 45 days?",
    answer:
      "Staff are legally mandated to issue a Notice of Default and initiate repossession pickup at 45 days of arrears to protect the security deposit buffer.",
  },
  {
    question: "Can a partner approve their own commission payout?",
    answer:
      "No. Partner commissions are internal automated calculations requiring managerial authorization. Partners cannot self-approve payouts, and commissions are clawed back if a subscription cancels.",
  },
  {
    question: "How do I verify the monthly fair draw commitment hash?",
    answer:
      "The SHA-256 commitment hash is published on our public website prior to the draw. Following the draw, the secret seed and winning number are revealed, allowing anyone to verify Hash == SHA256(seed + winning_number).",
  },
] as const;

export const CUSTOMER_LIMITATIONS = [
  "Cannot self-post payments — all payments must be recorded by authorized staff via approved channels",
  "Cannot self-approve delivery — delivery dispatch requires verified stock-on-hand and payment milestone clearance",
  "Cannot edit accounting ledgers — financial records and journals are internal, append-only, and audit-locked",
  "Cannot alter EMI schedules, contract totals, or tenure without formal administrative amendment approval",
  "Cannot transfer Lucky IDs or contract rights to third parties without written managerial consent",
  "Cannot access cashier, accounting, or administrative workbench queues through customer portal credentials",
  "Cannot self-approve KYC — identity and premises verification is executed exclusively by authorized staff",
] as const;

export const CUSTOMER_MULTI_CONTRACT_INFO = {
  multipleContracts:
    "A customer may hold multiple active contracts concurrently — for example, one Lucky Plan EMI subscription, one Direct Sale purchase, and one Rental agreement. Each contract maintains independent accounting, payment schedules, and receipts.",
  multipleLuckyIds:
    "A customer may hold more than one Lucky ID across different batches or within the same batch (subject to batch limits). Each Lucky ID operates independently in monthly fair draws, but winning one contract waives future EMIs only for that specific contract.",
} as const;
