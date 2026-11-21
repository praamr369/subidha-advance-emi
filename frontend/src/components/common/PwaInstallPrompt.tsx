"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { Download, Share2, PlusSquare, X, Smartphone, CheckCircle2 } from "lucide-react";
import { brandConfig } from "@/config/brand";

const DISMISS_KEY = "subidha_pwa_prompt_dismissed_until";
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(true); // default true to avoid flash
  const [isDismissed, setIsDismissed] = useState(true);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    if (typeof window === "undefined") return;

    // 1. Check if already running standalone as PWA
    const standaloneMatch =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(standaloneMatch);
    if (standaloneMatch) return;

    // 2. Check dismissal in localStorage
    const dismissedUntil = localStorage.getItem(DISMISS_KEY);
    if (dismissedUntil && Number(dismissedUntil) > Date.now()) {
      setIsDismissed(true);
    } else {
      setIsDismissed(false);
    }

    // 3. Detect iOS Safari
    const ua = window.navigator.userAgent;
    const isAppleDevice = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
    const isSafariBrowser = /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS|mercury/i.test(ua);
    const isIOSDevice = isAppleDevice && isSafariBrowser;
    setIsIOS(isIOSDevice);

    // 4. Capture beforeinstallprompt for Android / Chrome / Edge
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // 5. Listen for appinstalled event
    const handleAppInstalled = () => {
      setIsStandalone(true);
      setDeferredPrompt(null);
    };
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleDismiss = useCallback(() => {
    setIsDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DURATION_MS));
    } catch {
      // Storage unavailable
    }
  }, []);

  const handleInstallClick = useCallback(async () => {
    if (isIOS) {
      setShowIOSModal(true);
      return;
    }

    if (!deferredPrompt) {
      // Fallback instruction if browser prompt not ready
      setShowIOSModal(true);
      return;
    }

    try {
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === "accepted") {
        setIsStandalone(true);
      }
      setDeferredPrompt(null);
    } catch (err) {
      console.warn("PWA install prompt failed:", err);
    }
  }, [deferredPrompt, isIOS]);

  if (!mounted || isStandalone || isDismissed) {
    return null;
  }

  // Only show if we either have the deferred prompt (Android/Chrome) or are on iOS Safari
  if (!deferredPrompt && !isIOS) {
    return null;
  }

  return (
    <>
      {/* Floating PWA Install Card — adjusted for mobile bottom nav bar */}
      <aside
        aria-label="Install mobile application"
        className="fixed bottom-20 md:bottom-6 left-4 right-4 md:left-auto md:right-6 md:max-w-sm z-40 rounded-2xl border border-primary/20 bg-card/95 p-4 shadow-xl backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-bottom-4"
      >
        <div className="flex items-start gap-3">
          <div className="relative size-11 shrink-0 overflow-hidden rounded-xl border border-border/80 bg-background shadow-xs p-1">
            <Image
              src="/brand/icon-192.png"
              alt={brandConfig.companyName}
              width={40}
              height={40}
              className="size-full rounded-lg object-contain"
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-foreground truncate">
                Install {brandConfig.companyName}
              </h3>
              <button
                type="button"
                onClick={handleDismiss}
                className="inline-flex size-6 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
                aria-label="Dismiss app install banner"
              >
                <X className="size-4" />
              </button>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground leading-snug">
              Instant mobile access for EMI, contracts, orders & notifications.
            </p>

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={handleInstallClick}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground shadow-xs transition hover:bg-primary/90 active:scale-95 touch-manipulation"
              >
                <Download className="size-3.5" />
                {isIOS ? "Install on iPhone" : "Install App"}
              </button>
              <button
                type="button"
                onClick={handleDismiss}
                className="inline-flex min-h-[36px] items-center rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-95"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* iOS Safari Step-by-Step Installation Modal */}
      {showIOSModal ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ios-install-title"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in"
          onClick={() => setShowIOSModal(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl animate-in slide-in-from-bottom-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2.5">
                <Smartphone className="size-5 text-primary" />
                <h4 id="ios-install-title" className="text-base font-bold text-foreground">
                  Install on iPhone / iPad
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSModal(false)}
                className="inline-flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground transition hover:text-foreground"
                aria-label="Close installation guide"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3.5 text-sm text-foreground">
              <div className="flex items-start gap-3 rounded-2xl border border-border/60 bg-muted/30 p-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-black text-primary">
                  1
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground">Tap the Share button</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    In Safari toolbar at the bottom of your screen, tap the{" "}
                    <Share2 className="inline size-4 text-primary align-text-bottom mx-0.5" /> Share icon.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-2xl border border-border/60 bg-muted/30 p-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-black text-primary">
                  2
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground">Select &apos;Add to Home Screen&apos;</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Scroll down through the share options and tap{" "}
                    <PlusSquare className="inline size-4 text-primary align-text-bottom mx-0.5" /> Add to Home Screen.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-2xl border border-border/60 bg-muted/30 p-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-black text-primary">
                  3
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground">Tap &apos;Add&apos; to confirm</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Tap Add in the top-right corner. The Subidha app icon will appear on your phone home screen!
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6">
              <button
                type="button"
                onClick={() => {
                  setShowIOSModal(false);
                  handleDismiss();
                }}
                className="w-full inline-flex min-h-[44px] items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-primary/90 active:scale-95"
              >
                <CheckCircle2 className="size-4" />
                Got it, thanks!
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/**
 * Reusable button for drawer menus (Customer / Partner / Staff / Vendor)
 * allowing users to manually trigger app installation or view instructions.
 */
export function InstallAppMenuItem({ onComplete }: { onComplete?: () => void }) {
  const [isStandalone, setIsStandalone] = useState(true);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const standaloneMatch =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(standaloneMatch);

    const ua = window.navigator.userAgent;
    const isAppleDevice = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
    setIsIOS(isAppleDevice);

    const handlePrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handlePrompt);

    return () => window.removeEventListener("beforeinstallprompt", handlePrompt);
  }, []);

  if (isStandalone) {
    return null;
  }

  const handleClick = async () => {
    if (isIOS || !deferredPrompt) {
      setShowIOSModal(true);
      return;
    }

    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setIsStandalone(true);
        if (onComplete) onComplete();
      }
    } catch {
      setShowIOSModal(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="flex w-full items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-3.5 py-2.5 text-xs font-bold text-primary transition hover:bg-primary/10 active:scale-98"
      >
        <Download className="size-4 shrink-0" />
        <span className="flex-1 text-left">Install Phone App</span>
        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
          PWA
        </span>
      </button>

      {showIOSModal ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
          onClick={() => setShowIOSModal(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h4 className="text-base font-bold text-foreground">Install App on Phone</h4>
              <button
                type="button"
                onClick={() => setShowIOSModal(false)}
                className="inline-flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm text-foreground">
              <p className="text-xs text-muted-foreground">
                To install this app on your phone home screen:
              </p>
              <div className="rounded-xl border border-border p-3 text-xs leading-relaxed space-y-2">
                <p>
                  <strong>iPhone (Safari):</strong> Tap the <strong>Share</strong> button at bottom, then scroll and select <strong>&apos;Add to Home Screen&apos;</strong>.
                </p>
                <p>
                  <strong>Android (Chrome):</strong> Tap the three dots (⋮) in the top-right corner, then select <strong>&apos;Install app&apos;</strong> or <strong>&apos;Add to Home Screen&apos;</strong>.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowIOSModal(false);
                if (onComplete) onComplete();
              }}
              className="mt-5 w-full inline-flex min-h-[40px] items-center justify-center rounded-xl bg-primary text-xs font-bold text-primary-foreground"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
