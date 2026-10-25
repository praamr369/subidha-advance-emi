"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  getReviewPlatformConfig,
  updateReviewPlatformConfig,
  refreshReviewCache,
  type PlatformConfigFieldName,
  type ReviewPlatformConfig,
} from "@/services/reviews";
import { ROUTES } from "@/lib/routes";

interface FieldDef {
  name: PlatformConfigFieldName;
  label: string;
  secret: boolean;
  hint: string;
}

interface PlatformDef {
  key: string;
  title: string;
  accent: string;
  description: string;
  howTo: string[];
  fields: FieldDef[];
}

const PLATFORMS: PlatformDef[] = [
  {
    key: "google",
    title: "Google Business Profile",
    accent: "border-l-4 border-l-sky-500",
    description:
      "Pulls star rating and latest reviews from your Google Business Profile, and powers the public “Write a Google review” button.",
    howTo: [
      "Open console.cloud.google.com and create/select a project.",
      "Enable the “Places API”, then create an API key under Credentials.",
      "Find your Place ID with Google's Place ID Finder (search your business name).",
    ],
    fields: [
      {
        name: "google_places_api_key",
        label: "Places API key",
        secret: true,
        hint: "Starts with AIza… · from Google Cloud Console → Credentials",
      },
      {
        name: "google_place_id",
        label: "Place ID",
        secret: false,
        hint: "Starts with ChIJ… · identifies your business listing",
      },
    ],
  },
  {
    key: "facebook",
    title: "Facebook Page",
    accent: "border-l-4 border-l-[#1877F2]",
    description:
      "Pulls recommendations/reviews from your Facebook Page and powers the public “Recommend us on Facebook” button.",
    howTo: [
      "Find your numeric Page ID on your page's “About” tab.",
      "Open developers.facebook.com, create an app, add the Pages product.",
      "Generate a Page Access Token with the pages_read_engagement permission.",
    ],
    fields: [
      {
        name: "facebook_page_id",
        label: "Page ID",
        secret: false,
        hint: "Numeric ID from the page About tab",
      },
      {
        name: "facebook_page_access_token",
        label: "Page access token",
        secret: true,
        hint: "Starts with EAA… · needs pages_read_engagement",
      },
    ],
  },
  {
    key: "youtube",
    title: "YouTube Channel",
    accent: "border-l-4 border-l-[#FF0000]",
    description:
      "Pulls top comments from your channel's most-viewed videos as social-proof testimonials, and links to your channel.",
    howTo: [
      "In the same Google Cloud project, enable “YouTube Data API v3”.",
      "Reuse the API key or create a separate one.",
      "Copy your channel ID (starts with UC…) from youtube.com/channel/UC…",
    ],
    fields: [
      {
        name: "youtube_api_key",
        label: "YouTube API key",
        secret: true,
        hint: "Can be the same Google Cloud key if the API is enabled",
      },
      {
        name: "youtube_channel_id",
        label: "Channel ID",
        secret: false,
        hint: "Starts with UC…",
      },
    ],
  },
  {
    key: "whatsapp",
    title: "WhatsApp Business Cloud API (Meta)",
    accent: "border-l-4 border-l-[#25D366]",
    description:
      "Connect Meta's official WhatsApp Business Cloud API to send automated receipts, draw results, EMI reminders, and customer notifications. (Includes 1,000 free service conversations per month for ₹0).",
    howTo: [
      "Open developers.facebook.com and create an app with the 'WhatsApp' use case.",
      "Go to WhatsApp → API Setup to find your Phone number ID and WhatsApp Business Account ID.",
      "In Meta Business Suite → Settings → System Users, generate a permanent access token with whatsapp_business_messaging permission.",
    ],
    fields: [
      {
        name: "whatsapp_phone_number_id",
        label: "Phone number ID",
        secret: false,
        hint: "Numeric ID from Meta Developers → WhatsApp → API Setup",
      },
      {
        name: "whatsapp_business_account_id",
        label: "WhatsApp Business Account (WABA) ID",
        secret: false,
        hint: "Numeric WABA ID from Meta Business Manager",
      },
      {
        name: "whatsapp_access_token",
        label: "System user access token",
        secret: true,
        hint: "Starts with EAA… · permanent system user token",
      },
    ],
  },
  {
    key: "google_analytics",
    title: "Google Analytics 4 & Search Console",
    accent: "border-l-4 border-l-[#F9AB00]",
    description:
      "Track storefront visitor traffic, popular furniture views, and verify your website on Google Search Console for ₹0.",
    howTo: [
      "Visit analytics.google.com and create a free GA4 property for your website.",
      "Copy your Measurement ID (starts with G-XXXXXXXXXX) from Data Streams.",
      "For Search Console (search.google.com/search-console), copy the HTML tag verification token.",
    ],
    fields: [
      {
        name: "google_analytics_id",
        label: "GA4 Measurement ID",
        secret: false,
        hint: "Starts with G-… · tracks visitors and page views for free",
      },
      {
        name: "google_site_verification",
        label: "Search Console verification code",
        secret: false,
        hint: "HTML tag content code from Google Search Console",
      },
    ],
  },
  {
    key: "meta_catalog",
    title: "Meta Commerce & WhatsApp Catalog Setup",
    accent: "border-l-4 border-l-[#0081FB]",
    description:
      "Configure your Meta Commerce Manager Catalog ID to link and view your Facebook Shop, Instagram Shop, and WhatsApp Business catalog.",
    howTo: [
      "Go to business.facebook.com/commerce and create/open your E-commerce catalogue.",
      "Copy the numeric Catalogue ID shown at the top of Commerce Manager.",
      "In Commerce Manager → Data Sources, add a scheduled data feed using your webapp's free feed URL below.",
    ],
    fields: [
      {
        name: "meta_catalog_id",
        label: "Meta Catalogue ID",
        secret: false,
        hint: "Numeric ID from Meta Commerce Manager (e.g., 123456789012345)",
      },
    ],
  },
];

