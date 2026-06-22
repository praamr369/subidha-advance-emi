import {
  LayoutDashboard,
  Users,
  Package,
  Clover,
  Repeat,
  CreditCard,
  Receipt,
  Warehouse,
  Truck,
  KeyRound,
  BookOpen,
  Scale,
  BarChart3,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type SidebarModule = {
  label: string;
  path: string;
  icon: LucideIcon;
};

export const sidebarModules: SidebarModule[] = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard },
  { label: "Customers", path: "/customers", icon: Users },
  { label: "Products", path: "/products", icon: Package },
  { label: "Lucky Plan", path: "/lucky-plan", icon: Clover },
  { label: "Subscriptions", path: "/subscriptions", icon: Repeat },
  { label: "Payments", path: "/payments", icon: CreditCard },
  { label: "Billing", path: "/billing", icon: Receipt },
  { label: "Inventory", path: "/inventory", icon: Warehouse },
  { label: "Delivery", path: "/delivery", icon: Truck },
  { label: "Rent / Lease", path: "/rent-lease", icon: KeyRound },
  { label: "Accounting", path: "/accounting", icon: BookOpen },
  { label: "Reconciliation", path: "/reconciliation", icon: Scale },
  { label: "Reports", path: "/reports", icon: BarChart3 },
  { label: "Settings", path: "/settings", icon: Settings },
];
