import type { FaqItem } from "@/components/public/FaqBlock";
import type { TimelineStep } from "@/components/public/ProcessTimeline";

export const LUCKY_PLAN_FAQ: FaqItem[] = [
  {
    question: "How do batches work?",
    answer:
      "A batch is a managed customer group for a monthly Lucky Plan cycle. It keeps participation and winner publication consistent and easy to explain.",
  },
  {
    question: "How are Lucky IDs assigned?",
    answer:
      "Lucky IDs are allocated within a batch from 00 to 99 based on availability at the time of enrollment.",
  },
  {
    question: "How do monthly payments work?",
    answer:
      "You pay monthly EMI according to your contract schedule. Payment entries are posted as auditable records and not silently overwritten.",
  },
  {
    question: "What happens when a winner is declared?",
    answer:
      "When a winner is confirmed, remaining future EMI obligations are waived according to business rules. Previously paid EMI remains valid.",
  },
  {
    question: "Is previously paid EMI refunded if I win?",
    answer:
      "No. Winning waives future EMI only. Past paid EMI is not refunded.",
  },
] as const;

export const HOW_IT_WORKS_STEPS: TimelineStep[] = [
  {
    title: "Choose product category",
    description:
      "Select furniture, electronics, or home appliances that match your family needs and monthly comfort.",
  },
  {
    title: "Join an active batch",
    description:
      "The branch helps you join an active batch where Lucky IDs are available and timeline is suitable.",
  },
  {
    title: "Receive your Lucky ID (00–99)",
    description:
      "A Lucky ID is assigned in the selected batch and used for monthly draw participation.",
  },
  {
    title: "Pay EMI month by month",
    description:
      "EMI payments are recorded as transactions to keep history auditable and easy to verify.",
  },
  {
    title: "Winner is published transparently",
    description:
      "Winners are published from revealed draw records; the site does not invent results.",
  },
  {
    title: "Winner benefit applies to future EMI",
    description:
      "Future EMI may be waived by plan rule, while already settled EMI remains unchanged.",
  },
] as const;

export const PUBLIC_MULTILINGUAL_COPY = {
  en: {
    hero: "Bring Home Furniture, Electronics, and Home Appliances with Easy Monthly Plans.",
    subtitle:
      "Choose your product, join the plan, and enjoy a simple, transparent path to ownership.",
  },
  hi: {
    hero: "फर्नीचर, इलेक्ट्रॉनिक्स और होम अप्लायंसेज़ अब आसान मासिक योजना के साथ घर लाएँ।",
    subtitle:
      "अपना पसंदीदा सामान चुनें, योजना में शामिल हों और आसान किस्तों में खरीदारी करें।",
  },
  bn: {
    hero: "সহজ মাসিক পরিকল্পনায় ফার্নিচার, ইলেকট্রনিক্স ও হোম অ্যাপ্লায়েন্সস ঘরে আনুন।",
    subtitle:
      "আপনার পছন্দের পণ্য বেছে নিন, পরিকল্পনায় যুক্ত হন, আর সহজ কিস্তিতে ঘরে তুলুন।",
  },
} as const;

export const PUBLIC_PURPOSE_BADGES = [
  {
    title: "Furniture-first local business",
    description: "Subidha Furniture is focused on practical household furniture and related categories for local families.",
  },
  {
    title: "Secure customer profiles",
    description: "Customer records are managed through secure account and profile workflows with role-based access controls.",
  },
  {
    title: "Receipt-led payment proof",
    description: "Payments are treated as valid only when the system generates an official receipt record.",
  },
  {
    title: "Document transparency",
    description: "Contracts, invoices, receipts, and delivery records are generated to keep customer transactions traceable.",
  },
  {
    title: "Approval and KYC checks",
    description: "Contract activation and delivery can require verification and business approval depending on policy.",
  },
  {
    title: "Customer dashboard visibility",
    description: "Customers can view their own contracts, invoices, receipts, deliveries, KYC status, and support requests.",
  },
] as const;

export const PUBLIC_LEGAL_DISCLAIMER_POINTS = [
  "Website content is for customer information and service explanation only.",
  "Final rights and obligations are governed by approved contract, invoice, receipt, delivery note, return inspection record, and business policy.",
  "Advance EMI/Lucky Plan participation does not guarantee winning.",
  "Rent/Lease deposit refund is subject to return condition, dues clearance, and approved inspection.",
  "Warranty/service depends on product, vendor, and category terms.",
  "Business may verify KYC, reject incomplete requests, correct clerical errors, and update policies where legally permitted.",
  "For exact terms, customers should contact Subidha Furniture before payment or contract signing.",
] as const;

