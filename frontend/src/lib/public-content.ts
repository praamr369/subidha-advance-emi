import type { FaqItem } from "@/components/public/FaqBlock";
import type { TimelineStep } from "@/components/public/ProcessTimeline";

export const LUCKY_PLAN_FAQ: FaqItem[] = [
  {
    question: "How do batches work?",
    answer:
      "A batch is a group of subscriptions managed together for the Lucky Plan draw cycle. It defines the participant set and keeps the monthly winner process consistent and explainable.",
  },
  {
    question: "How are Lucky IDs assigned?",
    answer:
      "Lucky IDs are allocated within a batch from 00 to 99 based on availability at the time of enrollment.",
  },
  {
    question: "Is there a winner every month?",
    answer:
      "Each batch is designed for one winner per month when the draw is published. If a draw is not published for a given month, the public site will reflect that (it will not invent records).",
  },
  {
    question: "What happens after winning?",
    answer:
      "When a winner is confirmed, remaining future EMI obligations are waived according to the plan rules and eligibility. Your already-paid EMI stays recorded as part of your payment history.",
  },
  {
    question: "Is previously paid EMI refunded if I win?",
    answer:
      "No. Winning waives future EMI only. EMI already paid remains valid and is not refunded.",
  },
] as const;

export const HOW_IT_WORKS_STEPS: TimelineStep[] = [
  {
    title: "Choose your furniture",
    description:
      "Browse published products or visit the branch. Shortlist what fits your room, usage, and monthly comfort.",
  },
  {
    title: "Join an active batch",
    description:
      "The branch helps you join an active batch where Lucky IDs are available and the onboarding timeline fits.",
  },
  {
    title: "Receive your Lucky ID (00–99)",
    description:
      "You are assigned a Lucky ID in the batch. This Lucky ID is used for the monthly draw for that batch.",
  },
  {
    title: "Pay EMI month by month",
    description:
      "EMI payments are recorded as transactions, keeping your history auditable and easy to explain.",
  },
  {
    title: "Monthly winner is selected transparently",
    description:
      "A winner is selected through a process designed for verifiable transparency (commit–reveal) and published when revealed.",
  },
  {
    title: "Winner gets remaining future EMI waived",
    description:
      "The benefit applies to future EMI obligations only. Past paid EMI remains part of the completed payment history.",
  },
] as const;

