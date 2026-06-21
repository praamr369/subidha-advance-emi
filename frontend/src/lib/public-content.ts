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

// ---------------------------------------------------------------------------
// Phase 10A: Extended public content
// ---------------------------------------------------------------------------

export const FULL_PUBLIC_FAQ = [
  {
    question: "What is a Lucky ID?",
    answer:
      "A Lucky ID is a numbered slot (00–99) assigned to your subscription within a specific batch. It is used for the monthly lucky draw. Each customer can hold multiple Lucky IDs across different batches. Lucky ID assignment does not guarantee winning.",
  },
  {
    question: "Can one customer have multiple Lucky IDs?",
    answer:
      "Yes. A customer may hold more than one Lucky ID, either within the same batch (if policy allows) or across different batches. Each Lucky ID corresponds to one subscription slot.",
  },
  {
    question: "What happens if I win the lucky draw?",
    answer:
      "If your Lucky ID is selected as the winner for a draw month, future EMI obligations from that month onward may be waived according to the plan rules stated in your approved contract. You will receive official communication through the branch.",
  },
  {
    question: "Do I get my already-paid EMI back if I win?",
    answer:
      "No. Winning the draw waives only future remaining EMI obligations. EMI that has already been paid and receipted is not automatically refunded. The waiver applies to unpaid future EMI only, from the approved winning month onward.",
  },
  {
    question: "Is rent or lease part of the Lucky Plan?",
    answer:
      "No. Rent and lease are completely separate contract types. They do not use Lucky IDs, do not participate in the monthly draw, and do not carry any EMI waiver benefits.",
  },
  {
    question: "Do rent or lease contracts have Lucky IDs?",
    answer:
      "No. Lucky IDs are only for Advance EMI / Lucky Plan subscriptions. Rent and lease customers do not receive Lucky IDs and are not eligible for the monthly draw.",
  },
  {
    question: "What proof do I get after payment?",
    answer:
      "Every valid payment should generate an official receipt record. You can view your payment receipts from the customer portal after login. Always ask for a receipt if you do not receive one automatically.",
  },
  {
    question: "When does delivery happen?",
    answer:
      "Delivery depends on your contract readiness, stock availability, payment verification, and any KYC or address checks required by the business. Delivery is a separate workflow from EMI payment. A delivery/handover document is generated at completion.",
  },
  {
    question: "What if I miss an EMI payment?",
    answer:
      "Missed payments may affect your contract status, draw eligibility, delivery schedule, or service access as per your approved contract terms. Contact the branch immediately if you are unable to pay on time. Do not assume an unreceipted payment has been recorded.",
  },
  {
    question: "How do I contact the store?",
    answer:
      "You can reach us through the Contact page on this website, by visiting the showroom in person, or by calling the branch directly. Contact details are listed on the Contact page.",
  },
  {
    question: "Is participating in Lucky Plan a form of gambling?",
    answer:
      "No. Lucky Plan is a structured monthly EMI / subscription plan where winning results in a future EMI waiver benefit. Participation is tied to a real product purchase contract. It is not a wager or game of chance with no underlying value — it is an EMI payment plan with a transparent draw feature.",
  },
  {
    question: "Is the deposit for rent or lease refundable?",
    answer:
      "The security deposit for rent or lease is treated as a refundable liability, subject to return inspection, pending dues clearance, and business approval. Deductions may apply for damage, missing parts, or approved charges. Final refund is governed by the contract and inspection outcome.",
  },
  {
    question: "What documents should I keep after joining?",
    answer:
      "Keep your approved subscription contract, all payment receipts, any delivery/handover documents, and official winner communication (if applicable). These are your proof of the complete transaction history. Digital copies in the customer portal are available but you should also keep physical copies of signed documents.",
  },
  {
    question: "Can I check my payment history online?",
    answer:
      "Yes. After logging in to the customer portal, you can view your subscriptions, payment history, receipts, Lucky ID assignments, delivery status, and support requests.",
  },
  {
    question: "How is the monthly draw conducted transparently?",
    answer:
      "The draw uses a commit-then-reveal process. Before each draw, a commitment hash is published. After the draw, the reveal (actual result) is published and can be verified against the earlier commitment. This ensures that draw results cannot be secretly changed after commitment.",
  },
] as const;

