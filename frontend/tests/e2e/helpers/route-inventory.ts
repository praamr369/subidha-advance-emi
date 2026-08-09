import fs from "node:fs";
import path from "node:path";

import type { SmokeRole } from "./smoke-meta";

// Enumerate the App-Router page routes straight from the filesystem so the
// route-load smoke can never drift from the real app. For each seeded role we
// walk src/app/(dashboard)/<role> for `page.tsx`, drop route-group segments
// `(...)` (they are not part of the URL), and — for this static sweep — skip
// dynamic `[param]` routes (they need a concrete entity id to load).

const E2E_ROOT = path.resolve(__dirname, "..");
const FRONTEND_ROOT = path.resolve(E2E_ROOT, "..", "..");
const APP_DIR = path.resolve(FRONTEND_ROOT, "src", "app");
const DASHBOARD_DIR = path.resolve(APP_DIR, "(dashboard)");

function walkPageFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkPageFiles(full));
    } else if (entry.isFile() && entry.name === "page.tsx") {
      out.push(full);
    }
  }
  return out;
}

function fileToRoute(pageFile: string): string {
  const rel = path.relative(APP_DIR, pageFile).replace(/\\/g, "/");
  const withoutPage = rel.replace(/\/page\.tsx$/, "");
  const segments = withoutPage
    .split("/")
    .filter((seg) => seg.length > 0 && !/^\(.*\)$/.test(seg)); // drop route groups
  return "/" + segments.join("/");
}

function isDynamic(route: string): boolean {
  return route.includes("[");
}

/** Static (non-parameterised) routes for a seeded role, sorted + de-duped. */
export function staticRoutesForRole(role: SmokeRole): string[] {
  const roleDir = path.resolve(DASHBOARD_DIR, role);
  const routes = new Set<string>();
  for (const file of walkPageFiles(roleDir)) {
    const route = fileToRoute(file);
    if (!isDynamic(route)) routes.add(route);
  }
  return [...routes].sort();
}
