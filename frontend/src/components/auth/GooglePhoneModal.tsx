"use client";

import { useState, type FormEvent } from "react";
import { Phone, ShieldCheck, User, Mail, ArrowRight, Loader2, X } from "lucide-react";
import ActionButton from "@/components/ui/ActionButton";

interface GooglePhoneModalProps {
  isOpen: boolean;
  name?: string;
  email?: string;
  idToken: string;
  onSubmitPhone: (phone: string) => Promise<void>;
  onClose: () => void;
  submitting: boolean;
  error?: string | null;
}

export default function GooglePhoneModal({
  isOpen,
  name,
  email,
  idToken,
  onSubmitPhone,
  onClose,
  submitting,
  error,
}: GooglePhoneModalProps) {
  const [phone, setPhone] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLocalError(null);

    const digitsOnly = phone.replace(/\D/g, "");
    if (digitsOnly.length < 10 || digitsOnly.length > 15) {
      setLocalError("Please enter a valid 10-digit mobile phone number.");
      return;
    }

    try {
      await onSubmitPhone(digitsOnly.length === 10 ? digitsOnly : `+${digitsOnly}`);
    } catch (err) {
      if (err instanceof Error) {
        setLocalError(err.message);
      } else {
        setLocalError("Failed to save phone number. Please try again.");
      }
    }
  }

  const displayError = error || localError;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in">
      <div
        className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl transition-all"
        role="dialog"
        aria-modal="true"
        aria-labelledby="google-phone-title"
      >
        <button
          onClick={onClose}
          disabled={submitting}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-muted-foreground hover:text-foreground transition disabled:opacity-50"
          aria-label="Close dialog"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h3 id="google-phone-title" className="text-lg font-bold text-foreground">
              Connect Mobile Phone
            </h3>
            <p className="text-xs text-muted-foreground">Required for verified customer KYC & SFEMI access</p>
          </div>
        </div>

        {/* Google User Info Preview */}
        {(name || email) && (
          <div className="mb-5 rounded-xl border border-border/60 bg-muted/30 p-3 text-xs space-y-1">
            {name && (
              <div className="flex items-center gap-2 text-foreground font-medium">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{name}</span>
              </div>
            )}
            {email && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="h-3.5 w-3.5" />
                <span>{email}</span>
              </div>
            )}
          </div>
        )}

        <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
          Please provide your mobile phone number. This links your Google login to any existing retail records,
          SFEMI Advance EMI subscriptions, and ensures fast KYC verification.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="customer-phone" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Mobile Phone Number
            </label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-sm font-medium text-muted-foreground border-r border-border pr-2">
                <span>+91</span>
              </div>
              <input
                id="customer-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="98765 43210"
                maxLength={15}
                required
                autoFocus
                disabled={submitting}
                className="h-12 w-full rounded-xl border border-border bg-background pl-16 pr-3 text-sm font-medium text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:border-[var(--ring)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]/35"
              />
            </div>
          </div>

          {displayError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {displayError}
            </div>
          )}

          <div className="pt-2 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="h-11 flex-1 rounded-xl border border-border bg-background text-sm font-semibold text-foreground transition hover:bg-muted disabled:opacity-50"
            >
              Cancel
            </button>
            <ActionButton
              type="submit"
              disabled={submitting || !phone.trim()}
              className="h-11 flex-1 public-action-primary justify-center disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </ActionButton>
          </div>
        </form>
      </div>
    </div>
  );
}
