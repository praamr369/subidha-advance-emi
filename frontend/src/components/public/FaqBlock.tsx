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
      <div className="grid gap-3">
        {items.map((item) => (
          <details
            key={item.question}
            className="group rounded-[1.5rem] border border-white/75 bg-white/78 px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]"
          >
            <summary className="cursor-pointer list-none text-sm font-semibold text-foreground outline-none">
              {item.question}
            </summary>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {item.answer}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}

