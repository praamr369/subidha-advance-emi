"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

export type FaqItem = {
  question: string;
  answer: string;
};

type FaqBlockProps = {
  items: ReadonlyArray<FaqItem>;
  className?: string;
};

export default function FaqBlock({ items, className }: FaqBlockProps) {
  return (
    <section
      className={cn(
        "rounded-[2rem] border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] p-6 shadow-[0_24px_70px_-50px_rgba(15,23,42,0.62)]",
        className
      )}
    >
      <Accordion type="multiple" className="divide-y divide-white/75 rounded-[1.5rem] border border-white/75 bg-white/78 px-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
        {items.map((item, index) => (
          <AccordionItem key={`${index}-${item.question}`} value={`faq-${index}`} className="border-white/55 px-3">
            <AccordionTrigger className="py-4 text-sm font-semibold text-foreground hover:no-underline">
              {item.question}
            </AccordionTrigger>
            <AccordionContent>
              <p className="pb-4 text-sm leading-6 text-muted-foreground">{item.answer}</p>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}

