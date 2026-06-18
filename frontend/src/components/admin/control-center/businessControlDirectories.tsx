import {
  ArrowLeftRight,
  BadgeIndianRupee,
  BanknoteArrowDown,
  Boxes,
  Building2,
  CalendarCheck,
  ClipboardList,
  FileBarChart2,
  FileStack,
  FolderKanban,
  Landmark,
  PackageSearch,
  ReceiptText,
  ScrollText,
  ShieldCheck,
  WalletCards,
} from "lucide-react";

import type { WorkspaceDirectoryGroup } from "@/components/admin/control-center/WorkspaceDirectory";
import { ROUTES } from "@/lib/routes";

export const FINANCE_CONTROL_DIRECTORY_GROUPS: WorkspaceDirectoryGroup[] = [
  {
    title: "Commission control",
    description: "Keep partner commission review, payout preparation, and payout history explicit.",
    items: [
      {
        title: "Commission Register",
        description: "Review pending, settled, and reversed commissions from stored rows only.",
        href: ROUTES.admin.financeCommissions,
        icon: <BadgeIndianRupee className="h-4 w-4" />,
      },
      {
        title: "Payout Queue",
        description: "Open the settled commission queue before creating or finalizing payout batches.",
        href: ROUTES.admin.financeSettledCommissions,
        icon: <WalletCards className="h-4 w-4" />,
      },
      {
        title: "Payout Batches",
        description: "Inspect draft, finalized, and cancelled batch lifecycles with audit visibility.",
        href: ROUTES.admin.financePayoutBatches,
        icon: <FolderKanban className="h-4 w-4" />,
      },
    ],
  },
  {
    title: "Verification and review",
    description: "Cross-check finance exceptions without merging them into cashier or accounting posting flows.",
    items: [
      {
        title: "Commission Reconciliation",
        description: "Detect missing commission rows, invalid links, and partner drift before payout actions.",
        href: ROUTES.admin.financeReconciliation,
        icon: <ShieldCheck className="h-4 w-4" />,
      },
      {
        title: "Admin Reconciliation",
        description: "Open the EMI and payment-side exception queue on the canonical collections route.",
        href: ROUTES.admin.reconciliation,
        icon: <ArrowLeftRight className="h-4 w-4" />,
      },
      {
        title: "Payment Register",
        description: "Inspect underlying payment truth before flagging finance-side issues.",
        href: ROUTES.admin.payments,
        icon: <ScrollText className="h-4 w-4" />,
      },
    ],
  },
  {
    title: "Accounting handoff",
    description: "Jump into the downstream books and payable surfaces without blurring domain boundaries.",
    items: [
      {
        title: "Cash Book",
        description: "Review cash-side posted book rows inside the accounting module.",
        href: ROUTES.admin.accountingBooksCash,
        icon: <BanknoteArrowDown className="h-4 w-4" />,
      },
      {
        title: "Purchase Bills",
        description: "Inspect stock-inward and payable documents handled by accounting services.",
        href: ROUTES.admin.accountingPurchaseBills,
        icon: <FileStack className="h-4 w-4" />,
      },
      {
        title: "Vendor Settlements",
        description: "Review payable settlement drafts and posted vendor-clearing transactions.",
        href: ROUTES.admin.accountingVendorSettlements,
        icon: <Building2 className="h-4 w-4" />,
      },
    ],
  },
];

