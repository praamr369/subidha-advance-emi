import type { FaqItem } from "@/components/public/FaqBlock";
import { FULL_PUBLIC_FAQ } from "@/lib/public-content";
import type { PublicLanguage } from "@/lib/public-i18n";

type Three<T> = readonly [T, T, T];
type Four<T> = readonly [T, T, T, T];
type Six<T> = readonly [T, T, T, T, T, T];

export type PlanKey = "luckyPlan" | "rent" | "lease" | "directSale";
export type CategoryKey = "sofas" | "beds" | "dining" | "wardrobes" | "appliances";
export type NoticeKind = "live" | "rule" | "policy" | "visit";

type PlanText = { name: string; pitch: string; points: Three<string>; bestFor: string; note?: string };
type NoticeText = { title: string; body: string; cta: string };

/**
 * Every home-page string, per public language. Typed so a missing Hindi or
 * Bengali string fails the typecheck instead of silently showing English.
 */
export type HomeCopy = {
  hero: {
    promises: Three<string>;
    figures: { seats: string; members: string; winners: string };
    explore: string;
    compare: string;
    apply: string;
    imageAlt: string;
  };
  quickLinks: {
    label: string;
    plans: string;
    products: string;
    bulletin: string;
    howItWorks: string;
    vision: string;
    calculator: string;
    faq: string;
  };
  plans: {
    eyebrow: string;
    title: string;
    description: string;
    signature: string;
    bestFor: string;
    details: string;
    enquire: string;
    items: Record<PlanKey, PlanText>;
    table: {
      title: string;
      note: string;
      feature: string;
      columns: Four<string>;
      rows: ReadonlyArray<{ label: string; values: Four<string> }>;
    };
  };
  products: {
    eyebrow: string;
    title: string;
    description: string;
    categories: Record<CategoryKey, string>;
    fullCatalogue: string;
    productsOnline: string;
    browseAll: string;
    all: string;
    featured: string;
    viewAll: string;
    empty: string;
    details: string;
    enquire: string;
    priceOnRequest: string;
    fromPrice: (amount: string) => string;
    perMonth: (amount: string) => string;
  };
  bulletin: {
    eyebrow: string;
    title: string;
    description: string;
    kinds: Record<NoticeKind, string>;
    latestResult: string;
    luckyId: string;
    batch: (name: string) => string;
    drawMonth: (month: number) => string;
    product: string;
    emisWaived: string;
    asPerRulebook: string;
    verification: string;
    statuses: Record<string, string>;
    commitHash: string;
    verifyDraw: string;
    winnerHistory: string;
    emptyTitle: string;
    emptyBody: string;
    howDrawsWork: string;
    seats: { title: (open: string) => string; body: (taken: string, capacity: string, batches: string) => string; cta: string };
    members: { title: (active: string) => string; body: (rent: string, lease: string) => string; cta: string };
    fairDraw: NoticeText;
    deposits: NoticeText;
    visit: NoticeText;
  };
  howItWorks: {
    eyebrow: string;
    title: string;
    description: string;
    steps: Four<{ title: string; body: string }>;
    start: string;
    guide: string;
    rulebook: string;
  };
  vision: {
    eyebrow: string;
    statement: string;
    about: string;
    strategyEyebrow: string;
    strategyTitle: string;
    pillars: Four<{ title: string; body: string }>;
    commitmentsEyebrow: string;
    commitments: Six<string>;
    visionTrust: string;
    aboutUs: string;
  };
  calculator: { eyebrow: string; title: string; description: string };
  faq: { eyebrow: string; title: string; description: string; viewAll: string; items: ReadonlyArray<FaqItem> };
  cta: { title: string; description: string; visitShowroom: string };
};