export const RULEBOOK_SECTIONS = [
  {
    id: "lucky-plan-structure",
    title: "Lucky Plan — structure and eligibility",
    rules: [
      "Lucky Plan (Advance EMI) is a monthly instalment plan where the customer pays EMI for a product over an approved tenure.",
      "Product base price is treated as the total contract value unless approved amendments state otherwise.",
      "Default EMI is derived by dividing the total contract value by the tenure in months.",
      "A customer must be enrolled in an approved batch to receive a Lucky ID.",
      "Lucky IDs are numbered 00–99 within each batch. One batch slot holds one Lucky ID.",
      "A customer may hold multiple Lucky IDs if the business approves multiple subscriptions.",
      "Lucky ID assignment is controlled by the branch system and does not occur through the public website.",
      "Eligibility to participate in the draw depends on subscription status, payment discipline, and KYC readiness.",
    ],
  },
  {
    id: "monthly-draw",
    title: "Monthly draw — process and rules",
    rules: [
      "A monthly draw is conducted by the branch under published rules.",
      "The draw uses a commit-then-reveal mechanism: a commitment hash is published before the draw, and the reveal is published afterward.",
      "Published winner records include batch reference, draw month, Lucky ID, and commitment/reveal proof where available.",
      "Winner names are masked on public pages to protect privacy.",
      "No public page or customer action can alter a revealed draw result.",
      "Participation in the draw does not guarantee winning.",
      "Winning Lucky Plan is not a form of gambling — it is a structured EMI waiver benefit attached to a real product contract.",
    ],
  },
  {
    id: "winner-waiver",
    title: "Winner benefit — future EMI waiver only",
    rules: [
      "If a customer's Lucky ID wins the monthly draw, remaining future EMI obligations (from the approved winning month onward) may be waived per plan rules.",
      "Waiver applies only to future EMI — EMI that has already been paid and receipted is not refunded automatically.",
      "Waiver does not remove KYC, delivery, documentation, or handover requirements.",
      "Lucky ID or contract rights cannot be transferred without admin approval.",
      "A winner must still complete all applicable contract steps (KYC, delivery, handover) unless separately waived by business policy.",
    ],
  },
  {
    id: "payment-discipline",
    title: "Payment and receipt rules",
    rules: [
      "Customers must pay scheduled EMI using approved methods (cash, UPI, bank transfer, or configured channels).",
      "Each valid payment must generate an official receipt. A payment without a receipt should not be treated as final.",
      "Receipts are traceable and can be viewed in the customer portal after login.",
      "Missed or late payments may affect draw eligibility, service, delivery, or contract status as per policy.",
      "Corrections, reversals, or refunds must follow approved audit workflow — customers cannot self-post these entries.",
    ],
  },
  {
    id: "rent-lease-rules",
    title: "Rent and lease — key rules",
    rules: [
      "Rent and lease do not use Lucky IDs and do not participate in the monthly draw.",
      "No EMI waiver benefits apply to rent or lease contracts.",
      "Security deposit for rent or lease is a refundable liability — it is separate from monthly demand.",
      "Monthly demand (rent/lease charge) must be paid as per the approved billing cycle.",
      "Deposit refund is subject to return inspection, dues clearance, and business approval.",
      "Renewal, extension, or upgrade of a lease is not automatic and requires admin approval.",
      "The product remains business property throughout rent or lease unless separately sold via direct sale invoice.",
    ],
  },
  {
    id: "delivery-handover",
    title: "Delivery and handover",
    rules: [
      "Delivery is scheduled after contract readiness, payment verification, stock availability, and KYC checks.",
      "A delivery/handover document is generated at completion — this is the official delivery record.",
      "Customers should inspect product condition during handover and note any concerns before signing.",
      "Visible damage or mismatch at delivery should be reported immediately at the time of handover.",
      "Stock and inventory movement is an internal business workflow — public pages do not control delivery.",
    ],
  },
  {
    id: "cancellation-default",
    title: "Cancellation, transfer, and default",
    rules: [
      "Cancellation, transfer, and default are governed by the approved contract terms.",
      "Lucky ID or contract rights cannot be transferred to another person without admin approval.",
      "Default (sustained missed payment) may lead to suspension, cancellation, or recovery actions per policy.",
      "Customers who need to cancel or modify a contract should contact the branch immediately.",
    ],
  },
  {
    id: "customer-responsibilities",
    title: "Customer responsibilities and document safety",
    rules: [
      "Customers should keep their approved contract, all payment receipts, delivery/handover documents, and winner communications.",
      "Digital copies in the customer portal are available but do not replace physically signed documents.",
      "Customers must keep contact information (phone, address) updated so the branch can reach them.",
      "Customers must not share their login credentials or allow others to access their account.",
    ],
  },
] as const;