export const ACCOUNTING_REGISTER_DIRECTORY_GROUPS: WorkspaceDirectoryGroup[] = [
  {
    title: "Core setup",
    description: "Maintain the accounting master and posting rails from one workspace family.",
    items: [
      {
        title: "Chart of Accounts",
        description: "Govern chart accounts and operational finance accounts without breaking posting controls.",
        href: ROUTES.admin.accountingChartOfAccounts,
        icon: <Landmark className="h-4 w-4" />,
      },
      {
        title: "Journals",
        description: "Create, post, and void manual journal entries with explicit review posture.",
        href: ROUTES.admin.accountingJournals,
        icon: <ScrollText className="h-4 w-4" />,
      },
      {
        title: "Books",
        description: "Move into cash, bank, UPI, sales, and purchase books backed by posted rows only.",
        href: ROUTES.admin.accountingBooks,
        icon: <ReceiptText className="h-4 w-4" />,
      },
    ],
  },
  {
    title: "Payables and purchase control",
    description: "Keep supplier, payable, and purchase review separate from billing and cashier rails.",
    items: [
      {
        title: "Vendor Register",
        description: "Maintain supplier master records and inspect payable exposure.",
        href: ROUTES.admin.accountingVendors,
        icon: <Building2 className="h-4 w-4" />,
      },
      {
        title: "Purchase Bills",
        description: "Review draft, approved, and posted purchase bills with stock-inward clarity.",
        href: ROUTES.admin.accountingPurchaseBills,
        icon: <FileStack className="h-4 w-4" />,
      },
      {
        title: "Vendor Settlements",
        description: "Post payable-clearing settlements from finance accounts through accounting services.",
        href: ROUTES.admin.accountingVendorSettlements,
        icon: <WalletCards className="h-4 w-4" />,
      },
    ],
  },
  {
    title: "Statements and review",
    description: "Move from posted entries into books and financial statements without inventing balances.",
    items: [
      {
        title: "Trial Balance",
        description: "Review posted debit and credit totals for balance integrity.",
        href: ROUTES.admin.accountingTrialBalance,
        icon: <FileBarChart2 className="h-4 w-4" />,
      },
      {
        title: "Profit & Loss",
        description: "Inspect posted income and expense rollups for the selected period.",
        href: ROUTES.admin.accountingProfitLoss,
        icon: <ClipboardList className="h-4 w-4" />,
      },
      {
        title: "Balance Sheet",
        description: "Inspect assets, liabilities, and equity as of a selected date.",
        href: ROUTES.admin.accountingBalanceSheet,
        icon: <ShieldCheck className="h-4 w-4" />,
      },
    ],
  },
];

export const ACCOUNTING_BOOK_DIRECTORY_GROUPS: WorkspaceDirectoryGroup[] = [
  {
    title: "Cash and bank books",
    description: "Move across the posted money books used for daily accounting review.",
    items: [
      {
        title: "Cash Book",
        description: "Review cash-account posted rows without opening cashier collection flows.",
        href: ROUTES.admin.accountingBooksCash,
        icon: <BanknoteArrowDown className="h-4 w-4" />,
      },
      {
        title: "Bank Book",
        description: "Inspect posted bank-account rows generated through controlled accounting paths.",
        href: ROUTES.admin.accountingBooksBank,
        icon: <Landmark className="h-4 w-4" />,
      },
      {
        title: "UPI Book",
        description: "Review posted UPI-account rows within the accounting subsystem.",
        href: ROUTES.admin.accountingBooksUpi,
        icon: <WalletCards className="h-4 w-4" />,
      },
    ],
  },
  {
    title: "Commercial books",
    description: "Shift into sales and purchase books without leaving the accounting control family.",
    items: [
      {
        title: "Sales Book",
        description: "Inspect posted sales-side journal rows and commercial memo flow.",
        href: ROUTES.admin.accountingBooksSales,
        icon: <ReceiptText className="h-4 w-4" />,
      },
      {
        title: "Purchase Book",
        description: "Review posted purchase-side entries sourced from approved purchase documents.",
        href: ROUTES.admin.accountingBooksPurchase,
        icon: <FileStack className="h-4 w-4" />,
      },
      {
        title: "Journals",
        description: "Return to manual journal control for draft, posted, and void review.",
        href: ROUTES.admin.accountingJournals,
        icon: <ScrollText className="h-4 w-4" />,
      },
    ],
  },
];