const en: HomeCopy = {
  hero: {
    promises: ["A receipt for every payment", "Draw results you can verify", "Rules published before you join"],
    figures: { seats: "Lucky Plan seats open", members: "Active plan members", winners: "Winners published" },
    explore: "Explore products",
    compare: "Compare plans",
    apply: "Apply / Enquire",
    imageAlt: "Living room furnished with a modern sofa set",
  },
  quickLinks: {
    label: "On this page",
    plans: "Plans & schemes",
    products: "Product showcase",
    bulletin: "Bulletin board",
    howItWorks: "How it works",
    vision: "Our vision",
    calculator: "EMI calculator",
    faq: "FAQ",
  },
  plans: {
    eyebrow: "Plans & schemes",
    title: "Four ways to bring furniture home",
    description:
      "Pick the scheme that fits your budget and timeline. Every plan is backed by a written contract, published rules and a receipt for each payment.",
    signature: "Signature plan",
    bestFor: "Best for: ",
    details: "Plan details",
    enquire: "Enquire",
    items: {
      luckyPlan: {
        name: "Lucky Plan · Advance EMI",
        pitch: "Own your furniture through fixed monthly instalments, with a monthly draw that can waive your remaining EMIs.",
        points: [
          "Monthly EMI is the plan value divided by the tenure, fixed before you join",
          "Join a batch and receive a Lucky ID (00–99) for the monthly draw",
          "If your Lucky ID is drawn, future EMIs are waived as per the rulebook",
        ],
        bestFor: "Families who want to own with a predictable monthly budget.",
        note: "A promotional purchase plan, not a lottery. A Lucky ID does not guarantee a win.",
      },
      rent: {
        name: "Rent",
        pitch: "Use quality furniture for a monthly rent, without buying it.",
        points: [
          "Refundable security deposit plus a monthly rent",
          "A monthly invoice and receipt for every payment",
          "Deposit refunded after the return inspection and a dues check",
        ],
        bestFor: "Tenants, students and professionals on shorter stays.",
      },
      lease: {
        name: "Lease",
        pitch: "Longer-term use on a documented contract, with room to renew or upgrade.",
        points: [
          "Approved tenures such as 6, 9 or 12 months",
          "Refundable deposit kept separate from lease charges",
          "Renewal or upgrade subject to approval",
        ],
        bestFor: "Offices, guest houses and longer family stays.",
      },
      directSale: {
        name: "Direct purchase",
        pitch: "Pay the full price once and own the product outright.",
        points: [
          "Live offer prices applied automatically",
          "Invoice, receipt and a signed delivery record",
          "Warranty and service as per product policy",
        ],
        bestFor: "Customers ready to buy in one payment.",
      },
    },
    table: {
      title: "Which plan fits you?",
      note: "A side-by-side view of the four schemes. Your signed contract always carries the final terms.",
      feature: "Feature",
      columns: ["Lucky Plan", "Rent", "Lease", "Direct purchase"],
      rows: [
        { label: "Who owns it", values: ["You, once the plan is complete", "Stays with Subidha", "Stays with Subidha", "You, on full payment"] },
        { label: "What you pay", values: ["Fixed monthly instalments", "Deposit + monthly rent", "Deposit + monthly lease charge", "Full price, once"] },
        { label: "Refundable deposit", values: ["No", "Yes", "Yes", "No"] },
        { label: "Monthly lucky draw", values: ["Yes — future EMIs may be waived", "No", "No", "No"] },
        {
          label: "Delivery",
          values: ["When the plan becomes eligible", "After the deposit is collected", "After the deposit is collected", "After payment and scheduling"],
        },
      ],
    },
  },
  products: {
    eyebrow: "Product showcase",
    title: "Furniture and appliances for every room",
    description:
      "Shop by room, or start with what is new in the live catalogue. Swipe a product photo to see more pictures and videos.",
    categories: {
      sofas: "Sofas & seating",
      beds: "Beds & mattresses",
      dining: "Dining sets",
      wardrobes: "Wardrobes & storage",
      appliances: "Home appliances",
    },
    fullCatalogue: "Full catalogue",
    productsOnline: "products online",
    browseAll: "Browse all",
    all: "All",
    featured: "Featured from the live catalogue",
    viewAll: "View all",
    empty:
      "No products are published in the online catalogue right now. Visit the showroom or send an enquiry and the branch will share current designs.",
    details: "Details",
    enquire: "Enquire",
    priceOnRequest: "Price on request",
    fromPrice: (amount) => `From ${amount}`,
    perMonth: (amount) => `or from ${amount}/month`,
  },
  bulletin: {
    eyebrow: "Bulletin board",
    title: "Results, live figures and notices",
    description:
      "Live figures come straight from our records and refresh every minute. A draw result appears only after the draw is revealed.",
    kinds: { live: "Live", rule: "Rule", policy: "Policy", visit: "Visit" },
    latestResult: "Latest draw result",
    luckyId: "Lucky ID",
    batch: (name) => `Batch ${name}`,
    drawMonth: (month) => `Draw month ${month}`,
    product: "Product",
    emisWaived: "EMIs waived",
    asPerRulebook: "As per rulebook",
    verification: "Verification",
    statuses: {
      verified: "Verified",
      pending: "Pending",
      unverified: "Not verified",
      failed: "Failed",
      revealed: "Revealed",
      committed: "Committed",
    },
    commitHash: "Commit hash",
    verifyDraw: "Verify this draw",
    winnerHistory: "Winner history",
    emptyTitle: "No draw result published yet",
    emptyBody: "The first result appears here as soon as a draw is revealed. We never show placeholder winners.",
    howDrawsWork: "How draws work",
    seats: {
      title: (open) => `${open} Lucky Plan seats open`,
      body: (taken, capacity, batches) => `${taken} of ${capacity} seats are taken across ${batches} published batches.`,
      cta: "Join a batch",
    },
    members: {
      title: (active) => `${active} active Lucky Plan members`,
      body: (rent, lease) => `Alongside ${rent} rent and ${lease} lease contracts running today.`,
      cta: "How Lucky Plan works",
    },
    fairDraw: {
      title: "How every monthly draw stays fair",
      body: "A commitment hash is published before each draw and revealed after it, so nobody can change a result once it is committed.",
      cta: "Fair-draw method",
    },
    deposits: {
      title: "Rent and lease deposits are refundable",
      body: "Refunded after the return inspection and a dues check, with a written settlement statement.",
      cta: "Read the policy",
    },
    visit: {
      title: "See it before you choose",
      body: "Visit the Asansol showroom to check finishes, sizes and comfort in person.",
      cta: "Showroom & contact",
    },
  },
  howItWorks: {
    eyebrow: "How it works",
    title: "From showroom to your home in four steps",
    description: "The same simple journey for every plan. You always know what happens next and what you have paid.",
    steps: [
      {
        title: "Choose your product",
        body: "Browse the live catalogue here, or visit the Asansol showroom to see finishes, sizes and comfort in person.",
      },
      {
        title: "Pick a plan and apply",
        body: "Choose Lucky Plan EMI, rent, lease or direct purchase. Send an enquiry and the branch helps with documents and KYC.",
      },
      {
        title: "Pay monthly, keep every receipt",
        body: "Pay in cash, by UPI or by bank transfer. Each payment is receipted and visible in your customer portal.",
      },
      {
        title: "Delivery and handover",
        body: "Delivery is scheduled once your plan is eligible. A signed handover record protects you and us.",
      },
    ],
    start: "Start an enquiry",
    guide: "Full step-by-step guide",
    rulebook: "Read the rulebook",
  },
  vision: {
    eyebrow: "Our vision",
    statement:
      "Every family deserves a well-furnished home — paid for in comfortable steps, recorded honestly and delivered with care.",
    about:
      "Subidha Furniture is an Asansol showroom building a more transparent way to furnish a home. Informal instalment notebooks can be lost, altered or disputed. We replace them with a system you can see and verify: clear prices, published rules, receipted payments and draws anyone can check.",
    strategyEyebrow: "Our strategy",
    strategyTitle: "Four ideas behind how we do business",
    pillars: [
      {
        title: "Affordable ownership",
        body: "We break the price of a good home into fixed monthly instalments sized to your budget, agreed in writing before you join.",
      },
      {
        title: "Transparency by design",
        body: "Plan rules, policies and draw results are published. Each draw is committed with a hash before it happens, so a result cannot be changed afterwards.",
      },
      {
        title: "Showroom trust, digital records",
        body: "Touch and try every product in person, then track payments, receipts, Lucky IDs and delivery from your phone.",
      },
      {
        title: "A scheme for every stage of life",
        body: "Own, rent, lease or buy outright. Change the plan to suit your situation, not the showroom you trust.",
      },
    ],
    commitmentsEyebrow: "Our commitments to you",
    commitments: [
      "Prices and monthly amounts shown before you enrol",
      "A receipt for every rupee collected",
      "Draw proofs published for anyone to check",
      "Winners shown with masked names to protect privacy",
      "Documented delivery, handover and returns",
      "A grievance desk with tracked resolution",
    ],
    visionTrust: "Vision & trust",
    aboutUs: "About us",
  },
  calculator: {
    eyebrow: "EMI calculator",
    title: "Estimate your monthly payment",
    description: "Move the sliders to see a Lucky Plan monthly amount — the plan value divided by the number of months.",
  },
  faq: {
    eyebrow: "Common questions",
    title: "Quick answers",
    description: "The questions customers ask most. The FAQ page has the full list.",
    viewAll: "View all FAQs",
    items: FULL_PUBLIC_FAQ.slice(0, 6),
  },
  cta: {
    title: "Ready to furnish your home?",
    description: "Pick a product, compare plans, or talk to the branch. Nothing is recorded until you submit the enquiry form.",
    visitShowroom: "Visit the showroom",
  },
};

