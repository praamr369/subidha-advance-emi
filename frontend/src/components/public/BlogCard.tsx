import Link from "next/link";

import { cn } from "@/lib/utils";
import { getReadingTimeMinutes, type BlogPost } from "@/lib/blog-data";

function formatPublishedAt(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function BlogCard({
  post,
  className,
}: {
  post: BlogPost;
  className?: string;
}) {
  const readingTime = getReadingTimeMinutes(post);

  return (
    <Link
      href={`/blog/${post.slug}`}
      className={cn(
        "public-card group relative overflow-hidden p-6 shadow-[0_24px_64px_-48px_rgba(15,23,42,0.62)] transition hover:-translate-y-1 hover:shadow-[0_34px_92px_-62px_rgba(15,23,42,0.62)]",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-slate-200/90 to-transparent" />
      <div className="pointer-events-none absolute -right-12 top-10 h-28 w-28 rounded-full bg-slate-200/35 blur-3xl transition group-hover:opacity-80" />
      <div className="pointer-events-none absolute -left-10 bottom-0 h-28 w-28 rounded-full bg-amber-200/20 blur-3xl transition group-hover:opacity-80" />

      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {formatPublishedAt(post.publishedAt)} · {readingTime} min read
      </div>
      <div className="mt-3 text-xl font-semibold tracking-tight text-foreground">
        {post.title}
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {post.description}
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        {post.tags.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center rounded-full border border-white/80 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]"
          >
            {tag}
          </span>
        ))}
      </div>
    </Link>
  );
}
