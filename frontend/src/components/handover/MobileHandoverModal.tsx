"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "react-qr-code";
import { CheckCircle2, QrCode as QrIcon, Smartphone, X } from "lucide-react";
import {
  createHandoverSession,
  getHandoverSession,
  type HandoverSessionType,
} from "@/services/mobile-handover";

interface Props {
  sessionType: HandoverSessionType;
  title: string;
  customerName?: string;
  customerPhone?: string;
  isOpen: boolean;
  onClose: () => void;
  onSignatureCaptured?: (dataUrl: string) => void;
  onCustomerCaptured?: (data: { phone?: string; customer_code?: string; name?: string }) => void;
}

export default function MobileHandoverModal({
  sessionType,
  title,
  customerName,
  customerPhone,
  isOpen,
  onClose,
  onSignatureCaptured,
  onCustomerCaptured,
}: Props) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const origin = typeof window !== "undefined" && window.location.origin
    ? window.location.origin
    : "https://subidhafurnitureasansol.com";

  // Initialize session
  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    setLoading(true);
    setError(null);
    setCompleted(false);
    setSessionId(null);

    createHandoverSession({
      session_type: sessionType,
      title,
      customer_name: customerName,
      customer_phone: customerPhone,
    })
      .then((res) => {
        if (!active) return;
        setSessionId(res.session_id);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to initiate mobile sync session.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [isOpen, sessionType, title, customerName, customerPhone]);

  // Polling for completion
  useEffect(() => {
    if (!sessionId || !isOpen || completed) return;

    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await getHandoverSession(sessionId);
        if (res.status === "COMPLETED") {
          setCompleted(true);
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

          if (sessionType === "SIGNATURE" && res.data?.signature_data) {
            onSignatureCaptured?.(res.data.signature_data);
          } else if (sessionType === "CUSTOMER_ID" && res.data) {
            onCustomerCaptured?.(res.data);
          }

          setTimeout(() => {
            onClose();
          }, 1200);
        }
      } catch {
        // Poll fail-soft
      }
    }, 1500);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [sessionId, isOpen, completed, sessionType, onSignatureCaptured, onCustomerCaptured, onClose]);

  if (!isOpen) return null;

  const mobileUrl = sessionId ? `${origin}/mobile-handover/${sessionId}` : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-background shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Smartphone className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">{title}</h2>
              <p className="text-[11px] text-muted-foreground">Scan with phone camera</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col items-center gap-4 p-6 text-center">
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="text-xs text-muted-foreground">Generating live QR sync…</p>
            </div>
          ) : error ? (
            <div className="py-6 text-xs text-destructive">{error}</div>
          ) : completed ? (
            <div className="flex flex-col items-center gap-2 py-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <p className="text-sm font-bold text-foreground">Live Data Received!</p>
              <p className="text-xs text-muted-foreground">Synchronized directly into your laptop webapp.</p>
            </div>
          ) : (
            <>
              <div className="rounded-xl border-2 border-primary/20 bg-white p-4 shadow-inner">
                <QRCode value={mobileUrl} size={160} level="M" />
              </div>

              <div className="space-y-1">
                <p className="text-xs font-semibold text-foreground">
                  {sessionType === "SIGNATURE"
                    ? "Ask customer to scan with smartphone camera to sign"
                    : "Scan with customer phone to link account"}
                </p>
                <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                  <span>Waiting for mobile action…</span>
                </div>
              </div>

              {customerName && (
                <div className="rounded-lg bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground">
                  Customer: <span className="font-semibold text-foreground">{customerName}</span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-end border-t border-border px-5 py-3 bg-muted/20">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border px-4 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
