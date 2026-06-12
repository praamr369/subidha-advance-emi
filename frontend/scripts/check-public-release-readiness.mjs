#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(frontendRoot, "..");

const blockers = [];
const warnings = [];
const checks = [];

function rel(filePath) {
  return path.relative(repoRoot, filePath).replaceAll(path.sep, "/");
}

function readText(relativePath) {
  const absolutePath = path.resolve(repoRoot, relativePath);
  if (!existsSync(absolutePath)) {
    blockers.push(`Missing required file: ${relativePath}`);
    return "";
  }
  return readFileSync(absolutePath, "utf8");
}

function pass(message) {
  checks.push(message);
}

function assertFile(relativePath, message) {
  const absolutePath = path.resolve(repoRoot, relativePath);
  if (existsSync(absolutePath)) {
    pass(message ?? `Found ${relativePath}`);
  } else {
    blockers.push(`Missing required file: ${relativePath}`);
  }
}

function assertText(fileLabel, content, pattern, message) {
  if (pattern.test(content)) {
    pass(message);
  } else {
    blockers.push(`${fileLabel}: ${message}`);
  }
}

const requiredMarketingAssets = [
  "hero-3d-showroom.webp",
  "lucky-plan-3d-card.webp",
  "rent-lease-3d-room.webp",
  "product-wall-3d.webp",
  "receipt-contract-3d.webp",
  "winner-draw-3d.webp",
  "asansol-family-furniture.webp",
  "showroom-premium-interior.webp",
];

const requiredPublicDocs = [
  "docs/public-site/phase-p11-winners-fair-draw-transparency.md",
  "docs/public-site/phase-p12-product-detail-enquiry-handoff.md",
  "docs/public-site/phase-p13-mobile-route-smoke-hardening.md",
  "docs/public-site/phase-p14-seo-structured-data-hardening.md",
  "docs/public-site/phase-p15-performance-image-loading.md",
];

const publicRoutes = [
  "/",
  "/products",
  "/apply",
  "/contact",
  "/policies",
  "/winners",
  "/winner-history",
  "/lucky-plan",
  "/lucky-plan/fair-draw",
  "/rent",
  "/lease",
  "/direct-sale",
];

const packageJson = readText("frontend/package.json");
assertText("frontend/package.json", packageJson, /"lint"\s*:/, "lint script is present");
assertText("frontend/package.json", packageJson, /"typecheck"\s*:/, "typecheck script is present");
assertText("frontend/package.json", packageJson, /"build:smoke"\s*:/, "build:smoke script is present");
assertText("frontend/package.json", packageJson, /"test:e2e:release-smoke"\s*:/, "release smoke script is present");

const marketingManifestPath = "frontend/src/lib/public-marketing-assets.ts";
const marketingManifest = readText(marketingManifestPath);
assertText(marketingManifestPath, marketingManifest, /imageExists:\s*true/g, "generated asset manifest has enabled assets");

for (const asset of requiredMarketingAssets) {
  const relativePath = `frontend/public/marketing/generated/${asset}`;
  assertFile(relativePath, `Found generated marketing asset ${asset}`);
  const assetKey = asset.replace(/\.webp$/, "");
  if (!marketingManifest.includes(`/marketing/generated/${asset}`)) {
    blockers.push(`${marketingManifestPath}: missing manifest path for ${assetKey}`);
  }
}

assertFile("frontend/src/lib/public-seo.ts", "Public SEO helper exists");
const publicSeo = readText("frontend/src/lib/public-seo.ts");
assertText("frontend/src/lib/public-seo.ts", publicSeo, /NEXT_PUBLIC_SITE_URL/, "public site URL is centralized");
assertText("frontend/src/lib/public-seo.ts", publicSeo, /openGraph/, "OpenGraph metadata is configured");
assertText("frontend/src/lib/public-seo.ts", publicSeo, /twitter/, "Twitter metadata is configured");
assertText("frontend/src/lib/public-seo.ts", publicSeo, /FurnitureStore/, "FurnitureStore JSON-LD builder is present");
assertText("frontend/src/lib/public-seo.ts", publicSeo, /BreadcrumbList/, "Breadcrumb JSON-LD builder is present");

assertFile("frontend/src/components/public/PublicStructuredData.tsx", "Global structured-data component exists");
const publicLayout = readText("frontend/src/app/(public)/layout.tsx");
assertText("frontend/src/app/(public)/layout.tsx", publicLayout, /<PublicStructuredData\s*\/>/, "public layout emits global structured data");
assertText("frontend/src/app/(public)/layout.tsx", publicLayout, /href="#main-content"/, "skip link targets public main content");

const publicSpec = readText("frontend/tests/e2e/public.spec.ts");
assertText("frontend/tests/e2e/public.spec.ts", publicSpec, /public route smoke set/, "public route smoke test is present");
assertText("frontend/tests/e2e/public.spec.ts", publicSpec, /public mobile navigation opens/, "mobile navigation smoke test is present");
assertText("frontend/tests/e2e/public.spec.ts", publicSpec, /og:image/, "SEO metadata smoke test is present");
assertText("frontend/tests/e2e/public.spec.ts", publicSpec, /data-public-image/, "image performance marker smoke test is present");

for (const route of publicRoutes) {
  if (publicSpec.includes(`"${route}"`)) {
    pass(`Public route covered in smoke list: ${route}`);
  } else {
    blockers.push(`frontend/tests/e2e/public.spec.ts: missing public route smoke entry ${route}`);
  }
}

for (const doc of requiredPublicDocs) {
  assertFile(doc, `Found public phase document ${rel(path.resolve(repoRoot, doc))}`);
}

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "").trim();
if (!siteUrl) {
  warnings.push("NEXT_PUBLIC_SITE_URL is not set. Set it to the production origin before release build.");
} else if (!/^https:\/\//.test(siteUrl)) {
  warnings.push(`NEXT_PUBLIC_SITE_URL should be https in production. Current value: ${siteUrl}`);
} else {
  pass(`NEXT_PUBLIC_SITE_URL is set: ${siteUrl}`);
}

console.log("\nPublic release readiness check");
console.log("================================");
for (const check of checks) {
  console.log(`✓ ${check}`);
}

if (warnings.length > 0) {
  console.log("\nWarnings");
  console.log("--------");
  for (const warning of warnings) {
    console.log(`! ${warning}`);
  }
}

if (blockers.length > 0) {
  console.log("\nBlockers");
  console.log("--------");
  for (const blocker of blockers) {
    console.log(`✗ ${blocker}`);
  }
  console.log("\nResult: public release readiness FAILED.");
  process.exit(1);
}

console.log("\nResult: public release readiness PASSED.");
