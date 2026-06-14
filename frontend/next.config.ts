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

const nextConfig: NextConfig = {
  experimental: {
    webpackBuildWorker: false,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    dangerouslyAllowLocalIP: true,
    qualities: [75, 78, 80],
    remotePatterns: buildRemotePatterns(),
  },
};

export default nextConfig;
