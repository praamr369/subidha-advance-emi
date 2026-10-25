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

// ── 24 High-Intent Action Playbooks ("I Want To...") ─────────────────────────
export const ACTION_PLAYBOOKS: ActionPlaybook[] = [
  {
    id: "create-contract",
    intent: "Make a Lucky Plan Advance EMI Contract",
    category: "sales-contracts",
    routePrefix: "/admin/subscriptions",
    actionHref: "/admin/subscriptions/advance-emi/create",
    actionLabel: "New Contract",
    breadcrumbSteps: [
      "Subscriptions",
      "Create Contract",
      "Customer Search / KYC",
      "Select Batch & Product",
      "Allocate Lucky ID",
      "Preview Schedule",
      "Activate Contract",
    ],
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
  },
  {
    id: "create-rent-lease-package",
    intent: "Create a Multi-Product Rental or Lease Contract with Custom Yield & Deposit",
    category: "sales-contracts",
    routePrefix: "/admin/subscriptions",
    actionHref: "/admin/subscriptions/advance-emi/create",
    actionLabel: "New Rent/Lease Contract",
    breadcrumbSteps: [
      "Subscriptions",
      "Create Contract",
      "Select RENT or LEASE Plan",
      "Customer & KYC Check",
      "Attach Furniture Items to Basket",
      "Customize Per-Product Yield & Deposit",
      "Review Aggregate Terms & Activate",
    ],
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
  },
  {
    id: "create-direct-sale",
    intent: "Create a Direct Retail Sale & POS Tax Invoice",
    category: "sales-contracts",
    routePrefix: "/admin/billing",
    actionHref: "/admin/billing/direct-sale/create",
    actionLabel: "New Direct Sale",
    breadcrumbSteps: [
      "Sales & Billing",
      "Direct Sales",
      "Create Direct Sale",
      "Select Customer",
      "Add Products & Quantities",
      "Apply Taxes & Discounts",
      "Approve & Post Invoice",
      "POS Payment / Receipt",
    ],
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
  },
  {
    id: "collect-emi",
    intent: "Collect Subscription Advance EMI Installment",
    category: "collections",
    routePrefix: "/admin/collections",
    actionHref: "/admin/finance/collect?workflow=advance-emi",
    actionLabel: "Collect EMI",
    breadcrumbSteps: [
      "Finance & Collections",
      "Collect Payment",
      "Search Customer (Mobile / Lucky ID)",
      "Select Pending EMI Month",
      "Pick Payment Method & Drawer Account",
      "Enter Transaction Ref / UTR",
      "Post Collection & Digital Receipt",
      "Send WhatsApp Link",
    ],
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
  },
  {
    id: "collect-direct-sale",
    intent: "Collect Retail Direct Sale Balance Payment",
    category: "collections",
    routePrefix: "/admin/collections",
    actionHref: "/admin/finance/collect?workflow=direct-sale",
    actionLabel: "Collect Sale",
    breadcrumbSteps: [
      "Collections",
      "Collect Payment (Direct Sale Mode)",
      "Select Customer Invoice",
      "Verify Open Receivable Balance",
      "Enter Payment Amount & Mode",
      "Post Receipt Document",
    ],
    stepByStepGuide: [
      {
        step: 1,
        title: "Locate Customer Invoice",
        description: "Open Collections > Direct Sale tab. Search customer to view approved invoices and open receivables.",
        fieldDetails: "Invoice Number, Customer Name, Invoice Balance.",
      },
      {
        step: 2,
        title: "Enter Amount & Payment Mode",
        description: "Enter amount received (partial or full balance). Select payment mode (Cash/UPI/Bank/Card).",
        fieldDetails: "Received Amount, Finance Account, Reference Number.",
      },
      {
        step: 3,
        title: "Post & Update Invoice Status",
        description: "Click 'Post Payment'. Generates ReceiptDocument, reduces customer receivable balance, and marks invoice as SETTLED if fully paid.",
        fieldDetails: "Receipt Document Number, Remaining Balance.",
      },
    ],
    criticalRules: [
      "Collections can only be posted against posted invoices with positive outstanding balance.",
      "Over-collection is blocked unless explicitly routed to Customer Advance deposit.",
    ],
  },
  {
    id: "collect-advance-deposit",
    intent: "Collect Unapplied Customer Advance Deposit",
    category: "collections",
    routePrefix: "/admin/customer-advances",
    actionHref: "/admin/customer-advances",
    actionLabel: "Customer Advance",
    breadcrumbSteps: [
      "Collections",
      "Customer Advances",
      "New Advance Deposit",
      "Select Customer",
      "Enter Amount & Payment Mode",
      "Post to Customer Credit Ledger",
      "Offsets Future Bills",
    ],
    stepByStepGuide: [
      {
        step: 1,
        title: "Select Customer",
        description: "Navigate to Collections > Customer Advances. Click 'Record Advance Deposit'. Pick customer from master.",
        fieldDetails: "Customer ID, Phone, Billing Address.",
      },
      {
        step: 2,
        title: "Enter Deposit Amount",
        description: "Enter deposit amount received and payment mode. Enter payment date and notes.",
        fieldDetails: "Deposit Amount, Payment Date, Method, Note.",
      },
      {
        step: 3,
        title: "Post Credit Entry",
        description: "System creates a `CustomerAdvance` row (`amount`, `unapplied_amount`) which remains on the customer's ledger to offset future invoices or EMI contracts.",
        fieldDetails: "Customer Credit Balance, Ledger Entry ID.",
      },
    ],
    criticalRules: [
      "Customer advance entries require explicit `payment_date` and validated finance account.",
      "Unapplied balances remain customer liability until formally applied against an invoice or refunded.",
    ],
  },
  {
    id: "create-pim-blueprint",
    intent: "Add a New Furniture Product Blueprint in PIM",
    category: "pim-products",
    routePrefix: "/admin/products",
    actionHref: "/admin/products/create",
    actionLabel: "Create Product",
    breadcrumbSteps: [
      "Products",
      "Create Product",
      "Set Name, Category & Base Price",
      "Assign HSN 9403 Tax Code",
      "Define Attribute Matrix (Size/Finish)",
      "Generate Variant SKUs",
      "Set Stock Readiness",
      "Activate Sales Channels",
    ],
    stepByStepGuide: [
      {
        step: 1,
        title: "Base Product Blueprint Details",
        description: "Go to Products > Create Product. Select Item Type (Finished Good, Raw Material, Accessory) and Stock Type (Stock Item, Made-to-Order). Enter Name, Category, and Base Price.",
        fieldDetails: "Product Name, Item Type, Stock Type, Category, Base Price, HSN Code (9403).",
      },
      {
        step: 2,
        title: "Attribute Permutations",
        description: "Configure custom attributes: Bed Size (King, Queen), Wood Species (Sheesham, Teak), Finish (Walnut, Honey).",
        fieldDetails: "Attribute Groups, Dimension specs, Material types.",
      },
      {
        step: 3,
        title: "Generate Variant SKUs",
        description: "In PIM Blueprints tab, generate SKUs for each attribute combination. Each variant receives a unique SKU code.",
        fieldDetails: "Variant SKU Code, Barcode, Variant specific price adjustment.",
      },
      {
        step: 4,
        title: "Inventory Profile & Sales Readiness",
        description: "Ensure 'Inventory Ready' badge is green by setting stock tracking rules. Mark channels as active: Advance EMI, Direct Sale, Rent, Lease.",
        fieldDetails: "Reorder Threshold, Lead time, Channel eligibility flags.",
      },
    ],
    criticalRules: [
      "Never delete a product with existing contract, invoice, or stock ledger records; archive or deactivate it instead.",
      "Every variant SKU must inherit or explicitly define a valid HSN tax code.",
      "Base price defined on the blueprint serves as the baseline price floor.",
    ],
  },
  {
    id: "create-bom",
    intent: "Define a Bill of Materials (BOM) Formula",
    category: "manufacturing",
    routePrefix: "/admin/manufacturing",
    actionHref: "/admin/manufacturing/boms",
    actionLabel: "BOM Register",
    breadcrumbSteps: [
      "Manufacturing",
      "BOM Register",
      "New BOM",
      "Select Finished Product",
      "Add Raw Timber, Foam, Hardware Lines",
      "Set Scrap Allowance %",
      "Approve & Activate",
    ],
    stepByStepGuide: [
      {
        step: 1,
        title: "Select Output Finished Good",
        description: "Go to Manufacturing > BOM Register > New BOM. Pick the finished furniture piece (e.g. 'Royal Teak Dining Table').",
        fieldDetails: "Finished Good Product SKU, Revision Number, Output Unit (1 Pc/Set).",
      },
      {
        step: 2,
        title: "Add Raw Material Components",
        description: "Add constituent materials: Teak wood (cubic feet), Adhesive (kg), Hardware screws (nos), Polish (litres) with standard consumption rates.",
        fieldDetails: "Raw Material Item ID, Standard Qty, Unit of Measure (UOM).",
      },
      {
        step: 3,
        title: "Set Scrap & Wastage Tolerance",
        description: "Specify expected cutting and sanding scrap allowance percentage (e.g. 5%).",
        fieldDetails: "Scrap Tolerance Percentage.",
      },
      {
        step: 4,
        title: "Activate BOM Recipe",
        description: "Mark BOM as active. It is now selectable by workshop managers for production jobs.",
        fieldDetails: "Status: Active, Approved By Staff ID.",
      },
    ],
    criticalRules: [
      "Raw materials in a BOM must be registered in the catalog as active items.",
      "BOM formulas once used in active production jobs cannot be altered destructively; create a new revision instead.",
    ],
  },
  {
    id: "run-production-job",
    intent: "Start a Workshop Production Job & Record Labor",
    category: "manufacturing",
    routePrefix: "/admin/manufacturing",
    actionHref: "/admin/manufacturing/jobs",
    actionLabel: "Production Jobs",
    breadcrumbSteps: [
      "Manufacturing",
      "Production Jobs",
      "New Job",
      "Select BOM & Target Quantity",
      "Issue Raw Materials from Stock to WIP",
      "Log Carpenter / Polisher Labor Lines",
      "Receive Finished Goods Stock",
      "Post Job Completion",
    ],
    stepByStepGuide: [
      {
        step: 1,
        title: "Launch Production Job",
        description: "Open Manufacturing > Production Jobs > New Job. Select active BOM and target output quantity (e.g. 10 dining chairs).",
        fieldDetails: "BOM ID, Target Quantity, Workshop Center, Scheduled Completion Date.",
      },
      {
        step: 2,
        title: "Issue Raw Materials",
        description: "Click 'Issue Materials'. System verifies available stock and writes `PRODUCTION_ISSUE_OUT` movements from inventory to WIP.",
        fieldDetails: "Raw material items, Quantities issued, Warehouse location.",
      },
      {
        step: 3,
        title: "Record Craftsperson Labor",
        description: "Log labor lines (`ProductionLaborLine`) for carpenters/polishers (piece-rate or hourly). System creates accounting labor accrual (Debit WIP, Credit Salary Payable).",
        fieldDetails: "Staff Employee ID, Operation Type (Carpentry/Polishing), Wage Amount.",
      },
      {
        step: 4,
        title: "Receive Finished Units & Close Job",
        description: "Record actual good units finished and actual scrap. Post completion: finished units enter stock (`FIN_GOODS_IN`) and WIP clears.",
        fieldDetails: "Good Units Produced, Actual Scrap, Finished Goods Warehouse.",
      },
    ],
    criticalRules: [
      "Labor must be fully recorded and posted before a production job can be marked completed.",
      "Negative raw material stock is blocked; materials must be physically in stock before issuance.",
      "Unposted production labor lines for an employee are automatically pulled into their monthly salary sheet.",
    ],
  },
  {
    id: "create-purchase-order",
    intent: "Issue a Purchase Order (PO) to a Supplier",
    category: "purchases-vendors",
    routePrefix: "/admin/purchases",
    actionHref: "/admin/purchases/orders",
    actionLabel: "New PO",
    breadcrumbSteps: [
      "Purchases",
      "Purchase Orders",
      "New Purchase Order",
      "Select Vendor",
      "Add Material Items & Negotiated Rates",
      "Set Expected Delivery Date",
      "Approve & Transmit PO to Vendor",
    ],
    stepByStepGuide: [
      {
        step: 1,
        title: "Select Supplier & Terms",
        description: "Go to Purchases > Orders > New PO. Select vendor from vendor master. Payment and delivery terms autofill.",
        fieldDetails: "Vendor ID, Billing Address, Payment Terms (Net 30, COD, Advance).",
      },
      {
        step: 2,
        title: "Add Purchase Items",
        description: "Add items, quantities required, and negotiated unit purchase rates.",
        fieldDetails: "Item SKU, Quantity, Unit Purchase Rate, Expected Delivery Date.",
      },
      {
        step: 3,
        title: "Approve & Send PO",
        description: "Review total value. Click 'Approve PO'. Print or email official PO document to the vendor.",
        fieldDetails: "PO Number (PO-XXXXX), Status: Approved.",
      },
    ],
    criticalRules: [
      "PO lines require real inventory items and active registered vendors.",
      "PO does not create physical stock movements; stock increases only upon Goods Receipt (GRN).",
    ],
  },
  {
    id: "receive-goods-grn",
    intent: "Inspect & Receive Goods from Supplier (GRN)",
    category: "purchases-vendors",
    routePrefix: "/admin/purchases",
    actionHref: "/admin/purchases/receipts",
    actionLabel: "New GRN",
    breadcrumbSteps: [
      "Purchases",
      "Goods Receipts",
      "New Goods Receipt (GRN)",
      "Select Linked Purchase Order",
      "Inspect Shipment Units",
      "Enter Accepted vs Rejected Quantities",
      "Post GRN (Adds Physical Stock)",
    ],
    stepByStepGuide: [
      {
        step: 1,
        title: "Link to Purchase Order",
        description: "When supplier shipment arrives at warehouse, open Purchases > Receipts > New GRN. Select the open PO.",
        fieldDetails: "PO Number, Supplier Delivery Challan Number, Date.",
      },
      {
        step: 2,
        title: "Inspect & Enter Received Counts",
        description: "Count items and inspect for timber cracks, broken glass, or fabric stains. Record accepted quantity and rejected quantity.",
        fieldDetails: "Accepted Qty, Rejected Qty, Rejection Reason (Transit Damage, Moisture Defect).",
      },
      {
        step: 3,
        title: "Post GRN to Warehouse Stock",
        description: "Select target warehouse (e.g. 'Central Godown'). Click 'Post GRN'. System creates `PURCHASE_RECEIPT` rows in the stock ledger.",
        fieldDetails: "GRN Number (GRN-XXXXX), Target Warehouse Location.",
      },
    ],
    criticalRules: [
      "Over-receiving against a PO is blocked unless explicitly authorized with a written business reason.",
      "Posting a GRN increases physical inventory stock immediately.",
    ],
  },
  {
    id: "book-purchase-bill",
    intent: "Book a Supplier Tax Invoice / Purchase Bill",
    category: "purchases-vendors",
    routePrefix: "/admin/purchases",
    actionHref: "/admin/purchases/bills",
    actionLabel: "New Purchase Bill",
    breadcrumbSteps: [
      "Purchases",
      "Purchase Bills",
      "New Purchase Bill",
      "Link to Posted GRN",
      "Enter Supplier Tax Invoice Number",
      "Verify Tax Rates & Input GST Credit",
      "Approve & Post Bill",
    ],
    stepByStepGuide: [
      {
        step: 1,
        title: "Link GRN & Vendor",
        description: "Go to Purchases > Bills > New Bill. Select the vendor and the posted GRN.",
        fieldDetails: "Vendor ID, GRN Number, Supplier Invoice Number.",
      },
      {
        step: 2,
        title: "Verify Invoice Amounts & GST",
        description: "Enter the supplier's invoice number and verify that line items match physical goods received. Check GST tax breakdown for Input Tax Credit (ITC).",
        fieldDetails: "Taxable Value, CGST, SGST, IGST, Net Bill Total.",
      },
      {
        step: 3,
        title: "Post Bill to Accounts Payable",
        description: "Approve and Post. Books accounting journal (Debit Inventory/Expense, Credit Accounts Payable / Sundry Creditors).",
        fieldDetails: "Bill Number (BILL-XXXXX), Due Date.",
      },
    ],
    criticalRules: [
      "Purchase bill total must match linked goods receipt valuation.",
      "Vendor bill posting creates vendor-ledger payable balance and input GST credit entry.",
    ],
  },
  {
    id: "settle-vendor-payment",
    intent: "Settle Vendor Payables / Supplier Payout",
    category: "purchases-vendors",
    routePrefix: "/admin/vendors",
    actionHref: "/admin/accounting/vendor-settlements",
    actionLabel: "Vendor Settlements",
    breadcrumbSteps: [
      "Vendors",
      "Vendor Settlements",
      "Select Vendor",
      "Pick Open Purchase Bills",
      "Select Payout Account (Bank / Cheque)",
      "Enter Payment Reference",
      "Post Payout Voucher",
    ],
    stepByStepGuide: [
      {
        step: 1,
        title: "Select Vendor & Open Bills",
        description: "Open Accounting > Vendor Settlements > New Settlement. Select vendor to view all unpaid purchase bills.",
        fieldDetails: "Vendor Name, Outstanding Payable Balance, Open Bill List.",
      },
      {
        step: 2,
        title: "Select Bills & Allocation",
        description: "Select which bills are being settled. System calculates allocation automatically.",
        fieldDetails: "Bill IDs, Settlement Amount.",
      },
      {
        step: 3,
        title: "Post Payment Voucher",
        description: "Select Bank current account. Enter NEFT/RTGS UTR or Cheque Number. Post settlement: reduces vendor payable and debits bank.",
        fieldDetails: "Bank Account, UTR Number, Voucher Print.",
      },
    ],
    criticalRules: [
      "Vendor payments cannot exceed linked open bill totals.",
      "Settlement creates double-entry journal (Debit Accounts Payable, Credit Bank Account).",
    ],
  },
  {
    id: "count-opening-stock",
    intent: "Initialize or Count Opening Stock",
    category: "inventory",
    routePrefix: "/admin/inventory",
    actionHref: "/admin/inventory/opening-stock",
    actionLabel: "Opening Stock",
    breadcrumbSteps: [
      "Inventory",
      "Opening Stock",
      "Select Warehouse Location",
      "Enter Verified Physical Counts",
      "Enter Unit Acquisition Valuation",
      "Post Baseline Stock Ledger Entries",
    ],
    stepByStepGuide: [
      {
        step: 1,
        title: "Select Warehouse",
        description: "Go to Inventory > Opening Stock. Select the warehouse or showroom where counts were taken.",
        fieldDetails: "Warehouse Location (Showroom, Central Godown).",
      },
      {
        step: 2,
        title: "Enter Physical Counts & Costs",
        description: "Enter verified physical count and unit acquisition cost for each catalog item.",
        fieldDetails: "Item SKU, Physical Count, Unit Cost.",
      },
      {
        step: 3,
        title: "Post Opening Balance",
        description: "Click 'Post Opening Stock'. The system initializes the append-only stock ledger and posts initial inventory valuation.",
        fieldDetails: "Batch ID, Total Valuation.",
      },
    ],
    criticalRules: [
      "Opening stock initialization should be performed only once per item/location.",
      "Creates baseline inventory valuation in Chart of Accounts.",
    ],
  },
  {
    id: "adjust-stock",
    intent: "Perform a Stock Adjustment (Audit Variance or Damage)",
    category: "inventory",
    routePrefix: "/admin/inventory",
    actionHref: "/admin/inventory/adjustments",
    actionLabel: "Stock Adjustment",
    breadcrumbSteps: [
      "Inventory",
      "Stock Adjustments",
      "New Adjustment",
      "Select Item & Warehouse",
      "Enter Variance (+/- Units)",
      "Select Mandatory Reason Code",
      "Post Compensatory Ledger Row",
    ],
    stepByStepGuide: [
      {
        step: 1,
        title: "Select Item & Warehouse",
        description: "Go to Inventory > Adjustments > New Adjustment. Pick the item SKU and warehouse location.",
        fieldDetails: "Item SKU, Location, Current Stock on Hand.",
      },
      {
        step: 2,
        title: "Enter Count Variance",
        description: "Enter count variance (+ for found stock, - for missing or damaged units).",
        fieldDetails: "Adjustment Quantity (+/-), New Physical Count.",
      },
      {
        step: 3,
        title: "Audit Reason & Confirmation",
        description: "Select audit reason: Physical Stocktake Variance, Transit Damage, Polish Defect, Sample Issuance. Post adjustment.",
        fieldDetails: "Reason Code, Detailed Staff Note, Authorized Staff ID.",
      },
    ],
    criticalRules: [
      "Stock adjustments create append-only compensatory ledger entries; past stock rows are never edited.",
      "Mandatory documented reason and authenticated staff ID required.",
    ],
  },
  {
    id: "run-lucky-draw",
    intent: "Execute a Monthly Lucky Draw & Waive Winner EMIs",
    category: "lucky-plan",
    routePrefix: "/admin/lucky-draws",
    actionHref: "/admin/lucky-draws",
    actionLabel: "Lucky Draws",
    breadcrumbSteps: [
      "Lucky Plan",
      "Lucky Draws Register",
      "Select Batch & Draw Month",
      "Verify Paid-Up Eligible Subscribers",
      "Run Transparent Draw Algorithm",
      "Certify Winning Lucky ID",
      "Idempotent Future-EMI Waiver",
      "Initiate Winner Delivery",
    ],
    stepByStepGuide: [
      {
        step: 1,
        title: "Open Draw Execution",
        description: "Go to Lucky Draws > Execution. Select active batch and current draw month.",
        fieldDetails: "Batch ID, Draw Month Number, Scheduled Draw Date.",
      },
      {
        step: 2,
        title: "Verify Eligible Candidates",
        description: "System filters candidate subscribers: only subscribers who have paid all past and current month EMIs are included.",
        fieldDetails: "Eligible Subscriber Count, Disqualified/Overdue Count.",
      },
      {
        step: 3,
        title: "Conduct Transparent Draw",
        description: "Run random draw algorithm or enter verified drawn token. Confirm winning Lucky ID.",
        fieldDetails: "Winner Lucky ID, Customer Name, Contract Number.",
      },
      {
        step: 4,
        title: "Apply Winner Benefits",
        description: "System automatically waives all remaining unpaid EMIs, changes contract status to WON, and queues prize delivery.",
        fieldDetails: "Total Waived Amount, Delivery Order Triggered.",
      },
    ],
    criticalRules: [
      "Winning a draw waives future EMI obligations only; never refund or alter already-settled payments.",
      "Draw execution must be idempotent: executing the same draw multiple times cannot double-waive or corrupt records.",
      "A customer must be strictly up to date with their installment payments to be eligible for that month's draw.",
    ],
  },
  {
    id: "dispatch-delivery",
    intent: "Schedule & Dispatch a Delivery (Delivery Challan)",
    category: "delivery",
    routePrefix: "/admin/deliveries",
    actionHref: "/admin/deliveries/create",
    actionLabel: "New Delivery",
    breadcrumbSteps: [
      "Deliveries",
      "Create Delivery",
      "Link to Direct Sale or Subscription",
      "Assign Transport Vehicle & Driver",
      "Generate & Print Delivery Challan (DC)",
      "Mark Delivered (Proof of Delivery POD)",
      "Stock Deducted from Warehouse",
    ],
    stepByStepGuide: [
      {
        step: 1,
        title: "Create Delivery Order",
        description: "Go to Deliveries > New Delivery. Link to Direct Sale Invoice or Lucky Plan Contract.",
        fieldDetails: "Source Document (INV- / SUB-), Customer Name, Destination Address.",
      },
      {
        step: 2,
        title: "Assign Vehicle & Driver",
        description: "Select delivery truck, driver, and scheduled date/time slot.",
        fieldDetails: "Vehicle Reg Number, Driver Name & Phone, Scheduled Slot.",
      },
      {
        step: 3,
        title: "Generate Delivery Challan",
        description: "Print official Delivery Challan with customer copy and driver copy.",
        fieldDetails: "Delivery Challan Number (DC-XXXXX), Item Serial Numbers.",
      },
      {
        step: 4,
        title: "Mark Delivered (POD)",
        description: "Upon delivery confirmation, mark status as DELIVERED. System writes `DELIVERY_OUT` stock movement.",
        fieldDetails: "Customer Signature POD, Delivery Timestamp.",
      },
    ],
    criticalRules: [
      "Product delivery state, contract state, and payment state are separate concerns.",
      "Delivery progression is blocked for cancelled or reversed sales invoices.",
    ],
  },
  {
    id: "onboard-customer-kyc",
    intent: "Onboard a New Customer & Verify KYC",
    category: "crm-customers",
    routePrefix: "/admin/customers",
    actionHref: "/admin/customers/create",
    actionLabel: "New Customer",
    breadcrumbSteps: [
      "Customers",
      "Create Customer Profile",
      "Enter Mobile, Name & Address",
      "Attach Aadhaar / Voter ID Proof",
      "Open CRM KYC Review Queue",
      "Review & Mark Verified",
    ],
    stepByStepGuide: [
      {
        step: 1,
        title: "Create Customer Profile",
        description: "Go to Customers > Create Customer. Enter Name, Mobile Number, and Address.",
        fieldDetails: "Full Name, Primary Mobile, WhatsApp Number, Address.",
      },
      {
        step: 2,
        title: "Attach Identification Documents",
        description: "Upload photo and Aadhaar or Voter ID card. Set document expiry if applicable.",
        fieldDetails: "Document Type, ID Number, Upload Scan/Photo.",
      },
      {
        step: 3,
        title: "Review & Verify in KYC Queue",
        description: "Open CRM > KYC Queue. Review details against government ID and approve verification.",
        fieldDetails: "KYC Status: Verified, Verified By Staff ID.",
      },
    ],
    criticalRules: [
      "Customer phone numbers are unique primary identifiers; avoid duplicate customer creation.",
      "Customer ledger entries and transaction histories are permanent and audit-trailed.",
    ],
  },
  {
    id: "close-daily-register",
    intent: "Conduct End-of-Day Register Close & Sign-Off",
    category: "command-center",
    routePrefix: "/admin/close-cockpit",
    actionHref: "/admin/close-cockpit",
    actionLabel: "Daily Close",
    breadcrumbSteps: [
      "Command Center",
      "Close Cockpit",
      "Count Physical Cash Drawer Denominations",
      "Compare Actual vs Expected System Collections",
      "Document Any Cashier Variance",
      "Submit Sign-Off & Lock Day",
    ],
    stepByStepGuide: [
      {
        step: 1,
        title: "Open Daily Close Cockpit",
        description: "At the end of business hours, navigate to Close Cockpit or Finance > Daily Close.",
        fieldDetails: "Cashier Shift, Active Cash Drawer.",
      },
      {
        step: 2,
        title: "Physical Cash Count",
        description: "Count cash denominations in physical drawer. Enter total counted cash into the cockpit.",
        fieldDetails: "Counted Notes (₹500, ₹200, ₹100, ₹50, coins).",
      },
      {
        step: 3,
        title: "Variance Analysis",
        description: "System compares Opening Drawer Cash + Today's Cash Collections - Drawer Cash Out against physical count.",
        fieldDetails: "Expected Cash, Physical Cash, Variance Amount (+/-).",
      },
      {
        step: 4,
        title: "Sign-Off & Daily Lock",
        description: "Sign off on the daily close. If any discrepancy exists, record an explanation note. The daily register is locked against back-dated modifications.",
        fieldDetails: "Admin Digital Sign-off, Lock Timestamp.",
      },
    ],
    criticalRules: [
      "Total debits must strictly equal total credits in every single accounting journal entry.",
      "Once an accounting period or day is closed and signed off, operational records cannot be altered.",
    ],
  },
  {
    id: "setup-chart-accounts",
    intent: "Map Bank, Cash & UPI Accounts to Chart of Accounts",
    category: "accounting-finance",
    routePrefix: "/admin/accounting",
    actionHref: "/admin/accounting/finance-accounts",
    actionLabel: "Finance Accounts",
    breadcrumbSteps: [
      "Accounting Setup",
      "Finance Accounts Master",
      "Create Cash Drawer / Bank / UPI Account",
      "Open Dynamic COA Mapping",
      "Bind Account to Chart of Accounts Head",
      "Rolls Up into Liquid Balance KPIs",
    ],
    stepByStepGuide: [
      {
        step: 1,
        title: "Create Finance Account",
        description: "Go to Settings > Business Setup > Finance Accounts. Register Cash Drawer, HDFC Bank Current A/c, or UPI Merchant account.",
        fieldDetails: "Account Name, Account Kind (CASH, BANK, UPI), Account Number, Branch.",
      },
      {
        step: 2,
        title: "Dynamic COA Mapping",
        description: "Open Accounting Setup > Mapping Audit. Ensure each Finance Account is dynamically mapped via `FinanceAccountCoaMapping` to its ledger head.",
        fieldDetails: "Finance Account ID, Chart of Accounts Head (e.g. 1010 - Cash on Hand).",
      },
    ],
    criticalRules: [
      "Payments made to mapped accounts (like UPI_COLLECTION) dynamically roll up into parent settlement liquid balance KPIs.",
      "Do not delete or rebind accounts with active journal entries.",
    ],
  },
  {
    id: "generate-salary-sheet",
    intent: "Generate Monthly Staff Salary Sheet & Labor Pay",
    category: "hr-payroll",
    routePrefix: "/admin/hr",
    actionHref: "/admin/hr/payroll",
    actionLabel: "Payroll",
    breadcrumbSteps: [
      "HR & Staff",
      "Payroll Workbench",
      "Generate Monthly Salary Sheet",
      "Pulls Base Pay & Attendance",
      "Automatically Appends Workshop Labor Lines",
      "Review Net Payout",
      "Post Salary Payable Accounting Journal",
    ],
    stepByStepGuide: [
      {
        step: 1,
        title: "Select Month & Year",
        description: "Navigate to HR > Payroll. Select the salary month (e.g. October 2026). Click 'Generate Salary Sheet'.",
        fieldDetails: "Payroll Month, Fiscal Year.",
      },
      {
        step: 2,
        title: "Review Automated Labor Aggregation",
        description: "System pulls employee attendance and automatically queries all unposted `ProductionLaborLine` records for workshop carpenters.",
        fieldDetails: "Base Salary, Days Worked, Production Piece-Rate Labor Total, Commission.",
      },
      {
        step: 3,
        title: "Approve & Post Payroll",
        description: "Review net payout. Posting records double-entry journal (Debit Salary Expense, Credit Salary Payable).",
        fieldDetails: "Net Payable, Salary Sheet Approval ID.",
      },
    ],
    criticalRules: [
      "Unposted production labor lines for an employee must be pulled during their monthly salary sheet generation.",
      "Labor must be fully posted before a production job can be completed.",
    ],
  },
  {
    id: "approve-partner-collection",
    intent: "Review & Approve Partner Collection Submissions",
    category: "crm-customers",
    routePrefix: "/admin/partners",
    actionHref: "/admin/partners/collection-requests",
    actionLabel: "Collection Requests",
    breadcrumbSteps: [
      "Partners",
      "Collection Requests Queue",
      "Select Pending Partner Report",
      "Verify Customer & Inflow Details",
      "Approve Request (Posts to EMI Ledger)",
      "Issues Official Digital Receipt",
    ],
    stepByStepGuide: [
      {
        step: 1,
        title: "Open Pending Requests Queue",
        description: "Go to Partners > Collection Requests. Review partner-submitted collection reports.",
        fieldDetails: "Partner Name, Customer Name, Amount Collected, Payment Mode.",
      },
      {
        step: 2,
        title: "Verify Bank / Cash Inflow",
        description: "Verify that the partner has physically remitted the cash or transferred funds to store bank account.",
        fieldDetails: "Bank Deposit Slip, UTR Number, Cashier Check.",
      },
      {
        step: 3,
        title: "Approve or Reject",
        description: "Click 'Approve'. Posts the collection to the customer's subscription EMI schedule and issues official receipt. Or reject with a written note.",
        fieldDetails: "Approval Status, Official Receipt Number.",
      },
    ],
    criticalRules: [
      "Partner-scoped collections do not bypass admin posting controls; ledger updates occur only upon admin approval.",
      "Rejected requests return to partner with documented rejection reason.",
    ],
  },
  {
    id: "amend-subscription-contract",
    intent: "Handle Contract Amendment, Restructure or Return",
    category: "sales-contracts",
    routePrefix: "/admin/subscriptions",
    actionHref: "/admin/contract-amendments",
    actionLabel: "Amendments",
    breadcrumbSteps: [
      "Subscriptions",
      "Contract Amendments",
      "Select Active Subscription",
      "Choose Amendment Type (Batch Shift / Upgrade / Cancellation)",
      "Document Written Business Reason",
      "Approve Decision Sheet",
      "Reversal Traces Preserved",
    ],
    stepByStepGuide: [
      {
        step: 1,
        title: "Select Subscription Contract",
        description: "Open Subscriptions > Amendments. Select contract to amend.",
        fieldDetails: "Subscription ID, Customer Name, Current Status.",
      },
      {
        step: 2,
        title: "Select Amendment Action",
        description: "Choose action: Batch Shift (move to new batch), Product Upgrade (change furniture model), or Operational Cancellation.",
        fieldDetails: "Target Batch, Upgraded Product SKU, Difference Amount.",
      },
      {
        step: 3,
        title: "Document Reason & Print Decision Sheet",
        description: "Enter mandatory business reason. Approving updates contract while preserving audit reversal traces.",
        fieldDetails: "Decision Sheet Print, Approval Audit ID.",
      },
    ],
    criticalRules: [
      "Settled payments are never deleted; adjustments utilize reversal entries and credit notes.",
      "Lucky draw history must remain uncorrupted during batch shifts.",
    ],
  },
  {
    id: "log-warranty-service",
    intent: "Log a Customer Warranty Claim or Service Ticket",
    category: "delivery",
    routePrefix: "/admin/service-desk",
    actionHref: "/admin/service-desk/tickets",
    actionLabel: "Service Desk",
    breadcrumbSteps: [
      "Service Desk & Warranty",
      "Tickets",
      "New Support Ticket",
      "Select Customer & Delivered Furniture",
      "Document Defect (Polish / Joint / Fabric)",
      "Assign Field Carpenter / Technician",
      "Inspect, Repair & Resolve",
    ],
    stepByStepGuide: [
      {
        step: 1,
        title: "Create Service Ticket",
        description: "Go to Service Desk > Tickets > New Ticket. Search customer and select their purchased furniture piece.",
        fieldDetails: "Customer Mobile, Invoice / Contract ID, Product Model.",
      },
      {
        step: 2,
        title: "Document Issue & Severity",
        description: "Describe defect (e.g. table leg wobble, drawer runner sticking, polish fade) and upload photos.",
        fieldDetails: "Issue Category, Severity (Low, Medium, Critical), Photos.",
      },
      {
        step: 3,
        title: "Assign Technician & Schedule Visit",
        description: "Assign service technician or workshop carpenter for doorstep repair visit.",
        fieldDetails: "Technician ID, Visit Date Slot.",
      },
      {
        step: 4,
        title: "Mark Resolved",
        description: "Once repaired and customer signs job sheet, mark ticket as RESOLVED.",
        fieldDetails: "Resolution Notes, Spare parts consumed.",
      },
    ],
    criticalRules: [
      "Warranty eligibility checks invoice delivery date against product warranty policy.",
      "Spare parts replaced from inventory require stock deduction ticket.",
    ],
  },
  {
    id: "configure-document-numbering",
    intent: "Configure Starting Document Numbering & Store Profile",
    category: "business-setup",
    routePrefix: "/admin/settings",
    actionHref: "/admin/settings/business-setup/document-numbering",
    actionLabel: "Document Numbering",
    breadcrumbSteps: [
      "Settings",
      "Business Setup",
      "Unified Business Profile",
      "Set Store Legal Name & GSTIN",
      "Configure Print Branding (Logo & Terms)",
      "Set Document Prefixes (INV-, SUB-, REC-, DC-, PO-)",
      "Save & Test Generate Sample",
    ],
    stepByStepGuide: [
      {
        step: 1,
        title: "Unified Business Profile",
        description: "Open Settings > Business Setup > Store Profile. Enter legal store name, trade name, GSTIN, PAN, and registered address.",
        fieldDetails: "Store Name, GSTIN, Phone, Address.",
      },
      {
        step: 2,
        title: "Print Branding & Header",
        description: "Upload store logo, receipt header contact info, and bank payment QR code for invoices.",
        fieldDetails: "Logo PNG/JPG, UPI Payment QR Code, Terms & Conditions.",
      },
      {
        step: 3,
        title: "Document Numbering Sequences",
        description: "Configure sequential numbering prefix and padding for Invoices (INV-), Contracts (SUB-), Receipts (REC-), Challans (DC-), and POs (PO-).",
        fieldDetails: "Prefix String, Sequence Length, Next Number.",
      },
    ],
    criticalRules: [
      "Document numbering prefixes cannot be casually altered once transactions have been posted.",
      "All printed documents must display compliant GSTIN and registered legal address.",
    ],
  },
  {
    id: "sync-whatsapp-meta-catalog",
    intent: "Sync Catalog to WhatsApp Business & Facebook Shop (100% Free / ₹0)",
    category: "pim-products",
    routePrefix: "/admin/settings/business-setup/brand-data-center",
    actionHref: "/admin/settings/business-setup/brand-data-center",
    actionLabel: "Brand Data Center",
    breadcrumbSteps: [
      "Brand Data Center",
      "Copy Scheduled Feed URL (/api/v1/public/catalog/whatsapp-feed.csv)",
      "Open Meta Commerce Manager (business.facebook.com/commerce)",
      "Catalogue > Data Sources > Add Items > Data Feed",
      "Select 'Use a URL / Set a Schedule' (Daily 06:00 AM, INR)",
      "Link Catalog to WhatsApp Business Account",
      "Connect Facebook Page Shop & Instagram (Optional)",
      "Auto-Sync Live (₹0 Cost Forever)",
    ],
    stepByStepGuide: [
      {
        step: 1,
        title: "Copy Live Feed URL from Brand Data Center",
        description:
          "Open Settings > Business Setup > Brand Data Center. Under 'Live Meta & WhatsApp Catalog Scheduled Data Feed', click '📋 Copy Feed URL'. The feed endpoint is `https://subidhafurnitureasansol.com/api/v1/public/catalog/whatsapp-feed.csv`. Products are automatically included if active, finished goods, published in PIM (or legacy catalog), have a valid photo, and price > 0.",
        fieldDetails: "Live CSV Feed URL, Eligible Products Count, Instant Copy Action.",
      },
      {
        step: 2,
        title: "Add Data Feed in Meta Commerce Manager",
        description:
          "Log in to Meta Commerce Manager (business.facebook.com/commerce). If you don't have a catalog, create an E-commerce/Products catalog. Go to Catalogue > Data Sources > Add Items > Data Feed. Choose 'Yes' to upload spreadsheet, select 'Use a URL / Set a Schedule'. Paste your feed URL, set Schedule to Daily (e.g., 06:00 AM), set Default Currency to 'INR - Indian Rupee', and click 'Save Feed and Upload'. Meta pulls all products with photos and prices immediately.",
        fieldDetails: "Meta Commerce Manager URL, Data Feed URL, Schedule (Daily/Hourly), Currency (INR).",
      },
      {
        step: 3,
        title: "Link Catalog to WhatsApp Business Account",
        description:
          "In Meta Commerce Manager (or Meta Business Suite): go to Settings > Business Assets (or Catalog Settings) > Connected Channels > WhatsApp. Select your registered WhatsApp Business phone number (+91 ...) and click Connect. Alternatively, open your phone's WhatsApp Business app > Settings > Business Tools > Catalogue > Manage Catalog, and link your Meta Commerce Manager account. Done! Customers chatting with you will see the Shopping Bag icon (🛍️) and can browse all products and place inquiries.",
        fieldDetails: "WhatsApp Business Phone Number, Connected Channel Status, In-Chat Catalog 🛍️.",
      },
      {
        step: 4,
        title: "Connect Facebook Page Shop & Instagram (Optional, Free)",
        description:
          "Under Connected Channels in Meta Commerce Manager, click 'Connect Facebook Page' to show the shop storefront on your official Facebook page. Click 'Connect Instagram Account' to enable Instagram Shopping and product photo tags.",
        fieldDetails: "Facebook Page ID, Instagram Business Handle.",
      },
    ],
    criticalRules: [
      "100% Completely Free (₹0): Meta charges ₹0 for product catalogs, sync feeds, and in-chat WhatsApp browsing. Never pay for third-party sync apps or plugins.",
      "Automated Append-Sync: Whenever you update a price or add a photo in PIM, Meta's scheduled fetch automatically updates WhatsApp and Facebook without any manual typing.",
      "Feed Inclusion Filter: Products must be active (is_active=True), finished goods (item_type='FINISHED_GOOD'), published in PIM, have a valid image URL, and have base price > 0.",
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
      pb.stepByStepGuide.some(
        (st) => st.title.toLowerCase().includes(q) || st.description.toLowerCase().includes(q)
      )
    );
  });
}
