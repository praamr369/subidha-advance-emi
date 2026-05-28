import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const srcRoot = join(process.cwd(), "src");
const appRoot = join(srcRoot, "app");
const routesFile = join(srcRoot, "lib", "routes.ts");
const routeBuildersFile = join(srcRoot, "lib", "route-builders.ts");
const adminRegistryFile = join(srcRoot, "config", "admin-route-registry.ts");
const navigationFile = join(srcRoot, "config", "navigation.ts");

const compatibilityRoutes = [
  "/admin/partners/commissions",
  "/admin/partners/commisions",
  "/admin/partner/commissions",
  "/admin/partner/commisions",
  "/admin/finance/reconciliation",
  "/admin/finance/commisions",
  "/admin/emi/overdue",
  "/customer/emis",
  "/profile",
  "/settings",
  "/partner/commisions",
];

const requiredRoutes = [
  "/admin/setup/readiness",
  "/admin/contract-amendments",
  "/admin/contract-amendments/[id]",
  "/admin/contract-amendments/recontract-report",
  "/admin/contract-amendments/[id]/recontract-addendum/print",
  "/customer/contract-amendments",
  "/customer/contract-amendments/[id]",
  "/customer/contract-amendments/[id]/recontract-addendum/print",
  "/partner/contract-amendments",
  "/partner/contract-amendments/[id]",
];

const builderRoutes = [
  ["buildAdminContractAmendmentRoute", "/admin/contract-amendments/[id]", true],
  ["buildAdminRecontractReportRoute", "/admin/contract-amendments/recontract-report", true],
  ["buildCustomerContractAmendmentRoute", "/customer/contract-amendments/[id]", true],
  ["buildPartnerContractAmendmentRoute", "/partner/contract-amendments/[id]", true],
  ["buildAdminSubscriptionRoute", "/admin/subscriptions/[id]", true],
  ["buildAdminSubscriptionContractPrintRoute", "/admin/subscriptions/[id]/contract/print", true],
  ["buildAdminProductRecontractAddendumPrintRoute", "/admin/contract-amendments/[id]/recontract-addendum/print", true],
  ["buildCustomerProductRecontractAddendumPrintRoute", "/customer/contract-amendments/[id]/recontract-addendum/print", true],
  ["buildAdminRentLeaseContractPrintRoute", "/admin/rent-lease/contracts/[id]/contract/print", true],
  ["buildAdminPurchaseBillPrintRoute", "/admin/purchases/[id]/bill/print", true],
  ["buildAdminVendorPaymentVoucherPrintRoute", "/admin/vendors/payments/[id]/voucher/print", true],
  ["buildAdminCashierDayClosePrintRoute", "/admin/settlements/day-closes/[id]/print", true],
  ["buildAdminReconciliationReportPrintRoute", "/admin/reconciliation/reports/[id]/print", true],
  ["buildAdminJournalEntryPrintRoute", "/admin/accounting/journals/[id]/print", true],
  ["buildAdminLedgerStatementPrintRoute", "/admin/accounting/ledger/[accountId]/statement/print", true],
  ["buildAdminCustomerAccountStatementPrintRoute", "/admin/customers/[id]/statement/print", true],
  ["buildAdminFinanceAccountStatementPrintRoute", "/admin/finance/accounts/[financeAccountId]/statement/print", false],
  ["buildAdminDirectSaleDeliveryChallanPrintRoute", "/admin/deliveries/direct-sale-cases/[caseId]/print", true],
  ["buildAdminDirectSalePrintRoute", "/admin/billing/direct-sale/[id]/print", true],
  ["buildAdminBillingReceiptPrintRoute", "/admin/billing/receipts/[id]/print", true],
];

const allowedMissingConstants = new Set(["/admin/settings/local-sandbox"]);
const printContaminationMarkers = ["AdminShell", "DashboardShell", "AppSidebar", "SidebarProvider", "PageHeader", "ERPPageShell", "BusinessSetupLinks", "DataTableShell", "QuickActionGrid"];
const rolePrefixes = { PARTNER: "/partner", CUSTOMER: "/customer", CASHIER: "/cashier", VENDOR: "/vendor" };

const routes = new Map();
const patterns = [];

