export type HelpCategory =
  | "all"
  | "command-center"
  | "pim-products"
  | "collections"
  | "sales-contracts"
  | "manufacturing"
  | "inventory"
  | "purchases-vendors"
  | "accounting-finance"
  | "lucky-plan"
  | "crm-customers"
  | "delivery"
  | "hr-payroll"
  | "bi-reports"
  | "business-setup";

export type HelpWorkflowStep = {
  step: number;
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
  importantNote?: string;
};

export type BusinessSetupRequirement = {
  title: string;
  description: string;
  setupHref: string;
  statusText?: string;
};

export type ActionPlaybook = {
  id: string;
  intent: string;
  category: HelpCategory;
  routePrefix: string;
  actionHref: string;
  actionLabel: string;
  breadcrumbSteps: string[];
  stepByStepGuide: {
    step: number;
    title: string;
    description: string;
    fieldDetails?: string;
  }[];
  criticalRules: string[];
  staffOperationalTip?: string;
  scopeOfImprovement?: string[];
};

export type AdminHelpTopic = {
  id: string;
  title: string;
  shortTitle: string;
  category: HelpCategory;
  badge: string;
  iconName:
    | "boxes"
    | "wallet"
    | "shoppingCart"
    | "factory"
    | "landmark"
    | "users"
    | "truck"
    | "userCog"
    | "trophy"
    | "settings"
    | "gauge"
    | "receipt";
  pathPrefixes: string[];
  summary: string;
  whyNeeded: string;
  howItWorks: string;
  workflows: {
    name: string;
    description: string;
    steps: HelpWorkflowStep[];
  }[];
  setupRequirements: BusinessSetupRequirement[];
  invariants: string[];
  keyActions: {
    label: string;
    href: string;
    variant?: "primary" | "secondary";
  }[];
  commonQuestions?: { question: string; answer: string }[];
};

export const HELP_CATEGORIES: { id: HelpCategory; label: string }[] = [
  { id: "all", label: "All Topics" },
  { id: "command-center", label: "Command Center" },
  { id: "pim-products", label: "PIM & Products" },
  { id: "collections", label: "Collections & Cash" },
  { id: "sales-contracts", label: "Sales & Contracts" },
  { id: "manufacturing", label: "BOM & Manufacturing" },
  { id: "inventory", label: "Inventory & Stock" },
  { id: "purchases-vendors", label: "Purchases & Vendors" },
  { id: "accounting-finance", label: "Accounting & Finance" },
  { id: "lucky-plan", label: "Lucky Plan & Draws" },
  { id: "crm-customers", label: "CRM & Customers" },
  { id: "delivery", label: "Delivery & Logistics" },
  { id: "hr-payroll", label: "HR & Payroll" },
  { id: "bi-reports", label: "BI & Reports" },
  { id: "business-setup", label: "Business Setup" },
];

