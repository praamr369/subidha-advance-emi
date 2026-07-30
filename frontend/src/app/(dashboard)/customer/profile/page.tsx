"use client";

import { formatRupee } from "@/lib/utils/currency";
import { Camera, FileText, GitBranch, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import CustomerPageShell, { CPageCard, CPageSection, CPageStats, CPageStat } from "@/components/layout/CustomerPageShell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import StatusBadge from "@/components/ui/status-badge";
import {
  getCustomerProfile,
  changeCustomerUsername,
  updateCustomerProfile,
  type CustomerProfileResponse,
} from "@/services/customer";
import {
  uploadCustomerPhoto,
  listCustomerKycDocuments,
  submitCustomerKycDocument,
  listCustomerReferrals,
  type CustomerKycDocumentRecord,
  type CustomerReferralRecord,
} from "@/services/customer/index";
import { initialsFromDisplayName } from "@/lib/display-name";
import { useLogout } from "@/hooks/useLogout";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    const raw = error.message.trim();
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (typeof parsed.detail === "string") return parsed.detail;
      for (const [field, value] of Object.entries(parsed)) {
        if (Array.isArray(value) && value.length > 0) return `${field}: ${String(value[0])}`;
        if (typeof value === "string") return `${field}: ${value}`;
      }
    } catch { return raw; }
    return raw;
  }
  return "Failed to load customer profile.";
}

const inputCls = "w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 transition";

