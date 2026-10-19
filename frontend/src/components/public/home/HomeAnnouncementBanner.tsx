"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Bell,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Flame,
  Megaphone,
  X,
} from "lucide-react";

import type { PublicAnnouncement, PublicAnnouncementType } from "@/services/public-site";

const STORAGE_KEY = "subidha_dismissed_announcements";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getDismissedSnapshot(): string {
  try {
    return sessionStorage.getItem(STORAGE_KEY) || "[]";
  } catch {
    return "[]";
  }
}

function getServerSnapshot(): string {
  return "[]";
}

const TYPE_STYLES: Record<
  PublicAnnouncementType,
  {
    bg: string;
    badgeBg: string;
    badgeText: string;
    icon: typeof Megaphone;
    accent: string;
  }
> = {
  OFFER: {
    bg: "from-amber-500/15 via-orange-500/10 to-transparent border-amber-500/30 text-amber-950 dark:text-amber-100",
    badgeBg: "bg-amber-600 text-white dark:bg-amber-500 dark:text-amber-950",
    badgeText: "LIMITED OFFER",
    icon: Flame,
    accent: "text-amber-600 dark:text-amber-400",
  },
  NEWS: {
    bg: "from-blue-500/15 via-indigo-500/10 to-transparent border-blue-500/30 text-blue-950 dark:text-blue-100",
    badgeBg: "bg-blue-600 text-white dark:bg-blue-400 dark:text-blue-950",
    badgeText: "NEWS UPDATE",
    icon: Megaphone,
    accent: "text-blue-600 dark:text-blue-400",
  },
  ALERT: {
    bg: "from-rose-500/15 via-red-500/10 to-transparent border-rose-500/30 text-rose-950 dark:text-rose-100",
    badgeBg: "bg-rose-600 text-white dark:bg-rose-500 dark:text-rose-950",
    badgeText: "NOTICE",
    icon: AlertCircle,
    accent: "text-rose-600 dark:text-rose-400",
  },
  GENERAL: {
    bg: "from-emerald-500/15 via-teal-500/10 to-transparent border-emerald-500/30 text-emerald-950 dark:text-emerald-100",
    badgeBg: "bg-emerald-600 text-white dark:bg-emerald-400 dark:text-emerald-950",
    badgeText: "UPDATE",
    icon: Bell,
    accent: "text-emerald-600 dark:text-emerald-400",
  },
};

interface HomeAnnouncementBannerProps {
  announcements?: PublicAnnouncement[];
}

export default function HomeAnnouncementBanner({ announcements = [] }: HomeAnnouncementBannerProps) {
  const dismissedRaw = useSyncExternalStore(subscribe, getDismissedSnapshot, getServerSnapshot);
  const dismissedIds = useMemo(() => {
    try {
      return JSON.parse(dismissedRaw) as number[];
    } catch {
      return [];
    }
  }, [dismissedRaw]);

  const [currentIndex, setCurrentIndex] = useState(0);

  const visibleAnnouncements = announcements.filter((a) => !dismissedIds.includes(a.id));

  if (visibleAnnouncements.length === 0) {
    return null;
  }

  const current = visibleAnnouncements[currentIndex % visibleAnnouncements.length];
  const style = TYPE_STYLES[current.banner_type] || TYPE_STYLES.GENERAL;
  const Icon = style.icon;

  const handleDismiss = (id: number) => {
    try {
      const next = [...dismissedIds, id];
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event("storage"));
    } catch {
      // ignore
    }
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % visibleAnnouncements.length);
  };

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + visibleAnnouncements.length) % visibleAnnouncements.length);
  };

  return (
    <aside
      aria-label="Store announcement and special offers"
      className={`relative mb-6 overflow-hidden rounded-2xl border bg-gradient-to-r p-3.5 shadow-sm sm:p-4 transition-all ${style.bg}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Main message area */}
        <div className="flex items-start gap-3 sm:items-center">
          {/* If announcement has an uploaded photo banner thumbnail */}
          {current.image_url ? (
            <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded-xl border border-border/80 shadow-xs">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={current.image_url}
                alt={current.title}
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            <div
              className={`mt-0.5 sm:mt-0 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-background/80 shadow-xs backdrop-blur-xs ${style.accent}`}
            >
              <Icon className="h-4 w-4" />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${style.badgeBg}`}
            >
              {current.badge_text || style.badgeText}
            </span>

            <span className="text-xs sm:text-sm font-bold text-foreground">
              {current.title}
            </span>

            {current.message && (
              <span className="hidden md:inline text-xs text-muted-foreground border-l border-border/80 pl-2">
                {current.message}
              </span>
            )}
          </div>
        </div>

        {/* Right CTA and controls */}
        <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pt-1 sm:pt-0 border-t border-border/30 sm:border-t-0">
          {current.action_url && (
            <Link
              href={current.action_url}
              className="inline-flex items-center gap-1.5 rounded-xl bg-foreground px-3 py-1.5 text-xs font-semibold text-background shadow-xs transition hover:opacity-90"
            >
              <span>{current.action_label || "Explore Details"}</span>
              <ExternalLink className="h-3 w-3" />
            </Link>
          )}

          {/* Slider controls if multiple announcements */}
          {visibleAnnouncements.length > 1 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground ml-1">
              <button
                type="button"
                onClick={handlePrev}
                aria-label="Previous announcement"
                className="rounded-lg p-1 hover:bg-background/80 transition"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="text-[10px] font-mono font-medium">
                {(currentIndex % visibleAnnouncements.length) + 1}/{visibleAnnouncements.length}
              </span>
              <button
                type="button"
                onClick={handleNext}
                aria-label="Next announcement"
                className="rounded-lg p-1 hover:bg-background/80 transition"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Dismiss button */}
          <button
            type="button"
            onClick={() => handleDismiss(current.id)}
            aria-label="Dismiss banner"
            className="rounded-lg p-1 text-muted-foreground/80 hover:bg-background/80 hover:text-foreground transition ml-1"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
