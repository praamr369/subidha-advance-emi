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

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await refreshReviewCache();
      setTestResult(
        [
          `Google: ${r.google.error ? `✗ ${r.google.error}` : `✓ ${r.google.fetched} review(s)`}`,
          `Facebook: ${r.facebook.error ? `✗ ${r.facebook.error}` : `✓ ${r.facebook.fetched} review(s)`}`,
          `YouTube: ${r.youtube.error ? `✗ ${r.youtube.error}` : `✓ ${r.youtube.fetched} comment(s)`}`,
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Brand Data Center</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Connect your Google Business Profile, Facebook Page, and YouTube channel so reviews
            appear on the public site and in the admin Reviews Manager. Values saved here override
            server .env settings.
          </p>
        </div>
        <Link
          href={ROUTES.admin.reviews ?? "/admin/reviews"}
          className="text-sm font-medium text-blue-600 hover:underline"
        >
          Open Reviews Manager →
        </Link>
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
