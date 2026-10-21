// frontend/src/components/whatsapp/WhatsAppDirectSenderModal.tsx
"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  AlertCircle,
  Briefcase,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  CheckSquare,
  Clock,
  Coins,
  Copy,
  CreditCard,
  ExternalLink,
  Eye,
  FileCheck,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Gift,
  Handshake,
  Image as ImageIcon,
  MessageCircle,
  Paperclip,
  Phone,
  Receipt,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Trash2,
  Truck,
  UploadCloud,
  User,
  Users,
  X,
} from "lucide-react";

import ModalShell from "@/components/ui/ModalShell";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import {
  buildClientDirectWhatsAppUrl,
  composeWhatsAppDirect,
  normalizePhone,
  type DirectWhatsAppComposePayload,
} from "@/services/whatsapp";
import { searchCustomers, type CustomerRecord } from "@/services/customers";
import { listVendors, type Vendor } from "@/services/vendors";
import { listHrStaff, type HrStaff } from "@/services/admin-hr";
import { listBillingInvoices, listReceiptDocuments, type BillingInvoice, type ReceiptDocument } from "@/services/billing";
import { listSubscriptions, type SubscriptionRecord } from "@/services/subscriptions";
import { listOutstandings, type OutstandingRow } from "@/services/outstandings";
import { uploadDocument, documentDownloadUrl, type DocumentCategory, type DocumentRecord } from "@/services/documents";
import {
  buildAdminBillingDocumentRoute,
  buildAdminBillingReceiptPrintRoute,
  buildAdminSubscriptionContractPrintRoute,
  buildAdminRentLeaseContractPrintRoute,
} from "@/lib/route-builders";

export type PartyCategory = "CUSTOMER" | "VENDOR" | "PARTNER" | "STAFF" | "DIRECT";

export type CustomerDocKind = "INVOICE" | "RECEIPT" | "CONTRACT_EMI" | "CONTRACT_RENT_LEASE" | "OUTSTANDING";

export type CustomerDocItem = {
  id: string;
  kind: CustomerDocKind;
  categoryLabel: string;
  documentNo: string;
  date: string;
  amount: string;
  balance?: string;
  status: string;
  title: string;
  docUrl: string;
  previewUrl: string;
  recommendedTemplate: string;
  amountToApply: string;
  refToApply: string;
  receiptToApply?: string;
};

export type WhatsAppDirectInitialData = {
  partyType?: PartyCategory;
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
  deliveryDate?: string;
  paymentMode?: string;
  balance?: string | number;
  recoveredAmount?: string | number;
  presentDays?: string | number;
  absentDays?: string | number;
  overtimeHours?: string | number;
  customerName?: string;
  period?: string;
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
  category: PartyCategory | "ALL";
};

const TEMPLATE_OPTIONS: EventTemplateOption[] = [
  // --- Customer Templates ---
  {
    value: "BILL_INVOICE",
    label: "Bill / Invoice",
    icon: FileText,
    description: "Send sales bill, retail invoice, or delivery invoice with link.",
    category: "CUSTOMER",
  },
  {
    value: "PAYMENT_RECEIPT",
    label: "Payment Receipt",
    icon: Receipt,
    description: "Send payment confirmation and receipt link for Advance EMI or direct sale.",
    category: "CUSTOMER",
  },
  {
    value: "OUTSTANDING_REMINDER",
    label: "Outstanding / Overdue",
    icon: AlertCircle,
    description: "Send friendly reminder of unpaid overdue balance with UPI instructions.",
    category: "CUSTOMER",
  },
  {
    value: "DUE_REMINDER",
    label: "Instalment Due",
    icon: Clock,
    description: "Upcoming monthly instalment due date reminder.",
    category: "CUSTOMER",
  },
  {
    value: "BROCHURE_CATALOG",
    label: "Brochure & Catalog",
    icon: Sparkles,
    description: "Share online digital product catalog and furniture collection link.",
    category: "CUSTOMER",
  },
  {
    value: "OFFER_PROMOTION",
    label: "Offer & Promo",
    icon: Gift,
    description: "Seasonal discount, festive offer, or special promotional message.",
    category: "CUSTOMER",
  },
  {
    value: "CRM_FOLLOW_UP",
    label: "CRM Follow-up",
    icon: User,
    description: "Follow up on customer inquiries, plan quotations, or showroom visits.",
    category: "CUSTOMER",
  },

  // --- Vendor Templates ---
  {
    value: "VENDOR_PO",
    label: "Purchase Order (PO)",
    icon: Truck,
    description: "Send formal Purchase Order with PO number, items, delivery date & link.",
    category: "VENDOR",
  },
  {
    value: "VENDOR_LEDGER",
    label: "Vendor Ledger & Balance",
    icon: FileSpreadsheet,
    description: "Send outstanding balance statement and ledger link to supplier.",
    category: "VENDOR",
  },
  {
    value: "VENDOR_PAYMENT",
    label: "Payment Advice",
    icon: CreditCard,
    description: "Send payment voucher advice (NEFT/RTGS/UPI/Cheque) to vendor.",
    category: "VENDOR",
  },

  // --- Partner Templates ---
  {
    value: "PARTNER_COMMISSION",
    label: "Commission Payout",
    icon: Coins,
    description: "Send monthly partner commission statement, payout amount & link.",
    category: "PARTNER",
  },
  {
    value: "PARTNER_LEDGER",
    label: "Partner Ledger & Balance",
    icon: FileSpreadsheet,
    description: "Send partner ledger summary and current balance statement.",
    category: "PARTNER",
  },
  {
    value: "PARTNER_REFERRAL",
    label: "Customer Enrollment",
    icon: CheckSquare,
    description: "Notify partner of new customer subscription, plan, and Lucky ID.",
    category: "PARTNER",
  },

  // --- Staff Templates ---
  {
    value: "STAFF_SALARY",
    label: "Salary Slip & Outstanding",
    icon: Coins,
    description: "Send monthly salary slip, net pay, and pending salary balance.",
    category: "STAFF",
  },
  {
    value: "STAFF_ATTENDANCE",
    label: "Attendance Report",
    icon: Calendar,
    description: "Send monthly attendance record (present, absent, overtime hours).",
    category: "STAFF",
  },
  {
    value: "STAFF_ADVANCE",
    label: "Staff Advance & Balance",
    icon: CreditCard,
    description: "Send advance sanctioned, deduction, and remaining advance balance.",
    category: "STAFF",
  },

  // --- Universal ---
  {
    value: "CUSTOM",
    label: "Custom Message",
    icon: Send,
    description: "Write any custom message to send immediately without saving contact.",
    category: "ALL",
  },
];