// ── 75 High-Intent Action Playbooks ("I Want To...") ─────────────────────────
export const ACTION_PLAYBOOKS: ActionPlaybook[] = [
  {
    id: "close-daily-register",
    intent: "Conduct End-of-Day Register Close & Cash Drawer Sign-Off",
    category: "command-center",
    routePrefix: "/admin/close-cockpit",
    actionHref: "/admin/close-cockpit",
    actionLabel: "Close Cockpit",
    breadcrumbSteps: ["Command Center", "Close Cockpit", "Cash Drawer Count", "UPI & Bank Reconciliation", "Manager Override / Variance Sign-Off", "Generate Day-End Summary Sheet"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Open End-of-Day Close Cockpit",
        description: "Navigate to Command Center > Close Cockpit. Ensure all active cashiers and counters have paused new transactions.",
        fieldDetails: "Counter ID, Date of Operation, Cashier Name.",
      },
      {
        step: 2,
        title: "Count & Input Physical Cash Currency",
        description: "Count actual currency notes and coins in the physical till. Enter denomination-wise breakdown (₹2000, ₹500, ₹200, ₹100, ₹50, ₹20, ₹10).",
        fieldDetails: "Denomination counts, Total physical cash counted.",
      },
      {
        step: 3,
        title: "Verify Digital UPI / POS Machine Settlement",
        description: "Cross-check digital collection receipts logged against POS card swipe batch totals and UPI soundbox/gateway transaction summary.",
        fieldDetails: "Card swipe settlement slip, UPI Soundbox total, Total digital receipts.",
      },
      {
        step: 4,
        title: "Sign-Off Variance & Lock Session",
        description: "Review system-calculated expected balance vs. counted balance. If variance exists, enter mandatory discrepancy explanation before admin sign-off.",
        fieldDetails: "Variance amount (+/-), Discrepancy reason, Supervisor password/PIN.",
      },
    ],
    criticalRules: [
      "Physical cash counted must reconcile with total collections minus documented cash expense vouchers.",
      "Any cash variance exceeding threshold (e.g. ₹100) requires mandatory admin supervisor sign-off.",
      "Once closed, the register session is immutable and cannot be edited without a formal audit reversal.",
    ],
    staffOperationalTip: "Keep all physical supplier payout slips and petty cash expense vouchers inside the till box throughout the day so they match during the 5-minute denomination count.",
    scopeOfImprovement: [
      "Enable automatic daily WhatsApp PDF dispatch of the signed-off EOD summary to the store owner.",
      "Integrate automated cash-drop alerts when drawer balance exceeds ₹25,000 for loss prevention.",
    ],
  },
  {
    id: "morning-store-open",
    intent: "Morning Store Open, Cash Float Setup & System Health Check",
    category: "command-center",
    routePrefix: "/admin/operations/command-center",
    actionHref: "/admin/operations/command-center",
    actionLabel: "Morning Readiness",
    breadcrumbSteps: ["Command Center", "Operations Command", "Float Initialization", "Thermal Printer / Soundbox Check", "Sync Offline Ledgers", "Open Register for Public"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Initialize Cash Drawer Float",
        description: "Log into Operations Command Center. Enter the opening petty cash / float amount given to the cashier counter (e.g. ₹2,000 for change).",
        fieldDetails: "Drawer ID, Opening Float Amount (₹), Cashier User.",
      },
      {
        step: 2,
        title: "Hardware & Peripheral Readiness Check",
        description: "Perform quick test prints on 3-inch thermal POS receipt printers and verify UPI Soundbox audio ping status.",
        fieldDetails: "Printer Status, Network Latency, Soundbox Battery & Connection.",
      },
      {
        step: 3,
        title: "Inspect Pending Queue & Sync Readiness",
        description: "Review yesterday's unverified online requests, failed SMS/WhatsApp queues, and pending deliveries scheduled for morning dispatch.",
        fieldDetails: "Pending queues count, Failed notification queue, Scheduled dispatches.",
      },
    ],
    criticalRules: [
      "Opening float cannot be set to ₹0 if physical change was placed in the till drawer.",
      "Ensure all previous day close sessions are completed before opening a new operational date.",
    ],
    staffOperationalTip: "Run a 1-second sample test receipt print each morning before customers arrive to ensure thermal paper roll is not near its end.",
    scopeOfImprovement: [
      "Implement a single-click 'Morning Ready' checklist popup that locks sales till until float is confirmed.",
    ],
  },
  {
    id: "today-workbench-triage",
    intent: "Solopreneur Daily Action Queue & Urgent Task Triage",
    category: "command-center",
    routePrefix: "/admin/operations/today-work",
    actionHref: "/admin/operations/today-work",
    actionLabel: "Today's Work",
    breadcrumbSteps: ["Command Center", "Today Work", "Overdue EMI Calls", "Pending Deliveries", "Expiring KYC Queue", "Execute Priority Actions"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Review Priority Operational Alerts",
        description: "Open Today Work dashboard. The system organizes operational tasks into high-impact cards: overdue installments, pending factory pickups, and delivery milestones.",
        fieldDetails: "Critical severity alerts, Total actionable items, Solopreneur focus list.",
      },
      {
        step: 2,
        title: "Assign or Execute One-Click Actions",
        description: "Directly trigger payment collection, WhatsApp reminder broadcast, or delivery assignment without navigating across separate sub-modules.",
        fieldDetails: "Action target, Assigned staff member, Status update.",
      },
      {
        step: 3,
        title: "Track Progress Against Daily Collection Target",
        description: "Monitor the real-time progress bar toward the store's daily collection target (e.g. ₹50,000 target vs ₹32,000 collected so far).",
        fieldDetails: "Target amount, Realized cash/UPI, Remaining deficit.",
      },
    ],
    criticalRules: [
      "Never ignore high-priority defaulter escalations past 60 days overdue.",
      "Clear KYC verification backlogs before authorizing new high-value furniture deliveries.",
    ],
    staffOperationalTip: "Filter the Today Work queue by 'Due Today' at 10 AM to call customers before their banks close or lunch breaks occur.",
    scopeOfImprovement: [
      "Introduce automated priority sorting based on recovery probability scoring.",
    ],
  },
  {
    id: "multi-branch-switch",
    intent: "Inter-Branch Context Switching & Multi-Location Float Governance",
    category: "command-center",
    routePrefix: "/admin/branches",
    actionHref: "/admin/branches",
    actionLabel: "Branch Control",
    breadcrumbSteps: ["Command Center", "Branch Control", "Select Active Branch", "Verify Branch Cash Till", "Filter Inventory Scope"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Select Operating Branch",
        description: "Click the branch switcher dropdown in the header or open Branch Control to select the active store location (e.g. Asansol Main Showroom vs Raniganj Depot).",
        fieldDetails: "Branch ID, Branch Name, Operating Address.",
      },
      {
        step: 2,
        title: "Confirm Local Inventory & Drawer Scope",
        description: "All inventory lookups, sales orders, and cash accounts dynamically scope to the chosen branch so physical stock is never depleted from another showroom.",
        fieldDetails: "Warehouse code, POS counter code, Designated cash account.",
      },
    ],
    criticalRules: [
      "Stock cannot be issued from a branch other than the customer's delivery dispatch point unless an inter-warehouse transfer is booked.",
      "Financial reports can be viewed per-branch or aggregated across the entire business entity.",
    ],
    staffOperationalTip: "Store staff should always double-check the top-left branch badge when billing customers to ensure correct branch GSTIN prints on invoices.",
    scopeOfImprovement: [
      "Auto-detect staff user's default branch upon login based on employee profile assignment.",
    ],
  },
  {
    id: "system-health-audit",
    intent: "Executive Operations & System Health Status Inspection",
    category: "command-center",
    routePrefix: "/admin",
    actionHref: "/admin",
    actionLabel: "Executive Health",
    breadcrumbSteps: ["Command Center", "Admin Dashboard", "Check Service Status", "Inspect Celery Queues", "Review DB Connection Pool"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Inspect Live Service Latency & Uptime",
        description: "Check the System Optimal latency pill on the bottom-left sidebar. Green indicates database, Gunicorn API, and Redis cache response times < 80ms.",
        fieldDetails: "API Latency (ms), Background worker heartbeat, Database query time.",
      },
      {
        step: 2,
        title: "Verify Scheduled Automation Status",
        description: "Confirm that Celery Beat daily cron tasks (overdue calculation, auto-reminders, backup archives) executed without failure during the previous night.",
        fieldDetails: "Cron task name, Last run timestamp, Success/Failure status.",
      },
    ],
    criticalRules: [
      "If database latency exceeds 500ms or Celery status is red, immediately report to tech support before processing bulk draw executions.",
    ],
    staffOperationalTip: "If receipt generation feels sluggish, check system health to verify your local internet connection latency.",
    scopeOfImprovement: [
      "Add automated SMS alerts to the store owner if server disk storage exceeds 85% capacity.",
    ],
  },
  {
    id: "create-pim-blueprint",
    intent: "Add a New Furniture Product Blueprint in PIM",
    category: "pim-products",
    routePrefix: "/admin/products",
    actionHref: "/admin/products/create",
    actionLabel: "New Product",
    breadcrumbSteps: ["PIM & Products", "Product Catalog", "Create Product Blueprint", "Item Type & Classification", "HSN / SAC & GST Rate", "Pricing & Tier Configuration", "Publish to Channels"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Define Conceptual Blueprint",
        description: "Open Products > Create Product. Select Item Type: Finished Good (furniture for sale/rent), Raw Material (wood, foam, fabric), or Accessory (handles, hinges).",
        fieldDetails: "Product Name, Item Type, Stock Type (Stock Item / Made-to-Order).",
      },
      {
        step: 2,
        title: "Set Tax Classification (HSN Code & GST Rate)",
        description: "Enter the 6-digit or 8-digit HSN code (e.g. 9403 for Wooden Furniture). The applicable GST tax slab (e.g. 18%) autofills.",
        fieldDetails: "HSN Code, GST Slab %, Cess % (if applicable).",
      },
      {
        step: 3,
        title: "Commercial Pricing & Model Eligibility",
        description: "Specify the retail MRP, Base Selling Price, and enable business model flags: is_emi_enabled (Lucky Plan), is_rent_enabled (Rental), and is_lease_enabled (Lease).",
        fieldDetails: "Base Price (₹), MRP (₹), EMI eligible flag, Rent eligible flag, Lease eligible flag.",
      },
      {
        step: 4,
        title: "Upload Specifications & Media",
        description: "Add dimensions (Height x Width x Depth in inches/cm), wood type (Teak, Sheesham, Engineered), warranty duration (months), and primary catalog photograph.",
        fieldDetails: "Dimensions, Material, Finish, Warranty Months, Hero Image URL.",
      },
    ],
    criticalRules: [
      "Item Type is immutable once inventory movements exist; Finished Goods and Raw Materials cannot be casually flipped.",
      "Base price cannot be zero or negative for items enabled for Lucky Plan EMI or retail direct sale.",
      "HSN code is strictly required for legal GST tax invoice generation.",
    ],
    staffOperationalTip: "Always input exact dimensions in inches; customer questions in the showroom almost always start with 'Will this bed fit in my 10x12 bedroom?'.",
    scopeOfImprovement: [
      "Enable automated AI background removal on mobile photos uploaded by showroom staff.",
    ],
  },
  {
    id: "sync-whatsapp-meta-catalog",
    intent: "Sync Catalog to WhatsApp Business & Facebook Shop (100% Free / ₹0)",
    category: "pim-products",
    routePrefix: "/admin/products",
    actionHref: "/admin/products",
    actionLabel: "Catalog Feed",
    breadcrumbSteps: ["PIM & Products", "Brand Data Center", "Generate Meta CSV Feed", "Copy Live Feed URL", "Paste into Meta Commerce Manager", "Auto-Sync Schedule (Daily/Hourly)"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Access Brand Data Center Feed",
        description: "Navigate to Settings > Brand Data Center or PIM Products > Brand Data Center. Locate the Meta / WhatsApp Product Feed section.",
        fieldDetails: "Feed URL: https://subidhafurnitureasansol.com/api/v1/public/brand/meta-catalog.csv",
      },
      {
        step: 2,
        title: "Configure Feed Inclusion Criteria",
        description: "Ensure furniture items have published status, active hero images, and non-zero retail prices. Exclude discontinued models.",
        fieldDetails: "Include Finished Goods, Min Price > 0, Require Active Photo.",
      },
      {
        step: 3,
        title: "Set Scheduled Fetch in Meta Commerce Manager",
        description: "Log into your free Facebook / Meta Commerce Manager. Create a Catalog > Data Sources > Data Feed. Set Scheduled Fetch to 'Daily at 04:00 AM' using the feed URL.",
        fieldDetails: "Meta Data Source URL, Schedule Frequency, Currency: INR.",
      },
      {
        step: 4,
        title: "Verify WhatsApp Catalog & Cart",
        description: "Connect your WhatsApp Business number. Customers can browse your entire showroom inventory in WhatsApp and click 'Message Business with Cart'.",
        fieldDetails: "WhatsApp Business Account ID, Catalog Status.",
      },
    ],
    criticalRules: [
      "100% completely free: Meta charges ₹0 for native catalogs and scheduled fetch. Never buy 3rd party sync software.",
      "Hero images must be publicly accessible HTTPS URLs with at least 500x500 px resolution.",
    ],
    staffOperationalTip: "When sending customer quotes on WhatsApp, you can directly attach catalog product cards from the WhatsApp Business chat interface.",
    scopeOfImprovement: [
      "Add automated WhatsApp button in CRM lead cards to send product catalog links in 1 click.",
    ],
  },
  {
    id: "create-product-variants",
    intent: "Generate Product Variants (Color, Size, Polish) & Barcode Labels",
    category: "pim-products",
    routePrefix: "/admin/products",
    actionHref: "/admin/products",
    actionLabel: "Manage Variants",
    breadcrumbSteps: ["PIM & Products", "Select Parent Blueprint", "Configure Attribute Matrix", "Generate SKU Variants", "Assign Barcodes", "Print Barcode Price Tags"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Select Master Product Blueprint",
        description: "Open Products > Catalog. Search for the master product (e.g. 'Royal Teak King Bed'). Click 'Manage Variants'.",
        fieldDetails: "Parent Product SKU, Variant Matrix Mode.",
      },
      {
        step: 2,
        title: "Select Variant Attribute Dimensions",
        description: "Pick the variation dimensions: Size (King, Queen, Single), Color/Fabric (Walnut, Honey Oak, Dark Mahogany, Velvet Grey).",
        fieldDetails: "Attribute Types: Size, Polish Finish, Fabric Shade.",
      },
      {
        step: 3,
        title: "Generate Combinations & SKU Numbers",
        description: "Click 'Generate Matrix'. The system creates distinct child SKUs (e.g. RTKB-KNG-WAL, RTKB-QEN-HON) with individual pricing overrides.",
        fieldDetails: "Child SKU, Price differential (+/- ₹), EAN/Barcode.",
      },
      {
        step: 4,
        title: "Print Adhesive Barcode Labels",
        description: "Select generated SKUs and click 'Print Barcode Labels'. Choose 50x25mm standard sticker format to stick onto physical furniture.",
        fieldDetails: "Label size, Barcode symbology (Code 128 / QR), Quantity of stickers.",
      },
    ],
    criticalRules: [
      "Each variant SKU must have a strictly unique barcode code in the database.",
      "Inventory tracking operates at the variant SKU level, not the abstract parent blueprint level.",
    ],
    staffOperationalTip: "Affix barcode stickers to an unobtrusive spot (e.g. underneath the headboard or inside a wardrobe drawer) to keep showroom displays clean.",
    scopeOfImprovement: [
      "Allow staff to scan barcode tags using their phone camera directly in the POS direct sales screen.",
    ],
  },
  {
    id: "manage-pricing-rental-tiers",
    intent: "Configure Tiered Rental Rates, Lease Yields & Price Ladders",
    category: "pim-products",
    routePrefix: "/admin/products",
    actionHref: "/admin/products",
    actionLabel: "Price Governance",
    breadcrumbSteps: ["PIM & Products", "Select Furniture Model", "Configure Base MRP", "Set Monthly Rental Yield %", "Set Minimum Security Deposit %", "Save Price Ladder"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Select Furniture Item for Rent/Lease Pricing",
        description: "Open Products > Catalog. Filter by 'is_rent_enabled=True'. Click 'Commercial Terms & Pricing'.",
        fieldDetails: "Product SKU, Model Name, Base Valuation.",
      },
      {
        step: 2,
        title: "Configure Monthly Rental Yield Formula",
        description: "Input the monthly yield rate (e.g. 3.5% of product base price per month) and minimum tenure duration (e.g. 3 months, 6 months, 12 months).",
        fieldDetails: "Monthly Yield %, Minimum Tenure Months, Discount for 12+ Months Tenure.",
      },
      {
        step: 3,
        title: "Define Mandatory Security Deposit Requirement",
        description: "Set the security deposit percentage (e.g. 15% or 20% of base valuation) or specify a fixed refundable deposit amount.",
        fieldDetails: "Deposit Mode (Percentage / Fixed Amount), Refundable Deposit (₹).",
      },
    ],
    criticalRules: [
      "Rental yield and security deposit formulas set here serve as the baseline default during contract creation; staff can negotiate within authorized limits.",
      "Changes to catalog rental formulas do not retroactively modify existing active contracts.",
    ],
    staffOperationalTip: "Recommend the 12-month tenure tier to customers: it offers a 10% lower monthly rate while providing the business with guaranteed annual cash flow.",
    scopeOfImprovement: [
      "Implement dynamic pricing that automatically lowers monthly rental rates for second-cycle refurbished assets.",
    ],
  },
  {
    id: "bulk-import-catalog",
    intent: "Bulk Import Products, Categories & Master Attributes from Excel",
    category: "pim-products",
    routePrefix: "/admin/products/import",
    actionHref: "/admin/products/import",
    actionLabel: "Bulk Import",
    breadcrumbSteps: ["PIM & Products", "Catalog Import", "Download Standard Template", "Populate Furniture Rows", "Validate & Preview Staging", "Commit to Catalog"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Download Official Excel Template",
        description: "Go to Products > Import. Click 'Download Catalog Template (.xlsx)'. Do not alter column headers.",
        fieldDetails: "Columns: sku, name, item_type, category, hsn_code, gst_rate, base_price, is_rent, is_emi.",
      },
      {
        step: 2,
        title: "Fill Excel Data with Data Validation",
        description: "Input product details. Ensure category names match existing categories or leave blank for auto-creation.",
        fieldDetails: "Product SKU (unique), Name, HSN Code (6-8 digits), Base Price (>0).",
      },
      {
        step: 3,
        title: "Upload & Run Staging Dry-Run",
        description: "Upload the completed file. The system validates all rows and displays an issue report (e.g. duplicate SKUs, invalid tax rates).",
        fieldDetails: "Valid rows count, Invalid rows with error trace, Warnings count.",
      },
      {
        step: 4,
        title: "Commit Staging Rows into Production Catalog",
        description: "Review the summary. Click 'Commit All Valid Products'. Products are instantly searchable and usable across all modules.",
        fieldDetails: "Total records imported, Timestamp, Admin operator.",
      },
    ],
    criticalRules: [
      "Any row with a duplicate SKU will either be rejected or update existing record based on overwrite flag.",
      "Financial fields (base_price, gst_rate) must be positive numerical values.",
    ],
    staffOperationalTip: "Upload batches of 100-200 items at a time to easily review validation errors and spot check sample products.",
    scopeOfImprovement: [
      "Add automated image URL validation in the Excel template to warn if product photo links are broken.",
    ],
  },
  {
    id: "manage-media-brochures",
    intent: "Upload Product Media, 3D AR Assets & Generate Printable Brochures",
    category: "pim-products",
    routePrefix: "/admin/brochures",
    actionHref: "/admin/brochures",
    actionLabel: "Brochure Studio",
    breadcrumbSteps: ["PIM & Products", "Brochures Studio", "Select Product Bundle", "Configure Showroom Pricing & Contact Info", "Generate High-Res PDF Brochure", "Share via WhatsApp / Print"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Select Furniture Collection for Brochure",
        description: "Open Brochures Studio. Select single products or curated bundles (e.g. 'Living Room Elegance 2026 Collection').",
        fieldDetails: "Collection title, Included product SKUs, Cover banner image.",
      },
      {
        step: 2,
        title: "Select Pricing Display Mode",
        description: "Choose whether to display Retail MRP, Monthly Lucky Plan EMI (e.g. ₹1,000/mo), or Monthly Rental Rates (e.g. ₹450/mo).",
        fieldDetails: "Pricing Mode: RETAIL / EMI / RENT / COMBO, Store Contact Details.",
      },
      {
        step: 3,
        title: "Compile & Export High-Resolution PDF",
        description: "Click 'Generate PDF Brochure'. The system compiles vectorized layouts with product specifications, dimensions, QR codes, and showroom address.",
        fieldDetails: "Brochure PDF URL, Download Link, WhatsApp Share Button.",
      },
    ],
    criticalRules: [
      "Only approved and high-resolution images (>800px) will render crisply in printed catalog brochures.",
      "Prices rendered reflect active catalog rules at the time of brochure compilation.",
    ],
    staffOperationalTip: "Send the PDF brochure link to walk-in customers who say 'I will discuss with my family and return tomorrow' so they have a polished catalog at home.",
    scopeOfImprovement: [
      "Include a scannable QR code on each brochure page that opens the customer directly to the WhatsApp inquiry chat for that exact furniture model.",
    ],
  },
  {
    id: "collect-emi",
    intent: "Collect Subscription Advance EMI Installment",
    category: "collections",
    routePrefix: "/admin/collections",
    actionHref: "/admin/finance/collect?workflow=advance-emi",
    actionLabel: "Collect EMI",
    breadcrumbSteps: ["Finance & Collections", "Collect Payment", "Search Customer (Mobile / Lucky ID)", "Select Pending EMI Month", "Pick Payment Method & Drawer Account", "Enter Transaction Ref / UTR", "Post Collection & Digital Receipt", "Send WhatsApp Link"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Customer & Contract Lookup",
        description: "Search by customer mobile number, Lucky ID, or subscription number. The active contract and unpaid schedule months appear.",
        fieldDetails: "Customer Mobile, Lucky ID, Subscription Number.",
      },
      {
        step: 2,
        title: "Select Installment Month",
        description: "Select the pending EMI month (e.g. Month 3). The due amount autofills from backend schedule logic.",
        fieldDetails: "Month Number, Due Date, Installment Amount.",
      },
      {
        step: 3,
        title: "Select Payment Mode & Finance Account",
        description: "Choose Cash Drawer, Bank Transfer, or UPI Settlement Account. For digital payments, input the bank UTR reference number.",
        fieldDetails: "Finance Account (Cash / Bank / UPI), UTR/Transaction Ref, Payment Date.",
      },
      {
        step: 4,
        title: "Confirm & Post Receipt",
        description: "Click 'Post Collection'. Backend marks EMI as Paid, updates draw eligibility, and writes double-entry ledger entry. Click 'WhatsApp' to send receipt link instantly.",
        fieldDetails: "Receipt Document Number, Timestamp, Staff Collector ID.",
      },
    ],
    criticalRules: [
      "Settled payments are append-only; NEVER delete or edit a settled payment row.",
      "Cash collections accumulate in staff cash drawer and must reconcile during End-of-Day Close.",
      "Draw eligibility requires all past and current month EMIs to be fully settled prior to draw date.",
    ],
    staffOperationalTip: "Always verify the UPI Soundbox audio announcement or bank SMS before clicking 'Post Collection' when accepting digital QR payments.",
    scopeOfImprovement: [
      "Enable dynamic QR code generation directly on the POS receipt screen with pre-filled exact EMI amount.",
    ],
  },
  {
    id: "collect-direct-sale",
    intent: "Collect Retail Direct Sale Balance Payment",
    category: "collections",
    routePrefix: "/admin/collections",
    actionHref: "/admin/finance/collect?workflow=direct-sale",
    actionLabel: "Collect Sale Dues",
    breadcrumbSteps: ["Finance & Collections", "Collect Direct Sale", "Search Invoice Number or Customer", "Verify Outstanding Balance", "Select Payment Mode & Finance Account", "Post Collection & Print Receipt"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Lookup Pending Direct Sale Invoice",
        description: "In Collect Payment, switch workflow to 'Direct Sale'. Search by invoice number (INV-XXXXX) or customer name.",
        fieldDetails: "Invoice ID, Invoice Total, Already Paid Amount, Outstanding Balance.",
      },
      {
        step: 2,
        title: "Enter Collection Amount",
        description: "Input amount being paid. Can be full settlement or partial milestone payment. System validates amount <= outstanding balance.",
        fieldDetails: "Payment Amount (₹), Payment Mode (Cash, UPI, Card, Net Banking).",
      },
      {
        step: 3,
        title: "Post & Generate Payment Receipt",
        description: "Click 'Post Collection'. The backend updates the billing invoice balance, clears receivable account, and posts cash journal.",
        fieldDetails: "Receipt Number, Remaining Invoice Balance, Delivery clearance flag.",
      },
    ],
    criticalRules: [
      "Collecting against direct sales requires a valid linked BillingInvoice record.",
      "Receipts reduce CustomerReceivable account balance and credit Cash/Bank accounts in the ledger.",
    ],
    staffOperationalTip: "Print a 3-inch thermal payment receipt and staple it to the customer's original copy of the tax invoice.",
    scopeOfImprovement: [
      "Automatically unlock delivery dispatch order when direct sale invoice balance reaches zero.",
    ],
  },
  {
    id: "collect-advance-deposit",
    intent: "Collect Unapplied Customer Advance Deposit",
    category: "collections",
    routePrefix: "/admin/collections",
    actionHref: "/admin/finance/collect?workflow=customer-advance",
    actionLabel: "Collect Advance",
    breadcrumbSteps: ["Finance & Collections", "Customer Advance", "Search Customer Profile", "Enter Advance Booking Amount", "Select Cash Till / Bank Account", "Post Advance & Issue Booking Voucher"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Identify Customer for Advance Booking",
        description: "Search customer profile. Use when a customer wants to book custom furniture before the final invoice or contract is formally drafted.",
        fieldDetails: "Customer ID, Phone, Customer Name.",
      },
      {
        step: 2,
        title: "Enter Advance Amount & Purpose Note",
        description: "Input advance amount (e.g. ₹5,000 token advance) and descriptive purpose note (e.g. 'Advance for custom 6-seater dining table').",
        fieldDetails: "Advance Amount (₹), Booking Note, Target Product/Scheme.",
      },
      {
        step: 3,
        title: "Post Advance Receipt",
        description: "Click 'Collect Advance'. Creates a CustomerAdvance ledger entry credited to 'Customer Advance Unearned Revenue'. It will be available for 1-click application upon billing.",
        fieldDetails: "Advance Voucher Number, Unapplied Balance.",
      },
    ],
    criticalRules: [
      "Advances are held as unearned liability until applied to a contract installment or sales invoice.",
      "If order is cancelled, advances can be refunded only through the formal refund workflow.",
    ],
    staffOperationalTip: "Always write the tentative delivery date on the advance deposit voucher so the customer knows when workshop production will finish.",
    scopeOfImprovement: [
      "Provide an auto-apply prompt when creating an invoice if the selected customer holds unapplied advance deposits.",
    ],
  },
  {
    id: "bulk-collection-run",
    intent: "Field Agent Batch Collection Run & Bulk Receipting",
    category: "collections",
    routePrefix: "/admin/collections",
    actionHref: "/admin/collections",
    actionLabel: "Bulk Collections",
    breadcrumbSteps: ["Collections & Cashier", "Collections Workspace", "Filter by Route / Field Partner", "Multi-Select Due EMIs", "Input Collected Amounts", "Bulk Post & Issue Batch Settlement Slip"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Filter Due List by Geographic Beat or Partner",
        description: "Open Collections Workspace. Filter by collection agent, route (e.g. Asansol North), or batch due dates.",
        fieldDetails: "Partner / Agent ID, Collection Route, Due Date Range.",
      },
      {
        step: 2,
        title: "Review Collection Sheet & Mark Received",
        description: "Select the customers who paid during the field run. Confirm installment amount or partial amount collected for each customer.",
        fieldDetails: "Customer rows, Mode: Cash / UPI, Total Batch Collected (₹).",
      },
      {
        step: 3,
        title: "Submit Batch for Admin Approval",
        description: "The field agent deposits the physical cash at the central showroom till. Admin clicks 'Approve & Post Batch' to generate official receipts.",
        fieldDetails: "Batch Reference ID, Total Cash Deposited, Verified by Cashier.",
      },
    ],
    criticalRules: [
      "Field partner submissions remain in PENDING state until showroom cashier physically counts and approves cash hand-in.",
      "Individual customer receipts bear timestamp of the actual collection batch approval.",
    ],
    staffOperationalTip: "Field agents can print out the daily route sheet in the morning with customer addresses and phone numbers sorted by locality.",
    scopeOfImprovement: [
      "Introduce GPS geo-tagging on field collections to record doorstep receipt coordinates.",
    ],
  },
  {
    id: "reverse-erroneous-payment",
    intent: "Void / Reverse an Erroneous Payment Receipt with Audit Reason",
    category: "collections",
    routePrefix: "/admin/finance/reversal-control",
    actionHref: "/admin/finance/reversal-control",
    actionLabel: "Reversal Control",
    breadcrumbSteps: ["Collections & Cashier", "Reversal Control", "Locate Erroneous Receipt", "Select Reversal Reason", "Supervisor Authorisation PIN", "Post Append-Only Counter-Entry"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Locate Payment Entry",
        description: "Open Reversal Control. Search by receipt number (REC-XXXXX) or payment ID. Verify original transaction details.",
        fieldDetails: "Payment ID, Customer Name, Amount (₹), Original Date, Cashier.",
      },
      {
        step: 2,
        title: "Select Formal Audit Reason",
        description: "Choose standard audit reason: WRONG_AMOUNT, WRONG_CUSTOMER, BOUNCED_CHEQUE, DUPLICATE_ENTRY, or CASHIER_TYPO.",
        fieldDetails: "Reason Category, Detailed Narrative Explanation (minimum 15 characters).",
      },
      {
        step: 3,
        title: "Post Reversal Journal Entry",
        description: "Click 'Execute Reversal'. The system creates a balanced reversal journal entry, re-opens the unpaid EMI status, and logs the acting admin user.",
        fieldDetails: "Reversal Journal Ref, Re-opened EMI ID, Timestamp.",
      },
    ],
    criticalRules: [
      "Never delete or mutate the original payment row. All reversals are strictly append-only counter-entries.",
      "Reversing an EMI payment removes draw eligibility for that month if the draw hasn't occurred yet.",
      "If the customer already won a draw, associated settled payments CANNOT be reversed.",
    ],
    staffOperationalTip: "Before reversing, photocopy or scan the voided physical receipt and write 'CANCELLED - WRONG ENTRY' in bold marker across the slip.",
    scopeOfImprovement: [
      "Send automatic SMS notification to the customer informing them that receipt #REC-XXXX was corrected.",
    ],
  },
  {
    id: "reconcile-bank-upi-settlements",
    intent: "Bank Statement & UPI Settlement Reconciliation",
    category: "collections",
    routePrefix: "/admin/accounting/bridge-reconciliation",
    actionHref: "/admin/accounting/bridge-reconciliation",
    actionLabel: "Reconciliation",
    breadcrumbSteps: ["Collections & Cashier", "Settlement Reconciliation", "Import Bank / UPI Settlement CSV", "Auto-Match by UTR / Transaction Ref", "Investigate Unmatched Items", "Confirm Ledger Sign-Off"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Upload Bank or Razorpay / Paytm Settlement File",
        description: "Open Bridge Reconciliation. Upload your daily bank statement (.csv/.xlsx) or UPI QR aggregator settlement file.",
        fieldDetails: "Settlement File (.csv), Bank Account (SBI / HDFC / ICICI), Statement Date Range.",
      },
      {
        step: 2,
        title: "Run Automated Rule-Based Matching",
        description: "Click 'Run Auto-Reconciliation'. The algorithm matches UTR reference numbers, exact amounts, and timestamps against system receipts.",
        fieldDetails: "Matched items count, Unmatched credits, Unmatched debits.",
      },
      {
        step: 3,
        title: "Resolve Exceptions & Sign-Off",
        description: "For unmatched payments, link them to pending customer direct sales or unapplied advances. Click 'Sign-Off Settlement'.",
        fieldDetails: "Manual Match Resolution, Sign-off timestamp, Variance notes.",
      },
    ],
    criticalRules: [
      "Reconciliation ledger balances must dynamically roll up mapped settlement accounts.",
      "No cosmetic test data is allowed in bank reconciliation tables.",
    ],
    staffOperationalTip: "Always ensure the cashier inputs the last 6 digits of the bank UTR reference when collecting UPI payments to guarantee 100% auto-match rate.",
    scopeOfImprovement: [
      "Direct API integration with bank Open Banking webhooks for real-time instantaneous reconciliation.",
    ],
  },
  {
    id: "release-security-deposit",
    intent: "Customer Security Deposit Refund & Settlement Release",
    category: "collections",
    routePrefix: "/admin/finance/refunds",
    actionHref: "/admin/finance/refunds",
    actionLabel: "Deposit Refund",
    breadcrumbSteps: ["Collections & Cashier", "Refunds & Deposits", "Locate Completed Contract", "Verify Furniture Return Inspection", "Deduct Damage Charges (if any)", "Issue Bank Payout / Cash Refund"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Locate Expired or Terminated Contract",
        description: "Open Refunds & Deposits. Search contract number. The system displays the original security deposit held in trust (e.g. ₹6,000).",
        fieldDetails: "Contract ID, Customer Name, Initial Deposit Held (₹).",
      },
      {
        step: 2,
        title: "Review Return Inspection Report",
        description: "Verify that all rented furniture items have been picked up and inspected by warehouse technicians.",
        fieldDetails: "Inspection Job Ref, Damage Assessment Amount (₹), Unpaid Dues Offset (₹).",
      },
      {
        step: 3,
        title: "Calculate Net Refund Payable",
        description: "Net Refund = Held Deposit - Assessed Damage - Pending Monthly Rent. Enter customer's bank account or UPI VPA for payout.",
        fieldDetails: "Net Refund (₹), Customer Bank Account / UPI VPA, IFSC Code.",
      },
      {
        step: 4,
        title: "Post Refund & Close Contract",
        description: "Click 'Approve & Release Refund'. Posts debit to Security Deposit Liability account and credit to Bank account. Send confirmation SMS.",
        fieldDetails: "Refund Voucher Number, Payment UTR, Contract Closure Flag.",
      },
    ],
    criticalRules: [
      "Security deposits cannot be refunded until all furniture items under the contract are accounted for or declared written off.",
      "Damage deductions must have an accompanying photo inspection report on file.",
    ],
    staffOperationalTip: "When picking up rental items, have the customer sign the handover inspection checklist in person to prevent deposit deduction disputes later.",
    scopeOfImprovement: [
      "Integrate automated instant UPI refund payout directly from the dashboard via connected banking API.",
    ],
  },
  {
    id: "create-contract",
    intent: "Make a Lucky Plan Advance EMI Contract",
    category: "sales-contracts",
    routePrefix: "/admin/subscriptions",
    actionHref: "/admin/subscriptions/advance-emi/create",
    actionLabel: "New Contract",
    breadcrumbSteps: ["Subscriptions", "Create Contract", "Customer Search / KYC", "Select Batch & Product", "Allocate Lucky ID", "Preview Schedule", "Activate Contract"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Customer Identification",
        description: "Search customer by 10-digit mobile number or Aadhaar. If first-time visitor, quick-create profile with primary phone and address.",
        fieldDetails: "Customer Name, Mobile, Address, Initial KYC document.",
      },
      {
        step: 2,
        title: "Select Active Batch & Product Model",
        description: "Choose an active enrollment batch (e.g. Diwali Bonanza 2026). Select the enrolled furniture product. Tenure (e.g. 10 or 12 months) and monthly installment (e.g. ₹1,000/mo) autofill from batch rules.",
        fieldDetails: "Batch ID, Product SKU, Tenure (months), Installment amount.",
      },
      {
        step: 3,
        title: "Validate & Allocate Lucky ID",
        description: "System verifies available Lucky IDs within the batch and assigns a unique, immutable number to this contract.",
        fieldDetails: "Lucky ID Token (strictly unique per product/batch scope).",
      },
      {
        step: 4,
        title: "Deterministic Schedule Generation & Activation",
        description: "Review generated schedule dates and amounts. Click 'Activate Contract'. The first installment is immediately collectible.",
        fieldDetails: "Schedule table: Month 1 to Month N, due dates, installment amounts.",
      },
    ],
    criticalRules: [
      "Lucky ID uniqueness is strictly enforced per product and batch scope; duplicate tokens are blocked.",
      "The sum of all schedule EMIs must equal the exact total contract amount.",
      "Winning a monthly draw waives future unpaid EMIs only; settled payments are never altered.",
    ],
    staffOperationalTip: "Explain clearly to the customer that their unique Lucky ID will enter the monthly live draw only if their EMI is paid before the draw cutoff date.",
    scopeOfImprovement: [
      "Print a wallet-sized laminated Lucky ID membership card with QR code for easy scanning at the cashier desk.",
    ],
  },
  {
    id: "create-rent-lease-package",
    intent: "Create a Multi-Product Rental or Lease Contract with Custom Yield & Deposit",
    category: "sales-contracts",
    routePrefix: "/admin/subscriptions",
    actionHref: "/admin/subscriptions/rent/create",
    actionLabel: "New Rent/Lease Contract",
    breadcrumbSteps: ["Subscriptions", "Create Contract", "Select RENT or LEASE Plan", "Customer & KYC Check", "Attach Furniture Items to Basket", "Customize Per-Product Yield & Deposit", "Review Aggregate Terms & Activate"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Select Plan Type & Customer",
        description: "Choose RENT (furniture rental) or LEASE (operating lease with optional buyout). Search customer by mobile number. Verify KYC readiness.",
        fieldDetails: "Plan Type: RENT / LEASE, Customer profile, KYC status (VERIFIED or attach ID).",
      },
      {
        step: 2,
        title: "Attach Multiple Furniture Products to Basket",
        description: "In Step 1, click '+ Add Another Product' to assemble a room package (e.g. Double Bed + 2 Mattresses + Center Table) under a single contract.",
        fieldDetails: "Product search, selection, quantity increment/decrement, line base price.",
      },
      {
        step: 3,
        title: "Manually Configure Product-Specific Yield Rate & Security Deposit",
        description: "For each product line in the basket, adjust the Yield Rate (%) and Security Deposit (%) individually. The table automatically calculates the line monthly dues and line deposit share.",
        fieldDetails: "Per-product Yield %, Per-product Deposit %, Line Monthly Dues, Line Deposit Share.",
      },
      {
        step: 4,
        title: "Review Aggregate Commercial Terms & Activate / Save Draft",
        description: "Verify the contract's aggregate product value, total monthly installment, and total security deposit. If customer documents are ready, click 'Activate Contract'; if awaiting document signature, click 'Save as Draft'.",
        fieldDetails: "Tenure months, Start date, Total Monthly Rent, Total Security Deposit, Effective Deposit %.",
      },
    ],
    criticalRules: [
      "Rental/Lease packages allow attaching multiple furniture items under one unified customer contract.",
      "Lucky Plan Advance EMI remains strictly isolated: 1 contract = 1 product = 1 Lucky ID.",
      "Security deposit and monthly rent demands are strictly derived from itemized product line calculations.",
    ],
    staffOperationalTip: "Group room packages together (e.g. 'Complete Bedroom Set') to offer a bundled 5% discount on the total monthly rental installment.",
    scopeOfImprovement: [
      "Include pre-configured package templates (1BHK Package, Executive Home Office Package) to assemble baskets in 1 click.",
    ],
  },
  {
    id: "create-direct-sale",
    intent: "Create a Direct Retail Sale & POS Tax Invoice",
    category: "sales-contracts",
    routePrefix: "/admin/billing",
    actionHref: "/admin/billing/direct-sale/create",
    actionLabel: "New Direct Sale",
    breadcrumbSteps: ["Sales & Billing", "Direct Sales", "Create Direct Sale", "Select Customer", "Add Products & Quantities", "Apply Taxes & Discounts", "Approve & Post Invoice", "POS Payment / Receipt"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Select Customer & Sales Desk",
        description: "Open Sales & Billing > Direct Sales > Create Direct Sale. Pick customer from CRM master.",
        fieldDetails: "Customer profile, billing address, sales executive.",
      },
      {
        step: 2,
        title: "Add Product Line Items",
        description: "Search items from product catalog. Enter quantity, unit price, and discount percentage or flat reduction. GST rates apply automatically from HSN.",
        fieldDetails: "Product Code, Qty, Unit Price, Discount, HSN Tax Rate (e.g. 18%).",
      },
      {
        step: 3,
        title: "Approve & Post Tax Invoice",
        description: "Click 'Approve Invoice' then 'Post Invoice'. Posting books the `RETAIL_SALE` accounting journal entry and registers inventory stock movement.",
        fieldDetails: "Invoice Number (INV-XXXXX), Invoice Date, Net Payable.",
      },
      {
        step: 4,
        title: "Collect Payment & Dispatch Receipt",
        description: "Collect full payment or down payment immediately via Cash, UPI, or Card. Print tax invoice and share digital copy via WhatsApp.",
        fieldDetails: "Receipt document, Payment Mode, UTR reference.",
      },
    ],
    criticalRules: [
      "Direct retail sales and Lucky Plan subscriptions are separate source entities; do not mix POS items with EMI schedules.",
      "Invoices once posted cannot be deleted; cancellations require an explicit reversal and credit note.",
      "Stock availability (ATP) is checked; insufficient stock warns operator or creates a purchase requirement.",
    ],
    staffOperationalTip: "Always verify customer's GSTIN if they request a business B2B invoice so ITC credit passes correctly to their GST portal.",
    scopeOfImprovement: [
      "Enable barcode barcode scanner support to scan furniture tags directly into invoice line items.",
    ],
  },
  {
    id: "amend-subscription-contract",
    intent: "Handle Contract Amendment, Product Swap or Restructure",
    category: "sales-contracts",
    routePrefix: "/admin/contract-amendments",
    actionHref: "/admin/contract-amendments/new",
    actionLabel: "Amend Contract",
    breadcrumbSteps: ["Subscriptions", "Contract Amendments", "Select Active Subscription", "Choose Amendment Action", "Adjust Schedule or Swap Product", "Review Financial Differential", "Execute & Issue Addendum"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Search Active Contract",
        description: "Go to Subscriptions > Contract Amendments > New Amendment. Enter contract number or customer mobile.",
        fieldDetails: "Contract ID, Customer Name, Current Status (ACTIVE).",
      },
      {
        step: 2,
        title: "Select Amendment Reason & Type",
        description: "Select type: PRODUCT_SWAP (customer wants to upgrade bed), TENURE_EXTENSION (extend rental period), or RESTRUCTURE.",
        fieldDetails: "Amendment Type, Effective Date, Reason Narrative.",
      },
      {
        step: 3,
        title: "Recalculate Schedule & Differential",
        description: "System calculates any price difference in monthly rent or security deposit. Any additional deposit required must be collected.",
        fieldDetails: "New Monthly Rent (₹), Additional Deposit Required (₹), Updated Tenure.",
      },
      {
        step: 4,
        title: "Sign-Off & Issue Legal Addendum",
        description: "Click 'Execute Amendment'. Prints legal addendum document to be signed by customer.",
        fieldDetails: "Addendum Reference, Signed Document Upload.",
      },
    ],
    criticalRules: [
      "Settled payments are never modified; only future schedule obligations adjust.",
      "Lucky ID cannot be changed mid-contract for Lucky Plan subscriptions without batch admin authorization.",
    ],
    staffOperationalTip: "When swapping furniture, ensure the pickup of the old furniture and delivery of the new item are scheduled on the same truck trip.",
    scopeOfImprovement: [
      "Provide customer digital OTP signature on the addendum document via SMS.",
    ],
  },
  {
    id: "early-buyout-prepayment",
    intent: "Process Prepayment, Foreclosure & Early Buyout Settlement",
    category: "sales-contracts",
    routePrefix: "/admin/subscriptions",
    actionHref: "/admin/subscriptions",
    actionLabel: "Early Buyout",
    breadcrumbSteps: ["Sales & Contracts", "Subscriptions Master", "Select Active Contract", "Prepayment Calculator", "Calculate Buyout Residual Value", "Apply Foreclosure Discount", "Collect Settlement & Transfer Ownership"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Open Subscription Prepayment Calculator",
        description: "Open subscription detail. Click 'Prepayment / Early Buyout Calculator'. The tool loads remaining unbilled EMIs and depreciated asset book value.",
        fieldDetails: "Contract ID, Unpaid Months, Total Remaining Balance, Held Security Deposit.",
      },
      {
        step: 2,
        title: "Calculate Net Buyout Settlement Amount",
        description: "For LEASE contracts, Net Settlement = Residual Buyout Price - Held Security Deposit. For EMI plans, early payment may grant an authorized rebate.",
        fieldDetails: "Residual Buyout Price (₹), Held Deposit Offset (-₹), Net Payable (₹).",
      },
      {
        step: 3,
        title: "Post Settlement Collection & Close Contract",
        description: "Collect the net settlement amount via Cash/Bank. Click 'Finalize Buyout'. The contract status transitions to COMPLETED / BOUGHT_OUT.",
        fieldDetails: "Settlement Receipt Number, Asset Ownership Transfer Certificate.",
      },
    ],
    criticalRules: [
      "Held security deposit is automatically offset against the buyout invoice amount.",
      "Asset status transitions from 'ON_HIRE' to 'SOLD' in the fixed asset register.",
    ],
    staffOperationalTip: "Encourage long-term rental customers at Month 10 of a 12-month lease to use the buyout option; they can own the furniture for just 1-2 months additional rent.",
    scopeOfImprovement: [
      "Automate generation of a formal 'Transfer of Ownership & Warranty Certificate' PDF upon buyout closure.",
    ],
  },
  {
    id: "contract-cancellation-default",
    intent: "Process Contract Termination, Default Forfeiture & Asset Recovery",
    category: "sales-contracts",
    routePrefix: "/admin/defaulters",
    actionHref: "/admin/defaulters",
    actionLabel: "Default Recovery",
    breadcrumbSteps: ["Sales & Contracts", "Defaulter Escalation", "Review Overdue Aging (>90 Days)", "Issue Legal Notice / Notice of Termination", "Dispatch Asset Repossession Team", "Forfeit Deposit & Close Contract"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Review Defaulter Account Status",
        description: "In Defaulter Watchlist, locate contracts with >90 days unpaid installments. Verify communication history and failed promises-to-pay.",
        fieldDetails: "Customer ID, Total Overdue (₹), Days Overdue, Outstanding Deposit.",
      },
      {
        step: 2,
        title: "Issue Formal Demand & Termination Notice",
        description: "Click 'Generate Legal Notice'. Sends registered postal notice and WhatsApp legal intimation granting a 7-day final cure period.",
        fieldDetails: "Notice Reference, Dispatch Date, Cure Period Expiry Date.",
      },
      {
        step: 3,
        title: "Authorize Repossession Trip",
        description: "If uncured, click 'Authorize Repossession'. Creates a pickup task for the logistics team with local police/security escort details.",
        fieldDetails: "Repossession Officer, Truck Vehicle No, Address of Recovery.",
      },
      {
        step: 4,
        title: "Forfeit Security Deposit & Post Bad Debt",
        description: "Upon physical recovery of the furniture, offset held deposit against unpaid dues. Any unrecoverable balance books to Bad Debt Expense.",
        fieldDetails: "Forfeited Deposit (₹), Net Bad Debt Write-off (₹), Contract Terminated status.",
      },
    ],
    criticalRules: [
      "Repossession must comply with state retail guidelines; customer must be provided formal itemized recovery receipt.",
      "Deposit forfeiture triggers a formal double-entry journal: Debit Deposit Liability, Credit Advance Forfeiture Income.",
    ],
    staffOperationalTip: "Always offer a restructure plan (lower monthly dues over longer tenure) before resorting to physical repossession; voluntary settlements have 3x higher recovery value.",
    scopeOfImprovement: [
      "Create automated risk scoring that flags high-risk contracts after the very first missed installment.",
    ],
  },
  {
    id: "manage-out-of-state-customer",
    intent: "Setup Out-of-State Customer Rental with Permanent Proof & Local Delivery Address",
    category: "sales-contracts",
    routePrefix: "/admin/customers",
    actionHref: "/admin/customers/create",
    actionLabel: "Out-of-State Setup",
    breadcrumbSteps: ["Sales & Contracts", "Customer Management", "Create Customer Profile", "Attach Permanent Address (Aadhaar / Voter ID)", "Attach Local Delivery Address (Rent Agreement / Utility Bill)", "Capture Local Employer / Guarantor Details", "Approve Elevated Security Deposit Tier"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Record Permanent Identity & Domicile Address",
        description: "Open Customers > Create Customer. Enter customer's official permanent address from Aadhaar or Voter ID card (e.g. Bihar, Jharkhand, Odisha).",
        fieldDetails: "Permanent Address, State, PIN Code, ID Proof Type (Aadhaar/Passport).",
      },
      {
        step: 2,
        title: "Add Local Residence & Delivery Address",
        description: "In the Address section, uncheck 'Delivery address same as permanent'. Enter the local rented flat / company quarters address where furniture will be placed.",
        fieldDetails: "Local Delivery Address, Local Landlord Name, Local Tenancy Agreement Copy.",
      },
      {
        step: 3,
        title: "Capture Local Office or Local Guarantor",
        description: "For out-of-state migrant professionals or students, record their local company employment ID or add a local guarantor with verified KYC.",
        fieldDetails: "Employer Name, Employee Badge ID, Local Guarantor Phone & Address.",
      },
      {
        step: 4,
        title: "Apply Out-of-State Risk Matrix & Deposit",
        description: "Apply standard policy: Out-of-state customers require 1 additional month of refundable security deposit (e.g. 25% instead of 15%) for loss prevention.",
        fieldDetails: "Security Deposit Tier, KYC Verification Approval, Approved by Admin.",
      },
    ],
    criticalRules: [
      "Delivery dispatch order CANNOT be authorized if local delivery address proof (rent agreement or electricity bill) is missing.",
      "The contract document must clearly display BOTH the customer's permanent domicile address and the delivery site address.",
    ],
    staffOperationalTip: "Ask out-of-state tenants for a photo of their company ID card or college ID; corporate/institutional backing significantly reduces default risk.",
    scopeOfImprovement: [
      "Add automated digital rent agreement verification via OCR to extract landlord name and tenancy expiry date.",
    ],
  },
  {
    id: "create-bom",
    intent: "Define a Bill of Materials (BOM) Formula for Furniture Assembly",
    category: "manufacturing",
    routePrefix: "/admin/manufacturing",
    actionHref: "/admin/manufacturing/boms",
    actionLabel: "Create BOM",
    breadcrumbSteps: ["Manufacturing & BOM", "BOM Master", "Create BOM Formula", "Select Finished Good Model", "Add Raw Materials (Wood, Foam, Fabric)", "Add Hardware & Accessories", "Define Standard Labor Hours & Cost", "Approve & Freeze BOM Revision"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Select Target Finished Good Model",
        description: "Open Manufacturing > BOMs > Create BOM. Pick the target finished product (e.g. 'Royal Teak 3-Seater Sofa').",
        fieldDetails: "Finished Good SKU, BOM Code (e.g. BOM-SOFA-3S-V1), Revision Number.",
      },
      {
        step: 2,
        title: "Add Raw Material Component Lines",
        description: "Specify raw materials required per unit: Teak Wood Plank (cft), High-Density Foam (sq ft), Velvet Upholstery Fabric (meters), Wood Primer/Polish (liters).",
        fieldDetails: "Raw Material SKU, Consumption Quantity, Unit of Measure (UOM), Scrap/Wastage %.",
      },
      {
        step: 3,
        title: "Add Fasteners & Hardware Accessories",
        description: "Add structural hardware: Screws, SS Legs, Heavy-Duty Webbing, Adhesive, Drawer Sliders.",
        fieldDetails: "Accessory SKU, Count per unit.",
      },
      {
        step: 4,
        title: "Estimate Standard Labor Allocation",
        description: "Input expected carpenter labor (hours), polish technician labor, and upholstery stitching labor with standard hourly rates.",
        fieldDetails: "Labor Operation, Estimated Hours, Standard Rate/Hour.",
      },
    ],
    criticalRules: [
      "Every raw material component must already exist in PIM with Item Type = RAW_MATERIAL or ACCESSORY.",
      "Total estimated unit cost rolls up dynamically from current stock valuation of raw materials plus estimated labor.",
      "Freezing a BOM revision protects historical production job accounting from unannounced formula changes.",
    ],
    staffOperationalTip: "Include a 5% wastage allowance for wood cut-offs and fabric edges; furniture carpentry always has trimming waste.",
    scopeOfImprovement: [
      "Add an auto-BOM suggestion tool that analyzes past production batches to propose optimal material quantities.",
    ],
  },
  {
    id: "run-production-job",
    intent: "Start a Workshop Production Job & Record Labor",
    category: "manufacturing",
    routePrefix: "/admin/manufacturing",
    actionHref: "/admin/manufacturing/jobs",
    actionLabel: "Production Jobs",
    breadcrumbSteps: ["Manufacturing & BOM", "Production Jobs", "New Job Order", "Select Frozen BOM & Batch Quantity", "Check Raw Material Availability", "Issue Materials to Workshop WIP", "Track Assembly Milestones", "Post Labor Accrual"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Create Production Job Order",
        description: "Go to Manufacturing > Production Jobs > Create Job. Select the target product, the active BOM, and the number of units to produce (e.g. 5 Dining Tables).",
        fieldDetails: "Job Order Number, Target Product, Quantity to Produce, Planned Completion Date.",
      },
      {
        step: 2,
        title: "Verify Raw Material Stock Availability",
        description: "The system runs a bill-of-materials shortage check against current warehouse inventory. If stock is insufficient, a purchase requirement is triggered.",
        fieldDetails: "Required vs In-Stock quantities for each BOM component line.",
      },
      {
        step: 3,
        title: "Issue Materials & Transfer to WIP",
        description: "Click 'Issue Materials'. The raw materials are deducted from Central Warehouse and debited to 'Work In Progress (WIP)' inventory asset account.",
        fieldDetails: "Material Issue Note Number, Transfer Timestamp.",
      },
      {
        step: 4,
        title: "Record Production Labor Lines",
        description: "Throughout assembly, record carpenter and polisher work logs. System books `manufacturing_labor_accrual` (Credit Salary Payable, Debit WIP).",
        fieldDetails: "Employee, Operation, Hours / Piece Count, Labor Amount (₹).",
      },
    ],
    criticalRules: [
      "Manufacturing labor must be aggregated using ProductionLaborLine before a job can be marked completed.",
      "Material issue is irreversible once physical cutting begins; unused materials require an explicit return-to-stores slip.",
    ],
    staffOperationalTip: "Issue job order cards with large bold numbers to workshop carpenters so they can tag physical timber stacks.",
    scopeOfImprovement: [
      "Mount a tablet in the workshop where carpenters can tap their photo to log completed pieces in real-time.",
    ],
  },
  {
    id: "issue-workshop-materials",
    intent: "Issue Raw Materials & Hardware from Warehouse to Production WIP",
    category: "manufacturing",
    routePrefix: "/admin/inventory",
    actionHref: "/admin/inventory/raw-materials",
    actionLabel: "Material Issue",
    breadcrumbSteps: ["Manufacturing & BOM", "Workshop Operations", "Select Active Production Job", "Material Issue Request", "Warehouse Stock Dispatch", "Debit WIP / Credit Raw Material Stock"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Load Production Job Material Demand",
        description: "Open Raw Materials inventory. Filter by pending job orders. Select the job to view required wood, plywood, foam, and hardware.",
        fieldDetails: "Job Order Ref, Material Demand List, Current Warehouse Stock.",
      },
      {
        step: 2,
        title: "Verify Physical Picking & Lot Numbers",
        description: "Storekeeper physically picks timber lots and hardware boxes. Input lot numbers or batch barcodes.",
        fieldDetails: "Picked Quantity, Lot ID, Location Bin (e.g. Wood Rack B-3).",
      },
      {
        step: 3,
        title: "Confirm Dispatch & Post Inventory Ledger",
        description: "Click 'Confirm Material Issue'. System posts credit to Raw Materials Stock Asset and debit to WIP Inventory.",
        fieldDetails: "Material Issue Slip (MIS-XXXXX), Storekeeper Signature.",
      },
    ],
    criticalRules: [
      "Materials cannot be issued if physical stock is negative or blocked by pending audit.",
      "Excess material issued beyond BOM formula requires foreman explanation note.",
    ],
    staffOperationalTip: "Store raw hardware (screws, brackets) in pre-counted kit bags matching 1 unit of furniture to eliminate warehouse counting delays.",
    scopeOfImprovement: [
      "Implement barcode scanning on timber planks during issue to track timber moisture and grain grade.",
    ],
  },
  {
    id: "complete-production-job",
    intent: "Finalize Production Job, Quality Inspection & FG Stock Receipt",
    category: "manufacturing",
    routePrefix: "/admin/manufacturing",
    actionHref: "/admin/manufacturing/jobs",
    actionLabel: "Complete Job",
    breadcrumbSteps: ["Manufacturing & BOM", "Production Jobs", "Select Assembled Job", "Quality Assurance (QA) Checklist", "Confirm Finished Goods Quantity", "Capitalize WIP into Finished Goods Stock", "Generate Barcode Asset Tags"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Perform Quality Inspection (QA)",
        description: "Inspect completed furniture: check joint stability, polish smoothness, upholstery stitching, and dimensional tolerances.",
        fieldDetails: "QA Inspector, Pass/Fail Checklist, Defect notes.",
      },
      {
        step: 2,
        title: "Record Output Quantities & Scrap",
        description: "Enter number of finished good units meeting quality grade (e.g. 5 units passed, 0 rejected). Record any scrap generated.",
        fieldDetails: "Accepted Units, Scrap Value (₹), Completion Date.",
      },
      {
        step: 3,
        title: "Finalize Job Cost & Post Capitalization",
        description: "System calculates final unit cost = (Total Materials Issued + Total Labor Booked) / Accepted Units. Debits Finished Goods Asset and clears WIP.",
        fieldDetails: "Calculated Cost Per Unit (₹), Total Capitalized Value (₹), Job Completed status.",
      },
      {
        step: 4,
        title: "Affix Barcode Stickers & Move to Showroom",
        description: "Print adhesive barcode tags for each completed unit and transfer items to Showroom Floor or Ready-for-Dispatch warehouse bay.",
        fieldDetails: "Generated Item Serial Codes, Destination Warehouse Location.",
      },
    ],
    criticalRules: [
      "Production job CANNOT be completed until all associated labor lines are fully posted.",
      "The capitalized finished good unit cost becomes the standard inventory valuation basis for sales margin calculations.",
    ],
    staffOperationalTip: "Take a photo of each completed custom piece under good showroom lighting before wrapping it; this photo can be sent to the customer immediately.",
    scopeOfImprovement: [
      "Add automated calculation of factory overhead absorption rate (electricity, workshop rent) into final unit cost.",
    ],
  },
  {
    id: "book-piece-rate-labor",
    intent: "Record Worker Piece-Rate / Hourly Production Labor Lines",
    category: "manufacturing",
    routePrefix: "/admin/manufacturing",
    actionHref: "/admin/manufacturing",
    actionLabel: "Book Labor",
    breadcrumbSteps: ["Manufacturing & BOM", "Labor Tracking", "Select Active Job Order", "Select Carpenter / Artisan", "Input Completed Operations & Count", "Calculate Labor Earnings", "Post Labor Accrual"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Select Production Job & Artisan",
        description: "Open Labor Booking. Select the job order and choose the worker from the staff directory (e.g. Master Carpenter Ramesh).",
        fieldDetails: "Job ID, Employee Name / Artisan ID, Date of Work.",
      },
      {
        step: 2,
        title: "Log Operation & Piece Count",
        description: "Select the completed operation: Frame Assembly (Piece Rate: ₹400/frame), Cushioning (₹250/seat), or PU Polishing (₹600/table). Enter completed count.",
        fieldDetails: "Operation Type, Rate Type (Piece Rate / Hourly), Quantity Completed, Rate (₹).",
      },
      {
        step: 3,
        title: "Review & Accrue Labor Expense",
        description: "Click 'Post Labor Line'. System logs the piece rate onto the worker's monthly wage ledger and debits the job's WIP cost.",
        fieldDetails: "Total Labor Line (₹), Supervisor Approval PIN.",
      },
    ],
    criticalRules: [
      "Unposted ProductionLaborLine records are automatically pulled into the employee's monthly salary sheet generation.",
      "Labor piece-rate rates must match the authorized master labor rate card.",
    ],
    staffOperationalTip: "Enter labor lines at the end of each evening shift so workers can verify their daily piece-rate earnings on the workshop notice board.",
    scopeOfImprovement: [
      "Provide workers with an SMS summary of their daily verified piece-work earnings.",
    ],
  },
  {
    id: "count-opening-stock",
    intent: "Initialize or Count Opening Stock for All Warehouses",
    category: "inventory",
    routePrefix: "/admin/inventory",
    actionHref: "/admin/inventory/opening-stock",
    actionLabel: "Opening Stock",
    breadcrumbSteps: ["Inventory & Stock", "Opening Stock Register", "Select Warehouse Location", "Download Count Sheet", "Enter Physical Count & Unit Cost", "Apply & Lock Opening Balance"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Select Warehouse or Showroom Store",
        description: "Open Inventory > Opening Stock. Select the target location (Main Warehouse, Showroom Floor, Raw Timber Yard).",
        fieldDetails: "Warehouse Location, Inventory Valuation Method (FIFO / Weighted Average).",
      },
      {
        step: 2,
        title: "Download Count Sheet or Add Line Items",
        description: "Export the blank stock-take sheet or add lines directly: select product SKU, enter physical quantity on hand, and landed unit cost.",
        fieldDetails: "Product SKU, Quantity, Unit Landed Cost (₹), Line Total Valuation (₹).",
      },
      {
        step: 3,
        title: "Review Total Inventory Capitalization",
        description: "Verify aggregate inventory value. System prepares double-entry journal: Debit Inventory Asset, Credit Opening Stock Equity/Liability.",
        fieldDetails: "Total Items Count, Total Capitalized Valuation (₹).",
      },
      {
        step: 4,
        title: "Apply Opening Stock & Lock",
        description: "Click 'Post & Lock Opening Stock'. Stock levels become live and immediately available for sales, deliveries, and rental contracts.",
        fieldDetails: "Ledger Batch ID, Lock Timestamp, Admin Signature.",
      },
    ],
    criticalRules: [
      "Opening stock can only be applied ONCE per warehouse location during initial setup.",
      "Unit cost must be realistic landed cost; zero-cost opening inventory corrupts gross profit margin calculations.",
    ],
    staffOperationalTip: "Perform physical stock counts in pairs: one staff member calls out the count while the second staff member inputs the values on the screen.",
    scopeOfImprovement: [
      "Support barcode scan counting on mobile devices during opening stock intake.",
    ],
  },
  {
    id: "adjust-stock",
    intent: "Perform a Stock Adjustment (Audit Variance, Scrap or Damage)",
    category: "inventory",
    routePrefix: "/admin/inventory",
    actionHref: "/admin/inventory/adjustments",
    actionLabel: "Adjust Stock",
    breadcrumbSteps: ["Inventory & Stock", "Stock Adjustments", "Create Adjustment Note", "Select Location & Product SKU", "Enter Adjustment Quantity (+ / -)", "Select Audit Reason & Unit Cost", "Post Adjustment & Update Ledger"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Initiate Stock Adjustment",
        description: "Navigate to Inventory > Stock Adjustments > Create Adjustment. Select the affected store or warehouse.",
        fieldDetails: "Location, Adjustment Date, Responsible Storekeeper.",
      },
      {
        step: 2,
        title: "Select Product & Adjustment Direction",
        description: "Search product SKU. Choose adjustment type: INCREASE (found inventory, unrecorded return) or DECREASE (damage, termite loss, theft, scrap).",
        fieldDetails: "Product SKU, Adjustment Direction (+/-), Adjustment Qty, Unit Cost (₹).",
      },
      {
        step: 3,
        title: "Document Mandatory Reason Code",
        description: "Select standardized reason: PHYSICAL_AUDIT_VARIANCE, TRANSIT_DAMAGE, SHOWROOM_DISPLAY_WEAR, SCRAP_WRITE_OFF.",
        fieldDetails: "Reason Code, Detailed Narrative (minimum 15 characters).",
      },
      {
        step: 4,
        title: "Post Adjustment to Stock Ledger",
        description: "Click 'Post Adjustment'. Updates on-hand quantities immediately and writes balanced accounting entry to 'Inventory Shrinkage / Damage Expense'.",
        fieldDetails: "Adjustment Slip No, Accounting Journal Ref.",
      },
    ],
    criticalRules: [
      "Stock adjustments cannot be deleted once posted; corrections require a subsequent adjustment note.",
      "Negative adjustments must be authorized by an admin supervisor with elevated permissions.",
    ],
    staffOperationalTip: "For transit damage, take 3 clear photos of the damaged furniture piece and upload them before posting the negative adjustment.",
    scopeOfImprovement: [
      "Automate insurance claim draft generation whenever damage write-offs exceed ₹10,000.",
    ],
  },
  {
    id: "rental-asset-lifecycle",
    intent: "Register Rental Asset Codes & Track Lifecycle (Available, Reserved, On-Hire, Retired)",
    category: "inventory",
    routePrefix: "/admin/rent-lease",
    actionHref: "/admin/rent-lease/assets",
    actionLabel: "Rental Assets",
    breadcrumbSteps: ["Inventory & Stock", "Rental Asset Register", "Tag Physical Asset Serial / Code", "Assign Asset Condition Grade", "Monitor Status (AVAILABLE, ON_HIRE, IN_SERVICE)", "Track Cumulative Rental Revenue", "Retire or Liquidate Asset"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Tag Physical Asset Serial Code",
        description: "Open Rental & Lease Assets. When a new furniture item is placed into the rental pool, assign a physical asset tag code (e.g. AST-BED-0042).",
        fieldDetails: "Asset Code, Master Product SKU, Initial Acquisition Cost (₹), Date Put in Service.",
      },
      {
        step: 2,
        title: "Track Real-Time Operational State",
        description: "The system automatically updates asset state as contracts progress: AVAILABLE (in warehouse) -> RESERVED (contract drafted) -> ON_HIRE (with customer) -> IN_SERVICE (refurbishing).",
        fieldDetails: "Current State, Active Contract ID, Assigned Customer, Current Location.",
      },
      {
        step: 3,
        title: "Monitor Asset Yield & Payback Progress",
        description: "View cumulative rental revenue earned by this specific physical asset vs. its original production cost to evaluate ROI and payback period.",
        fieldDetails: "Cumulative Rent Collected (₹), Current Asset Book Value (₹), Utilization Rate %.",
      },
      {
        step: 4,
        title: "Retire or Liquidate Asset",
        description: "When asset reaches end-of-life after multiple rental cycles, click 'Retire Asset'. Mark as LIQUIDATED (sold as second-hand) or SCRAPPED.",
        fieldDetails: "Disposal Date, Salvage Recovery Amount (₹), Profit/Loss on Disposal.",
      },
    ],
    criticalRules: [
      "An asset marked 'ON_HIRE' cannot be attached to a new rental contract until the previous contract is returned and inspected.",
      "Asset codes must be unique and permanently engraved or stamped onto the furniture frame.",
    ],
    staffOperationalTip: "Use metallic QR barcode asset tags riveted to the back or underside of the furniture so stickers never peel off during customer use.",
    scopeOfImprovement: [
      "Automate preventative maintenance reminders (e.g. polish touch-up every 12 months) for high-value rental assets.",
    ],
  },
  {
    id: "inter-warehouse-transfer",
    intent: "Issue Inter-Store / Warehouse Stock Transfer Challan",
    category: "inventory",
    routePrefix: "/admin/inventory",
    actionHref: "/admin/inventory/movements",
    actionLabel: "Stock Transfer",
    breadcrumbSteps: ["Inventory & Stock", "Stock Movements", "New Transfer Challan", "Select Source & Destination Stores", "Add Furniture Items & Quantities", "Dispatch Goods in Transit", "Destination GRN Acceptance"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Create Stock Transfer Challan",
        description: "Go to Inventory > Stock Movements > New Transfer. Select Source Warehouse (e.g. Asansol Central) and Destination Store (e.g. Raniganj Showroom).",
        fieldDetails: "Transfer Challan No, Source Location, Destination Location, Truck Vehicle No.",
      },
      {
        step: 2,
        title: "Add Line Items to Transfer",
        description: "Pick items and quantities to move. System checks source Available-to-Promise (ATP) stock.",
        fieldDetails: "Product SKU, Quantity to Move, Transit Value (₹).",
      },
      {
        step: 3,
        title: "Dispatch Goods (In-Transit State)",
        description: "Click 'Dispatch Transfer'. Items deduct from source warehouse and enter 'Goods-in-Transit' account. Print Transfer Delivery Challan.",
        fieldDetails: "Dispatch Timestamp, Driver Name, Challan Document.",
      },
      {
        step: 4,
        title: "Destination Store Receipt & Sign-Off",
        description: "Upon arrival, destination storekeeper inspects goods and clicks 'Accept Transfer'. Items enter destination warehouse live inventory.",
        fieldDetails: "Accepted Quantity, Damaged in Transit (if any), Receiver Signature.",
      },
    ],
    criticalRules: [
      "Stock in transit cannot be sold or delivered until destination store accepts the receipt.",
      "Any discrepancy between dispatched and received quantities must be accounted for as transit damage adjustment.",
    ],
    staffOperationalTip: "The truck driver must carry 2 physical signed copies of the Stock Transfer Delivery Challan to satisfy state highway tax checkpoints.",
    scopeOfImprovement: [
      "Enable instant digital receiving via QR scan on the driver's delivery manifest using any mobile browser.",
    ],
  },
  {
    id: "reorder-low-stock-alert",
    intent: "Monitor Reorder Point Alerts & Minimum Safety Stock Thresholds",
    category: "inventory",
    routePrefix: "/admin/inventory",
    actionHref: "/admin/inventory/stock-needs",
    actionLabel: "Stock Needs",
    breadcrumbSteps: ["Inventory & Stock", "Stock Needs & Planning", "Inspect Low Stock Warnings", "Review Reorder Thresholds", "Generate Purchase Requisitions"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Review Under-Stocked Items",
        description: "Open Stock Needs. Items whose Available-to-Promise (ATP) stock has fallen below their minimum safety stock appear highlighted in amber/red.",
        fieldDetails: "Product SKU, Current Stock, Safety Threshold, Deficit Quantity.",
      },
      {
        step: 2,
        title: "Evaluate Lead Time & Upcoming Demand",
        description: "Review supplier lead time (e.g. 7 days for Teak timber, 2 days for hardware) and upcoming contract delivery requirements.",
        fieldDetails: "Supplier Name, Typical Lead Time, Recommended Order Qty.",
      },
      {
        step: 3,
        title: "Create 1-Click Purchase Requisition",
        description: "Click 'Generate PO Requirement'. System auto-populates a draft Purchase Order for the default supplier with the exact reorder quantity.",
        fieldDetails: "Draft PO Number, Supplier ID, Total Estimated Purchase Cost (₹).",
      },
    ],
    criticalRules: [
      "Safety thresholds must be reviewed quarterly based on seasonal furniture buying spikes (e.g. wedding seasons, Diwali).",
    ],
    staffOperationalTip: "Review the Stock Needs screen every Monday morning before placing weekly supplier orders.",
    scopeOfImprovement: [
      "Automate draft purchase order dispatch via email/WhatsApp to preferred suppliers once approved by admin.",
    ],
  },
  {
    id: "stock-audit-reconciliation",
    intent: "Physical Inventory Cycle Count & Variance Reconciliation",
    category: "inventory",
    routePrefix: "/admin/inventory",
    actionHref: "/admin/inventory/ledger",
    actionLabel: "Stock Ledger",
    breadcrumbSteps: ["Inventory & Stock", "Stock Ledger", "Generate Physical Count Worksheet", "Perform Warehouse Floor Count", "Compare Physical vs Book Stock", "Reconcile Variance & Sign-Off"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Generate Audit Cycle Sheet",
        description: "Open Stock Ledger. Click 'Cycle Count Sheet'. Select category (e.g. Mattresses & Wardrobes).",
        fieldDetails: "Audit Date, Auditor Name, Selected Category.",
      },
      {
        step: 2,
        title: "Conduct Blind Physical Floor Count",
        description: "Floor staff count every physical unit on the racks without seeing the system stock count to ensure unbiased auditing.",
        fieldDetails: "SKU, Physical Counted Quantity, Rack Location.",
      },
      {
        step: 3,
        title: "Input Counts & Analyze Variances",
        description: "Enter the counted figures. The system compares Book Stock vs Physical Count and highlights discrepancies (+/- variance).",
        fieldDetails: "Book Qty, Physical Qty, Variance (+/-), Variance Financial Value (₹).",
      },
      {
        step: 4,
        title: "Reconcile Variances & Post Audit",
        description: "Investigate root cause of missing or excess items. Click 'Post Reconciled Balance'. System writes automated adjustment entries and updates stock ledger.",
        fieldDetails: "Audit Report ID, Net Variance Loss (₹), Auditor & Manager Signatures.",
      },
    ],
    criticalRules: [
      "All physical movements must pause in the target warehouse zone during the cycle count.",
      "Audits must be preserved in the audit log for financial compliance.",
    ],
    staffOperationalTip: "Do weekly cycle counts of fast-moving items (e.g. office chairs, mattresses) rather than waiting for annual stocktaking.",
    scopeOfImprovement: [
      "Enable RFID or high-speed Bluetooth barcode scanning for 10x faster cycle counting.",
    ],
  },
  {
    id: "create-purchase-order",
    intent: "Issue a Purchase Order (PO) to a Supplier",
    category: "purchases-vendors",
    routePrefix: "/admin/purchases",
    actionHref: "/admin/purchases/orders",
    actionLabel: "Create PO",
    breadcrumbSteps: ["Purchases & Vendors", "Purchase Orders", "Create PO", "Select Vendor", "Add Raw Materials / Finished Furniture", "Negotiate Terms & Delivery Date", "Approve & Send to Supplier"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Select Vendor & Delivery Destination",
        description: "Open Purchases > Orders > Create PO. Select supplier from registered vendor directory. Choose destination warehouse.",
        fieldDetails: "Vendor Name, Vendor GSTIN, Destination Warehouse.",
      },
      {
        step: 2,
        title: "Add Line Items & Quantities",
        description: "Search raw materials (wood logs, foam sheets) or finished furniture items. Enter unit rate, quantity, and applicable GST slab.",
        fieldDetails: "Product SKU, Order Qty, Agreed Unit Rate (₹), HSN Code, Tax Rate.",
      },
      {
        step: 3,
        title: "Specify Commercial Terms & Delivery Deadline",
        description: "Set payment terms (e.g. 30 Days Net, Advance 20%), freight terms (FOB/CIF), and expected delivery date.",
        fieldDetails: "Payment Terms, Expected Delivery Date, Freight Charges (₹).",
      },
      {
        step: 4,
        title: "Approve PO & Export PDF",
        description: "Click 'Approve Purchase Order'. System generates official PO document. Send PDF to vendor via email or WhatsApp in 1 click.",
        fieldDetails: "Purchase Order Number (PO-XXXXX), Total PO Value (₹).",
      },
    ],
    criticalRules: [
      "A purchase order creates a commercial commitment but does NOT book inventory or financial liabilities until goods are received.",
      "Agreed unit prices lock in the PO and cannot be changed during GRN receipt without admin override.",
    ],
    staffOperationalTip: "Always specify the expected delivery date; late supplier deliveries are the #1 cause of customer delivery delays.",
    scopeOfImprovement: [
      "Add automated reminder to vendors 48 hours prior to expected PO delivery date via WhatsApp.",
    ],
  },
  {
    id: "receive-goods-grn",
    intent: "Inspect & Receive Goods from Supplier (GRN)",
    category: "purchases-vendors",
    routePrefix: "/admin/purchases",
    actionHref: "/admin/purchases/receipts",
    actionLabel: "Goods Receipt",
    breadcrumbSteps: ["Purchases & Vendors", "Goods Receipts (GRN)", "Select Purchase Order", "Inspect Delivered Quantities", "Record Rejections & Damaged Items", "Confirm GRN & Post Stock Intake"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Locate Purchase Order & Delivery Vehicle",
        description: "When supplier's truck arrives, open Purchases > Receipts > Create GRN. Search PO number or vendor name.",
        fieldDetails: "PO Number, Vendor Delivery Challan / E-Way Bill Number, Vehicle Number.",
      },
      {
        step: 2,
        title: "Count & Inspect Physical Items",
        description: "Inspect goods against PO line items. Enter accepted quantity, rejected quantity, and reason for any rejection (e.g. warped timber, torn foam).",
        fieldDetails: "Delivered Qty, Accepted Qty, Rejected Qty, Rejection Reason.",
      },
      {
        step: 3,
        title: "Post GRN & Update Inventory",
        description: "Click 'Post Goods Receipt'. Accepted items immediately add to physical warehouse stock and post to 'Goods Received Not Invoiced (GRNI)' ledger.",
        fieldDetails: "GRN Number (GRN-XXXXX), Storekeeper Signature, Stock Intake Timestamp.",
      },
    ],
    criticalRules: [
      "GRN immediately increases physical inventory quantities.",
      "Rejected items are NOT added to inventory and must be endorsed on the supplier driver's delivery slip.",
    ],
    staffOperationalTip: "Measure the thickness and moisture of timber planks with a moisture meter before unloading from the truck; damp wood warps in furniture.",
    scopeOfImprovement: [
      "Provide mobile GRN intake where receiving staff can snap photos of delivery challans and defective items.",
    ],
  },
  {
    id: "book-purchase-bill",
    intent: "Book a Supplier Tax Invoice / Purchase Bill with 3-Way Match",
    category: "purchases-vendors",
    routePrefix: "/admin/purchases",
    actionHref: "/admin/purchases/bills",
    actionLabel: "Book Bill",
    breadcrumbSteps: ["Purchases & Vendors", "Purchase Bills", "New Purchase Bill", "Link PO & Goods Receipt (GRN)", "Verify 3-Way Match (PO vs GRN vs Bill)", "Book Payable & Accrue Input Tax Credit (ITC)"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Input Supplier Tax Invoice Details",
        description: "Open Purchases > Bills > Create Bill. Enter supplier's actual invoice number, invoice date, and billing address.",
        fieldDetails: "Vendor Invoice No, Invoice Date, Vendor GSTIN.",
      },
      {
        step: 2,
        title: "Execute 3-Way Matching Verification",
        description: "Link the bill to the corresponding Purchase Order and GRN. System matches: PO price == Bill price AND GRN received qty == Billed qty.",
        fieldDetails: "Linked PO ID, Linked GRN ID, Price Variance, Quantity Variance.",
      },
      {
        step: 3,
        title: "Book Vendor Payable & Claim GST ITC",
        description: "Review tax breakdown (CGST + SGST or IGST). Click 'Post Purchase Bill'. Books credit to Vendor Payable and debit to GRNI / ITC Asset account.",
        fieldDetails: "Purchase Bill Number (BILL-XXXXX), Net Payable (₹), ITC Available.",
      },
    ],
    criticalRules: [
      "Bills cannot be booked for quantities greater than those officially received on the GRN without admin exception approval.",
      "Vendor GSTIN must match the GST portal master to ensure legitimate Input Tax Credit (ITC) claiming.",
    ],
    staffOperationalTip: "Attach a scanned PDF copy of the vendor's physical tax invoice to the digital bill record for easy tax auditor inspection.",
    scopeOfImprovement: [
      "Integrate automated OCR to scan PDF supplier bills and auto-fill line items, tax amounts, and invoice numbers.",
    ],
  },
  {
    id: "settle-vendor-payment",
    intent: "Settle Vendor Payables / Supplier Payout with Bank UTR",
    category: "purchases-vendors",
    routePrefix: "/admin/vendors",
    actionHref: "/admin/vendors/payments",
    actionLabel: "Vendor Payout",
    breadcrumbSteps: ["Purchases & Vendors", "Vendor Payments", "Select Vendor & Outstanding Bills", "Enter Payout Amount", "Select Bank Account & Input UTR", "Post Payout & Issue Payment Voucher"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Select Vendor with Outstanding Dues",
        description: "Open Vendor Payments. Search supplier name. The system lists all unpaid purchase bills sorted by age and due date.",
        fieldDetails: "Vendor Name, Total Outstanding Payable (₹), Overdue Amount (₹).",
      },
      {
        step: 2,
        title: "Allocate Payment Across Specific Bills",
        description: "Select the purchase bills being settled. System supports full settlement or partial milestone payments with FIFO auto-allocation.",
        fieldDetails: "Selected Bills, Allocated Amounts (₹), Cash Discount Received (if any).",
      },
      {
        step: 3,
        title: "Select Payout Account & Reference",
        description: "Choose payment mode (NEFT/RTGS, Cheque, UPI). Select paying bank account and enter official bank UTR reference number.",
        fieldDetails: "Finance Account (HDFC/SBI Current Account), UTR / Cheque No, Payment Date.",
      },
      {
        step: 4,
        title: "Post Payout & Print Payment Voucher",
        description: "Click 'Post Vendor Payment'. Clears vendor liability in ledger, debits Accounts Payable, and credits Bank Account.",
        fieldDetails: "Payment Voucher (PV-XXXXX), Remittance Advice PDF.",
      },
    ],
    criticalRules: [
      "Payments must be linked to verified vendor bank account details.",
      "Vendor payments are append-only; bounced cheques require an explicit dishonor reversal entry.",
    ],
    staffOperationalTip: "Send the generated payment remittance advice PDF to the vendor via WhatsApp immediately so they dispatch your next timber batch promptly.",
    scopeOfImprovement: [
      "Enable direct one-click payout through bank API integration without logging into external net-banking portals.",
    ],
  },
  {
    id: "onboard-supplier-vendor",
    intent: "Onboard New Vendor with GSTIN, MSME & Bank Details Verification",
    category: "purchases-vendors",
    routePrefix: "/admin/vendors",
    actionHref: "/admin/vendors",
    actionLabel: "New Vendor",
    breadcrumbSteps: ["Purchases & Vendors", "Vendor Directory", "Create Vendor Profile", "Validate GSTIN & Legal Business Name", "Record MSME Udyam Registration", "Add Bank Account for Direct Payouts", "Activate Vendor"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Enter Legal Identity & Trade Name",
        description: "Go to Purchases > Vendors > Create Vendor. Enter supplier business name, contact person, mobile number, and email.",
        fieldDetails: "Vendor Name, Trade Name, Primary Phone, Operating Address.",
      },
      {
        step: 2,
        title: "Tax & Regulatory Classification (GST & PAN)",
        description: "Enter 15-character GSTIN. System validates format and state code. Enter PAN number and state.",
        fieldDetails: "GSTIN, PAN, Tax Type (Regular GST, Composite, Unregistered).",
      },
      {
        step: 3,
        title: "Record MSME Status (45-Day Payment Rule)",
        description: "Specify MSME classification: Micro, Small, Medium, or Not Applicable. Enter Udyam registration number for Section 43B(h) compliance.",
        fieldDetails: "MSME Category, Udyam Number, Mandatory Payment Cycle (15/45 days).",
      },
      {
        step: 4,
        title: "Input Verified Bank Account Details",
        description: "Enter bank name, beneficiary name, account number, and IFSC code for RTGS/NEFT vendor settlements.",
        fieldDetails: "Bank Name, Account Number, IFSC Code, Account Type.",
      },
    ],
    criticalRules: [
      "Under Indian tax law Section 43B(h), payments to registered MSME suppliers must be settled within 45 days to claim tax deductions.",
      "Beneficiary name in bank details must match vendor legal name on invoice.",
    ],
    staffOperationalTip: "Request a cancelled cheque leaf from the vendor during onboarding to verify IFSC and account number accuracy.",
    scopeOfImprovement: [
      "Integrate automated GSTIN and bank account name lookup via instant penny-drop verification API.",
    ],
  },
  {
    id: "supplier-debit-note",
    intent: "Issue a Debit Note / Purchase Return for Defective Raw Materials",
    category: "purchases-vendors",
    routePrefix: "/admin/billing",
    actionHref: "/admin/billing/debit-notes",
    actionLabel: "Debit Notes",
    breadcrumbSteps: ["Purchases & Vendors", "Debit Notes", "Create Debit Note", "Link Original Purchase Bill", "Specify Returned Items & Quantities", "Select Defect Reason Code", "Post Debit Note & Adjust Payable"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Select Original Supplier Purchase Bill",
        description: "Open Billing > Debit Notes > Create Debit Note. Search original purchase bill number against which defective goods were received.",
        fieldDetails: "Original Bill Number, Vendor Name, Original Billed Amount.",
      },
      {
        step: 2,
        title: "Select Defective Items & Quantities",
        description: "Select items being returned to supplier or rejected after workshop cutting inspection. Enter quantity and return price.",
        fieldDetails: "Product SKU, Return Qty, Unit Rate (₹), Reversible Tax Amount (₹).",
      },
      {
        step: 3,
        title: "Record Reason & Post Debit Note",
        description: "Input formal reason: QUALITY_DEFECT, TRANSIT_DAMAGE, SPECIFICATION_MISMATCH. Post debit note to decrease vendor liability.",
        fieldDetails: "Debit Note Number (DN-XXXXX), Debit Note Date, Reversal Journal Ref.",
      },
    ],
    criticalRules: [
      "Debit notes reduce outstanding Accounts Payable to the supplier and reverse claimed Input Tax Credit (ITC) under GST law.",
      "Defective items must be physically isolated in the quarantine rejection bay until supplier truck collects them.",
    ],
    staffOperationalTip: "Have the supplier's representative sign the debit note copy when picking up rejected timber or defective hardware.",
    scopeOfImprovement: [
      "Automatically deduct approved debit notes from the next scheduled vendor payout batch.",
    ],
  },
  {
    id: "setup-chart-accounts",
    intent: "Map Bank, Cash & UPI Accounts to Chart of Accounts (COA)",
    category: "accounting-finance",
    routePrefix: "/admin/accounting",
    actionHref: "/admin/accounting/chart-of-accounts",
    actionLabel: "COA Setup",
    breadcrumbSteps: ["Accounting & Finance", "Chart of Accounts", "Define COA Structure (Assets, Liabilities, Equity, Income, Expense)", "Map Operational Finance Accounts", "Configure Required Posting Purposes", "Verify Account Posting Readiness"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Review Standard Chart of Accounts (COA)",
        description: "Navigate to Accounting > Chart of Accounts. The system provides pre-configured standard accounts tailored for furniture retail, manufacturing, and EMI operations.",
        fieldDetails: "Account Code (e.g. 1010 Cash, 2010 Accounts Payable, 4010 EMI Revenue), Account Name, Category.",
      },
      {
        step: 2,
        title: "Create or Edit Operational Finance Accounts",
        description: "Open Finance Accounts. Configure real-world money containers: Main Cash Drawer, Showroom Petty Cash, SBI Current Account, Razorpay UPI Settlement.",
        fieldDetails: "Account Name, Kind (CASH, BANK, SETTLEMENT), Account Number, Active Flag.",
      },
      {
        step: 3,
        title: "Map Operational Accounts to COA Ledger Purposes",
        description: "In Finance Account Mapping, link each finance account to its required ledger purpose (e.g. CASH_COLLECTION, UPI_COLLECTION, BANK_ACCOUNT, EMI_INCOME, RENT_INCOME).",
        fieldDetails: "Finance Account, Ledger Purpose, Target COA Account, Default Anchor.",
      },
      {
        step: 4,
        title: "Run Readiness & Bridge Health Audit",
        description: "Click 'Verify Posting Readiness'. System checks that all 22 required operational purposes have active, valid mappings. Zero missing mappings allowed.",
        fieldDetails: "Readiness Report, Missing Purposes Count (must be 0), Status: READY.",
      },
    ],
    criticalRules: [
      "No payment or collection can post without an active COA purpose mapping; unmapped postings throw FinanceAccountPostingReadinessError.",
      "Chart of account codes cannot be modified or deleted if ledger entries exist against them.",
    ],
    staffOperationalTip: "Store managers only need to select the human-friendly account name (e.g. 'Cash Drawer 1') at the cashier desk; the backend handles all COA debits and credits automatically.",
    scopeOfImprovement: [
      "Add automated diagnostic alerts if a new business scheme is launched without required income purpose mappings.",
    ],
  },
  {
    id: "post-manual-journal",
    intent: "Record Manual Double-Entry Journal Entry with Balance Validation",
    category: "accounting-finance",
    routePrefix: "/admin/accounting",
    actionHref: "/admin/accounting/journals",
    actionLabel: "New Journal",
    breadcrumbSteps: ["Accounting & Finance", "Journal Entries", "Create Journal Voucher", "Select Ledger Accounts (Debit & Credit)", "Enter Amounts & Narration", "Verify Mathematical Balance (Debit == Credit)", "Post & Lock Journal Entry"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Open Journal Entry Voucher",
        description: "Go to Accounting > Journals > Create Journal. Enter journal date and voucher reference.",
        fieldDetails: "Journal Date, Journal Type (GENERAL, ADJUSTMENT, OPENING, CLOSING), Reference No.",
      },
      {
        step: 2,
        title: "Add Debit and Credit Line Items",
        description: "Select accounts from the Chart of Accounts. Enter debit amount on one line and credit amount on the corresponding line (e.g. Debit Rent Expense ₹25,000, Credit SBI Bank ₹25,000).",
        fieldDetails: "COA Account, Debit Amount (₹), Credit Amount (₹), Line Narration.",
      },
      {
        step: 3,
        title: "Verify Balance & Write Audit Narration",
        description: "System enforces the fundamental invariant: Total Debits must exactly equal Total Credits. Enter clear business explanation.",
        fieldDetails: "Total Debit, Total Credit, Difference (must be ₹0.00), Journal Narration.",
      },
      {
        step: 4,
        title: "Post & Lock Journal Entry",
        description: "Click 'Post Journal Entry'. The entry writes to the General Ledger permanently and updates account trial balances.",
        fieldDetails: "Journal Entry ID (JE-XXXXX), Posted By User, Timestamp.",
      },
    ],
    criticalRules: [
      "Total Debits MUST equal Total Credits; unbalanced journal entries are blocked by database constraints.",
      "Posted journal entries cannot be edited or deleted; corrections must be posted as reversal journal entries.",
    ],
    staffOperationalTip: "Use manual journal entries primarily for non-operational accounting adjustments (e.g. monthly showroom rent, electricity bills, depreciation) rather than sales/cash transactions.",
    scopeOfImprovement: [
      "Provide recurring journal entry templates for monthly recurring expenses like showroom rent and software subscriptions.",
    ],
  },
  {
    id: "audit-general-ledger",
    intent: "Inspect Account Ledgers, Trial Balance & Balance Sheet",
    category: "accounting-finance",
    routePrefix: "/admin/accounting",
    actionHref: "/admin/accounting/books",
    actionLabel: "General Ledger",
    breadcrumbSteps: ["Accounting & Finance", "Financial Books", "Select Ledger Account or Financial Statement", "Filter Date Range & Financial Year", "Audit Transaction Running Balance", "Export Statement (PDF / Excel)"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Select Financial Statement or Ledger",
        description: "Open Accounting > Books. Choose report: General Ledger (account-wise), Trial Balance, Profit & Loss Statement, or Balance Sheet.",
        fieldDetails: "Statement Type, Financial Year (e.g. FY 2026-27), Date Range.",
      },
      {
        step: 2,
        title: "Inspect Running Balances & Drill Down",
        description: "Select a specific account (e.g. 1010 Cash or 4010 EMI Revenue). Click any line item to drill down into the underlying source transaction or receipt.",
        fieldDetails: "Opening Balance, Running Debit/Credit, Closing Balance, Source Transaction Link.",
      },
      {
        step: 3,
        title: "Verify Trial Balance Integrity",
        description: "Review Trial Balance summary. Ensure aggregate debits equal aggregate credits across all assets, liabilities, equity, revenues, and expenses.",
        fieldDetails: "Total Debit Balance, Total Credit Balance, Net Zero Discrepancy.",
      },
      {
        step: 4,
        title: "Export Statement for Accounting Review",
        description: "Export the audited ledger statement as an Excel workbook or official signed PDF document.",
        fieldDetails: "Export Format (.xlsx / .pdf), Timestamp, Verification Seal.",
      },
    ],
    criticalRules: [
      "Financial statements are derived strictly from posted double-entry journal entries.",
      "Frontend never calculates financial truth; all balances are computed by deterministic backend ledger services.",
    ],
    staffOperationalTip: "Check the Cash Ledger at 7 PM daily before leaving the store to ensure closing balance matches your physical cash in hand.",
    scopeOfImprovement: [
      "Add interactive visual waterfall charts showing monthly revenue vs expense breakdown.",
    ],
  },
  {
    id: "generate-gst-tax-returns",
    intent: "Prepare GSTR-1, GSTR-3B Sales & ITC Summary for Tax Filing",
    category: "accounting-finance",
    routePrefix: "/admin/reports",
    actionHref: "/admin/reports/gstr",
    actionLabel: "GST Center",
    breadcrumbSteps: ["Accounting & Finance", "GST Tax Reports", "Select Filing Period (Month / Quarter)", "Review Outward Supplies (GSTR-1 B2B & B2C)", "Review Inward Supplies & ITC (GSTR-3B / 2B)", "Download JSON / Excel for GST Portal"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Select Tax Filing Period",
        description: "Open GST Tax Reports. Select return type (GSTR-1 Outward Supplies or GSTR-3B Summary) and return period (e.g. October 2026).",
        fieldDetails: "GSTIN, Return Period, Return Type (GSTR-1, GSTR-3B).",
      },
      {
        step: 2,
        title: "Review Outward Taxable Sales (GSTR-1)",
        description: "Review categorized sales: Table 4 (B2B Tax Invoices with customer GSTIN), Table 7 (B2C Large inter-state), Table 9 (Credit/Debit Notes), Table 12 (HSN Summary).",
        fieldDetails: "Taxable Value, CGST, SGST, IGST, Total Tax Liability.",
      },
      {
        step: 3,
        title: "Reconcile Inward ITC (GSTR-3B)",
        description: "Review eligible Input Tax Credit (ITC) from verified supplier purchase bills. Verify that blocked credits (Section 17(5)) are properly excluded.",
        fieldDetails: "Eligible ITC (CGST/SGST/IGST), Ineligible ITC, Net Tax Payable after ITC offset.",
      },
      {
        step: 4,
        title: "Export GST Portal Ready File",
        description: "Click 'Export Official GST Return'. Generates standard Government GST Portal JSON upload file and CA review Excel sheet.",
        fieldDetails: "GST Portal JSON File, HSN Summary Worksheet, Reconciliation Summary.",
      },
    ],
    criticalRules: [
      "B2B invoices must have a validated 15-digit GSTIN; invalid GSTINs cause GST portal JSON rejection.",
      "HSN codes must be at least 4 digits for turnover < ₹5 Cr, and 6 digits for turnover > ₹5 Cr.",
    ],
    staffOperationalTip: "File GSTR-1 before the 11th of every month so your B2B commercial buyers can view their Input Tax Credit on their GST portal.",
    scopeOfImprovement: [
      "Direct API integration with GST Suvidha Provider (GSP) to upload returns with a single click.",
    ],
  },
  {
    id: "export-ca-monthly-pack",
    intent: "Export Chartered Accountant (CA) Monthly Audit & Year-End Pack",
    category: "accounting-finance",
    routePrefix: "/admin/accounting",
    actionHref: "/admin/accounting/exports",
    actionLabel: "CA Audit Pack",
    breadcrumbSteps: ["Accounting & Finance", "CA Monthly Export", "Select Audit Month", "Compile Multi-Tab Audit Workbook", "Verify Bank Reconciliation Statements", "Export Certified ZIP Audit Archive"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Select Audit Period",
        description: "Navigate to Accounting > CA Export Pack. Select target month (e.g. October 2026).",
        fieldDetails: "Financial Year, Target Month, Inclusion Flags.",
      },
      {
        step: 2,
        title: "Automated Multi-Schedule Compilation",
        description: "The system automatically compiles all audit schedules into standard format: Sales Register, Purchase Register, Cash Book, Bank Books, Debtors Aging, and Fixed Asset Depreciation.",
        fieldDetails: "Compiled schedules count, Total transaction count, Ledger balance checks.",
      },
      {
        step: 3,
        title: "Download Complete CA Pack Archive",
        description: "Click 'Download CA Monthly Pack'. Generates a unified password-protected ZIP archive containing clean Excel workbooks and reconciliation summaries.",
        fieldDetails: "ZIP Archive Download URL, Checksum Hash, Auditor Instructions Readme.",
      },
    ],
    criticalRules: [
      "CA export pack must pass internal integrity check: Trial balance sum must equal zero.",
      "Export captures locked data as of the closing date; later audit adjustments require an amended pack.",
    ],
    staffOperationalTip: "Email the CA export pack to your chartered accountant on the 2nd day of each month to avoid month-end rush.",
    scopeOfImprovement: [
      "Add direct secure read-only portal access for the store's designated CA.",
    ],
  },
  {
    id: "run-lucky-draw",
    intent: "Execute a Monthly Lucky Draw & Waive Winner EMIs",
    category: "lucky-plan",
    routePrefix: "/admin/lucky-draws",
    actionHref: "/admin/lucky-draws",
    actionLabel: "Run Lucky Draw",
    breadcrumbSteps: ["Lucky Plan Control", "Lucky Draws", "Select Active Batch", "Verify Draw Eligibility (All Past EMIs Paid)", "Execute Random Draw Ceremony", "Confirm Winner & Waive Remaining Schedule", "Issue Winner Certificate & Delivery Order"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Select Scheme Batch & Draw Month",
        description: "Open Lucky Draws. Select the batch (e.g. Diwali Bonanza 2026) and the draw sequence number (e.g. Month 4 Draw).",
        fieldDetails: "Batch ID, Month Ordinal, Draw Date.",
      },
      {
        step: 2,
        title: "Verify Eligible Participant Pool",
        description: "System filters contracts in the batch where all due installments up to the draw month are fully settled. Defaulters with unpaid past EMIs are disqualified from this draw.",
        fieldDetails: "Total Contracts in Batch, Disqualified Defaulters Count, Eligible Contenders Count.",
      },
      {
        step: 3,
        title: "Execute Public Draw or Input Verified Winner Token",
        description: "Conduct live transparent token draw with witnesses. Input winning Lucky ID or click 'Execute Provably-Fair Digital Draw'.",
        fieldDetails: "Winning Lucky ID, Witness Names, Draw Ceremony Video/Photo Link.",
      },
      {
        step: 4,
        title: "Confirm Winner & Apply Automated Waiver",
        description: "Click 'Confirm Winner'. System sets subscription status = WON, waives all remaining future unpaid EMIs, books Waiver Loss journal, and generates furniture delivery order.",
        fieldDetails: "Winner Name, Waived EMIs Count, Total Waived Amount (₹), Delivery Order Number.",
      },
    ],
    criticalRules: [
      "Settled payments made by the winner prior to winning are NEVER refunded or altered.",
      "Draw execution is idempotent: once confirmed, the same draw cannot be run twice.",
      "Winning a draw waives future obligations only according to business rules; delivery state remains separate.",
    ],
    staffOperationalTip: "Stream the draw ceremony live on Facebook/YouTube; transparency builds immense trust and drives enrollments for the next scheme batch.",
    scopeOfImprovement: [
      "Provide a public QR code verification page where customers can input their Lucky ID to verify whether they won.",
    ],
  },
  {
    id: "create-lucky-batch",
    intent: "Launch a New Lucky Plan Scheme Batch & Generate Token Sequences",
    category: "lucky-plan",
    routePrefix: "/admin/batches",
    actionHref: "/admin/batches/create",
    actionLabel: "New Scheme Batch",
    breadcrumbSteps: ["Lucky Plan Control", "Batches Master", "Create Batch", "Define Scheme Terms (Tenure, Installment Amount)", "Select Enrolled Furniture Models", "Set Capacity & Lucky ID Token Range", "Open Batch for Public Enrollment"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Define Scheme Title & Commercial Parameters",
        description: "Open Batches > Create Batch. Enter batch title (e.g. 'New Year 2027 Advance EMI Bonanza'). Set monthly installment (e.g. ₹1,000/mo) and tenure duration (e.g. 10 months).",
        fieldDetails: "Batch Name, Monthly Amount (₹), Tenure (Months), Total Contract Value (₹).",
      },
      {
        step: 2,
        title: "Attach Eligible Furniture Products",
        description: "Select the furniture models enrolled in this scheme batch (e.g. Solid Wood Dressing Table or Queen Size Box Bed).",
        fieldDetails: "Eligible Product SKUs, Product MRP (₹).",
      },
      {
        step: 3,
        title: "Configure Batch Capacity & Lucky ID Token Series",
        description: "Define maximum subscriber capacity (e.g. 500 members) and token series prefix (e.g. NY27-001 to NY27-500).",
        fieldDetails: "Max Capacity, Token Prefix, Token Start Number, Token End Number.",
      },
      {
        step: 4,
        title: "Set Enrollment Schedule & Activate",
        description: "Specify enrollment start date, cutoff date, and the scheduled monthly draw dates (e.g. 15th of every month). Click 'Activate Batch'.",
        fieldDetails: "Enrollment Window, First Draw Date, Status: ACTIVE.",
      },
    ],
    criticalRules: [
      "Lucky ID tokens must be strictly unique within the product and batch scope.",
      "Tenure and monthly amount become immutable once the first customer contract enrolls in the batch.",
    ],
    staffOperationalTip: "Set the enrollment cutoff at least 3 days before the first draw date so all initial customer verification calls can be completed.",
    scopeOfImprovement: [
      "Automate social media launch poster generation with batch details and QR code for customer pre-registration.",
    ],
  },
  {
    id: "winner-fulfillment-handover",
    intent: "Process Winner Document Verification & Furniture Delivery Handover",
    category: "lucky-plan",
    routePrefix: "/admin/lucky-plan",
    actionHref: "/admin/lucky-plan/winners",
    actionLabel: "Winner Fulfillment",
    breadcrumbSteps: ["Lucky Plan Control", "Winners Roster", "Select Unfulfilled Winner", "Verify Original Membership Card & Aadhaar", "Inspect Showroom Furniture Ready for Handover", "Execute Delivery Handover & Photograph", "Mark Winner Fulfillment Complete"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Verify Winner Identity & Physical Passbook",
        description: "Open Winners Roster. When winner visits showroom, verify original Aadhaar card and match the Lucky ID token with the customer passbook.",
        fieldDetails: "Winner ID, Lucky ID Token, Aadhaar Number Match, Verified By Staff.",
      },
      {
        step: 2,
        title: "Create Delivery Handover Order",
        description: "Generate Delivery Handover Challan for the enrolled furniture item. Confirm destination address if customer requests home delivery.",
        fieldDetails: "Furniture SKU, Serial Code, Handover Mode (Showroom Pickup / Home Delivery).",
      },
      {
        step: 3,
        title: "Capture Handover Photo & Customer Sign-Off",
        description: "Take a photo of the smiling winner receiving the keys/furniture in front of the showroom branding. Upload photo to the delivery record.",
        fieldDetails: "Handover Timestamp, Winner Signature, Photograph Upload.",
      },
      {
        step: 4,
        title: "Finalize Fulfillment & Publish to Wall of Fame",
        description: "Click 'Mark Handover Completed'. System updates fulfillment status and optionally publishes winner story to website public winners gallery.",
        fieldDetails: "Delivery Status: DELIVERED, Public Showcase Flag.",
      },
    ],
    criticalRules: [
      "Furniture handover cannot proceed without physical Aadhaar verification matching the subscription record.",
      "No delivery or fulfillment fee may be charged to the winner unless special long-distance crane delivery was requested.",
    ],
    staffOperationalTip: "Give the winner a congratulatory garland and take a high-quality photo with the showroom team; share it on your WhatsApp Status and Facebook page immediately.",
    scopeOfImprovement: [
      "Add automated digital winner testimonial collection via WhatsApp prompt after 7 days.",
    ],
  },
  {
    id: "defaulter-disqualification",
    intent: "Manage Lucky Plan EMI Defaulters, Grace Periods & Auto-Disqualification",
    category: "lucky-plan",
    routePrefix: "/admin/defaulters",
    actionHref: "/admin/defaulters",
    actionLabel: "Defaulter Control",
    breadcrumbSteps: ["Lucky Plan Control", "Defaulter Queue", "Identify Overdue Accounts", "Send Grace Period Warning via SMS/WhatsApp", "Auto-Disqualify from Current Month Draw", "Process Re-instatement on Overdue Settlement"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Review Pre-Draw Overdue Subscriptions",
        description: "Five days before the scheduled monthly draw, open Defaulter Queue. Filter by batch. Review all customers who have not settled the current month installment.",
        fieldDetails: "Batch ID, Defaulters Count, Due Installments Count.",
      },
      {
        step: 2,
        title: "Broadcast Urgent Cutoff Reminder",
        description: "Click 'Send Draw Cutoff Notice'. Sends bulk WhatsApp/SMS alert: 'Pay by 14th 5 PM to enter tomorrow's Lucky Draw!'.",
        fieldDetails: "Notification Template, Total Recipients, Remaining Hours.",
      },
      {
        step: 3,
        title: "Apply Pre-Draw Disqualification Lock",
        description: "At the cutoff deadline, the system automatically marks unpaid contracts as 'DISQUALIFIED_FROM_CURRENT_DRAW'. Their Lucky ID token is excluded from the contender pool.",
        fieldDetails: "Disqualified Token List, Active Contenders Locked.",
      },
      {
        step: 4,
        title: "Re-instate Eligibility on Late Payment",
        description: "When customer eventually pays overdue installment, their subscription re-qualifies for all future monthly draws (past missed draws remain forfeited).",
        fieldDetails: "Settlement Receipt Ref, Re-instated Date, Next Eligible Draw.",
      },
    ],
    criticalRules: [
      "Disqualification applies strictly to the specific draw month; paying all arrears restores full eligibility for subsequent draws.",
      "Staff cannot manually inject an unpaid token into the draw container without a posted payment receipt.",
    ],
    staffOperationalTip: "Call high-value defaulters directly on the phone 24 hours before the draw; 40% will make a quick UPI payment when reminded they might win tomorrow.",
    scopeOfImprovement: [
      "Add a self-service payment link directly in the cutoff SMS so customers can settle dues from their phone at midnight.",
    ],
  },
  {
    id: "onboard-customer-kyc",
    intent: "Onboard a New Customer & Verify KYC Documents",
    category: "crm-customers",
    routePrefix: "/admin/customers",
    actionHref: "/admin/customers/create",
    actionLabel: "New Customer",
    breadcrumbSteps: ["CRM & Customers", "Customer Directory", "Create Customer Profile", "Enter Contact Details & Address", "Upload Aadhaar / PAN / Photo", "Review & Approve KYC"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Enter Primary Identity Information",
        description: "Open Customers > Create Customer. Enter customer's full legal name, 10-digit mobile number, alternate contact, and email.",
        fieldDetails: "Full Name, Mobile (10 digits), Email, Gender, Date of Birth.",
      },
      {
        step: 2,
        title: "Input Residential & Billing Addresses",
        description: "Record street address, landmark, town/village, city, state, and 6-digit PIN code.",
        fieldDetails: "Address Line 1, Landmark, PIN Code, State.",
      },
      {
        step: 3,
        title: "Upload KYC Proofs",
        description: "Upload scanned copy or phone photo of Proof of Identity (Aadhaar, Voter ID, Driving License) and customer passport photo.",
        fieldDetails: "Document Type, Document Number, Front Image, Back Image.",
      },
      {
        step: 4,
        title: "Admin KYC Review & Verification",
        description: "In KYC Queue, admin reviews document legibility and matches name/DOB. Click 'Approve KYC'. Profile transitions to VERIFIED.",
        fieldDetails: "Verification Status: VERIFIED, Approved By User, Timestamp.",
      },
    ],
    criticalRules: [
      "Customer phone numbers must be unique across active customer accounts.",
      "High-value rental contracts require approved KYC before delivery authorization.",
    ],
    staffOperationalTip: "Use your smartphone camera to snap customer Aadhaar documents under bright store lighting; avoid flash glare on the card laminate.",
    scopeOfImprovement: [
      "Integrate instant Digilocker / Aadhaar OTP verification to verify KYC in 15 seconds without uploading photos.",
    ],
  },
  {
    id: "approve-partner-collection",
    intent: "Review & Approve Partner Collection Submissions",
    category: "crm-customers",
    routePrefix: "/admin/partners",
    actionHref: "/admin/partners/collection-requests",
    actionLabel: "Partner Requests",
    breadcrumbSteps: ["CRM & Customers", "Partners Workspace", "Collection Requests Queue", "Review Field Submissions", "Count Physical Cash Deposit", "Approve & Release Commission"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Open Partner Collection Queue",
        description: "Navigate to Partners > Collection Requests. View pending requests submitted by sales agents and field collectors.",
        fieldDetails: "Partner Name, Submission Date, Total Cash Handover (₹), Customer Receipts Count.",
      },
      {
        step: 2,
        title: "Verify Cash & Transaction Breakdown",
        description: "Verify physical cash handover from the partner against the itemized customer receipts list in the batch.",
        fieldDetails: "Expected Cash vs Physical Cash Handed Over, Variance Note.",
      },
      {
        step: 3,
        title: "Approve Batch & Post Receipts",
        description: "Click 'Approve Submission'. System posts all individual customer payments, marks EMIs as Paid, and credits the partner's commission ledger.",
        fieldDetails: "Approved Receipts Count, Partner Commission Earned (₹), Cashier Approval PIN.",
      },
    ],
    criticalRules: [
      "Partners cannot post directly to the financial ledger; all field submissions must be approved by an authorized showroom cashier.",
      "Commissions accrue automatically based on the partner's agreed commission tier upon approval.",
    ],
    staffOperationalTip: "Count partner cash deposits immediately upon arrival; do not let field partners leave the showroom before the batch is verified.",
    scopeOfImprovement: [
      "Add a partner mobile app interface with offline receipt caching for remote rural areas.",
    ],
  },
  {
    id: "capture-sales-lead",
    intent: "Capture Walk-in / Digital Lead & Assign to Sales Executive",
    category: "crm-customers",
    routePrefix: "/admin/crm",
    actionHref: "/admin/crm/leads",
    actionLabel: "New Lead",
    breadcrumbSteps: ["CRM & Customers", "Leads Master", "Create Lead", "Record Customer Interest & Budget", "Select Lead Source (Walk-in, WhatsApp, Facebook)", "Assign to Sales Staff & Set Follow-Up Date"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Record Prospective Buyer Details",
        description: "Open CRM > Leads > Create Lead. Enter visitor's name, mobile number, and preferred furniture category (e.g. Sofa Set, Bedroom Combo).",
        fieldDetails: "Prospect Name, Mobile, Furniture Interest, Budget Range (₹).",
      },
      {
        step: 2,
        title: "Select Inquiry Source & Plan Preference",
        description: "Choose how the customer found us: Walk-in Showroom, WhatsApp Catalog, Facebook Ad, Referral. Choose plan: Lucky Plan EMI, Rent, or Direct Retail Sale.",
        fieldDetails: "Lead Source, Plan Interest (EMI / RENT / LEASE / RETAIL).",
      },
      {
        step: 3,
        title: "Assign Sales Executive & Schedule Follow-Up",
        description: "Assign lead to a showroom sales representative. Set target follow-up call date and time (e.g. Tomorrow at 11 AM).",
        fieldDetails: "Assigned Staff, Follow-Up Date, Initial Notes.",
      },
    ],
    criticalRules: [
      "Every walk-in customer who spends >5 minutes in the showroom must be logged as a lead before leaving.",
    ],
    staffOperationalTip: "Ask walk-ins 'Which room in your house are you setting up?' to understand their complete furniture requirement rather than just selling one chair.",
    scopeOfImprovement: [
      "Auto-capture leads from WhatsApp Business chat messages using incoming webhook triggers.",
    ],
  },
  {
    id: "lead-conversion-pipeline",
    intent: "Track Lead Stages & Convert Qualified Lead into Customer Contract",
    category: "crm-customers",
    routePrefix: "/admin/crm",
    actionHref: "/admin/crm/leads/conversion",
    actionLabel: "Convert Lead",
    breadcrumbSteps: ["CRM & Customers", "Lead Conversion Pipeline", "Review Follow-Up Call Logs", "Select Won Lead", "Click 'Convert to Customer'", "Auto-Populate Contract Draft", "Finalize Sale"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Review Follow-Up Interactions",
        description: "Open Leads Pipeline. Check interaction notes (e.g. 'Customer visited with wife on Sunday, agreed on 6-seater teak dining set').",
        fieldDetails: "Lead ID, Interaction History, Stage: READY_TO_BUY.",
      },
      {
        step: 2,
        title: "Convert Lead to Official Customer Profile",
        description: "Click 'Convert Lead'. The system creates a permanent Customer Profile in CRM, copying over contact details and address without duplicate typing.",
        fieldDetails: "Created Customer ID, Converted By Staff, Conversion Timestamp.",
      },
      {
        step: 3,
        title: "Spawn Target Contract or Retail Invoice",
        description: "Choose destination: Create Lucky Plan Contract, Create Rental Agreement, or Create Direct POS Sale. The selected products autofill.",
        fieldDetails: "Target Flow, Selected Product SKU, Converted Contract ID.",
      },
    ],
    criticalRules: [
      "Converted leads lock their initial source so marketing attribution ROI reports remain accurate.",
      "Sales commission calculates for the assigned executive upon contract activation.",
    ],
    staffOperationalTip: "Review your 'Overdue Follow-ups' tab every afternoon at 2 PM to reconnect with interested buyers before competitors do.",
    scopeOfImprovement: [
      "Include automated customer conversion journey analytics showing average days-to-close by furniture category.",
    ],
  },
  {
    id: "partner-onboarding-payout",
    intent: "Onboard Sales Partner / Agent & Settle Monthly Commissions",
    category: "crm-customers",
    routePrefix: "/admin/partners",
    actionHref: "/admin/partners",
    actionLabel: "Manage Partners",
    breadcrumbSteps: ["CRM & Customers", "Partner Register", "Create Partner Profile", "Configure Commission Slab (Per Enrollment / Collection %)", "Audit Monthly Commission Ledger", "Post Payout with Bank UTR"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Create Agent / Partner Profile",
        description: "Go to Partners > Create Partner. Enter partner's name, agency name, phone, locality, and bank account details.",
        fieldDetails: "Partner Name, Contact Phone, Operating Territory, Bank Account & IFSC.",
      },
      {
        step: 2,
        title: "Set Commission Agreement Rules",
        description: "Configure commission structure: Flat Enrollment Bonus (e.g. ₹200 per new customer) and/or Collection Incentive (e.g. 2% of collected EMIs).",
        fieldDetails: "Enrollment Incentive (₹), Collection Incentive %, Payout Frequency.",
      },
      {
        step: 3,
        title: "Review Monthly Earned Commissions",
        description: "In Partner Commissions, review accrued earnings for the month. System aggregates all approved collections and active subscriptions.",
        fieldDetails: "Total Collections Made (₹), Gross Commission (₹), Advance Deductions (-₹), Net Payout (₹).",
      },
      {
        step: 4,
        title: "Post Payout & Issue Commission Voucher",
        description: "Click 'Settle Commission'. Enter bank payment UTR number. Generates Commission Remittance Voucher and sends WhatsApp confirmation.",
        fieldDetails: "Payment UTR, Bank Account, Commission Voucher No, Status: PAID.",
      },
    ],
    criticalRules: [
      "Commission cannot be paid on unapproved or pending collection requests.",
      "Commission expense posts to 'Commission Expense' and credits 'Bank Account' in the General Ledger.",
    ],
    staffOperationalTip: "Distribute monthly commission payouts on a fixed date (e.g. 5th of every month) to keep field agents highly motivated.",
    scopeOfImprovement: [
      "Add a dedicated Partner Leaderboard showing top 3 performing agents with special bonus badges.",
    ],
  },
  {
    id: "automated-payment-reminders",
    intent: "Send Automated WhatsApp / SMS Payment Reminders & Due Notices",
    category: "crm-customers",
    routePrefix: "/admin/reminders",
    actionHref: "/admin/reminders",
    actionLabel: "Reminders Hub",
    breadcrumbSteps: ["CRM & Customers", "Reminders Hub", "Filter Upcoming / Overdue Installments", "Select Message Template (Gentle, Due Today, Urgent Defaulter)", "Preview Personalized Tags (Name, Amount, Due Date)", "Broadcast Reminders via WhatsApp & SMS"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Select Target Customer Group",
        description: "Open Reminders Hub. Choose segment: Due in 3 Days (gentle reminder), Due Today (courtesy reminder), or Overdue 7+ Days (urgent notice).",
        fieldDetails: "Customer Segment, Target Month, Total Due Count.",
      },
      {
        step: 2,
        title: "Select Authorized Message Template",
        description: "Pick the message template. System auto-populates dynamic tags: {customer_name}, {due_amount}, {due_date}, {lucky_id}, and {payment_link}.",
        fieldDetails: "Template Name, Language (Bengali, Hindi, English), Channel (WhatsApp / SMS).",
      },
      {
        step: 3,
        title: "Broadcast & Monitor Delivery Status",
        description: "Click 'Send Reminders'. Messages dispatch through WhatsApp Business API and SMS gateway. Review real-time delivery ticks (Sent, Delivered, Read).",
        fieldDetails: "Dispatched Count, Successful Delivery %, Failed Numbers.",
      },
    ],
    criticalRules: [
      "Reminders must comply with telecom DND and commercial timing rules: never send promotional/collection messages between 9 PM and 8 AM.",
      "Customer opt-out requests must be honored immediately under DPDP privacy regulations.",
    ],
    staffOperationalTip: "Send gentle WhatsApp reminders 2 days before the due date; over 60% of customers pay on time simply because of the timely polite reminder.",
    scopeOfImprovement: [
      "Embed a one-click UPI payment button inside the WhatsApp reminder message.",
    ],
  },
  {
    id: "dispatch-delivery",
    intent: "Schedule & Dispatch a Delivery (Delivery Challan)",
    category: "delivery",
    routePrefix: "/admin/deliveries",
    actionHref: "/admin/deliveries",
    actionLabel: "Deliveries",
    breadcrumbSteps: ["Delivery & Logistics", "Deliveries Hub", "Select Order or Contract", "Check Prepayment / Delivery Unlock Status", "Assign Driver, Vehicle & Scheduled Date", "Print Official Delivery Challan (Challan-3 Copies)", "Dispatch Truck"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Verify Delivery Financial Clearance",
        description: "Open Deliveries. Select order. Ensure payment readiness is cleared (down payment received or first EMI paid). System blocks delivery if finance flag is locked.",
        fieldDetails: "Order Number, Customer Address, Delivery Clearance: UNLOCKED.",
      },
      {
        step: 2,
        title: "Assign Vehicle & Delivery Crew",
        description: "Assign truck vehicle number (e.g. WB-38-XXXX), driver name, phone number, and delivery date/time slot.",
        fieldDetails: "Vehicle No, Driver Name, Contact Number, Scheduled Slot (Morning / Evening).",
      },
      {
        step: 3,
        title: "Print Triple-Copy Delivery Challan",
        description: "Click 'Generate Delivery Challan'. Prints 3 standard copies: Customer Copy, Showroom Gate Pass, and Store Archive Copy.",
        fieldDetails: "Challan Number (DC-XXXXX), Itemized Furniture List, Handover Instructions.",
      },
      {
        step: 4,
        title: "Dispatch Truck & Notify Customer",
        description: "Click 'Dispatch'. Customer receives an automated SMS: 'Your furniture is out for delivery with driver Ramesh (Phone: 98XXXXXX)'.",
        fieldDetails: "Status: OUT_FOR_DELIVERY, Tracking Link.",
      },
    ],
    criticalRules: [
      "Delivery state and payment state are separate concerns; however, contracts with unpaid mandatory down-payment cannot be dispatched.",
      "The driver must obtain physical signature on the store delivery challan copy upon arrival.",
    ],
    staffOperationalTip: "Call the customer 1 hour before the truck departs to ensure someone is home and the room is cleared for furniture assembly.",
    scopeOfImprovement: [
      "Add live GPS truck tracking link sent to the customer on WhatsApp.",
    ],
  },
  {
    id: "batched-partial-delivery",
    intent: "Execute Batched Partial Delivery for Multi-Item Contracts & Split Challans",
    category: "delivery",
    routePrefix: "/admin/deliveries",
    actionHref: "/admin/deliveries",
    actionLabel: "Partial Delivery",
    breadcrumbSteps: ["Delivery & Logistics", "Deliveries Master", "Select Multi-Item Rental / Sales Contract", "Select Ready Items for Batch 1 Delivery", "Defer Pending / In-Production Items to Batch 2", "Generate Batched Delivery Challan (Batch #1)", "Track Line-Item Progress Workbench"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Select Multi-Item Contract",
        description: "When a customer contract contains multiple items (e.g. 1 Bed, 2 Mattresses, 1 Wardrobe, 1 Center Table) and only some are ready in stock.",
        fieldDetails: "Contract ID, Total Contract Items Count, Delivered So Far Count.",
      },
      {
        step: 2,
        title: "Select Specific Items for Current Dispatch Batch",
        description: "In the Batched Delivery Workbench, check off the items ready today (e.g. Bed + Mattresses). Leave in-production items (Wardrobe) unchecked.",
        fieldDetails: "Selected Items, Quantities for Batch #1, Remaining Balance for Batch #2.",
      },
      {
        step: 3,
        title: "Generate Batch-Specific Delivery Challan",
        description: "Click 'Create Batched Challan'. System assigns Batch Number (e.g. 'Batch 1 of 2') and prints a legal challan listing only the selected items.",
        fieldDetails: "Challan No (DC-XXXX-B1), Batch Sequence: 1, Included Items.",
      },
      {
        step: 4,
        title: "Monitor Item-Wise Delivery Progress",
        description: "The contract summary displays progress: '60% Delivered (3 of 5 items)'. When workshop finishes remaining items, dispatch Batch #2 to complete fulfillment.",
        fieldDetails: "Progress Bar, Line Status: DELIVERED / PENDING_BATCH_2.",
      },
    ],
    criticalRules: [
      "Inventory stock is deducted strictly for the item quantities dispatched in that specific batch challan.",
      "Proof of Delivery (POD) must be captured separately for each delivery batch.",
    ],
    staffOperationalTip: "Clearly explain partial batching to the customer: 'We are delivering your bed today so you can sleep comfortably; the matching wardrobe will arrive on Thursday'.",
    scopeOfImprovement: [
      "Automate SMS alert to the customer detailing which items are included in today's delivery batch.",
    ],
  },
  {
    id: "capture-pod-signature",
    intent: "Mobile / Field Capture of Proof of Delivery (POD) Signature & Photo",
    category: "delivery",
    routePrefix: "/admin/deliveries",
    actionHref: "/admin/deliveries/pod-capture",
    actionLabel: "POD Capture",
    breadcrumbSteps: ["Delivery & Logistics", "POD Mobile Capture", "Locate Dispatched Challan", "Customer Digital Signature on Screen", "Take Photo of Assembled Furniture in Room", "Confirm Delivery Completion"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Open POD Capture on Mobile Phone",
        description: "Delivery driver opens POD Capture link on smartphone. Scan challan QR code or select customer name.",
        fieldDetails: "Challan Number, Customer Name, Delivered Items List.",
      },
      {
        step: 2,
        title: "Capture Digital Signature on Touchscreen",
        description: "Customer signs their signature directly on the mobile screen confirming satisfactory receipt and assembly.",
        fieldDetails: "Touchscreen Signature Canvas, Signer Name, Relationship (Self / Spouse / Family).",
      },
      {
        step: 3,
        title: "Take Photo of Installed Furniture",
        description: "Snap a clear photo showing the furniture assembled in the customer's living room/bedroom with zero transit damage.",
        fieldDetails: "Camera Photo Upload, GPS Timestamp, Geo-coordinates.",
      },
      {
        step: 4,
        title: "Submit POD & Mark Contract Active",
        description: "Click 'Submit POD'. System uploads proof, updates status to DELIVERED, and unlocks contract commencement date.",
        fieldDetails: "POD Document ID, Status: DELIVERED, Completed At.",
      },
    ],
    criticalRules: [
      "POD signature and installed photo protect the store against post-delivery fraudulent damage claims.",
      "Once POD is submitted, the delivery state transitions to immutable 'DELIVERED'.",
    ],
    staffOperationalTip: "Ask the customer to inspect drawer sliders and door hinges before signing the mobile screen.",
    scopeOfImprovement: [
      "Send an automatic thank-you message to the customer with their digital POD receipt and care instructions.",
    ],
  },
  {
    id: "log-warranty-service",
    intent: "Log a Customer Warranty Claim or Service Ticket",
    category: "delivery",
    routePrefix: "/admin/warranty",
    actionHref: "/admin/warranty/claims",
    actionLabel: "Warranty Claims",
    breadcrumbSteps: ["Delivery & Logistics", "Service & Warranty", "Log Service Ticket", "Identify Customer & Original Product", "Check Active Warranty Window", "Record Defect Description & Upload Photo", "Assign Carpenter for On-Site Repair", "Close Ticket & Record Repair Cost"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Identify Customer & Furniture Unit",
        description: "Search customer by mobile number. Select the purchased or rented furniture piece from their asset history.",
        fieldDetails: "Customer Name, Product SKU, Serial / Asset Code, Delivery Date.",
      },
      {
        step: 2,
        title: "Validate Warranty Period",
        description: "System checks active warranty duration (e.g. 12-month structural warranty). Displays whether issue is Under Warranty or Chargeable Service.",
        fieldDetails: "Warranty Status: ACTIVE / EXPIRED, Months Remaining.",
      },
      {
        step: 3,
        title: "Log Defect Details & Photos",
        description: "Record issue: Loose Hinge, Polish Fading, Joint Crack, Cushion Sagging. Upload photos sent by customer on WhatsApp.",
        fieldDetails: "Defect Category, Issue Description, Defect Photos.",
      },
      {
        step: 4,
        title: "Dispatch Technician & Resolve",
        description: "Assign mobile service carpenter. After home visit, record resolution (Repaired on-site, Replaced component, or Replaced whole unit).",
        fieldDetails: "Assigned Technician, Service Date, Replacement Parts Used, Status: RESOLVED.",
      },
    ],
    criticalRules: [
      "Physical abuse, water soaking, or unauthorized alterations void free warranty coverage.",
      "Service tickets must be acknowledged within 24 hours of customer logging.",
    ],
    staffOperationalTip: "Equip the service carpenter with a portable touch-up kit (matching wood wax, polish spray, extra screws) so 80% of issues are fixed in 15 minutes.",
    scopeOfImprovement: [
      "Allow customers to submit photo warranty requests directly through the website customer portal.",
    ],
  },
  {
    id: "rental-return-inspection",
    intent: "Conduct Rental Return Pickup, Damage Grading & Deposit Offset",
    category: "delivery",
    routePrefix: "/admin/refunds",
    actionHref: "/admin/refunds/inspection",
    actionLabel: "Return Inspection",
    breadcrumbSteps: ["Delivery & Logistics", "Rental Returns", "Schedule Return Pickup", "On-Site Condition Grading (Fair Wear vs Damage)", "Calculate Repair Deductions", "Handover to Workshop Refurbishing", "Release Remaining Deposit"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Schedule Return Pickup Trip",
        description: "When customer contract concludes, open Return Inspections. Assign pickup truck and inspection technician.",
        fieldDetails: "Contract ID, Pickup Address, Scheduled Pickup Date.",
      },
      {
        step: 2,
        title: "On-Site Physical Inspection & Grading",
        description: "Inspect returned furniture: Grade A (Excellent / Normal Wear), Grade B (Minor Polish Scratches), Grade C (Broken Hardware / Deep Gouges / Burns).",
        fieldDetails: "Condition Grade (A/B/C), Inspection Checklist, Photo Evidence.",
      },
      {
        step: 3,
        title: "Assess Repair & Polish Deductions",
        description: "If Grade B or C, input standard damage deduction from rate card (e.g. ₹500 for re-polishing, ₹1,200 for fabric reupholstery). Customer signs agreement.",
        fieldDetails: "Damage Deduction (₹), Customer Agreement Signature.",
      },
      {
        step: 4,
        title: "Transfer Asset to Refurbishment Bay",
        description: "Furniture returns to warehouse under 'IN_SERVICE' status. Once polished and cleaned, asset transitions back to 'AVAILABLE' for next customer.",
        fieldDetails: "Warehouse Bay, Refurbishing Job ID, Next Available Date.",
      },
    ],
    criticalRules: [
      "Normal fair wear-and-tear cannot be charged to the customer under rental agreements.",
      "Any damage deduction must have an accompanying photo and customer signed inspection slip.",
    ],
    staffOperationalTip: "Clearly explain what counts as 'normal wear' vs 'damage' during contract sign-up to set transparent customer expectations.",
    scopeOfImprovement: [
      "Create a standardized visual photo guide for delivery staff showing Grade A, B, and C condition benchmarks.",
    ],
  },
  {
    id: "generate-salary-sheet",
    intent: "Generate Monthly Staff Salary Sheet & Labor Payroll",
    category: "hr-payroll",
    routePrefix: "/admin/hr",
    actionHref: "/admin/hr/payroll",
    actionLabel: "Generate Payroll",
    breadcrumbSteps: ["HR & Staff", "Monthly Payroll", "Select Payroll Month & Year", "Pull Attendance & Days Worked", "Aggregate Piece-Rate Workshop Labor", "Deduct Salary Advances & Loans", "Finalize & Disburse Salary"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Select Payroll Period",
        description: "Open HR > Payroll > Generate Salary Sheet. Choose month and year (e.g. October 2026).",
        fieldDetails: "Payroll Month, Financial Year, Staff Department (Showroom / Workshop / Logistics).",
      },
      {
        step: 2,
        title: "Auto-Pull Attendance & Piece-Rate Earnings",
        description: "System automatically calculates base salary for showroom staff based on days worked, and compiles piece-rate labor lines for workshop carpenters.",
        fieldDetails: "Base Pay (₹), Verified Overtime / Piece-Rate Earnings (₹), Sales Commission (₹).",
      },
      {
        step: 3,
        title: "Auto-Deduct Mid-Month Advances",
        description: "Any salary advances taken by staff during the month automatically appear as deductions against net pay.",
        fieldDetails: "Advance Salary Deductions (-₹), Loan Repayments (-₹), Net Payable Salary (₹).",
      },
      {
        step: 4,
        title: "Lock Payroll & Disburse via Bank / Cash",
        description: "Review summary. Click 'Finalize Payroll'. Books Salary Expense journal entry and generates bank transfer NEFT batch file.",
        fieldDetails: "Total Payroll Value (₹), Bank Transfer Batch File, Payslip PDF Generation.",
      },
    ],
    criticalRules: [
      "Unposted ProductionLaborLine records for workshop employees must be pulled before finalizing monthly payroll.",
      "Once finalized and locked, a salary sheet cannot be edited without formal management unlock.",
    ],
    staffOperationalTip: "Ensure all workshop carpenters have logged their completed job piece cards by the 28th of the month so payroll runs smoothly on the 1st.",
    scopeOfImprovement: [
      "Enable automated WhatsApp delivery of individual encrypted monthly payslip PDFs to staff members.",
    ],
  },
  {
    id: "onboard-staff-employee",
    intent: "Add New Employee Profile, Shift Timing & Designation",
    category: "hr-payroll",
    routePrefix: "/admin/hr",
    actionHref: "/admin/hr/staff/create",
    actionLabel: "New Employee",
    breadcrumbSteps: ["HR & Staff", "Staff Directory", "Add Employee", "Enter Personal Details & KYC", "Set Designation & Department", "Configure Salary Structure (Fixed / Piece-Rate / Commission)", "Activate Staff Login"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Record Employee Identity & Contact Info",
        description: "Open HR > Staff > Add Employee. Enter full name, mobile number, emergency contact, Aadhaar number, and home address.",
        fieldDetails: "Employee Name, Phone, Aadhaar No, Emergency Contact.",
      },
      {
        step: 2,
        title: "Assign Department & Operational Role",
        description: "Select role: Showroom Cashier, Sales Consultant, Workshop Carpenter, Polishing Technician, or Delivery Driver. Assign branch location.",
        fieldDetails: "Department, Designation, Assigned Branch, Date of Joining.",
      },
      {
        step: 3,
        title: "Configure Compensation Structure",
        description: "Set pay type: Monthly Fixed Salary (₹/month), Daily Wage (₹/day), or Piece-Rate Labor. Configure sales commission eligibility if applicable.",
        fieldDetails: "Compensation Mode, Monthly Base (₹), Standard Day Rate (₹), Commission Slab %.",
      },
      {
        step: 4,
        title: "Input Bank Account for Direct Salary Credit",
        description: "Enter employee's bank details for monthly direct deposit salary transfers.",
        fieldDetails: "Bank Name, Account Number, IFSC Code.",
      },
    ],
    criticalRules: [
      "Aadhaar and PAN details are mandatory for compliance with wage records.",
      "Staff user accounts must have assigned RBAC security roles before accessing the admin dashboard.",
    ],
    staffOperationalTip: "Collect a copy of the employee's bank passbook front page to prevent salary transfer rejections due to typos in account numbers.",
    scopeOfImprovement: [
      "Add digital staff onboarding where new hires can upload their KYC documents and bank passbook from their phone.",
    ],
  },
  {
    id: "record-salary-advance",
    intent: "Record Staff Salary Advance & Automated Monthly Payroll Deduction",
    category: "hr-payroll",
    routePrefix: "/admin/hr",
    actionHref: "/admin/hr/staff-advances",
    actionLabel: "Staff Advance",
    breadcrumbSteps: ["HR & Staff", "Staff Advances", "New Advance Voucher", "Select Employee & Amount", "Approve & Disburse from Cash Drawer", "Auto-Deduct from Next Paycheck"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Select Employee Requesting Advance",
        description: "Go to HR > Staff Advances > New Advance. Select employee. The system displays current month earned wages to prevent over-borrowing.",
        fieldDetails: "Employee Name, Current Month Earned Wages (₹), Existing Loan Balance (₹).",
      },
      {
        step: 2,
        title: "Enter Advance Amount & Recovery Terms",
        description: "Input advance amount (e.g. ₹3,000 for emergency medical). Choose recovery: Full Deduction from Next Salary, or Split across 2 months.",
        fieldDetails: "Advance Amount (₹), Recovery Plan (Single Month / Installments), Reason Note.",
      },
      {
        step: 3,
        title: "Disburse Cash & Post Advance Ledger",
        description: "Click 'Approve & Disburse'. Cashier hands over cash from till. Posts debit to Staff Advance Asset and credit to Cash Drawer.",
        fieldDetails: "Advance Voucher No, Disbursed Cash Account, Employee Signature.",
      },
    ],
    criticalRules: [
      "Staff advances cannot exceed 50% of the employee's expected monthly earned compensation without owner approval.",
      "The advance is automatically locked and deducted during the month-end salary sheet generation.",
    ],
    staffOperationalTip: "Have the staff member sign the printed Advance Cash Voucher slip before handing over physical currency notes.",
    scopeOfImprovement: [
      "Track staff advance recovery balances automatically in the solopreneur morning dashboard.",
    ],
  },
  {
    id: "staff-targets-leaderboard",
    intent: "Set Monthly Sales & Collection Targets and Track Performance",
    category: "hr-payroll",
    routePrefix: "/admin/crm",
    actionHref: "/admin/crm/leaderboard",
    actionLabel: "Leaderboard",
    breadcrumbSteps: ["HR & Staff", "Staff Targets & Leaderboard", "Configure Monthly Target Quotas", "Monitor Real-Time Sales Realization", "Review Conversion Rates & Commissions", "Reward Top Performers"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Assign Monthly Quotas to Sales & Field Staff",
        description: "Open CRM > Leaderboard > Targets. Set targets: New Contracts Enrolled (e.g. 25 contracts/month) and Total Collection Value (e.g. ₹2,00,000/month).",
        fieldDetails: "Staff Member, Target Month, Enrollment Target, Collection Target (₹).",
      },
      {
        step: 2,
        title: "Monitor Live Sales Gamification Board",
        description: "Staff view their real-time ranking on the showroom screen: Gold, Silver, Bronze badges based on target achievement percentage.",
        fieldDetails: "Target Achieved %, Current Rank, Estimated Incentive Bonus (₹).",
      },
    ],
    criticalRules: [
      "Leaderboard counts only verified, approved contracts and payments.",
    ],
    staffOperationalTip: "Display the leaderboard on a tablet in the staff lunch room; friendly competition increases sales conversion by 25%.",
    scopeOfImprovement: [
      "Automate celebration WhatsApp badges sent to staff when they hit 100% of their monthly quota.",
    ],
  },
  {
    id: "daily-executive-mis",
    intent: "Generate Daily Executive MIS & Cash Flow Summary Report",
    category: "bi-reports",
    routePrefix: "/admin/bi",
    actionHref: "/admin/bi",
    actionLabel: "Executive MIS",
    breadcrumbSteps: ["BI & Reports", "BI Analytics Hub", "Select Reporting Date", "Review Key Performance Indicators (KPIs)", "Analyze Money In vs Money Out", "Export Executive Summary PDF"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Open Executive BI Cockpit",
        description: "Navigate to BI & Reports > Dashboard. Select date range (Today, This Week, This Month, or Custom).",
        fieldDetails: "Reporting Date Range, Branch Filter (All Branches / Single Branch).",
      },
      {
        step: 2,
        title: "Analyze Core Financial & Operational KPIs",
        description: "Review executive metric tiles: Total Collections (₹), Direct Retail Revenue (₹), New Subscriptions Activated, Active On-Hire Assets, Net Liquid Cash Balance.",
        fieldDetails: "Gross Revenue, Realized Cash/Bank Inflow, Total Expenses Outflow, Net Operational Cash Flow.",
      },
      {
        step: 3,
        title: "Inspect Operational Health Breakdown",
        description: "Review fulfillment velocity: Pending Deliveries, Workshop WIP Jobs in progress, and Overdue Collection Aging.",
        fieldDetails: "Pending Delivery Orders, Manufacturing Output Units, 30+ Day Overdue Ratio %.",
      },
      {
        step: 4,
        title: "Export Daily MIS Report",
        description: "Click 'Export Daily Executive Report'. Generates a 1-page PDF briefing ideal for store owners and investors.",
        fieldDetails: "PDF Download Link, Automated WhatsApp Owner Dispatch.",
      },
    ],
    criticalRules: [
      "KPI aggregation dynamically maps child settlement accounts into parent liquid balances.",
      "Executive metrics derive strictly from posted immutable transactions; no cosmetic projections allowed.",
    ],
    staffOperationalTip: "Review this report at 8:00 PM every evening to assess whether the store met its daily revenue targets.",
    scopeOfImprovement: [
      "Schedule automated daily 9 PM executive PDF delivery to the owner's WhatsApp number.",
    ],
  },
  {
    id: "portfolio-aging-analysis",
    intent: "Analyze 30-60-90 Days Overdue EMI Portfolio Aging & Recovery Rates",
    category: "bi-reports",
    routePrefix: "/admin/reports",
    actionHref: "/admin/reports/overdue",
    actionLabel: "Overdue Aging",
    breadcrumbSteps: ["BI & Reports", "Overdue Portfolio Report", "Review Aging Buckets (1-30, 31-60, 61-90, 90+ Days)", "Identify Chronic Defaulters", "Export Telecalling & Field Recovery List"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Inspect Aging Distribution Buckets",
        description: "Open Reports > Overdue Aging. The system segments overdue contracts into 4 risk tiers: Tier 1 (1-30 Days), Tier 2 (31-60 Days), Tier 3 (61-90 Days), and Tier 4 (90+ Days Critical Default).",
        fieldDetails: "Portfolio at Risk (PAR) %, Total Overdue Capital (₹), Default Ratio %.",
      },
      {
        step: 2,
        title: "Drill Down by Scheme Batch & Territory",
        description: "Filter by scheme batch or geographic locality to see which regions have high payment delinquency.",
        fieldDetails: "Batch Breakdown, Area Breakdown, Worst Performing Beats.",
      },
      {
        step: 3,
        title: "Export Targeted Recovery Action Worksheets",
        description: "Export the overdue contact list to Excel for telecallers and field recovery officers with phone numbers and home addresses.",
        fieldDetails: "Recovery Sheet (.xlsx), Customer Phone, Landmark, Outstanding Amount.",
      },
    ],
    criticalRules: [
      "Accounts in the 90+ days bucket must be formally reviewed for bad-debt provisioning under retail accounting standards.",
    ],
    staffOperationalTip: "Focus 80% of collection recovery phone calls on the 1-30 days bucket; early intervention prevents customers from slipping into chronic default.",
    scopeOfImprovement: [
      "Add machine-learning default probability indicators predicting which customers might miss their upcoming payment.",
    ],
  },
  {
    id: "rental-yield-analytics",
    intent: "Monitor Rental Asset ROI, Fleet Utilization & Monthly Yield Performance",
    category: "bi-reports",
    routePrefix: "/admin/reports",
    actionHref: "/admin/reports/rent-lease",
    actionLabel: "Rental Yields",
    breadcrumbSteps: ["BI & Reports", "Rent & Lease Analytics", "Inspect Overall Fleet Utilization %", "Analyze Yield by Furniture Category (Beds vs Sofas)", "Evaluate Asset Payback Cycles"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Review Rental Fleet Utilization Rate",
        description: "Open Rental Analytics. Inspect Utilization %: (Assets On-Hire / Total Assets in Rental Pool) * 100. Target is >85% active utilization.",
        fieldDetails: "Total Fleet Value (₹), Assets On-Hire Count, Warehouse Idle Count, Utilization %.",
      },
      {
        step: 2,
        title: "Analyze Category-Wise Monthly Yield",
        description: "Compare monthly cash yields across categories: e.g. Dining Sets (4.2% monthly yield), Box Beds (3.8%), Wardrobes (3.5%).",
        fieldDetails: "Category Yield %, Average Tenure Duration, Monthly Recurring Revenue (MRR).",
      },
      {
        step: 3,
        title: "Track Asset Payback & Depreciation Return",
        description: "Review how many months of rental it takes for an asset to fully recover its manufacturing cost (average target: 14-18 months).",
        fieldDetails: "Average Payback Months, Cumulative Asset Margin %, Second-Cycle Profitability.",
      },
    ],
    criticalRules: [
      "Assets idle in warehouse for >60 days should have their rental rates adjusted or bundled into promotional packages.",
    ],
    staffOperationalTip: "Promote categories with >4% monthly yield to corporate executive tenants for maximum annual returns.",
    scopeOfImprovement: [
      "Provide automated recommendations for which furniture models to produce more of based on highest rental ROI.",
    ],
  },
  {
    id: "product-profitability-report",
    intent: "Evaluate Product Margin, Cost of Production & Sales Contribution",
    category: "bi-reports",
    routePrefix: "/admin/bi",
    actionHref: "/admin/bi/profitability",
    actionLabel: "Profitability",
    breadcrumbSteps: ["BI & Reports", "Product Profitability", "Compare Production Landed Cost vs Selling Price", "Inspect Gross Profit Margin % per SKU", "Identify Top 20% Revenue Generators (Pareto Analysis)"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Inspect SKU-Wise Gross Margins",
        description: "Open Product Profitability. The report compares manufacturing BOM cost (or vendor purchase cost) against realized selling price.",
        fieldDetails: "Product SKU, Unit Cost (₹), Selling Price (₹), Gross Profit Margin %.",
      },
      {
        step: 2,
        title: "Identify Star Products vs Slow Movers",
        description: "Filter by sales velocity and margin contribution to identify high-margin winners vs slow-moving low-margin inventory.",
        fieldDetails: "Units Sold, Total Revenue Contribution, Gross Margin Contribution (₹).",
      },
    ],
    criticalRules: [
      "Cost of goods sold (COGS) calculations incorporate verified workshop labor lines and raw material issue records.",
    ],
    staffOperationalTip: "Showroom sales staff should steer undecided walk-ins toward products with >35% gross profit margin.",
    scopeOfImprovement: [
      "Add automated discount ceiling alerts warning sales staff if a negotiated discount drops margin below 20%.",
    ],
  },
  {
    id: "configure-document-numbering",
    intent: "Configure Document Numbering Sequences & Legal Branding",
    category: "business-setup",
    routePrefix: "/admin/settings",
    actionHref: "/admin/settings/business-setup/document-numbering",
    actionLabel: "Document Prefixes",
    breadcrumbSteps: ["Business Setup", "Document Numbering", "Select Entity Series (Invoices, Receipts, Challans, POs)", "Configure Custom Prefix & Year Slug", "Set Starting Serial Sequence", "Save Sequence Rules"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Select Document Type",
        description: "Open Settings > Document Numbering. Choose document series: TAX_INVOICE, RECEIPT, DELIVERY_CHALLAN, PURCHASE_ORDER, REFUND_VOUCHER.",
        fieldDetails: "Document Type, Current Sequence Number, Active Prefix.",
      },
      {
        step: 2,
        title: "Configure Prefix Pattern & Financial Year Tag",
        description: "Set prefix format (e.g. SUB/26-27/INV- for tax invoices, SUB/REC- for receipts, DC/26/ for delivery challans).",
        fieldDetails: "Prefix Pattern, Include Financial Year (Yes/No), Minimum Digits Padding (e.g. 5 digits -> 00001).",
      },
      {
        step: 3,
        title: "Set Sequence Baseline & Lock",
        description: "Input starting sequence number (e.g. 1001 if continuing an existing financial year). Save configuration.",
        fieldDetails: "Next Number, Sample Preview: SUB/26-27/INV-01001.",
      },
    ],
    criticalRules: [
      "Sequence numbers must be strictly sequential without gaps under Indian GST invoicing rules.",
      "Prefix and sequence baseline cannot be decreased below already issued document numbers.",
    ],
    staffOperationalTip: "Reset sequence prefixes on April 1st of each year to incorporate the new financial year slug (e.g. 26-27).",
    scopeOfImprovement: [
      "Automate financial year sequence rollover on midnight of March 31st.",
    ],
  },
  {
    id: "business-identity-gst-setup",
    intent: "Setup Company Legal Entity, GSTIN, Default Bank & Store Addresses",
    category: "business-setup",
    routePrefix: "/admin/settings",
    actionHref: "/admin/settings/business-setup/profile",
    actionLabel: "Store Profile",
    breadcrumbSteps: ["Business Setup", "Store & Entity Profile", "Enter Legal Entity Name & Trade Name", "Configure Primary GSTIN & PAN", "Set Showroom Address & Contact Info", "Upload Official Logo & Stamp for Prints"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Enter Legal Business Information",
        description: "Navigate to Settings > Business Profile. Enter legal registered entity name (e.g. 'Subidha Furniture & Electronics Private Limited') and trade name ('SUBIDHA CORE').",
        fieldDetails: "Legal Name, Trade Name, Company PAN, CIN / Registration Number.",
      },
      {
        step: 2,
        title: "Configure GSTIN & State Tax Details",
        description: "Enter official 15-character GSTIN. System parses State Code (e.g. 19 for West Bengal) to govern intra-state vs inter-state tax splits (CGST+SGST vs IGST).",
        fieldDetails: "GSTIN, State Code, Tax Registration Type (Regular / Composition).",
      },
      {
        step: 3,
        title: "Set Showroom Physical Location & Support Contact",
        description: "Enter official showroom address, customer care helpline, email, and website URL that will print on invoices and receipts.",
        fieldDetails: "Showroom Address, Support Phone, WhatsApp Helpline, Email.",
      },
      {
        step: 4,
        title: "Upload High-Resolution Logo & Official Stamp",
        description: "Upload monochrome or color transparent PNG logo (300 DPI) and authorized signatory stamp for digital invoice headers and receipts.",
        fieldDetails: "Logo Image URL, Authorized Signatory Name & Stamp.",
      },
    ],
    criticalRules: [
      "The legal entity name and GSTIN configured here print on every customer tax invoice, delivery challan, and purchase bill.",
      "Changes to legal entity name require supervisor password verification.",
    ],
    staffOperationalTip: "Ensure the official WhatsApp helpline number is correctly configured here; it prints at the bottom of every customer receipt.",
    scopeOfImprovement: [
      "Add automated GSTIN verification via government portal to auto-fill business name and address.",
    ],
  },
  {
    id: "user-roles-permissions",
    intent: "Configure Role-Based Access Control (RBAC) & Staff Security Permissions",
    category: "business-setup",
    routePrefix: "/admin/settings",
    actionHref: "/admin/settings/roles-permissions",
    actionLabel: "Roles & Access",
    breadcrumbSteps: ["Business Setup", "Roles & Permissions", "Select Security Role (Admin, Cashier, Sales, Logistics, Accountant)", "Configure Module Access (View / Create / Edit / Delete)", "Enforce Dual-Authorization for Financial Overrides", "Audit Active User Logins"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Select Security Role to Edit",
        description: "Open Settings > Roles & Permissions. Choose role: Admin (full solopreneur control), Cashier (collections & daily close), Sales Executive (leads & contracts), Workshop Foreman (BOM & jobs), Logistics (deliveries).",
        fieldDetails: "Role Name, Role Description, Active Users Count.",
      },
      {
        step: 2,
        title: "Set Module-Level Granular Permissions",
        description: "Check or uncheck access rights per module: e.g. Cashiers can view and collect payments, but CANNOT void payments or view profit & loss reports.",
        fieldDetails: "Permissions: Can View, Can Create, Can Edit, Can Reverse/Void, Can Export.",
      },
      {
        step: 3,
        title: "Enforce Supervisor Authorization Thresholds",
        description: "Set financial thresholds requiring supervisor PIN override: e.g. cash discounts > ₹1,000, payment reversals, or manual stock adjustments.",
        fieldDetails: "Discount Threshold (₹), Reversal Approval Required, Allow Manual Stock Override.",
      },
      {
        step: 4,
        title: "Save & Apply Security Policies",
        description: "Click 'Save Permissions'. User sessions immediately enforce updated access rules across web and mobile interfaces.",
        fieldDetails: "Audit Log Ref, Updated Timestamp, Admin User.",
      },
    ],
    criticalRules: [
      "Never share the solopreneur Admin superuser password with junior floor staff.",
      "Cashiers must not have permission to delete or retroactively edit settled payments.",
    ],
    staffOperationalTip: "Staff members should always log out of their shared counter computer terminal when stepping away for lunch.",
    scopeOfImprovement: [
      "Implement automatic session timeout after 15 minutes of inactivity on cashier terminals.",
    ],
  },
  {
    id: "legacy-data-migration",
    intent: "Import Historical Customers, Opening Balances & Legacy Receivables",
    category: "business-setup",
    routePrefix: "/admin/settings",
    actionHref: "/admin/settings/business-setup/data-migration",
    actionLabel: "Migration Center",
    breadcrumbSteps: ["Business Setup", "Migration Center", "Download Migration Staging Template", "Populate Legacy Receivables & Subscriptions", "Upload Staging Excel & Run Dry-Run Validation", "Commit to Live Ledgers with Migration Batch Tag"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Download Migration Staging Template",
        description: "Open Settings > Data Migration. Click 'Download Legacy Receivables Template (.xlsx)' to migrate balances from old paper ledgers or previous software.",
        fieldDetails: "Template Columns: customer_phone, customer_name, opening_receivable, scheme_name, emi_paid_count.",
      },
      {
        step: 2,
        title: "Populate Legacy Data Rows",
        description: "Enter existing customer details and outstanding balance amounts. Ensure phone numbers are 10 digits.",
        fieldDetails: "Customer Records Count, Total Legacy Receivable Value (₹).",
      },
      {
        step: 3,
        title: "Upload & Execute Pre-Migration Dry-Run",
        description: "Upload file into staging. The validation engine tests every row: phone syntax, account mapping, and duplicate checks without modifying live data.",
        fieldDetails: "Validated Rows, Errors Count, Staging Batch Number (MIG-BATCH-XXXX).",
      },
      {
        step: 4,
        title: "Commit to Production with Migration Linkage",
        description: "Click 'Commit Migration Batch'. Creates CustomerOpeningOutstanding records strictly linked to MigrationStagingRow for 100% audit traceability.",
        fieldDetails: "Total Receivables Capitalized (₹), Migration Batch Tag, Committed By Admin.",
      },
    ],
    criticalRules: [
      "CustomerOpeningOutstanding records must strictly link to their MigrationStagingRow via migration_row ForeignKey.",
      "Legacy opening receivables must roll into the Opening Balance equity ledger account, never regular revenue.",
    ],
    staffOperationalTip: "Double-check phone numbers of old customers in the Excel file before committing; clean phone numbers allow immediate WhatsApp communication.",
    scopeOfImprovement: [
      "Expose migration_batch_number directly on customer profiles so operators can trace legacy receivables in 1 click.",
    ],
  },
  {
    id: "dpdp-privacy-compliance",
    intent: "Manage Customer Consent, Right-to-Erasure & DPDP Data Retention",
    category: "business-setup",
    routePrefix: "/admin/privacy",
    actionHref: "/admin/privacy/retention-schedule",
    actionLabel: "DPDP Privacy",
    breadcrumbSteps: ["Business Setup", "DPDP Privacy & Compliance", "Review Customer Consent Logs", "Process Data Access or Correction Requests", "Execute Right-to-Erasure (Anonymization)", "Audit Data Retention Schedules"],
    stepByStepGuide: [
      {
        step: 1,
        title: "Review Customer Consent Log",
        description: "Open Privacy & Compliance. Inspect digital consent records captured during customer enrollment (marketing consent, Aadhaar KYC storage consent).",
        fieldDetails: "Customer ID, Consent Timestamp, Consent Purpose, Consent Channel.",
      },
      {
        step: 2,
        title: "Process Customer Grievance or Erasure Request",
        description: "When a customer requests data deletion under the Digital Personal Data Protection (DPDP) Act, open Erasure Requests Queue.",
        fieldDetails: "Request ID, Customer Phone, Reason for Request.",
      },
      {
        step: 3,
        title: "Execute Lawful Anonymization",
        description: "If customer has no active contracts or outstanding dues, click 'Anonymize Profile'. Replaces personal PII (name, phone, address) with irreversible hash tokens while preserving financial ledger totals.",
        fieldDetails: "Anonymized Hash ID, Retained Accounting History, Legal Retention Exemption.",
      },
      {
        step: 4,
        title: "Audit Data Retention Policies",
        description: "Review automated data retention schedule: inactive lead data purged after 180 days; financial accounting records retained for 8 years as required by tax law.",
        fieldDetails: "Retention Policy Name, Retention Period (Years), Purge Log.",
      },
    ],
    criticalRules: [
      "Customers with active contracts, pending EMIs, or unpaid invoices CANNOT be deleted or anonymized until settled.",
      "Accounting ledger and GST tax invoices must be preserved for 8 financial years under Companies Act and GST regulations.",
    ],
    staffOperationalTip: "Explain to customers that their phone number is used exclusively for payment receipts and warranty service, never shared with third-party telemarketers.",
    scopeOfImprovement: [
      "Provide a self-service privacy portal where customers can download a copy of their personal data in standard PDF format.",
    ],
  },
];

