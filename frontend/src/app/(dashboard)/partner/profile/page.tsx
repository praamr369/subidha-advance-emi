"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  FileText,
  KeyRound,
  LogOut,
  Shield,
  User,
  Eye,
  EyeOff,
  Building2,
  IndianRupee,
  BadgeCheck,
  Phone,
  Mail,
  MapPin,
  Loader2,
} from "lucide-react";
import Link from "next/link";

import KycDocumentPanel from "@/components/kyc/KycDocumentPanel";
import { changePartnerPassword, changePartnerUsername } from "@/services/partner";
import { useLogout } from "@/hooks/useLogout";

import { apiFetch } from "@/lib/api";

type PartnerProfileInfo = {
  name?: string;
  code?: string;
  phone?: string;
  email?: string;
  address?: string;
  kyc_status?: string;
  admin_name?: string;
  admin_phone?: string;
  admin_email?: string;
  commission_rate?: string | number;
  commission_type?: string;
  settlement_cycle?: string;
  last_settlement_date?: string;
  last_settlement_amount?: string | number;
  total_earned?: string | number;
  total_pending?: string | number;
  contract_start?: string;
  contract_end?: string;
  contract_status?: string;
};

function fmtDate(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtMoney(v?: string | number | null) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);
}

async function fetchPartnerProfileInfo(): Promise<PartnerProfileInfo> {
  try {
    return await apiFetch<PartnerProfileInfo>("/api/v1/partner/profile-info/");
  } catch {
    return {};
  }
}

function ReadonlyField({ label, value, icon: Icon }: { label: string; value?: string | null; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3">
      {Icon ? <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> : null}
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-0.5 text-sm font-semibold text-foreground break-words">{value || "—"}</div>
      </div>
    </div>
  );
}

type NoticeTone = "success" | "error" | "info";

