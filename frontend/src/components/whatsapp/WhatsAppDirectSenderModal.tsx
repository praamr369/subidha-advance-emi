// frontend/src/components/whatsapp/WhatsAppDirectSenderModal.tsx
"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  AlertCircle,
  Check,
  Copy,
  ExternalLink,
  FileText,
  Gift,
  MessageCircle,
  Phone,
  Receipt,
  Search,
  Send,
  Sparkles,
  User,
  X,
} from "lucide-react";

import ModalShell from "@/components/ui/ModalShell";
import { cn } from "@/lib/utils";
import {
  buildClientDirectWhatsAppUrl,
  composeWhatsAppDirect,
  normalizePhone,
  type DirectWhatsAppComposePayload,
} from "@/services/whatsapp";
import { searchCustomers, type CustomerRecord } from "@/services/customers";

export type WhatsAppDirectInitialData = {
  phone?: string;
  name?: string;
  customerId?: number | null;
  eventType?: string;
  amount?: string | number;
  ref?: string;
  receipt?: string;
  docUrl?: string;
  product?: string;
  date?: string;
  offerText?: string;
  text?: string;
  sourceModel?: string;
  sourceId?: string;
};

export const WHATSAPP_DIRECT_EVENT_NAME = "subidha:open-whatsapp-direct";

/** Dispatch custom event so any button in the app can open the sender modal */
export function openWhatsAppDirectModal(data?: WhatsAppDirectInitialData) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<WhatsAppDirectInitialData>(WHATSAPP_DIRECT_EVENT_NAME, {
        detail: data || {},
      })
    );
  }
}

type EventTemplateOption = {
  value: string;
  label: string;
  icon: typeof FileText;
  description: string;
};

const TEMPLATE_OPTIONS: EventTemplateOption[] = [
  {
    value: "BILL_INVOICE",
    label: "Bill / Invoice",
    icon: FileText,
    description: "Send sales bill, retail invoice, or delivery invoice with link.",
  },
  {
    value: "PAYMENT_RECEIPT",
    label: "Payment Receipt",
    icon: Receipt,
    description: "Send payment confirmation and receipt link for Advance EMI or direct sale.",
  },
  {
    value: "OUTSTANDING_REMINDER",
    label: "Outstanding / Overdue",
    icon: AlertCircle,
    description: "Send friendly reminder of unpaid overdue balance with UPI instructions.",
  },
  {
    value: "DUE_REMINDER",
    label: "Instalment Due",
    icon: MessageCircle,
    description: "Upcoming monthly instalment due date reminder.",
  },
  {
    value: "BROCHURE_CATALOG",
    label: "Brochure & Catalog",
    icon: Sparkles,
    description: "Share online digital product catalog and furniture collection link.",
  },
  {
    value: "OFFER_PROMOTION",
    label: "Offer & Ad Promotion",
    icon: Gift,
    description: "Seasonal discount, festive offer, or special promotional message.",
  },
  {
    value: "CRM_FOLLOW_UP",
    label: "CRM Follow-up",
    icon: User,
    description: "Follow up on customer inquiries, plan quotations, or showroom visits.",
  },
  {
    value: "CUSTOM",
    label: "Custom Message",
    icon: Send,
    description: "Write any custom message to send immediately without saving contact.",
  },
];

type Props = {
  open?: boolean;
  onClose?: () => void;
  initialData?: WhatsAppDirectInitialData;
};

