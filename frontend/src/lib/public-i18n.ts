import type { Metadata } from "next";

export const PUBLIC_LOCALES = ["en", "hi", "bn"] as const;
export type PublicLocale = (typeof PUBLIC_LOCALES)[number];

export function asLocale(value: string | undefined | null): PublicLocale {
  if (value === "hi" || value === "bn" || value === "en") return value;
  return "en";
}

export function getPublicLanguageLabel(locale: PublicLocale): string {
  if (locale === "hi") return "हिन्दी";
  if (locale === "bn") return "বাংলা";
  return "English";
}

export function buildPublicMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  const canonical = `https://subidhafurniture.com${path}`;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, type: "website", url: canonical, siteName: "SUBIDHA CORE" },
    twitter: { card: "summary_large_image", title, description },
  };
}

import enJSON from "@/i18n/locales/en.json";
import hiJSON from "@/i18n/locales/hi.json";
import bnJSON from "@/i18n/locales/bn.json";

export function getPublicDictionary(locale: PublicLocale) {
  const content = {
    en: {
      nav: { links: ["Home", "Products", "Contracts", "How It Works", "Winners", "Winner History", "About", "Contact", "Blog"], apply: "Apply", register: "Register", login: "Login", whatsapp: "WhatsApp", navigate: "Navigate", quickActions: "Quick actions", language: "Language" },
      footer: { intro: "Trusted local shopping support for furniture, electronics, and home appliances with simple monthly plans.", quickLinks: "Quick links", contact: "Contact", social: "Social", whatsapp: "WhatsApp the branch" },
      common: {
        home: "Home",
        contact: "Contact",
        products: "Products",
        luckyPlan: "Lucky Plan",
        howItWorks: "How it works",
        winners: "Winners",
        winnerHistory: "Winner history",
        apply: "Apply / Enquire",
        mediaCarousel: {
          featuredLabel: "Featured catalogue items",
          winnerHighlightsLabel: "Winner prize highlights",
          productGalleryLabel: "Product image gallery",
          previousSlide: "Previous slide",
          nextSlide: "Next slide",
        },
      },
      homePage: { title: "Bring Home Furniture, Electronics, and Home Appliances with Easy Monthly Plans", subtitle: "Choose your product, join the Lucky Plan, and enjoy a simple, transparent path to ownership for your family.", ctaProducts: "Browse products", ctaPlan: "Understand Lucky Plan", ctaContact: "Talk to support" },
      seo: { homeTitle: "Furniture Shop in Asansol | Easy Monthly Plan & Lucky Plan", homeDescription: "Subidha Furniture helps families in Asansol bring home furniture, electronics, and home appliances with easy monthly plans and transparent Lucky Plan rules." },
      public: enJSON.public,
    },
    hi: {
      nav: { links: ["होम", "प्रोडक्ट्स", "अनुबंध", "कैसे काम करता है", "विजेताओं", "विजेता इतिहास", "हमारे बारे में", "संपर्क", "ब्लॉग"], apply: "आवेदन करें", register: "रजिस्टर", login: "लॉगिन", whatsapp: "व्हाट्सऐप", navigate: "नेविगेशन", quickActions: "त्वरित विकल्प", language: "भाषा" },
      footer: { intro: "फर्नीचर, इलेक्ट्रॉनिक्स और होम अप्लायंसेज़ के लिए भरोसेमंद स्थानीय सहायता और आसान मासिक योजना।", quickLinks: "क्विक लिंक", contact: "संपर्क", social: "सोशल", whatsapp: "ब्रांच को व्हाट्सऐप करें" },
      common: {
        home: "होम",
        contact: "संपर्क",
        products: "प्रोडक्ट्स",
        luckyPlan: "लकी प्लान",
        howItWorks: "कैसे काम करता है",
        winners: "विजेताओं",
        winnerHistory: "विजेता इतिहास",
        apply: "आवेदन / पूछताछ",
        mediaCarousel: {
          featuredLabel: "फ़ीचर्ड कैटलॉग आइटम",
          winnerHighlightsLabel: "विजेता इनाम की झलकियाँ",
          productGalleryLabel: "प्रोडक्ट इमेज गैलरी",
          previousSlide: "पिछली स्लाइड",
          nextSlide: "अगली स्लाइड",
        },
      },
      homePage: { title: "फर्नीचर, इलेक्ट्रॉनिक्स और होम अप्लायंसेज़ अब आसान मासिक योजना के साथ घर लाएँ", subtitle: "अपना पसंदीदा सामान चुनें, लकी प्लान में शामिल हों और परिवार के लिए आसान व पारदर्शी किस्त योजना पाएं।", ctaProducts: "प्रोडक्ट्स देखें", ctaPlan: "लकी प्लान समझें", ctaContact: "सहायता से बात करें" },
      seo: { homeTitle: "आसनसोल फर्नीचर शॉप | आसान मासिक योजना और लकी प्लान", homeDescription: "Subidha Furniture आसनसोल के परिवारों को फर्नीचर, इलेक्ट्रॉनिक्स और होम अप्लायंसेज़ आसान मासिक योजना और पारदर्शी लकी प्लान के साथ उपलब्ध कराता है।" },
      public: hiJSON.public,
    },
    bn: {
      nav: { links: ["হোম", "পণ্য", "চুক্তি", "কীভাবে কাজ করে", "বিজয়ীরা", "বিজয়ীর ইতিহাস", "আমাদের সম্পর্কে", "যোগাযোগ", "ব্লগ"], apply: "আবেদন করুন", register: "রেজিস্টার", login: "লগইন", whatsapp: "হোয়াটসঅ্যাপ", navigate: "নেভিগেশন", quickActions: "দ্রুত অপশন", language: "ভাষা" },
      footer: { intro: "ফার্নিচার, ইলেকট্রনিক্স ও হোম অ্যাপ্লায়েন্সসের জন্য বিশ্বস্ত স্থানীয় সহায়তা এবং সহজ মাসিক পরিকল্পনা।", quickLinks: "দ্রুত লিংক", contact: "যোগাযোগ", social: "সোশ্যাল", whatsapp: "ব্রাঞ্চে হোয়াটসঅ্যাপ করুন" },
      common: {
        home: "হোম",
        contact: "যোগাযোগ",
        products: "পণ্য",
        luckyPlan: "লাকি প্ল্যান",
        howItWorks: "কীভাবে কাজ করে",
        winners: "বিজয়ীরা",
        winnerHistory: "বিজয়ীর ইতিহাস",
        apply: "আবেদন / জিজ্ঞাসা",
        mediaCarousel: {
          featuredLabel: "ফিচার্ড ক্যাটালগ আইটেম",
          winnerHighlightsLabel: "বিজয়ী পুরস্কার হাইলাইট",
          productGalleryLabel: "পণ্যের ছবির গ্যালারি",
          previousSlide: "আগের স্লাইড",
          nextSlide: "পরের স্লাইড",
        },
      },
      homePage: { title: "সহজ মাসিক পরিকল্পনায় ফার্নিচার, ইলেকট্রনিক্স ও হোম অ্যাপ্লায়েন্সস ঘরে আনুন", subtitle: "পছন্দের পণ্য বেছে নিন, লাকি প্ল্যানে যুক্ত হন, এবং পরিবারের জন্য স্বচ্ছ ও সহজ মালিকানার পথে এগিয়ে যান।", ctaProducts: "পণ্য দেখুন", ctaPlan: "লাকি প্ল্যান জানুন", ctaContact: "সহায়তায় কথা বলুন" },
      seo: { homeTitle: "আসানসোল ফার্নিচার শপ | সহজ মাসিক প্ল্যান ও লাকি প্ল্যান", homeDescription: "Subidha Furniture আসানসোলের পরিবারগুলিকে ফার্নিচার, ইলেকট্রনিক্স ও হোম অ্যাপ্লায়েন্সস সহজ মাসিক প্ল্যান ও স্বচ্ছ লাকি প্ল্যানের মাধ্যমে দেয়।" },
      public: bnJSON.public,
    },
  };
  return content[locale] || content.en;
}