export const READ_BEFORE_APPLY = {
  advanceEmi: [
    "Lucky ID assignment does not guarantee winning.",
    "Future EMI waiver applies only after valid winner approval under business rules.",
    "Paid EMI before winning is not automatically refunded unless a separate approved policy states so.",
    "Final terms depend on approved subscription contract, receipt records, KYC, and business verification.",
  ],
  rent: [
    "Rent is usage-based access, not ownership purchase unless separately invoiced.",
    "Security deposit is refundable only after return inspection and dues/deduction checks.",
    "Late dues, damage, missing parts, or policy deductions can reduce refund amount.",
    "Final terms depend on approved rent contract, deposit receipt, inspection report, and business approval.",
  ],
  lease: [
    "Lease is a longer-term usage contract with approved tenure and payment schedule.",
    "Renewal, extension, or upgrade is not automatic and requires admin approval.",
    "Deposit refund depends on return condition and dues clearance.",
    "Final terms depend on approved lease contract, payment records, handover documents, and inspection.",
  ],
  directSale: [
    "Direct sale return/exchange is not automatic and depends on invoice terms and product condition.",
    "Warranty/service coverage varies by product category, brand/vendor, and approved terms.",
    "Delivery may depend on payment status, stock availability, and verification checks.",
    "Final terms depend on invoice, receipt, delivery note, and approved business policy.",
  ],
} as const;

export const POLICY_TIMELINE = [
  { title: "Enquiry and product fit", description: "Customer selects suitable product and plan path: Advance EMI, Rent, Lease, or Direct Sale." },
  { title: "KYC and approval checks", description: "Business may verify identity, address, and required records before activation/delivery." },
  { title: "Contract and billing records", description: "Approved workflow generates contract/invoice schedules and receipt-backed payment tracking." },
  { title: "Delivery and handover evidence", description: "Delivery/handover is documented with condition acknowledgement and operational checks." },
  { title: "Service, return, and support", description: "Support/inspection workflows apply according to policy, contract terms, and product condition." },
] as const;

export const ADVANCE_EMI_POLICY = {
  title: "Advance EMI / Lucky Plan rules",
  intro:
    "Advance EMI is structured monthly payment for product ownership under approved subscription workflows. This section explains operational rules for public understanding; approved contract and records remain authoritative.",
  cards: [
    {
      title: "Product and contract value",
      points: [
        "Product base price is treated as total contract value unless approved rules define otherwise.",
        "Monthly EMI is generally derived from total contract value divided by tenure months.",
        "Contract records include product, tenure, batch, Lucky ID, and customer details.",
      ],
    },
    {
      title: "Batch and Lucky ID",
      points: [
        "Advance EMI operates through defined batches.",
        "A customer may receive one or more Lucky IDs according to approved subscription rules.",
        "Lucky ID is batch-specific and linked to subscription records.",
        "Lucky ID assignment does not guarantee winning.",
      ],
    },
    {
      title: "Payment responsibility",
      points: [
        "Customer must pay scheduled EMI until contract closure or approved winner benefit applies.",
        "Payments must use approved methods such as cash, UPI, bank transfer, or configured channels.",
        "Each valid payment should generate an official receipt.",
        "Customers should not treat a payment as complete without receipt evidence.",
      ],
    },
    {
      title: "Lucky draw and waiver",
      points: [
        "Winner benefit applies to future EMI waiver only.",
        "Already paid EMI is not automatically refunded unless a separate approved policy allows it.",
        "Waiver applies from approved winner month onward for pending EMI only.",
        "Waiver does not remove KYC, delivery, documentation, or handover checks.",
      ],
    },
    {
      title: "Delivery and controls",
      points: [
        "Delivery may require KYC, contract verification, stock availability, address checks, and payment review.",
        "Delivery/handover records should be generated at completion.",
        "Customer should inspect product condition during handover.",
      ],
    },
    {
      title: "Cancellation, transfer, and default",
      points: [
        "Cancellation, transfer, and default are governed by approved contract terms.",
        "Lucky ID or contract rights cannot be transferred without admin approval.",
        "Missed payments may affect eligibility, service, delivery, or contract status per policy.",
      ],
    },
  ],
} as const;

export const RENT_POLICY = {
  title: "Rent policy",
  intro:
    "Rent supports short or flexible product usage without full ownership transfer. Exact obligations are governed by approved contract and documented records.",
  cards: [
    {
      title: "Purpose and deposit",
      points: [
        "Rent serves temporary or flexible usage needs.",
        "Rent may require refundable security/caution deposit based on product value and policy.",
        "Deposit is separate from monthly rent income.",
      ],
    },
    {
      title: "Billing and payment",
      points: [
        "Rent charges follow approved cycle and due date.",
        "Valid payment must be backed by rent demand/invoice and receipt.",
        "Late payment may affect continuation, renewal, or future eligibility.",
      ],
    },
    {
      title: "Possession responsibility",
      points: [
        "Product remains business property unless separately sold through direct sale invoice.",
        "Customer is responsible for misuse, unauthorized relocation, damage, missing parts, or abnormal wear.",
      ],
    },
    {
      title: "Return inspection and refund",
      points: [
        "Return inspection can classify condition as normal, repair-required, damaged, missing-parts, or cleaning/service-required.",
        "Refund cannot exceed refundable deposit balance.",
        "Approved deductions may include pending dues, repair, damage, cleaning, transport, or policy-approved charges.",
        "Refund approval should be documented and traceable.",
      ],
    },
  ],
} as const;

