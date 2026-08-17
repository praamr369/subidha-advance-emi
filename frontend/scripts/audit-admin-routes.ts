/**
 * Admin route dedup audit — exits 0 (pass) when no duplicates found.
 * Reads admin-route-registry.ts and checks for duplicate paths.
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const registryPath = path.resolve(__dirname, "../src/config/admin-route-registry.ts");

if (!fs.existsSync(registryPath)) {
  console.log("✅ No route registry found — skipping audit.");
  process.exit(0);
}

const content = fs.readFileSync(registryPath, "utf-8");

// Extract href values from item(...) calls
const hrefPattern = /item\([^)]*,\s*["']([^"']+)["']/g;
const paths: string[] = [];
let match: RegExpExecArray | null;

while ((match = hrefPattern.exec(content)) !== null) {
  paths.push(match[1]);
}

// Find duplicates
const seen = new Map<string, number>();
for (const p of paths) {
  seen.set(p, (seen.get(p) ?? 0) + 1);
}
const dupes: string[] = [];
for (const [p, count] of seen.entries()) {
  if (count > 1) dupes.push(p);
}

if (dupes.length > 0) {
  console.error("❌ Duplicate admin routes detected:");
  for (const d of dupes) console.error(`  ${d}`);
  process.exit(1);
}

console.log(`✅ No duplicate routes found (${paths.length} routes checked).`);
process.exit(0);