export const CUSTOMERS_PAGE_CONTENT = {
  registrationSteps: [
    {
      title: "Make an enquiry",
      description:
        "Visit the showroom, call the branch, or submit an online enquiry through the Apply page. Mention the product you are interested in and the plan type (Lucky Plan EMI, Rent, Lease, or Direct Sale).",
    },
    {
      title: "Provide KYC documents",
      description:
        "The branch will guide you on required KYC documents. These may include identity proof, address proof, photograph, and any other documents as per policy. KYC is required before contract activation.",
    },
    {
      title: "Get your contract approved",
      description:
        "Once KYC is verified and the business approves your application, a contract is created in the system. This is your official record — read it carefully before signing.",
    },
    {
      title: "Receive your Lucky ID (Lucky Plan only)",
      description:
        "If you enrolled in Lucky Plan EMI, a Lucky ID (00–99) is assigned within your batch. You can view this in the customer portal after login.",
    },
    {
      title: "Pay monthly and track receipts",
      description:
        "Pay your EMI or monthly demand on time. Each payment generates a receipt. Log in to the customer portal to view your full payment history and receipts.",
    },
  ],
  whatCustomerPortalProvides: [
    "View active subscriptions, contracts, and Lucky ID assignments",
    "View full payment history and download receipts",
    "Track delivery status and handover documents",
    "View outstanding dues and EMI schedule",
    "Submit support or service requests",
    "View KYC status and profile details",
    "View direct sale invoices and orders",
  ],
  documentsToKeep: [
    "Approved subscription / rent / lease contract (signed copy)",
    "All payment receipts (physical and digital)",
    "Delivery / handover document (signed at delivery)",
    "Winner communication letter (if applicable)",
    "KYC acknowledgement from the branch",
    "Any amendment or modification letters",
  ],
} as const;

export const PARTNERS_PAGE_CONTENT = {
  roleExplanation:
    "Partners support Subidha Furniture by connecting potential customers with the business. A partner may introduce new customers, assist with enquiry follow-ups, and support the onboarding process as defined in the approved partnership agreement.",
  keyPoints: [
    {
      title: "Partners introduce customers",
      description:
        "A partner's primary role is to introduce customers who are interested in Subidha Furniture's products and plans. Customer enrollment, contract creation, and approval remain controlled by the branch system.",
    },
    {
      title: "Commissions are an internal workflow",
      description:
        "Partner commissions and payouts are calculated and processed as internal controlled workflows. Partners cannot self-approve or self-post their own commission payouts.",
    },
    {
      title: "No guaranteed payout promise",
      description:
        "Commission eligibility, calculation, and payment timing depend on approved partnership terms, customer onboarding status, and business verification — not on the number of introductions alone.",
    },
    {
      title: "Partner portal access",
      description:
        "Approved partners receive login access to a partner dashboard where they can view their introduced customers, subscription statuses, commission records, and support requests.",
    },
  ],
  disclaimer:
    "Partner registration and activation require business approval. This page explains the partner role for informational purposes. It does not constitute an offer of employment, agency, or guaranteed income. Final terms are governed by the signed partnership agreement.",
} as const;

