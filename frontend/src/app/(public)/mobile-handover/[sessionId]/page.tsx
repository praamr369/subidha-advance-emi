"use client";

import { use, useEffect, useRef, useState } from "react";
import { CheckCircle2, PenTool, Smartphone, UserCheck, AlertCircle, Camera, QrCode } from "lucide-react";
import SignatureCanvas from "@/components/forms/SignatureCanvas";
import {
  getHandoverSession,
  submitHandoverSession,
  extractCustomerQuery,
  type HandoverSession,
} from "@/services/mobile-handover";

interface Props {
  params: Promise<{ sessionId: string }>;
}

export default function MobileHandoverPage({ params }: Props) {
  const resolved = use(params);
  const sessionId = resolved.sessionId;

  const [session, setSession] = useState<HandoverSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Signature state
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Customer ID state
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerCode, setCustomerCode] = useState("");
  const [customerName, setCustomerName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [scanNotice, setScanNotice] = useState<string | null>(null);

  const handlePhoneInputChange = (val: string) => {
    const parsed = extractCustomerQuery(val);
    if (parsed.phone) {
      setCustomerPhone(parsed.phone);
    } else {
      setCustomerPhone(val);
    }
    if (parsed.customer_code) {
      setCustomerCode(parsed.customer_code);
    }
  };

  const handleCardFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanNotice("Analyzing card image...");
    setError(null);

    // If BarcodeDetector is supported in this browser
    if (typeof window !== "undefined" && "BarcodeDetector" in window) {
      try {
        const detector = new (window as unknown as {
          BarcodeDetector: new (opts: { formats: string[] }) => {
            detect: (image: ImageBitmap) => Promise<Array<{ rawValue: string }>>;
          };
        }).BarcodeDetector({
          formats: ["qr_code", "ean_13", "code_128", "code_39"],
        });
        const bitmap = await createImageBitmap(file);
        const codes = await detector.detect(bitmap);
        if (codes.length > 0 && codes[0].rawValue) {
          const parsed = extractCustomerQuery(codes[0].rawValue);
          if (parsed.phone) setCustomerPhone(parsed.phone);
          if (parsed.customer_code) setCustomerCode(parsed.customer_code);
          setScanNotice("✓ Barcode / QR detected from card!");
          return;
        } else {
          setScanNotice("No barcode/QR found in photo. You can type phone number directly.");
        }
      } catch (err) {
        console.warn("Barcode detection error:", err);
        setScanNotice("Could not auto-read card. Please enter phone number.");
      }
    } else {
      setScanNotice("Auto-scanning not supported on this browser. Please enter phone number.");
    }
  };

  useEffect(() => {
    let active = true;
    getHandoverSession(sessionId)
      .then((res) => {
        if (!active) return;
        setSession(res);
        if (res.status === "COMPLETED") {
          setSubmitted(true);
        }
        if (res.customer_phone) setCustomerPhone(res.customer_phone);
        if (res.customer_name) setCustomerName(res.customer_name);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Handover session expired or invalid.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [sessionId]);

  const handleSignatureSubmit = async () => {
    if (!signatureData) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitHandoverSession(sessionId, {
        signature_data: signatureData,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to transmit signature to laptop.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCustomerIdSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const phone = customerPhone.trim();
    const code = customerCode.trim();
    if (!phone && !code) {
      setError("Please provide customer phone number or customer code.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await submitHandoverSession(sessionId, {
        phone: phone || undefined,
        customer_code: code || undefined,
        name: customerName || undefined,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to transmit customer ID to laptop.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-3 border-primary border-t-transparent" />
          <p className="text-sm font-medium text-slate-600">Connecting to laptop webapp…</p>
        </div>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-sm rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h2 className="mt-3 text-base font-bold text-slate-900">Session Expired</h2>
          <p className="mt-1 text-xs text-slate-600">{error}</p>
          <p className="mt-4 text-[11px] text-slate-500">
            Please ask the store executive on the laptop to generate a fresh QR code.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-md">
        {/* Header */}
        <div className="mb-6 text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Smartphone className="h-3.5 w-3.5" />
            <span>Subidha Furniture — Mobile Sync</span>
          </div>
          <h1 className="mt-2 text-xl font-bold tracking-tight text-slate-900">
            {session?.title || "Mobile Handover"}
          </h1>
          {session?.customer_name && (
            <p className="mt-1 text-xs font-medium text-slate-600">
              Customer: <span className="font-semibold text-slate-900">{session.customer_name}</span>
            </p>
          )}
        </div>

        {submitted ? (
          <div className="rounded-2xl border border-emerald-200 bg-white p-6 text-center shadow-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h2 className="mt-3 text-lg font-bold text-slate-900">Transmitted to Laptop!</h2>
            <p className="mt-1 text-xs text-slate-600">
              Your {session?.session_type === "SIGNATURE" ? "digital signature" : "customer ID"} has been received live by the laptop webapp.
            </p>
            <p className="mt-4 text-[11px] text-slate-500">
              The store executive is completing your order. You can now close this tab on your phone.
            </p>
          </div>
        ) : session?.session_type === "SIGNATURE" ? (
          /* Signature Flow */
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                <PenTool className="h-3.5 w-3.5 text-primary" />
                Sign with finger or stylus
              </span>
              <span className="text-[10px] text-slate-600">Touchscreen Pad</span>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-300 bg-slate-50">
              <SignatureCanvas
                height={200}
                label="Sign inside the box"
                onChange={(_file, dataUrl) => {
                  setSignatureData(dataUrl);
                }}
              />
            </div>

            <p className="mt-2 text-[11px] text-slate-600 text-center">
              Sign smoothly inside the box above. Once satisfied, tap Submit.
            </p>

            {error && (
              <div className="mt-3 rounded-lg bg-red-50 p-2.5 text-xs text-red-700">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={handleSignatureSubmit}
              disabled={!signatureData || submitting}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              <span>Transmit Signature to Laptop</span>
            </button>
          </div>
        ) : (
          /* Customer ID Flow */
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <UserCheck className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Send Customer ID to Laptop</h3>
                <p className="text-[11px] text-slate-600">Instantly links your account on the billing screen</p>
              </div>
            </div>

            <form onSubmit={handleCustomerIdSubmit} className="space-y-3">
              {/* Hidden camera file picker */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleCardFileSelect}
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-primary/30 bg-primary/5 py-2.5 text-xs font-semibold text-primary hover:bg-primary/10 transition"
              >
                <Camera className="h-4 w-4" />
                <span>📷 Scan Customer Card / QR with Camera</span>
              </button>

              {scanNotice && (
                <div className="rounded-lg bg-blue-50 p-2 text-center text-xs font-medium text-blue-700">
                  {scanNotice}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Registered Mobile Number
                </label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => handlePhoneInputChange(e.target.value)}
                  placeholder="e.g. 9476490946"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Customer Code / ID (Optional)
                </label>
                <input
                  type="text"
                  value={customerCode}
                  onChange={(e) => setCustomerCode(e.target.value.toUpperCase())}
                  placeholder="e.g. CUST-1042"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-mono text-slate-900 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || (!customerPhone.trim() && !customerCode.trim())}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 disabled:opacity-50"
              >
                {submitting ? (
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <UserCheck className="h-4 w-4" />
                )}
                <span>Fetch Directly to Laptop</span>
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