export const ACCOUNTING_REPORT_DIRECTORY_GROUPS: WorkspaceDirectoryGroup[] = [
  {
    title: "Statements",
    description: "Core posted accounting statements grouped for daily and period-end review.",
    items: [
      {
        title: "Trial Balance",
        description: "Check posted debits and credits for period balance integrity.",
        href: ROUTES.admin.accountingTrialBalance,
        icon: <FileBarChart2 className="h-4 w-4" />,
      },
      {
        title: "Profit & Loss",
        description: "Review posted income and expense totals without derived placeholders.",
        href: ROUTES.admin.accountingProfitLoss,
        icon: <ClipboardList className="h-4 w-4" />,
      },
      {
        title: "Balance Sheet",
        description: "Inspect point-in-time assets, liabilities, and equity from posted journals.",
        href: ROUTES.admin.accountingBalanceSheet,
        icon: <ShieldCheck className="h-4 w-4" />,
      },
    ],
  },
  {
    title: "Linked registers",
    description: "Jump into the supporting books and register pages that explain the statements.",
    items: [
      {
        title: "Cash Book",
        description: "Review cash-side posted rows behind statement totals.",
        href: ROUTES.admin.accountingBooksCash,
        icon: <BanknoteArrowDown className="h-4 w-4" />,
      },
      {
        title: "Sales Book",
        description: "Inspect posted sales rows that feed income visibility.",
        href: ROUTES.admin.accountingBooksSales,
        icon: <ReceiptText className="h-4 w-4" />,
      },
      {
        title: "Purchase Book",
        description: "Inspect posted purchase rows supporting expense and stock recognition.",
        href: ROUTES.admin.accountingBooksPurchase,
        icon: <FileStack className="h-4 w-4" />,
      },
    ],
  },
  {
    title: "Period governance",
    description: "Period-close readiness and lock posture without triggering any accounting mutations.",
    items: [
      {
        title: "Close Cockpit",
        description: "Combined P2C/P4A/P4B/P4C readiness view with can_close and can_lock indicators.",
        href: ROUTES.admin.accountingCloseCockpit,
        icon: <CalendarCheck className="h-4 w-4" />,
      },
      {
        title: "Accounting Periods",
        description: "Manage financial year periods and trigger the explicit audited period lock.",
        href: ROUTES.admin.accountingPeriods,
        icon: <ShieldCheck className="h-4 w-4" />,
      },
    ],
  },
];

export const BILLING_CONTROL_DIRECTORY_GROUPS: WorkspaceDirectoryGroup[] = [
  {
    title: "Document control",
    description: "Stay inside billing document truth without drifting into accounting posting or cashier collection lanes.",
    items: [
      {
        title: "Document Register",
        description: "Review invoices, receipts, credit notes, and debit notes from one billing-facing directory.",
        href: ROUTES.admin.billingRegister,
        icon: <FolderKanban className="h-4 w-4" />,
      },
      {
        title: "Invoices",
        description: "Review approve/post invoice flow and open linked billing detail surfaces.",
        href: ROUTES.admin.billingInvoices,
        icon: <ReceiptText className="h-4 w-4" />,
      },
      {
        title: "Receipts",
        description: "Inspect posted billing receipts and their printable customer-facing documents.",
        href: ROUTES.admin.billingReceipts,
        icon: <BadgeIndianRupee className="h-4 w-4" />,
      },
    ],
  },
  {
    title: "Adjustments and contract mirrors",
    description: "Handle billing-side adjustments and mirrored contract documents without changing source operations.",
    items: [
      {
        title: "Contracts",
        description: "Review mirrored billing contract state sourced from subscriptions and EMI truth.",
        href: ROUTES.admin.billingContracts,
        icon: <ClipboardList className="h-4 w-4" />,
      },
      {
        title: "Credit Notes",
        description: "Open controlled return and allowance adjustments tied back to original invoices.",
        href: ROUTES.admin.billingCreditNotes,
        icon: <ArrowLeftRight className="h-4 w-4" />,
      },
      {
        title: "Debit Notes",
        description: "Open controlled upward invoice adjustments with explicit posting flow.",
        href: ROUTES.admin.billingDebitNotes,
        icon: <FileStack className="h-4 w-4" />,
      },
    ],
  },
  {
    title: "Retail execution and registers",
    description: "Jump to the retail billing entry points and posted billing books when needed.",
    items: [
      {
        title: "Direct Sales",
        description: "Run direct retail sales through the separate operational source record.",
        href: ROUTES.admin.billingDirectSaleWorkspace,
        icon: <ScrollText className="h-4 w-4" />,
      },
      {
        title: "Billing Daily Book",
        description: "Inspect the posted daily billing register by invoice date and journal reference.",
        href: ROUTES.admin.billingDailyBook,
        icon: <FileBarChart2 className="h-4 w-4" />,
      },
      {
        title: "Billing Cash Book",
        description: "Review cash-facing billing book rows sourced from posted billing receipts.",
        href: ROUTES.admin.billingCashBook,
        icon: <BanknoteArrowDown className="h-4 w-4" />,
      },
    ],
  },
];