const hi: HomeCopy = {
  hero: {
    promises: ["हर भुगतान की रसीद", "ड्रॉ के नतीजे जिन्हें आप जाँच सकें", "जुड़ने से पहले नियम प्रकाशित"],
    figures: { seats: "लकी प्लान सीटें खाली", members: "सक्रिय प्लान सदस्य", winners: "प्रकाशित विजेता" },
    explore: "उत्पाद देखें",
    compare: "प्लान की तुलना करें",
    apply: "आवेदन / पूछताछ",
    imageAlt: "आधुनिक सोफ़ा सेट से सजा लिविंग रूम",
  },
  quickLinks: {
    label: "इस पेज पर",
    plans: "प्लान और योजनाएँ",
    products: "उत्पाद शोकेस",
    bulletin: "सूचना पट्ट",
    howItWorks: "यह कैसे काम करता है",
    vision: "हमारा विज़न",
    calculator: "EMI कैलकुलेटर",
    faq: "सामान्य प्रश्न",
  },
  plans: {
    eyebrow: "प्लान और योजनाएँ",
    title: "फ़र्नीचर घर लाने के चार तरीके",
    description:
      "अपने बजट और समय के अनुसार योजना चुनें। हर प्लान के साथ लिखित अनुबंध, प्रकाशित नियम और हर भुगतान की रसीद मिलती है।",
    signature: "प्रमुख प्लान",
    bestFor: "किसके लिए सबसे अच्छा: ",
    details: "प्लान विवरण",
    enquire: "पूछताछ करें",
    items: {
      luckyPlan: {
        name: "लकी प्लान · एडवांस EMI",
        pitch: "तय मासिक किश्तों में अपना फ़र्नीचर खरीदें — हर महीने के ड्रॉ से आपकी बाकी EMI माफ़ हो सकती है।",
        points: [
          "मासिक EMI = प्लान मूल्य ÷ अवधि, जो जुड़ने से पहले तय होती है",
          "बैच में शामिल हों और मासिक ड्रॉ के लिए लकी ID (00–99) पाएं",
          "आपकी लकी ID निकलने पर नियम-पुस्तिका के अनुसार आगे की EMI माफ़",
        ],
        bestFor: "जो परिवार तय मासिक बजट में अपना सामान खरीदना चाहते हैं।",
        note: "यह एक प्रमोशनल खरीद योजना है, लॉटरी नहीं। लकी ID मिलने से जीत की गारंटी नहीं होती।",
      },
      rent: {
        name: "किराया",
        pitch: "अच्छी क्वालिटी का फ़र्नीचर बिना खरीदे मासिक किराये पर इस्तेमाल करें।",
        points: [
          "वापसी योग्य सिक्योरिटी डिपॉज़िट और मासिक किराया",
          "हर भुगतान का मासिक इनवॉइस और रसीद",
          "वापसी निरीक्षण और बकाया जाँच के बाद डिपॉज़िट वापस",
        ],
        bestFor: "किरायेदार, छात्र और कम समय के लिए रहने वाले प्रोफ़ेशनल्स।",
      },
      lease: {
        name: "लीज़",
        pitch: "लिखित अनुबंध पर लंबे समय तक उपयोग, नवीनीकरण या अपग्रेड की सुविधा के साथ।",
        points: [
          "6, 9 या 12 महीने जैसी स्वीकृत अवधि",
          "वापसी योग्य डिपॉज़िट लीज़ शुल्क से अलग रखा जाता है",
          "नवीनीकरण या अपग्रेड स्वीकृति के अधीन",
        ],
        bestFor: "ऑफ़िस, गेस्ट हाउस और लंबे समय तक रहने वाले परिवार।",
      },
      directSale: {
        name: "सीधी खरीद",
        pitch: "पूरी कीमत एक बार में चुकाएं और उत्पाद के पूरे मालिक बनें।",
        points: [
          "लाइव ऑफ़र कीमतें अपने-आप लागू",
          "इनवॉइस, रसीद और हस्ताक्षरित डिलीवरी रिकॉर्ड",
          "उत्पाद नीति के अनुसार वारंटी और सर्विस",
        ],
        bestFor: "जो ग्राहक एक बार में भुगतान करने को तैयार हैं।",
      },
    },
    table: {
      title: "आपके लिए कौन-सा प्लान सही है?",
      note: "चारों योजनाओं की आमने-सामने तुलना। अंतिम शर्तें हमेशा आपके हस्ताक्षरित अनुबंध में होती हैं।",
      feature: "विशेषता",
      columns: ["लकी प्लान", "किराया", "लीज़", "सीधी खरीद"],
      rows: [
        { label: "मालिक कौन", values: ["आप, प्लान पूरा होने पर", "सुबिधा के पास रहता है", "सुबिधा के पास रहता है", "आप, पूरा भुगतान होने पर"] },
        { label: "आप क्या चुकाते हैं", values: ["तय मासिक किश्तें", "डिपॉज़िट + मासिक किराया", "डिपॉज़िट + मासिक लीज़ शुल्क", "पूरी कीमत, एक बार"] },
        { label: "वापसी योग्य डिपॉज़िट", values: ["नहीं", "हाँ", "हाँ", "नहीं"] },
        { label: "मासिक लकी ड्रॉ", values: ["हाँ — आगे की EMI माफ़ हो सकती है", "नहीं", "नहीं", "नहीं"] },
        {
          label: "डिलीवरी",
          values: ["प्लान पात्र होने पर", "डिपॉज़िट जमा होने के बाद", "डिपॉज़िट जमा होने के बाद", "भुगतान और शेड्यूलिंग के बाद"],
        },
      ],
    },
  },
  products: {
    eyebrow: "उत्पाद शोकेस",
    title: "हर कमरे के लिए फ़र्नीचर और उपकरण",
    description:
      "कमरे के अनुसार खरीदारी करें, या लाइव कैटलॉग में नया क्या है, वहाँ से शुरू करें। और फ़ोटो व वीडियो देखने के लिए उत्पाद की फ़ोटो को स्वाइप करें।",
    categories: {
      sofas: "सोफ़ा और सीटिंग",
      beds: "बेड और गद्दे",
      dining: "डाइनिंग सेट",
      wardrobes: "वार्डरोब और स्टोरेज",
      appliances: "घरेलू उपकरण",
    },
    fullCatalogue: "पूरा कैटलॉग",
    productsOnline: "उत्पाद ऑनलाइन",
    browseAll: "सभी देखें",
    all: "सभी",
    featured: "लाइव कैटलॉग से चुनिंदा",
    viewAll: "सभी देखें",
    empty:
      "अभी ऑनलाइन कैटलॉग में कोई उत्पाद प्रकाशित नहीं है। शोरूम आएं या पूछताछ भेजें — शाखा आपको मौजूदा डिज़ाइन दिखाएगी।",
    details: "विवरण",
    enquire: "पूछताछ",
    priceOnRequest: "कीमत पूछें",
    fromPrice: (amount) => `${amount} से शुरू`,
    perMonth: (amount) => `या ${amount}/माह से शुरू`,
  },
  bulletin: {
    eyebrow: "सूचना पट्ट",
    title: "नतीजे, लाइव आँकड़े और सूचनाएँ",
    description:
      "लाइव आँकड़े सीधे हमारे रिकॉर्ड से आते हैं और हर मिनट अपडेट होते हैं। ड्रॉ का नतीजा ड्रॉ खुलने के बाद ही दिखता है।",
    kinds: { live: "लाइव", rule: "नियम", policy: "नीति", visit: "विज़िट" },
    latestResult: "नवीनतम ड्रॉ परिणाम",
    luckyId: "लकी ID",
    batch: (name) => `बैच ${name}`,
    drawMonth: (month) => `ड्रॉ माह ${month}`,
    product: "उत्पाद",
    emisWaived: "माफ़ EMI",
    asPerRulebook: "नियम-पुस्तिका के अनुसार",
    verification: "सत्यापन",
    statuses: {
      verified: "सत्यापित",
      pending: "लंबित",
      unverified: "असत्यापित",
      failed: "विफल",
      revealed: "खोला गया",
      committed: "कमिट किया गया",
    },
    commitHash: "कमिट हैश",
    verifyDraw: "यह ड्रॉ जाँचें",
    winnerHistory: "विजेता इतिहास",
    emptyTitle: "अभी कोई ड्रॉ परिणाम प्रकाशित नहीं",
    emptyBody: "ड्रॉ खुलते ही पहला परिणाम यहाँ दिखेगा। हम कभी नकली विजेता नहीं दिखाते।",
    howDrawsWork: "ड्रॉ कैसे होता है",
    seats: {
      title: (open) => `${open} लकी प्लान सीटें खाली`,
      body: (taken, capacity, batches) => `${batches} प्रकाशित बैचों में ${capacity} में से ${taken} सीटें भर चुकी हैं।`,
      cta: "बैच में शामिल हों",
    },
    members: {
      title: (active) => `${active} सक्रिय लकी प्लान सदस्य`,
      body: (rent, lease) => `साथ ही आज ${rent} किराया और ${lease} लीज़ अनुबंध चल रहे हैं।`,
      cta: "लकी प्लान कैसे काम करता है",
    },
    fairDraw: {
      title: "हर मासिक ड्रॉ निष्पक्ष कैसे रहता है",
      body: "हर ड्रॉ से पहले कमिटमेंट हैश प्रकाशित होता है और बाद में खोला जाता है, इसलिए एक बार तय होने के बाद कोई भी परिणाम नहीं बदल सकता।",
      cta: "निष्पक्ष ड्रॉ पद्धति",
    },
    deposits: {
      title: "किराया और लीज़ डिपॉज़िट वापसी योग्य हैं",
      body: "वापसी निरीक्षण और बकाया जाँच के बाद, लिखित निपटान विवरण के साथ वापस किया जाता है।",
      cta: "नीति पढ़ें",
    },
    visit: {
      title: "चुनने से पहले देखें",
      body: "फ़िनिश, साइज़ और आराम खुद परखने के लिए आसनसोल शोरूम आएं।",
      cta: "शोरूम और संपर्क",
    },
  },
  howItWorks: {
    eyebrow: "यह कैसे काम करता है",
    title: "शोरूम से आपके घर तक चार कदमों में",
    description: "हर प्लान के लिए एक ही आसान प्रक्रिया। आपको हमेशा पता रहता है कि आगे क्या होगा और आपने कितना चुकाया है।",
    steps: [
      {
        title: "अपना उत्पाद चुनें",
        body: "यहाँ लाइव कैटलॉग देखें, या फ़िनिश, साइज़ और आराम खुद देखने के लिए आसनसोल शोरूम आएं।",
      },
      {
        title: "प्लान चुनें और आवेदन करें",
        body: "लकी प्लान EMI, किराया, लीज़ या सीधी खरीद चुनें। पूछताछ भेजें — शाखा दस्तावेज़ और KYC में मदद करती है।",
      },
      {
        title: "हर महीने भुगतान, हर रसीद आपके पास",
        body: "नकद, UPI या बैंक ट्रांसफ़र से भुगतान करें। हर भुगतान की रसीद मिलती है और आपके कस्टमर पोर्टल में दिखती है।",
      },
      {
        title: "डिलीवरी और हैंडओवर",
        body: "प्लान पात्र होते ही डिलीवरी तय की जाती है। हस्ताक्षरित हैंडओवर रिकॉर्ड आपकी और हमारी, दोनों की सुरक्षा करता है।",
      },
    ],
    start: "पूछताछ शुरू करें",
    guide: "पूरी चरण-दर-चरण गाइड",
    rulebook: "नियम-पुस्तिका पढ़ें",
  },
  vision: {
    eyebrow: "हमारा विज़न",
    statement: "हर परिवार एक सुसज्जित घर का हक़दार है — आसान किश्तों में भुगतान, ईमानदारी से दर्ज रिकॉर्ड और सावधानी से डिलीवरी।",
    about:
      "सुबिधा फ़र्नीचर आसनसोल का एक शोरूम है, जो घर सजाने का एक ज़्यादा पारदर्शी तरीका बना रहा है। किश्तों की हाथ से लिखी कॉपियाँ खो सकती हैं, बदली जा सकती हैं या विवाद में पड़ सकती हैं। हम उनकी जगह ऐसी व्यवस्था लाते हैं जिसे आप देख और जाँच सकें: साफ़ कीमतें, प्रकाशित नियम, हर भुगतान की रसीद और ऐसे ड्रॉ जिन्हें कोई भी जाँच सके।",
    strategyEyebrow: "हमारी रणनीति",
    strategyTitle: "हमारे व्यवसाय के पीछे चार विचार",
    pillars: [
      {
        title: "किफ़ायती स्वामित्व",
        body: "हम एक अच्छे घर की कीमत को आपके बजट के अनुसार तय मासिक किश्तों में बाँटते हैं, जो जुड़ने से पहले लिखित रूप में तय होती हैं।",
      },
      {
        title: "शुरुआत से ही पारदर्शिता",
        body: "प्लान के नियम, नीतियाँ और ड्रॉ के परिणाम प्रकाशित होते हैं। हर ड्रॉ होने से पहले हैश से कमिट किया जाता है, ताकि बाद में परिणाम बदला न जा सके।",
      },
      {
        title: "शोरूम का भरोसा, डिजिटल रिकॉर्ड",
        body: "हर उत्पाद को खुद छूकर देखें, फिर भुगतान, रसीदें, लकी ID और डिलीवरी अपने फ़ोन पर ट्रैक करें।",
      },
      {
        title: "ज़िंदगी के हर पड़ाव के लिए योजना",
        body: "किश्तों में अपना बनाएं, किराये पर लें, लीज़ पर लें या सीधे खरीदें। अपनी स्थिति के अनुसार प्लान बदलें, भरोसेमंद शोरूम नहीं।",
      },
    ],
    commitmentsEyebrow: "आपसे हमारे वादे",
    commitments: [
      "जुड़ने से पहले कीमतें और मासिक राशि दिखाई जाती हैं",
      "जमा किए गए हर रुपये की रसीद",
      "ड्रॉ के प्रमाण प्रकाशित, ताकि कोई भी जाँच सके",
      "गोपनीयता के लिए विजेताओं के नाम आंशिक रूप से छिपाए जाते हैं",
      "डिलीवरी, हैंडओवर और वापसी का पूरा दस्तावेज़",
      "शिकायत डेस्क, जहाँ समाधान ट्रैक होता है",
    ],
    visionTrust: "विज़न और भरोसा",
    aboutUs: "हमारे बारे में",
  },
  calculator: {
    eyebrow: "EMI कैलकुलेटर",
    title: "अपनी मासिक किश्त का अनुमान लगाएं",
    description: "स्लाइडर खिसकाकर लकी प्लान की मासिक राशि देखें — प्लान मूल्य को महीनों की संख्या से भाग देकर।",
  },
  faq: {
    eyebrow: "सामान्य प्रश्न",
    title: "झटपट जवाब",
    description: "ग्राहकों के सबसे ज़्यादा पूछे जाने वाले सवाल। पूरी सूची FAQ पेज पर है।",
    viewAll: "सभी FAQ देखें",
    items: [
      {
        question: "लकी ID क्या है?",
        answer:
          "लकी ID एक नंबर वाला स्लॉट (00–99) है, जो किसी खास बैच में आपकी सदस्यता को दिया जाता है। इसका उपयोग मासिक लकी ड्रॉ के लिए होता है। एक ग्राहक अलग-अलग बैचों में कई लकी ID रख सकता है। लकी ID मिलने से जीत की गारंटी नहीं होती।",
      },
      {
        question: "क्या एक ग्राहक के पास कई लकी ID हो सकती हैं?",
        answer:
          "हाँ। एक ग्राहक एक से ज़्यादा लकी ID रख सकता है — एक ही बैच में (अगर नीति अनुमति दे) या अलग-अलग बैचों में। हर लकी ID एक सदस्यता स्लॉट से जुड़ी होती है।",
      },
      {
        question: "अगर मैं लकी ड्रॉ जीत जाऊँ तो क्या होगा?",
        answer:
          "अगर किसी ड्रॉ माह में आपकी लकी ID विजेता चुनी जाती है, तो आपके स्वीकृत अनुबंध में दिए प्लान नियमों के अनुसार उस माह से आगे की EMI माफ़ की जा सकती है। आपको शाखा के माध्यम से आधिकारिक सूचना मिलेगी।",
      },
      {
        question: "जीतने पर क्या पहले चुकाई गई EMI वापस मिलेगी?",
        answer:
          "नहीं। ड्रॉ जीतने पर केवल आगे की बची हुई EMI माफ़ होती है। जो EMI पहले ही चुकाई जा चुकी है और जिसकी रसीद मिल चुकी है, वह अपने-आप वापस नहीं होती। माफ़ी केवल स्वीकृत विजेता माह से आगे की बकाया EMI पर लागू होती है।",
      },
      {
        question: "क्या किराया या लीज़ लकी प्लान का हिस्सा है?",
        answer:
          "नहीं। किराया और लीज़ पूरी तरह अलग तरह के अनुबंध हैं। इनमें लकी ID नहीं होती, ये मासिक ड्रॉ में शामिल नहीं होते और इनमें EMI माफ़ी का कोई लाभ नहीं है।",
      },
      {
        question: "क्या किराया या लीज़ अनुबंधों में लकी ID होती है?",
        answer:
          "नहीं। लकी ID केवल एडवांस EMI / लकी प्लान सदस्यताओं के लिए है। किराया और लीज़ ग्राहकों को लकी ID नहीं मिलती और वे मासिक ड्रॉ के पात्र नहीं हैं।",
      },
    ],
  },
  cta: {
    title: "अपना घर सजाने के लिए तैयार हैं?",
    description: "उत्पाद चुनें, प्लान की तुलना करें या शाखा से बात करें। पूछताछ फ़ॉर्म जमा करने से पहले कुछ भी दर्ज नहीं होता।",
    visitShowroom: "शोरूम आएं",
  },
};