type UnifiedPartyItem = {
  id: number;
  name: string;
  phone: string;
  code?: string;
  role: PartyCategory;
  subtitle?: string;
};

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

  // Recipient / Party selection
  const [partyCategory, setPartyCategory] = useState<PartyCategory>("CUSTOMER");
  const [phone, setPhone] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [selectedParty, setSelectedParty] = useState<UnifiedPartyItem | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UnifiedPartyItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Template & message type
  const [eventType, setEventType] = useState("BILL_INVOICE");

  // Template details state
  const [amount, setAmount] = useState("");
  const [refNo, setRefNo] = useState("");
  const [receiptNo, setReceiptNo] = useState("");
  const [docUrl, setDocUrl] = useState("");
  const [productName, setProductName] = useState("");
  const [dateStr, setDateStr] = useState("");
  const [offerText, setOfferText] = useState("");
  const [customText, setCustomText] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [paymentMode, setPaymentMode] = useState("UPI / Bank Transfer");
  const [balance, setBalance] = useState("");
  const [recoveredAmount, setRecoveredAmount] = useState("");
  const [presentDays, setPresentDays] = useState("");
  const [absentDays, setAbsentDays] = useState("");
  const [overtimeHours, setOvertimeHours] = useState("");
  const [referredCustomerName, setReferredCustomerName] = useState("");
  const [period, setPeriod] = useState("");

  // Source attribution
  const [sourceModel, setSourceModel] = useState("Customer");
  const [sourceId, setSourceId] = useState("");

  // Status feedback
  const [copied, setCopied] = useState(false);
  const [, startLoggingTransition] = useTransition();
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Customer Auto-Fetched Bills, Receipts, Contracts & Outstandings
  const [customerDocs, setCustomerDocs] = useState<CustomerDocItem[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [docFilter, setDocFilter] = useState<"ALL" | "INVOICES" | "RECEIPTS" | "RENT_LEASE" | "EMI" | "OUTSTANDINGS">("ALL");

  // Attachment state (PDF / Images / Docs)
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [attachedFilePreview, setAttachedFilePreview] = useState<string | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [isCopyingImage, setIsCopyingImage] = useState(false);
  const [uploadedDoc, setUploadedDoc] = useState<DocumentRecord | null>(null);
  const [imageCopiedNotice, setImageCopiedNotice] = useState(false);

  // Filtered customer documents based on active category pill
  const filteredDocs = useMemo(() => {
    if (docFilter === "ALL") return customerDocs;
    if (docFilter === "INVOICES") return customerDocs.filter((d) => d.kind === "INVOICE");
    if (docFilter === "RECEIPTS") return customerDocs.filter((d) => d.kind === "RECEIPT");
    if (docFilter === "RENT_LEASE") return customerDocs.filter((d) => d.kind === "CONTRACT_RENT_LEASE");
    if (docFilter === "EMI") return customerDocs.filter((d) => d.kind === "CONTRACT_EMI");
    if (docFilter === "OUTSTANDINGS") return customerDocs.filter((d) => d.kind === "OUTSTANDING");
    return customerDocs;
  }, [customerDocs, docFilter]);

  const invoicesCount = useMemo(() => customerDocs.filter((d) => d.kind === "INVOICE").length, [customerDocs]);
  const receiptsCount = useMemo(() => customerDocs.filter((d) => d.kind === "RECEIPT").length, [customerDocs]);
  const rentLeaseCount = useMemo(() => customerDocs.filter((d) => d.kind === "CONTRACT_RENT_LEASE").length, [customerDocs]);
  const emiCount = useMemo(() => customerDocs.filter((d) => d.kind === "CONTRACT_EMI").length, [customerDocs]);
  const outstandingsCount = useMemo(() => customerDocs.filter((d) => d.kind === "OUTSTANDING").length, [customerDocs]);

  const activeSelectedDoc = useMemo(() => {
    if (!selectedDocId) return null;
    return customerDocs.find((d) => d.id === selectedDocId) || null;
  }, [customerDocs, selectedDocId]);

  // Fetch customer documents (Bills, Invoices, Receipts, Contracts, Outstandings)
  const fetchCustomerDocuments = useCallback(async () => {
    if (partyCategory !== "CUSTOMER" || !selectedParty?.id) {
      setCustomerDocs([]);
      setSelectedDocId(null);
      return;
    }

    setIsLoadingDocs(true);
    const custId = selectedParty.id;
    const custName = selectedParty.name;
    const custPhone = selectedParty.phone;

    try {
      const [invoicesRes, receiptsRes, subsRes, outstandingsRes] = await Promise.allSettled([
        listBillingInvoices({ customer: custId, page_size: 25 }),
        listReceiptDocuments({ customer: custId, page_size: 25 }),
        listSubscriptions({ q: custPhone || custName }),
        listOutstandings({ customer: custName, q: custPhone }),
      ]);

      const items: CustomerDocItem[] = [];

      // 1. Invoices & Bills
      if (invoicesRes.status === "fulfilled" && invoicesRes.value?.results) {
        for (const inv of invoicesRes.value.results) {
          const docRoute = buildAdminBillingDocumentRoute(inv.id);
          const fullDocUrl = typeof window !== "undefined" ? `${window.location.origin}${docRoute}` : "";
          const docNo = inv.document_no || `INV-${inv.id}`;
          const isDirect = Boolean(inv.direct_sale);
          const label = inv.document_type === "PROFORMA" ? "Proforma Bill" : isDirect ? "Direct Sale Bill" : "Tax Invoice";

          items.push({
            id: `inv-${inv.id}`,
            kind: "INVOICE",
            categoryLabel: label,
            documentNo: docNo,
            date: inv.invoice_date || "",
            amount: inv.grand_total || "0",
            balance: Number(inv.balance_total || 0) > 0 ? inv.balance_total : undefined,
            status: inv.status || "POSTED",
            title: inv.lines?.map((l) => l.description).filter(Boolean).join(", ") || (isDirect ? `Direct Sale #${inv.direct_sale_no || inv.direct_sale}` : `Invoice ${docNo}`),
            docUrl: fullDocUrl,
            previewUrl: docRoute,
            recommendedTemplate: "BILL_INVOICE",
            amountToApply: inv.grand_total || "0",
            refToApply: docNo,
          });
        }
      }

      // 2. Payment & Retail Receipts
      if (receiptsRes.status === "fulfilled" && receiptsRes.value?.results) {
        for (const rec of receiptsRes.value.results) {
          const printRoute = buildAdminBillingReceiptPrintRoute(rec.id);
          const fullPrintUrl = typeof window !== "undefined" ? `${window.location.origin}${printRoute}` : "";
          const rcptNo = rec.receipt_no || `REC-${rec.id}`;
          const isEmi = rec.receipt_type === "EMI_PAYMENT_RECEIPT";

          items.push({
            id: `rec-${rec.id}`,
            kind: "RECEIPT",
            categoryLabel: isEmi ? "EMI Payment Receipt" : "Retail Receipt",
            documentNo: rcptNo,
            date: rec.receipt_date || "",
            amount: rec.amount || "0",
            status: rec.status || "POSTED",
            title: rec.notes || (isEmi ? `Advance EMI Payment Receipt ${rcptNo}` : `Retail Cash Receipt ${rcptNo}`),
            docUrl: fullPrintUrl,
            previewUrl: printRoute,
            recommendedTemplate: "PAYMENT_RECEIPT",
            amountToApply: rec.amount || "0",
            refToApply: rcptNo,
            receiptToApply: rcptNo,
          });
        }
      }

      // 3. Subscriptions & Contracts (Rent, Lease, EMI)
      if (subsRes.status === "fulfilled" && subsRes.value?.results) {
        for (const sub of subsRes.value.results) {
          if (sub.customer && sub.customer !== custId) continue;

          const isRentLease = sub.plan_type === "RENT" || sub.plan_type === "LEASE";
          const printRoute = isRentLease
            ? buildAdminRentLeaseContractPrintRoute(sub.id)
            : buildAdminSubscriptionContractPrintRoute(sub.id);
          const fullPrintUrl = typeof window !== "undefined" ? `${window.location.origin}${printRoute}` : "";
          const subRef = sub.contract_reference || sub.subscription_number || `SUB-${sub.id}`;
          const planLabel = isRentLease ? `${sub.plan_type} Contract` : "EMI / Lucky Plan";

          items.push({
            id: `sub-${sub.id}`,
            kind: isRentLease ? "CONTRACT_RENT_LEASE" : "CONTRACT_EMI",
            categoryLabel: planLabel,
            documentNo: subRef,
            date: sub.start_date || (sub.created_at ? sub.created_at.slice(0, 10) : ""),
            amount: sub.total_amount || sub.monthly_amount || "0",
            balance: sub.outstanding_amount || undefined,
            status: sub.status || "ACTIVE",
            title: `${sub.product_name || "Contract"} (${sub.plan_type || "Plan"})${sub.lucky_number ? ` · Lucky #${sub.lucky_number}` : ""}`,
            docUrl: fullPrintUrl,
            previewUrl: printRoute,
            recommendedTemplate: isRentLease ? "BILL_INVOICE" : "DUE_REMINDER",
            amountToApply: sub.monthly_amount || sub.total_amount || "0",
            refToApply: subRef,
          });
        }
      }

      // 4. Outstandings & Overdues
      if (outstandingsRes.status === "fulfilled" && outstandingsRes.value?.results) {
        for (const out of outstandingsRes.value.results) {
          const outRef = out.document_no || out.contract_reference || `OUT-${out.source_id}`;
          const fullDetailUrl = typeof window !== "undefined" && out.detail_url ? `${window.location.origin}${out.detail_url}` : "";

          items.push({
            id: `out-${out.id || out.source_id}`,
            kind: "OUTSTANDING",
            categoryLabel: out.overdue_days > 0 ? `Overdue (${out.overdue_days}d)` : "Outstanding Balance",
            documentNo: outRef,
            date: out.due_date || "",
            amount: out.outstanding_amount || "0",
            balance: out.outstanding_amount,
            status: out.status || (out.overdue_days > 0 ? "OVERDUE" : "PENDING"),
            title: `${out.product_summary || out.operation_type} · Overdue Due`,
            docUrl: fullDetailUrl,
            previewUrl: out.detail_url || "",
            recommendedTemplate: "OUTSTANDING_REMINDER",
            amountToApply: out.outstanding_amount || "0",
            refToApply: outRef,
          });
        }
      }

      setCustomerDocs(items);
    } catch (err) {
      console.warn("Failed to fetch customer documents:", err);
    } finally {
      setIsLoadingDocs(false);
    }
  }, [partyCategory, selectedParty]);

  useEffect(() => {
    void fetchCustomerDocuments();
  }, [fetchCustomerDocuments]);

  // Handler: Select a customer document
  const handleSelectCustomerDoc = (doc: CustomerDocItem) => {
    setSelectedDocId(doc.id);
    setEventType(doc.recommendedTemplate);
    setAmount(doc.amountToApply);
    setRefNo(doc.refToApply);
    if (doc.receiptToApply) {
      setReceiptNo(doc.receiptToApply);
    }
    setDocUrl(doc.docUrl);
    if (doc.date) {
      setDateStr(doc.date);
    }
    setIsBodyManuallyEdited(false);
    setStatusMessage({
      type: "success",
      text: `Loaded ${doc.categoryLabel} (${doc.documentNo}). WhatsApp message details updated!`,
    });
  };

  const handleClearSelectedDoc = () => {
    setSelectedDocId(null);
  };

  // Handler: Select and preview file attachment
  const handleFileSelected = (file: File) => {
    setAttachedFile(file);
    setUploadedDoc(null);
    setImageCopiedNotice(false);

    if (file.type.startsWith("image/")) {
      const previewUrl = URL.createObjectURL(file);
      setAttachedFilePreview(previewUrl);
    } else {
      setAttachedFilePreview(null);
    }
  };

  // Handler: Remove attachment
  const handleRemoveAttachment = () => {
    if (attachedFilePreview) {
      URL.revokeObjectURL(attachedFilePreview);
    }
    setAttachedFile(null);
    setAttachedFilePreview(null);
    setUploadedDoc(null);
    setImageCopiedNotice(false);
  };

  // Handler: Upload file to Document records and link in WhatsApp message
  const handleUploadAttachment = async () => {
    if (!attachedFile) return;
    setIsUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append("file", attachedFile);
      formData.append("title", attachedFile.name);

      let cat: DocumentCategory = "other";
      if (eventType === "BILL_INVOICE") cat = "invoice";
      else if (eventType === "PAYMENT_RECEIPT") cat = "receipt";
      else if (eventType === "DUE_REMINDER" || eventType === "OUTSTANDING_REMINDER") cat = "contract";

      formData.append("category", cat);
      formData.append("description", `Attached via WhatsApp Direct Connect for ${recipientName || "recipient"}`);

      const res = await uploadDocument(formData);
      setUploadedDoc(res);

      const downloadUrl = typeof window !== "undefined"
        ? `${window.location.origin}${documentDownloadUrl(res.id)}`
        : documentDownloadUrl(res.id);

      setDocUrl(downloadUrl);
      setIsBodyManuallyEdited(false);

      setStatusMessage({
        type: "success",
        text: `Uploaded "${attachedFile.name}"! Downloadable link attached to WhatsApp message.`,
      });
    } catch (err) {
      console.error("Document upload error:", err);
      setStatusMessage({
        type: "error",
        text: "Failed to upload document. Please check file format and try again.",
      });
    } finally {
      setIsUploadingFile(false);
    }
  };

  // Handler: Copy image to clipboard for instant Ctrl+V into WhatsApp Web
  const handleCopyImageToClipboard = async () => {
    if (!attachedFile || !attachedFile.type.startsWith("image/")) {
      setStatusMessage({
        type: "error",
        text: "Please attach an image (PNG/JPG) to copy to clipboard.",
      });
      return;
    }

    setIsCopyingImage(true);
    try {
      let pngBlob: Blob | null = null;

      if (attachedFile.type === "image/png") {
        pngBlob = attachedFile;
      } else {
        const img = new Image();
        const objectUrl = URL.createObjectURL(attachedFile);
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("Image decode failed"));
          img.src = objectUrl;
        });

        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
        }
        URL.revokeObjectURL(objectUrl);
      }

      if (!pngBlob) {
        throw new Error("Could not process image blob");
      }

      await navigator.clipboard.write([
        new ClipboardItem({
          "image/png": pngBlob,
        }),
      ]);

      setImageCopiedNotice(true);
      setStatusMessage({
        type: "success",
        text: "Image copied to clipboard! In WhatsApp Web, simply press Ctrl+V to attach it directly to the chat.",
      });
    } catch (err) {
      console.warn("Clipboard copy failed:", err);
      setStatusMessage({
        type: "error",
        text: "Could not copy image automatically. You can drag and drop it into WhatsApp Web directly.",
      });
    } finally {
      setIsCopyingImage(false);
    }
  };

  // Handler: Download file locally so user can drag & drop it into WhatsApp Web
  const handleDownloadLocalAttachment = () => {
    if (!attachedFile) return;
    const url = URL.createObjectURL(attachedFile);
    const a = document.createElement("a");
    a.href = url;
    a.download = attachedFile.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Filter templates for current party category
  const availableTemplates = useMemo(() => {
    if (partyCategory === "DIRECT") {
      return TEMPLATE_OPTIONS;
    }
    return TEMPLATE_OPTIONS.filter(
      (opt) => opt.category === "ALL" || opt.category === partyCategory
    );
  }, [partyCategory]);

  // When party category changes, pick sensible default template
  const handleSelectPartyCategory = (cat: PartyCategory) => {
    setPartyCategory(cat);
    setSelectedParty(null);
    setSearchQuery("");
    setSearchResults([]);
    setIsBodyManuallyEdited(false);
    setCustomerDocs([]);
    setSelectedDocId(null);
    setAttachedFile(null);
    setAttachedFilePreview(null);
    setUploadedDoc(null);
    setImageCopiedNotice(false);

    if (cat === "CUSTOMER") {
      setEventType("BILL_INVOICE");
      setSourceModel("Customer");
    } else if (cat === "VENDOR") {
      setEventType("VENDOR_PO");
      setSourceModel("Vendor");
    } else if (cat === "PARTNER") {
      setEventType("PARTNER_COMMISSION");
      setSourceModel("Partner");
    } else if (cat === "STAFF") {
      setEventType("STAFF_SALARY");
      setSourceModel("Staff");
    } else {
      setEventType("CUSTOM");
      setSourceModel("WhatsAppDirect");
    }
  };

  // Reset or load initial data
  const applyInitialData = useCallback((data?: WhatsAppDirectInitialData) => {
    if (!data) return;
    if (data.partyType) {
      setPartyCategory(data.partyType);
    } else if (data.customerId) {
      setPartyCategory("CUSTOMER");
    } else if (data.phone) {
      setPartyCategory("DIRECT");
    }

    if (data.phone) setPhone(data.phone);
    if (data.name) setRecipientName(data.name);
    if (data.eventType) setEventType(data.eventType);
    if (data.amount !== undefined) setAmount(String(data.amount));
    if (data.ref) setRefNo(data.ref);
    if (data.receipt) setReceiptNo(data.receipt);
    if (data.docUrl) setDocUrl(data.docUrl);
    if (data.product) setProductName(data.product);
    if (data.date) setDateStr(data.date);
    if (data.offerText) setOfferText(data.offerText);
    if (data.text) setCustomText(data.text);
    if (data.deliveryDate) setDeliveryDate(data.deliveryDate);
    if (data.paymentMode) setPaymentMode(data.paymentMode);
    if (data.balance !== undefined) setBalance(String(data.balance));
    if (data.recoveredAmount !== undefined) setRecoveredAmount(String(data.recoveredAmount));
    if (data.presentDays !== undefined) setPresentDays(String(data.presentDays));
    if (data.absentDays !== undefined) setAbsentDays(String(data.absentDays));
    if (data.overtimeHours !== undefined) setOvertimeHours(String(data.overtimeHours));
    if (data.customerName) setReferredCustomerName(data.customerName);
    if (data.period) setPeriod(data.period);
    if (data.sourceModel) setSourceModel(data.sourceModel);
    if (data.sourceId) setSourceId(data.sourceId);

    if (data.customerId) {
      setSelectedParty({
        id: data.customerId,
        name: data.name || "Customer",
        phone: data.phone || "",
        role: "CUSTOMER",
      });
    }

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

  // Search parties across customer, vendor, partner, staff directories
  useEffect(() => {
    if (partyCategory === "DIRECT" || !searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      const query = searchQuery.trim();
      try {
        if (partyCategory === "CUSTOMER") {
          const custs = await searchCustomers(query);
          setSearchResults(
            custs.map((c: CustomerRecord) => ({
              id: c.id,
              name: c.name,
              phone: c.phone || "",
              code: c.customer_code,
              role: "CUSTOMER",
              subtitle: c.city ? `Customer · ${c.city}` : "Customer",
            }))
          );
        } else if (partyCategory === "VENDOR") {
          const res = await listVendors({ search: query });
          const vendorsList: Vendor[] = Array.isArray(res) ? res : res.results || [];
          setSearchResults(
            vendorsList.map((v: Vendor) => ({
              id: v.id,
              name: v.name || v.display_name,
              phone: v.phone || v.whatsapp || "",
              code: v.vendor_code,
              role: "VENDOR",
              subtitle: v.contact_person
                ? `Supplier · Contact: ${v.contact_person}`
                : "Supplier / Vendor",
            }))
          );
        } else if (partyCategory === "PARTNER") {
          // Query CRM party list filtered by PARTNER role
          const res = await apiFetch<{ results?: Array<{ id: number; display_name: string; primary_phone: string; party_no: string }> }>(
            `/crm/parties/?role_type=PARTNER&q=${encodeURIComponent(query)}`
          );
          const partnersList = res.results || [];
          setSearchResults(
            partnersList.map((p) => ({
              id: p.id,
              name: p.display_name,
              phone: p.primary_phone,
              code: p.party_no,
              role: "PARTNER",
              subtitle: "Partner / Franchise",
            }))
          );
        } else if (partyCategory === "STAFF") {
          const res = await listHrStaff({ q: query });
          const staffList = res.results || [];
          setSearchResults(
            staffList.map((s: HrStaff) => ({
              id: s.id,
              name: s.name,
              phone: s.phone || "",
              code: s.employee_code,
              role: "STAFF",
              subtitle: s.designation
                ? `${s.designation} · ${s.department || "Staff"}`
                : "Staff / Employee",
            }))
          );
        }
      } catch (err) {
        console.warn("Party search error:", err);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [searchQuery, partyCategory]);

  // Select party from search dropdown
  const handleSelectParty = (party: UnifiedPartyItem) => {
    setSelectedParty(party);
    setRecipientName(party.name);
    setPhone(party.phone || "");
    setSearchResults([]);
    setSearchQuery("");
    setSourceId(String(party.id));
    setSourceModel(
      party.role === "CUSTOMER"
        ? "Customer"
        : party.role === "VENDOR"
        ? "Vendor"
        : party.role === "PARTNER"
        ? "Partner"
        : "Staff"
    );
  };

  // Default document URL to public catalog if brochure/catalog is chosen
  useEffect(() => {
    if (eventType === "BROCHURE_CATALOG" && !docUrl) {
      if (typeof window !== "undefined") {
        setDocUrl(`${window.location.origin}/products`);
      }
    }
  }, [eventType, docUrl]);

  // Generated message body based on current fields
  const generatedBody = useMemo(() => {
    const name = recipientName.trim() || (partyCategory === "VENDOR" ? "Supplier" : partyCategory === "PARTNER" ? "Partner" : partyCategory === "STAFF" ? "Staff" : "Customer");
    const company = "Subidha Furniture";
    const ref = refNo.trim() || "REF-001";
    const amt = amount.trim() || "0";
    const date = dateStr.trim() || new Date().toISOString().split("T")[0];
    const doc = docUrl.trim();
    const docLinkText = doc ? `\n\n📄 View Document: ${doc}` : "";

    switch (eventType) {
      // --- Customer Templates ---
      case "BILL_INVOICE":
        return `Dear ${name},\nHere is your bill/invoice (${ref}) from ${company}.\nTotal Amount: ₹${amt}.${docLinkText}\n\nThank you for shopping with us! — ${company}`;

      case "PAYMENT_RECEIPT": {
        const rcpt = receiptNo.trim() || ref;
        return `Dear ${name},\nWe have received your payment of ₹${amt} on ${date} for ${ref}.\nReceipt No: ${rcpt}.${docLinkText}\n\nThank you for paying on time. — ${company}`;
      }

      case "OUTSTANDING_REMINDER":
        return `Dear ${name},\nThis is a gentle reminder from ${company}.\nYou have an outstanding balance of ₹${amt} on your account (${ref}).\nPlease clear the payment at your earliest convenience. For UPI payment or support, reply directly to this chat.\n\nThank you, — ${company}`;

      case "DUE_REMINDER":
        return `Dear ${name},\nYour instalment of ₹${amt} for ${ref} is due on ${date}.\nPlease pay on time to keep your plan in good standing.${docLinkText}\n\n— ${company}`;

      case "BROCHURE_CATALOG": {
        const catUrl = doc || (typeof window !== "undefined" ? `${window.location.origin}/products` : "https://subidha.com");
        return `Hello ${name},\nGreetings from ${company}!\n\nHere is our latest furniture collection brochure & digital catalog:\n👉 ${catUrl}\n\nExplore our living, bedroom, and office collections with easy EMI and rent/lease plans. Feel free to reply to this chat for any questions! — ${company}`;
      }

      case "OFFER_PROMOTION": {
        const offer = offerText.trim() || "Special seasonal discount on our best-selling furniture collections!";
        const link = doc ? `\nExplore offers: ${doc}` : "";
        return `🎉 Exciting Offers at ${company}!\n\n${offer}${link}\n\nVisit our showroom or reply to this chat to book your offer today! — ${company}`;
      }

      case "CRM_FOLLOW_UP": {
        const product = productName.trim() || "your furniture inquiry";
        return `Hello ${name},\nFollowing up from ${company} regarding your inquiry for ${product}.\nWe are here to assist you with the best prices, instant EMI options, and fast doorstep delivery. Let us know how we can help you today! — ${company}`;
      }

      // --- Vendor Templates ---
      case "VENDOR_PO": {
        const dDate = deliveryDate.trim() || date;
        const items = productName.trim() ? `\nItems: ${productName.trim()}` : "";
        return `Dear ${name},\nPlease find Purchase Order #${ref} from ${company}.\nOrder Date: ${date}\nTotal Amount: ₹${amt}\nExpected Delivery: ${dDate}${items}${docLinkText}\n\nPlease confirm receipt and dispatch schedule. Thank you! — ${company}`;
      }

      case "VENDOR_LEDGER": {
        const note = refNo.trim() ? `\nRef: ${refNo.trim()}` : "";
        return `Dear ${name},\nHere is your account ledger & outstanding statement from ${company} as of ${date}.\nTotal Outstanding Payable: ₹${amt}${note}${docLinkText}\n\nFor reconciliation or payment inquiries, please reply directly to this chat. Thank you! — ${company}`;
      }

      case "VENDOR_PAYMENT": {
        const mode = paymentMode.trim() || "NEFT / UPI";
        const utr = receiptNo.trim() ? `\nUTR / Ref: ${receiptNo.trim()}` : "";
        return `Dear ${name},\nWe have processed a payment of ₹${amt} against Voucher #${ref} via ${mode} on ${date}.${utr}${docLinkText}\n\nThank you for your business! — ${company}`;
      }

      // --- Partner Templates ---
      case "PARTNER_COMMISSION": {
        const pMonth = period.trim() || date;
        const voucher = refNo.trim() ? `\nVoucher: #${refNo.trim()}` : "";
        return `Dear Partner ${name},\nYour commission payout statement for ${pMonth} from ${company} has been generated.\nNet Commission Payable: ₹${amt}${voucher}${docLinkText}\n\nThank you for your active partnership! — ${company}`;
      }

      case "PARTNER_LEDGER": {
        return `Dear Partner ${name},\nHere is your current partner ledger summary from ${company} as of ${date}.\nCurrent Ledger Balance: ₹${amt}${docLinkText}\n\nPlease reply if you have any questions or reconciliation queries. Thank you! — ${company}`;
      }

      case "PARTNER_REFERRAL": {
        const cust = referredCustomerName.trim() || "New Customer";
        const plan = productName.trim() || "Lucky Plan EMI";
        const lucky = receiptNo.trim() ? `\nLucky ID: ${receiptNo.trim()}` : "";
        return `Dear Partner ${name},\nCustomer enrollment update under your code from ${company}:\nCustomer: ${cust}\nPlan: ${plan}\nContract: #${ref}${lucky}\nMonthly Installment: ₹${amt}\n\nKeep up the great work! — ${company}`;
      }

      // --- Staff Templates ---
      case "STAFF_SALARY": {
        const sMonth = period.trim() || date;
        const outBal = balance.trim() ? `\nOutstanding Balance: ₹${balance.trim()}` : "";
        return `Dear ${name},\nYour salary statement for ${sMonth} from ${company} is ready.\nNet Salary: ₹${amt}${outBal}${docLinkText}\n\nFor payroll inquiries, please contact HR/Accounts. Thank you! — ${company}`;
      }

      case "STAFF_ATTENDANCE": {
        const sMonth = period.trim() || date;
        const pDays = presentDays.trim() || "0";
        const aDays = absentDays.trim() || "0";
        const ot = overtimeHours.trim() ? ` | Overtime: ${overtimeHours.trim()} hrs` : "";
        return `Dear ${name},\nMonthly attendance report for ${sMonth} from ${company}:\nPresent Days: ${pDays} | Absent Days: ${aDays}${ot}${docLinkText}\n\nPlease verify with the HR desk if there are any discrepancies. Thank you! — ${company}`;
      }

      case "STAFF_ADVANCE": {
        const rec = recoveredAmount.trim() ? `\nRecovered this cycle: ₹${recoveredAmount.trim()}` : "";
        const rem = balance.trim() ? `\nRemaining Advance Balance: ₹${balance.trim()}` : "";
        return `Dear ${name},\nStaff advance ledger update from ${company} as of ${date}:\nSanctioned Advance: ₹${amt}${rec}${rem}${docLinkText}\n\nThank you! — ${company}`;
      }

      case "CUSTOM":
      default:
        return customText;
    }
  }, [
    eventType,
    recipientName,
    partyCategory,
    refNo,
    amount,
    dateStr,
    docUrl,
    receiptNo,
    offerText,
    productName,
    customText,
    deliveryDate,
    paymentMode,
    balance,
    recoveredAmount,
    presentDays,
    absentDays,
    overtimeHours,
    referredCustomerName,
    period,
  ]);

  // Actual editable text in preview
  const [editableBody, setEditableBody] = useState("");
  const [isBodyManuallyEdited, setIsBodyManuallyEdited] = useState(false);

  // Synchronize generated body into editableBody unless manually modified
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

  // Log message to backend Outbox for audit trail
  const logMessageToOutbox = useCallback(async () => {
    const payload: DirectWhatsAppComposePayload = {
      phone: normalizedPhone,
      customer: partyCategory === "CUSTOMER" && selectedParty ? selectedParty.id : null,
      name: recipientName.trim(),
      event_type: eventType,
      text: editableBody.trim(),
      amount: amount || undefined,
      ref: refNo || undefined,
      receipt: receiptNo || undefined,
      date: dateStr || undefined,
      product: productName || undefined,
      doc_url: docUrl || undefined,
      offer_text: offerText || undefined,
      delivery_date: deliveryDate || undefined,
      payment_mode: paymentMode || undefined,
      balance: balance || undefined,
      recovered_amount: recoveredAmount || undefined,
      present_days: presentDays || undefined,
      absent_days: absentDays || undefined,
      overtime_hours: overtimeHours || undefined,
      customer_name: referredCustomerName || undefined,
      period: period || undefined,
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
    partyCategory,
    selectedParty,
    recipientName,
    eventType,
    editableBody,
    amount,
    refNo,
    receiptNo,
    dateStr,
    productName,
    docUrl,
    offerText,
    deliveryDate,
    paymentMode,
    balance,
    recoveredAmount,
    presentDays,
    absentDays,
    overtimeHours,
    referredCustomerName,
    period,
    sourceModel,
    sourceId,
  ]);

  // Handler: Open in WhatsApp Web directly
  const handleOpenWhatsAppWeb = () => {
    if (!isValidPhone) {
      setStatusMessage({
        type: "error",
        text: "Please enter a valid 10-digit mobile number.",
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
        text: `Opened in WhatsApp Web for +${normalizedPhone} and logged into Outbox!`,
      });
    });
  };

  // Handler: Open in WhatsApp App (wa.me)
  const handleOpenWhatsAppApp = () => {
    if (!isValidPhone) {
      setStatusMessage({
        type: "error",
        text: "Please enter a valid 10-digit mobile number.",
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
        text: `Opened WhatsApp App for +${normalizedPhone} and logged into Outbox!`,
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

  if (!isOpen) return null;

  return (
    <ModalShell
      open={isOpen}
      onClose={handleClose}
      title="Universal Party WhatsApp Communicator"
      panelClassName="w-full max-w-5xl xl:max-w-6xl max-h-[94vh] flex flex-col p-0 overflow-hidden bg-background border border-border shadow-2xl rounded-2xl"
    >
      {/* Modal Header */}
      <div className="flex items-center justify-between border-b border-border bg-[linear-gradient(180deg,color-mix(in_oklab,var(--surface-muted)_95%,#25D366_5%),var(--surface-card))] px-5 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-[#25D366]/15 text-[#25D366]">
            <MessageCircle className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              WhatsApp Direct Connect · Party Hub
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                100% Free · No API Fees
              </span>
            </h2>
            <p className="text-xs text-muted-foreground">
              Instant communication for Customers, Vendors, Partners, and Staff without saving contacts.
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
        {/* Left Column: Party Selector, Directory Search & Template Form (7 cols) */}
        <div className="md:col-span-7 p-4 sm:p-5 space-y-4 overflow-y-auto max-h-[82vh]">
          {/* Party Category Tabs */}
          <div>
            <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
              Select Recipient Party Category
            </label>
            <div className="grid grid-cols-5 gap-1 rounded-lg border border-border bg-muted/40 p-1">
              <button
                type="button"
                onClick={() => handleSelectPartyCategory("CUSTOMER")}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-md py-1.5 px-2 text-xs font-medium transition",
                  partyCategory === "CUSTOMER"
                    ? "bg-background text-foreground shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Users className="size-3.5 text-blue-500" />
                <span className="hidden sm:inline">Customer</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectPartyCategory("VENDOR")}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-md py-1.5 px-2 text-xs font-medium transition",
                  partyCategory === "VENDOR"
                    ? "bg-background text-foreground shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Building2 className="size-3.5 text-amber-500" />
                <span className="hidden sm:inline">Vendor</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectPartyCategory("PARTNER")}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-md py-1.5 px-2 text-xs font-medium transition",
                  partyCategory === "PARTNER"
                    ? "bg-background text-foreground shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Handshake className="size-3.5 text-purple-500" />
                <span className="hidden sm:inline">Partner</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectPartyCategory("STAFF")}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-md py-1.5 px-2 text-xs font-medium transition",
                  partyCategory === "STAFF"
                    ? "bg-background text-foreground shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Briefcase className="size-3.5 text-emerald-500" />
                <span className="hidden sm:inline">Staff</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectPartyCategory("DIRECT")}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-md py-1.5 px-2 text-xs font-medium transition",
                  partyCategory === "DIRECT"
                    ? "bg-background text-foreground shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Phone className="size-3.5 text-sky-500" />
                <span className="hidden sm:inline">Direct</span>
              </button>
            </div>
          </div>

          {/* Recipient Inputs / Directory Search */}
          {partyCategory === "DIRECT" ? (
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
                  Works even if unsaved in contacts!
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Recipient Name (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Rahul Sharma"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-foreground">
                Search{" "}
                {partyCategory === "CUSTOMER"
                  ? "Customer Directory (Name, Phone, Code)"
                  : partyCategory === "VENDOR"
                  ? "Vendor / Supplier (Name, Code, Contact)"
                  : partyCategory === "PARTNER"
                  ? "Partner / Franchise (Name, Phone, Code)"
                  : "Staff / Employee (Name, Employee ID, Role)"}
              </label>

              <div className="relative">
                <Search className="size-3.5 absolute left-3 top-2.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder={`Search ${partyCategory.toLowerCase()}...`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                />
                {isSearching && (
                  <div className="absolute right-3 top-2.5 text-xs text-muted-foreground">
                    Searching…
                  </div>
                )}
              </div>

              {/* Search results dropdown */}
              {searchResults.length > 0 && (
                <div className="rounded-lg border border-border bg-background shadow-lg max-h-48 overflow-y-auto divide-y divide-border">
                  {searchResults.map((item) => (
                    <button
                      key={`${item.role}-${item.id}`}
                      type="button"
                      onClick={() => handleSelectParty(item)}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-muted/60 flex items-center justify-between"
                    >
                      <div>
                        <span className="font-semibold text-foreground">{item.name}</span>
                        {item.subtitle ? (
                          <span className="ml-2 text-[11px] text-muted-foreground">
                            ({item.subtitle})
                          </span>
                        ) : null}
                      </div>
                      <div className="text-right">
                        <span className="font-mono text-xs text-foreground/80">
                          {item.phone ? `+${item.phone}` : "No phone"}
                        </span>
                        {item.code ? (
                          <div className="text-[10px] text-muted-foreground font-mono">
                            {item.code}
                          </div>
                        ) : null}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Selected Party Banner */}
              {selectedParty ? (
                <div className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs">
                  <div>
                    <span className="font-semibold text-emerald-800 dark:text-emerald-300">
                      {recipientName}
                    </span>
                    {selectedParty.code ? (
                      <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
                        [{selectedParty.code}]
                      </span>
                    ) : null}
                    <span className="ml-2 font-mono text-muted-foreground">
                      {phone ? `+${phone}` : "No number specified"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedParty(null);
                      setRecipientName("");
                      setPhone("");
                    }}
                    className="text-xs text-destructive hover:underline font-medium"
                  >
                    Change
                  </button>
                </div>
              ) : null}
            </div>
          )}

          {/* Customer Documents, Bills, Contracts & Outstandings Workbench */}
          {partyCategory === "CUSTOMER" && selectedParty ? (
            <div className="rounded-xl border border-border bg-card p-3.5 space-y-3 shadow-xs">
              {/* Header with counts and refresh */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
                    <FolderOpen className="size-4" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-foreground">
                      Customer Bills, Contracts &amp; Outstandings
                    </span>
                    <span className="ml-2 text-[10px] rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground font-mono">
                      {customerDocs.length} Total
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void fetchCustomerDocuments()}
                  disabled={isLoadingDocs}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition disabled:opacity-50"
                  title="Refresh customer bills and documents"
                >
                  <RefreshCw className={cn("size-3", isLoadingDocs && "animate-spin")} />
                  <span>{isLoadingDocs ? "Fetching…" : "Refresh"}</span>
                </button>
              </div>

              {/* Active Selection Banner if any */}
              {activeSelectedDoc ? (
                <div className="flex items-center justify-between rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0 pr-2">
                    <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
                    <div className="truncate">
                      <span className="font-semibold text-foreground">
                        {activeSelectedDoc.categoryLabel}: {activeSelectedDoc.documentNo}
                      </span>
                      <span className="ml-2 text-emerald-800 dark:text-emerald-300 font-mono font-medium">
                        ₹{activeSelectedDoc.amount}
                      </span>
                      {activeSelectedDoc.balance ? (
                        <span className="ml-2 text-amber-700 dark:text-amber-400 font-mono text-[11px]">
                          (Due: ₹{activeSelectedDoc.balance})
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {activeSelectedDoc.previewUrl ? (
                      <a
                        href={activeSelectedDoc.previewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                        title="View printable PDF document in a new tab"
                      >
                        <Eye className="size-3" />
                        <span>View PDF</span>
                      </a>
                    ) : null}
                    <button
                      type="button"
                      onClick={handleClearSelectedDoc}
                      className="text-[11px] text-muted-foreground hover:text-destructive underline"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              ) : null}

              {/* Filter Tabs */}
              <div className="flex flex-wrap items-center gap-1 border-b border-border pb-2 text-[11px]">
                <button
                  type="button"
                  onClick={() => setDocFilter("ALL")}
                  className={cn(
                    "rounded-md px-2 py-1 font-medium transition",
                    docFilter === "ALL"
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  All ({customerDocs.length})
                </button>
                <button
                  type="button"
                  onClick={() => setDocFilter("INVOICES")}
                  className={cn(
                    "rounded-md px-2 py-1 font-medium transition",
                    docFilter === "INVOICES"
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  Bills &amp; Invoices ({invoicesCount})
                </button>
                <button
                  type="button"
                  onClick={() => setDocFilter("RECEIPTS")}
                  className={cn(
                    "rounded-md px-2 py-1 font-medium transition",
                    docFilter === "RECEIPTS"
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  Receipts ({receiptsCount})
                </button>
                <button
                  type="button"
                  onClick={() => setDocFilter("RENT_LEASE")}
                  className={cn(
                    "rounded-md px-2 py-1 font-medium transition",
                    docFilter === "RENT_LEASE"
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  Rent &amp; Lease ({rentLeaseCount})
                </button>
                <button
                  type="button"
                  onClick={() => setDocFilter("EMI")}
                  className={cn(
                    "rounded-md px-2 py-1 font-medium transition",
                    docFilter === "EMI"
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  EMI Plans ({emiCount})
                </button>
                <button
                  type="button"
                  onClick={() => setDocFilter("OUTSTANDINGS")}
                  className={cn(
                    "rounded-md px-2 py-1 font-medium transition",
                    docFilter === "OUTSTANDINGS"
                      ? "bg-amber-500 text-slate-950 font-semibold"
                      : "text-amber-600 dark:text-amber-400 hover:bg-muted font-medium"
                  )}
                >
                  Outstandings ({outstandingsCount})
                </button>
              </div>

              {/* Document List */}
              {isLoadingDocs ? (
                <div className="py-6 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-2">
                  <RefreshCw className="size-4 animate-spin text-primary" />
                  <span>Fetching bills, receipts, contracts &amp; outstandings from system...</span>
                </div>
              ) : filteredDocs.length === 0 ? (
                <div className="py-4 text-center text-xs text-muted-foreground bg-muted/20 rounded-lg border border-dashed border-border p-3">
                  No documents found in this category for {recipientName}. You can type details manually below or attach a PDF / image.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {filteredDocs.map((doc) => {
                    const isSelected = selectedDocId === doc.id;
                    return (
                      <div
                        key={doc.id}
                        onClick={() => handleSelectCustomerDoc(doc)}
                        className={cn(
                          "group relative flex items-center justify-between p-2.5 rounded-lg border text-xs cursor-pointer transition",
                          isSelected
                            ? "border-emerald-500 bg-emerald-500/10 shadow-sm"
                            : "border-border bg-background hover:border-primary/50 hover:bg-muted/40"
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 pr-2">
                          <div
                            className={cn(
                              "flex size-7 shrink-0 items-center justify-center rounded-md font-semibold text-[11px]",
                              doc.kind === "INVOICE"
                                ? "bg-blue-500/10 text-blue-600"
                                : doc.kind === "RECEIPT"
                                ? "bg-emerald-500/10 text-emerald-600"
                                : doc.kind === "OUTSTANDING"
                                ? "bg-amber-500/10 text-amber-600"
                                : "bg-purple-500/10 text-purple-600"
                            )}
                          >
                            {doc.kind === "INVOICE" ? (
                              <FileText className="size-3.5" />
                            ) : doc.kind === "RECEIPT" ? (
                              <Receipt className="size-3.5" />
                            ) : doc.kind === "OUTSTANDING" ? (
                              <AlertCircle className="size-3.5" />
                            ) : (
                              <Coins className="size-3.5" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-foreground truncate">
                                {doc.documentNo}
                              </span>
                              <span className="text-[10px] rounded px-1.5 py-0.5 bg-muted text-muted-foreground uppercase font-mono">
                                {doc.categoryLabel}
                              </span>
                              {doc.status ? (
                                <span
                                  className={cn(
                                    "text-[9px] rounded px-1.5 py-0.2 font-semibold uppercase",
                                    doc.status === "POSTED" || doc.status === "ACTIVE" || doc.status === "PAID"
                                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                      : doc.status === "OVERDUE"
                                      ? "bg-red-500/10 text-red-600"
                                      : "bg-amber-500/10 text-amber-700"
                                  )}
                                >
                                  {doc.status}
                                </span>
                              ) : null}
                            </div>
                            <p className="text-[11px] text-muted-foreground truncate max-w-[280px]">
                              {doc.title} {doc.date ? `· ${doc.date}` : ""}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            <div className="font-semibold font-mono text-foreground text-xs">
                              ₹{doc.amount}
                            </div>
                            {doc.balance ? (
                              <div className="text-[10px] text-amber-600 dark:text-amber-400 font-mono font-medium">
                                Due: ₹{doc.balance}
                              </div>
                            ) : null}
                          </div>

                          <div className="flex items-center gap-1">
                            {doc.previewUrl ? (
                              <a
                                href={doc.previewUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                                title="View PDF / Printable Document"
                              >
                                <Eye className="size-3.5" />
                              </a>
                            ) : null}
                            <button
                              type="button"
                              className={cn(
                                "rounded px-2 py-1 text-[11px] font-semibold transition",
                                isSelected
                                  ? "bg-emerald-600 text-white"
                                  : "bg-muted text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground"
                              )}
                            >
                              {isSelected ? "Selected" : "Select"}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}

          {/* Template Selection */}
          <div>
            <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
              Select Message Preset
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {availableTemplates.map((opt) => {
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

          {/* Dynamic Template Details Form */}
          <div className="rounded-xl border border-border bg-muted/20 p-3.5 space-y-3">
            <div className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>Template Details</span>
              <span className="text-[11px] font-normal text-muted-foreground">
                Auto-generates message body
              </span>
            </div>

            {/* Customer Bill / Receipt / Due / Outstanding */}
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
                    Document / PDF Link
                  </label>
                  <input
                    type="text"
                    placeholder="https://.../portal/receipt/123 or invoice link"
                    value={docUrl}
                    onChange={(e) => setDocUrl(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none font-mono"
                  />
                </div>
              </div>
            )}

            {/* Vendor Purchase Order (PO) */}
            {eventType === "VENDOR_PO" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-foreground mb-1">
                    PO Number / Ref
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. PO-2026-081"
                    value={refNo}
                    onChange={(e) => setRefNo(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-foreground mb-1">
                    Total Order Value (₹)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 85,000"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-foreground mb-1">
                    Expected Delivery Date
                  </label>
                  <input
                    type="date"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-foreground mb-1">
                    Items / Remarks
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 5x Teak Dining Sets (4-seater)"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-medium text-foreground mb-1">
                    PO Document / PDF Link
                  </label>
                  <input
                    type="text"
                    placeholder="https://.../portal/purchases/po/81 or document link"
                    value={docUrl}
                    onChange={(e) => setDocUrl(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none font-mono"
                  />
                </div>
              </div>
            )}

            {/* Vendor Ledger & Outstanding */}
            {eventType === "VENDOR_LEDGER" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-foreground mb-1">
                    Outstanding Payable (₹)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 45,200"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-foreground mb-1">
                    Statement Date
                  </label>
                  <input
                    type="date"
                    value={dateStr}
                    onChange={(e) => setDateStr(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-medium text-foreground mb-1">
                    Ledger Statement / Reconciliation Link
                  </label>
                  <input
                    type="text"
                    placeholder="https://.../portal/ledger/vendor/12 or statement PDF"
                    value={docUrl}
                    onChange={(e) => setDocUrl(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none font-mono"
                  />
                </div>
              </div>
            )}

            {/* Vendor Payment Advice */}
            {eventType === "VENDOR_PAYMENT" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-foreground mb-1">
                    Amount Paid (₹)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 35,000"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-foreground mb-1">
                    Payment Mode
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. NEFT / RTGS / UPI"
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-foreground mb-1">
                    Voucher / Bill Ref
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. VCH-2026-104"
                    value={refNo}
                    onChange={(e) => setRefNo(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-foreground mb-1">
                    UTR / Cheque Ref No
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. UTR-HDFC98427189"
                    value={receiptNo}
                    onChange={(e) => setReceiptNo(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* Partner Commission Payout */}
            {eventType === "PARTNER_COMMISSION" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-foreground mb-1">
                    Commission Period / Month
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. October 2026"
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-foreground mb-1">
                    Net Commission Payable (₹)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 14,500"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-medium text-foreground mb-1">
                    Commission Statement / Payout Slip Link
                  </label>
                  <input
                    type="text"
                    placeholder="https://.../portal/partner/payouts/52 or statement link"
                    value={docUrl}
                    onChange={(e) => setDocUrl(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none font-mono"
                  />
                </div>
              </div>
            )}

            {/* Partner Ledger & Balance */}
            {eventType === "PARTNER_LEDGER" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-foreground mb-1">
                    Current Partner Balance (₹)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 22,800"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-foreground mb-1">
                    Statement Date
                  </label>
                  <input
                    type="date"
                    value={dateStr}
                    onChange={(e) => setDateStr(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-medium text-foreground mb-1">
                    Partner Ledger Statement Link
                  </label>
                  <input
                    type="text"
                    placeholder="https://.../portal/partner/ledger or statement PDF"
                    value={docUrl}
                    onChange={(e) => setDocUrl(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none font-mono"
                  />
                </div>
              </div>
            )}

            {/* Partner Customer Referral */}
            {eventType === "PARTNER_REFERRAL" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-foreground mb-1">
                    Referred Customer Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Amit Sengupta"
                    value={referredCustomerName}
                    onChange={(e) => setReferredCustomerName(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-foreground mb-1">
                    Contract / Subscription No
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. SUB-2026-089"
                    value={refNo}
                    onChange={(e) => setRefNo(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-foreground mb-1">
                    Plan / Scheme Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Lucky Plan Diamond (₹5,000/mo)"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-foreground mb-1">
                    Lucky ID / Unit No
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. #042"
                    value={receiptNo}
                    onChange={(e) => setReceiptNo(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* Staff Salary Slip & Outstanding */}
            {eventType === "STAFF_SALARY" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-foreground mb-1">
                    Salary Period / Month
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. October 2026"
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-foreground mb-1">
                    Net Salary Amount (₹)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 24,000"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-foreground mb-1">
                    Pending / Outstanding Salary (₹)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 0 or pending amount"
                    value={balance}
                    onChange={(e) => setBalance(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-foreground mb-1">
                    Pay Slip Link (Online)
                  </label>
                  <input
                    type="text"
                    placeholder="https://.../portal/staff/payroll/12 or slip PDF"
                    value={docUrl}
                    onChange={(e) => setDocUrl(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none font-mono"
                  />
                </div>
              </div>
            )}

            {/* Staff Attendance Report */}
            {eventType === "STAFF_ATTENDANCE" && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-foreground mb-1">
                    Present Days
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 26"
                    value={presentDays}
                    onChange={(e) => setPresentDays(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-foreground mb-1">
                    Absent Days
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 2"
                    value={absentDays}
                    onChange={(e) => setAbsentDays(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-foreground mb-1">
                    Overtime (Hours)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 8.5"
                    value={overtimeHours}
                    onChange={(e) => setOvertimeHours(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-[11px] font-medium text-foreground mb-1">
                    Attendance Calendar / Sheet Link
                  </label>
                  <input
                    type="text"
                    placeholder="https://.../portal/staff/attendance or report link"
                    value={docUrl}
                    onChange={(e) => setDocUrl(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none font-mono"
                  />
                </div>
              </div>
            )}

            {/* Staff Advance & Balance */}
            {eventType === "STAFF_ADVANCE" && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-foreground mb-1">
                    Sanctioned Advance (₹)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 10,000"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-foreground mb-1">
                    Recovered This Cycle (₹)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 2,500"
                    value={recoveredAmount}
                    onChange={(e) => setRecoveredAmount(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-foreground mb-1">
                    Remaining Balance (₹)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 7,500"
                    value={balance}
                    onChange={(e) => setBalance(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-[11px] font-medium text-foreground mb-1">
                    Advance Ledger Link
                  </label>
                  <input
                    type="text"
                    placeholder="https://.../portal/staff/advances or statement link"
                    value={docUrl}
                    onChange={(e) => setDocUrl(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none font-mono"
                  />
                </div>
              </div>
            )}

            {/* Custom Message Field */}
            {eventType === "CUSTOM" && (
              <div>
                <label className="block text-[11px] font-medium text-foreground mb-1">
                  Custom Message Content
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

          {/* Attach & Send PDF / Image / Document Hub */}
          <div className="rounded-xl border border-border bg-card p-3.5 space-y-3 shadow-xs">
            <div className="text-xs font-semibold text-foreground flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Paperclip className="size-3.5 text-primary" />
                <span>Attach PDF, Bill Scan or Image</span>
              </div>
              <span className="text-[11px] font-normal text-muted-foreground">
                Fast WhatsApp Web integration
              </span>
            </div>

            {!attachedFile ? (
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-border hover:border-primary/60 rounded-xl p-4 cursor-pointer bg-background/50 hover:bg-muted/30 transition text-center group">
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelected(file);
                  }}
                  className="hidden"
                />
                <UploadCloud className="size-6 text-muted-foreground group-hover:text-primary transition mb-1.5" />
                <span className="text-xs font-medium text-foreground">
                  Click or drag &amp; drop to attach Bill, Receipt, or Doc
                </span>
                <span className="text-[10px] text-muted-foreground mt-0.5">
                  Supports PDF, PNG, JPG, JPEG, WEBP (Max 15MB)
                </span>
              </label>
            ) : (
              <div className="rounded-xl border border-border bg-background p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {attachedFilePreview ? (
                      <img
                        src={attachedFilePreview}
                        alt="Preview"
                        className="size-11 rounded-lg object-cover border border-border shrink-0 shadow-xs"
                      />
                    ) : (
                      <div className="flex size-11 items-center justify-center rounded-lg bg-red-500/10 text-red-600 font-bold text-xs shrink-0">
                        PDF
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-foreground truncate max-w-[220px]">
                        {attachedFile.name}
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono">
                        {(attachedFile.size / 1024).toFixed(1)} KB · {attachedFile.type || "Document"}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleRemoveAttachment}
                    className="p-1 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition"
                    title="Remove attachment"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>

                {/* Action buttons for attached file */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 pt-1 border-t border-border">
                  {/* If image, offer Copy Image (Ctrl+V) */}
                  {attachedFile.type.startsWith("image/") ? (
                    <button
                      type="button"
                      onClick={handleCopyImageToClipboard}
                      disabled={isCopyingImage}
                      className="flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 py-1.5 px-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300 transition cursor-pointer"
                      title="Copies image to clipboard so you can press Ctrl+V directly in WhatsApp Web to attach it"
                    >
                      <Copy className="size-3" />
                      <span>{imageCopiedNotice ? "Copied! (Ctrl+V)" : "Copy Image"}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleDownloadLocalAttachment}
                      className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background hover:bg-muted py-1.5 px-2 text-xs font-medium text-foreground transition cursor-pointer"
                      title="Download locally to drag & drop into WhatsApp Web"
                    >
                      <ExternalLink className="size-3" />
                      <span>Save / Drag</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleUploadAttachment}
                    disabled={isUploadingFile || Boolean(uploadedDoc)}
                    className="sm:col-span-2 flex items-center justify-center gap-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground py-1.5 px-2 text-xs font-semibold transition disabled:opacity-50 cursor-pointer"
                    title="Uploads to system documents and sets public link into WhatsApp message text"
                  >
                    <UploadCloud className="size-3.5" />
                    <span>
                      {isUploadingFile
                        ? "Uploading…"
                        : uploadedDoc
                        ? "✓ Uploaded & Linked"
                        : "Upload & Insert Link in Chat"}
                    </span>
                  </button>
                </div>

                <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 px-2.5 py-1.5 text-[11px] text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                  <Sparkles className="size-3 shrink-0 text-emerald-600" />
                  <span>
                    <strong>WhatsApp Web Tip:</strong> You can click <em>Copy Image</em> and press <kbd className="rounded bg-black/10 dark:bg-white/10 px-1 py-0.2 font-mono">Ctrl+V</kbd> directly inside your WhatsApp Web chat, or drag &amp; drop PDFs!
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Live Message Preview & Send Actions (5 cols) */}
        <div className="md:col-span-5 p-4 sm:p-5 bg-muted/10 flex flex-col justify-between space-y-4">
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
                    {recipientName || (partyCategory === "VENDOR" ? "Vendor / Supplier" : partyCategory === "PARTNER" ? "Partner / Franchise" : partyCategory === "STAFF" ? "Staff / Employee" : "Customer")}
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

            {/* Active Attachment / Link Info Box */}
            {(docUrl || attachedFile || activeSelectedDoc) ? (
              <div className="rounded-xl border border-border bg-card p-2.5 text-xs space-y-1.5 shadow-xs">
                <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  <span>Linked Document &amp; Media</span>
                  {activeSelectedDoc ? (
                    <span className="text-emerald-600 font-mono text-[10px]">Active Record</span>
                  ) : null}
                </div>

                {activeSelectedDoc ? (
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="truncate text-foreground font-semibold">
                      {activeSelectedDoc.documentNo} ({activeSelectedDoc.categoryLabel})
                    </span>
                    <span className="font-mono text-emerald-700 dark:text-emerald-300">
                      ₹{activeSelectedDoc.amount}
                    </span>
                  </div>
                ) : null}

                {docUrl ? (
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono truncate">
                    <FileText className="size-3 shrink-0 text-primary" />
                    <span className="truncate">{docUrl}</span>
                  </div>
                ) : null}

                {attachedFile ? (
                  <div className="flex items-center justify-between text-[11px] pt-1 border-t border-border">
                    <span className="text-foreground truncate max-w-[180px]">
                      📎 {attachedFile.name}
                    </span>
                    {imageCopiedNotice ? (
                      <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 rounded px-1.5 py-0.5">
                        Copied to Clipboard! (Ctrl+V)
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {(attachedFile.size / 1024).toFixed(0)} KB
                      </span>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}

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
            {imageCopiedNotice ? (
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-2 text-center text-xs text-emerald-800 dark:text-emerald-300 font-semibold animate-pulse">
                📸 Image ready on clipboard! Once WhatsApp Web opens, press <kbd className="rounded bg-black/10 dark:bg-white/10 px-1 py-0.5 font-mono">Ctrl+V</kbd> to attach it.
              </div>
            ) : null}

            {/* Primary Action: WhatsApp Web Direct */}
            <button
              type="button"
              onClick={handleOpenWhatsAppWeb}
              disabled={!isValidPhone || !editableBody.trim()}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#25D366] hover:bg-[#22c35e] text-slate-950 font-bold py-2.5 px-4 shadow-lg shadow-[#25D366]/20 transition disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
            >
              <ExternalLink className="size-4" />
              <span>Open in WhatsApp Web</span>
              <span className="text-[10px] bg-slate-950/15 text-slate-950 rounded px-1.5 py-0.5 ml-1">
                Direct Chat
              </span>
            </button>

            {/* Secondary Actions: wa.me and Copy */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleOpenWhatsAppApp}
                disabled={!isValidPhone || !editableBody.trim()}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background hover:bg-muted py-2 text-xs font-semibold text-foreground transition disabled:opacity-50"
                title="Open directly in WhatsApp Desktop or Mobile App"
              >
                <MessageCircle className="size-3.5 text-[#25D366]" />
                <span>WhatsApp App</span>
              </button>

              <button
                type="button"
                onClick={handleCopyMessage}
                disabled={!editableBody.trim()}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background hover:bg-muted py-2 text-xs font-semibold text-foreground transition disabled:opacity-50"
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

            <p className="text-[11px] text-center text-muted-foreground pt-1">
              Zero paid API charges. Logs into Outbox automatically.
            </p>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