export const LEASE_POLICY = {
  title: "Lease policy",
  intro:
    "Lease supports longer-term furniture usage through approved tenure and structured payment records, with possible renewal or upgrade subject to business approval.",
  cards: [
    {
      title: "Contract structure",
      points: [
        "Lease tenure may be 6/9/12 months or other approved periods.",
        "Renewal, extension, and upgrade require admin approval.",
      ],
    },
    {
      title: "Deposit and monthly lease charges",
      points: [
        "Lease may require refundable deposit based on product value and policy.",
        "Deposit is separate from lease payment.",
        "Pending dues can affect renewal, upgrade, return clearance, and deposit refund.",
      ],
    },
    {
      title: "Upgrade and renewal conditions",
      points: [
        "Upgrade is not automatic.",
        "Eligibility can depend on payment history, product availability, KYC status, return condition, and approval.",
      ],
    },
    {
      title: "Handover and return",
      points: [
        "Product handover must be documented.",
        "Customer must return product in acceptable condition.",
        "Damage, missing parts, or service costs may be deducted from eligible refundable amount.",
      ],
    },
  ],
} as const;

export const DIRECT_SALE_POLICY = {
  title: "Direct sale policy",
  intro:
    "Direct sale is standard purchase flow through store/public enquiry/admin billing with invoice and receipt-backed records.",
  cards: [
    {
      title: "Invoice and payment",
      points: [
        "Direct sale should generate invoice/order records with product, quantity, pricing, customer details, and delivery status.",
        "Payment can be full or approved partial as per policy.",
        "Each payment must produce a valid receipt.",
      ],
    },
    {
      title: "Ownership and delivery controls",
      points: [
        "Ownership transfer depends on invoice, payment completion, and delivery/handover policy.",
        "For approved partial payment cases, delivery/ownership control may stay restricted until dues are cleared.",
      ],
    },
    {
      title: "Return and exchange",
      points: [
        "Return/exchange depends on category, condition, invoice date, usage, packaging, and approved policy.",
        "Customized, used, installed, or damaged products may be non-returnable unless specifically approved.",
        "Return/exchange is not automatic.",
      ],
    },
    {
      title: "Warranty and service",
      points: [
        "Warranty/service depends on product category, brand/vendor terms, and invoice conditions.",
        "Coverage usually excludes misuse, accidental damage, water/fire/pest damage, unauthorized repair, commercial misuse, and abnormal wear.",
      ],
    },
  ],
} as const;

export const GENERIC_POLICIES = {
  delivery: {
    title: "Delivery policy",
    points: [
      "Delivery is scheduled after order/contract approval and stock/payment verification.",
      "Customer must provide correct address and contact details; address verification may be required.",
      "Customer or authorized receiver should be present at delivery.",
      "OTP/signature/photo/document acknowledgement may be required if supported.",
      "Visible mismatch or damage should be reported during handover.",
      "Delay can occur due to stock, payment, KYC, address, or logistics constraints.",
      "Delivery/handover document is the official delivery record.",
    ],
  },
  returnInspection: {
    title: "Return, exchange, damage, and inspection policy",
    points: [
      "Direct sale return/exchange follows invoice terms and condition checks.",
      "Rent/lease returns require inspection for damage, stains, hardware, breakage, misuse, and working condition.",
      "Normal wear and customer-caused damage are treated differently under policy.",
      "Deductions must be recorded with reason and evidence.",
      "Deposit refund/deduction decisions should stay traceable in system records.",
    ],
  },
  warrantyService: {
    title: "Warranty and service policy",
    points: [
      "Warranty is subject to product category, vendor/brand terms, and approved invoice/contract conditions.",
      "Service requests can be raised through official customer support channels.",
      "Timeline depends on issue type, parts availability, vendor support, and technician capacity.",
      "Rent/lease service responsibility depends on contract terms and damage cause.",
    ],
  },
  paymentAccount: {
    title: "Payment, receipt, and account policy",
    points: [
      "Accepted payment methods include cash, UPI, bank transfer, and approved configured methods.",
      "Customers should collect or download receipt after payment.",
      "Payment without valid receipt should not be treated as final.",
      "Receipt records should include number, date, amount, method, reference, and collected-by trace.",
      "Customer dashboard access is limited to own contracts/payments/invoices/receipts/delivery/support data.",
      "Corrections, reversals, and refunds must follow approved audit workflow.",
    ],
  },
  kycVerification: {
    title: "KYC and customer verification policy",
    points: [
      "Registration or enquiry does not guarantee approval.",
      "Business may require phone, address, ID/KYC, photo, signature, or other verification before activation/delivery.",
      "Incorrect, incomplete, or unverifiable records can delay or reject approvals.",
      "Customers should keep phone/email/address information updated.",
      "KYC records are used for verification and contract safety.",
    ],
  },
} as const;
