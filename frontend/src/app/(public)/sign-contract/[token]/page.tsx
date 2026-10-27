"use client";

import Link from "next/link";
import React, { useEffect, useState, use } from "react";

import SignatureCanvas from "@/components/forms/SignatureCanvas";
import { formatDocumentDateTime, formatDocumentMoney } from "@/lib/documents/formatters";
import { getPublicBusinessProfile } from "@/services/public";
import {
  getPublicContractSigningInfo,
  submitPublicContractSignature,
  type PublicContractSigningInfo,
} from "@/services/contract-signing";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default function PublicContractSignPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const rawToken = resolvedParams?.token || "";
  const token = rawToken ? decodeURIComponent(rawToken) : "";

  const [supportPhone, setSupportPhone] = useState<string>("+91 94764 90946");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contract, setContract] = useState<PublicContractSigningInfo | null>(null);

  const [signatureMode, setSignatureMode] = useState<"draw" | "upload">("draw");
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [signerName, setSignerName] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<{
    signed_at: string;
    contract_ref: string;
    signature_url?: string | null;
  } | null>(null);

  // Fetch official business profile contact dynamically from backend
  useEffect(() => {
    let mounted = true;
    getPublicBusinessProfile()
      .then((profile) => {
        if (!mounted) return;
        if (profile?.support_phone && profile.support_phone.trim()) {
          setSupportPhone(profile.support_phone.trim());
        }
      })
      .catch(() => {
        // Safe fallback preserved
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    if (!token) {
      setError("No signing token provided.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    getPublicContractSigningInfo(token)
      .then((data) => {
        if (!mounted) return;
        setContract(data);
        if (data.customer_name) {
          setSignerName(data.customer_name);
        }
        if (data.support_phone && data.support_phone.trim()) {
          setSupportPhone(data.support_phone.trim());
        }
      })
      .catch((err) => {
        if (!mounted) return;
        if (err && typeof err === "object" && "body" in err) {
          const body = (err as { body?: { support_phone?: string } }).body;
          if (body?.support_phone && body.support_phone.trim()) {
            setSupportPhone(body.support_phone.trim());
          }
        }
        setError(err instanceof Error ? err.message : "Failed to load contract details.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [token]);

  const handleSignatureCanvasChange = (file: File | null, dataUrl: string | null) => {
    setSignatureFile(file);
    setSignatureDataUrl(dataUrl);
    setSubmitError(null);
  };

  const handleSignatureFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    if (!file) return;
    setSignatureFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      setSignatureDataUrl(e.target?.result as string);
    };
    reader.readAsDataURL(file);
    setSubmitError(null);
  };

  const handleClearSignature = () => {
    setSignatureFile(null);
    setSignatureDataUrl(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (!signatureFile && !signatureDataUrl) {
      setSubmitError("Please provide your signature before submitting.");
      return;
    }
    if (!agreedToTerms) {
      setSubmitError("Please confirm your consent to the contract terms.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await submitPublicContractSignature(token, {
        signature_data: signatureDataUrl || undefined,
        signature_image: signatureFile || undefined,
        customer_name_confirmation: signerName.trim() || undefined,
      });

      setSuccessResult({
        signed_at: res.signed_at,
        contract_ref: res.contract_ref,
        signature_url: res.signature_url || signatureDataUrl,
      });
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : "Failed to submit signature. Please try again.";
      const cleanMsg =
        typeof rawMsg === "string" && (rawMsg.includes("<html") || rawMsg.includes("<!doctype") || /<[a-z][\s\S]*>/i.test(rawMsg))
          ? "The server encountered an error while securing your digital signature. Please try again or contact support."
          : rawMsg;
      setSubmitError(cleanMsg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50/60 via-background to-background py-6 px-4 sm:px-6">
      <div className="mx-auto max-w-lg">
        {/* Brand Header */}
        <header className="mb-6 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-600 text-white font-black text-xl shadow-md">
            SF
          </div>
          <h1 className="mt-2 text-xl font-bold tracking-tight text-foreground">
            Subidha Furniture
          </h1>
          <p className="text-xs font-medium text-muted-foreground">
            Digital Contract Review & E-Signature
          </p>
        </header>

        {loading ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="mt-3 text-sm text-muted-foreground font-medium">
              Loading contract details...
            </p>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive text-xl font-bold">
              ⚠
            </div>
            <h2 className="mt-3 text-base font-semibold text-foreground">
              Unable to Open Contract
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            <div className="mt-5 rounded-xl border border-border bg-background p-3 text-xs text-muted-foreground">
              If this signing link expired or was used already, please contact Subidha Furniture support at{" "}
              <a href={`tel:${supportPhone.replace(/\s+/g, "")}`} className="font-semibold text-primary underline">
                {supportPhone}
              </a>.
            </div>
          </div>
        ) : successResult ? (
          /* Submission Success State */
          <div className="rounded-2xl border border-emerald-200 bg-card p-6 text-center shadow-md">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-700">
              ✓
            </div>
            <h2 className="mt-3 text-lg font-bold text-foreground">
              Contract Signed Successfully!
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Your signature has been securely recorded on the central database.
            </p>

            <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 text-left text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Contract Ref:</span>
                <span className="font-semibold text-foreground">{successResult.contract_ref}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Signed At:</span>
                <span className="font-semibold text-foreground">
                  {formatDocumentDateTime(successResult.signed_at)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Signer:</span>
                <span className="font-semibold text-foreground">{signerName || "Customer"}</span>
              </div>
            </div>

            {successResult.signature_url ? (
              <div className="mt-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Attached Signature
                </div>
                <div className="mt-1.5 mx-auto flex h-20 w-56 items-center justify-center rounded-xl border border-border bg-white p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={successResult.signature_url}
                    alt="Recorded signature"
                    className="max-h-16 max-w-full object-contain filter contrast-125"
                  />
                </div>
              </div>
            ) : null}

            <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 dark:bg-sky-950/30 p-3 text-left text-xs text-sky-800 dark:text-sky-200">
              <p className="font-semibold flex items-center gap-1.5">
                <span>👤</span>
                <span>Registered Subidha Webapp Account</span>
              </p>
              <p className="mt-1 text-[11px] opacity-90">
                This digital agreement is securely stored in your customer account. You can log into your Customer Portal anytime to track your contract, view EMI payments, and download official receipts.
              </p>
            </div>

            <div className="mt-4 flex flex-col gap-2">
              <Link
                href="/customer/contracts"
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary text-xs font-bold text-primary-foreground shadow-sm transition hover:opacity-95"
              >
                <span>📱</span>
                <span>Open My Customer Webapp Portal</span>
              </Link>
            </div>
          </div>
        ) : contract?.already_signed ? (
          /* Already Signed State */
          <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-xl text-emerald-800">
              ✓
            </div>
            <h2 className="mt-3 text-base font-bold text-foreground">
              Contract Already Signed
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              This contract ({contract.contract_ref}) was previously signed on{" "}
              <strong>{formatDocumentDateTime(contract.signed_at || new Date())}</strong>.
            </p>

            {contract.signature_url ? (
              <div className="mt-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Signature on File
                </div>
                <div className="mt-1.5 mx-auto flex h-20 w-56 items-center justify-center rounded-xl border border-border bg-white p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={contract.signature_url}
                    alt="Customer signature on file"
                    className="max-h-16 max-w-full object-contain filter contrast-125"
                  />
                </div>
              </div>
            ) : null}

            {contract.items && contract.items.length > 0 ? (
              <div className="mt-4 rounded-xl border border-border bg-muted/30 p-3 text-left text-xs">
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Products in Contract ({contract.items.length} {contract.items.length === 1 ? "item" : "items"})
                </div>
                <div className="divide-y divide-border/60">
                  {contract.items.map((item, idx) => (
                    <div key={item.id || idx} className="py-1.5 flex items-center justify-between">
                      <span className="font-semibold text-foreground">
                        {idx + 1}. {item.name} × {item.quantity}
                      </span>
                      <span className="font-bold text-primary">{formatDocumentMoney(item.monthly_amount)}/mo</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {Number(contract.security_deposit_amount || 0) > 0 ? (
              <div className="mt-3 rounded-xl border border-sky-100 bg-sky-50/50 dark:bg-sky-950/20 p-3 text-left text-xs">
                <div className="flex justify-between font-semibold">
                  <span className="text-muted-foreground">Security Deposit:</span>
                  <span className="text-foreground">{formatDocumentMoney(contract.security_deposit_amount)}</span>
                </div>
                <div className="flex justify-between font-semibold mt-1">
                  <span className="text-muted-foreground">Paid Deposit:</span>
                  <span className="text-emerald-700 dark:text-emerald-400">
                    {formatDocumentMoney(contract.security_deposit_paid || "0.00")} ({contract.deposit_status || "PAID"})
                  </span>
                </div>
              </div>
            ) : null}

            <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 dark:bg-sky-950/30 p-3 text-left text-xs text-sky-800 dark:text-sky-200">
              <p className="font-semibold flex items-center gap-1.5">
                <span>👤</span>
                <span>Registered Subidha Webapp Account</span>
              </p>
              <p className="mt-1 text-[11px] opacity-90">
                You can access this contract and all your account documents anytime from your registered Customer Portal.
              </p>
            </div>

            <div className="mt-4 flex flex-col gap-2">
              <Link
                href="/customer/contracts"
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary text-xs font-bold text-primary-foreground shadow-sm transition hover:opacity-95"
              >
                <span>📱</span>
                <span>Open My Customer Webapp Portal</span>
              </Link>
            </div>
          </div>
        ) : contract ? (
          /* Signing Form */
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Contract Summary Card */}
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Contract Agreement
                  </div>
                  <div className="text-base font-bold text-foreground">
                    {contract.contract_ref}
                  </div>
                </div>
                <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase text-amber-800">
                  {contract.plan_type}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <div className="col-span-2 rounded-lg bg-sky-50 dark:bg-sky-950/40 px-2.5 py-1.5 text-xs text-sky-800 dark:text-sky-300 flex items-center justify-between">
                  <span className="font-semibold flex items-center gap-1">
                    <span>👤</span>
                    <span>Registered Subidha Customer</span>
                  </span>
                  <span className="font-bold">{contract.customer_name}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Phone:</span>
                  <div className="font-semibold text-foreground">{contract.customer_phone_masked}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Contract Ref:</span>
                  <div className="font-semibold text-foreground">{contract.contract_ref}</div>
                </div>

                {/* Single or Multi-Product Display */}
                {contract.items && contract.items.length > 0 ? (
                  <div className="col-span-2 rounded-xl border border-amber-200/80 bg-amber-50/50 dark:bg-amber-950/20 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900 dark:text-amber-300">
                        Chosen Furniture Products ({contract.items.length} {contract.items.length === 1 ? "item" : "items"})
                      </span>
                      {contract.items.length > 1 ? (
                        <span className="rounded-full bg-amber-200/70 dark:bg-amber-900/60 px-2 py-0.5 text-[10px] font-bold text-amber-900 dark:text-amber-200">
                          Multi-Item Package
                        </span>
                      ) : null}
                    </div>
                    <div className="divide-y divide-amber-200/50 dark:divide-amber-900/50">
                      {contract.items.map((item, idx) => (
                        <div key={item.id || idx} className="py-2 flex items-start justify-between gap-3 text-xs">
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-foreground flex items-center gap-1.5 flex-wrap">
                              <span>{idx + 1}. {item.name}</span>
                              <span className="rounded bg-muted px-1.5 py-0.2 text-[10px] text-muted-foreground font-mono">
                                Qty: {item.quantity}
                              </span>
                            </div>
                            {item.product_code ? (
                              <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                                Code: {item.product_code}
                              </div>
                            ) : null}
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-bold text-primary">
                              {formatDocumentMoney(item.monthly_amount)}/mo
                            </div>
                            {Number(item.security_deposit_amount || 0) > 0 ? (
                              <div className="text-[10px] text-muted-foreground">
                                Deposit: {formatDocumentMoney(item.security_deposit_amount)}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Product / Package:</span>
                    <div className="font-semibold text-foreground">{contract.product_name}</div>
                  </div>
                )}

                <div>
                  <span className="text-muted-foreground">Monthly Installment:</span>
                  <div className="text-sm font-bold text-primary">
                    {formatDocumentMoney(contract.monthly_amount)}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Tenure:</span>
                  <div className="font-semibold text-foreground">{contract.tenure_months} Months</div>
                </div>
                {contract.start_date ? (
                  <div>
                    <span className="text-muted-foreground">Start Date:</span>
                    <div className="font-semibold text-foreground">{contract.start_date}</div>
                  </div>
                ) : null}
                <div>
                  <span className="text-muted-foreground">Total Contract Value:</span>
                  <div className="font-semibold text-foreground">
                    {formatDocumentMoney(contract.total_amount)}
                  </div>
                </div>

                {/* Security Deposit Details */}
                {(contract.plan_type === "RENT" ||
                  contract.plan_type === "LEASE" ||
                  Number(contract.security_deposit_amount || 0) > 0) ? (
                  <div className="col-span-2 rounded-xl border border-sky-200 bg-sky-50/60 dark:bg-sky-950/30 p-3.5 text-xs">
                    <div className="flex items-center justify-between pb-2 border-b border-sky-200/60 dark:border-sky-800/60">
                      <div className="font-bold text-sky-950 dark:text-sky-200 flex items-center gap-1.5">
                        <span>🛡</span>
                        <span>Security Deposit Details</span>
                      </div>
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                        contract.deposit_status === "PAID" || contract.deposit_status === "SUBMITTED"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          : contract.deposit_status === "PARTIALLY_PAID" || contract.deposit_status === "PARTIAL"
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                      }`}>
                        {contract.deposit_status === "PAID" || contract.deposit_status === "SUBMITTED"
                          ? "✓ Deposit Paid"
                          : contract.deposit_status === "PARTIALLY_PAID" || contract.deposit_status === "PARTIAL"
                          ? "Partially Paid"
                          : "Deposit Pending"}
                      </span>
                    </div>

                    <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Deposit Required:</span>
                        <div className="text-sm font-bold text-foreground">
                          {formatDocumentMoney(contract.security_deposit_amount || "0.00")}
                          {contract.security_deposit_percent && Number(contract.security_deposit_percent) > 0 ? (
                            <span className="ml-1 text-[10px] text-muted-foreground font-normal">
                              ({contract.security_deposit_percent}%)
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Deposit Paid / Received:</span>
                        <div className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                          {formatDocumentMoney(contract.security_deposit_paid || "0.00")}
                        </div>
                      </div>
                      {Number(contract.security_deposit_pending || 0) > 0 ? (
                        <div>
                          <span className="text-muted-foreground">Pending Deposit:</span>
                          <div className="font-semibold text-amber-700 dark:text-amber-400">
                            {formatDocumentMoney(contract.security_deposit_pending || "0.00")}
                          </div>
                        </div>
                      ) : null}
                      <div>
                        <span className="text-muted-foreground">Refundable Deposit:</span>
                        <div className="font-semibold text-foreground">
                          {formatDocumentMoney(contract.refundable_security_deposit || contract.security_deposit_amount || "0.00")}
                        </div>
                      </div>
                    </div>
                    <p className="mt-2.5 text-[11px] text-muted-foreground leading-relaxed">
                      Security deposit is held in a protected escrow balance and is 100% refundable upon completion of tenure and asset condition return inspection.
                    </p>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Legal Consent Notice */}
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs leading-relaxed text-amber-900">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-amber-300 text-primary focus:ring-primary"
                />
                <span>
                  I confirm that I have reviewed the details above. I agree to sign this contract electronically and confirm that my digital signature below has the same validity as an ink signature.
                </span>
              </label>
            </div>

            {/* Touchscreen Signature Pad */}
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Draw Signature *
                </label>
                <div className="flex items-center gap-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setSignatureMode("draw")}
                    className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                      signatureMode === "draw"
                        ? "bg-primary text-primary-foreground font-semibold"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    ✍ Finger / Stylus
                  </button>
                  <button
                    type="button"
                    onClick={() => setSignatureMode("upload")}
                    className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                      signatureMode === "upload"
                        ? "bg-primary text-primary-foreground font-semibold"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    📁 Upload Image
                  </button>
                </div>
              </div>

              {signatureMode === "draw" ? (
                <div className="space-y-2">
                  <SignatureCanvas
                    height={160}
                    label="Sign inside the box with your finger"
                    onChange={handleSignatureCanvasChange}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Draw smoothly inside the box using your touch screen. Tap Clear if you wish to re-sign.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 pt-2">
                  <label className="block text-xs text-muted-foreground font-medium">
                    Upload a photograph or scan of your ink signature:
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleSignatureFileUpload}
                    className="block w-full text-xs text-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-xs file:font-semibold file:text-primary-foreground hover:file:opacity-90"
                  />
                  {signatureDataUrl ? (
                    <div className="relative mt-2 mx-auto flex h-20 w-56 items-center justify-center rounded-xl border border-emerald-300 bg-white p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={signatureDataUrl}
                        alt="Signature preview"
                        className="max-h-16 max-w-full object-contain filter contrast-125"
                      />
                      <button
                        type="button"
                        onClick={handleClearSignature}
                        className="absolute right-1 top-1 rounded-full bg-slate-200 p-1 text-[10px] text-slate-700 hover:bg-slate-300"
                        title="Clear"
                      >
                        ✕
                      </button>
                    </div>
                  ) : null}
                </div>
              )}

              {/* Signer Name Input */}
              <div className="mt-4 pt-3 border-t border-border">
                <label htmlFor="signer-name" className="text-xs font-semibold text-muted-foreground">
                  Signer Full Name (as per ID)
                </label>
                <input
                  id="signer-name"
                  type="text"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder="Enter full name"
                  required
                  className="mt-1 block w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            {submitError ? (
              <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-2.5 text-xs font-medium text-destructive">
                {submitError}
              </div>
            ) : null}

            {/* Submit Action */}
            <button
              type="submit"
              disabled={submitting || (!signatureFile && !signatureDataUrl)}
              className="w-full h-12 rounded-2xl bg-primary text-primary-foreground font-bold text-sm shadow-md transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Securing and Uploading..." : "Submit Digital Signature"}
            </button>
          </form>
        ) : null}

        {/* Footer */}
        <footer className="mt-8 text-center text-[11px] text-muted-foreground">
          Protected by SUBIDHA CORE · Subidha Furniture, Asansol ·{" "}
          <Link href="/legal/privacy" className="underline hover:text-foreground">
            Privacy Policy
          </Link>
        </footer>
      </div>
    </div>
  );
}