// ── 14 Canonical Business Domain Topics ───────────────────────────────────────
export const ADMIN_HELP_TOPICS: AdminHelpTopic[] = [
  // ── 1. Command Center & Operations ──────────────────────────────────────────
  {
    id: "command-center",
    title: "Command Center, Today Brief & Operations Cockpit",
    shortTitle: "Command Center",
    category: "command-center",
    badge: "Solopreneur Control",
    iconName: "gauge",
    pathPrefixes: [
      "/admin/dashboard",
      "/admin/today",
      "/admin/operations",
      "/admin/erp",
      "/admin/global-search",
      "/admin/notifications",
      "/admin/ai",
      "/admin/audit-logs",
      "/admin/documents",
      "/admin/close-cockpit",
      "/admin/universal",
      "/admin/control",
      "/admin/data-quality",
    ],
    summary:
      "Universal control cockpit for the single owner/admin: morning operational brief, urgent exception queues, real-time KPI health, and cross-module search.",
    whyNeeded:
      "A solopreneur administrator manages finance, collections, inventory, deliveries, and draw schedules simultaneously. Without a centralized command center, critical bottlenecks (pending KYC approvals, cash drawer variances, overdue collections, failed imports) are buried across 400+ screens. This cockpit provides a single glass pane for daily operational triage.",
    howItWorks:
      "1. Morning Brief: Aggregates pending collections today, scheduled furniture deliveries, and active KYC verification queues.\n2. Cross-Module Search (Ctrl+K): Instant search across customers, contract numbers, invoices, Lucky IDs, and products.\n3. Exception Feeds: Highlights unposted journals, inventory shortages (ATP), and cashier variances in real time.\n4. Close Cockpit: Enforces daily register lock and audit reconciliation at the end of business hours.",
    workflows: [
      {
        name: "Morning Solopreneur Routine",
        description: "Review today's urgent queues, scheduled deliveries, and expected collections.",
        steps: [
          {
            step: 1,
            title: "Check 'Today' Brief",
            description: "Open Admin > Today to view daily cash targets, overdue EMI follow-ups, and scheduled doorstep deliveries.",
            actionHref: "/admin/today",
            actionLabel: "Open Today Brief",
          },
          {
            step: 2,
            title: "Review KYC & Customer Approvals",
            description: "Check the customer KYC review queue for pending subscription enrollments.",
            actionHref: "/admin/crm/kyc",
            actionLabel: "KYC Queue",
          },
          {
            step: 3,
            title: "Check Delivery Dispatch Queue",
            description: "Verify vehicles and delivery orders assigned for today's dispatches.",
            actionHref: "/admin/deliveries",
            actionLabel: "Deliveries Hub",
          },
        ],
      },
      {
        name: "Universal Global Search & Actions (Ctrl+K)",
        description: "Locate any customer record, contract, or ledger row within 2 seconds.",
        steps: [
          {
            step: 1,
            title: "Trigger Command Palette",
            description: "Press Ctrl+K or click the Search bar in the topbar.",
          },
          {
            step: 2,
            title: "Search by Phone or Lucky ID",
            description: "Type a customer phone number, Lucky ID token, or invoice number to navigate directly to their workbench.",
          },
        ],
      },
    ],
    setupRequirements: [
      {
        title: "Workspace Profile",
        description: "Configure store identity, branch, and desktop view preferences.",
        setupHref: "/admin/settings/business-setup/profile",
      },
    ],
    invariants: [
      "The admin has universal unfettered operational access across all business modules.",
      "Operations in the command center must never bypass underlying ledger posting controls.",
    ],
    keyActions: [
      { label: "Today Overview", href: "/admin/today", variant: "primary" },
      { label: "Operations Hub", href: "/admin/operations", variant: "secondary" },
      { label: "End-of-Day Close", href: "/admin/close-cockpit", variant: "secondary" },
    ],
  },

  // ── 2. PIM & Products ────────────────────────────────────────────────────────
  {
    id: "pim-products",
    title: "Product Information Management (PIM) & Catalog Register",
    shortTitle: "PIM & Products",
    category: "pim-products",
    badge: "Catalog Core",
    iconName: "boxes",
    pathPrefixes: [
      "/admin/products",
      "/admin/pim",
      "/admin/inventory/finished-goods",
      "/admin/inventory/raw-materials",
      "/admin/inventory/accessories",
    ],
    summary:
      "Master catalog governance separating conceptual product blueprints from sellable variant SKUs, materials, inventory tracking, and sales channel readiness.",
    whyNeeded:
      "In furniture retail, a single design (e.g. 'Royal Sheesham Bed') comes in multiple sizes (King, Queen), timber species (Sheesham, Teak), fabric colors, and finishes. Without PIM, businesses create duplicate, disconnected product records that break stock tracking, pricing consistency, and catalog sanity. PIM provides a single source of truth for all selling channels (Lucky Plan EMI, Retail Direct Sale, Rental, and Leasing) and manufacturing BOMs.",
    howItWorks:
      "1. Blueprints act as the parent master defining standard specifications, categories, HSN/SAC codes, base pricing, and marketing descriptions.\n2. Variant SKUs are generated from attribute combinations (Size, Finish, Upholstery).\n3. Inventory Item Profiles link each sellable SKU to physical stock tracking, reorder thresholds, and warehouse valuation.\n4. Channel Readiness gates ensure a product is only sold once pricing, HSN tax codes, and stock profiles are verified.",
    workflows: [
      {
        name: "Create a New Product Blueprint & Publish SKUs",
        description: "Standard flow to introduce a new furniture product into SUBIDHA CORE.",
        steps: [
          {
            step: 1,
            title: "Create Base Blueprint",
            description: "Go to Products > Create Product. Select Item Type (Finished Good, Raw Material, Accessory) and Stock Type (Stock Item, Made-to-Order). Enter Product Name, Category, HSN/SAC code, and Base Price.",
            actionHref: "/admin/products/create",
            actionLabel: "New Product",
          },
          {
            step: 2,
            title: "Configure Categories & Attribute Groups",
            description: "Assign Category (Living Room, Bedroom, Dining) and configure custom attributes like Wood Type, Dimensions, and Fabric Material.",
            actionHref: "/admin/products/masters",
            actionLabel: "Manage Masters",
          },
          {
            step: 3,
            title: "Generate Variant SKUs",
            description: "In PIM Blueprints tab, generate SKUs for each size and finish permutation. Each variant receives a unique SKU code.",
            importantNote: "Variant SKU codes must remain unique across the entire catalog.",
          },
          {
            step: 4,
            title: "Activate Selling Channels & Inventory Readiness",
            description: "Mark which channels this product is eligible for: Advance EMI (Lucky Plan), Direct Sale, Rental, or Leasing. Check that 'Inventory Ready' badge is green.",
          },
        ],
      },
      {
        name: "Sync PIM Blueprints with Legacy Product Register",
        description: "Additive consolidation ensuring legacy Lucky Plan subscriptions and new PIM blueprints stay linked.",
        steps: [
          {
            step: 1,
            title: "Check Readiness in Products Tab",
            description: "Inspect the 'Readiness' column in the Product Register. Items marked 'Stock pending' need an inventory profile.",
            actionHref: "/admin/products",
            actionLabel: "Product Register",
          },
          {
            step: 2,
            title: "Relink Orphan Variants",
            description: "If variant SKUs were imported or detached, open PIM Blueprints tab and click 'Relink Variants' to bind them to their parent blueprint.",
          },
        ],
      },
      {
        name: "Meta & WhatsApp Business Catalog Auto-Sync (100% Free / ₹0)",
        description:
          "Automate product catalog synchronization to WhatsApp Business (🛍️ Shopping Bag), Facebook Page Shop, and Instagram Shopping using your native scheduled CSV feed.",
        steps: [
          {
            step: 1,
            title: "Copy Feed URL from Brand Data Center",
            description:
              "Navigate to Settings > Business Setup > Brand Data Center. Under 'Live Meta & WhatsApp Catalog Scheduled Data Feed', click '📋 Copy Feed URL'.",
            actionHref: "/admin/settings/business-setup/brand-data-center",
            actionLabel: "Brand Data Center",
          },
          {
            step: 2,
            title: "Configure Scheduled Feed in Meta Commerce Manager",
            description:
              "Log in to Meta Commerce Manager (business.facebook.com/commerce). Go to Catalogue > Data Sources > Add Items > Data Feed > Use a URL / Set a Schedule. Paste URL, schedule Daily at 06:00 AM, and select INR.",
          },
          {
            step: 3,
            title: "Connect WhatsApp Business Account",
            description:
              "In Meta Commerce Manager Settings > Connected Channels > WhatsApp, connect your store's WhatsApp Business phone number. Customers can browse your catalog in chat with one tap.",
          },
          {
            step: 4,
            title: "Enjoy Zero-Manual-Work Auto-Sync",
            description:
              "Whenever you add or edit products in PIM (change price, upload photo, mark published), Meta updates WhatsApp and Facebook automatically on schedule for ₹0 forever.",
          },
        ],
      },
    ],
    setupRequirements: [
      {
        title: "Product Categories & Hierarchy",
        description: "Set up top-level categories (Bedroom, Living, Office) and subcategories.",
        setupHref: "/admin/products/masters",
      },
      {
        title: "HSN / SAC Tax Codes",
        description: "Ensure GST rates and HSN codes (e.g. 9403 for wooden furniture) are configured.",
        setupHref: "/admin/accounting/gst",
      },
      {
        title: "Units of Measure (UOM)",
        description: "Define Units (Pcs, Sets, Meters, Kg, Sqft) used in sales and manufacturing.",
        setupHref: "/admin/products/masters",
      },
      {
        title: "Meta Commerce Scheduled Feed",
        description: "Scheduled CSV catalog feed for free WhatsApp and Facebook Shop auto-sync.",
        setupHref: "/admin/settings/business-setup/brand-data-center",
      },
    ],
    invariants: [
      "Never delete products with existing contracts, sales invoices, or stock ledger records; archive or deactivate them instead.",
      "Every variant SKU must inherit or explicitly define an HSN code before it can appear on tax invoices.",
      "Pricing defined on the Blueprint serves as the baseline price ceiling; channel discounts cannot violate floor price rules.",
      "Meta Scheduled Feeds are 100% free (₹0); never pay third-party Shopify apps or sync plugins.",
    ],
    keyActions: [
      { label: "Create Product", href: "/admin/products/create", variant: "primary" },
      { label: "Brand Data Center (Feed URL)", href: "/admin/settings/business-setup/brand-data-center", variant: "secondary" },
      { label: "Manage Masters", href: "/admin/products/masters", variant: "secondary" },
      { label: "Inventory Readiness", href: "/admin/inventory/readiness", variant: "secondary" },
    ],
    commonQuestions: [
      {
        question: "What is the difference between Product Register and PIM Blueprints?",
        answer: "The Product Register lists every individual sellable item with direct sales, stock, and contract status. PIM Blueprints organize parent product designs and their variant hierarchy (e.g. King Bed with Walnut, Teak, and Natural finishes).",
      },
      {
        question: "Does Meta or WhatsApp charge for catalog synchronization?",
        answer: "No! It is 100% completely free (₹0). Meta Commerce Manager Scheduled Data Feeds are an official native feature. You do not need any paid third-party apps, Shopify plugins, or SaaS tools.",
      },
      {
        question: "Why aren't some products showing in my WhatsApp catalog feed?",
        answer: "Meta Commerce Manager requires every product to have an image and a valid price > 0. Our feed strictly exports products where is_active=True, item_type='FINISHED_GOOD', published in PIM, base price > 0, and a valid photo URL is present.",
      },
      {
        question: "Why does my product show 'Stock pending'?",
        answer: "A product needs an active Inventory Item Profile with defined valuation and stock tracking rules before it can receive opening stock or be issued on delivery challans.",
      },
    ],
  },

  // ── 3. Collections & Cash ───────────────────────────────────────────────────
  {
    id: "collections",
    title: "Collections, Cash Counter & Payment Posting",
    shortTitle: "Collections & Cash",
    category: "collections",
    badge: "Inflow Engine",
    iconName: "wallet",
    pathPrefixes: [
      "/admin/collections",
      "/admin/finance/collect",
      "/admin/cash-counter",
      "/admin/counters",
      "/admin/smart-collection",
      "/admin/emis",
      "/admin/emi",
      "/admin/payments",
      "/admin/customer-advances",
      "/admin/outstandings",
      "/admin/receipts",
      "/admin/defaulters",
      "/admin/recovery-cases",
      "/admin/reminders",
      "/admin/settlements",
    ],
    summary:
      "The central cash and digital collection engine for Advance EMI installments, direct retail sales, customer advances, and partner collection reviews.",
    whyNeeded:
      "Cash flow is the lifeblood of furniture retail. Non-technical shop staff and solopreneur owners need a rapid, fail-safe screen to search customers by phone or Lucky ID, record payments via Cash/UPI/Bank, generate official receipts, and ensure all collections bridge into accounting without manual recalculation or duplicate posting.",
    howItWorks:
      "1. Multi-Lane Collection: Differentiates between (a) Advance EMI subscriptions, (b) Direct retail invoices, (c) Customer unapplied advances, and (d) Partner collection reports.\n2. Payment Posting Service: Submits to backend posting which determines exact schedule allocation, updates EMI status to PAID, and books double-entry ledger entries.\n3. Dynamic Cash Drawer Rollup: Cash payments accumulate in the active staff/cashier drawer for reconciliation during End-of-Day Close.\n4. Immutable Receipt: Issues a numbered digital receipt document that can be printed or shared directly via WhatsApp without saving contacts.",
    workflows: [
      {
        name: "Collect Subscription Advance EMI",
        description: "Post a monthly EMI collection for a customer under the Lucky Plan.",
        steps: [
          {
            step: 1,
            title: "Locate Customer / Contract",
            description: "Open Finance > Collect Payment (or Collections page). Search by customer mobile, Lucky ID, or subscription number.",
            actionHref: "/admin/finance/collect?workflow=advance-emi",
            actionLabel: "Collect EMI",
          },
          {
            step: 2,
            title: "Select Unpaid EMI Installment",
            description: "Select the pending EMI month (e.g. Month 3 of 10). The system autofills the exact installment amount due.",
          },
          {
            step: 3,
            title: "Select Payment Method & Account",
            description: "Choose Cash Drawer, UPI Collection Account, or Bank Transfer. If UPI or Bank, enter transaction reference/UTR number.",
          },
          {
            step: 4,
            title: "Post & Dispatch Receipt",
            description: "Click 'Post Collection'. The backend marks the EMI as Paid, updates draw eligibility, and generates an official receipt. Click 'WhatsApp' to send the receipt link instantly.",
          },
        ],
      },
      {
        name: "Collect Retail Direct Sale Balance",
        description: "Collect balance payment against a posted Direct Sale Billing Invoice.",
        steps: [
          {
            step: 1,
            title: "Open Direct Sale Collection",
            description: "Go to Collections > Direct Sale tab or use Finance > Collect Payment (Direct Sale mode).",
            actionHref: "/admin/finance/collect?workflow=direct-sale",
            actionLabel: "Direct Sale Payment",
          },
          {
            step: 2,
            title: "Verify Invoice Balance",
            description: "Select customer invoice. Review total invoice amount, previously collected deposits, and open receivable balance.",
          },
          {
            step: 3,
            title: "Post Payment Receipt",
            description: "Enter amount received and payment mode. Backend records a ReceiptDocument, updates invoice status, and credits the receivable ledger.",
          },
        ],
      },
    ],
    setupRequirements: [
      {
        title: "Finance Accounts (Cash & Bank)",
        description: "Set up Cash Drawer, Bank Accounts, and UPI Settlement Accounts.",
        setupHref: "/admin/accounting/finance-accounts",
      },
      {
        title: "Dynamic COA Mappings",
        description: "Verify that UPI Collection and Cash accounts map to their chart of account heads.",
        setupHref: "/admin/accounting/setup",
      },
    ],
    invariants: [
      "Settled payment history is strictly append-only: NEVER delete or silently mutate a payment row. Errors must be resolved via reversal or adjustment entries.",
      "Collections cannot exceed the outstanding balance of the target EMI or invoice unless explicitly posted as a Customer Advance.",
      "Winner waivers only waive future EMIs; previously settled collections are preserved and never altered.",
    ],
    keyActions: [
      { label: "Collect Payment", href: "/admin/finance/collect", variant: "primary" },
      { label: "Collections Center", href: "/admin/collections", variant: "secondary" },
      { label: "Customer Outstandings", href: "/admin/outstandings", variant: "secondary" },
    ],
    commonQuestions: [
      {
        question: "Can I collect payment for multiple months in advance?",
        answer: "Yes, you can collect subsequent months in sequence or record excess payment as an unapplied Customer Advance which will automatically offset future installments.",
      },
      {
        question: "What happens if a customer paid by UPI but the money hasn't settled yet?",
        answer: "Record the payment selecting the UPI finance account and enter the UTR number. The system tracks it under UPI collections pending bank batch settlement.",
      },
    ],
  },

  // ── 4. Sales & Contracts ────────────────────────────────────────────────────
  {
    id: "sales-contracts",
    title: "Sales, Contracts, Lucky Plan EMI & Direct Sales",
    shortTitle: "Sales & Contracts",
    category: "sales-contracts",
    badge: "Revenue Hub",
    iconName: "receipt",
    pathPrefixes: [
      "/admin/subscriptions",
      "/admin/billing",
      "/admin/sales",
      "/admin/contract-amendments",
      "/admin/rent-lease",
      "/admin/quotations",
    ],
    summary:
      "Dual-lane revenue engine managing Lucky Plan Advance EMI subscription contracts, retail direct sales billing, quotations, and contract delivery triggers.",
    whyNeeded:
      "SUBIDHA CORE operates two distinct business models: (1) Promotional Lucky Plan EMI subscriptions where customers subscribe for 10-12 months with chances to win the furniture in monthly draws, and (2) Standard Retail Direct Sales where customers purchase furniture outright or on custom credit terms. Both lanes share the customer CRM and inventory stock while keeping financial rules cleanly segregated.",
    howItWorks:
      "1. Lucky Plan Contract Lane: Creates an auditable subscription bound to a Product and Batch, validates customer KYC, allocates a unique Lucky ID, deterministically generates the EMI schedule, and mirrors an installment profile.\n2. Direct Sale Lane: Standard retail POS with line items, quantity, tax calculations, and discount rules. Generates a BillingInvoice that posts to inventory stock ledger (`SALE_OUT`) and revenue accounting upon approval.\n3. Status Lifecycles: Subscriptions progress through DRAFT -> ACTIVE -> IN_COLLECTION -> WON / COMPLETED. Direct sales transition through DRAFT -> APPROVED -> POSTED -> SETTLED.",
    workflows: [
      {
        name: "Create a Lucky Plan Advance EMI Contract",
        description: "Enroll a customer in a Lucky Plan batch with unique Lucky ID.",
        steps: [
          {
            step: 1,
            title: "Select Customer & KYC",
            description: "Open Subscriptions > Create Contract. Select an existing customer or quick-create a profile. Check KYC status.",
            actionHref: "/admin/subscriptions/advance-emi/create",
            actionLabel: "New Contract",
          },
          {
            step: 2,
            title: "Select Batch & Product",
            description: "Choose an active batch (e.g. 'Diwali Bonanza Batch A'). Select the enrolled furniture product. Tenure and monthly EMI amount autofill from batch rules.",
          },
          {
            step: 3,
            title: "Allocate Lucky ID",
            description: "System verifies available Lucky IDs in the batch and assigns a unique number to this contract.",
            importantNote: "Lucky ID uniqueness is strictly enforced per product/batch.",
          },
          {
            step: 4,
            title: "Preview Schedule & Activate",
            description: "Review generated EMI schedule (due dates and amounts). Click 'Activate Subscription'. The first EMI is immediately collectible.",
          },
        ],
      },
      {
        name: "Create a Direct Retail Sale Invoice",
        description: "Generate a retail invoice for store walk-in or phone order.",
        steps: [
          {
            step: 1,
            title: "Start Direct Sale",
            description: "Open Sales & Billing > Direct Sales > Create Direct Sale.",
            actionHref: "/admin/billing/direct-sale/create",
            actionLabel: "New Direct Sale",
          },
          {
            step: 2,
            title: "Add Products & Apply Pricing",
            description: "Search items from product catalog. Enter quantity, unit price, and discount. System applies GST tax brackets automatically.",
          },
          {
            step: 3,
            title: "Approve & Post Invoice",
            description: "Approve the draft. Posting writes `RETAIL_SALE` accounting journal entry and books inventory stock reservation/deduction.",
          },
          {
            step: 4,
            title: "Collect Advance / Down Payment",
            description: "Collect full payment or down payment right from the invoice page.",
          },
        ],
      },
      {
        name: "Create a Multi-Product Rental or Lease Contract",
        description: "Assemble a multi-item showroom package (e.g. Bed + Mattress + Wardrobe) with custom yield and deposit rates per product.",
        steps: [
          {
            step: 1,
            title: "Select RENT or LEASE & Customer",
            description: "Open Subscriptions > Create Contract. Select RENT (rental agreement) or LEASE (operating lease). Choose customer and verify KYC.",
            actionHref: "/admin/subscriptions/advance-emi/create",
            actionLabel: "New Rent/Lease Contract",
          },
          {
            step: 2,
            title: "Attach Multiple Furniture Products to Basket",
            description: "Click '+ Add Another Product' to attach multiple furniture units to this contract. Adjust quantities and unit base prices.",
          },
          {
            step: 3,
            title: "Set Custom Yield Rate & Security Deposit Per Product",
            description: "Configure individual Yield Rate (%) and Deposit (%) for each product line. The system computes line monthly dues, line deposit share, aggregate contract total, and effective deposit %.",
          },
          {
            step: 4,
            title: "Review Commercial Posture & Activate / Save Draft",
            description: "Review tenure, monthly payment schedule, and security deposit receipt terms. Click 'Activate Contract' or 'Save as Draft'.",
          },
        ],
      },
    ],
    setupRequirements: [
      {
        title: "Active Batches",
        description: "Create at least one active batch before enrolling subscription customers.",
        setupHref: "/admin/batches",
      },
      {
        title: "Document Numbering Sequences",
        description: "Configure prefix and numbering for Contracts (SUB-) and Invoices (INV-).",
        setupHref: "/admin/settings/business-setup/document-numbering",
      },
    ],
    invariants: [
      "Direct sales and subscription contracts are strictly distinct entities; never mix retail billing lines with EMI schedules.",
      "The sum of all schedule EMIs must exactly match the total subscription contract value.",
      "Invoices once posted cannot be deleted; cancel or reverse with an explicit audit note.",
    ],
    keyActions: [
      { label: "New Contract", href: "/admin/subscriptions/advance-emi/create", variant: "primary" },
      { label: "New Direct Sale", href: "/admin/billing/direct-sale/create", variant: "primary" },
      { label: "Subscriptions Hub", href: "/admin/subscriptions", variant: "secondary" },
      { label: "Invoices Register", href: "/admin/billing/invoices", variant: "secondary" },
    ],
  },

  // ── 5. BOM & Manufacturing ──────────────────────────────────────────────────
  {
    id: "manufacturing",
    title: "Bill of Materials (BOM) & Manufacturing Operations",
    shortTitle: "BOM & Manufacturing",
    category: "manufacturing",
    badge: "Workshop Control",
    iconName: "factory",
    pathPrefixes: [
      "/admin/manufacturing",
      "/admin/manufacturing/boms",
      "/admin/manufacturing/jobs",
    ],
    summary:
      "End-to-end furniture workshop control: standard Bill of Materials recipes, raw material stock issuance, labor wage tracking, WIP accounting, and finished goods receipt.",
    whyNeeded:
      "When manufacturing furniture in-house, raw materials (teak wood, foam, nails, polish) are consumed and labor wages are paid before finished furniture is ready for sale. Without explicit BOM and production jobs, stock levels are inaccurate and true product cost cannot be calculated. This module ensures material consumption and craftsmanship labor automatically bridge into accounting without manual journal entries.",
    howItWorks:
      "1. Bill of Materials (BOM): Defines the formula to build 1 unit of a finished good, specifying raw material SKUs, standard quantities, and scrap tolerances.\n2. Production Jobs: Created to manufacture a batch of furniture units against a BOM.\n3. Material Issuance: Deducts raw materials from inventory (`PRODUCTION_ISSUE_OUT`) and moves value into Work-In-Progress (WIP).\n4. Labor Tracking & Accrual: Craftsperson labor lines (`ProductionLaborLine`) are recorded. System creates `manufacturing_labor_accrual` (Debit WIP, Credit Salary Payable).\n5. Completion & Receipt: Finished goods are received into stock (`FIN_GOODS_IN`), WIP is cleared, and labor is tagged for employee monthly payroll.",
    workflows: [
      {
        name: "Define a Bill of Materials (BOM)",
        description: "Create standard manufacturing recipe for a finished furniture piece.",
        steps: [
          {
            step: 1,
            title: "Select Finished Product",
            description: "Go to Manufacturing > BOM Register > New BOM. Select the target finished product (e.g. '6-Seater Dining Table').",
            actionHref: "/admin/manufacturing/boms",
            actionLabel: "BOM Register",
          },
          {
            step: 2,
            title: "Add Raw Materials & Hardware",
            description: "Add component lines: Timber (cubic feet), Adhesive (kg), Polish (litres), Screws (packets), with standard consumption per unit.",
          },
          {
            step: 3,
            title: "Specify Scrap Allowance",
            description: "Set normal scrap tolerance percentage (e.g. 5% sawdust/cut-off).",
          },
          {
            step: 4,
            title: "Approve & Activate BOM",
            description: "Mark the BOM as active. It is now available for production jobs.",
          },
        ],
      },
      {
        name: "Execute a Production Job",
        description: "Run workshop production from raw material dispatch to finished goods storage.",
        steps: [
          {
            step: 1,
            title: "Create Production Job",
            description: "Go to Manufacturing > Production Jobs > New Job. Select active BOM and target output quantity (e.g. 10 units).",
            actionHref: "/admin/manufacturing/jobs",
            actionLabel: "Production Jobs",
          },
          {
            step: 2,
            title: "Issue Raw Materials to Floor",
            description: "Check stock availability and click 'Issue Materials'. Deducts raw materials from warehouse stock and debits WIP account.",
          },
          {
            step: 3,
            title: "Record Craftsperson Labor",
            description: "Log labor lines for carpenters/polishers (piece rate or hours). System creates accounting labor accrual.",
            importantNote: "All labor lines must be posted before a production job can be completed.",
          },
          {
            step: 4,
            title: "Complete Job & Receive Stock",
            description: "Enter actual good units produced and actual scrap. Post completion: adds finished goods to stock ledger and clears WIP balance.",
          },
        ],
      },
    ],
    setupRequirements: [
      {
        title: "Raw Material Items",
        description: "Register raw materials, hardware, and chemicals in the product register.",
        setupHref: "/admin/products/create",
      },
      {
        title: "WIP & Labor COA Accounts",
        description: "Ensure Work In Progress (WIP) and Salary Payable accounts exist in Chart of Accounts.",
        setupHref: "/admin/accounting/chart-of-accounts",
      },
      {
        title: "Craftsmen & Workshop Staff",
        description: "Onboard workshop technicians in HR staff register.",
        setupHref: "/admin/hr/staff",
      },
    ],
    invariants: [
      "Labor must be fully recorded and posted before a production job can be marked completed.",
      "Negative raw material stock is blocked; materials must be physically in stock before issuance.",
      "Unposted production labor lines for an employee are automatically pulled into their monthly salary sheet.",
    ],
    keyActions: [
      { label: "Manufacturing Hub", href: "/admin/manufacturing", variant: "primary" },
      { label: "BOM Register", href: "/admin/manufacturing/boms", variant: "secondary" },
      { label: "Production Jobs", href: "/admin/manufacturing/jobs", variant: "secondary" },
    ],
  },

  // ── 6. Inventory & Stock ───────────────────────────────────────────────────
  {
    id: "inventory",
    title: "Inventory Management & Append-Only Stock Ledger",
    shortTitle: "Inventory & Stock",
    category: "inventory",
    badge: "Stock Integrity",
    iconName: "boxes",
    pathPrefixes: [
      "/admin/inventory",
      "/admin/inventory/items",
      "/admin/inventory/ledger",
      "/admin/inventory/opening-stock",
      "/admin/inventory/adjustments",
      "/admin/inventory/stock-on-hand",
      "/admin/inventory/valuation",
      "/admin/inventory/locations",
    ],
    summary:
      "Enterprise stock management with append-only ledger entries, multiple warehouse locations, physical vs reserved availability, adjustments, and valuation.",
    whyNeeded:
      "Physical stock must match digital records. Inventory discrepancies lead to selling items that don't exist or lost assets. This module enforces an append-only stock ledger where every movement has an audit trail, prevents negative stock, tracks reservation holds, and values stock accurately for balance sheet reporting.",
    howItWorks:
      "1. Stock Ledger: Every physical increase or decrease is an individual row in `StockLedger` (one-sided: `quantity_in` xor `quantity_out`). Rows are never edited or deleted.\n2. Stock Formula:\n   - Physical Stock = Opening Stock + Total In - Total Out\n   - Reserved Stock = Sale Holds (`SALE_RESERVE` - `SALE_RELEASE`)\n   - Available to Promise (ATP) = Physical Stock - Reserved Stock\n3. Warehouse Locations: Supports tracking items across Showroom, Central Godown, and Workshop.\n4. Stock Adjustments: Periodic stocktakes record variances with explicit audit reasons.",
    workflows: [
      {
        name: "Initialize Opening Stock",
        description: "Set baseline inventory balances during store onboarding or annual rollover.",
        steps: [
          {
            step: 1,
            title: "Open Opening Stock Workbench",
            description: "Go to Inventory > Opening Stock.",
            actionHref: "/admin/inventory/opening-stock",
            actionLabel: "Opening Stock",
          },
          {
            step: 2,
            title: "Select Location & Enter Counts",
            description: "Select target warehouse (e.g. 'Main Showroom'). Enter verified physical count and unit cost for each item.",
          },
          {
            step: 3,
            title: "Post Opening Balance",
            description: "Click 'Post Opening Stock'. The system initializes the stock ledger and writes the initial inventory valuation journal.",
          },
        ],
      },
      {
        name: "Perform a Stock Adjustment (Audit / Damage)",
        description: "Record physical count variance or damage write-off.",
        steps: [
          {
            step: 1,
            title: "Start Adjustment",
            description: "Open Inventory > Adjustments > New Adjustment.",
            actionHref: "/admin/inventory/adjustments",
            actionLabel: "New Adjustment",
          },
          {
            step: 2,
            title: "Select Item & Variance Quantity",
            description: "Select the item. Enter adjusted count (+ increase or - decrease).",
          },
          {
            step: 3,
            title: "Select Reason Code & Post",
            description: "Choose reason (Physical Stocktake, Transit Damage, Polish Defect, Sample Issue). System writes compensatory ledger row.",
          },
        ],
      },
    ],
    setupRequirements: [
      {
        title: "Stock Locations / Warehouses",
        description: "Configure Showroom and Warehouse locations.",
        setupHref: "/admin/inventory/locations",
      },
      {
        title: "Product Inventory Profiles",
        description: "Ensure items are marked as stock-tracked with reorder thresholds.",
        setupHref: "/admin/inventory/readiness",
      },
    ],
    invariants: [
      "The stock ledger is strictly append-only; stock cannot be manually changed without an auditable movement or adjustment transaction.",
      "Outbound movements (Deliveries, Sales, Production Issues) are blocked if available stock is insufficient.",
      "Adjustments require an authenticated staff ID and documented business reason.",
    ],
    keyActions: [
      { label: "Stock on Hand", href: "/admin/inventory/stock-on-hand", variant: "primary" },
      { label: "Stock Ledger", href: "/admin/inventory/ledger", variant: "secondary" },
      { label: "Opening Stock", href: "/admin/inventory/opening-stock", variant: "secondary" },
      { label: "Stock Adjustments", href: "/admin/inventory/adjustments", variant: "secondary" },
    ],
  },

  // ── 7. Purchases & Vendors ─────────────────────────────────────────────────
  {
    id: "purchases-vendors",
    title: "Purchases, Vendor Master & Procurement Cycle",
    shortTitle: "Purchases & Vendors",
    category: "purchases-vendors",
    badge: "Procurement Cycle",
    iconName: "shoppingCart",
    pathPrefixes: [
      "/admin/purchases",
      "/admin/vendors",
    ],
    summary:
      "Comprehensive procurement lifecycle: vendor onboarding, purchase orders, goods receipt notes (GRN), purchase bills, and vendor payment settlements.",
    whyNeeded:
      "Furniture stores buy raw materials and manufactured goods from multiple suppliers. Without structured procurement, payments are made for goods not received, vendor balances are inaccurate, and input GST credits are lost. This module ensures every purchase bill is matched against physical goods receipts, accounts payable are tracked accurately, and vendor settlements post clean accounting entries.",
    howItWorks:
      "1. Procurement Chain: Purchase Request -> Purchase Order (PO) -> Goods Received Note (GRN) -> Purchase Bill / Tax Invoice -> Vendor Settlement.\n2. GRN Stock Integration: Approving a GRN automatically creates `PURCHASE_RECEIPT` movements in the stock ledger.\n3. Bill Posting: Records the supplier tax invoice, credits Vendor Accounts Payable, debits Inventory/Expense, and logs Input Tax Credit (ITC).\n4. Vendor Settlement: Posts cash/bank payout against open bills, updating the vendor ledger.",
    workflows: [
      {
        name: "Standard Procurement Flow (PO to Payment)",
        description: "Order goods from supplier, receive inventory, verify invoice, and pay vendor.",
        steps: [
          {
            step: 1,
            title: "Create Purchase Order (PO)",
            description: "Go to Purchases > Orders > New PO. Select vendor, expected delivery date, and add items with agreed rates.",
            actionHref: "/admin/purchases/orders",
            actionLabel: "Purchase Orders",
          },
          {
            step: 2,
            title: "Inspect & Post Goods Receipt (GRN)",
            description: "When shipment arrives, create a GRN. Inspect items, record accepted quantity and any rejected units. Posting GRN adds stock to warehouse.",
            actionHref: "/admin/purchases/receipts",
            actionLabel: "Goods Receipts (GRN)",
          },
          {
            step: 3,
            title: "Book Vendor Purchase Bill",
            description: "Record the supplier's GST tax invoice against the GRN. System validates totals and books accounts payable.",
            actionHref: "/admin/purchases/bills",
            actionLabel: "Purchase Bills",
          },
          {
            step: 4,
            title: "Settle Vendor Payment",
            description: "Go to Vendor Settlements. Select open bills and pay via Bank Transfer or Cheque. Payout reduces vendor payable balance.",
            actionHref: "/admin/vendors/settlements",
            actionLabel: "Vendor Settlements",
          },
        ],
      },
    ],
    setupRequirements: [
      {
        title: "Vendor Profiles",
        description: "Register vendors with GSTIN, PAN, Bank Details, and credit terms.",
        setupHref: "/admin/vendors",
      },
      {
        title: "Sundry Creditors COA",
        description: "Verify Accounts Payable / Sundry Creditors ledger is active.",
        setupHref: "/admin/accounting/chart-of-accounts",
      },
    ],
    invariants: [
      "GRN over-receiving is blocked unless explicitly authorized with a written business reason.",
      "Vendor settlements cannot exceed the balance due on linked purchase bills.",
      "Vendor purchase returns require a dedicated return document that writes stock OUT and issues a vendor debit note.",
    ],
    keyActions: [
      { label: "Purchase Orders", href: "/admin/purchases/orders", variant: "primary" },
      { label: "Purchase Bills", href: "/admin/purchases/bills", variant: "secondary" },
      { label: "Vendor Register", href: "/admin/vendors", variant: "secondary" },
      { label: "Vendor Outstanding", href: "/admin/vendors/outstanding", variant: "secondary" },
    ],
  },

  // ── 8. Accounting & Finance Setup ──────────────────────────────────────────
  {
    id: "accounting-finance",
    title: "Accounting Workbench, Finance Accounts & End-of-Day Close",
    shortTitle: "Accounting & Finance",
    category: "accounting-finance",
    badge: "Financial Truth",
    iconName: "landmark",
    pathPrefixes: [
      "/admin/accounting",
      "/admin/finance",
      "/admin/finance-control",
      "/admin/reconciliation",
      "/admin/opening-balances",
      "/admin/revenue-workbench",
      "/admin/refunds",
    ],
    summary:
      "Core double-entry general ledger, Chart of Accounts (COA), dynamic finance account mappings, journals, daybook, daily cashier lock, and financial statements.",
    whyNeeded:
      "A furniture business cannot survive on intuition alone. Owners must know exact daily cash in hand, bank balances, tax liabilities, and net profit. In SUBIDHA CORE, operational transactions (sales, collections, purchases, labor) automatically create balanced double-entry accounting journals so accounting is always up-to-date without double data entry.",
    howItWorks:
      "1. Chart of Accounts: Standard 5-tier classification (Assets, Liabilities, Equity, Revenue, Expenses).\n2. Finance Accounts: Physical cash drawers, current bank accounts, and UPI settlement merchant accounts.\n3. Dynamic COA Mapping: Each finance account maps dynamically via `FinanceAccountCoaMapping` ensuring liquid balances and KPI aggregation roll up accurately.\n4. Daybook & Journals: Real-time ledger view of all debits and credits.\n5. End-of-Day Close Cockpit: Mandatory daily routine where the store admin verifies physical cash in drawer matches system collections, signs off on discrepancies, and locks the day.",
    workflows: [
      {
        name: "Initial Accounting & Business Setup",
        description: "Configure Chart of Accounts and payment settlement channels.",
        steps: [
          {
            step: 1,
            title: "Review Chart of Accounts",
            description: "Check standard accounts: Cash, Bank, Receivables, Payables, Sales, Inventory, WIP, Salary.",
            actionHref: "/admin/accounting/chart-of-accounts",
            actionLabel: "Chart of Accounts",
          },
          {
            step: 2,
            title: "Configure Finance Accounts",
            description: "Register store cash drawers (e.g. 'Main Store Cash Drawer') and Bank accounts (e.g. 'HDFC Current A/c').",
            actionHref: "/admin/accounting/finance-accounts",
            actionLabel: "Finance Accounts",
          },
          {
            step: 3,
            title: "Verify Dynamic COA Mappings",
            description: "Ensure each Finance Account is mapped to its parent chart of account.",
            actionHref: "/admin/accounting/setup",
            actionLabel: "Accounting Setup",
          },
        ],
      },
      {
        name: "Perform End-of-Day Cash & Register Close",
        description: "Reconcile daily cash counter, verify UPI receipts, and lock the day.",
        steps: [
          {
            step: 1,
            title: "Open Daily Close Cockpit",
            description: "At the end of business hours, navigate to Close Cockpit or Finance > Daily Close.",
            actionHref: "/admin/finance/daily-close",
            actionLabel: "Daily Close",
          },
          {
            step: 2,
            title: "Physical Cash Count",
            description: "Count cash denominations in physical drawer. Enter total counted cash into the cockpit.",
          },
          {
            step: 3,
            title: "Review Expected vs Actual Balance",
            description: "System compares Opening Drawer Cash + Today's Cash Collections - Drawer Cash Out against physical count.",
          },
          {
            step: 4,
            title: "Submit Daily Sign-Off",
            description: "Sign off on the daily close. If any discrepancy exists, record a note. The daily register is locked against back-dated modifications.",
          },
        ],
      },
    ],
    setupRequirements: [
      {
        title: "Chart of Accounts",
        description: "Initialize standard retail furniture chart of accounts.",
        setupHref: "/admin/accounting/chart-of-accounts",
      },
      {
        title: "Finance Accounts",
        description: "Set up Cash Drawer, Bank accounts, and UPI settlement accounts.",
        setupHref: "/admin/accounting/finance-accounts",
      },
    ],
    invariants: [
      "Total debits must strictly equal total credits in every single accounting journal entry.",
      "Cosmetic or fake test data is strictly prohibited in the live database as it corrupts financial KPIs.",
      "Once an accounting period or day is closed and signed off, operational records cannot be altered.",
    ],
    keyActions: [
      { label: "Accounting Hub", href: "/admin/accounting", variant: "primary" },
      { label: "Daily Close Cockpit", href: "/admin/finance/daily-close", variant: "primary" },
      { label: "Chart of Accounts", href: "/admin/accounting/chart-of-accounts", variant: "secondary" },
      { label: "General Ledger / Daybook", href: "/admin/accounting/journals", variant: "secondary" },
    ],
  },

  // ── 9. Lucky Plan & Draws ──────────────────────────────────────────────────
  {
    id: "lucky-plan",
    title: "Lucky Plan Batches, Draw Coordination & Winner Benefits",
    shortTitle: "Lucky Plan & Draws",
    category: "lucky-plan",
    badge: "Promotion Engine",
    iconName: "trophy",
    pathPrefixes: [
      "/admin/batches",
      "/admin/lucky-draws",
      "/admin/lucky-ids",
      "/admin/lucky-plan",
    ],
    summary:
      "Subscription batch management, Lucky ID allocation, monthly draw execution, winner waiver processing, and prize fulfillment.",
    whyNeeded:
      "The Lucky Plan is the flagship customer acquisition driver. Customers pay monthly advance EMIs for furniture. Each month, a transparent draw selects winners who receive their furniture immediately with all remaining EMI installments 100% waived! Non-winning customers continue until tenure completion to receive their furniture.",
    howItWorks:
      "1. Batches: Define subscriber limits (e.g. 500 members), product model, monthly installment, and draw dates.\n2. Lucky ID: Each subscriber receives a verified, unique ID within the batch.\n3. Draw Eligibility: Only subscribers with up-to-date paid EMIs are eligible for that month's draw.\n4. Winner Processing: Idempotent backend action marks subscription as `WON`, waives all future pending EMIs, initiates delivery fulfillment, and records accounting waiver journals. Past settled payments remain untouched.",
    workflows: [
      {
        name: "Create a New Lucky Plan Batch",
        description: "Open a new subscription batch for customer enrollment.",
        steps: [
          {
            step: 1,
            title: "Create Batch",
            description: "Go to Batches > Create Batch. Enter Batch Name, Enrollment Start/End Date, and Max Subscribers.",
            actionHref: "/admin/batches",
            actionLabel: "Batches Hub",
          },
          {
            step: 2,
            title: "Set Product & Tenure",
            description: "Select the featured furniture product. Set tenure (e.g. 10 months) and monthly installment (e.g. ₹1,000/mo).",
          },
          {
            step: 3,
            title: "Activate Batch",
            description: "Activate batch. New customers can now be enrolled under this batch.",
          },
        ],
      },
      {
        name: "Execute a Monthly Lucky Draw",
        description: "Conduct transparent draw, select winner, and apply waivers.",
        steps: [
          {
            step: 1,
            title: "Open Draw Execution",
            description: "Go to Lucky Draws > Execution. Select the active batch and draw month.",
            actionHref: "/admin/lucky-draws",
            actionLabel: "Lucky Draws",
          },
          {
            step: 2,
            title: "Verify Eligible Candidates",
            description: "Review eligible subscribers list. System verifies all included customers have paid their current month's EMI.",
          },
          {
            step: 3,
            title: "Execute Transparent Draw",
            description: "Run random draw algorithm or enter verified drawn token. Confirm winning Lucky ID.",
          },
          {
            step: 4,
            title: "Apply Winner Benefits",
            description: "System automatically waives all remaining unpaid EMIs, changes contract status to WON, and queues delivery.",
          },
        ],
      },
    ],
    setupRequirements: [
      {
        title: "Subscription Products",
        description: "Ensure featured products are configured with subscription eligibility.",
        setupHref: "/admin/products",
      },
    ],
    invariants: [
      "Winning a draw waives future EMI obligations only; never refund or alter already-settled payments.",
      "Draw execution must be idempotent: executing the same draw multiple times cannot double-waive or corrupt records.",
      "A customer must be strictly up to date with their installment payments to be eligible for that month's draw.",
    ],
    keyActions: [
      { label: "Batches Hub", href: "/admin/batches", variant: "primary" },
      { label: "Lucky Draws Register", href: "/admin/lucky-draws", variant: "secondary" },
      { label: "Lucky IDs", href: "/admin/lucky-ids", variant: "secondary" },
    ],
  },

  // ── 10. CRM & Customers ────────────────────────────────────────────────────
  {
    id: "crm-customers",
    title: "CRM, Customer 360, KYC Verification & Leads",
    shortTitle: "CRM & Customers",
    category: "crm-customers",
    badge: "Customer 360",
    iconName: "users",
    pathPrefixes: [
      "/admin/customers",
      "/admin/crm",
      "/admin/consumer",
      "/admin/requests",
      "/admin/reviews",
      "/admin/profiles",
      "/admin/partners",
      "/admin/partner",
      "/admin/partner-payment-requests",
      "/admin/branches",
      "/admin/branch-reporting",
      "/admin/leads",
    ],
    summary:
      "Complete customer relationship management: customer onboarding, KYC document review, unified operational profiles, communication history, and lead tracking.",
    whyNeeded:
      "A single customer may have multiple Lucky Plan subscriptions, retail direct sales, and custom inquiries. Store operators need a unified Customer 360 profile showing all contracts, pending dues, KYC documents, and WhatsApp communication history in one place without jumping across disconnected menus.",
    howItWorks:
      "1. Customer Profile: Master identity record indexed by verified phone number.\n2. KYC Queue: Upload and verify identity proofs (Aadhaar, Voter ID, Address Proof).\n3. Customer 360: Consolidates active subscriptions, direct sales, payment receipts, unapplied advance deposits, and delivery addresses.\n4. Direct WhatsApp Integration: Send payment receipts, balance reminders, and contract PDFs with 1 click without saving numbers.",
    workflows: [
      {
        name: "Customer Onboarding & KYC",
        description: "Register a new customer and verify identity documentation.",
        steps: [
          {
            step: 1,
            title: "Create Customer Profile",
            description: "Go to Customers > Create Customer. Enter Name, Mobile Number, and Address.",
            actionHref: "/admin/customers/create",
            actionLabel: "Create Customer",
          },
          {
            step: 2,
            title: "Upload & Verify KYC",
            description: "Attach photo and Aadhaar/Voter ID. Review document details in CRM KYC queue and mark as Verified.",
            actionHref: "/admin/crm/kyc",
            actionLabel: "KYC Queue",
          },
        ],
      },
    ],
    setupRequirements: [
      {
        title: "KYC Compliance Settings",
        description: "Configure mandatory KYC requirements for high-value contracts.",
        setupHref: "/admin/settings/compliance-policies",
      },
    ],
    invariants: [
      "Customer phone numbers are unique primary identifiers; avoid duplicate customer creation.",
      "Customer ledger entries and transaction histories are permanent and audit-trailed.",
    ],
    keyActions: [
      { label: "Customer Master", href: "/admin/customers", variant: "primary" },
      { label: "Create Customer", href: "/admin/customers/create", variant: "secondary" },
      { label: "KYC Queue", href: "/admin/crm/kyc", variant: "secondary" },
    ],
  },

  // ── 11. Delivery & Service ─────────────────────────────────────────────────
  {
    id: "delivery",
    title: "Delivery Management, Challans & Transport Fulfillment",
    shortTitle: "Delivery & Fulfillment",
    category: "delivery",
    badge: "Logistics",
    iconName: "truck",
    pathPrefixes: [
      "/admin/deliveries",
      "/admin/delivery",
      "/admin/logistics",
      "/admin/repossessions",
      "/admin/service-desk",
      "/admin/warranty",
    ],
    summary:
      "Doorstep delivery coordination: delivery orders, vehicle assignment, delivery challans with serial numbers, proof of delivery (POD), and stock reduction.",
    whyNeeded:
      "Furniture is heavy and requires scheduled transport. Delivery state is strictly separate from payment state (a customer can take delivery while paying EMIs, or pay upfront and schedule delivery next week). Delivery challans ensure accurate goods dispatch and write `DELIVERY_OUT` stock movements upon confirmed delivery.",
    howItWorks:
      "1. Delivery Order: Created from completed direct sale or subscription milestone.\n2. Delivery Challan: Documents exact items, serial numbers, customer address, and transport vehicle.\n3. Status Flow: DRAFT -> SCHEDULED -> OUT_FOR_DELIVERY -> DELIVERED / RETURNED.\n4. Stock Trigger: Moving to DELIVERED writes `DELIVERY_OUT` or `EMI_DELIVERY_OUT` movement into the inventory stock ledger.",
    workflows: [
      {
        name: "Create & Dispatch a Delivery",
        description: "Dispatch furniture to customer doorstep with delivery challan.",
        steps: [
          {
            step: 1,
            title: "Create Delivery Order",
            description: "Go to Delivery > New Delivery. Link to Direct Sale Invoice or Subscription Contract.",
            actionHref: "/admin/deliveries/create",
            actionLabel: "New Delivery",
          },
          {
            step: 2,
            title: "Assign Vehicle & Driver",
            description: "Select delivery truck, driver, and scheduled date/time slot.",
          },
          {
            step: 3,
            title: "Generate Delivery Challan",
            description: "Print official Delivery Challan with customer copy and driver copy.",
          },
          {
            step: 4,
            title: "Mark Delivered (POD)",
            description: "Upon delivery confirmation, mark status as DELIVERED. System writes stock deduction in the inventory ledger.",
          },
        ],
      },
      {
        name: "Mobile Handover Link & Touchscreen POD Capture",
        description: "Send a secure WhatsApp link to field delivery staff to capture product quality photos and touchscreen signatures at the doorstep.",
        steps: [
          {
            step: 1,
            title: "Generate Handover Link",
            description: "Open the delivery order in /admin/deliveries/[id] and click 'Generate Driver Handover Link'.",
          },
          {
            step: 2,
            title: "Share on WhatsApp",
            description: "Click 'Share on WhatsApp' to dispatch the secure token link to the delivery boy or customer.",
          },
          {
            step: 3,
            title: "Capture Quality Photos",
            description: "Delivery boy taps link on phone and uses camera to take Photo 1 (room placement & quality) and Photo 2 (customer with item).",
          },
          {
            step: 4,
            title: "Customer Screen Signature",
            description: "Customer signs directly on the phone screen with their finger using the interactive digital signature pad.",
          },
          {
            step: 5,
            title: "Auto-GPS & System Verification",
            description: "Tapping submit logs GPS coordinates and automatically marks the delivery DELIVERED, activating asset custody under Rule CTRL-RENT-2.",
          },
        ],
      },
    ],
    setupRequirements: [
      {
        title: "Delivery Document Numbering",
        description: "Set up prefix for Delivery Challans (DC-).",
        setupHref: "/admin/settings/business-setup/document-numbering",
      },
    ],
    invariants: [
      "Product delivery state, contract state, and payment state are separate concerns.",
      "Delivery progression is blocked for cancelled or reversed sales invoices.",
      "Rule CTRL-RENT-2: Delivery cannot be marked DELIVERED without an attached Proof of Delivery (POD) record.",
      "Field handover link uses tamper-proof signed tokens (valid 7 days); admin credentials must never be shared.",
      "Product condition photo (Photo 1) acts as the permanent quality baseline for rent/lease return inspections.",
    ],
    keyActions: [
      { label: "Delivery Hub", href: "/admin/deliveries", variant: "primary" },
      { label: "Service Desk", href: "/admin/service-desk/tickets", variant: "secondary" },
      { label: "Warranty Claims", href: "/admin/warranty/claims", variant: "secondary" },
    ],
  },

  // ── 12. HR & Staff ─────────────────────────────────────────────────────────
  {
    id: "hr-payroll",
    title: "HR, Staff Master, Attendance & Payroll Accruals",
    shortTitle: "HR & Staff",
    category: "hr-payroll",
    badge: "Team & Payroll",
    iconName: "userCog",
    pathPrefixes: ["/admin/hr"],
    summary:
      "Staff directory, attendance, workshop labor wage aggregation, sales commissions, and monthly salary sheet generation.",
    whyNeeded:
      "Stores have sales staff, delivery drivers, and workshop carpenters. Carpenters earn piece-rate wages per furniture unit, while sales staff earn commissions. This module automatically aggregates production labor lines (`ProductionLaborLine`) into monthly payroll so wages don't have to be manually calculated.",
    howItWorks:
      "1. Staff Profiles: Role-based staff accounts (Cashier, Store Manager, Carpenter, Delivery Driver).\n2. Attendance & Leaves: Track daily check-in and monthly leave records.\n3. Labor Integration: Workshop labor logged during production jobs automatically aggregates into the employee's pending earnings.\n4. Salary Sheet Generation: Compiles Base Salary + Production Labor + Commission - Deductions and posts salary payable journals.",
    workflows: [
      {
        name: "Generate Monthly Salary Sheet",
        description: "Compile and approve monthly staff payroll.",
        steps: [
          {
            step: 1,
            title: "Open Payroll Workbench",
            description: "Navigate to HR > Payroll.",
            actionHref: "/admin/hr/payroll",
            actionLabel: "Payroll Workbench",
          },
          {
            step: 2,
            title: "Generate Monthly Sheet",
            description: "Select month and year. System pulls base pay, days worked, and automatically appends unposted production labor lines.",
          },
          {
            step: 3,
            title: "Review & Post Payroll",
            description: "Review net payout. Posting records double-entry journal (Debit Salary Expense, Credit Salary Payable).",
          },
        ],
      },
    ],
    setupRequirements: [
      {
        title: "Staff Accounts & Roles",
        description: "Register store and workshop employees.",
        setupHref: "/admin/hr/staff",
      },
    ],
    invariants: [
      "Unposted production labor lines are strictly reserved for the linked employee's salary sheet.",
      "Salary payout creates verifiable bank/cash deduction entries.",
    ],
    keyActions: [
      { label: "HR Hub", href: "/admin/hr", variant: "primary" },
      { label: "Staff Profiles", href: "/admin/hr/staff", variant: "secondary" },
      { label: "Payroll", href: "/admin/hr/payroll", variant: "secondary" },
    ],
  },

  // ── 13. BI & Financial Reports ─────────────────────────────────────────────
  {
    id: "bi-reports",
    title: "BI, Financial Analytics, Customer Aging & Growth Reports",
    shortTitle: "BI & Reports",
    category: "bi-reports",
    badge: "Intelligence",
    iconName: "gauge",
    pathPrefixes: [
      "/admin/bi",
      "/admin/analytics",
      "/admin/reports",
      "/admin/reports-center",
      "/admin/reports-governance",
      "/admin/growth",
      "/admin/schemes",
      "/admin/brochures",
    ],
    summary:
      "Executive decision analytics: customer retention cohorts, cashflow forecasts, product profitability, aging receivables, and growth campaign tracking.",
    whyNeeded:
      "To expand the retail furniture business and open new branches, the owner needs deep visibility into which products generate the highest margin, which customer segments default on EMIs, and real-time cash flow projections. BI & Reports consolidates all operational ledgers into actionable charts and exportable audit packs.",
    howItWorks:
      "1. KPI Rollup Engine: Aggregates liquid cash, unpaid EMI balances, inventory valuation, and monthly revenue.\n2. Aging Schedules: Segregates customer receivables into 0-30, 31-60, 61-90, and 90+ days overdue for recovery prioritisation.\n3. Product Margin Analysis: Compares raw material / purchase cost against final retail sales price to determine true product gross margins.\n4. Export Pack: One-click export for CA audit packs, ITR filing, and GST compliance.",
    workflows: [
      {
        name: "Review Monthly Financial & Growth Performance",
        description: "Analyze monthly sales, collection recovery rate, and cashflow posture.",
        steps: [
          {
            step: 1,
            title: "Open BI Executive Dashboard",
            description: "Go to BI & Reports > BI Dashboard.",
            actionHref: "/admin/bi",
            actionLabel: "BI Overview",
          },
          {
            step: 2,
            title: "Inspect Cashflow Trends",
            description: "Review net cash inflow vs supplier payouts and upcoming loan/rent obligations.",
            actionHref: "/admin/bi/cashflow",
            actionLabel: "Cashflow Forecast",
          },
          {
            step: 3,
            title: "Analyze Product Profitability",
            description: "Identify best-selling furniture lines and slow-moving inventory items.",
            actionHref: "/admin/bi/profitability",
            actionLabel: "Profitability",
          },
        ],
      },
    ],
    setupRequirements: [
      {
        title: "Financial Periods",
        description: "Verify active fiscal year dates are configured.",
        setupHref: "/admin/accounting/periods",
      },
    ],
    invariants: [
      "All reporting figures are derived from immutable ledger transactions; no cosmetic or mock data is permitted.",
    ],
    keyActions: [
      { label: "BI Hub", href: "/admin/bi", variant: "primary" },
      { label: "Reports Center", href: "/admin/reports-center", variant: "secondary" },
      { label: "Cashflow Analytics", href: "/admin/bi/cashflow", variant: "secondary" },
    ],
  },

  // ── 14. Business Setup & Governance ────────────────────────────────────────
  {
    id: "business-setup",
    title: "Store Setup, Document Numbering, Branding & Launch Readiness",
    shortTitle: "Business Setup",
    category: "business-setup",
    badge: "Store Config",
    iconName: "settings",
    pathPrefixes: [
      "/admin/settings",
      "/admin/compliance",
      "/admin/privacy",
      "/admin/setup",
    ],
    summary:
      "Initial configuration checklist: business identity, GSTIN, invoice print branding, document numbering sequences, and data migration.",
    whyNeeded:
      "Before running live transactions, a store must configure legal business details, print templates, and starting document numbers. Skipping setup causes missing GST headers on invoices or duplicate receipt numbers. This checklist guides the solopreneur owner through mandatory pre-launch steps.",
    howItWorks:
      "1. Checklist Engine: Evaluates system readiness across Business Profile, Print Branding, Numbering Sequences, Chart of Accounts, and Inventory.\n2. Document Numbering: Configures prefix and running sequence for Invoices (INV-), Contracts (SUB-), Receipts (REC-), Challans (DC-), and POs (PO-).\n3. Print Branding: Uploads store logo, GSTIN, address, and terms & conditions for receipts and tax invoices.\n4. Migration Staging: Safeguards legacy customer balances and outstanding records.",
    workflows: [
      {
        name: "Complete Store Setup Checklist",
        description: "Step-by-step checklist to prepare SUBIDHA CORE for operations.",
        steps: [
          {
            step: 1,
            title: "Unified Business Profile",
            description: "Enter Store Name, Legal Entity Name, GSTIN, PAN, Phone, Email, and Registered Address.",
            actionHref: "/admin/settings/business-setup/profile",
            actionLabel: "Store Profile",
          },
          {
            step: 2,
            title: "Print & PDF Branding",
            description: "Upload store logo, header banner, footer contact details, and bank payment QR code for receipts.",
            actionHref: "/admin/settings/business-setup/print-branding",
            actionLabel: "Print Branding",
          },
          {
            step: 3,
            title: "Document Numbering Prefixes",
            description: "Set sequential numbering format for Invoices, Contracts, Receipts, and POs.",
            actionHref: "/admin/settings/business-setup/document-numbering",
            actionLabel: "Document Numbering",
          },
          {
            step: 4,
            title: "Verify Accounting & Inventory Baseline",
            description: "Check Chart of Accounts, Finance Accounts, and Initial Opening Stock.",
            actionHref: "/admin/accounting/setup",
            actionLabel: "Accounting Setup",
          },
        ],
      },
      {
        name: "Brand Data Center & Meta/WhatsApp Scheduled Catalog Sync (₹0)",
        description:
          "Configure social platform links, Google Reviews, and copy your live scheduled CSV feed for free WhatsApp & Facebook Shop sync.",
        steps: [
          {
            step: 1,
            title: "Open Brand Data Center",
            description:
              "Navigate to Settings > Business Setup > Brand Data Center to manage social links and view eligible products in feed.",
            actionHref: "/admin/settings/business-setup/brand-data-center",
            actionLabel: "Brand Data Center",
          },
          {
            step: 2,
            title: "Copy Live Feed URL",
            description:
              "Click '📋 Copy Feed URL'. The endpoint (`/api/v1/public/catalog/whatsapp-feed.csv`) automatically formats your published furniture products into Meta Commerce Manager CSV.",
          },
          {
            step: 3,
            title: "Connect with Meta Commerce Manager",
            description:
              "In Meta Commerce Manager (business.facebook.com/commerce), create a Data Feed scheduled Daily at 6:00 AM INR, then connect your WhatsApp Business account under Connected Channels.",
          },
        ],
      },
    ],
    setupRequirements: [
      {
        title: "Store Registration & GSTIN",
        description: "Official legal entity and tax credentials.",
        setupHref: "/admin/settings/business-setup/profile",
      },
      {
        title: "Meta Commerce Scheduled Feed",
        description: "Zero-cost native CSV feed for WhatsApp Business & Facebook Page Shop sync.",
        setupHref: "/admin/settings/business-setup/brand-data-center",
      },
    ],
    invariants: [
      "Document numbering prefixes cannot be casually renamed once transactions have been posted.",
      "Legacy balances imported from batches must link to their migration staging rows.",
      "Meta Scheduled Feeds are 100% free (₹0); never pay for third-party sync plugins.",
    ],
    keyActions: [
      { label: "Business Setup Hub", href: "/admin/settings/business-setup", variant: "primary" },
      { label: "Brand Data Center (Feed URL)", href: "/admin/settings/business-setup/brand-data-center", variant: "secondary" },
      { label: "Store Profile", href: "/admin/settings/business-setup/profile", variant: "secondary" },
      { label: "Document Numbering", href: "/admin/settings/business-setup/document-numbering", variant: "secondary" },
    ],
  },
];

