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
