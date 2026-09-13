import type { HomeCopy } from "@/components/public/home/home-copy";
import { tone } from "@/components/public/ui/tone";
import { cn } from "@/lib/utils";

/** In-page jump links so a customer reaches the part they care about in one tap. */
export default function HomeQuickLinks({ copy }: { copy: HomeCopy["quickLinks"] }) {
  const sections = [
    { href: "#plans", label: copy.plans },
    { href: "#products", label: copy.products },
    { href: "#bulletin", label: copy.bulletin },
    { href: "#how-it-works", label: copy.howItWorks },
    { href: "#vision", label: copy.vision },
    { href: "#emi-calculator", label: copy.calculator },
    { href: "#faq", label: copy.faq },
  ];

  return (
    <nav
      aria-label={copy.label}
      className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {sections.map((section) => (
        <a
          key={section.href}
          href={section.href}
          className={cn(
            "shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
            tone.surface,
            tone.line,
            tone.text,
            tone.hoverAccentLine,
            tone.hoverAccentText,
            tone.focusRing
          )}
        >
          {section.label}
        </a>
      ))}
    </nav>
  );
}
