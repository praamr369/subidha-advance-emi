"use client";

/**
 * CustomerSelector
 *
 * Phone-first live customer search with inline quick-create.
 * Used in: admin subscription create, admin direct sale create,
 *          cashier payment collection, partner subscription/customer create.
 *
 * Behaviour:
 * - Search by phone (primary) or name/code (secondary)
 * - If phone is found exactly → surface existing customer + show duplicate warning
 * - If phone is not found → show quick-create inline form
 * - Admin/partner can choose to select the existing customer or proceed to create
 * - On create → calls POST /api/v1/customers/create/
 * - On select → calls the onSelect callback with the CustomerRecord
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Search,
  UserCheck,
  UserPlus,
  AlertTriangle,
  X,
  Phone,
  Mail,
  MapPin,
  Building2,
  ShieldCheck,
  Users,
  CheckCircle2,
} from "lucide-react";

import type { CustomerRecord } from "@/services/customers";
import {
  searchByPhone,
  searchCustomersShared,
  createCustomerQuick,
} from "@/services/customers";
import StatusBadge from "@/components/ui/status-badge";
import PincodeField from "@/components/forms/PincodeField";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SelectorMode = "admin" | "partner";

type CustomerSelectorProps = {
  onSelect: (customer: CustomerRecord) => void;
  onClear?: () => void;
  selected?: CustomerRecord | null;
  mode?: SelectorMode;
  /** When true, selector renders inline in a compact layout (e.g., inside a form row) */
  compact?: boolean;
  placeholder?: string;
  /** Disable all interactions */
  disabled?: boolean;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const raw = error.message.trim();
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (typeof parsed.detail === "string") return parsed.detail;
      const first = Object.values(parsed)[0];
      if (Array.isArray(first) && first.length > 0) return String(first[0]);
    } catch {
      return raw;
    }
    return raw;
  }
  return "Something went wrong.";
}



// ---------------------------------------------------------------------------
// Sub-component: Result card
// ---------------------------------------------------------------------------