// ---------------------------------------------------------------------------
// Phase 10C: Customer education — five journeys for How It Works
// ---------------------------------------------------------------------------

export const HOW_IT_WORKS_JOURNEY_A = [
  {
    title: "Choose product",
    description:
      "Visit the showroom or browse the public catalogue. Select furniture, electronics, or home appliances that suit your household need and monthly budget comfort.",
  },
  {
    title: "Register as a customer",
    description:
      "The branch registers you as a customer after collecting required KYC documents (identity proof, address proof, photograph). Registration alone does not guarantee contract approval.",
  },
  {
    title: "Select an active batch",
    description:
      "The branch assigns you to an active Advance EMI batch where Lucky ID slots are still available and the tenure timeline fits your plan.",
  },
  {
    title: "Lucky ID assigned",
    description:
      "A Lucky ID (numbered 00–99) is assigned within your batch. One customer may hold multiple Lucky IDs across multiple approved subscriptions. Assignment does not guarantee winning.",
  },
  {
    title: "EMI schedule generated",
    description:
      "An approved contract is created with your product, batch, Lucky ID, EMI amount, and tenure. Read this carefully — it is your official agreement.",
  },
  {
    title: "Pay EMI monthly",
    description:
      "Pay your scheduled EMI each month using approved methods (cash, UPI, bank transfer). Each valid payment generates a receipt visible in your customer portal.",
  },
  {
    title: "Monthly draw conducted as per rulebook",
    description:
      "Each month, a draw is conducted by the branch under published rules using a commit-then-reveal process. All active Lucky IDs in the batch participate. Winning is not guaranteed.",
  },
  {
    title: "Winner gets future EMI waiver only",
    description:
      "If your Lucky ID is selected, future remaining EMI obligations (from the approved winning month onward) may be waived. Already-paid EMI is not automatically refunded. The waiver is future-facing only.",
  },
  {
    title: "Delivery depends on readiness",
    description:
      "Delivery is scheduled separately based on KYC readiness, stock availability, payment status, contract completeness, and operational checks. Delivery is not automatic upon EMI payment.",
  },
  {
    title: "Keep all receipts and documents",
    description:
      "Preserve your approved contract, all payment receipts, delivery/handover document, and winner communication (if applicable). These form your complete transaction proof.",
  },
] as const;

export const HOW_IT_WORKS_JOURNEY_B = [
  {
    title: "Choose product",
    description:
      "Browse the catalogue or visit the showroom. Identify furniture, electronics, or appliances suited for temporary or flexible usage under a rent contract.",
  },
  {
    title: "Register as a customer",
    description:
      "Provide KYC documents at the branch. Approval is subject to verification and business checks.",
  },
  {
    title: "Rent contract created",
    description:
      "An approved rent contract is generated with product details, rent cycle, monthly demand, deposit terms, and tenure. Read and confirm before signing.",
  },
  {
    title: "Deposit may be collected",
    description:
      "A refundable security/caution deposit may be required before delivery. Deposit is separate from monthly rent payments and is a refundable liability subject to return inspection.",
  },
  {
    title: "Monthly demand billed separately",
    description:
      "Each month a rent demand is raised and must be paid by due date. Monthly rent payments are separate from the deposit. Both should generate receipts.",
  },
  {
    title: "Delivery governed by contract and readiness",
    description:
      "Delivery is scheduled after contract approval, deposit confirmation, and operational readiness. Product remains business property throughout the rent tenure.",
  },
  {
    title: "Return and service governed by terms",
    description:
      "At contract end, the product is returned for inspection. Deposit refund is subject to inspection outcome, pending dues clearance, and damage assessment. Renewal is not automatic.",
  },
] as const;