export const INVENTORY_CONTROL_DIRECTORY_GROUPS: WorkspaceDirectoryGroup[] = [
  {
    title: "Stock masters",
    description: "Keep stock item and location control explicit and separate from product and contract truth.",
    items: [
      {
        title: "Inventory Items",
        description: "Govern stock-tracked product profiles and bridge posture.",
        href: ROUTES.admin.inventoryItems,
        icon: <Boxes className="h-4 w-4" />,
      },
      {
        title: "Locations",
        description: "Maintain showroom, store, and warehouse stock locations.",
        href: ROUTES.admin.inventoryLocations,
        icon: <Building2 className="h-4 w-4" />,
      },
      {
        title: "Stock on Hand",
        description: "Inspect live on-hand quantity by tracked product and location.",
        href: ROUTES.admin.inventoryStockOnHand,
        icon: <PackageSearch className="h-4 w-4" />,
      },
    ],
  },
  {
    title: "Movement control",
    description: "Audit stock movement, ledger, and counted stock corrections from one inventory workspace family.",
    items: [
      {
        title: "Movements",
        description: "Inspect the movement register fed by posted operational documents.",
        href: ROUTES.admin.inventoryMovements,
        icon: <ArrowLeftRight className="h-4 w-4" />,
      },
      {
        title: "Ledger",
        description: "Review full stock ledger rows and linked billing references.",
        href: ROUTES.admin.inventoryLedger,
        icon: <ScrollText className="h-4 w-4" />,
      },
      {
        title: "Adjustments",
        description: "Create, approve, and post counted stock corrections with explicit reasons.",
        href: ROUTES.admin.inventoryAdjustments,
        icon: <ClipboardList className="h-4 w-4" />,
      },
    ],
  },
  {
    title: "Valuation and opening",
    description: "Review inventory value and bring opening stock in through additive ledger imports.",
    items: [
      {
        title: "Valuation",
        description: "Inspect live stock value derived from tracked inventory and purchase cost foundations.",
        href: ROUTES.admin.inventoryValuation,
        icon: <BadgeIndianRupee className="h-4 w-4" />,
      },
      {
        title: "Opening Stock",
        description: "Preview and post opening stock imports as duplicate-safe ledger movements.",
        href: ROUTES.admin.inventoryOpeningStock,
        icon: <FileStack className="h-4 w-4" />,
      },
    ],
  },
];

export const RECONCILIATION_DIRECTORY_GROUPS: WorkspaceDirectoryGroup[] = [
  {
    title: "Collections review",
    description: "Stay on the collections-side reconciliation route for subscription and payment exception review.",
    items: [
      {
        title: "Admin Reconciliation",
        description: "Review subscription attention and payment queue states from the canonical route.",
        href: ROUTES.admin.reconciliation,
        icon: <ArrowLeftRight className="h-4 w-4" />,
      },
      {
        title: "Collections Workspace",
        description: "Return to the main collections workspace when acting on EMI-side issues.",
        href: ROUTES.admin.collections,
        icon: <ScrollText className="h-4 w-4" />,
      },
      {
        title: "Payments Register",
        description: "Inspect payment records before flagging or following up on exceptions.",
        href: ROUTES.admin.payments,
        icon: <ReceiptText className="h-4 w-4" />,
      },
    ],
  },
  {
    title: "Finance follow-up",
    description: "Cross-check finance-side exceptions without collapsing them into the cashier or accounting posting flow.",
    items: [
      {
        title: "Commission Reconciliation",
        description: "Open finance-side commission exception review for payout readiness.",
        href: ROUTES.admin.financeReconciliation,
        icon: <ShieldCheck className="h-4 w-4" />,
      },
      {
        title: "Commission Register",
        description: "Inspect commission rows supporting flagged payout or partner review.",
        href: ROUTES.admin.financeCommissions,
        icon: <BadgeIndianRupee className="h-4 w-4" />,
      },
      {
        title: "Finance Control",
        description: "Return to the finance control center for books, payouts, and downstream handoff.",
        href: ROUTES.admin.finance,
        icon: <Landmark className="h-4 w-4" />,
      },
    ],
  },
];