function CustomerResultCard({
  customer,
  onSelect,
  isExactMatch,
}: {
  customer: CustomerRecord;
  onSelect: () => void;
  isExactMatch: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 transition-colors hover:border-ring hover:bg-accent/30 cursor-pointer ${
        isExactMatch ? "border-amber-400 bg-amber-50/30" : "border-border"
      }`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect();
      }}
    >
      {isExactMatch && (
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5" />
          Existing customer found with this phone
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{customer.name}</span>
            {customer.kyc_status && (
              <StatusBadge status={customer.kyc_status} size="sm" />
            )}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Phone className="h-3 w-3" />
              {customer.phone}
            </span>
            {customer.email && (
              <span className="flex items-center gap-1">
                <Mail className="h-3 w-3" />
                {customer.email}
              </span>
            )}
            {customer.city && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {customer.city}
              </span>
            )}
          </div>
          {customer.customer_code && (
            <div className="text-xs text-muted-foreground">
              Code: {customer.customer_code}
            </div>
          )}
        </div>
        <div className="shrink-0">
          <span className="rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            Select
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CustomerSelector({
  onSelect,
  onClear,
  selected,
  mode = "admin",
  // compact is part of the public API for future use; layout not yet applied
  compact: _c,
  placeholder = "Search by phone, name, or customer code…",
  disabled = false,
}: CustomerSelectorProps) {
  void _c;
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<CustomerRecord[]>([]);
  const [exactMatch, setExactMatch] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Inline Customer Onboarding Workbench state
  const [showCreate, setShowCreate] = useState(false);
  const [createMode, setCreateMode] = useState<"workbench" | "quick">("workbench");
  const [activeTab, setActiveTab] = useState<"identity" | "address" | "family" | "preferences">("identity");

  // 1. Identity & Contact
  const [createName, setCreateName] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createWhatsappPhone, setCreateWhatsappPhone] = useState("");
  const [sameAsPhone, setSameAsPhone] = useState(true);
  const [createEmail, setCreateEmail] = useState("");
  const [customerCode, setCustomerCode] = useState("");

  // 2. Personal & Family
  const [guardianName, setGuardianName] = useState("");
  const [gender, setGender] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");

  // 3. Location & Premises
  const [createAddress, setCreateAddress] = useState("");
  const [landmark, setLandmark] = useState("");
  const [createPincode, setCreatePincode] = useState("");
  const [createCity, setCreateCity] = useState("Asansol");
  const [createDistrict, setCreateDistrict] = useState("Paschim Bardhaman");
  const [createState, setCreateState] = useState("West Bengal");
  const [addressType, setAddressType] = useState("HOME");

  // 4. Reference & Nominee
  const [nomineeName, setNomineeName] = useState("");
  const [nomineeRelation, setNomineeRelation] = useState("Spouse");
  const [nomineePhone, setNomineePhone] = useState("");

  // 5. Work & KYC Preferences
  const [occupation, setOccupation] = useState("");
  const [employerName, setEmployerName] = useState("");
  const [whatsappOptedIn, setWhatsappOptedIn] = useState(true);
  const [preferredReminderChannel, setPreferredReminderChannel] = useState("WHATSAPP");
  const [idDocType, setIdDocType] = useState("AADHAAR");
  const [idNumber, setIdNumber] = useState("");
  const [initialKycStatus, setInitialKycStatus] = useState("PENDING");

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-fill create phone from search query when it looks like a phone number
  useEffect(() => {
    if (!showCreate) return;
    const looksLikePhone = /^\d{8,}$/.test(query.replace(/\D/g, ""));
    if (looksLikePhone) {
      setCreatePhone(query.trim());
      if (sameAsPhone) {
        setCreateWhatsappPhone(query.trim());
      }
    }
  }, [showCreate, query, sameAsPhone]);

  const runSearch = useCallback(async (term: string) => {
    if (!term.trim()) {
      setResults([]);
      setExactMatch(false);
      setSearchError(null);
      return;
    }

    setSearching(true);
    setSearchError(null);

    try {
      const looksLikePhone = /^\+?\d[\d\s\-()]{6,}$/.test(term.trim());
      const response = looksLikePhone
        ? await searchByPhone(term)
        : await searchCustomersShared(term);
      setResults(response.results);
      setExactMatch(response.exact_match);
      setSearchError(null);
    } catch (err) {
      setSearchError(toErrorMessage(err));
      setResults([]);
      setExactMatch(false);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleInputChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setResults([]);
      setExactMatch(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      void runSearch(value);
    }, 350);
  };

  const handleSelect = (customer: CustomerRecord) => {
    setQuery("");
    setResults([]);
    setExactMatch(false);
    setShowCreate(false);
    onSelect(customer);
  };

  const handleClear = () => {
    setQuery("");
    setResults([]);
    setExactMatch(false);
    setShowCreate(false);
    onClear?.();
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleShowCreate = () => {
    setShowCreate(true);
    setCreateMode("workbench");
    setActiveTab("identity");
    setCreateName("");
    const cleanedDigits = query.replace(/\D/g, "");
    const initialP = cleanedDigits.length >= 8 ? query.trim() : "";
    setCreatePhone(initialP);
    setCreateWhatsappPhone(initialP);
    setSameAsPhone(true);
    setCreateEmail("");
    setCustomerCode("");
    setGuardianName("");
    setGender("");
    setDateOfBirth("");
    setCreateAddress("");
    setLandmark("");
    setCreatePincode("");
    setCreateCity("Asansol");
    setCreateDistrict("Paschim Bardhaman");
    setCreateState("West Bengal");
    setAddressType("HOME");
    setNomineeName("");
    setNomineeRelation("Spouse");
    setNomineePhone("");
    setOccupation("");
    setEmployerName("");
    setWhatsappOptedIn(true);
    setPreferredReminderChannel("WHATSAPP");
    setIdDocType("AADHAAR");
    setIdNumber("");
    setInitialKycStatus("PENDING");
    setCreateError(null);
  };

  const handleCreate = async () => {
    const nameVal = createName.trim();
    const phoneVal = createPhone.trim();
    if (!nameVal || !phoneVal) {
      setCreateError("Name and primary mobile number are required.");
      setActiveTab("identity");
      return;
    }

    setCreating(true);
    setCreateError(null);
    try {
      const addressParts: string[] = [];
      if (createAddress.trim()) {
        addressParts.push(createAddress.trim());
      }
      if (landmark.trim()) {
        addressParts.push(`Landmark: ${landmark.trim()}`);
      }
      if (guardianName.trim()) {
        addressParts.push(`S/O / W/O: ${guardianName.trim()}`);
      }
      if (nomineeName.trim()) {
        addressParts.push(
          `Nominee: ${nomineeName.trim()} (${nomineeRelation || "Relative"}${nomineePhone.trim() ? ", Ph: " + nomineePhone.trim() : ""})`
        );
      }
      if (occupation.trim()) {
        addressParts.push(`Occupation: ${occupation.trim()}${employerName.trim() ? " at " + employerName.trim() : ""}`);
      }
      if (idNumber.trim()) {
        addressParts.push(`${idDocType}: ${idNumber.trim()}`);
      }
      if (addressType && addressType !== "HOME") {
        addressParts.push(`Premises: ${addressType}`);
      }

      const fullAddress = addressParts.join(" | ");

      const response = await createCustomerQuick({
        name: nameVal,
        phone: phoneVal,
        email: createEmail.trim() || undefined,
        address: fullAddress || undefined,
        city: createCity.trim() || undefined,
        district: createDistrict.trim() || undefined,
        state: createState.trim() || undefined,
        pincode: createPincode.trim() || undefined,
        whatsapp_opted_in: whatsappOptedIn,
        preferred_reminder_channel: preferredReminderChannel,
        customer_code: customerCode.trim() || undefined,
        kyc_status: initialKycStatus,
        source: mode === "partner" ? "PARTNER" : "ADMIN",
      });

      if (!response.created && response.customer.id) {
        // Duplicate – surface the existing customer with a warning
        setResults([response.customer]);
        setExactMatch(true);
        setShowCreate(false);
        return;
      }

      handleSelect(response.customer);
    } catch (err) {
      setCreateError(toErrorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  // -------------------------------------------------------------------------
  // Render: selected state
  // -------------------------------------------------------------------------

  if (selected) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50/30 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 shrink-0 text-green-600" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{selected.name}</span>
                {selected.kyc_status && (
                  <StatusBadge status={selected.kyc_status} size="sm" />
                )}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {selected.phone}
                </span>
                {selected.email && (
                  <span className="flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {selected.email}
                  </span>
                )}
              </div>
            </div>
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="shrink-0 rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Clear selected customer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render: search + results
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-3">
      {/* Search input */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="h-11 w-full rounded-xl border border-input bg-background pl-9 pr-4 text-sm outline-none focus:border-ring disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Search customer"
          autoComplete="off"
        />
        {searching && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            Searching…
          </span>
        )}
      </div>

      {/* Search error */}
      {searchError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {searchError}
        </div>
      )}

      {/* Results list */}
      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((customer) => (
            <CustomerResultCard
              key={customer.id}
              customer={customer}
              onSelect={() => handleSelect(customer)}
              isExactMatch={exactMatch && results.length === 1}
            />
          ))}
        </div>
      )}

      {/* No results + quick-create offer */}
      {!searching &&
        query.trim().length >= 3 &&
        results.length === 0 &&
        !showCreate && (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-center">
            <p className="mb-3 text-sm text-muted-foreground">
              No customers found for <strong>{query}</strong>.
            </p>
            <button
              type="button"
              onClick={handleShowCreate}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <UserPlus className="h-4 w-4" />
              Create new customer
            </button>
          </div>
        )}

      {/* Inline Customer Onboarding Workbench */}
      {showCreate && (
        <div className="rounded-2xl border border-primary/25 bg-card p-5 shadow-md space-y-4">
          {/* Workbench Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                  Customer Onboarding Workbench
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                    Full Profile
                  </span>
                </h4>
                <p className="text-xs text-muted-foreground">
                  Record complete customer identity, premises location, family reference, and KYC readiness.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setCreateMode("workbench")}
                  className={`rounded-md px-2.5 py-1 font-medium transition ${
                    createMode === "workbench"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  🏢 Full Workbench
                </button>
                <button
                  type="button"
                  onClick={() => setCreateMode("quick")}
                  className={`rounded-md px-2.5 py-1 font-medium transition ${
                    createMode === "quick"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  ⚡ Fast Feed
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {createError && (
            <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-xs font-medium text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{createError}</span>
            </div>
          )}

          {createMode === "workbench" ? (
            <div className="space-y-4">
              {/* Tab Navigation */}
              <div className="flex flex-wrap gap-1.5 border-b border-border/40 pb-2 text-xs">
                <button
                  type="button"
                  onClick={() => setActiveTab("identity")}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold transition ${
                    activeTab === "identity"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted/40 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  1. Identity &amp; Contact
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("address")}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold transition ${
                    activeTab === "address"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted/40 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <MapPin className="h-3.5 w-3.5" />
                  2. Address &amp; Location
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("family")}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold transition ${
                    activeTab === "family"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted/40 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Users className="h-3.5 w-3.5" />
                  3. Family &amp; Nominee
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("preferences")}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold transition ${
                    activeTab === "preferences"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted/40 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  4. KYC &amp; Reminders
                </button>
              </div>

              {/* Tab 1: Identity & Contact */}
              {activeTab === "identity" && (
                <div className="grid gap-3.5 sm:grid-cols-2">
                  <div className="space-y-1 sm:col-span-2">
                    <label htmlFor="wb-name" className="text-xs font-semibold text-foreground">
                      Full Legal Name <span className="text-destructive">*</span>
                    </label>
                    <input
                      id="wb-name"
                      type="text"
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value)}
                      placeholder="e.g. Rajesh Kumar Sharma"
                      className="h-9 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:border-ring focus:ring-1 focus:ring-ring"
                      autoFocus
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="wb-phone" className="text-xs font-semibold text-foreground">
                      Primary Mobile Number <span className="text-destructive">*</span>
                    </label>
                    <input
                      id="wb-phone"
                      type="tel"
                      value={createPhone}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCreatePhone(val);
                        if (sameAsPhone) {
                          setCreateWhatsappPhone(val);
                        }
                      }}
                      placeholder="10-digit mobile number"
                      className="h-9 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:border-ring focus:ring-1 focus:ring-ring"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label htmlFor="wb-whatsapp" className="text-xs font-semibold text-foreground">
                        WhatsApp Number
                      </label>
                      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          checked={sameAsPhone}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setSameAsPhone(checked);
                            if (checked) setCreateWhatsappPhone(createPhone);
                          }}
                          className="rounded border-input text-primary focus:ring-primary h-3.5 w-3.5"
                        />
                        Same as mobile
                      </label>
                    </div>
                    <input
                      id="wb-whatsapp"
                      type="tel"
                      value={sameAsPhone ? createPhone : createWhatsappPhone}
                      onChange={(e) => {
                        setCreateWhatsappPhone(e.target.value);
                        setSameAsPhone(false);
                      }}
                      placeholder="WhatsApp contact"
                      disabled={sameAsPhone}
                      className="h-9 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:border-ring focus:ring-1 focus:ring-ring disabled:bg-muted/40 disabled:text-muted-foreground"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="wb-email" className="text-xs font-medium text-muted-foreground">
                      Email Address <span className="text-xs opacity-60">(optional)</span>
                    </label>
                    <input
                      id="wb-email"
                      type="email"
                      value={createEmail}
                      onChange={(e) => setCreateEmail(e.target.value)}
                      placeholder="customer@email.com"
                      className="h-9 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:border-ring focus:ring-1 focus:ring-ring"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="wb-code" className="text-xs font-medium text-muted-foreground">
                      Customer Code / Passbook ID <span className="text-xs opacity-60">(auto if blank)</span>
                    </label>
                    <input
                      id="wb-code"
                      type="text"
                      value={customerCode}
                      onChange={(e) => setCustomerCode(e.target.value)}
                      placeholder="e.g. CUST-2026-0042"
                      className="h-9 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:border-ring focus:ring-1 focus:ring-ring"
                    />
                  </div>

                  <div className="sm:col-span-2 flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab("address")}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted/80"
                    >
                      Next: Address &amp; Location ➔
                    </button>
                  </div>
                </div>
              )}

              {/* Tab 2: Address & Location */}
              {activeTab === "address" && (
                <div className="grid gap-3.5 sm:grid-cols-2">
                  <div className="space-y-1 sm:col-span-2">
                    <label htmlFor="wb-address" className="text-xs font-semibold text-foreground">
                      Street Address / House / Flat No. <span className="text-destructive">*</span>
                    </label>
                    <input
                      id="wb-address"
                      type="text"
                      value={createAddress}
                      onChange={(e) => setCreateAddress(e.target.value)}
                      placeholder="e.g. 14/B G.T. Road, Near Bus Stand, Ushagram"
                      className="h-9 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:border-ring focus:ring-1 focus:ring-ring"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="wb-landmark" className="text-xs font-medium text-muted-foreground">
                      Landmark / Area Identifier
                    </label>
                    <input
                      id="wb-landmark"
                      type="text"
                      value={landmark}
                      onChange={(e) => setLandmark(e.target.value)}
                      placeholder="e.g. Opp. State Bank of India"
                      className="h-9 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:border-ring focus:ring-1 focus:ring-ring"
                    />
                  </div>

                  <div>
                    <PincodeField
                      id="wb-pincode"
                      label="Postal PIN Code"
                      value={createPincode}
                      onChange={setCreatePincode}
                      onResolved={(opt) => {
                        if (opt.city) setCreateCity(opt.city);
                        if (opt.district) setCreateDistrict(opt.district);
                        if (opt.state) setCreateState(opt.state);
                      }}
                      placeholder="e.g. 713301"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="wb-city" className="text-xs font-semibold text-foreground">
                      City / Town
                    </label>
                    <input
                      id="wb-city"
                      type="text"
                      value={createCity}
                      onChange={(e) => setCreateCity(e.target.value)}
                      placeholder="e.g. Asansol"
                      className="h-9 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:border-ring focus:ring-1 focus:ring-ring"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="wb-district" className="text-xs font-medium text-muted-foreground">
                      District
                    </label>
                    <input
                      id="wb-district"
                      type="text"
                      value={createDistrict}
                      onChange={(e) => setCreateDistrict(e.target.value)}
                      placeholder="e.g. Paschim Bardhaman"
                      className="h-9 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:border-ring focus:ring-1 focus:ring-ring"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="wb-state" className="text-xs font-medium text-muted-foreground">
                      State
                    </label>
                    <input
                      id="wb-state"
                      type="text"
                      value={createState}
                      onChange={(e) => setCreateState(e.target.value)}
                      placeholder="e.g. West Bengal"
                      className="h-9 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:border-ring focus:ring-1 focus:ring-ring"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="wb-addr-type" className="text-xs font-medium text-muted-foreground">
                      Premises Type
                    </label>
                    <select
                      id="wb-addr-type"
                      value={addressType}
                      onChange={(e) => setAddressType(e.target.value)}
                      className="h-9 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:border-ring focus:ring-1 focus:ring-ring"
                    >
                      <option value="HOME">Owned Residential Home</option>
                      <option value="RENTED">Rented House / Flat</option>
                      <option value="OFFICE">Commercial Office</option>
                      <option value="SHOP">Retail Shop / Showroom</option>
                      <option value="OTHER">Other Premises</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2 flex justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab("identity")}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
                    >
                      ⬅ Back
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("family")}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted/80"
                    >
                      Next: Family &amp; Nominee ➔
                    </button>
                  </div>
                </div>
              )}

              {/* Tab 3: Family & Nominee */}
              {activeTab === "family" && (
                <div className="grid gap-3.5 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label htmlFor="wb-guardian" className="text-xs font-medium text-foreground">
                      Father&apos;s / Husband&apos;s Name (S/O or W/O)
                    </label>
                    <input
                      id="wb-guardian"
                      type="text"
                      value={guardianName}
                      onChange={(e) => setGuardianName(e.target.value)}
                      placeholder="e.g. Late Ramprasad Sharma"
                      className="h-9 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:border-ring focus:ring-1 focus:ring-ring"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="wb-gender" className="text-xs font-medium text-muted-foreground">
                      Gender
                    </label>
                    <select
                      id="wb-gender"
                      value={gender}
                      onChange={(e) => setGender(e.target.value)}
                      className="h-9 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:border-ring focus:ring-1 focus:ring-ring"
                    >
                      <option value="">Select gender (optional)</option>
                      <option value="MALE">Male</option>
                      <option value="FEMALE">Female</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="wb-dob" className="text-xs font-medium text-muted-foreground">
                      Date of Birth / Age
                    </label>
                    <input
                      id="wb-dob"
                      type="text"
                      value={dateOfBirth}
                      onChange={(e) => setDateOfBirth(e.target.value)}
                      placeholder="DD/MM/YYYY or Approx Age"
                      className="h-9 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:border-ring focus:ring-1 focus:ring-ring"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="wb-nominee-rel" className="text-xs font-medium text-muted-foreground">
                      Nominee / Guarantor Relationship
                    </label>
                    <select
                      id="wb-nominee-rel"
                      value={nomineeRelation}
                      onChange={(e) => setNomineeRelation(e.target.value)}
                      className="h-9 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:border-ring focus:ring-1 focus:ring-ring"
                    >
                      <option value="Spouse">Spouse (Wife / Husband)</option>
                      <option value="Father">Father</option>
                      <option value="Mother">Mother</option>
                      <option value="Brother">Brother</option>
                      <option value="Sister">Sister</option>
                      <option value="Son">Son</option>
                      <option value="Daughter">Daughter</option>
                      <option value="Friend">Friend / Colleague</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="wb-nominee-name" className="text-xs font-medium text-foreground">
                      Nominee / Reference Person Name
                    </label>
                    <input
                      id="wb-nominee-name"
                      type="text"
                      value={nomineeName}
                      onChange={(e) => setNomineeName(e.target.value)}
                      placeholder="e.g. Sunita Sharma"
                      className="h-9 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:border-ring focus:ring-1 focus:ring-ring"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="wb-nominee-phone" className="text-xs font-medium text-foreground">
                      Nominee / Reference Phone Number
                    </label>
                    <input
                      id="wb-nominee-phone"
                      type="tel"
                      value={nomineePhone}
                      onChange={(e) => setNomineePhone(e.target.value)}
                      placeholder="10-digit contact"
                      className="h-9 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:border-ring focus:ring-1 focus:ring-ring"
                    />
                  </div>

                  <div className="sm:col-span-2 flex justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab("address")}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
                    >
                      ⬅ Back
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("preferences")}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted/80"
                    >
                      Next: KYC &amp; Reminders ➔
                    </button>
                  </div>
                </div>
              )}

              {/* Tab 4: Preferences & KYC */}
              {activeTab === "preferences" && (
                <div className="grid gap-3.5 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label htmlFor="wb-id-type" className="text-xs font-medium text-foreground">
                      Primary Government ID Type
                    </label>
                    <select
                      id="wb-id-type"
                      value={idDocType}
                      onChange={(e) => setIdDocType(e.target.value)}
                      className="h-9 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:border-ring focus:ring-1 focus:ring-ring"
                    >
                      <option value="AADHAAR">Aadhaar Card</option>
                      <option value="PAN">PAN Card</option>
                      <option value="VOTER_ID">Voter ID Card</option>
                      <option value="DRIVING_LICENSE">Driving License</option>
                      <option value="PASSPORT">Passport</option>
                      <option value="OTHER">Other Official Document</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="wb-id-num" className="text-xs font-medium text-foreground">
                      ID Document Number / Reference
                    </label>
                    <input
                      id="wb-id-num"
                      type="text"
                      value={idNumber}
                      onChange={(e) => setIdNumber(e.target.value)}
                      placeholder="e.g. XXXX-XXXX-1234 or ABCDE1234F"
                      className="h-9 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:border-ring focus:ring-1 focus:ring-ring"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="wb-kyc-status" className="text-xs font-medium text-foreground">
                      Initial KYC Verification State
                    </label>
                    <select
                      id="wb-kyc-status"
                      value={initialKycStatus}
                      onChange={(e) => setInitialKycStatus(e.target.value)}
                      className="h-9 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:border-ring focus:ring-1 focus:ring-ring"
                    >
                      <option value="PENDING">Pending (Collect physical proof later)</option>
                      <option value="VERIFIED">Verified (Physical ID inspected on spot)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="wb-occupation" className="text-xs font-medium text-muted-foreground">
                      Occupation / Business Type
                    </label>
                    <select
                      id="wb-occupation"
                      value={occupation}
                      onChange={(e) => setOccupation(e.target.value)}
                      className="h-9 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:border-ring focus:ring-1 focus:ring-ring"
                    >
                      <option value="">Select occupation (optional)</option>
                      <option value="Salaried">Salaried (Private / Govt)</option>
                      <option value="Business">Retail / Trader / Business</option>
                      <option value="Self-Employed">Self-Employed Professional</option>
                      <option value="Homemaker">Homemaker</option>
                      <option value="Retired">Retired</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="wb-employer" className="text-xs font-medium text-muted-foreground">
                      Employer / Business Firm Name
                    </label>
                    <input
                      id="wb-employer"
                      type="text"
                      value={employerName}
                      onChange={(e) => setEmployerName(e.target.value)}
                      placeholder="e.g. Eastern Coalfields Ltd / Shop name"
                      className="h-9 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:border-ring focus:ring-1 focus:ring-ring"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="wb-remind-ch" className="text-xs font-medium text-muted-foreground">
                      Preferred Reminder Channel
                    </label>
                    <select
                      id="wb-remind-ch"
                      value={preferredReminderChannel}
                      onChange={(e) => setPreferredReminderChannel(e.target.value)}
                      className="h-9 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:border-ring focus:ring-1 focus:ring-ring"
                    >
                      <option value="WHATSAPP">WhatsApp Message</option>
                      <option value="SMS">SMS Text Message</option>
                      <option value="CALL">Phone Call</option>
                      <option value="EMAIL">Email</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2 pt-1">
                    <label className="flex items-center gap-2 rounded-xl border border-border/80 bg-muted/20 p-3 text-xs text-foreground cursor-pointer hover:bg-muted/30">
                      <input
                        type="checkbox"
                        checked={whatsappOptedIn}
                        onChange={(e) => setWhatsappOptedIn(e.target.checked)}
                        className="rounded border-input text-primary focus:ring-primary h-4 w-4"
                      />
                      <div>
                        <span className="font-semibold">Opt-in for WhatsApp EMI &amp; Contract Alerts</span>
                        <p className="text-[11px] text-muted-foreground">
                          Sends automated draw announcements, monthly EMI schedule receipts, and contract notices.
                        </p>
                      </div>
                    </label>
                  </div>

                  <div className="sm:col-span-2 flex justify-start pt-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab("family")}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
                    >
                      ⬅ Back
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Quick Feed Mode */
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor="f-name" className="text-xs font-medium text-foreground">
                  Name <span className="text-destructive">*</span>
                </label>
                <input
                  id="f-name"
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Customer name"
                  className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring"
                  autoFocus
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="f-phone" className="text-xs font-medium text-foreground">
                  Phone <span className="text-destructive">*</span>
                </label>
                <input
                  id="f-phone"
                  type="tel"
                  value={createPhone}
                  onChange={(e) => setCreatePhone(e.target.value)}
                  placeholder="10-digit mobile number"
                  className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="f-email-optional" className="text-xs font-medium text-muted-foreground">
                  Email <span className="text-xs opacity-60">(optional)</span>
                </label>
                <input
                  id="f-email-optional"
                  type="email"
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  placeholder="customer@email.com"
                  className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="f-address-optional" className="text-xs font-medium text-muted-foreground">
                  Address <span className="text-xs opacity-60">(optional)</span>
                </label>
                <input
                  id="f-address-optional"
                  type="text"
                  value={createAddress}
                  onChange={(e) => setCreateAddress(e.target.value)}
                  placeholder="Address / city"
                  className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring"
                />
              </div>
            </div>
          )}

          {/* Workbench Footer Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3.5">
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              <span>
                {createName.trim() && createPhone.trim()
                  ? "Identity ready for contract enrollment"
                  : "Name and phone are required to onboard customer"}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-xl border border-border px-3.5 py-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition"
                disabled={creating}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={creating || !createName.trim() || !createPhone.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 transition"
              >
                {creating ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-border border-t-white" />
                    Creating Customer Profile…
                  </>
                ) : (
                  <>
                    <UserPlus className="h-3.5 w-3.5" />
                    Save &amp; Select Customer
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
