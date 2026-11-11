"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { getGoogleAuthConfig } from "@/services/auth.service";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              theme?: "outline" | "filled_blue" | "filled_black";
              size?: "large" | "medium" | "small";
              text?: "signin_with" | "signup_with" | "continue_with" | "signin";
              shape?: "rectangular" | "pill" | "circle" | "square";
              width?: number | string;
              logo_alignment?: "left" | "center";
            }
          ) => void;
          prompt: () => void;
        };
      };
    };
  }
}

interface GoogleSignInButtonProps {
  onSuccess: (idToken: string) => void;
  onError?: (error: string) => void;
  disabled?: boolean;
  text?: "signin_with" | "signup_with" | "continue_with" | "signin";
}

export default function GoogleSignInButton({
  onSuccess,
  onError,
  disabled = false,
  text = "continue_with",
}: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [resolvedClientId, setResolvedClientId] = useState<string>("");
  const [configMissing, setConfigMissing] = useState(false);
  const [fetchingConfig, setFetchingConfig] = useState(true);

  // 1. Resolve Client ID: checks database setting from API, falls back to env variable
  useEffect(() => {
    let isMounted = true;

    async function resolveConfig() {
      try {
        const envId = (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "").trim().replace(/^["']|["']$/g, "");
        const serverConfig = await getGoogleAuthConfig();
        const serverId = (serverConfig?.google_client_id || "").trim().replace(/^["']|["']$/g, "");

        const activeId = serverId || envId;

        if (!isMounted) return;

        if (activeId) {
          setResolvedClientId(activeId);
          setConfigMissing(false);
        } else {
          setConfigMissing(true);
        }
      } catch {
        const envFallback = (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "").trim().replace(/^["']|["']$/g, "");
        if (isMounted) {
          if (envFallback) {
            setResolvedClientId(envFallback);
            setConfigMissing(false);
          } else {
            setConfigMissing(true);
          }
        }
      } finally {
        if (isMounted) setFetchingConfig(false);
      }
    }

    void resolveConfig();

    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Load Google Identity Services script once Client ID is resolved
  useEffect(() => {
    if (!resolvedClientId) return;

    if (window.google?.accounts?.id) {
      setScriptLoaded(true);
      return;
    }

    const existingScript = document.getElementById("google-gis-script");
    if (existingScript) {
      existingScript.addEventListener("load", () => setScriptLoaded(true));
      return;
    }

    const script = document.createElement("script");
    script.id = "google-gis-script";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => setScriptLoaded(true);
    script.onerror = () => {
      onError?.("Failed to load Google Identity Services. Check your internet connection.");
    };
    document.body.appendChild(script);
  }, [resolvedClientId, onError]);

  // 3. Render official Google button inside container
  useEffect(() => {
    if (!scriptLoaded || !resolvedClientId || !containerRef.current || !window.google?.accounts?.id) {
      return;
    }

    try {
      window.google.accounts.id.initialize({
        client_id: resolvedClientId,
        callback: (response) => {
          if (response.credential) {
            onSuccess(response.credential);
          } else {
            onError?.("No credential received from Google.");
          }
        },
      });

      containerRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(containerRef.current, {
        theme: "outline",
        size: "large",
        text,
        shape: "rectangular",
        width: 380,
        logo_alignment: "left",
      });
    } catch {
      onError?.("Failed to initialize Google Sign-In.");
    }
  }, [scriptLoaded, resolvedClientId, onSuccess, onError, text]);

  // Google SVG Icon for the fallback styled button
  const GoogleGIcon = () => (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );

  if (fetchingConfig) {
    return (
      <div className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-border bg-card px-4 text-xs font-medium text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span>Initializing Google Sign-In...</span>
      </div>
    );
  }

  if (configMissing) {
    return (
      <button
        type="button"
        onClick={() => {
          onError?.(
            "Google OAuth Setup: Admin can paste the Google Client ID directly in Admin Settings (Settings -> Business Setup -> Email SMTP / Google) to enable instant 1-click customer login."
          );
        }}
        className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground transition hover:bg-muted/60"
      >
        <GoogleGIcon />
        <span>Continue with Google</span>
      </button>
    );
  }

  return (
    <div className="w-full flex flex-col items-center">
      <div
        ref={containerRef}
        className={`w-full flex justify-center [&>div]:!w-full [&_iframe]:!w-full ${disabled ? "pointer-events-none opacity-50" : ""}`}
      >
        {!scriptLoaded && (
          <button
            type="button"
            disabled
            className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-muted-foreground"
          >
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span>Loading Google Sign-In...</span>
          </button>
        )}
      </div>
    </div>
  );
}
