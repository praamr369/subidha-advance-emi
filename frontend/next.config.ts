import type { NextConfig } from "next";

function buildRemotePatterns() {
  const candidates = [
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "http://localhost:8100",
    "http://127.0.0.1:8100",
    process.env.NEXT_PUBLIC_API_BASE_URL
      ? process.env.NEXT_PUBLIC_API_BASE_URL.replace(/\/api\/v1\/?$/, "")
      : null,
    process.env.PLAYWRIGHT_API_URL || null,
    process.env.PLAYWRIGHT_BACKEND_ROOT || null,
  ];

  const seen = new Set<string>();
  const patterns: Array<{
    protocol: "http" | "https";
    hostname: string;
    pathname: string;
    port?: string;
  }> = [];

  for (const candidate of candidates) {
    if (!candidate) continue;

    try {
      const url = new URL(candidate);
      const key = `${url.protocol}//${url.hostname}:${url.port}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);

      patterns.push({
        protocol: url.protocol.replace(":", "") as "http" | "https",
        hostname: url.hostname,
        pathname: "/**",
        ...(url.port ? { port: url.port } : {}),
      });
    } catch {
      // Ignore malformed runtime env values and keep the safe defaults.
    }
  }

  return patterns;
}

// ─── Canonical admin route redirects ─────────────────────────────────────────
// Server-level permanent redirects replacing individual page.tsx redirect shims.
// Handled at HTTP layer before React rendering. page.tsx redirect files removed.
const ADMIN_PERMANENT_REDIRECTS: Array<{ source: string; destination: string }> = [
  // Legacy singular / old-name routes
  { source: "/admin/emi/overdue", destination: "/admin/emis/overdue" },
  { source: "/admin/lucky-draw", destination: "/admin/lucky-draws" },
  { source: "/admin/lucky-draw/history", destination: "/admin/lucky-draws" },
  { source: "/admin/staff", destination: "/admin/hr/staff" },
  { source: "/admin/workspace", destination: "/admin/erp" },
  // Reports-center landing → reports hub ([reportKey] sub-route stays)
  { source: "/admin/reports-center", destination: "/admin/reports" },
  // Finance alias routes
  { source: "/admin/finance/outstandings", destination: "/admin/outstandings" },
  { source: "/admin/finance/customer-advances", destination: "/admin/customer-advances" },
  // Commission typo + wrong-group aliases (all → canonical)
  { source: "/admin/finance/commisions", destination: "/admin/finance/commissions" },
  { source: "/admin/partner/commisions", destination: "/admin/finance/commissions" },
  { source: "/admin/partner/commissions", destination: "/admin/finance/commissions" },
  { source: "/admin/partners/commisions", destination: "/admin/finance/commissions" },
  // Lucky Plan alias
  { source: "/admin/lucky-plan/lucky-ids", destination: "/admin/lucky-ids" },
  // Delivery workspace alias → deliveries list
  { source: "/admin/delivery", destination: "/admin/deliveries" },
  { source: "/admin/delivery/workspace", destination: "/admin/deliveries" },
  { source: "/admin/delivery/create", destination: "/admin/deliveries" },
  { source: "/admin/delivery/returns", destination: "/admin/service-desk/returns" },
  // Service workspace alias → service-desk
  { source: "/admin/service", destination: "/admin/service-desk" },
  // Leads alias (top-level → crm/leads)
  { source: "/admin/leads", destination: "/admin/crm/leads" },
  { source: "/admin/leads/:id*", destination: "/admin/crm/leads" },
  // Settings roles alias
  { source: "/admin/settings/roles", destination: "/admin/settings/roles-permissions" },
  // Audit alias
  { source: "/admin/audit/events", destination: "/admin/audit-logs" },
  // Requests canonical flip: top-level legacy → canonical grouped
  { source: "/admin/online-enquiries", destination: "/admin/requests/online-enquiries" },
  { source: "/admin/online-enquiries/:id*", destination: "/admin/requests/online-enquiries" },
  { source: "/admin/support-requests", destination: "/admin/requests/support" },
  { source: "/admin/support-requests/:id*", destination: "/admin/requests/support" },
  { source: "/admin/subscription-requests", destination: "/admin/requests/subscriptions" },
  { source: "/admin/subscription-requests/:id*", destination: "/admin/requests/subscriptions" },
  // Duplicate billing routes
  { source: "/admin/billing/direct-sales", destination: "/admin/billing/direct-sale" },
  { source: "/admin/sales/direct-sale/create", destination: "/admin/billing/direct-sale/create" },
  { source: "/admin/sales/direct-sale", destination: "/admin/billing/direct-sale" },
  { source: "/admin/sales", destination: "/admin/billing/direct-sale" },
  // crm/customers detail alias
  { source: "/admin/crm/customers/:id", destination: "/admin/customers/:id" },
  // Setup alias
  { source: "/admin/setup/readiness", destination: "/admin/settings/business-setup" },
];

const ONE_HOUR = 60 * 60;

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  compress: true,
  poweredByHeader: false,
  experimental: {
    webpackBuildWorker: false,
    optimizePackageImports: ["lucide-react"],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    dangerouslyAllowLocalIP: true,
    qualities: [75, 78, 80],
    remotePatterns: buildRemotePatterns(),
    minimumCacheTTL: ONE_HOUR,
  },
  async headers() {
    return [
      // Public uploaded/media assets
      {
        source: "/brand/:path*",
        headers: [
          { key: "Cache-Control", value: `public, max-age=${ONE_HOUR}, stale-while-revalidate=86400` },
        ],
      },
      // Public pages - short cache so content updates are visible quickly
      {
        source: "/(products|about|contact|faq|how-it-works|lucky-plan|partners|customers|winners|winner-history|apply|blog|policies|terms|privacy|rent|lease|direct-sale|lucky-plan-policy|refund-cancellation|warranty|vision-trust|rulebook|udyam-msme|contracts|grievance|payment-policy|service-policy|rental-lease-policy|delivery-policy|direct-sale-policy|lucky-plan-policy|business-compliance|data-requests)(.*)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=300, stale-while-revalidate=600" },
          { key: "X-Robots-Tag", value: "index, follow" },
        ],
      },
      // Auth/dashboard pages: no public caching, no indexing
      {
        source: "/(login|admin|cashier|customer|partner|vendor|unauthorized)(.*)",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      // Security headers for all pages
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
  async redirects() {
    return ADMIN_PERMANENT_REDIRECTS.map(({ source, destination }) => ({
      source,
      destination,
      permanent: true,
    }));
  },
};

export default nextConfig;
