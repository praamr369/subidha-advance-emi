const config = {
  site: process.env.UNLIGHTHOUSE_SITE || "http://127.0.0.1:3000",
  scanner: {
    device: "desktop",
    samples: 1,
    exclude: [
      "/api/*",
      "/_next/*",
      "/favicon.ico",
      "/robots.txt",
      "/sitemap.xml",
    ],
  },
  ci: {
    budget: {
      accessibility: 80,
      "best-practices": 80,
    },
  },
};

export default config;