function read(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function normalize(path) {
  const value = String(path || "").trim().split("#")[0].split("?")[0];
  if (!value.startsWith("/")) return "";
  return value.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}

function patternFor(route) {
  const normalized = normalize(route);
  if (normalized === "/") return /^\/$/;
  const body = normalized
    .split("/")
    .filter(Boolean)
    .map((part) => (part.startsWith("[") && part.endsWith("]") ? "[^/]+" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    .join("/");
  return new RegExp(`^/${body}$`);
}

function hasRoute(route) {
  const normalized = normalize(route);
  if (!normalized) return true;
  if (routes.has(normalized)) return true;
  return patterns.some((entry) => entry.regex.test(normalized));
}

function scanApp(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      scanApp(full);
      continue;
    }
    if (entry !== "page.tsx") continue;
    const rel = relative(appRoot, full).replace(/\\/g, "/");
    const route = rel
      .replace(/(^|\/)page\.tsx$/, "")
      .split("/")
      .filter((part) => part && !part.startsWith("(") && !part.endsWith(")"))
      .join("/");
    const normalized = normalize(`/${route}`);
    const files = routes.get(normalized) || [];
    files.push(rel);
    routes.set(normalized, files);
    patterns.push({ route: normalized, regex: patternFor(normalized), file: rel });
  }
}

function routeMapFromRoutesTs(source) {
  const routeMap = new Map();
  let section = "";
  for (const line of source.split("\n")) {
    const sectionMatch = line.match(/^  ([a-zA-Z0-9_]+): \{$/);
    if (sectionMatch) {
      section = sectionMatch[1];
      continue;
    }
    if (section && /^  },?$/.test(line)) {
      section = "";
      continue;
    }
    const valueMatch = section && line.match(/^    ([a-zA-Z0-9_]+):\s*"([^"]+)"/);
    if (valueMatch) routeMap.set(`ROUTES.${section}.${valueMatch[1]}`, valueMatch[2]);
  }
  return routeMap;
}

function resolveExpression(expression, routeMap) {
  const value = String(expression || "").trim().replace(/,$/, "");
  const stringMatch = value.match(/^"([^"]+)"$/) || value.match(/^'([^']+)'$/);
  if (stringMatch) return stringMatch[1];
  if (routeMap.has(value)) return routeMap.get(value);
  const templateMatch = value.match(/^`([\s\S]+)`$/);
  if (!templateMatch) return "";
  return templateMatch[1]
    .replace(/\$\{(ROUTES\.[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+)\}/g, (_, key) => routeMap.get(key) || "")
    .replace(/\$\{[^}]+\}/g, "[id]");
}

function routeConstants(source, routeMap) {
  return [...routeMap.entries()].map(([sourceName, route]) => ({ source: sourceName, route }));
}

function adminRegistryLinks(source, routeMap) {
  const links = [];
  const regex = /item\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*([^,]+)\s*,/gs;
  for (const match of source.matchAll(regex)) {
    const route = resolveExpression(match[3], routeMap);
    if (route) links.push({ role: "ADMIN", group: match[1], label: match[2], route, source: "admin-route-registry.ts" });
  }
  return links;
}

function navigationLinks(source, routeMap) {
  const roles = [
    ["PARTNER", "  PARTNER: [", "\n\n  CUSTOMER:"],
    ["CUSTOMER", "  CUSTOMER: [", "\n\n  CASHIER:"],
    ["CASHIER", "  CASHIER: [", "\n\n  VENDOR:"],
    ["VENDOR", "  VENDOR: [", "\n};"],
  ];
  const links = [];
  for (const [role, startToken, endToken] of roles) {
    const start = source.indexOf(startToken);
    if (start === -1) continue;
    const end = source.indexOf(endToken, start);
    const block = source.slice(start, end === -1 ? undefined : end);
    const regex = /label:\s*"([^"]+)"[\s\S]*?href:\s*([^,\n}]+)/g;
    for (const match of block.matchAll(regex)) {
      const route = resolveExpression(match[2], routeMap);
      if (route) links.push({ role, group: role, label: match[1], route, source: "navigation.ts" });
    }
  }
  return links;
}