export default function WhatsAppDirectSenderModal({
  open: controlledOpen,
  onClose: controlledOnClose,
  initialData,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;

  const handleClose = useCallback(() => {
    if (controlledOnClose) {
      controlledOnClose();
    } else {
      setInternalOpen(false);
    }
  }, [controlledOnClose]);

  // Recipient state
  const [recipientMode, setRecipientMode] = useState<"direct" | "saved">("direct");
  const [phone, setPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerId, setCustomerId] = useState<number | null>(null);

  // Template & details state
  const [eventType, setEventType] = useState("BILL_INVOICE");
  const [amount, setAmount] = useState("");
  const [refNo, setRefNo] = useState("");
  const [receiptNo, setReceiptNo] = useState("");
  const [docUrl, setDocUrl] = useState("");
  const [productName, setProductName] = useState("");
  const [dateStr, setDateStr] = useState("");
  const [offerText, setOfferText] = useState("");
  const [customText, setCustomText] = useState("");

  // Source attribution
  const [sourceModel, setSourceModel] = useState("WhatsAppDirect");
  const [sourceId, setSourceId] = useState("");

  // Customer search state
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerRecord[]>([]);
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);

  // Status feedback
  const [copied, setCopied] = useState(false);
  const [isLogging, startLoggingTransition] = useTransition();
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Reset or load initial data
  const applyInitialData = useCallback((data?: WhatsAppDirectInitialData) => {
    if (!data) return;
    if (data.phone) setPhone(data.phone);
    if (data.name) setCustomerName(data.name);
    if (data.customerId) {
      setCustomerId(data.customerId);
      setRecipientMode("saved");
    } else {
      setCustomerId(null);
      if (data.phone) setRecipientMode("direct");
    }
    if (data.eventType) setEventType(data.eventType);
    if (data.amount !== undefined) setAmount(String(data.amount));
    if (data.ref) setRefNo(data.ref);
    if (data.receipt) setReceiptNo(data.receipt);
    if (data.docUrl) setDocUrl(data.docUrl);
    if (data.product) setProductName(data.product);
    if (data.date) setDateStr(data.date);
    if (data.offerText) setOfferText(data.offerText);
    if (data.text) setCustomText(data.text);
    if (data.sourceModel) setSourceModel(data.sourceModel);
    if (data.sourceId) setSourceId(data.sourceId);

    // Default dates if empty
    if (!data.date) {
      const today = new Date().toISOString().split("T")[0];
      setDateStr(today);
    }
  }, []);

  useEffect(() => {
    if (initialData) {
      applyInitialData(initialData);
    }
  }, [initialData, applyInitialData]);

  // Listen for global custom event
  useEffect(() => {
    function onOpenCustomEvent(event: Event) {
      const customEvent = event as CustomEvent<WhatsAppDirectInitialData>;
      if (customEvent.detail) {
        applyInitialData(customEvent.detail);
      }
      setInternalOpen(true);
      setStatusMessage(null);
    }

    window.addEventListener(WHATSAPP_DIRECT_EVENT_NAME, onOpenCustomEvent);
    return () => {
      window.removeEventListener(WHATSAPP_DIRECT_EVENT_NAME, onOpenCustomEvent);
    };
  }, [applyInitialData]);

  // Search customers when query changes in saved mode
  useEffect(() => {
    if (recipientMode !== "saved" || !customerSearchQuery.trim()) {
      setCustomerResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearchingCustomer(true);
      try {
        const results = await searchCustomers(customerSearchQuery);
        setCustomerResults(results);
      } catch {
        setCustomerResults([]);
      } finally {
        setIsSearchingCustomer(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [customerSearchQuery, recipientMode]);

  // Default document URL to public catalog if brochure/catalog is chosen and docUrl is empty
  useEffect(() => {
    if (eventType === "BROCHURE_CATALOG" && !docUrl) {
      if (typeof window !== "undefined") {
        setDocUrl(`${window.location.origin}/products`);
      }
    }
  }, [eventType, docUrl]);

  // Generated message body based on current fields
  const generatedBody = useMemo(() => {
    const name = customerName.trim() || "Customer";
    const company = "Subidha Furniture";
    const ref = refNo.trim() || "Order";
    const amt = amount.trim() || "0";
    const date = dateStr.trim() || new Date().toISOString().split("T")[0];
    const doc = docUrl.trim();
    const docLinkText = doc ? `\n\n📄 View Document: ${doc}` : "";

    switch (eventType) {
      case "BILL_INVOICE":
        return `Dear ${name},\nHere is your bill/invoice (${ref}) from ${company}.\nTotal Amount: ₹${amt}.${docLinkText}\n\nThank you for shopping with us! — ${company}`;

      case "PAYMENT_RECEIPT": {
        const rcpt = receiptNo.trim() || ref;
        return `Dear ${name},\nWe have received your payment of ₹${amt} on ${date} for ${ref}.\nReceipt: ${rcpt}.${docLinkText}\n\nThank you for paying on time. — ${company}`;
      }

      case "OUTSTANDING_REMINDER":
        return `Dear ${name},\nThis is a gentle reminder from ${company}.\nYou have an outstanding balance of ₹${amt} on your account (${ref}).\nPlease clear the payment at your earliest convenience. For UPI payment or support, reply directly to this chat.\n\nThank you, — ${company}`;

      case "DUE_REMINDER":
        return `Dear ${name},\nYour instalment of ₹${amt} for ${ref} is due on ${date}.\nPlease pay on time to keep your plan in good standing.${docLinkText}\n\n— ${company}`;

      case "BROCHURE_CATALOG": {
        const catUrl = doc || (typeof window !== "undefined" ? `${window.location.origin}/products` : "https://subidha.com");
        return `Hello ${name},\nGreetings from ${company}!\n\nHere is our latest furniture collection brochure & digital catalog:\n👉 ${catUrl}\n\nExplore our latest living, bedroom, and office collections with easy EMI and rent/lease plans. Feel free to reply to this chat for any questions! — ${company}`;
      }

      case "OFFER_PROMOTION": {
        const offer = offerText.trim() || "Special seasonal discount on our best-selling furniture!";
        const link = doc ? `\nExplore offers: ${doc}` : "";
        return `🎉 Exciting Offers at ${company}!\n\n${offer}${link}\n\nVisit our showroom or reply to this chat to book your offer today! — ${company}`;
      }

      case "CRM_FOLLOW_UP": {
        const product = productName.trim() || "your furniture inquiry";
        return `Hello ${name},\nFollowing up from ${company} regarding your inquiry for ${product}.\nWe are here to assist you with the best prices, instant EMI options, and fast doorstep delivery. Let us know how we can help you today! — ${company}`;
      }

      case "CUSTOM":
      default:
        return customText;
    }
  }, [
    eventType,
    customerName,
    refNo,
    amount,
    dateStr,
    docUrl,
    receiptNo,
    offerText,
    productName,
    customText,
  ]);

  // Actual editable text
  const [editableBody, setEditableBody] = useState("");
  const [isBodyManuallyEdited, setIsBodyManuallyEdited] = useState(false);

  // Synchronize generated body into editableBody unless the user manually edited it
  useEffect(() => {
    if (!isBodyManuallyEdited) {
      setEditableBody(generatedBody);
    }
  }, [generatedBody, isBodyManuallyEdited]);

  const handleBodyChange = (newText: string) => {
    setEditableBody(newText);
    setIsBodyManuallyEdited(true);
  };

  const handleResetToTemplate = () => {
    setIsBodyManuallyEdited(false);
    setEditableBody(generatedBody);
  };

  const normalizedPhone = useMemo(() => normalizePhone(phone), [phone]);

  const isValidPhone = useMemo(() => {
    return normalizedPhone.length >= 10 && normalizedPhone.length <= 15;
  }, [normalizedPhone]);

  // Perform background logging and get outbox record
  const logMessageToOutbox = useCallback(async () => {
    const payload: DirectWhatsAppComposePayload = {
      phone: normalizedPhone,
      customer: customerId,
      name: customerName.trim(),
      event_type: eventType,
      text: editableBody.trim(),
      amount: amount || undefined,
      ref: refNo || undefined,
      receipt: receiptNo || undefined,
      date: dateStr || undefined,
      product: productName || undefined,
      doc_url: docUrl || undefined,
      offer_text: offerText || undefined,
      source_model: sourceModel,
      source_id: sourceId,
    };

    try {
      const msg = await composeWhatsAppDirect(payload);
      return msg;
    } catch (err) {
      console.warn("Could not log WhatsApp message into outbox:", err);
      return null;
    }
  }, [
    normalizedPhone,
    customerId,
    customerName,
    eventType,
    editableBody,
    amount,
    refNo,
    receiptNo,
    dateStr,
    productName,
    docUrl,
    offerText,
    sourceModel,
    sourceId,
  ]);

  // Handler: Open in WhatsApp Web directly
  const handleOpenWhatsAppWeb = () => {
    if (!isValidPhone) {
      setStatusMessage({
        type: "error",
        text: "Please enter a valid 10-digit phone number.",
      });
      return;
    }
    if (!editableBody.trim()) {
      setStatusMessage({
        type: "error",
        text: "Please enter message text before sending.",
      });
      return;
    }

    const webUrl = buildClientDirectWhatsAppUrl({
      phone: normalizedPhone,
      text: editableBody,
      target: "web",
    });

    // Synchronously open tab to avoid browser popup blocker
    const tab = typeof window !== "undefined" ? window.open("", "_blank") : null;
    if (tab) {
      tab.opener = null;
      tab.location.href = webUrl;
    } else if (typeof window !== "undefined") {
      window.open(webUrl, "_blank");
    }

    startLoggingTransition(async () => {
      await logMessageToOutbox();
      setStatusMessage({
        type: "success",
        text: `Opened in WhatsApp Web for +${normalizedPhone} and logged to Outbox!`,
      });
    });
  };

  // Handler: Open in WhatsApp App (wa.me)
  const handleOpenWhatsAppApp = () => {
    if (!isValidPhone) {
      setStatusMessage({
        type: "error",
        text: "Please enter a valid 10-digit phone number.",
      });
      return;
    }
    if (!editableBody.trim()) {
      setStatusMessage({
        type: "error",
        text: "Please enter message text before sending.",
      });
      return;
    }

    const appUrl = buildClientDirectWhatsAppUrl({
      phone: normalizedPhone,
      text: editableBody,
      target: "app",
    });

    const tab = typeof window !== "undefined" ? window.open("", "_blank") : null;
    if (tab) {
      tab.opener = null;
      tab.location.href = appUrl;
    } else if (typeof window !== "undefined") {
      window.open(appUrl, "_blank");
    }

    startLoggingTransition(async () => {
      await logMessageToOutbox();
      setStatusMessage({
        type: "success",
        text: `Opened WhatsApp App for +${normalizedPhone} and logged to Outbox!`,
      });
    });
  };

  // Handler: Copy message
  const handleCopyMessage = async () => {
    if (!editableBody.trim()) return;
    try {
      await navigator.clipboard.writeText(editableBody);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      setStatusMessage({
        type: "success",
        text: "Message text copied to clipboard!",
      });
    } catch {
      setStatusMessage({
        type: "error",
        text: "Failed to copy text. Please select and copy manually.",
      });
    }
  };

  // Select customer from search results
  const handleSelectCustomer = (cust: CustomerRecord) => {
    setCustomerId(cust.id);
    setCustomerName(cust.name);
    setPhone(cust.phone || "");
    setCustomerResults([]);
    setCustomerSearchQuery("");
  };

  if (!isOpen) return null;

  return (
    <ModalShell
      open={isOpen}
      onClose={handleClose}
      title="WhatsApp Direct Sender (No Saved Contact Needed)"
      panelClassName="w-full max-w-4xl max-h-[92vh] flex flex-col p-0 overflow-hidden bg-background border border-border shadow-2xl rounded-2xl"
    >
      {/* Modal Header */}
      <div className="flex items-center justify-between border-b border-border bg-[linear-gradient(180deg,color-mix(in_oklab,var(--surface-muted)_95%,#25D366_5%),var(--surface-card))] px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-[#25D366]/15 text-[#25D366]">
            <MessageCircle className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              WhatsApp Direct Connect
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                100% Free · WhatsApp Web
              </span>
            </h2>
            <p className="text-xs text-muted-foreground">
              Send bills, receipts, brochures, offers, and reminders directly without saving contacts.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition"
          aria-label="Close modal"
        >
          <X className="size-5" />
        </button>
      </div>

      {/* Main Content Layout: Two-Column Workbench */}
      <div className="grid grid-cols-1 md:grid-cols-12 flex-1 overflow-y-auto divide-y md:divide-y-0 md:divide-x divide-border">
        {/* Left Column: Form & Inputs (7 cols) */}
        <div className="md:col-span-7 p-5 space-y-4 overflow-y-auto max-h-[75vh]">
          {/* Recipient Mode Tabs */}
          <div>
            <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
              Target Recipient
            </label>
            <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted/40 p-1">
              <button
                type="button"
                onClick={() => setRecipientMode("direct")}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-md py-1.5 text-xs font-medium transition",
                  recipientMode === "direct"
                    ? "bg-background text-foreground shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Phone className="size-3.5" />
                Direct Phone (Unsaved)
              </button>
              <button
                type="button"
                onClick={() => setRecipientMode("saved")}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-md py-1.5 text-xs font-medium transition",
                  recipientMode === "saved"
                    ? "bg-background text-foreground shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <User className="size-3.5" />
                Existing Customer
              </button>
            </div>
          </div>

          {/* Recipient Inputs */}
          {recipientMode === "direct" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Mobile Number <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-xs text-muted-foreground font-mono">
                    🇮🇳 +91
                  </div>
                  <input
                    type="tel"
                    placeholder="98765 43210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full pl-16 pr-3 py-1.5 text-sm rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none font-mono"
                  />
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Works even if number is not saved in phone contacts!
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Recipient Name (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Rahul Sharma"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-foreground">
                Search Customer
              </label>
              <div className="relative">
                <Search className="size-3.5 absolute left-3 top-2.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Type name or phone number..."
                  value={customerSearchQuery}
                  onChange={(e) => setCustomerSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                />
                {isSearchingCustomer && (
                  <div className="absolute right-3 top-2.5 text-xs text-muted-foreground">
                    Searching…
                  </div>
                )}
              </div>

              {/* Customer search results dropdown */}
              {customerResults.length > 0 && (
                <div className="rounded-lg border border-border bg-background shadow-lg max-h-40 overflow-y-auto divide-y divide-border">
                  {customerResults.map((cust) => (
                    <button
                      key={cust.id}
                      type="button"
                      onClick={() => handleSelectCustomer(cust)}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-muted/60 flex items-center justify-between"
                    >
                      <span className="font-medium text-foreground">{cust.name}</span>
                      <span className="font-mono text-muted-foreground">+{cust.phone}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Selected Customer Card */}
              {customerId ? (
                <div className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs">
                  <div>
                    <span className="font-semibold text-emerald-800 dark:text-emerald-300">
                      {customerName}
                    </span>
                    <span className="ml-2 font-mono text-muted-foreground">+{phone}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomerId(null);
                      setCustomerName("");
                      setPhone("");
                    }}
                    className="text-xs text-destructive hover:underline"
                  >
                    Change
                  </button>
                </div>
              ) : null}
            </div>
          )}

          {/* Template Selection */}
          <div>
            <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
              Template & Message Type
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {TEMPLATE_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isSelected = eventType === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setEventType(opt.value);
                      setIsBodyManuallyEdited(false);
                    }}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1 p-2 rounded-lg border text-center transition",
                      isSelected
                        ? "border-[#25D366] bg-[#25D366]/10 text-foreground font-semibold shadow-sm"
                        : "border-border bg-background/50 hover:bg-muted text-muted-foreground hover:text-foreground"
                    )}
                    title={opt.description}
                  >
                    <Icon className={cn("size-4", isSelected ? "text-[#25D366]" : "text-muted-foreground")} />
                    <span className="text-[11px] leading-tight line-clamp-1">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dynamic Template Fields */}
          <div className="rounded-xl border border-border bg-muted/20 p-3.5 space-y-3">
            <div className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>Template Details</span>
              <span className="text-[11px] font-normal text-muted-foreground">
                Auto-generates message body
              </span>
            </div>

            {/* Bill / Receipt / Due / Outstanding Fields */}
            {(eventType === "BILL_INVOICE" ||
              eventType === "PAYMENT_RECEIPT" ||
              eventType === "OUTSTANDING_REMINDER" ||
              eventType === "DUE_REMINDER") && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-foreground mb-1">
                    Amount (₹)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 5,000"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-foreground mb-1">
                    {eventType === "PAYMENT_RECEIPT"
                      ? "Receipt Number"
                      : eventType === "BILL_INVOICE"
                      ? "Invoice / Bill Number"
                      : "Account / Contract Ref"}
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. INV-2026-0042"
                    value={eventType === "PAYMENT_RECEIPT" ? receiptNo || refNo : refNo}
                    onChange={(e) => {
                      setRefNo(e.target.value);
                      if (eventType === "PAYMENT_RECEIPT") setReceiptNo(e.target.value);
                    }}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-medium text-foreground mb-1">
                    Document / PDF Link (Customer can tap to view/download)
                  </label>
                  <input
                    type="text"
                    placeholder="https://.../portal/receipt/123 or PDF link"
                    value={docUrl}
                    onChange={(e) => setDocUrl(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none font-mono"
                  />
                </div>
              </div>
            )}

            {/* Brochure / Offer Fields */}
            {(eventType === "BROCHURE_CATALOG" || eventType === "OFFER_PROMOTION") && (
              <div className="space-y-3">
                {eventType === "OFFER_PROMOTION" && (
                  <div>
                    <label className="block text-[11px] font-medium text-foreground mb-1">
                      Offer Headline / Promotional Details
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Flat 15% OFF on Living Room Sets this Festive Season!"
                      value={offerText}
                      onChange={(e) => setOfferText(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-[11px] font-medium text-foreground mb-1">
                    Catalog / Brochure Web Link
                  </label>
                  <input
                    type="text"
                    placeholder="https://.../products or catalog PDF"
                    value={docUrl}
                    onChange={(e) => setDocUrl(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none font-mono"
                  />
                </div>
              </div>
            )}

            {/* CRM Follow-up Fields */}
            {eventType === "CRM_FOLLOW_UP" && (
              <div>
                <label className="block text-[11px] font-medium text-foreground mb-1">
                  Product / Plan of Interest
                </label>
                <input
                  type="text"
                  placeholder="e.g. Teak Wood Dining Table or Lucky Plan EMI"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                />
              </div>
            )}

            {/* Custom Message Field */}
            {eventType === "CUSTOM" && (
              <div>
                <label className="block text-[11px] font-medium text-foreground mb-1">
                  Custom Text Content
                </label>
                <textarea
                  rows={4}
                  placeholder="Type any message here..."
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none resize-none"
                />
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Live Message Preview & Send Actions (5 cols) */}
        <div className="md:col-span-5 p-5 bg-muted/10 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-[#25D366] animate-pulse" />
                <span className="text-xs font-semibold text-foreground">
                  Live Message Preview
                </span>
              </div>
              {isBodyManuallyEdited ? (
                <button
                  type="button"
                  onClick={handleResetToTemplate}
                  className="text-[11px] text-primary hover:underline"
                >
                  Reset to template
                </button>
              ) : (
                <span className="text-[11px] text-muted-foreground">Editable below</span>
              )}
            </div>

            {/* WhatsApp Chat Bubble Mockup */}
            <div className="rounded-xl border border-emerald-900/10 bg-[linear-gradient(180deg,#E5DDD5_0%,#ECE5DD_100%)] dark:bg-[linear-gradient(180deg,#0B141A_0%,#111B21_100%)] p-3 shadow-inner">
              <div className="flex items-center gap-2 border-b border-black/5 dark:border-white/5 pb-2 mb-2 text-xs text-foreground/80">
                <div className="size-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold">
                  SF
                </div>
                <div className="leading-none">
                  <div className="font-semibold text-xs text-foreground">
                    {customerName || "Customer"}
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono">
                    {normalizedPhone ? `+${normalizedPhone}` : "No number specified"}
                  </div>
                </div>
              </div>

              {/* Message text area */}
              <div className="rounded-lg bg-white dark:bg-[#202C33] p-2.5 shadow-sm border border-black/5">
                <textarea
                  rows={8}
                  value={editableBody}
                  onChange={(e) => handleBodyChange(e.target.value)}
                  className="w-full text-xs text-foreground bg-transparent focus:outline-none resize-none leading-relaxed"
                  placeholder="Message preview will appear here..."
                />
                <div className="flex items-center justify-between pt-1 border-t border-black/5 dark:border-white/5 text-[10px] text-muted-foreground">
                  <span>{editableBody.length} characters</span>
                  <span>Now · ✓✓</span>
                </div>
              </div>
            </div>

            {/* Status / Feedback Alert */}
            {statusMessage && (
              <div
                className={cn(
                  "rounded-lg p-2.5 text-xs flex items-center gap-2",
                  statusMessage.type === "success"
                    ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30"
                    : "bg-destructive/15 text-destructive border border-destructive/30"
                )}
              >
                {statusMessage.type === "success" ? (
                  <Check className="size-4 shrink-0" />
                ) : (
                  <AlertCircle className="size-4 shrink-0" />
                )}
                <span>{statusMessage.text}</span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-2 border-t border-border">
            {/* Primary Action: Open in WhatsApp Web */}
            <button
              type="button"
              onClick={handleOpenWhatsAppWeb}
              disabled={!isValidPhone || !editableBody.trim() || isLogging}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#25D366] hover:bg-[#22c35e] text-white py-2.5 px-4 text-xs font-semibold shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <ExternalLink className="size-4" />
              <span>Open in WhatsApp Web</span>
              <span className="rounded bg-black/20 px-1.5 py-0.5 text-[10px]">
                Direct Chat
              </span>
            </button>

            {/* Secondary Action: Open in Native App or Copy */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleOpenWhatsAppApp}
                disabled={!isValidPhone || !editableBody.trim() || isLogging}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background hover:bg-muted py-2 px-3 text-xs font-medium text-foreground transition disabled:opacity-50"
              >
                <Send className="size-3.5 text-emerald-600" />
                <span>WhatsApp App</span>
              </button>
              <button
                type="button"
                onClick={handleCopyMessage}
                disabled={!editableBody.trim()}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background hover:bg-muted py-2 px-3 text-xs font-medium text-foreground transition disabled:opacity-50"
              >
                {copied ? (
                  <>
                    <Check className="size-3.5 text-emerald-600" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="size-3.5 text-muted-foreground" />
                    <span>Copy Text</span>
                  </>
                )}
              </button>
            </div>

            <p className="text-center text-[10px] text-muted-foreground pt-1">
              Zero paid API charges. Logs into Outbox automatically.
            </p>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

/**
 * Convenient drop-in trigger button that can be embedded anywhere
 */
export function WhatsAppDirectTriggerButton({
  initialData,
  className,
  variant = "outline",
  children,
}: {
  initialData?: WhatsAppDirectInitialData;
  className?: string;
  variant?: "primary" | "outline" | "ghost";
  children?: React.ReactNode;
}) {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openWhatsAppDirectModal(initialData);
  };

  const variantStyles = {
    primary: "bg-[#25D366] text-white hover:bg-[#20b858] font-semibold border-transparent",
    outline: "border border-border bg-background hover:bg-muted text-foreground",
    ghost: "hover:bg-muted text-foreground",
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition cursor-pointer",
        variantStyles[variant],
        className
      )}
      title="Open WhatsApp Direct Sender"
    >
      <MessageCircle className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
      {children || <span>WhatsApp</span>}
    </button>
  );
}
