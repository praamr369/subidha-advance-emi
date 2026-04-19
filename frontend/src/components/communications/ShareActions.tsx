"use client";

import { useMemo, useState } from "react";
import { Copy, Mail, MessageCircle, Share2 } from "lucide-react";

import { cn } from "@/lib/utils";

function normalizeDigits(raw: string): string {
  return Array.from(raw || "")
    .filter((ch) => ch >= "0" && ch <= "9")
    .join("");
}

function buildWhatsAppHref(message: string, phone?: string | null): string {
  const encoded = encodeURIComponent(message);
  const digits = normalizeDigits(phone || "");

  if (digits) {
    let normalized = digits;
    if (normalized.length === 12 && normalized.startsWith("91")) normalized = normalized.slice(2);
    if (normalized.length === 10) {
      return `https://wa.me/91${normalized}?text=${encoded}`;
    }
    return `https://wa.me/${normalized}?text=${encoded}`;
  }

  return `https://api.whatsapp.com/send?text=${encoded}`;
}

function buildMailtoHref(subject: string, body: string): string {
  const params = new URLSearchParams();
  params.set("subject", subject);
  params.set("body", body);
  return `mailto:?${params.toString()}`;
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      return ok;
    } catch {
      return false;
    }
  }
}

type ShareActionsProps = {
  label?: string;
  title: string;
  message: string;
  url?: string;
  whatsappPhone?: string | null;
  className?: string;
};

export default function ShareActions({
  label = "Share",
  title,
  message,
  url,
  whatsappPhone,
  className,
}: ShareActionsProps) {
  const [copied, setCopied] = useState(false);

  const resolvedUrl = useMemo(() => {
    if (url) return url;
    if (typeof window === "undefined") return "";
    return window.location.href;
  }, [url]);

  const resolvedMessage = useMemo(() => {
    const trimmed = message.trim();
    if (!resolvedUrl) return trimmed;
    return trimmed ? `${trimmed}\n\n${resolvedUrl}` : resolvedUrl;
  }, [message, resolvedUrl]);

  async function handleCopy() {
    if (!resolvedUrl) return;
    const ok = await copyText(resolvedUrl);
    setCopied(ok);
    window.setTimeout(() => setCopied(false), 1400);
  }

  async function handleWebShare() {
    if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
      return;
    }

    try {
      await navigator.share({
        title,
        text: message,
        url: resolvedUrl || undefined,
      });
    } catch {
      // user cancelled or unsupported payload
    }
  }

  const whatsappHref = useMemo(
    () => buildWhatsAppHref(resolvedMessage, whatsappPhone),
    [resolvedMessage, whatsappPhone]
  );
  const emailHref = useMemo(
    () => buildMailtoHref(title, resolvedMessage),
    [title, resolvedMessage]
  );
  const canWebShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <button
        type="button"
        onClick={handleCopy}
        disabled={!resolvedUrl}
        className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Copy className="h-4 w-4" />
        {copied ? "Copied" : "Copy link"}
      </button>

      <a
        href={whatsappHref}
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
      >
        <MessageCircle className="h-4 w-4" />
        WhatsApp
      </a>

      <a
        href={emailHref}
        className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
      >
        <Mail className="h-4 w-4" />
        Email
      </a>

      {canWebShare ? (
        <button
          type="button"
          onClick={handleWebShare}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-foreground bg-foreground px-4 text-sm font-medium text-background transition hover:opacity-90"
          aria-label={label}
        >
          <Share2 className="h-4 w-4" />
          {label}
        </button>
      ) : null}
    </div>
  );
}