export default function CustomerProfilePage() {
  const { logout, isLoggingOut } = useLogout();
  const [data, setData] = useState<CustomerProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");

  const [kycDocs, setKycDocs] = useState<CustomerKycDocumentRecord[]>([]);
  const [kycStatus, setKycStatus] = useState<string>("");
  const [kycDocType, setKycDocType] = useState("AADHAAR");
  const [kycFile, setKycFile] = useState<File | null>(null);
  const [kycSubmitting, setKycSubmitting] = useState(false);
  const [kycError, setKycError] = useState<string | null>(null);
  const [kycSuccess, setKycSuccess] = useState(false);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoMsg, setPhotoMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [referrals, setReferrals] = useState<CustomerReferralRecord[]>([]);

  const [newUsername, setNewUsername] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameMsg, setUsernameMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  function hydrate(payload: CustomerProfileResponse) {
    setData(payload);
    setName(payload.name);
    setPhone(payload.phone);
    setEmail(payload.email || "");
    setAddress(payload.address || "");
    setCity(payload.city || "");
    const raw = payload as unknown as Record<string, unknown>;
    if (raw["profile_photo_url"]) setPhotoUrl(String(raw["profile_photo_url"]));
    if (payload.kyc_status) setKycStatus(payload.kyc_status);
  }

  const loadPage = useCallback(async () => {
    setLoading(true);
    try {
      const [profileResult, kycResult, referralResult] = await Promise.allSettled([
        getCustomerProfile(),
        listCustomerKycDocuments(),
        listCustomerReferrals(),
      ]);
      if (profileResult.status === "rejected") throw profileResult.reason;
      hydrate(profileResult.value);
      setError(null);
      if (kycResult.status === "fulfilled") {
        setKycDocs(kycResult.value.results);
        setKycStatus(kycResult.value.kyc_status);
      }
      if (referralResult.status === "fulfilled") setReferrals(referralResult.value.results);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadPage(); }, [loadPage]);

  async function handlePhotoUpload(file: File) {
    setPhotoUploading(true);
    setPhotoMsg(null);
    try {
      const result = await uploadCustomerPhoto(file);
      setPhotoUrl(result.photo_url);
      setPhotoMsg({ type: "success", text: "Profile photo updated." });
    } catch (err) {
      setPhotoMsg({ type: "error", text: toErrorMessage(err) });
    } finally {
      setPhotoUploading(false);
    }
  }

  async function handleKycSubmit() {
    if (!kycFile) { setKycError("Please select a document file."); return; }
    setKycSubmitting(true);
    setKycError(null);
    setKycSuccess(false);
    try {
      const result = await submitCustomerKycDocument({ document_type: kycDocType, file: kycFile, notes: undefined });
      setKycStatus(result.kyc_status);
      setKycDocs((prev) => [result.document, ...prev]);
      setKycSuccess(true);
      setKycFile(null);
    } catch (err) {
      setKycError(toErrorMessage(err));
    } finally {
      setKycSubmitting(false);
    }
  }

  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);
    setError(null);
    try {
      const payload = await updateCustomerProfile({ name: name.trim(), phone: phone.trim(), email: email.trim(), address: address.trim(), city: city.trim() });
      hydrate(payload);
      setSaveSuccess(true);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleUsernameChange(e: React.FormEvent) {
    e.preventDefault();
    setUsernameSaving(true);
    setUsernameMsg(null);
    try {
      const response = await changeCustomerUsername({ new_username: newUsername.trim(), current_password: currentPassword });
      if (response.changed && response.requires_relogin) {
        setUsernameMsg({ type: "success", text: "Username changed. Please sign in again." });
        setCurrentPassword("");
        setTimeout(() => void logout(), 1200);
        return;
      }
      setUsernameMsg({ type: "success", text: "Username updated." });
      setCurrentPassword("");
      await loadPage();
    } catch (err) {
      setUsernameMsg({ type: "error", text: toErrorMessage(err) });
    } finally {
      setUsernameSaving(false);
    }
  }

  return (
    <CustomerPageShell
      title="My Profile"
      subtitle="Manage your account details and identity"
      backHref="/customer"
      backLabel="Dashboard"
      actions={
        <button
          type="button"
          onClick={() => void loadPage()}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      }
    >
      {loading ? <ERPLoadingState label="Loading profile…" /> : null}
      {!loading && error && !data ? (
        <ERPErrorState title="Unable to load profile" description={error} onRetry={() => void loadPage()} />
      ) : null}

      {!loading && data ? (
        <>
          {/* Stats */}
          <CPageStats>
            <CPageStat label="Active" value={data.summary.active_subscriptions ?? 0} tone="success" />
            <CPageStat label="Total" value={data.summary.total_subscriptions ?? 0} />
            <CPageStat label="Won" value={data.summary.won_subscriptions ?? 0} tone={(data.summary.won_subscriptions ?? 0) > 0 ? "info" : "default"} />
            <CPageStat label="Paid" value={formatRupee(data.summary.total_paid_amount ?? 0)} tone="success" />
          </CPageStats>

          {/* Quick links */}
          <CPageSection>
            <div className="grid grid-cols-2 gap-2">
              {[
                { href: "/customer/subscriptions", label: "Subscriptions" },
                { href: "/customer/payments", label: "Payments" },
                { href: "/customer/support", label: "Support" },
                { href: "/customer/subscription-requests", label: "New Request" },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex h-10 items-center justify-center rounded-xl border border-border bg-card text-xs font-semibold text-foreground hover:bg-muted transition active:scale-95"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </CPageSection>

          {/* Profile photo */}
          <CPageSection title="Profile Photo">
            <CPageCard>
              <div className="flex items-center gap-4">
                <Avatar className="size-16 rounded-full border border-border">
                  {photoUrl ? <AvatarImage src={photoUrl} alt="Profile" className="rounded-full object-cover" /> : null}
                  <AvatarFallback className="rounded-full">{initialsFromDisplayName(name || data.name || "?")}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="text-sm text-foreground font-semibold">{data.name}</p>
                  <p className="text-xs text-muted-foreground">{data.username}</p>
                </div>
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={photoUploading}
                  className="flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                >
                  <Camera className="size-3.5" />
                  {photoUploading ? "…" : "Change"}
                </button>
              </div>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void handlePhotoUpload(f); }}
              />
              {photoMsg ? (
                <p className={`mt-2 text-xs ${photoMsg.type === "success" ? "text-emerald-600" : "text-red-600"}`}>{photoMsg.text}</p>
              ) : null}
            </CPageCard>
          </CPageSection>

          {/* Contact details form */}
          <CPageSection title="Contact Details">
            <CPageCard>
              {error ? <div className="mb-3 rounded-xl bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700">{error}</div> : null}
              {saveSuccess ? <div className="mb-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-xs text-emerald-700">Profile updated successfully.</div> : null}
              <form onSubmit={(e) => void handleProfileSave(e)} className="space-y-3">
                {[
                  { id: "name", label: "Full Name *", value: name, setter: setName, type: "text" },
                  { id: "phone", label: "Phone *", value: phone, setter: setPhone, type: "tel" },
                  { id: "email", label: "Email", value: email, setter: setEmail, type: "email" },
                  { id: "city", label: "City", value: city, setter: setCity, type: "text" },
                ].map(({ id, label, value, setter, type }) => (
                  <div key={id}>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5">{label}</label>
                    <input id={id} type={type} value={value} onChange={(e) => setter(e.target.value)} className={inputCls} />
                  </div>
                ))}
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Address</label>
                  <textarea
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    rows={3}
                    className={`${inputCls} resize-none`}
                  />
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground transition active:scale-95 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              </form>
            </CPageCard>
          </CPageSection>

          {/* Change username */}
          <CPageSection title="Change Username">
            <CPageCard>
              {usernameMsg ? (
                <div className={`mb-3 rounded-xl px-3 py-2 text-xs ${usernameMsg.type === "success" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30" : "bg-red-50 text-red-700 dark:bg-red-950/30"}`}>
                  {usernameMsg.text}
                </div>
              ) : null}
              <form onSubmit={(e) => void handleUsernameChange(e)} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">New Username</label>
                  <input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} className={inputCls} placeholder="letters, numbers, dots, underscores" required />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Current Password</label>
                  <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={inputCls} required />
                </div>
                <button
                  type="submit"
                  disabled={usernameSaving || isLoggingOut}
                  className="w-full rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground transition active:scale-95 disabled:opacity-50"
                >
                  {usernameSaving ? "Updating…" : "Change Username"}
                </button>
              </form>
            </CPageCard>
          </CPageSection>

          {/* KYC */}
          <CPageSection title="KYC Verification">
            <CPageCard>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-sm text-muted-foreground">Status:</span>
                <StatusBadge status={kycStatus || data.kyc_status || "PENDING"} size="md" />
              </div>

              {(kycStatus === "PENDING" || kycStatus === "REJECTED" || !kycStatus) ? (
                <div className="space-y-3">
                  {kycError ? <div className="rounded-xl bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700">{kycError}</div> : null}
                  {kycSuccess ? <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-xs text-emerald-700">Document submitted for review.</div> : null}
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Document Type</label>
                    <select value={kycDocType} onChange={(e) => setKycDocType(e.target.value)} className={inputCls}>
                      {[["AADHAAR", "Aadhaar Card"], ["PAN", "PAN Card"], ["PASSPORT", "Passport"], ["DRIVING_LICENSE", "Driving Licence"], ["VOTER_ID", "Voter ID"]].map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Document File *</label>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={(e) => setKycFile(e.target.files?.[0] ?? null)}
                      className="w-full text-sm text-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-primary-foreground"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleKycSubmit()}
                    disabled={kycSubmitting || !kycFile}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground transition active:scale-95 disabled:opacity-50"
                  >
                    <FileText className="size-4" />
                    {kycSubmitting ? "Submitting…" : "Submit for Review"}
                  </button>
                </div>
              ) : kycStatus === "APPROVED" || kycStatus === "VERIFIED" ? (
                <p className="text-sm text-emerald-600 dark:text-emerald-400">Your KYC is verified. No further action needed.</p>
              ) : null}

              {kycDocs.length > 0 ? (
                <div className="mt-4 space-y-2 border-t border-border pt-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Submitted Documents</p>
                  {kycDocs.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm">
                      <div>
                        <div className="font-semibold">{doc.document_type}</div>
                        <div className="text-xs text-muted-foreground">{doc.original_filename || "Unnamed"}</div>
                      </div>
                      <StatusBadge status={doc.status} size="sm" />
                    </div>
                  ))}
                </div>
              ) : null}
            </CPageCard>
          </CPageSection>

          {/* Referrals */}
          {referrals.length > 0 ? (
            <CPageSection
              title="Referrals"
              action={<Link href="/customer/referrals" className="text-xs font-semibold text-primary">View all</Link>}
            >
              <div className="space-y-2">
                {referrals.slice(0, 5).map((r) => (
                  <CPageCard key={r.id}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">{r.referred_name || "Unknown"}</div>
                        {r.referred_phone ? <div className="text-xs text-muted-foreground">{r.referred_phone}</div> : null}
                      </div>
                      <div className="text-xs">
                        {r.commission_approved ? (
                          <span className="font-semibold text-emerald-600">₹{r.commission_amount} approved</span>
                        ) : (
                          <span className="text-muted-foreground">Pending</span>
                        )}
                      </div>
                    </div>
                  </CPageCard>
                ))}
                <Link
                  href="/customer/referrals"
                  className="flex items-center justify-center gap-1.5 rounded-2xl border border-border bg-background py-3 text-xs font-semibold text-foreground hover:bg-muted"
                >
                  <GitBranch className="size-3.5" />
                  View All Referrals
                </Link>
              </div>
            </CPageSection>
          ) : null}
        </>
      ) : null}
    </CustomerPageShell>
  );
}