/** Resolves an admin pathname to the most relevant Help topic. */
export function resolveHelpTopic(pathname: string): AdminHelpTopic {
  if (!pathname || pathname === "/admin" || pathname === "/admin/dashboard") {
    return ADMIN_HELP_TOPICS.find((t) => t.id === "command-center") || ADMIN_HELP_TOPICS[0];
  }

  const matched = ADMIN_HELP_TOPICS.find((topic) =>
    topic.pathPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  );

  return matched ?? ADMIN_HELP_TOPICS[0];
}

/** Searches help topics by query string. */
export function searchHelpTopics(query: string): AdminHelpTopic[] {
  const q = query.trim().toLowerCase();
  if (!q) return ADMIN_HELP_TOPICS;

  return ADMIN_HELP_TOPICS.filter((topic) => {
    return (
      topic.title.toLowerCase().includes(q) ||
      topic.shortTitle.toLowerCase().includes(q) ||
      topic.summary.toLowerCase().includes(q) ||
      topic.whyNeeded.toLowerCase().includes(q) ||
      topic.howItWorks.toLowerCase().includes(q) ||
      topic.workflows.some(
        (wf) =>
          wf.name.toLowerCase().includes(q) ||
          wf.description.toLowerCase().includes(q) ||
          wf.steps.some(
            (s) => s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
          )
      )
    );
  });
}

/** Searches action playbooks by query string. */
export function searchActionPlaybooks(query: string): ActionPlaybook[] {
  const q = query.trim().toLowerCase();
  if (!q) return ACTION_PLAYBOOKS;

  return ACTION_PLAYBOOKS.filter((pb) => {
    return (
      pb.intent.toLowerCase().includes(q) ||
      pb.breadcrumbSteps.some((b) => b.toLowerCase().includes(q)) ||
      pb.criticalRules.some((r) => r.toLowerCase().includes(q)) ||
      (pb.staffOperationalTip && pb.staffOperationalTip.toLowerCase().includes(q)) ||
      (pb.scopeOfImprovement && pb.scopeOfImprovement.some((s) => s.toLowerCase().includes(q))) ||
      pb.stepByStepGuide.some(
        (st) => st.title.toLowerCase().includes(q) || st.description.toLowerCase().includes(q)
      )
    );
  });
}