export const HOW_IT_WORKS_JOURNEY_C = [
  {
    title: "Choose product for long-term use",
    description:
      "Identify furniture, electronics, or appliances for an extended usage period under a lease contract. Lease tenures are typically longer than rent (6, 9, or 12+ months).",
  },
  {
    title: "Register as a customer",
    description:
      "KYC documents and branch verification are required. Lease approval may require additional checks compared to short rent.",
  },
  {
    title: "Lease contract created",
    description:
      "An approved lease contract is generated with product, tenure, lease amount, deposit terms, and renewal/upgrade conditions. No Lucky ID is assigned for lease.",
  },
  {
    title: "Deposit and monthly demand are separate",
    description:
      "A refundable deposit is collected as a separate liability. Monthly lease charges follow the approved billing cycle. Both should generate official receipts.",
  },
  {
    title: "Delivery and handover",
    description:
      "Delivery is confirmed after contract and deposit readiness. A delivery/handover document is generated at completion. Product remains business property.",
  },
  {
    title: "Renewal and upgrade require approval",
    description:
      "Lease renewal, extension, or product upgrade are not automatic. Each requires admin review of payment history, product condition, KYC, and eligibility.",
  },
  {
    title: "Return, service, and deposit refund governed by terms",
    description:
      "Product is returned at contract end for inspection. Deposit refund depends on dues clearance, product condition, and business approval. Service requests follow the support workflow.",
  },
] as const;

export const HOW_IT_WORKS_JOURNEY_D = [
  {
    title: "Pay through an approved method",
    description:
      "Accepted methods include cash, UPI, bank transfer, and other configured payment channels. Payments made outside approved channels may not be recognized.",
  },
  {
    title: "Payment record created internally",
    description:
      "When a valid payment is recorded, the system creates an internal payment entry linked to your contract and EMI/demand schedule. Customers cannot self-post payments.",
  },
  {
    title: "Official receipt generated",
    description:
      "Every valid payment generates an official receipt with date, amount, method, reference number, and collected-by trace. A payment without a receipt should not be treated as confirmed.",
  },
  {
    title: "Receipt visible in customer portal",
    description:
      "After login, you can view and download your full receipt history from the customer portal. Contact the branch if any receipt is missing from your portal.",
  },
  {
    title: "Documents should be preserved",
    description:
      "Keep physical copies of all receipts, contracts, and handover documents. Digital portal copies are convenient but do not replace signed originals.",
  },
] as const;

export const HOW_IT_WORKS_JOURNEY_E = [
  {
    title: "KYC and profile readiness",
    description:
      "Customer identity, address, and KYC documents must be verified and accepted by the branch before delivery can be scheduled. Incomplete KYC can delay delivery.",
  },
  {
    title: "Contract data readiness",
    description:
      "The contract must be approved and all required fields (product, tenure, Lucky ID for Advance EMI, deposit for rent/lease) must be correctly recorded.",
  },
  {
    title: "EMI, deposit, and payment readiness",
    description:
      "Outstanding dues, deposit receipt confirmation, or EMI payment verification may be required before dispatch. The branch reviews payment status internally.",
  },
  {
    title: "Stock and delivery readiness",
    description:
      "Product must be available in inventory and assigned for the customer. Delivery scheduling depends on stock movement workflow, which is controlled internally.",
  },
  {
    title: "Accounting bridge is advisory and internal",
    description:
      "Accounting reconciliation and bridge checks are internal workflows. Public users cannot view or alter accounting records. The backend remains authoritative.",
  },
  {
    title: "Backend remains authoritative for all readiness decisions",
    description:
      "Final delivery authorization is made by the branch system — not the public website. A delivery/handover document is generated at completion and serves as official proof.",
  },
] as const;

