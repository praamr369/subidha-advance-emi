import {
  createRouter,
  createRootRoute,
  createRoute,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { AdminShell } from "@/shell/AdminShell";
import { LoginPage } from "@/shared/auth/LoginPage";
import { tokenStore } from "@/shared/auth/token-store";

import { DashboardPage } from "@/modules/dashboard/pages/DashboardPage";
import { CustomersPage } from "@/modules/customers/pages/CustomersPage";
import { ProductsPage } from "@/modules/products/pages/ProductsPage";
import { LuckyPlanPage } from "@/modules/lucky-plan/pages/LuckyPlanPage";
import { SubscriptionsPage } from "@/modules/subscriptions/pages/SubscriptionsPage";
import { PaymentsPage } from "@/modules/payments/pages/PaymentsPage";
import { BillingPage } from "@/modules/billing/pages/BillingPage";
import { InventoryPage } from "@/modules/inventory/pages/InventoryPage";
import { DeliveryPage } from "@/modules/delivery/pages/DeliveryPage";
import { RentLeasePage } from "@/modules/rent-lease/pages/RentLeasePage";
import { AccountingPage } from "@/modules/accounting/pages/AccountingPage";
import { ReconciliationPage } from "@/modules/reconciliation/pages/ReconciliationPage";
import { ReportsPage } from "@/modules/reports/pages/ReportsPage";
import { SettingsPage } from "@/modules/settings/pages/SettingsPage";
import { UiPreviewPage } from "@/modules/dashboard/pages/UiPreviewPage";

const rootRoute = createRootRoute({
  component: Outlet,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
  beforeLoad: () => {
    if (tokenStore.getAccessToken()) {
      throw redirect({ to: "/" });
    }
  },
});

const shellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "shell",
  component: AdminShell,
  beforeLoad: () => {
    if (!tokenStore.getAccessToken()) {
      throw redirect({ to: "/login" });
    }
  },
});

function moduleRoute(path: string, component: () => React.JSX.Element) {
  return createRoute({
    getParentRoute: () => shellRoute,
    path,
    component,
  });
}

const indexRoute = moduleRoute("/", DashboardPage);
const customersRoute = moduleRoute("/customers", CustomersPage);
const productsRoute = moduleRoute("/products", ProductsPage);
const luckyPlanRoute = moduleRoute("/lucky-plan", LuckyPlanPage);
const subscriptionsRoute = moduleRoute("/subscriptions", SubscriptionsPage);
const paymentsRoute = moduleRoute("/payments", PaymentsPage);
const billingRoute = moduleRoute("/billing", BillingPage);
const inventoryRoute = moduleRoute("/inventory", InventoryPage);
const deliveryRoute = moduleRoute("/delivery", DeliveryPage);
const rentLeaseRoute = moduleRoute("/rent-lease", RentLeasePage);
const accountingRoute = moduleRoute("/accounting", AccountingPage);
const reconciliationRoute = moduleRoute("/reconciliation", ReconciliationPage);
const reportsRoute = moduleRoute("/reports", ReportsPage);
const settingsRoute = moduleRoute("/settings", SettingsPage);
const uiPreviewRoute = moduleRoute("/ui-preview", UiPreviewPage);

const routeTree = rootRoute.addChildren([
  loginRoute,
  shellRoute.addChildren([
    indexRoute,
    customersRoute,
    productsRoute,
    luckyPlanRoute,
    subscriptionsRoute,
    paymentsRoute,
    billingRoute,
    inventoryRoute,
    deliveryRoute,
    rentLeaseRoute,
    accountingRoute,
    reconciliationRoute,
    reportsRoute,
    settingsRoute,
    uiPreviewRoute,
  ]),
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
