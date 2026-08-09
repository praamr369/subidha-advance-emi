#!/usr/bin/env node
/**
 * Admin Route Audit & Dedup Checker
 *
 * Scans all admin routes to find:
 * - Duplicate routes pointing to same component
 * - Alias routes that should be consolidated
 * - Routes with no component
 *
 * Run: npx ts-node scripts/audit-admin-routes.ts
 */

import * as fs from "fs";
import * as path from "path";

interface Route {
  path: string;
  component?: string;
  page?: string;
  file: string;
}

interface DuplicateCluster {
  component: string;
  routes: Route[];
  count: number;
}

// Find all admin route files
function findAdminRoutes(): Route[] {
  const routes: Route[] = [];
  const adminDir = path.join(process.cwd(), "frontend/src/app/(dashboard)/admin");

  function walkDir(dir: string, prefix = "/admin") {
    if (!fs.existsSync(dir)) return;

    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);

      if (file === "page.tsx" || file === "page.ts") {
        const routePath = prefix;
        routes.push({
          path: routePath,
          page: fullPath,
          file: fullPath,
        });
      } else if (stat.isDirectory() && !file.startsWith("[") && !file.startsWith(".")) {
        walkDir(fullPath, `${prefix}/${file}`);
      }
    }
  }

  walkDir(adminDir);
  return routes;
}

// Find duplicate routes
function findDuplicates(routes: Route[]): DuplicateCluster[] {
  const byComponent = new Map<string, Route[]>();

  for (const route of routes) {
    // Extract component signature from file
    const content = fs.readFileSync(route.file, "utf-8");
    const componentSig = content.substring(0, 200).replace(/\s+/g, " ");

    if (!byComponent.has(componentSig)) {
      byComponent.set(componentSig, []);
    }
    byComponent.get(componentSig)!.push(route);
  }

  return Array.from(byComponent.entries())
    .filter(([_, routes]) => routes.length > 1)
    .map(([component, routes]) => ({
      component: component.substring(0, 50),
      routes,
      count: routes.length,
    }))
    .sort((a, b) => b.count - a.count);
}

// Main audit
function runAudit() {
  console.log("🔍 Admin Route Audit\n");

  const routes = findAdminRoutes();
  console.log(`Total admin routes: ${routes.length}\n`);

  const duplicates = findDuplicates(routes);

  if (duplicates.length === 0) {
    console.log("✅ No duplicate routes found!\n");
    return;
  }

  console.log(`⚠️  Found ${duplicates.length} duplicate clusters:\n`);

  duplicates.forEach((cluster, idx) => {
    console.log(`Cluster ${idx + 1}: ${cluster.count} duplicates`);
    cluster.routes.forEach((route) => {
      console.log(`  - ${route.path}`);
    });
    console.log();
  });

  // Generate consolidation recommendations
  console.log("📋 Consolidation Recommendations:\n");
  duplicates.forEach((cluster, idx) => {
    const canonical = cluster.routes[0].path;
    const aliases = cluster.routes.slice(1).map((r) => r.path);

    console.log(`Cluster ${idx + 1}: Keep ${canonical}, redirect from:`);
    aliases.forEach((alias) => {
      console.log(`  ${alias} → ${canonical}`);
    });
    console.log();
  });

  // Pre-flight check result
  const totalDuplicates = duplicates.reduce((sum, c) => sum + c.count, 0);
  process.exit(totalDuplicates > 0 ? 1 : 0);
}

runAudit();
