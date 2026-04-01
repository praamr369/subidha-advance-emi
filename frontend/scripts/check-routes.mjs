import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const appRoot = join(process.cwd(), "src", "app");
const routes = new Map();
const expectedCompatibilityRoutes = [
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

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full);
      continue;
    }
    if (entry !== "page.tsx") continue;

    const rel = relative(appRoot, full).replace(/\\/g, "/");
    const route = rel
      .replace(/\/page\.tsx$/, "")
      .split("/")
      .filter((part) => part && !part.startsWith("(") && !part.endsWith(")"))
      .join("/");

    const normalized = `/${route}`.replace(/\/+/g, "/");
    const list = routes.get(normalized) || [];
    list.push(rel);
    routes.set(normalized, list);
  }
}

walk(appRoot);

let collisions = 0;
for (const [route, files] of routes.entries()) {
  if (files.length > 1) {
    collisions += 1;
    console.error(`Route collision: ${route}`);
    for (const file of files) console.error(`  - ${file}`);
  }
}

let missingCompatibilityRoutes = 0;
for (const route of expectedCompatibilityRoutes) {
  if (!routes.has(route)) {
    missingCompatibilityRoutes += 1;
    console.error(`Missing compatibility route: ${route}`);
  }
}

if (collisions > 0 || missingCompatibilityRoutes > 0) process.exit(1);
console.log(
  `No route collisions found. Checked ${routes.size} routes and ${expectedCompatibilityRoutes.length} compatibility redirects.`
);