const bn: HomeCopy = {
  hero: {
    promises: ["প্রতিটি পেমেন্টের রসিদ", "যাচাইযোগ্য ড্রয়ের ফলাফল", "যোগ দেওয়ার আগেই নিয়ম প্রকাশিত"],
    figures: { seats: "লাকি প্ল্যানের খালি আসন", members: "সক্রিয় প্ল্যান সদস্য", winners: "প্রকাশিত বিজয়ী" },
    explore: "পণ্য দেখুন",
    compare: "প্ল্যান তুলনা করুন",
    apply: "আবেদন / জিজ্ঞাসা",
    imageAlt: "আধুনিক সোফা সেটে সাজানো বসার ঘর",
  },
  quickLinks: {
    label: "এই পাতায়",
    plans: "প্ল্যান ও স্কিম",
    products: "পণ্য প্রদর্শনী",
    bulletin: "নোটিস বোর্ড",
    howItWorks: "কীভাবে কাজ করে",
    vision: "আমাদের লক্ষ্য",
    calculator: "EMI ক্যালকুলেটর",
    faq: "সাধারণ প্রশ্ন",
  },
  plans: {
    eyebrow: "প্ল্যান ও স্কিম",
    title: "ফার্নিচার ঘরে আনার চারটি উপায়",
    description:
      "আপনার বাজেট ও সময় অনুযায়ী স্কিম বেছে নিন। প্রতিটি প্ল্যানের সঙ্গে থাকে লিখিত চুক্তি, প্রকাশিত নিয়ম আর প্রতিটি পেমেন্টের রসিদ।",
    signature: "প্রধান প্ল্যান",
    bestFor: "কাদের জন্য সেরা: ",
    details: "প্ল্যানের বিস্তারিত",
    enquire: "জিজ্ঞাসা করুন",
    items: {
      luckyPlan: {
        name: "লাকি প্ল্যান · অ্যাডভান্স EMI",
        pitch: "নির্দিষ্ট মাসিক কিস্তিতে ফার্নিচারের মালিক হন — প্রতি মাসের ড্রয়ে আপনার বাকি EMI মকুব হতে পারে।",
        points: [
          "মাসিক EMI = প্ল্যানের মূল্য ÷ মেয়াদ, যোগ দেওয়ার আগেই নির্ধারিত",
          "একটি ব্যাচে যোগ দিন আর মাসিক ড্রয়ের জন্য লাকি ID (00–99) পান",
          "আপনার লাকি ID উঠলে নিয়মপুস্তিকা অনুযায়ী ভবিষ্যতের EMI মকুব",
        ],
        bestFor: "যে পরিবারগুলি নির্দিষ্ট মাসিক বাজেটে মালিক হতে চান।",
        note: "এটি একটি প্রচারমূলক ক্রয় পরিকল্পনা, লটারি নয়। লাকি ID থাকলেই জেতার গ্যারান্টি নেই।",
      },
      rent: {
        name: "ভাড়া",
        pitch: "ভালো মানের ফার্নিচার না কিনে মাসিক ভাড়ায় ব্যবহার করুন।",
        points: [
          "ফেরতযোগ্য সিকিউরিটি ডিপোজিট ও মাসিক ভাড়া",
          "প্রতিটি পেমেন্টের মাসিক ইনভয়েস ও রসিদ",
          "ফেরতের পরিদর্শন ও বকেয়া যাচাইয়ের পর ডিপোজিট ফেরত",
        ],
        bestFor: "ভাড়াটে, ছাত্রছাত্রী আর স্বল্প সময়ের জন্য থাকা পেশাদাররা।",
      },
      lease: {
        name: "লিজ",
        pitch: "লিখিত চুক্তিতে দীর্ঘমেয়াদি ব্যবহার, নবীকরণ বা আপগ্রেডের সুযোগসহ।",
        points: [
          "৬, ৯ বা ১২ মাসের মতো অনুমোদিত মেয়াদ",
          "ফেরতযোগ্য ডিপোজিট লিজ চার্জ থেকে আলাদা রাখা হয়",
          "নবীকরণ বা আপগ্রেড অনুমোদনসাপেক্ষ",
        ],
        bestFor: "অফিস, গেস্ট হাউস আর দীর্ঘ সময় থাকা পরিবার।",
      },
      directSale: {
        name: "সরাসরি কেনা",
        pitch: "একবারে পুরো দাম দিয়ে পণ্যের পূর্ণ মালিক হন।",
        points: [
          "চলতি অফারের দাম স্বয়ংক্রিয়ভাবে প্রযোজ্য",
          "ইনভয়েস, রসিদ ও স্বাক্ষরিত ডেলিভারি রেকর্ড",
          "পণ্যের নীতি অনুযায়ী ওয়ারেন্টি ও সার্ভিস",
        ],
        bestFor: "যে গ্রাহকরা একবারে পেমেন্ট করতে প্রস্তুত।",
      },
    },
    table: {
      title: "কোন প্ল্যান আপনার জন্য?",
      note: "চারটি স্কিমের পাশাপাশি তুলনা। চূড়ান্ত শর্ত সবসময় আপনার স্বাক্ষরিত চুক্তিতেই থাকে।",
      feature: "বৈশিষ্ট্য",
      columns: ["লাকি প্ল্যান", "ভাড়া", "লিজ", "সরাসরি কেনা"],
      rows: [
        { label: "মালিক কে", values: ["আপনি, প্ল্যান সম্পূর্ণ হলে", "সুবিধার কাছেই থাকে", "সুবিধার কাছেই থাকে", "আপনি, পুরো পেমেন্টের পর"] },
        { label: "আপনি কী দেন", values: ["নির্দিষ্ট মাসিক কিস্তি", "ডিপোজিট + মাসিক ভাড়া", "ডিপোজিট + মাসিক লিজ চার্জ", "পুরো দাম, একবারে"] },
        { label: "ফেরতযোগ্য ডিপোজিট", values: ["না", "হ্যাঁ", "হ্যাঁ", "না"] },
        { label: "মাসিক লাকি ড্রয়", values: ["হ্যাঁ — ভবিষ্যতের EMI মকুব হতে পারে", "না", "না", "না"] },
        {
          label: "ডেলিভারি",
          values: ["প্ল্যান যোগ্য হলে", "ডিপোজিট জমা হওয়ার পর", "ডিপোজিট জমা হওয়ার পর", "পেমেন্ট ও সময় নির্ধারণের পর"],
        },
      ],
    },
  },
  products: {
    eyebrow: "পণ্য প্রদর্শনী",
    title: "প্রতিটি ঘরের জন্য ফার্নিচার ও অ্যাপ্লায়েন্স",
    description:
      "ঘর অনুযায়ী কেনাকাটা করুন, অথবা লাইভ ক্যাটালগের নতুন পণ্য দিয়ে শুরু করুন। আরও ছবি ও ভিডিও দেখতে পণ্যের ছবিটি সোয়াইপ করুন।",
    categories: {
      sofas: "সোফা ও বসার আসন",
      beds: "খাট ও ম্যাট্রেস",
      dining: "ডাইনিং সেট",
      wardrobes: "আলমারি ও স্টোরেজ",
      appliances: "গৃহস্থালির যন্ত্রপাতি",
    },
    fullCatalogue: "সম্পূর্ণ ক্যাটালগ",
    productsOnline: "পণ্য অনলাইনে",
    browseAll: "সব দেখুন",
    all: "সব",
    featured: "লাইভ ক্যাটালগ থেকে বাছাই করা",
    viewAll: "সব দেখুন",
    empty:
      "এই মুহূর্তে অনলাইন ক্যাটালগে কোনো পণ্য প্রকাশিত নেই। শোরুমে আসুন বা জিজ্ঞাসা পাঠান — শাখা আপনাকে বর্তমান ডিজাইন দেখাবে।",
    details: "বিস্তারিত",
    enquire: "জিজ্ঞাসা",
    priceOnRequest: "দাম জানতে যোগাযোগ করুন",
    fromPrice: (amount) => `${amount} থেকে শুরু`,
    perMonth: (amount) => `অথবা মাসে ${amount} থেকে`,
  },
  bulletin: {
    eyebrow: "নোটিস বোর্ড",
    title: "ফলাফল, লাইভ তথ্য ও বিজ্ঞপ্তি",
    description:
      "লাইভ সংখ্যাগুলি সরাসরি আমাদের রেকর্ড থেকে আসে এবং প্রতি মিনিটে হালনাগাদ হয়। ড্রয়ের ফলাফল দেখা যায় শুধু ড্রয় প্রকাশের পরেই।",
    kinds: { live: "লাইভ", rule: "নিয়ম", policy: "নীতি", visit: "ভিজিট" },
    latestResult: "সর্বশেষ ড্রয়ের ফলাফল",
    luckyId: "লাকি ID",
    batch: (name) => `ব্যাচ ${name}`,
    drawMonth: (month) => `ড্রয় মাস ${month}`,
    product: "পণ্য",
    emisWaived: "মকুব হওয়া EMI",
    asPerRulebook: "নিয়মপুস্তিকা অনুযায়ী",
    verification: "যাচাই",
    statuses: {
      verified: "যাচাইকৃত",
      pending: "অপেক্ষমাণ",
      unverified: "যাচাই হয়নি",
      failed: "ব্যর্থ",
      revealed: "প্রকাশিত",
      committed: "কমিট করা",
    },
    commitHash: "কমিট হ্যাশ",
    verifyDraw: "এই ড্রয় যাচাই করুন",
    winnerHistory: "বিজয়ীদের ইতিহাস",
    emptyTitle: "এখনও কোনো ড্রয়ের ফলাফল প্রকাশিত হয়নি",
    emptyBody: "ড্রয় প্রকাশ হলেই প্রথম ফলাফল এখানে দেখা যাবে। আমরা কখনও বানানো বিজয়ী দেখাই না।",
    howDrawsWork: "ড্রয় কীভাবে হয়",
    seats: {
      title: (open) => `লাকি প্ল্যানে ${open}টি আসন খালি`,
      body: (taken, capacity, batches) => `${batches}টি প্রকাশিত ব্যাচে ${capacity}টির মধ্যে ${taken}টি আসন ভর্তি।`,
      cta: "ব্যাচে যোগ দিন",
    },
    members: {
      title: (active) => `${active} জন সক্রিয় লাকি প্ল্যান সদস্য`,
      body: (rent, lease) => `এছাড়া আজ ${rent}টি ভাড়া ও ${lease}টি লিজ চুক্তি চলছে।`,
      cta: "লাকি প্ল্যান কীভাবে কাজ করে",
    },
    fairDraw: {
      title: "প্রতিটি মাসিক ড্রয় কীভাবে ন্যায্য থাকে",
      body: "প্রতিটি ড্রয়ের আগে একটি কমিটমেন্ট হ্যাশ প্রকাশ করা হয় এবং পরে তা খোলা হয়, তাই একবার নির্ধারিত হওয়ার পর কেউ ফলাফল বদলাতে পারে না।",
      cta: "ন্যায্য ড্রয়ের পদ্ধতি",
    },
    deposits: {
      title: "ভাড়া ও লিজের ডিপোজিট ফেরতযোগ্য",
      body: "ফেরতের পরিদর্শন ও বকেয়া যাচাইয়ের পর লিখিত নিষ্পত্তি বিবরণীসহ ফেরত দেওয়া হয়।",
      cta: "নীতি পড়ুন",
    },
    visit: {
      title: "বেছে নেওয়ার আগে দেখে নিন",
      body: "ফিনিশ, মাপ আর আরাম নিজে যাচাই করতে আসানসোল শোরুমে আসুন।",
      cta: "শোরুম ও যোগাযোগ",
    },
  },
  howItWorks: {
    eyebrow: "কীভাবে কাজ করে",
    title: "শোরুম থেকে আপনার ঘরে চার ধাপে",
    description: "প্রতিটি প্ল্যানের জন্য একই সহজ পথ। পরের ধাপে কী হবে আর আপনি কত দিয়েছেন, তা সবসময় জানতে পারবেন।",
    steps: [
      {
        title: "আপনার পণ্য বেছে নিন",
        body: "এখানে লাইভ ক্যাটালগ দেখুন, অথবা ফিনিশ, মাপ ও আরাম নিজে দেখতে আসানসোল শোরুমে আসুন।",
      },
      {
        title: "প্ল্যান বেছে আবেদন করুন",
        body: "লাকি প্ল্যান EMI, ভাড়া, লিজ বা সরাসরি কেনা বেছে নিন। জিজ্ঞাসা পাঠান — শাখা কাগজপত্র ও KYC-তে সাহায্য করবে।",
      },
      {
        title: "প্রতি মাসে পেমেন্ট, প্রতিটির রসিদ",
        body: "নগদ, UPI বা ব্যাংক ট্রান্সফারে পেমেন্ট করুন। প্রতিটি পেমেন্টের রসিদ মেলে এবং আপনার কাস্টমার পোর্টালে দেখা যায়।",
      },
      {
        title: "ডেলিভারি ও হস্তান্তর",
        body: "প্ল্যান যোগ্য হলেই ডেলিভারির দিন ঠিক হয়। স্বাক্ষরিত হস্তান্তর রেকর্ড আপনাকে ও আমাদের, দুপক্ষকেই সুরক্ষা দেয়।",
      },
    ],
    start: "জিজ্ঞাসা শুরু করুন",
    guide: "ধাপে ধাপে পূর্ণ নির্দেশিকা",
    rulebook: "নিয়মপুস্তিকা পড়ুন",
  },
  vision: {
    eyebrow: "আমাদের লক্ষ্য",
    statement: "প্রতিটি পরিবারের একটি সুন্দরভাবে সাজানো ঘর প্রাপ্য — সহজ কিস্তিতে পরিশোধ, সৎভাবে লিপিবদ্ধ আর যত্নের সঙ্গে পৌঁছে দেওয়া।",
    about:
      "সুবিধা ফার্নিচার আসানসোলের একটি শোরুম, যা ঘর সাজানোর আরও স্বচ্ছ একটি পথ তৈরি করছে। কিস্তির হাতে-লেখা খাতা হারিয়ে যেতে পারে, বদলানো যেতে পারে বা বিবাদের কারণ হতে পারে। আমরা তার বদলে এমন ব্যবস্থা আনছি যা আপনি দেখতে ও যাচাই করতে পারেন: স্পষ্ট দাম, প্রকাশিত নিয়ম, রসিদসহ পেমেন্ট আর এমন ড্রয় যা যে কেউ যাচাই করতে পারে।",
    strategyEyebrow: "আমাদের কৌশল",
    strategyTitle: "আমাদের ব্যবসার পেছনে চারটি ভাবনা",
    pillars: [
      {
        title: "সাশ্রয়ী মালিকানা",
        body: "একটি ভালো ঘরের দামকে আমরা আপনার বাজেট অনুযায়ী নির্দিষ্ট মাসিক কিস্তিতে ভাগ করি, যা যোগ দেওয়ার আগেই লিখিতভাবে ঠিক হয়।",
      },
      {
        title: "শুরু থেকেই স্বচ্ছতা",
        body: "প্ল্যানের নিয়ম, নীতি ও ড্রয়ের ফলাফল প্রকাশিত হয়। প্রতিটি ড্রয় হওয়ার আগেই একটি হ্যাশ দিয়ে কমিট করা হয়, তাই পরে ফলাফল বদলানো যায় না।",
      },
      {
        title: "শোরুমের ভরসা, ডিজিটাল রেকর্ড",
        body: "প্রতিটি পণ্য নিজে ছুঁয়ে দেখুন, তারপর পেমেন্ট, রসিদ, লাকি ID ও ডেলিভারি আপনার ফোনেই দেখুন।",
      },
      {
        title: "জীবনের প্রতিটি ধাপের জন্য স্কিম",
        body: "কিস্তিতে মালিক হন, ভাড়া নিন, লিজ নিন বা সরাসরি কিনুন। পরিস্থিতি অনুযায়ী প্ল্যান বদলান, ভরসার শোরুম নয়।",
      },
    ],
    commitmentsEyebrow: "আপনার প্রতি আমাদের প্রতিশ্রুতি",
    commitments: [
      "যোগ দেওয়ার আগেই দাম ও মাসিক পরিমাণ দেখানো হয়",
      "জমা হওয়া প্রতিটি টাকার রসিদ",
      "যে কেউ যাচাই করতে পারে এমন ড্রয়ের প্রমাণ প্রকাশিত",
      "গোপনীয়তা রক্ষায় বিজয়ীদের নাম আংশিক লুকানো থাকে",
      "ডেলিভারি, হস্তান্তর ও ফেরতের নথিভুক্তি",
      "অভিযোগ ডেস্ক, যেখানে সমাধান ট্র্যাক করা হয়",
    ],
    visionTrust: "লক্ষ্য ও ভরসা",
    aboutUs: "আমাদের সম্পর্কে",
  },
  calculator: {
    eyebrow: "EMI ক্যালকুলেটর",
    title: "আপনার মাসিক কিস্তির হিসাব করুন",
    description: "স্লাইডার সরিয়ে লাকি প্ল্যানের মাসিক পরিমাণ দেখুন — প্ল্যানের মূল্যকে মাসের সংখ্যা দিয়ে ভাগ করে।",
  },
  faq: {
    eyebrow: "সাধারণ প্রশ্ন",
    title: "চটজলদি উত্তর",
    description: "গ্রাহকদের সবচেয়ে বেশি জিজ্ঞাসিত প্রশ্ন। পুরো তালিকা FAQ পাতায় আছে।",
    viewAll: "সব FAQ দেখুন",
    items: [
      {
        question: "লাকি ID কী?",
        answer:
          "লাকি ID হলো একটি নম্বরযুক্ত স্লট (00–99), যা নির্দিষ্ট একটি ব্যাচে আপনার সদস্যপদের জন্য বরাদ্দ করা হয়। এটি মাসিক লাকি ড্রয়ে ব্যবহৃত হয়। একজন গ্রাহক বিভিন্ন ব্যাচে একাধিক লাকি ID রাখতে পারেন। লাকি ID পাওয়া মানেই জেতার গ্যারান্টি নয়।",
      },
      {
        question: "একজন গ্রাহকের কি একাধিক লাকি ID থাকতে পারে?",
        answer:
          "হ্যাঁ। একজন গ্রাহক একাধিক লাকি ID রাখতে পারেন — একই ব্যাচে (নীতি অনুমতি দিলে) অথবা ভিন্ন ভিন্ন ব্যাচে। প্রতিটি লাকি ID একটি সদস্যপদ স্লটের সঙ্গে যুক্ত।",
      },
      {
        question: "লাকি ড্রয়ে জিতলে কী হবে?",
        answer:
          "কোনো ড্রয় মাসে আপনার লাকি ID বিজয়ী নির্বাচিত হলে, অনুমোদিত চুক্তিতে উল্লিখিত প্ল্যানের নিয়ম অনুযায়ী সেই মাস থেকে পরবর্তী EMI মকুব হতে পারে। শাখার মাধ্যমে আপনি আনুষ্ঠানিক বার্তা পাবেন।",
      },
      {
        question: "জিতলে কি আগে দেওয়া EMI ফেরত পাব?",
        answer:
          "না। ড্রয়ে জিতলে শুধু ভবিষ্যতের বাকি EMI মকুব হয়। যে EMI আগেই দেওয়া হয়েছে এবং যার রসিদ দেওয়া হয়েছে, তা স্বয়ংক্রিয়ভাবে ফেরত হয় না। মকুব শুধু অনুমোদিত বিজয়ী মাস থেকে পরবর্তী অপরিশোধিত EMI-তে প্রযোজ্য।",
      },
      {
        question: "ভাড়া বা লিজ কি লাকি প্ল্যানের অংশ?",
        answer:
          "না। ভাড়া ও লিজ সম্পূর্ণ আলাদা ধরনের চুক্তি। এগুলিতে লাকি ID থাকে না, মাসিক ড্রয়ে অংশ নেয় না, এবং কোনো EMI মকুবের সুবিধাও নেই।",
      },
      {
        question: "ভাড়া বা লিজ চুক্তিতে কি লাকি ID থাকে?",
        answer:
          "না। লাকি ID শুধু অ্যাডভান্স EMI / লাকি প্ল্যান সদস্যপদের জন্য। ভাড়া ও লিজের গ্রাহকরা লাকি ID পান না এবং মাসিক ড্রয়ের যোগ্য নন।",
      },
    ],
  },
  cta: {
    title: "ঘর সাজাতে প্রস্তুত?",
    description: "পণ্য বেছে নিন, প্ল্যান তুলনা করুন বা শাখার সঙ্গে কথা বলুন। জিজ্ঞাসা ফর্ম জমা না দেওয়া পর্যন্ত কিছুই রেকর্ড হয় না।",
    visitShowroom: "শোরুমে আসুন",
  },
};

export const HOME_COPY: Record<PublicLanguage, HomeCopy> = { en, hi, bn };