// ---------------------------------------------------------------------------
// Phase 10C: Additional FAQ items covering all required questions
// ---------------------------------------------------------------------------

export const PHASE10C_FAQ = [
  {
    question: "What is Subidha Core?",
    answer:
      "Subidha Core is the digital system that powers Subidha Furniture's contract, payment, and document management. It handles Advance EMI (Lucky Plan), Rent, Lease, and Direct Sale contracts — giving customers, partners, and staff a transparent, receipt-backed record system for all transactions.",
  },
  {
    question: "What is Advance EMI / Lucky Plan?",
    answer:
      "Advance EMI (also called Lucky Plan) is a structured monthly instalment plan where a customer pays EMI over an approved tenure to purchase furniture, electronics, or home appliances. Each enrolled customer is assigned a Lucky ID within a batch and participates in a monthly draw. If their Lucky ID is selected, future remaining EMI may be waived. Winning is not guaranteed. The plan is not gambling — it is a transparent EMI plan with a draw feature governed by published rules and an approved contract.",
  },
  {
    question: "Is winning the Lucky Plan draw guaranteed?",
    answer:
      "No. Winning is not guaranteed. Every active Lucky ID in the batch participates in the monthly draw, but only one Lucky ID is selected per draw cycle under published rules. Enrollment in the plan does not create any entitlement to a prize or waiver.",
  },
  {
    question: "How do receipts work?",
    answer:
      "When a valid payment is recorded by the branch system, an official receipt is generated with the payment date, amount, method, reference number, and the staff member who collected it. You can view and download all your receipts from the customer portal after login. Never treat a payment as confirmed without a receipt. If a receipt is missing, contact the branch immediately.",
  },
  {
    question: "Can a partner approve their own payout?",
    answer:
      "No. Partner commission calculation, approval, and payout are internal controlled workflows. A partner cannot self-approve or self-post their own commission payout. All payouts require business approval. Partners can view their commission records and statuses in the partner portal after login, but cannot trigger or approve payments themselves.",
  },
  {
    question: "Where can I read the Terms & Conditions?",
    answer:
      "The Terms & Conditions are available on the Legal pages: Terms of Use at /legal/terms, Privacy Policy at /legal/privacy, and the Disclaimer at /legal/disclaimer. Additional business policy pages (delivery, warranty, payment, Lucky Plan, rent/lease) are also available from the Policies section. Your signed contract remains the governing document for your specific obligations.",
  },
] as const;

// ---------------------------------------------------------------------------
// Phase 10C: Customer limitations — what customers cannot do
// ---------------------------------------------------------------------------

export const CUSTOMER_LIMITATIONS = [
  "Cannot self-post payments — all payments must be recorded by authorised branch staff",
  "Cannot self-approve delivery — delivery authorisation is an internal branch workflow",
  "Cannot edit accounting records — ledgers, journals, and financial entries are internal and controlled",
  "Cannot alter EMI schedule or contract terms without branch approval",
  "Cannot transfer their Lucky ID or contract rights to another person without admin authorisation",
  "Cannot access admin, cashier, or staff-side records through the customer portal",
  "Cannot approve their own KYC — KYC verification is done by the branch team",
] as const;

export const CUSTOMER_MULTI_CONTRACT_INFO = {
  multipleContracts:
    "A customer may hold more than one active contract — for example, one Advance EMI subscription and one Rent contract. Each contract has its own payment schedule, receipt history, and portal section. Managing multiple contracts does not combine their payment records.",
  multipleLuckyIds:
    "A customer may hold more than one Lucky ID if the business approves multiple Advance EMI subscriptions. Each Lucky ID belongs to a specific batch and operates independently. Holding multiple Lucky IDs means participating in the draw more than once, but does not guarantee winning in any draw cycle.",
} as const;
