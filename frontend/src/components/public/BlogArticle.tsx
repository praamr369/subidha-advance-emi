import { cn } from "@/lib/utils";
import type { BlogBlock } from "@/lib/blog-data";

export default function BlogArticle({
  blocks,
  className,
}: {
  blocks: ReadonlyArray<BlogBlock>;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "rounded-[2rem] border border-white/75 bg-white/82 p-6 shadow-[0_24px_70px_-50px_rgba(15,23,42,0.62)] sm:p-8",
        className
      )}
    >
      <div className="space-y-5">
        {blocks.map((block, index) => {
          switch (block.type) {
            case "h2":
              return (
                <h2
                  key={`${block.type}-${index}`}
                  className="pt-2 text-2xl font-semibold tracking-tight text-foreground"
                >
                  {block.text}
                </h2>
              );
            case "h3":
              return (
                <h3
                  key={`${block.type}-${index}`}
                  className="pt-1 text-lg font-semibold text-foreground"
                >
                  {block.text}
                </h3>
              );
            case "ul":
              return (
                <ul
                  key={`${block.type}-${index}`}
                  className="grid gap-2 text-sm leading-6 text-muted-foreground"
                >
                  {block.items.map((item) => (
                    <li
                      key={item}
                      className="rounded-xl border border-white/75 bg-white/70 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              );
            case "callout":
              return (
                <div
                  key={`${block.type}-${index}`}
                  className="rounded-[1.8rem] border border-amber-200/70 bg-amber-50/70 px-5 py-4 text-sm leading-6 text-foreground shadow-[0_18px_46px_-38px_rgba(15,23,42,0.28)]"
                >
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {block.title}
                  </div>
                  <p className="mt-2">{block.text}</p>
                </div>
              );
            case "p":
            default:
              return (
                <p
                  key={`${block.type}-${index}`}
                  className="text-sm leading-7 text-muted-foreground sm:text-base"
                >
                  {block.text}
                </p>
              );
          }
        })}
      </div>
    </article>
  );
}