function checkMissing(label, rows) {
  let failures = 0;
  for (const row of rows) {
    const route = normalize(row.route);
    if (!route || route.startsWith("/api") || allowedMissingConstants.has(route)) continue;
    if (hasRoute(route)) continue;
    failures += 1;
    console.error(`Missing page route from ${label}: ${row.source} -> ${route}`);
  }
  return failures;
}

function checkDuplicates(rows) {
  let failures = 0;
  const seen = new Map();
  for (const row of rows) {
    const route = normalize(row.route);
    if (!route) continue;
    const key = `${row.role}|${row.group}|${row.label.toLowerCase()}|${route}`;
    if (seen.has(key)) {
      failures += 1;
      console.error(`Duplicate visible nav entry: ${row.role} / ${row.group} / ${row.label} -> ${route}`);
    }
    seen.set(key, row);
  }
  return failures;
}

function checkWrongRole(rows) {
  let failures = 0;
  for (const row of rows) {
    const prefix = rolePrefixes[row.role];
    const route = normalize(row.route);
    if (!prefix || !route) continue;
    if (route === prefix || route.startsWith(`${prefix}/`)) continue;
    failures += 1;
    console.error(`Wrong-role navigation exposure: ${row.role} nav points to ${route} (${row.label})`);
  }
  return failures;
}

function checkBuilders(source) {
  let failures = 0;
  let warnings = 0;
  for (const [name, route, required] of builderRoutes) {
    if (!source.includes(`function ${name}`)) {
      failures += 1;
      console.error(`Missing route builder function: ${name}`);
      continue;
    }
    if (hasRoute(route)) continue;
    if (!required) {
      warnings += 1;
      console.warn(`Route-builder warning: ${name} currently targets missing deferred page ${route}`);
      continue;
    }
    failures += 1;
    console.error(`Route builder targets missing page: ${name} -> ${route}`);
  }
  return { failures, warnings };
}

function checkPrintRoutes() {
  let failures = 0;
  for (const [route, files] of routes.entries()) {
    if (!route.endsWith("/print")) continue;
    for (const file of files) {
      const source = read(join(appRoot, file));
      for (const marker of printContaminationMarkers) {
        if (!source.includes(marker)) continue;
        failures += 1;
        console.error(`Print route layout contamination marker in ${route}: ${marker} (${file})`);
      }
    }
  }
  return failures;
}

if (!existsSync(appRoot)) {
  console.error(`Missing app root: ${appRoot}`);
  process.exit(1);
}

scanApp(appRoot);
let failures = 0;
let warnings = 0;

for (const [route, files] of routes.entries()) {
  if (files.length <= 1) continue;
  failures += 1;
  console.error(`Route collision: ${route}`);
  for (const file of files) console.error(`  - ${file}`);
}

for (const route of compatibilityRoutes) {
  if (!routes.has(route)) {
    failures += 1;
    console.error(`Missing compatibility route: ${route}`);
  }
}

for (const route of requiredRoutes) {
  if (!hasRoute(route)) {
    failures += 1;
    console.error(`Missing required route: ${route}`);
  }
}

const routesSource = read(routesFile);
const routeBuildersSource = read(routeBuildersFile);
const routeMap = routeMapFromRoutesTs(routesSource);
const constants = routeConstants(routesSource, routeMap);
const adminLinks = adminRegistryLinks(read(adminRegistryFile), routeMap);
const roleLinks = navigationLinks(read(navigationFile), routeMap);
const navLinks = [...adminLinks, ...roleLinks];

failures += checkMissing("route constants", constants);
failures += checkMissing("navigation", navLinks);
failures += checkDuplicates(navLinks);
failures += checkWrongRole(roleLinks);

const builderResult = checkBuilders(routeBuildersSource);
failures += builderResult.failures;
warnings += builderResult.warnings;
failures += checkPrintRoutes();

if (failures > 0) {
  console.error(`Route check failed with ${failures} error(s) and ${warnings} warning(s).`);
  process.exit(1);
}

console.log(
  `Route check passed. Checked ${routes.size} page routes, ${constants.length} route constants, ${navLinks.length} nav entries, ${builderRoutes.length} route-builder contracts, and ${compatibilityRoutes.length} compatibility redirects. Warnings: ${warnings}.`
);