export const PUBLIC_LANGUAGES = ["en", "hi", "bn"] as const;
export type PublicLanguage = (typeof PUBLIC_LANGUAGES)[number];

export const PUBLIC_LANG_COOKIE = "subidha_public_lang";

export const PUBLIC_LANGUAGE_LABELS: Record<PublicLanguage, string> = {
  en: "English",
  hi: "हिन्दी",
  bn: "বাংলা",
};

export type LocalizedText = Record<PublicLanguage, string>;

export const publicContent = {
  nav: {
    trustBadge: {
      en: "Transparent Lucky Plan · Real branch support",
      hi: "पारदर्शी लकी प्लान · भरोसेमंद शाखा सहायता",
      bn: "স্বচ্ছ লাকি প্ল্যান · নির্ভরযোগ্য শাখা সহায়তা",
    },
  },
  homeHero: {
    title: {
      en: "Furniture and appliances with clear monthly plans — and honest Lucky Plan rules",
      hi: "स्पष्ट मासिक योजना के साथ फर्नीचर व उपकरण — और ईमानदार लकी प्लान नियम",
      bn: "স্পষ্ট মাসিক পরিকল্পনায় ফার্নিচার ও অ্যাপ্লায়েন্স — আর স্বচ্ছ লাকি প্ল্যান নিয়ম",
    },
    subtitle: {
      en: "Choose sofas, beds, wardrobes, dining sets and home appliances — then own them on a Lucky Plan EMI, use them on rent or lease, or buy outright. Every payment is receipted and every draw is published for anyone to verify.",
      hi: "सोफ़ा, बेड, वार्डरोब, डाइनिंग सेट और घरेलू उपकरण चुनें — फिर लकी प्लान EMI से अपना बनाएं, किराये या लीज़ पर लें, या सीधे खरीदें। हर भुगतान की रसीद मिलती है और हर ड्रॉ सबके सत्यापन के लिए प्रकाशित होता है।",
      bn: "সোফা, খাট, আলমারি, ডাইনিং সেট ও গৃহস্থালির যন্ত্রপাতি বেছে নিন — তারপর লাকি প্ল্যান EMI-তে নিজের করুন, ভাড়া বা লিজে নিন, অথবা সরাসরি কিনুন। প্রতিটি পেমেন্টের রসিদ পাবেন, আর প্রতিটি ড্রয় সবার যাচাইয়ের জন্য প্রকাশিত হয়।",
    },
  },
  supportStrip: {
    title: {
      en: "Need help choosing a plan?",
      hi: "योजना चुनने में मदद चाहिए?",
      bn: "পরিকল্পনা বেছে নিতে সহায়তা দরকার?",
    },
    description: {
      en: "Our team explains product options, monthly amount comfort, and enrollment documents in simple language.",
      hi: "हमारी टीम उत्पाद विकल्प, मासिक राशि और आवश्यक दस्तावेज़ सरल भाषा में समझाती है।",
      bn: "আমাদের টিম সহজ ভাষায় পণ্যের বিকল্প, মাসিক কিস্তির সামর্থ্য ও প্রয়োজনীয় কাগজপত্র বুঝিয়ে দেয়।",
    },
  },
} as const;

export function getText(content: LocalizedText, language: PublicLanguage): string {
  return content[language] || content.en;
}