function Alert({ tone, children }: { tone: NoticeTone; children: React.ReactNode }) {
  const styles: Record<NoticeTone, string> = {
    success: "bg-green-50 border-green-200 text-green-800 dark:bg-green-950/40 dark:border-green-800 dark:text-green-300",
    error:   "bg-red-50 border-red-200 text-red-800 dark:bg-red-950/40 dark:border-red-800 dark:text-red-300",
    info:    "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-300",
  };
  const Icon = tone === "success" ? CheckCircle2 : tone === "error" ? AlertCircle : Shield;
  return (
    <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3.5 text-sm font-medium ${styles[tone]}`}>
      <Icon className="mt-0.5 size-5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function InputField({
  id, label, type = "text", value, onChange, placeholder, required, autoComplete, hint,
}: {
  id: string; label: string; type?: string; value: string;
  onChange: (v: string) => void; placeholder?: string;
  required?: boolean; autoComplete?: string; hint?: string;
}) {
  const [show, setShow] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword ? (show ? "text" : "password") : type;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-semibold text-foreground">
        {label}{required ? <span className="ml-1 text-red-500">*</span> : null}
      </label>
      <div className="relative">
        <input
          id={id}
          type={inputType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          autoComplete={autoComplete}
          className="h-12 w-full rounded-2xl border border-border bg-background px-4 text-base outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
          </button>
        ) : null}
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function SectionCard({ id, icon, title, children }: {
  id?: string; icon: React.ReactNode; title: string; children: React.ReactNode;
}) {
  return (
    <section id={id} className="rounded-3xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {icon}
        </div>
        <h2 className="text-base font-bold text-foreground">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export default function PartnerProfilePage() {
  const { logout, isLoggingOut } = useLogout();

  const [profileInfo, setProfileInfo] = useState<PartnerProfileInfo | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    fetchPartnerProfileInfo()
      .then((data) => setProfileInfo(data))
      .catch(() => setProfileInfo({}))
      .finally(() => setProfileLoading(false));
  }, []);

  // password change
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState<{ tone: NoticeTone; msg: string } | null>(null);

  // username change
  const [newUsername, setNewUsername] = useState("");
  const [currentPasswordForUsername, setCurrentPasswordForUsername] = useState("");
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameNotice, setUsernameNotice] = useState<{ tone: NoticeTone; msg: string } | null>(null);

  const handlePasswordSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (newPassword !== confirmPassword) {
        setPasswordNotice({ tone: "error", msg: "New passwords do not match. Please type them again." });
        return;
      }
      if (newPassword.length < 8) {
        setPasswordNotice({ tone: "error", msg: "Password must be at least 8 characters long." });
        return;
      }
      setPasswordSaving(true);
      setPasswordNotice(null);
      try {
        const res = await changePartnerPassword({
          current_password: currentPassword,
          new_password: newPassword,
          confirm_password: confirmPassword,
        });
        if (res.requires_relogin) {
          setPasswordNotice({
            tone: "success",
            msg: "Password changed! You will be signed out now. Please sign in with your new password.",
          });
          setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
          setTimeout(() => void logout(), 2000);
          return;
        }
        setPasswordNotice({ tone: "success", msg: res.detail || "Password changed successfully!" });
        setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      } catch (err) {
        setPasswordNotice({
          tone: "error",
          msg: err instanceof Error ? err.message : "Could not change password. Please try again.",
        });
      } finally {
        setPasswordSaving(false);
      }
    },
    [confirmPassword, currentPassword, logout, newPassword]
  );

  const handleUsernameSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setUsernameSaving(true);
      setUsernameNotice(null);
      try {
        const res = await changePartnerUsername({
          new_username: newUsername.trim(),
          current_password: currentPasswordForUsername,
        });
        if (res.changed && res.requires_relogin) {
          setUsernameNotice({
            tone: "success",
            msg: "Login name changed! You will be signed out. Please sign in with your new login name.",
          });
          setNewUsername(""); setCurrentPasswordForUsername("");
          setTimeout(() => void logout(), 2000);
          return;
        }
        setUsernameNotice({ tone: "success", msg: "Login name updated successfully!" });
        setNewUsername(""); setCurrentPasswordForUsername("");
      } catch (err) {
        setUsernameNotice({
          tone: "error",
          msg: err instanceof Error ? err.message : "Could not update login name. Please try again.",
        });
      } finally {
        setUsernameSaving(false);
      }
    },
    [currentPasswordForUsername, logout, newUsername]
  );

  return (
    <div className="mx-auto w-full max-w-2xl px-3 py-5 sm:px-4 sm:py-6 lg:px-6 lg:py-8">

      {/* Page header */}
      <div className="mb-6">
        <Link
          href="/partner"
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          ← Back to Home
        </Link>
        <h1 className="text-2xl font-bold text-foreground">My Account</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Update your password, login name, documents, and agreements
        </p>
      </div>

      {/* Quick nav pills */}
      <div className="mb-6 flex flex-wrap gap-2">
        {[
          { label: "Change Password", href: "#password", icon: <KeyRound className="size-3.5" /> },
          { label: "Change Login Name", href: "#username", icon: <User className="size-3.5" /> },
          { label: "My Documents", href: "#kyc", icon: <Shield className="size-3.5" /> },
          { label: "My Agreements", href: "#contracts", icon: <FileText className="size-3.5" /> },
          { label: "My Profile Info", href: "#profile-info", icon: <BadgeCheck className="size-3.5" /> },
          { label: "My Contract", href: "#contract-details", icon: <IndianRupee className="size-3.5" /> },
        ].map(({ label, href, icon }) => (
          <a
            key={href}
            href={href}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted active:scale-95"
          >
            {icon}
            {label}
          </a>
        ))}
      </div>

      <div className="space-y-4">

        {/* ── Change Password (most important — shown first) ── */}
        <SectionCard id="password" icon={<KeyRound className="size-5" />} title="Change Password">
          <p className="mb-4 text-sm text-muted-foreground">
            Enter your current password, then choose a new one. You will be signed out after the change.
          </p>

          {passwordNotice ? (
            <div className="mb-4">
              <Alert tone={passwordNotice.tone}>{passwordNotice.msg}</Alert>
            </div>
          ) : null}

          <form onSubmit={(e) => void handlePasswordSubmit(e)} className="space-y-4">
            <InputField
              id="current-password"
              label="Current Password"
              type="password"
              value={currentPassword}
              onChange={setCurrentPassword}
              placeholder="Enter your current password"
              required
              autoComplete="current-password"
            />
            <InputField
              id="new-password"
              label="New Password"
              type="password"
              value={newPassword}
              onChange={setNewPassword}
              placeholder="At least 8 characters"
              required
              autoComplete="new-password"
              hint="Minimum 8 characters. Use letters and numbers for a stronger password."
            />
            <InputField
              id="confirm-password"
              label="Confirm New Password"
              type="password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              placeholder="Type the new password again"
              required
              autoComplete="new-password"
            />
            <button
              type="submit"
              disabled={passwordSaving || isLoggingOut || !currentPassword || !newPassword || !confirmPassword}
              className="flex h-12 w-full items-center justify-center rounded-2xl bg-primary text-base font-bold text-primary-foreground transition hover:bg-primary/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {passwordSaving ? "Saving…" : "Save New Password"}
            </button>
          </form>
        </SectionCard>

        {/* ── Change Login Name ── */}
        <SectionCard id="username" icon={<User className="size-5" />} title="Change Login Name">
          <p className="mb-4 text-sm text-muted-foreground">
            This changes the name you use to log in. Your customers, commissions, and history will not change.
          </p>

          {usernameNotice ? (
            <div className="mb-4">
              <Alert tone={usernameNotice.tone}>{usernameNotice.msg}</Alert>
            </div>
          ) : null}

          <form onSubmit={(e) => void handleUsernameSubmit(e)} className="space-y-4">
            <InputField
              id="new-username"
              label="New Login Name"
              value={newUsername}
              onChange={setNewUsername}
              placeholder="e.g. rahul_partner"
              required
              autoComplete="username"
              hint="Use letters, numbers, and underscores only. No spaces."
            />
            <InputField
              id="username-current-password"
              label="Your Current Password"
              type="password"
              value={currentPasswordForUsername}
              onChange={setCurrentPasswordForUsername}
              placeholder="Enter your password to confirm"
              required
              autoComplete="current-password"
            />
            <button
              type="submit"
              disabled={usernameSaving || isLoggingOut || !newUsername.trim() || !currentPasswordForUsername}
              className="flex h-12 w-full items-center justify-center rounded-2xl border border-border bg-background text-base font-semibold text-foreground transition hover:bg-muted active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {usernameSaving ? "Saving…" : "Save New Login Name"}
            </button>
          </form>
        </SectionCard>

        {/* ── KYC / Identity Documents ── */}
        <SectionCard id="kyc" icon={<Shield className="size-5" />} title="My Identity Documents">
          <p className="mb-4 text-sm text-muted-foreground">
            Upload your Aadhaar, PAN, or any document required by your admin. These are kept securely.
          </p>
          <KycDocumentPanel mode="self" portal="partner" />
        </SectionCard>

        {/* ── Agreements / Contracts ── */}
        <SectionCard id="contracts" icon={<FileText className="size-5" />} title="My Agreements">
          <p className="mb-4 text-sm text-muted-foreground">
            View or request changes to your partner agreement. All changes go through admin review.
          </p>
          <div className="space-y-2">
            <Link
              href="/partner/contract-amendments"
              className="flex min-h-14 items-center justify-between rounded-2xl border border-border bg-background px-4 py-3 transition hover:bg-muted active:scale-[0.99]"
            >
              <div>
                <div className="text-sm font-semibold text-foreground">View My Agreements</div>
                <div className="text-xs text-muted-foreground">See your existing partner agreements</div>
              </div>
              <ChevronRight className="size-5 text-muted-foreground" />
            </Link>
            <Link
              href="/partner/contract-amendments/new"
              className="flex min-h-14 items-center justify-between rounded-2xl border border-border bg-background px-4 py-3 transition hover:bg-muted active:scale-[0.99]"
            >
              <div>
                <div className="text-sm font-semibold text-foreground">Request a Change</div>
                <div className="text-xs text-muted-foreground">Ask admin to update your agreement</div>
              </div>
              <ChevronRight className="size-5 text-muted-foreground" />
            </Link>
          </div>
        </SectionCard>

        {/* ── My Profile Info (read-only) ── */}
        <SectionCard id="profile-info" icon={<BadgeCheck className="size-5" />} title="My Profile Info">
          <p className="mb-4 text-sm text-muted-foreground">
            Your registered details on file with admin. Contact admin to update any of this.
          </p>
          {profileLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="size-4 animate-spin" /> Loading your profile…
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <ReadonlyField label="Partner Name" value={profileInfo?.name} icon={User} />
              <ReadonlyField label="Partner Code" value={profileInfo?.code} icon={BadgeCheck} />
              <ReadonlyField label="Phone Number" value={profileInfo?.phone} icon={Phone} />
              <ReadonlyField label="Email" value={profileInfo?.email} icon={Mail} />
              <ReadonlyField label="KYC Status" value={profileInfo?.kyc_status} icon={Shield} />
              <ReadonlyField label="Address" value={profileInfo?.address} icon={MapPin} />
            </div>
          )}
          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 dark:border-blue-900 dark:bg-blue-950/20">
            <p className="text-xs text-blue-800 dark:text-blue-300">
              To update your details or upgrade your KYC, contact your admin or use{" "}
              <Link href="/partner/service-desk" className="font-semibold underline">Help &amp; Service Desk</Link>.
            </p>
          </div>
        </SectionCard>

        {/* ── My Contract Details (read-only) ── */}
        <SectionCard id="contract-details" icon={<IndianRupee className="size-5" />} title="My Contract &amp; Commission">
          <p className="mb-4 text-sm text-muted-foreground">
            Your commission contract details and settlement history with admin.
          </p>
          {profileLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="size-4 animate-spin" /> Loading contract details…
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">Admin Contact</h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <ReadonlyField label="Admin Name" value={profileInfo?.admin_name} icon={Building2} />
                  <ReadonlyField label="Admin Phone" value={profileInfo?.admin_phone} icon={Phone} />
                  <ReadonlyField label="Admin Email" value={profileInfo?.admin_email} icon={Mail} />
                </div>
              </div>
              <div>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">Commission Contract</h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <ReadonlyField label="Commission Rate" value={profileInfo?.commission_rate !== undefined ? `${profileInfo.commission_rate}%` : undefined} icon={IndianRupee} />
                  <ReadonlyField label="Commission Type" value={profileInfo?.commission_type} icon={BadgeCheck} />
                  <ReadonlyField label="Settlement Cycle" value={profileInfo?.settlement_cycle} icon={FileText} />
                  <ReadonlyField label="Contract Status" value={profileInfo?.contract_status} icon={Shield} />
                  <ReadonlyField label="Contract Start" value={fmtDate(profileInfo?.contract_start)} />
                  <ReadonlyField label="Contract End" value={fmtDate(profileInfo?.contract_end)} />
                </div>
              </div>
              <div>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">Settlement Summary</h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <ReadonlyField label="Total Commission Earned" value={fmtMoney(profileInfo?.total_earned)} icon={IndianRupee} />
                  <ReadonlyField label="Pending to Settle" value={fmtMoney(profileInfo?.total_pending)} icon={IndianRupee} />
                  <ReadonlyField label="Last Settlement Date" value={fmtDate(profileInfo?.last_settlement_date)} />
                  <ReadonlyField label="Last Settlement Amount" value={fmtMoney(profileInfo?.last_settlement_amount)} icon={IndianRupee} />
                </div>
              </div>
            </div>
          )}
          <div className="mt-4">
            <Link
              href="/partner/commissions"
              className="flex min-h-12 items-center justify-between rounded-2xl border border-border bg-muted/40 px-4 py-3 transition hover:bg-muted active:scale-[0.99]"
            >
              <div>
                <div className="text-sm font-semibold text-foreground">View Full Commission Ledger</div>
                <div className="text-xs text-muted-foreground">See all earned commissions and payouts</div>
              </div>
              <ChevronRight className="size-5 text-muted-foreground" />
            </Link>
          </div>
        </SectionCard>

        {/* ── Sign Out ── */}
        <div className="rounded-3xl border border-red-200 bg-red-50 p-5 dark:border-red-900 dark:bg-red-950/20">
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400">
              <LogOut className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-red-800 dark:text-red-300">Sign Out</h2>
              <p className="text-sm text-red-700/80 dark:text-red-400/80">Sign out of your account on this device</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            disabled={isLoggingOut}
            className="mt-4 flex h-12 w-full items-center justify-center rounded-2xl border border-red-300 bg-white text-base font-semibold text-red-700 transition hover:bg-red-50 active:scale-[0.98] disabled:opacity-60 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300"
          >
            {isLoggingOut ? "Signing out…" : "Sign Out"}
          </button>
        </div>

      </div>
    </div>
  );
}
