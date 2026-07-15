"use client";

import { useState } from "react";
import FinanceOpeningSection from "./FinanceOpeningSection";
import CustomerMasterQuickEntry from "./CustomerMasterQuickEntry";
import VendorMasterQuickEntry from "./VendorMasterQuickEntry";
import EmployeeQuickEntry from "./EmployeeQuickEntry";
import CustomerOutstandingQuickEntry from "./CustomerOutstandingQuickEntry";
import VendorOutstandingQuickEntry from "./VendorOutstandingQuickEntry";
import OpeningStockQuickEntry from "./OpeningStockQuickEntry";

const SECTIONS = [
  { key: "cash_opening_balance", label: "Finance Accounts (FA)", component: FinanceOpeningSection },
  { key: "customer_master", label: "Customer Master", component: CustomerMasterQuickEntry },
  { key: "vendor_master", label: "Vendor Master", component: VendorMasterQuickEntry },
  { key: "employee_master", label: "Employee Master", component: EmployeeQuickEntry },
  { key: "customer_outstanding", label: "Customer Outstanding", component: CustomerOutstandingQuickEntry },
  { key: "vendor_outstanding", label: "Vendor Outstanding", component: VendorOutstandingQuickEntry },
  { key: "opening_stock", label: "Opening Stock", component: OpeningStockQuickEntry },
];

export default function QuickDataEntryWorkbench({ preselectDataset }: { preselectDataset?: string | null }) {
  // Map shortcut keys to our internal keys where needed
  const defaultKey = preselectDataset === "bank_opening_balance" || preselectDataset === "upi_opening_balance" 
    ? "cash_opening_balance" 
    : (preselectDataset ?? "cash_opening_balance");

  const [activeSection, setActiveSection] = useState(
    SECTIONS.find(s => s.key === defaultKey)?.key ?? "cash_opening_balance"
  );

  const ActiveComponent = SECTIONS.find((s) => s.key === activeSection)?.component ?? FinanceOpeningSection;

  return (
    <div className="flex flex-col md:flex-row gap-6">
      <div className="w-full md:w-64 shrink-0 flex flex-col gap-1">
        {SECTIONS.map((section) => (
          <button
            key={section.key}
            onClick={() => setActiveSection(section.key)}
            className={`text-left px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              activeSection === section.key
                ? "bg-primary text-primary-foreground shadow"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            }`}
          >
            {section.label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-w-0">
        <ActiveComponent />
      </div>
    </div>
  );
}