const SOURCE_BADGE: Record<string, { label: string; cls: string }> = {
  db: { label: "Saved here", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  env: { label: "From server .env", cls: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300" },
  none: { label: "Not configured", cls: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" },
};

export default function BrandDataCenterPage() {
  const [config, setConfig] = useState<ReviewPlatformConfig | null>(null);
  const [form, setForm] = useState<Partial<Record<PlatformConfigFieldName, string>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [copiedFeed, setCopiedFeed] = useState(false);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getReviewPlatformConfig();
      setConfig(data);
      const initial: Partial<Record<PlatformConfigFieldName, string>> = {};
      for (const [name, field] of Object.entries(data.fields)) {
        initial[name as PlatformConfigFieldName] = field.value;
      }
      setForm(initial);
    } catch {
      showToast("Failed to load platform configuration.", false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave() {
    setSaving(true);
    try {
      const result = await updateReviewPlatformConfig(form);
      showToast(result.message);
      await load();
    } catch (err) {
      showToast((err as Error)?.message ?? "Save failed.", false);
    } finally {
      setSaving(false);
    }
  }

  function getCatalogFeedUrl(): string {
    const path = config?.links.whatsapp_catalog_feed_path ?? "/api/v1/public/catalog/whatsapp-feed.csv";
    if (typeof window !== "undefined") {
      return `${window.location.origin}${path}`;
    }
    return `https://subidhafurnitureasansol.com${path}`;
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await refreshReviewCache();
      setTestResult(
        [
          `Google Business: ${r.google.error ? `✗ ${r.google.error}` : `✓ ${r.google.fetched} review(s)`}`,
          `Facebook Page: ${r.facebook.error ? `✗ ${r.facebook.error}` : `✓ ${r.facebook.fetched} review(s)`}`,
          `YouTube Channel: ${r.youtube.error ? `✗ ${r.youtube.error}` : `✓ ${r.youtube.fetched} comment(s)`}`,
          `WhatsApp Business API: ${r.whatsapp ? (r.whatsapp.error ? `✗ ${r.whatsapp.error}` : `✓ ${r.whatsapp.status}`) : "Not configured"}`,
        ].join("\n")
      );
    } catch {
      showToast("Connection test failed.", false);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6 max-w-4xl mx-auto">
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white ${toast.ok ? "bg-green-600" : "bg-red-600"}`}
        >
          {toast.msg}
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Brand & Social Integrations Data Center</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Connect your WhatsApp Business API, Meta Facebook Shop & WhatsApp Catalog, Google Business Profile, Google Analytics 4, and YouTube channel for ₹0. Values saved here override server .env settings.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Link
            href="/admin/settings/compliance-policies?tab=announcements"
            className="text-sm font-medium text-amber-600 dark:text-amber-400 hover:underline"
          >
            📢 Public Banners & Offers (CMS) →
          </Link>
          <Link
            href={ROUTES.admin.reviews ?? "/admin/reviews"}
            className="text-sm font-medium text-blue-600 hover:underline"
          >
            Open Reviews Manager →
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading configuration…</div>
      ) : (
        <>
          <div className="space-y-5">
            {PLATFORMS.map((platform) => (
              <section
                key={platform.key}
                className={`bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 ${platform.accent}`}
              >
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                  {platform.title}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-4">
                  {platform.description}
                </p>

                <div className="grid gap-4 sm:grid-cols-2">
                  {platform.fields.map((field) => {
                    const meta = config?.fields[field.name];
                    const badge = SOURCE_BADGE[meta?.source ?? "none"];
                    return (
                      <div key={field.name}>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
                            {field.label}
                          </label>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </div>
                        <input
                          type="text"
                          value={form[field.name] ?? ""}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, [field.name]: e.target.value }))
                          }
                          placeholder={field.secret ? "Paste new key to replace" : ""}
                          autoComplete="off"
                          spellCheck={false}
                          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm font-mono bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        />
                        <p className="text-[11px] text-gray-400 mt-1">{field.hint}</p>
                      </div>
                    );
                  })}
                </div>

                <details className="mt-4">
                  <summary className="text-xs font-medium text-blue-600 cursor-pointer select-none">
                    How to get these credentials
                  </summary>
                  <ol className="mt-2 space-y-1 text-xs text-gray-500 dark:text-gray-400 list-decimal list-inside">
                    {platform.howTo.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </details>
              </section>
            ))}

            {/* Live Scheduled Feed Card for Meta Commerce & WhatsApp Catalog */}
            <section className="bg-gradient-to-br from-blue-50 to-indigo-50/60 dark:from-blue-950/30 dark:to-indigo-950/20 border-2 border-blue-300 dark:border-blue-800 rounded-2xl p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🛍️</span>
                  <div>
                    <h2 className="text-base font-bold text-blue-950 dark:text-blue-100">
                      Live Meta & WhatsApp Catalog Scheduled Data Feed
                    </h2>
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      Zero-cost automatic synchronization for Facebook Marketplace/Shop & WhatsApp Business Catalog.
                    </p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  {config?.links.catalog_eligible_products_count ?? 0} Products in Live Feed
                </span>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1 block">
                    Your Scheduled Feed URL (Paste this into Meta Commerce Manager)
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="flex-1 break-all bg-white dark:bg-gray-900 border border-blue-200 dark:border-blue-700 rounded-lg px-3 py-2 text-xs font-mono text-blue-900 dark:text-blue-200 shadow-inner select-all">
                      {getCatalogFeedUrl()}
                    </code>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(getCatalogFeedUrl()).then(() => {
                          setCopiedFeed(true);
                          setTimeout(() => setCopiedFeed(false), 2000);
                        });
                      }}
                      className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-4 py-2 rounded-lg transition"
                    >
                      {copiedFeed ? "✓ Copied Feed URL" : "📋 Copy Feed URL"}
                    </button>
                    {config?.links.meta_commerce_manager_url ? (
                      <a
                        href={config.links.meta_commerce_manager_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 text-gray-700 dark:text-gray-200 text-xs font-medium px-3 py-2 rounded-lg transition"
                      >
                        Open Commerce Manager ↗
                      </a>
                    ) : null}
                  </div>
                </div>

                <div className="bg-white/80 dark:bg-gray-900/60 rounded-xl p-3.5 border border-blue-100 dark:border-blue-900 text-xs text-gray-600 dark:text-gray-400 space-y-2">
                  <div className="font-semibold text-gray-900 dark:text-gray-200">
                    How it syncs to both Facebook Shop & WhatsApp Business for ₹0:
                  </div>
                  <ol className="list-decimal pl-4 space-y-1">
                    <li>Open <strong>Meta Commerce Manager</strong> (<a href="https://business.facebook.com/commerce/" target="_blank" rel="noreferrer" className="text-blue-600 underline">business.facebook.com/commerce</a>) and select your E-commerce catalogue.</li>
                    <li>Go to <strong>Catalogue → Data Sources → Add Items → Data Feed → Scheduled Feed</strong>.</li>
                    <li>Paste your copied Feed URL above and select <strong>Daily</strong> refresh (e.g. every morning at 6:00 AM).</li>
                    <li>In your phone's <strong>WhatsApp Business app</strong>: go to <em>Settings → Business Tools → Catalogue</em>, and link this Meta Commerce Manager catalogue.</li>
                  </ol>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 italic">
                    Whenever you publish a new product in PIM or update prices, Meta re-syncs automatically on schedule. Products with valid image and price are exported.
                  </p>
                </div>
              </div>
            </section>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2.5 rounded-lg"
            >
              {saving ? "Saving…" : "Save configuration"}
            </button>
            <button
              onClick={handleTest}
              disabled={testing}
              className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium px-5 py-2.5 rounded-lg disabled:opacity-50"
            >
              {testing ? "Testing…" : "Test connections"}
            </button>
            {config?.updated_at && (
              <span className="text-xs text-gray-400">Last saved: {config.updated_at}</span>
            )}
          </div>

          {testResult && (
            <pre className="mt-4 bg-gray-900 text-gray-100 rounded-xl p-4 text-xs whitespace-pre-wrap">
              {testResult}
            </pre>
          )}

          <div className="mt-6 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-4 text-xs text-amber-800 dark:text-amber-300">
            Secrets are stored server-side and never shown in full again after saving — fields
            display a masked preview. Leave a masked field untouched to keep the current value, or
            paste a new key to replace it. Save clears the 30-minute review cache automatically.
          </div>
        </>
      )}
    </div>
  );
}
