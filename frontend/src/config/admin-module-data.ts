import { Plus, CheckCircle, AlertCircle, RefreshCw, TrendingUp, FileText, Lock, Eye } from "lucide-react";
import { ROUTES } from "@/lib/routes";

export type ModuleData = {
  kpi?: { label: string; value: string | number; trend?: "up" | "down" | "neutral" };
  workflows?: Array<{ id: string; label: string; icon: React.ComponentType<{ className?: string }>; action: string }>;
  requests?: Array<{ id: string; label: string; count: number; status: "active" | "pending" | "critical" }>;
  quickActions?: Array<{ label: string; href: string }>;
};

export const ADMIN_MODULE_DATA: Record<string, ModuleData> = {
  // Finance & Collections
  finance: {
    kpi: { label: "Today's Collections", value: "₹17,500", trend: "up" },
    workflows: [
      { id: "1", label: "Smart Collect", icon: Plus, action: ROUTES.admin.financeCollect },
      { id: "2", label: "Reconcile", icon: CheckCircle, action: "/admin/finance/reconciliation" },
      { id: "3", label: "Daily Close", icon: AlertCircle, action: ROUTES.admin.financeDailyClose },
    ],
    requests: [
      { id: "1", label: "Approvals", count: 5, status: "critical" },
      { id: "2", label: "Pending", count: 12, status: "active" },
    ],
    quickActions: [
      { label: "New Entry", href: "/admin/finance/journal/new" },
      { label: "Reports", href: "/admin/reports" },
      { label: "Reconcile", href: "/admin/finance/reconciliation" },
    ],
  },

  accounting: {
    kpi: { label: "Book Entries", value: "2,340", trend: "up" },
    workflows: [
      { id: "1", label: "Post Entries", icon: Plus, action: "/admin/accounting/post" },
      { id: "2", label: "Close Period", icon: Lock, action: "/admin/accounting/close" },
      { id: "3", label: "Audit Trail", icon: Eye, action: "/admin/accounting/audit" },
    ],
    requests: [
      { id: "1", label: "Month-End", count: 3, status: "active" },
      { id: "2", label: "Reconciliation", count: 8, status: "pending" },
    ],
    quickActions: [
      { label: "Post", href: "/admin/accounting/post" },
      { label: "Close", href: "/admin/accounting/close" },
    ],
  },

  // Billing & Invoicing
  billing: {
    kpi: { label: "Outstanding", value: "₹12,79,000", trend: "down" },
    workflows: [
      { id: "1", label: "Create Invoice", icon: Plus, action: "/admin/billing/invoice/new" },
      { id: "2", label: "Send Invoice", icon: RefreshCw, action: "/admin/billing/invoice/send" },
      { id: "3", label: "Create Note", icon: FileText, action: "/admin/billing/debit-notes" },
    ],
    requests: [
      { id: "1", label: "Unpaid", count: 15, status: "active" },
      { id: "2", label: "Overdue", count: 3, status: "critical" },
    ],
    quickActions: [
      { label: "Invoice", href: "/admin/billing/invoices" },
      { label: "Notes", href: "/admin/billing/debit-notes" },
    ],
  },

  contracts: {
    kpi: { label: "Active Contracts", value: "245", trend: "up" },
    workflows: [
      { id: "1", label: "New Contract", icon: Plus, action: "/admin/billing/contracts/new" },
      { id: "2", label: "Review", icon: Eye, action: "/admin/billing/contracts/review" },
      { id: "3", label: "Approve", icon: CheckCircle, action: "/admin/billing/contracts/approve" },
    ],
    requests: [
      { id: "1", label: "Review", count: 8, status: "active" },
      { id: "2", label: "Approval", count: 5, status: "pending" },
    ],
    quickActions: [
      { label: "Browse", href: "/admin/billing/contracts" },
      { label: "New", href: "/admin/billing/contracts/new" },
    ],
  },

  invoices: {
    kpi: { label: "This Month", value: "328", trend: "up" },
    workflows: [
      { id: "1", label: "Create", icon: Plus, action: "/admin/billing/invoices/new" },
      { id: "2", label: "Send Bulk", icon: RefreshCw, action: "/admin/billing/invoices/bulk-send" },
      { id: "3", label: "Aging Report", icon: FileText, action: "/admin/billing/invoices/aging" },
    ],
    requests: [
      { id: "1", label: "Pending", count: 45, status: "active" },
    ],
    quickActions: [
      { label: "New", href: "/admin/billing/invoices/new" },
      { label: "Send", href: "/admin/billing/invoices/bulk-send" },
    ],
  },

  // Sales & CRM
  sales: {
    kpi: { label: "This Month", value: "₹5,40,000", trend: "up" },
    workflows: [
      { id: "1", label: "New Order", icon: Plus, action: "/admin/sales/order/new" },
      { id: "2", label: "Process", icon: RefreshCw, action: "/admin/sales/order/process" },
      { id: "3", label: "Fulfill", icon: CheckCircle, action: "/admin/sales/fulfillment" },
    ],
    requests: [
      { id: "1", label: "New", count: 12, status: "active" },
      { id: "2", label: "Processing", count: 8, status: "active" },
    ],
    quickActions: [
      { label: "Order", href: "/admin/sales/order/new" },
      { label: "Fulfill", href: "/admin/sales/fulfillment" },
    ],
  },

  crm: {
    kpi: { label: "Active Customers", value: "2,340", trend: "up" },
    workflows: [
      { id: "1", label: "Add Customer", icon: Plus, action: "/admin/crm/customer/new" },
      { id: "2", label: "360 View", icon: Eye, action: "/admin/crm/customer/360" },
      { id: "3", label: "Follow-up", icon: RefreshCw, action: "/admin/crm/follow-up" },
    ],
    requests: [
      { id: "1", label: "KYC Pending", count: 23, status: "critical" },
      { id: "2", label: "Follow-ups", count: 45, status: "active" },
    ],
    quickActions: [
      { label: "Customer", href: "/admin/crm/customer/new" },
      { label: "Follow-up", href: "/admin/crm/follow-up" },
    ],
  },

  leads: {
    kpi: { label: "Open Leads", value: "156", trend: "down" },
    workflows: [
      { id: "1", label: "New Lead", icon: Plus, action: "/admin/crm/lead/new" },
      { id: "2", label: "Convert", icon: TrendingUp, action: "/admin/crm/lead/convert" },
      { id: "3", label: "Pipeline", icon: Eye, action: "/admin/crm/pipeline" },
    ],
    requests: [
      { id: "1", label: "Assigned", count: 34, status: "active" },
      { id: "2", label: "Overdue", count: 12, status: "critical" },
    ],
    quickActions: [
      { label: "New", href: "/admin/crm/lead/new" },
      { label: "Pipeline", href: "/admin/crm/pipeline" },
    ],
  },

  // Inventory & Supply
  inventory: {
    kpi: { label: "Stock Items", value: "1,234", trend: "up" },
    workflows: [
      { id: "1", label: "Receive Stock", icon: Plus, action: "/admin/inventory/receive" },
      { id: "2", label: "Adjust", icon: RefreshCw, action: "/admin/inventory/adjust" },
      { id: "3", label: "Transfer", icon: RefreshCw, action: "/admin/inventory/transfer" },
    ],
    requests: [
      { id: "1", label: "Low Stock", count: 34, status: "critical" },
      { id: "2", label: "Adjustments", count: 12, status: "active" },
    ],
    quickActions: [
      { label: "Receive", href: "/admin/inventory/receive" },
      { label: "Adjust", href: "/admin/inventory/adjust" },
    ],
  },

  warehouse: {
    kpi: { label: "Space Used", value: "68%", trend: "down" },
    workflows: [
      { id: "1", label: "Bin Assignment", icon: Plus, action: "/admin/inventory/bins" },
      { id: "2", label: "Movement", icon: RefreshCw, action: "/admin/inventory/movement" },
      { id: "3", label: "Cycle Count", icon: CheckCircle, action: "/admin/inventory/cycle-count" },
    ],
    requests: [
      { id: "1", label: "Pending", count: 8, status: "active" },
    ],
    quickActions: [
      { label: "Bins", href: "/admin/inventory/bins" },
      { label: "Movement", href: "/admin/inventory/movement" },
    ],
  },

  // Operations & Delivery
  delivery: {
    kpi: { label: "In Transit", value: "45", trend: "up" },
    workflows: [
      { id: "1", label: "Create Delivery", icon: Plus, action: "/admin/delivery/new" },
      { id: "2", label: "Track", icon: Eye, action: "/admin/delivery/track" },
      { id: "3", label: "Handover", icon: CheckCircle, action: "/admin/delivery/handover" },
    ],
    requests: [
      { id: "1", label: "Pending", count: 23, status: "active" },
      { id: "2", label: "Failed", count: 3, status: "critical" },
    ],
    quickActions: [
      { label: "New", href: "/admin/delivery/new" },
      { label: "Track", href: "/admin/delivery/track" },
    ],
  },

  operations: {
    kpi: { label: "Open Tasks", value: "78", trend: "down" },
    workflows: [
      { id: "1", label: "Daily Close", icon: CheckCircle, action: "/admin/finance/daily-close" },
      { id: "2", label: "Assignments", icon: Plus, action: "/admin/operations/assign" },
      { id: "3", label: "Reports", icon: FileText, action: "/admin/operations/reports" },
    ],
    requests: [
      { id: "1", label: "Today", count: 34, status: "critical" },
      { id: "2", label: "Overdue", count: 8, status: "active" },
    ],
    quickActions: [
      { label: "Today", href: ROUTES.admin.today },
      { label: "Command Center", href: "/admin/operations/command-center" },
    ],
  },

  // Control & Governance
  control: {
    kpi: { label: "Open Approvals", value: "12", trend: "down" },
    workflows: [
      { id: "1", label: "Approve", icon: CheckCircle, action: "/admin/control/approvals" },
      { id: "2", label: "Review Policy", icon: Eye, action: "/admin/control/policies" },
      { id: "3", label: "Exception", icon: AlertCircle, action: "/admin/control/exceptions" },
    ],
    requests: [
      { id: "1", label: "Pending", count: 12, status: "active" },
      { id: "2", label: "Escalated", count: 2, status: "critical" },
    ],
    quickActions: [
      { label: "Approve", href: "/admin/control/approvals" },
      { label: "Policies", href: "/admin/control/policies" },
    ],
  },

  "data-quality": {
    kpi: { label: "Issues Found", value: "8", trend: "down" },
    workflows: [
      { id: "1", label: "Run Check", icon: RefreshCw, action: "/admin/control/data-quality/run" },
      { id: "2", label: "View Report", icon: FileText, action: "/admin/control/data-quality/report" },
      { id: "3", label: "Fix Issues", icon: CheckCircle, action: "/admin/control/data-quality/fix" },
    ],
    requests: [
      { id: "1", label: "Integrity", count: 5, status: "active" },
      { id: "2", label: "Reconciliation", count: 3, status: "pending" },
    ],
    quickActions: [
      { label: "Run", href: "/admin/control/data-quality/run" },
      { label: "Report", href: "/admin/control/data-quality/report" },
    ],
  },

  // Analytics & Setup
  reports: {
    kpi: { label: "Published", value: "24", trend: "up" },
    workflows: [
      { id: "1", label: "Create Report", icon: Plus, action: "/admin/reports/new" },
      { id: "2", label: "Schedule", icon: RefreshCw, action: "/admin/reports/schedule" },
      { id: "3", label: "Export", icon: FileText, action: "/admin/reports/export" },
    ],
    requests: [
      { id: "1", label: "Requested", count: 5, status: "active" },
    ],
    quickActions: [
      { label: "New", href: "/admin/reports/new" },
      { label: "Browse", href: "/admin/reports" },
    ],
  },

  "business-setup": {
    kpi: { label: "Readiness", value: "92%", trend: "up" },
    workflows: [
      { id: "1", label: "Checklist", icon: Eye, action: "/admin/settings/business-setup/checklist" },
      { id: "2", label: "Configure", icon: Plus, action: "/admin/settings/business-setup/configure" },
      { id: "3", label: "Go-Live", icon: CheckCircle, action: "/admin/settings/business-setup/go-live" },
    ],
    requests: [],
    quickActions: [
      { label: "Checklist", href: "/admin/settings/business-setup/checklist" },
      { label: "Configure", href: "/admin/settings/business-setup/configure" },
    ],
  },

  // Lucky Plan
  "lucky-plan": {
    kpi: { label: "Active Draws", value: "12", trend: "up" },
    workflows: [
      { id: "1", label: "Manage IDs", icon: Plus, action: "/admin/lucky-plan/lucky-ids" },
      { id: "2", label: "Create Draw", icon: Plus, action: "/admin/lucky-plan/draws" },
      { id: "3", label: "View Winners", icon: Eye, action: "/admin/lucky-plan/winners" },
    ],
    requests: [
      { id: "1", label: "Unrevealed", count: 3, status: "active" },
      { id: "2", label: "Pending Audit", count: 2, status: "pending" },
    ],
    quickActions: [
      { label: "Lucky IDs", href: "/admin/lucky-plan/lucky-ids" },
      { label: "Draws", href: "/admin/lucky-plan/draws" },
      { label: "Winners", href: "/admin/lucky-plan/winners" },
      { label: "Analytics", href: "/admin/lucky-plan/analytics" },
    ],
  },

  // Admin Tools
  "global-search": {
    kpi: { label: "Indexed Items", value: "45K+", trend: "up" },
    workflows: [
      { id: "1", label: "Advanced Search", icon: Eye, action: "/admin/global-search" },
      { id: "2", label: "Rebuild Index", icon: RefreshCw, action: "/admin/global-search/rebuild" },
    ],
    requests: [],
    quickActions: [
      { label: "Search", href: "/admin/global-search" },
    ],
  },

  notifications: {
    kpi: { label: "Unread", value: "23", trend: "up" },
    workflows: [
      { id: "1", label: "View All", icon: Eye, action: "/admin/notifications" },
      { id: "2", label: "Configure", icon: Plus, action: "/admin/notifications/settings" },
    ],
    requests: [],
    quickActions: [
      { label: "View", href: "/admin/notifications" },
      { label: "Settings", href: "/admin/notifications/settings" },
    ],
  },
};
