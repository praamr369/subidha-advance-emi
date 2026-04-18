export type BlogBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "callout"; title: string; text: string };

export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  publishedAt: string; // YYYY-MM-DD
  blocks: BlogBlock[];
  tags: string[];
};

function countWords(value: string): number {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean).length;
}

export function getReadingTimeMinutes(post: Pick<BlogPost, "blocks">): number {
  const words = post.blocks.reduce((total, block) => {
    if (block.type === "ul") {
      return total + block.items.reduce((acc, item) => acc + countWords(item), 0);
    }
    if (block.type === "callout") {
      return total + countWords(block.title) + countWords(block.text);
    }
    return total + countWords(block.text);
  }, 0);

  const minutes = Math.max(1, Math.ceil(words / 200));
  return minutes;
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "what-is-lucky-plan-emi",
    title: "What Is the Lucky Plan EMI System at Subidha Furniture?",
    description:
      "A clear, plain-language guide to how Lucky Plan works: batches, monthly EMI, the winner benefit, and what happens after you join.",
    publishedAt: "2026-04-17",
    tags: ["Lucky Plan", "EMI", "How it works"],
    blocks: [
      {
        type: "p",
        text: "Lucky Plan is Subidha Furniture’s structured monthly purchase plan for families who want furniture with a predictable payment rhythm. You choose the furniture you need, join an active batch, receive a lucky number, and pay EMI month by month. Every month, one winner is selected from the batch using a transparent process.",
      },
      { type: "h2", text: "The simple idea" },
      {
        type: "ul",
        items: [
          "You pick furniture and confirm the plan details with the branch.",
          "You join a batch and receive a Lucky ID (00–99).",
          "You pay EMI each month for the plan tenure (typically 15 months).",
          "One winner is selected per batch per month.",
          "If you win, your remaining future EMI is waived according to the rules.",
        ],
      },
      {
        type: "callout",
        title: "Important rule: waiver is for future EMI only",
        text: "Winning does not refund already-paid EMI. Paid EMI remains part of the recorded payment history. The benefit applies only to future EMI obligations that are still pending at the time of winning.",
      },
      { type: "h2", text: "Why a batch model?" },
      {
        type: "p",
        text: "A batch helps keep the plan transparent and manageable. It defines the participant set, the lucky number range, and the monthly draw cycle. This makes the rules consistent and helps customers understand exactly where they stand.",
      },
      { type: "h2", text: "What you can do on the public website" },
      {
        type: "ul",
        items: [
          "Browse published products (no fake catalog).",
          "See the latest winner and winner history sourced from revealed draw records.",
          "Submit an enquiry so the branch can follow up with the right product context and plan guidance.",
        ],
      },
    ],
  },
  {
    slug: "how-the-monthly-winner-process-works",
    title: "How the Monthly Winner Process Works",
    description:
      "Understand Lucky IDs, monthly draws, and why Subidha Furniture uses a commit–reveal method for transparency.",
    publishedAt: "2026-04-17",
    tags: ["Winners", "Transparency", "Lucky IDs"],
    blocks: [
      {
        type: "p",
        text: "The monthly winner process is designed to be exciting, but also explainable. Lucky Plan uses batches, Lucky IDs (00–99), and a monthly draw rhythm. The goal is that customers can understand the rules without needing technical knowledge.",
      },
      { type: "h2", text: "Step 1: Batches and Lucky IDs" },
      {
        type: "p",
        text: "When you join a batch, you receive a Lucky ID between 00 and 99 (depending on availability). This Lucky ID is used for the monthly draw for that batch.",
      },
      { type: "h2", text: "Step 2: One winner per batch per month" },
      {
        type: "p",
        text: "Each month, one winner is selected from the batch. The winner’s remaining future EMI is waived according to the plan rules.",
      },
      { type: "h2", text: "Step 3: Why commit–reveal improves trust" },
      {
        type: "p",
        text: "To support fairness, the draw process uses a commit–reveal approach. In simple terms: a commitment is published first (a cryptographic hash), and the reveal is published later. This is designed so the outcome can be verified against what was committed earlier.",
      },
      {
        type: "callout",
        title: "Keep it practical",
        text: "You don’t need to understand cryptography to benefit from it. The important point is that the process is built to be verifiable, and the public site shows published draw records when they are revealed.",
      },
      {
        type: "callout",
        title: "Waiver rule stays the same",
        text: "Even when the winner is selected, already-paid EMI is never refunded. The waiver applies only to remaining future EMI.",
      },
    ],
  },
  {
    slug: "why-families-choose-furniture-on-monthly-plan",
    title: "Why Many Families Prefer Furniture on a Monthly Plan",
    description:
      "Affordability, predictable commitments, and a smoother way to bring essentials home without one-time financial pressure.",
    publishedAt: "2026-04-17",
    tags: ["Affordability", "Planning", "EMI"],
    blocks: [
      {
        type: "p",
        text: "Many households prefer predictable monthly commitments over a single large payment. A structured plan makes budgeting easier and helps families bring essential furniture home sooner.",
      },
      { type: "h2", text: "Predictability is the real feature" },
      {
        type: "p",
        text: "A clear monthly EMI and defined tenure reduces uncertainty. It helps you plan for school fees, rent, and other monthly needs without guessing what the furniture purchase will do to your cash flow.",
      },
      { type: "h2", text: "Local support matters" },
      {
        type: "p",
        text: "When the plan is operated by a real local branch, you also get practical guidance: selecting the right product, understanding batch availability, and knowing exactly what steps come next.",
      },
      { type: "h2", text: "The Lucky Plan difference" },
      {
        type: "p",
        text: "Lucky Plan adds an additional benefit: one winner per month per batch receives a waiver of future EMI obligations according to the rules. This is positioned as a trust-building, transparent mechanism—not a replacement for the core monthly plan discipline.",
      },
    ],
  },
  {
    slug: "understanding-future-emi-waiver",
    title: "Understanding the Future EMI Waiver Benefit",
    description:
      "A precise explanation of what gets waived when you win, what does not get refunded, and why this protects fairness and records.",
    publishedAt: "2026-04-17",
    tags: ["Waiver", "Winners", "Rules"],
    blocks: [
      {
        type: "p",
        text: "The waiver benefit is the most important rule to understand correctly. It is designed to be clear, consistent, and auditable.",
      },
      { type: "h2", text: "What gets waived" },
      {
        type: "ul",
        items: [
          "Only future EMI that is still pending at the time of winning.",
          "Waiver applies according to the plan rules and eligibility in the workflow.",
        ],
      },
      { type: "h2", text: "What does not happen" },
      {
        type: "ul",
        items: [
          "Already-paid EMI is not refunded.",
          "Past payment history is not erased or silently edited.",
          "Winning does not retroactively change settled transactions.",
        ],
      },
      {
        type: "callout",
        title: "Why this matters",
        text: "Keeping payment history intact protects both the customer and the business. It keeps the system auditable and avoids confusion during reconciliation or support.",
      },
      {
        type: "p",
        text: "If you ever have questions about your own subscription state, the branch can guide you using the recorded EMI schedule and payment entries.",
      },
    ],
  },
  {
    slug: "transparent-draws-and-customer-trust",
    title: "Transparent Draws, Clear Rules, Stronger Customer Trust",
    description:
      "How transparency reduces confusion, builds credibility, and creates a fair customer experience for everyone in the batch.",
    publishedAt: "2026-04-17",
    tags: ["Trust", "Transparency", "Fairness"],
    blocks: [
      {
        type: "p",
        text: "Trust is built when rules are simple, outcomes are published clearly, and records don’t change silently. That is the goal behind the Lucky Plan public transparency approach.",
      },
      { type: "h2", text: "No fake stats, no fake winners" },
      {
        type: "p",
        text: "A public site should not invent outcomes. The Lucky Plan public pages are designed to show real published draw records or show a clean empty state when nothing is published yet.",
      },
      { type: "h2", text: "Commit–reveal in plain language" },
      {
        type: "p",
        text: "Commit–reveal is a method to make the selection verifiable: a commitment is published first (hash), and the reveal is published later. That helps prevent after-the-fact changes and supports transparency.",
      },
      {
        type: "callout",
        title: "Transparency also protects privacy",
        text: "Public pages show safe winner display labels and draw metadata, but do not expose private accounting details, internal ledger records, or sensitive customer information.",
      },
    ],
  },
  {
    slug: "how-to-join-a-lucky-plan-batch",
    title: "How to Join a Lucky Plan Batch at Subidha Furniture",
    description:
      "A step-by-step guide: selecting a product, batch joining, Lucky ID allocation, and when EMI begins.",
    publishedAt: "2026-04-17",
    tags: ["Joining", "Batches", "Process"],
    blocks: [
      {
        type: "p",
        text: "Joining Lucky Plan is straightforward when you know the sequence. The branch workflow is built to keep the product, batch, and payment schedule aligned.",
      },
      { type: "h2", text: "1) Choose your furniture" },
      {
        type: "p",
        text: "Start by browsing products or visiting the branch. Shortlist the furniture that fits your room size, usage, and budget comfort.",
      },
      { type: "h2", text: "2) Join an active batch" },
      {
        type: "p",
        text: "The branch will guide you to an active batch where Lucky IDs are available and the plan schedule fits your onboarding timeline.",
      },
      { type: "h2", text: "3) Receive your Lucky ID (00–99)" },
      {
        type: "p",
        text: "Lucky IDs are allocated within a batch. Your Lucky ID is used for the monthly draw for that batch.",
      },
      { type: "h2", text: "4) EMI begins and stays predictable" },
      {
        type: "p",
        text: "Your EMI schedule is set for the tenure (typically 15 months). Payments are recorded as transactions so your history stays auditable.",
      },
      {
        type: "callout",
        title: "If you win",
        text: "Winning waives remaining future EMI only. Past paid EMI is not refunded.",
      },
    ],
  },
  {
    slug: "choosing-the-right-furniture-with-a-payment-plan",
    title: "Choosing the Right Furniture with a Structured Payment Plan",
    description:
      "Practical guidance to match comfort, durability, and monthly affordability before you join a plan.",
    publishedAt: "2026-04-17",
    tags: ["Products", "Planning", "Advice"],
    blocks: [
      {
        type: "p",
        text: "A monthly plan works best when the product choice matches your real needs and your monthly comfort. A little planning upfront makes the entire tenure smoother.",
      },
      { type: "h2", text: "Start with the room and use-case" },
      {
        type: "ul",
        items: [
          "Bedroom: prioritize comfort, durability, and storage where needed.",
          "Living room: consider seating capacity and fabric/finish maintenance.",
          "Dining: plan for family size and everyday cleaning needs.",
        ],
      },
      { type: "h2", text: "Keep EMI comfortable" },
      {
        type: "p",
        text: "A good plan is one you can keep without stress. Consider your monthly obligations and choose an EMI range that stays comfortable through the year.",
      },
      { type: "h2", text: "Ask about batch availability early" },
      {
        type: "p",
        text: "Batch availability can influence when you can join and which Lucky IDs are available. Submitting an enquiry with your product preference helps the branch guide you faster.",
      },
    ],
  },
  {
    slug: "subidha-furniture-asansol-our-approach",
    title: "Subidha Furniture Asansol: Our Approach to Affordable Furniture Access",
    description:
      "Why the branch focuses on clarity, predictable monthly commitments, and transparent winner publication for Lucky Plan customers.",
    publishedAt: "2026-04-17",
    tags: ["Subidha Furniture", "Asansol", "Values"],
    blocks: [
      {
        type: "p",
        text: "Subidha Furniture in Asansol, West Bengal, runs Lucky Plan as a real operational system—designed for daily retail use, payment traceability, and customer clarity.",
      },
      { type: "h2", text: "Our mission" },
      {
        type: "p",
        text: "Help families bring home the furniture they need with a manageable monthly structure, clear rules, and practical branch support.",
      },
      { type: "h2", text: "What we value" },
      {
        type: "ul",
        items: [
          "Transparency: published draw outcomes and clear plan rules.",
          "Affordability: predictable monthly commitments.",
          "Fairness: verifiable winner process design.",
          "Customer-first support: practical guidance from enquiry to enrollment.",
          "Local reliability: real branch follow-up and accountability.",
        ],
      },
      {
        type: "callout",
        title: "No exaggerated claims",
        text: "We avoid fake testimonials, fake statistics, and marketing hype. The public website is designed to show real published signals and guide customers into a real enquiry workflow.",
      },
    ],
  },
];

export function getAllBlogPosts(): BlogPost[] {
  return [...BLOG_POSTS].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
}

export function getBlogPostBySlug(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((post) => post.slug === slug);
}

export function getRelatedBlogPosts(slug: string, limit = 3): BlogPost[] {
  const current = getBlogPostBySlug(slug);
  if (!current) return getAllBlogPosts().slice(0, limit);

  const scored = BLOG_POSTS.filter((post) => post.slug !== slug).map((post) => {
    const overlap = post.tags.filter((tag) => current.tags.includes(tag)).length;
    return { post, overlap };
  });

  scored.sort((a, b) => b.overlap - a.overlap || (a.post.publishedAt < b.post.publishedAt ? 1 : -1));
  return scored.slice(0, limit).map((entry) => entry.post);
}

